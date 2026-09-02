import json
import logging
import secrets
import qrcode
from io import BytesIO
from typing import List, Optional
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status as fastapi_status, Query
from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.config import settings
from app.models.staff_user import AuditLog, StaffUser
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOptionGroup
from app.models.restaurant_table import RestaurantTable
from app.utils.auth import get_current_restaurant_staff_user, get_current_staff_user, RoleChecker
from app.services.realtime import EVENT_AVAILABILITY_UPDATED, publish_event, public_menu_channel, restaurant_channel
from app.schemas.admin import (
    CategoryCreate,
    CategoryUpdate,
    CategoryDeleteItemsRequest,
    CategoryMoveItemsRequest,
    CategoryResponse,
    MenuItemCreate,
    MenuItemUpdate,
    MenuItemResponse,
    MenuItemAvailabilityUpdate,
    TableCreate,
    TableUpdate,
    TableResponse,
)

router = APIRouter(prefix="/admin", dependencies=[Depends(get_current_restaurant_staff_user)])
logger = logging.getLogger(__name__)

# Protect all admin routes for owners and admins only
admin_access_dependency = Depends(RoleChecker(["owner", "admin"]))


def _menu_audit(db: Session, actor: StaffUser, *, action: str, target_type: str, target_id: int, details: dict) -> None:
    db.add(AuditLog(
        restaurant_id=actor.restaurant_id,
        actor_user_id=actor.id,
        actor_role=actor.role,
        target_type=target_type,
        target_id=str(target_id),
        action=action,
        new_value=json.dumps(details),
    ))


def _delete_orphan_option_groups(db: Session, group_ids: set[int]) -> None:
    if not group_ids:
        return
    orphaned = (
        db.query(MenuOptionGroup)
        .filter(
            MenuOptionGroup.id.in_(group_ids),
            ~MenuOptionGroup.item_links.any(),
        )
        .with_for_update()
        .all()
    )
    for group in orphaned:
        db.delete(group)


def _publish_menu_deleted(restaurant_id: int, state: dict) -> None:
    publish_event(
        EVENT_AVAILABILITY_UPDATED,
        restaurant_id=restaurant_id,
        channels=[public_menu_channel(restaurant_id), restaurant_channel(restaurant_id, "staff")],
        resource_id=state.get("item_id") or state.get("category_id"),
        state=state,
    )

def generate_table_code(table_number: str) -> str:
    # predictable URL-safe secure token format: T{table_number}-{random_token}
    safe_num = "".join(c for c in table_number if c.isalnum())
    token = secrets.token_urlsafe(8) # returns ~11 URL-safe characters
    return f"T{safe_num}-{token}"


# --- Menu Categories Endpoints ---

@router.get(
    "/categories",
    response_model=List[CategoryResponse],
    dependencies=[admin_access_dependency]
)
def list_categories(
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Fetch categories belonging to authenticated restaurant, sorted by display_order and ID
    categories = db.query(MenuCategory).filter(
        MenuCategory.restaurant_id == current_user.restaurant_id
    ).order_by(
        MenuCategory.display_order.asc(),
        MenuCategory.id.asc()
    ).all()

    # Calculate item count for each category
    response = []
    for cat in categories:
        item_count = db.query(MenuItem).filter(MenuItem.category_id == cat.id).count()
        response.append({
            "id": cat.id,
            "name_en": cat.name_en,
            "name_ml": cat.name_ml,
            "display_order": cat.display_order,
            "is_active": cat.is_active,
            "item_count": item_count
        })
    return response


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=fastapi_status.HTTP_201_CREATED,
    dependencies=[admin_access_dependency]
)
def create_category(
    cat_req: CategoryCreate,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    category = MenuCategory(
        restaurant_id=current_user.restaurant_id,
        name_en=cat_req.name_en.strip(),
        name_ml=cat_req.name_ml.strip() if cat_req.name_ml else None,
        display_order=cat_req.display_order,
        is_active=cat_req.is_active
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    return {
        "id": category.id,
        "name_en": category.name_en,
        "name_ml": category.name_ml,
        "display_order": category.display_order,
        "is_active": category.is_active,
        "item_count": 0
    }


@router.patch(
    "/categories/{category_id}",
    response_model=CategoryResponse,
    dependencies=[admin_access_dependency]
)
def update_category(
    category_id: int,
    cat_req: CategoryUpdate,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Enforce restaurant isolation in query
    category = db.query(MenuCategory).filter(
        MenuCategory.id == category_id,
        MenuCategory.restaurant_id == current_user.restaurant_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    if cat_req.name_en is not None:
        category.name_en = cat_req.name_en.strip()
    if cat_req.name_ml is not None:
        category.name_ml = cat_req.name_ml.strip() if cat_req.name_ml else None
    if cat_req.display_order is not None:
        category.display_order = cat_req.display_order
    if cat_req.is_active is not None:
        category.is_active = cat_req.is_active

    db.commit()
    db.refresh(category)

    item_count = db.query(MenuItem).filter(MenuItem.category_id == category.id).count()
    return {
        "id": category.id,
        "name_en": category.name_en,
        "name_ml": category.name_ml,
        "display_order": category.display_order,
        "is_active": category.is_active,
        "item_count": item_count
    }


@router.delete(
    "/categories/{category_id}",
    status_code=fastapi_status.HTTP_204_NO_CONTENT,
    dependencies=[admin_access_dependency]
)
def delete_category(
    category_id: int,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Enforce restaurant isolation in query
    category = db.query(MenuCategory).filter(
        MenuCategory.id == category_id,
        MenuCategory.restaurant_id == current_user.restaurant_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )

    # If it contains menu items, block deletion
    item_count = db.query(MenuItem).filter(MenuItem.category_id == category_id).count()
    if item_count > 0:
        raise HTTPException(
            status_code=fastapi_status.HTTP_409_CONFLICT,
            detail="Category contains menu items. Deactivate it instead."
        )

    db.delete(category)
    _menu_audit(db, current_user, action="menu_category_deleted", target_type="menu_category", target_id=category.id, details={"name": category.name_en, "item_count": 0})
    db.commit()
    _publish_menu_deleted(current_user.restaurant_id, {"kind": "category", "category_id": category_id, "deleted": True})
    return Response(status_code=fastapi_status.HTTP_204_NO_CONTENT)


@router.post(
    "/categories/{category_id}/delete-with-items",
    status_code=fastapi_status.HTTP_204_NO_CONTENT,
    dependencies=[admin_access_dependency],
)
def delete_category_with_items(
    category_id: int,
    payload: CategoryDeleteItemsRequest,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    category = (
        db.query(MenuCategory)
        .filter(MenuCategory.id == category_id, MenuCategory.restaurant_id == current_user.restaurant_id)
        .with_for_update()
        .first()
    )
    if not category:
        raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Category not found")
    if payload.confirmation_name.strip() != category.name_en:
        raise HTTPException(status_code=fastapi_status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Type the category name exactly to confirm deletion")

    items = db.query(MenuItem).filter(MenuItem.category_id == category.id).with_for_update().all()
    item_ids = [item.id for item in items]
    group_ids = {
        group_id for (group_id,) in db.query(MenuItemOptionGroup.option_group_id).filter(MenuItemOptionGroup.menu_item_id.in_(item_ids)).all()
    } if item_ids else set()
    _menu_audit(
        db,
        current_user,
        action="menu_category_deleted_with_items",
        target_type="menu_category",
        target_id=category.id,
        details={"name": category.name_en, "item_count": len(items), "item_ids": item_ids},
    )
    db.execute(delete(MenuCategory).where(MenuCategory.id == category.id))
    db.flush()
    _delete_orphan_option_groups(db, group_ids)
    db.commit()
    _publish_menu_deleted(current_user.restaurant_id, {"kind": "category", "category_id": category_id, "deleted": True, "item_ids": item_ids})
    return Response(status_code=fastapi_status.HTTP_204_NO_CONTENT)


@router.post(
    "/categories/{category_id}/move-items-and-delete",
    status_code=fastapi_status.HTTP_204_NO_CONTENT,
    dependencies=[admin_access_dependency],
)
def move_category_items_and_delete(
    category_id: int,
    payload: CategoryMoveItemsRequest,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db),
):
    if payload.destination_category_id == category_id:
        raise HTTPException(status_code=fastapi_status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Destination category must be different")
    categories = (
        db.query(MenuCategory)
        .filter(
            MenuCategory.restaurant_id == current_user.restaurant_id,
            MenuCategory.id.in_([category_id, payload.destination_category_id]),
        )
        .order_by(MenuCategory.id)
        .with_for_update()
        .all()
    )
    by_id = {category.id: category for category in categories}
    source = by_id.get(category_id)
    destination = by_id.get(payload.destination_category_id)
    if not source:
        raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Category not found")
    if not destination:
        raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Destination category not found")
    items = db.query(MenuItem).filter(MenuItem.category_id == source.id).with_for_update().all()
    item_ids = [item.id for item in items]
    for item in items:
        item.category_id = destination.id
    _menu_audit(
        db,
        current_user,
        action="menu_category_items_moved_and_deleted",
        target_type="menu_category",
        target_id=source.id,
        details={"name": source.name_en, "destination_category_id": destination.id, "item_ids": item_ids},
    )
    db.flush()
    db.delete(source)
    db.commit()
    _publish_menu_deleted(current_user.restaurant_id, {"kind": "category", "category_id": category_id, "deleted": True, "moved_item_ids": item_ids, "destination_category_id": destination.id})
    return Response(status_code=fastapi_status.HTTP_204_NO_CONTENT)


# --- Menu Items Endpoints ---

@router.get(
    "/menu-items",
    response_model=List[MenuItemResponse],
    dependencies=[admin_access_dependency]
)
def list_menu_items(
    category_id: Optional[int] = Query(None),
    is_available: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    query = db.query(MenuItem).join(
        MenuCategory, MenuItem.category_id == MenuCategory.id
    ).filter(
        MenuItem.restaurant_id == current_user.restaurant_id
    )

    if category_id is not None:
        query = query.filter(MenuItem.category_id == category_id)
    if is_available is not None:
        query = query.filter(MenuItem.is_available == is_available)
    if search:
        search_clean = f"%{search.strip()}%"
        query = query.filter(
            MenuItem.name_en.ilike(search_clean) | MenuItem.name_ml.ilike(search_clean)
        )

    # Sort by category display order, item display order and ID
    items = query.order_by(
        MenuCategory.display_order.asc(),
        MenuItem.display_order.asc(),
        MenuItem.id.asc()
    ).all()

    response = []
    for item in items:
        response.append({
            "id": item.id,
            "category_id": item.category_id,
            "category_name": item.category.name_en,
            "name_en": item.name_en,
            "name_ml": item.name_ml,
            "description_en": item.description_en,
            "description_ml": item.description_ml,
            "price": item.price,
            "image_url": item.image_url,
            "is_available": item.is_available,
            "display_order": item.display_order
        })
    return response


@router.post(
    "/menu-items",
    response_model=MenuItemResponse,
    status_code=fastapi_status.HTTP_201_CREATED,
    dependencies=[admin_access_dependency]
)
def create_menu_item(
    item_req: MenuItemCreate,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Verify category belongs to authenticated restaurant
    category = db.query(MenuCategory).filter(
        MenuCategory.id == item_req.category_id,
        MenuCategory.restaurant_id == current_user.restaurant_id
    ).first()

    if not category:
        raise HTTPException(
            status_code=fastapi_status.HTTP_400_BAD_REQUEST,
            detail="Category not found or does not belong to your restaurant."
        )

    item = MenuItem(
        restaurant_id=current_user.restaurant_id,
        category_id=item_req.category_id,
        name_en=item_req.name_en.strip(),
        name_ml=item_req.name_ml.strip() if item_req.name_ml else None,
        description_en=item_req.description_en.strip() if item_req.description_en else None,
        description_ml=item_req.description_ml.strip() if item_req.description_ml else None,
        price=item_req.price,
        image_url=item_req.image_url,
        is_available=item_req.is_available,
        display_order=item_req.display_order
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "category_id": item.category_id,
        "category_name": category.name_en,
        "name_en": item.name_en,
        "name_ml": item.name_ml,
        "description_en": item.description_en,
        "description_ml": item.description_ml,
        "price": item.price,
        "image_url": item.image_url,
        "is_available": item.is_available,
        "display_order": item.display_order
    }


@router.patch(
    "/menu-items/{item_id}",
    response_model=MenuItemResponse,
    dependencies=[admin_access_dependency]
)
def update_menu_item(
    item_id: int,
    item_req: MenuItemUpdate,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Enforce restaurant isolation in query
    item = db.query(MenuItem).filter(
        MenuItem.id == item_id,
        MenuItem.restaurant_id == current_user.restaurant_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Menu item not found"
        )

    if item_req.category_id is not None:
        # Verify category belongs to authenticated restaurant
        category = db.query(MenuCategory).filter(
            MenuCategory.id == item_req.category_id,
            MenuCategory.restaurant_id == current_user.restaurant_id
        ).first()
        if not category:
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail="Category not found or does not belong to your restaurant."
            )
        item.category_id = item_req.category_id

    if item_req.name_en is not None:
        item.name_en = item_req.name_en.strip()
    if item_req.name_ml is not None:
        item.name_ml = item_req.name_ml.strip() if item_req.name_ml else None
    if item_req.description_en is not None:
        item.description_en = item_req.description_en.strip() if item_req.description_en else None
    if item_req.description_ml is not None:
        item.description_ml = item_req.description_ml.strip() if item_req.description_ml else None
    if item_req.price is not None:
        item.price = item_req.price
    if item_req.image_url is not None:
        if item_req.image_url == "":
            item.image_url = None
        else:
            item.image_url = item_req.image_url
    if item_req.is_available is not None:
        item.is_available = item_req.is_available
    if item_req.display_order is not None:
        item.display_order = item_req.display_order

    db.commit()
    db.refresh(item)

    return {
        "id": item.id,
        "category_id": item.category_id,
        "category_name": item.category.name_en,
        "name_en": item.name_en,
        "name_ml": item.name_ml,
        "description_en": item.description_en,
        "description_ml": item.description_ml,
        "price": item.price,
        "image_url": item.image_url,
        "is_available": item.is_available,
        "display_order": item.display_order
    }


@router.delete(
    "/menu-items/{item_id}",
    status_code=fastapi_status.HTTP_204_NO_CONTENT,
    dependencies=[admin_access_dependency]
)
def delete_menu_item(
    item_id: int,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Enforce restaurant isolation in query
    item = db.query(MenuItem).filter(
        MenuItem.id == item_id,
        MenuItem.restaurant_id == current_user.restaurant_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Menu item not found"
        )

    item = db.query(MenuItem).filter(MenuItem.id == item.id).with_for_update().one()
    group_ids = {
        group_id for (group_id,) in db.query(MenuItemOptionGroup.option_group_id).filter(MenuItemOptionGroup.menu_item_id == item.id).all()
    }
    _menu_audit(db, current_user, action="menu_item_deleted", target_type="menu_item", target_id=item.id, details={"name": item.name_en, "category_id": item.category_id})
    db.execute(delete(MenuItem).where(MenuItem.id == item.id))
    db.flush()
    _delete_orphan_option_groups(db, group_ids)
    db.commit()
    _publish_menu_deleted(current_user.restaurant_id, {"kind": "item", "item_id": item_id, "deleted": True})
    return Response(status_code=fastapi_status.HTTP_204_NO_CONTENT)


@router.patch(
    "/menu-items/{item_id}/availability",
    response_model=MenuItemResponse,
    dependencies=[admin_access_dependency]
)
def update_item_availability(
    item_id: int,
    avail_req: MenuItemAvailabilityUpdate,
    request: Request,
    current_user: StaffUser = Depends(get_current_staff_user),
    db: Session = Depends(get_db)
):
    # Enforce restaurant isolation in query
    item = db.query(MenuItem).filter(
        MenuItem.id == item_id,
        MenuItem.restaurant_id == current_user.restaurant_id
    ).first()

    if not item:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Menu item not found"
        )

    previous = item.is_available
    item.is_available = avail_req.is_available
    db.add(
        AuditLog(
            restaurant_id=current_user.restaurant_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            target_type="menu_item",
            target_id=str(item.id),
            action="availability_updated",
            previous_value=json.dumps({"is_available": previous}),
            new_value=json.dumps(
                {
                    "is_available": item.is_available,
                    "request_id": getattr(request.state, "request_id", None),
                }
            ),
        )
    )
    db.commit()
    db.refresh(item)
    publish_event(
        EVENT_AVAILABILITY_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            restaurant_channel(current_user.restaurant_id, "availability"),
            public_menu_channel(current_user.restaurant_id),
        ],
        resource_id=item.id,
        state={"kind": "item", "item_id": item.id, "is_available": item.is_available},
    )

    return {
        "id": item.id,
        "category_id": item.category_id,
        "category_name": item.category.name_en,
        "name_en": item.name_en,
        "name_ml": item.name_ml,
        "description_en": item.description_en,
        "description_ml": item.description_ml,
        "price": item.price,
        "image_url": item.image_url,
        "is_available": item.is_available,
        "display_order": item.display_order
    }


# --- Table Management Endpoints ---

@router.get(
    "/tables",
    response_model=List[TableResponse],
    dependencies=[admin_access_dependency]
)
def list_tables(
    current_user: StaffUser = Depends(get_current_restaurant_staff_user),
    db: Session = Depends(get_db)
):
    tables = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == current_user.restaurant_id
    ).order_by(
        RestaurantTable.table_number.asc()
    ).all()

    frontend_base = settings.public_frontend_url.rstrip("/")
    slug = current_user.restaurant.slug

    response = []
    for t in tables:
        response.append({
            "id": t.id,
            "table_number": t.table_number,
            "table_code": t.table_code,
            "is_active": t.is_active,
            "public_menu_url": f"{frontend_base}/menu/{slug}/{t.table_code}",
            "qr_code_url": f"/api/admin/tables/{t.id}/qr"
        })
    return response


@router.post(
    "/tables",
    response_model=TableResponse,
    status_code=fastapi_status.HTTP_201_CREATED,
    dependencies=[admin_access_dependency]
)
def create_table(
    table_req: TableCreate,
    current_user: StaffUser = Depends(get_current_restaurant_staff_user),
    db: Session = Depends(get_db)
):
    table_num = table_req.table_number.strip()

    # Prevent duplicate active table numbers within the same restaurant
    existing_active = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.table_number == table_num,
        RestaurantTable.is_active == True
    ).first()

    if existing_active:
        raise HTTPException(
            status_code=fastapi_status.HTTP_409_CONFLICT,
            detail=f"Table number '{table_num}' is already active in this restaurant."
        )

    # Secure table code generation with retry logic on unique constraint collision
    table_code = None
    for attempt in range(5):
        temp_code = generate_table_code(table_num)
        exists = db.query(RestaurantTable).filter(
            RestaurantTable.restaurant_id == current_user.restaurant_id,
            RestaurantTable.table_code == temp_code
        ).first()
        if not exists:
            table_code = temp_code
            break
    else:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate a unique secure table code."
        )

    table = RestaurantTable(
        restaurant_id=current_user.restaurant_id,
        table_number=table_num,
        table_code=table_code,
        is_active=True
    )
    db.add(table)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=fastapi_status.HTTP_409_CONFLICT,
            detail=f"Table number '{table_num}' is already active in this restaurant.",
        )
    db.refresh(table)

    frontend_base = settings.public_frontend_url.rstrip("/")
    slug = current_user.restaurant.slug

    return {
        "id": table.id,
        "table_number": table.table_number,
        "table_code": table.table_code,
        "is_active": table.is_active,
        "public_menu_url": f"{frontend_base}/menu/{slug}/{table.table_code}",
        "qr_code_url": f"/api/admin/tables/{table.id}/qr"
    }


@router.patch(
    "/tables/{table_id}",
    response_model=TableResponse,
    dependencies=[admin_access_dependency]
)
def update_table(
    table_id: int,
    table_req: TableUpdate,
    current_user: StaffUser = Depends(get_current_restaurant_staff_user),
    db: Session = Depends(get_db)
):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id
    ).first()

    if not table:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )

    if table_req.table_number is not None:
        table_num = table_req.table_number.strip()
        # Prevent active number duplicates if changing number and marked active
        active_status = table_req.is_active if table_req.is_active is not None else table.is_active
        if active_status:
            existing_active = db.query(RestaurantTable).filter(
                RestaurantTable.restaurant_id == current_user.restaurant_id,
                RestaurantTable.table_number == table_num,
                RestaurantTable.is_active == True,
                RestaurantTable.id != table_id
            ).first()
            if existing_active:
                raise HTTPException(
                    status_code=fastapi_status.HTTP_409_CONFLICT,
                    detail=f"Table number '{table_num}' is already active in this restaurant."
                )
        table.table_number = table_num

    if table_req.is_active is not None:
        # Check active number duplicate if reactivating table
        if table_req.is_active and not table.is_active:
            existing_active = db.query(RestaurantTable).filter(
                RestaurantTable.restaurant_id == current_user.restaurant_id,
                RestaurantTable.table_number == table.table_number,
                RestaurantTable.is_active == True,
                RestaurantTable.id != table_id
            ).first()
            if existing_active:
                raise HTTPException(
                    status_code=fastapi_status.HTTP_409_CONFLICT,
                    detail=f"Table number '{table.table_number}' is already active in this restaurant."
                )
        table.is_active = table_req.is_active

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=fastapi_status.HTTP_409_CONFLICT,
            detail=f"Table number '{table.table_number}' is already active in this restaurant.",
        )
    db.refresh(table)

    frontend_base = settings.public_frontend_url.rstrip("/")
    slug = current_user.restaurant.slug

    return {
        "id": table.id,
        "table_number": table.table_number,
        "table_code": table.table_code,
        "is_active": table.is_active,
        "public_menu_url": f"{frontend_base}/menu/{slug}/{table.table_code}",
        "qr_code_url": f"/api/admin/tables/{table.id}/qr"
    }


@router.post(
    "/tables/{table_id}/regenerate-code",
    response_model=TableResponse,
    dependencies=[admin_access_dependency]
)
def regenerate_table_code(
    table_id: int,
    current_user: StaffUser = Depends(get_current_restaurant_staff_user),
    db: Session = Depends(get_db)
):
    try:
        # Row lock table in current transaction
        table = db.query(RestaurantTable).filter(
            RestaurantTable.id == table_id,
            RestaurantTable.restaurant_id == current_user.restaurant_id
        ).with_for_update().first()

        if not table:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail="Table not found"
            )

        # Generate new table code with collision check
        new_code = None
        for attempt in range(5):
            temp_code = generate_table_code(table.table_number)
            exists = db.query(RestaurantTable).filter(
                RestaurantTable.restaurant_id == current_user.restaurant_id,
                RestaurantTable.table_code == temp_code
            ).first()
            if not exists:
                new_code = temp_code
                break
        else:
            raise HTTPException(
                status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate unique secure table code."
            )

        table.table_code = new_code
        db.commit()
        db.refresh(table)

        frontend_base = settings.public_frontend_url.rstrip("/")
        slug = current_user.restaurant.slug

        return {
            "id": table.id,
            "table_number": table.table_number,
            "table_code": table.table_code,
            "is_active": table.is_active,
            "public_menu_url": f"{frontend_base}/menu/{slug}/{table.table_code}",
            "qr_code_url": f"/api/admin/tables/{table.id}/qr"
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("event=table_code_regeneration_failure error_type=%s", e.__class__.__name__)
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not regenerate the table code. Please try again."
        )


# --- Table QR Code Endpoints ---

@router.get(
    "/tables/{table_id}/qr",
    dependencies=[admin_access_dependency]
)
def get_table_qr(
    table_id: int,
    current_user: StaffUser = Depends(get_current_restaurant_staff_user),
    db: Session = Depends(get_db)
):
    # Enforce restaurant isolation
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id
    ).first()

    if not table:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )

    frontend_base = settings.public_frontend_url.rstrip("/")
    slug = current_user.restaurant.slug
    menu_url = f"{frontend_base}/menu/{slug}/{table.table_code}"

    # Generate QR Code dynamically
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(menu_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = BytesIO()
    img.save(buf, format="PNG")
    png_data = buf.getvalue()

    # safe download filename using Content-Disposition header
    filename = f"{slug}-table-{table.table_number}-qr.png"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"'
    }

    return Response(content=png_data, media_type="image/png", headers=headers)
