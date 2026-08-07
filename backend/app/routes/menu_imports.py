from datetime import datetime, timezone
import logging
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.database import get_db, SessionLocal
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOption, MenuOptionGroup
from app.models.menu_import import MenuImportDraftItem, MenuImportJob
from app.models.staff_user import StaffUser
from app.schemas.menu_import import ConfirmMenuImport, MenuImportResponse
from app.services.menu_extraction import extract_menu
from app.utils.auth import RoleChecker, get_current_staff_user

router = APIRouter(prefix="/admin/menu-imports")
logger = logging.getLogger(__name__)
admin_access = Depends(RoleChecker(["owner", "admin"]))
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGES = 5
MAX_FILE_SIZE = 10 * 1024 * 1024


def normalize_item_name(value: str) -> str:
    return " ".join(value.lower().strip().split())


def build_legacy_variant_group(item_name: str, variants: list[dict]) -> dict:
    return {
        "name": f"{item_name.strip()} size",
        "type": "variant",
        "required": True,
        "minimum_selections": 1,
        "maximum_selections": 1,
        "options": [
            {
                "name": v["name"],
                "final_price": float(v["price"]),
                "price_delta": None,
                "kitchen_display_name": None,
                "confidence": 1.0,
                "warnings": [],
            }
            for v in variants
        ],
        "confidence": 1.0,
        "warnings": [],
    }


def serialize_job(job: MenuImportJob, db: Session) -> dict:
    existing = {
        normalize_item_name(name)
        for (name,) in db.query(MenuItem.name_en).filter(
            MenuItem.restaurant_id == job.restaurant_id
        ).all()
    }
    result = job.original_result or {}
    items = []
    for row in job.draft_items:
        option_groups = row.option_groups or []
        if not option_groups and row.variants:
            option_groups = [build_legacy_variant_group(row.item_name, row.variants)]
        items.append({
            "id": row.id,
            "category_name": row.category_name,
            "item_name": row.item_name,
            "description": row.description,
            "price": float(row.price) if row.price is not None else None,
            "food_type": row.food_type,
            "option_groups": option_groups,
            "variants": row.variants,
            "warnings": row.warnings,
            "item_confidence": float(row.item_confidence),
            "category_confidence": float(row.category_confidence),
            "selected": row.selected,
            "duplicate": normalize_item_name(row.item_name) in existing,
        })
    return {
        "id": job.id,
        "status": job.status,
        "general_warnings": result.get("general_warnings", []),
        "items": items,
    }


# ---------------------------------------------------------------------------
# Sync DB helpers for create_menu_import.
# Each creates/closes its own SessionLocal() inside the worker thread.
# No live ORM objects are returned to the async layer.
# ---------------------------------------------------------------------------

def _create_import_job_sync(restaurant_id: int, created_by: int) -> UUID:
    """Phase 1: create and commit the import job row, return only job_id.

    The session is fully closed before returning so no DB connection is held
    during the subsequent extract_menu() LLM round-trip.
    """
    db = SessionLocal()
    try:
        job = MenuImportJob(
            restaurant_id=restaurant_id,
            created_by=created_by,
            status="processing",
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job.id
    finally:
        db.close()


def _persist_extraction_and_serialize_sync(job_id: UUID, extraction) -> dict:
    """Phase 3: persist extraction results and serialize to a plain dict.

    Opens a fresh session; reloads the job by job_id. The ORM job object
    from phase 1 is never used here — only the scalar job_id crosses the
    extraction boundary.
    """
    db = SessionLocal()
    try:
        job = db.query(MenuImportJob).filter(MenuImportJob.id == job_id).first()
        if job is None:
            raise RuntimeError(f"MenuImportJob {job_id} not found after extraction")

        job.original_result = extraction.model_dump(mode="json")
        for category in extraction.categories:
            for item in category.items:
                option_groups_data = [og.model_dump(mode="json") for og in item.option_groups]
                if not option_groups_data and item.variants:
                    option_groups_data = [
                        build_legacy_variant_group(item.name, [v.model_dump() for v in item.variants])
                    ]

                # Determine base price
                calculated_price = item.price
                if calculated_price is None and option_groups_data:
                    variant_groups = [og for og in option_groups_data if og.get("type") == "variant"]
                    if variant_groups:
                        final_prices = [
                            opt["final_price"]
                            for og in variant_groups
                            for opt in og.get("options", [])
                            if opt.get("final_price") is not None
                        ]
                        if final_prices:
                            calculated_price = min(final_prices)

                db.add(MenuImportDraftItem(
                    import_job_id=job.id,
                    category_name=item.category if item.category is not None else category.name,
                    item_name=item.name.strip(),
                    description=item.description,
                    price=Decimal(str(calculated_price)) if calculated_price is not None else None,
                    food_type=item.food_type.value,
                    option_groups=option_groups_data,
                    variants=[v.model_dump() for v in item.variants],
                    warnings=item.warnings,
                    item_confidence=Decimal(str(item.item_confidence)),
                    category_confidence=Decimal(str(item.category_confidence)),
                ))
        job.status = "review_required"
        db.commit()
        db.refresh(job)
        # serialize_job returns a plain dict; no ORM objects leave this function.
        return serialize_job(job, db)
    finally:
        db.close()


def _mark_import_failed_sync(job_id: UUID, exc: Exception) -> None:
    """Failure path: open a fresh session, reload by job_id, persist failure state.

    Preserves the real error class name so log context is not lost.
    """
    db = SessionLocal()
    try:
        failed_job = db.query(MenuImportJob).filter(MenuImportJob.id == job_id).first()
        if failed_job:
            failed_job.status = "failed"
            failed_job.error_message = "Menu scan failed. Please try again."
            db.commit()
    finally:
        db.close()


@router.post("", response_model=MenuImportResponse, dependencies=[admin_access])
async def create_menu_import(
    images: Annotated[list[UploadFile], File()],
    current_user: StaffUser = Depends(get_current_staff_user),
):
    """
    Import a menu from uploaded images using LLM extraction.

    Session lifecycle:
      1. Threadpool: create job → commit → get job_id → close session.
      2. Async: await extract_menu() — no DB connection held during LLM call.
      3. Threadpool: reload job by job_id → persist extraction → serialize → close session.
      Failure: Threadpool: reload job by job_id → mark failed → close session.
    """
    if not images:
        raise HTTPException(400, "Upload at least one menu image")
    if len(images) > MAX_IMAGES:
        raise HTTPException(400, f"Maximum {MAX_IMAGES} images allowed")

    prepared = []
    for image in images:
        if image.content_type not in ALLOWED_TYPES:
            raise HTTPException(400, f"{image.filename}: unsupported file type")
        content = await image.read(MAX_FILE_SIZE + 1)
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(400, f"{image.filename}: file is too large")
        prepared.append({"mime_type": image.content_type, "content": content})

    # Phase 1: create job record; session is closed before the LLM call.
    job_id: UUID = await run_in_threadpool(
        _create_import_job_sync,
        current_user.restaurant_id,
        current_user.id,
    )

    try:
        # Phase 2: async LLM extraction — no DB session held during this await.
        extraction = await extract_menu(prepared)

        # Phase 3: persist results using a fresh session.
        result: dict = await run_in_threadpool(
            _persist_extraction_and_serialize_sync,
            job_id,
            extraction,
        )
        return result
    except Exception as exc:
        # Failure path: fresh session, reload by job_id, persist failure state.
        await run_in_threadpool(_mark_import_failed_sync, job_id, exc)
        logger.exception("event=menu_scan_failure job_id=%s error_type=%s", job_id, exc.__class__.__name__)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Menu scan failed. Please try again.") from exc


@router.post(
    "/{import_id}/confirm",
    dependencies=[admin_access],
)
def confirm_menu_import(
    import_id: UUID,
    request: ConfirmMenuImport,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    job = db.query(MenuImportJob).filter(
        MenuImportJob.id == import_id,
        MenuImportJob.restaurant_id == current_user.restaurant_id,
    ).with_for_update().first()
    if not job:
        raise HTTPException(404, "Menu import not found")
    if job.status != "review_required":
        raise HTTPException(409, f"Import cannot be confirmed from status {job.status}")

    draft_by_id = {row.id: row for row in job.draft_items}
    if any(item.draft_item_id not in draft_by_id for item in request.items):
        raise HTTPException(400, "The submitted draft contains an unknown item")

    job.status = "importing"
    imported = 0
    skipped = 0
    category_cache = {
        category.name_en.casefold(): category
        for category in db.query(MenuCategory).filter(
            MenuCategory.restaurant_id == current_user.restaurant_id
        ).all()
    }
    existing_items = db.query(MenuItem).filter(
        MenuItem.restaurant_id == current_user.restaurant_id
    ).all()
    existing_by_name = {normalize_item_name(item.name_en): item for item in existing_items}

    try:
        for submitted in request.items:
            draft = draft_by_id[submitted.draft_item_id]
            draft.selected = submitted.selected
            draft.category_name = submitted.category_name
            draft.item_name = submitted.item_name.strip()
            draft.description = submitted.description
            draft.price = Decimal(str(submitted.price)) if submitted.price is not None else None
            draft.food_type = submitted.food_type.value
            draft.option_groups = [og.model_dump(mode="json") for og in submitted.option_groups]
            draft.variants = [variant.model_dump() for variant in submitted.variants]

            if not submitted.selected:
                continue

            if not submitted.category_name or not submitted.category_name.strip():
                raise HTTPException(400, f"{submitted.item_name}: category is required")
            if not submitted.item_name or not submitted.item_name.strip():
                raise HTTPException(400, "Item name cannot be empty")

            # Fallback legacy variants if option_groups is empty
            option_groups = submitted.option_groups
            if not option_groups and submitted.variants:
                option_groups = [
                    build_legacy_variant_group(submitted.item_name, [v.model_dump() for v in submitted.variants])
                ]

            # Price validation
            item_price_val = submitted.price
            if item_price_val is None:
                # If item has variant option group with final_price, set base price to min final_price
                variant_groups = [og for og in option_groups if (isinstance(og, dict) and og.get("type") == "variant") or (hasattr(og, "type") and og.type == "variant")]
                final_prices = []
                for og in variant_groups:
                    opts = og.get("options", []) if isinstance(og, dict) else og.options
                    for opt in opts:
                        fp = opt.get("final_price") if isinstance(opt, dict) else opt.final_price
                        if fp is not None:
                            final_prices.append(fp)
                if final_prices:
                    item_price_val = min(final_prices)
                else:
                    raise HTTPException(400, f"{submitted.item_name}: price is required")

            normalized = normalize_item_name(submitted.item_name)
            duplicate = existing_by_name.get(normalized)
            if duplicate and submitted.duplicate_action == "skip":
                skipped += 1
                continue
            if duplicate and submitted.duplicate_action == "replace":
                db.delete(duplicate)
                db.flush()

            category_key = submitted.category_name.strip().casefold()
            category = category_cache.get(category_key)
            if not category:
                category = MenuCategory(
                    restaurant_id=current_user.restaurant_id,
                    name_en=submitted.category_name.strip(),
                    display_order=len(category_cache),
                    is_active=True,
                )
                db.add(category)
                db.flush()
                category_cache[category_key] = category

            menu_item = MenuItem(
                restaurant_id=current_user.restaurant_id,
                category_id=category.id,
                name_en=submitted.item_name.strip(),
                description_en=submitted.description,
                price=Decimal(str(item_price_val)),
                food_type=submitted.food_type.value,
                is_available=True,
                display_order=0,
            )
            db.add(menu_item)
            db.flush()

            # Create Option Groups & Options
            for group_order, og_item in enumerate(option_groups):
                group_dict = og_item if isinstance(og_item, dict) else og_item.model_dump(mode="json")
                group_name = group_dict.get("name", "").strip()
                group_type = group_dict.get("type", "addon")
                required_val = bool(group_dict.get("required", True))
                min_sel = int(group_dict.get("minimum_selections", 1 if required_val else 0))
                max_sel = int(group_dict.get("maximum_selections", 1))

                option_group = MenuOptionGroup(
                    restaurant_id=current_user.restaurant_id,
                    name=group_name,
                    type=group_type,
                    required=required_val,
                    minimum_selections=min_sel,
                    maximum_selections=max_sel,
                    display_order=group_order,
                    active=True,
                )
                db.add(option_group)
                db.flush()

                db.add(MenuItemOptionGroup(
                    restaurant_id=current_user.restaurant_id,
                    menu_item_id=menu_item.id,
                    option_group_id=option_group.id,
                    display_order=group_order,
                    active=True,
                ))

                opts_list = group_dict.get("options", [])
                for opt_order, opt_item in enumerate(opts_list):
                    opt_dict = opt_item if isinstance(opt_item, dict) else opt_item.model_dump(mode="json")
                    opt_name = opt_dict.get("name", "").strip()
                    kitchen_label = opt_dict.get("kitchen_display_name")
                    if kitchen_label:
                        kitchen_label = kitchen_label.strip() or None

                    if group_type == "variant":
                        price_delta_val = Decimal(str(opt_dict["final_price"]))
                    else:
                        price_delta_val = Decimal(str(opt_dict.get("price_delta", 0)))

                    db.add(MenuOption(
                        restaurant_id=current_user.restaurant_id,
                        group_id=option_group.id,
                        name=opt_name,
                        kitchen_display_name=kitchen_label,
                        price_delta=price_delta_val,
                        available=True,
                        display_order=opt_order,
                    ))

            existing_by_name[normalized] = menu_item
            imported += 1

        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("event=menu_import_confirmation_failed job_id=%s error=%s", import_id, exc)
        raise HTTPException(500, "Import failed; no menu items were changed") from exc

    return {"status": "completed", "imported": imported, "skipped": skipped}
