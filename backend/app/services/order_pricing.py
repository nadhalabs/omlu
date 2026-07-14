from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models.menu import MenuItem, MenuItemOptionGroup, MenuOption, MenuOptionGroup
from app.schemas.order import PublicOrderCreateRequest


@dataclass(frozen=True)
class PricedSelectedOption:
    menu_option_id: int
    menu_option_group_id: int
    option_name: str
    group_name: str
    option_type: str
    price_delta: Decimal
    quantity: int
    display_order: int


@dataclass(frozen=True)
class PricedOrderItem:
    menu_item_id: int
    item_name: str
    quantity: int
    unit_price: Decimal
    total_price: Decimal
    item_note: str | None
    selected_options: tuple[PricedSelectedOption, ...]


def _selection_key(selected_options: Iterable) -> tuple[tuple[int, int, int], ...]:
    return tuple(sorted((item.group_id, item.option_id, item.quantity) for item in selected_options))


def _line_key(item) -> tuple[int, str | None, tuple[tuple[int, int, int], ...]]:
    return (item.menu_item_id, item.item_note, _selection_key(item.selected_options))


def _load_menu_items(db: Session, menu_item_ids: list[int]) -> dict[int, MenuItem]:
    items = (
        db.query(MenuItem)
        .options(
            selectinload(MenuItem.option_group_links)
            .selectinload(MenuItemOptionGroup.group)
            .selectinload(MenuOptionGroup.options)
        )
        .filter(MenuItem.id.in_(menu_item_ids))
        .all()
    )
    return {item.id: item for item in items}


def validate_and_price_order_items(
    db: Session,
    restaurant_id: int,
    order_req: PublicOrderCreateRequest,
) -> tuple[Decimal, list[PricedOrderItem]]:
    if not order_req.items:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty cart")

    merged = {}
    for item in order_req.items:
        key = _line_key(item)
        if key in merged:
            merged[key]["quantity"] += item.quantity
        else:
            merged[key] = {
                "menu_item_id": item.menu_item_id,
                "quantity": item.quantity,
                "item_note": item.item_note,
                "selected_options": item.selected_options,
            }

    if len(merged) > 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Too many unique line items (maximum 50)")

    menu_items = _load_menu_items(db, [line["menu_item_id"] for line in merged.values()])
    subtotal = Decimal("0.00")
    priced_items: list[PricedOrderItem] = []

    for line in merged.values():
        menu_item_id = line["menu_item_id"]
        quantity = line["quantity"]
        if quantity < 1 or quantity > 50:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Merged quantity must be between 1 and 50")
        if menu_item_id not in menu_items:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

        menu_item = menu_items[menu_item_id]
        if menu_item.restaurant_id != restaurant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item belonging to another restaurant")
        if not menu_item.is_available:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item unavailable")

        selected_options = _validate_selected_options(menu_item, line["selected_options"])
        variant_options = [option for option in selected_options if option.option_type == "variant"]
        base_price = variant_options[0].price_delta if variant_options else menu_item.price
        addon_total = sum(
            (option.price_delta * option.quantity for option in selected_options if option.option_type == "addon"),
            Decimal("0.00"),
        )
        unit_price = base_price + addon_total
        total_price = unit_price * quantity
        subtotal += total_price
        priced_items.append(
            PricedOrderItem(
                menu_item_id=menu_item.id,
                item_name=menu_item.name_en,
                quantity=quantity,
                unit_price=unit_price,
                total_price=total_price,
                item_note=line["item_note"],
                selected_options=tuple(selected_options),
            )
        )

    return subtotal, priced_items


def _validate_selected_options(menu_item: MenuItem, requested_options) -> list[PricedSelectedOption]:
    active_links = [
        link for link in menu_item.option_group_links
        if link.active and link.group and link.group.active
    ]
    groups_by_id = {link.option_group_id: link.group for link in active_links}
    options_by_id: dict[int, MenuOption] = {}
    for group in groups_by_id.values():
        for option in group.options:
            options_by_id[option.id] = option

    requested_by_group: dict[int, list] = defaultdict(list)
    seen_pairs = set()
    for requested in requested_options:
        pair = (requested.group_id, requested.option_id)
        if pair in seen_pairs:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate option selection")
        seen_pairs.add(pair)
        if requested.group_id not in groups_by_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Option group does not belong to this item")
        option = options_by_id.get(requested.option_id)
        if not option or option.group_id != requested.group_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Option does not belong to selected group")
        if option.restaurant_id != menu_item.restaurant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Option belonging to another restaurant")
        if not option.available:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Option unavailable")
        requested_by_group[requested.group_id].append(requested)

    priced: list[PricedSelectedOption] = []
    variant_count = 0
    for link in sorted(active_links, key=lambda value: (value.display_order, value.id)):
        group = link.group
        requested = requested_by_group.get(group.id, [])
        selection_count = sum(option.quantity for option in requested)
        minimum = max(group.minimum_selections, 1 if group.required else 0)
        maximum = group.maximum_selections
        if selection_count < minimum:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{group.name} requires at least {minimum} selection(s)")
        if maximum and selection_count > maximum:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{group.name} allows at most {maximum} selection(s)")
        if group.type == "variant":
            if selection_count > 1:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Variant groups allow only one selection")
            variant_count += selection_count
        for requested_option in requested:
            option = options_by_id[requested_option.option_id]
            priced.append(
                PricedSelectedOption(
                    menu_option_id=option.id,
                    menu_option_group_id=group.id,
                    option_name=option.name,
                    group_name=group.name,
                    option_type=group.type,
                    price_delta=option.price_delta,
                    quantity=requested_option.quantity,
                    display_order=link.display_order,
                )
            )

    if variant_count > 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only one variant may be selected")
    return priced
