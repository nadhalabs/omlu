from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOption, MenuOptionGroup
from app.models.order import OrderItemSelectedOption
from app.models.staff_user import StaffUser
from app.schemas.admin import MenuItemAvailabilityUpdate
from app.schemas.menu_options import (
    MenuItemOptionGroupAttach,
    MenuItemOptionGroupResponse,
    MenuOptionAvailabilityUpdate,
    MenuOptionCreate,
    MenuOptionGroupCreate,
    MenuOptionGroupResponse,
    MenuOptionGroupUpdate,
    MenuOptionResponse,
    MenuOptionUpdate,
)
from app.services.menu_options import serialize_item_option_groups, serialize_option_group
from app.services.realtime import EVENT_AVAILABILITY_UPDATED, publish_event, public_menu_channel, restaurant_channel
from app.utils.auth import RoleChecker


router = APIRouter()
admin_roles = RoleChecker(["owner", "admin"])
availability_roles = RoleChecker(["owner", "admin", "staff"])


def _load_group(db: Session, restaurant_id: int, group_id: int) -> MenuOptionGroup:
    group = (
        db.query(MenuOptionGroup)
        .options(selectinload(MenuOptionGroup.options))
        .filter(MenuOptionGroup.id == group_id, MenuOptionGroup.restaurant_id == restaurant_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option group not found")
    return group


def _load_option(db: Session, restaurant_id: int, option_id: int) -> MenuOption:
    option = db.query(MenuOption).filter(MenuOption.id == option_id, MenuOption.restaurant_id == restaurant_id).first()
    if not option:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Option not found")
    return option


def _validate_group_shape(group: MenuOptionGroup) -> None:
    if group.required and group.minimum_selections == 0:
        group.minimum_selections = 1
    if group.maximum_selections < group.minimum_selections:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="maximum_selections must be greater than or equal to minimum_selections")
    if group.type == "variant" and group.maximum_selections > 1:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Variant groups can allow only one selection")


@router.get("/admin/menu/option-groups", response_model=list[MenuOptionGroupResponse])
def list_option_groups(
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    groups = (
        db.query(MenuOptionGroup)
        .options(selectinload(MenuOptionGroup.options))
        .filter(MenuOptionGroup.restaurant_id == current_user.restaurant_id)
        .order_by(MenuOptionGroup.display_order.asc(), MenuOptionGroup.id.asc())
        .all()
    )
    return [serialize_option_group(group, include_inactive_options=True) for group in groups]


@router.post("/admin/menu/option-groups", response_model=MenuOptionGroupResponse, status_code=status.HTTP_201_CREATED)
def create_option_group(
    payload: MenuOptionGroupCreate,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    group = MenuOptionGroup(
        restaurant_id=current_user.restaurant_id,
        name=payload.name.strip(),
        type=payload.type,
        required=payload.required,
        minimum_selections=payload.minimum_selections,
        maximum_selections=payload.maximum_selections,
        display_order=payload.display_order,
        active=payload.active,
    )
    _validate_group_shape(group)
    db.add(group)
    db.commit()
    return serialize_option_group(_load_group(db, current_user.restaurant_id, group.id), include_inactive_options=True)


@router.patch("/admin/menu/option-groups/{group_id}", response_model=MenuOptionGroupResponse)
def update_option_group(
    group_id: int,
    payload: MenuOptionGroupUpdate,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    group = _load_group(db, current_user.restaurant_id, group_id)
    for field in ("name", "type", "required", "minimum_selections", "maximum_selections", "display_order", "active"):
        value = getattr(payload, field)
        if value is not None:
            setattr(group, field, value.strip() if field == "name" else value)
    _validate_group_shape(group)
    db.commit()
    return serialize_option_group(_load_group(db, current_user.restaurant_id, group.id), include_inactive_options=True)


@router.post("/admin/menu/options", response_model=MenuOptionResponse, status_code=status.HTTP_201_CREATED)
def create_option(
    payload: MenuOptionCreate,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    group = _load_group(db, current_user.restaurant_id, payload.group_id)
    option = MenuOption(
        restaurant_id=current_user.restaurant_id,
        group_id=group.id,
        name=payload.name.strip(),
        price_delta=payload.price_delta,
        available=payload.available,
        display_order=payload.display_order,
    )
    db.add(option)
    db.commit()
    db.refresh(option)
    return option


@router.patch("/admin/menu/options/{option_id}", response_model=MenuOptionResponse)
def update_option(
    option_id: int,
    payload: MenuOptionUpdate,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    option = _load_option(db, current_user.restaurant_id, option_id)
    for field in ("name", "price_delta", "available", "display_order"):
        value = getattr(payload, field)
        if value is not None:
            setattr(option, field, value.strip() if field == "name" else value)
    db.commit()
    db.refresh(option)
    return option


@router.delete("/admin/menu/options/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_option(
    option_id: int,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    option = _load_option(db, current_user.restaurant_id, option_id)
    if db.query(OrderItemSelectedOption).filter(OrderItemSelectedOption.menu_option_id == option.id).first():
        option.available = False
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    db.delete(option)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/admin/menu/items/{item_id}/option-groups", response_model=MenuItemOptionGroupResponse, status_code=status.HTTP_201_CREATED)
def attach_option_group_to_item(
    item_id: int,
    payload: MenuItemOptionGroupAttach,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.restaurant_id == current_user.restaurant_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    group = _load_group(db, current_user.restaurant_id, payload.option_group_id)
    existing = db.query(MenuItemOptionGroup).filter(
        MenuItemOptionGroup.menu_item_id == item.id,
        MenuItemOptionGroup.option_group_id == group.id,
    ).first()
    if existing:
        existing.active = payload.active
        existing.display_order = payload.display_order
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "menu_item_id": item.id, "option_group_id": group.id, "display_order": existing.display_order, "active": existing.active, "group": serialize_option_group(group, include_inactive_options=True)}
    link = MenuItemOptionGroup(
        restaurant_id=current_user.restaurant_id,
        menu_item_id=item.id,
        option_group_id=group.id,
        display_order=payload.display_order,
        active=payload.active,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return {"id": link.id, "menu_item_id": item.id, "option_group_id": group.id, "display_order": link.display_order, "active": link.active, "group": serialize_option_group(group, include_inactive_options=True)}


@router.delete("/admin/menu/items/{item_id}/option-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def detach_option_group_from_item(
    item_id: int,
    group_id: int,
    current_user: StaffUser = Depends(admin_roles),
    db: Session = Depends(get_db),
):
    link = db.query(MenuItemOptionGroup).filter(
        MenuItemOptionGroup.restaurant_id == current_user.restaurant_id,
        MenuItemOptionGroup.menu_item_id == item_id,
        MenuItemOptionGroup.option_group_id == group_id,
    ).first()
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item option group not found")
    db.delete(link)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/staff/availability")
def staff_availability(
    category_id: int | None = None,
    search: str | None = None,
    current_user: StaffUser = Depends(availability_roles),
    db: Session = Depends(get_db),
):
    query = (
        db.query(MenuItem)
        .join(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .options(
            selectinload(MenuItem.option_group_links)
            .selectinload(MenuItemOptionGroup.group)
            .selectinload(MenuOptionGroup.options)
        )
        .filter(MenuItem.restaurant_id == current_user.restaurant_id)
    )
    if category_id is not None:
        query = query.filter(MenuItem.category_id == category_id)
    if search:
        query = query.filter(MenuItem.name_en.ilike(f"%{search.strip()}%"))
    items = query.order_by(MenuCategory.display_order.asc(), MenuItem.display_order.asc(), MenuItem.id.asc()).all()
    return {
        "items": [
            {
                "id": item.id,
                "category_id": item.category_id,
                "category_name": item.category.name_en,
                "name_en": item.name_en,
                "is_available": item.is_available,
                "updated_at": None,
                "option_groups": serialize_item_option_groups(item, include_inactive=True, include_inactive_options=True),
            }
            for item in items
        ]
    }


@router.patch("/staff/availability/items/{item_id}")
def staff_update_item_availability(
    item_id: int,
    payload: MenuItemAvailabilityUpdate,
    current_user: StaffUser = Depends(availability_roles),
    db: Session = Depends(get_db),
):
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.restaurant_id == current_user.restaurant_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    item.is_available = payload.is_available
    db.commit()
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
    return {"id": item.id, "is_available": item.is_available}


@router.patch("/staff/availability/options/{option_id}")
def staff_update_option_availability(
    option_id: int,
    payload: MenuOptionAvailabilityUpdate,
    current_user: StaffUser = Depends(availability_roles),
    db: Session = Depends(get_db),
):
    option = _load_option(db, current_user.restaurant_id, option_id)
    option.available = payload.available
    db.commit()
    publish_event(
        EVENT_AVAILABILITY_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            restaurant_channel(current_user.restaurant_id, "availability"),
            public_menu_channel(current_user.restaurant_id),
        ],
        resource_id=option.id,
        state={"kind": "option", "option_id": option.id, "available": option.available},
    )
    return {"id": option.id, "available": option.available}


@router.patch("/staff/availability/categories/{category_id}")
def staff_update_category_availability(
    category_id: int,
    payload: MenuItemAvailabilityUpdate,
    current_user: StaffUser = Depends(availability_roles),
    db: Session = Depends(get_db),
):
    category = db.query(MenuCategory).filter(MenuCategory.id == category_id, MenuCategory.restaurant_id == current_user.restaurant_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    updated = db.query(MenuItem).filter(MenuItem.category_id == category.id).update({"is_available": payload.is_available})
    db.commit()
    publish_event(
        EVENT_AVAILABILITY_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            restaurant_channel(current_user.restaurant_id, "availability"),
            public_menu_channel(current_user.restaurant_id),
        ],
        resource_id=category.id,
        state={"kind": "category", "category_id": category.id, "is_available": payload.is_available, "updated_items": updated},
    )
    return {"category_id": category.id, "is_available": payload.is_available, "updated_items": updated}
