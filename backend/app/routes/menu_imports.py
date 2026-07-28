from datetime import datetime, timezone
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOption, MenuOptionGroup
from app.models.menu_import import MenuImportDraftItem, MenuImportJob
from app.models.staff_user import StaffUser
from app.schemas.menu_import import ConfirmMenuImport, MenuImportResponse
from app.services.menu_extraction import extract_menu
from app.utils.auth import RoleChecker, get_current_staff_user

router = APIRouter(prefix="/admin/menu-imports")
admin_access = Depends(RoleChecker(["owner", "admin"]))
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGES = 5
MAX_FILE_SIZE = 10 * 1024 * 1024


def normalize_item_name(value: str) -> str:
    return " ".join(value.lower().strip().split())


def serialize_job(job: MenuImportJob, db: Session) -> dict:
    existing = {
        normalize_item_name(name)
        for (name,) in db.query(MenuItem.name_en).filter(
            MenuItem.restaurant_id == job.restaurant_id
        ).all()
    }
    result = job.original_result or {}
    return {
        "id": job.id,
        "status": job.status,
        "general_warnings": result.get("general_warnings", []),
        "items": [{
            "id": row.id,
            "category_name": row.category_name,
            "item_name": row.item_name,
            "description": row.description,
            "price": float(row.price) if row.price is not None else None,
            "food_type": row.food_type,
            "variants": row.variants,
            "warnings": row.warnings,
            "item_confidence": float(row.item_confidence),
            "category_confidence": float(row.category_confidence),
            "selected": row.selected,
            "duplicate": normalize_item_name(row.item_name) in existing,
        } for row in job.draft_items],
    }


@router.post("", response_model=MenuImportResponse, dependencies=[admin_access])
async def create_menu_import(
    images: Annotated[list[UploadFile], File()],
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
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

    job = MenuImportJob(
        restaurant_id=current_user.restaurant_id,
        created_by=current_user.id,
        status="processing",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        extraction = await extract_menu(prepared)
        job.original_result = extraction.model_dump(mode="json")
        for category in extraction.categories:
            for item in category.items:
                db.add(MenuImportDraftItem(
                    import_job_id=job.id,
                    category_name=item.category if item.category is not None else category.name,
                    item_name=item.name.strip(),
                    description=item.description,
                    price=Decimal(str(
                        min(variant.price for variant in item.variants)
                        if item.variants else item.price
                    )) if (item.variants or item.price is not None) else None,
                    food_type=item.food_type.value,
                    variants=[variant.model_dump() for variant in item.variants],
                    warnings=item.warnings,
                    item_confidence=Decimal(str(item.item_confidence)),
                    category_confidence=Decimal(str(item.category_confidence)),
                ))
        job.status = "review_required"
        db.commit()
        db.refresh(job)
        return serialize_job(job, db)
    except Exception as exc:
        db.rollback()
        failed_job = db.query(MenuImportJob).filter(MenuImportJob.id == job.id).first()
        if failed_job:
            failed_job.status = "failed"
            failed_job.error_message = str(exc)[:2000]
            db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Menu scan failed: {exc}") from exc


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
            draft.price = Decimal(str(submitted.price)) if submitted.price is not None else None
            draft.food_type = submitted.food_type.value
            draft.variants = [variant.model_dump() for variant in submitted.variants]
            if not submitted.selected:
                continue
            if not submitted.category_name or submitted.price is None:
                raise HTTPException(400, f"{submitted.item_name}: category and price are required")

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
                description_en=draft.description,
                price=Decimal(str(submitted.price)),
                food_type=submitted.food_type.value,
                is_available=True,
                display_order=0,
            )
            db.add(menu_item)
            db.flush()
            if submitted.variants:
                option_group = MenuOptionGroup(
                    restaurant_id=current_user.restaurant_id,
                    name=f"{submitted.item_name.strip()} size",
                    type="variant",
                    required=True,
                    minimum_selections=1,
                    maximum_selections=1,
                    display_order=0,
                    active=True,
                )
                db.add(option_group)
                db.flush()
                db.add(MenuItemOptionGroup(
                    restaurant_id=current_user.restaurant_id,
                    menu_item_id=menu_item.id,
                    option_group_id=option_group.id,
                    display_order=0,
                    active=True,
                ))
                for order, variant in enumerate(submitted.variants):
                    db.add(MenuOption(
                        restaurant_id=current_user.restaurant_id,
                        group_id=option_group.id,
                        name=variant.name,
                        # Variant price_delta is the canonical final variant
                        # price (addons use additive deltas).
                        price_delta=Decimal(str(variant.price)),
                        available=True,
                        display_order=order,
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
        raise HTTPException(500, "Import failed; no menu items were changed") from exc

    return {"status": "completed", "imported": imported, "skipped": skipped}
