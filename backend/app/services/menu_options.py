from app.models.menu import MenuItem, MenuItemOptionGroup, MenuOptionGroup


def serialize_option_group(group: MenuOptionGroup, *, include_inactive_options: bool = False) -> dict:
    options = [
        option for option in group.options
        if include_inactive_options or option.available
    ]
    options = sorted(options, key=lambda option: (option.display_order, option.id))
    return {
        "id": group.id,
        "restaurant_id": group.restaurant_id,
        "name": group.name,
        "type": group.type,
        "required": group.required,
        "minimum_selections": group.minimum_selections,
        "maximum_selections": group.maximum_selections,
        "display_order": group.display_order,
        "active": group.active,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "options": [
            {
                "id": option.id,
                "group_id": option.group_id,
                "name": option.name,
                "price_delta": option.price_delta,
                "available": option.available,
                "display_order": option.display_order,
                "created_at": option.created_at,
                "updated_at": option.updated_at,
            }
            for option in options
        ],
    }


def serialize_item_option_groups(item: MenuItem, *, include_inactive: bool = False, include_inactive_options: bool = False) -> list[dict]:
    links: list[MenuItemOptionGroup] = [
        link for link in item.option_group_links
        if link.group and (include_inactive or (link.active and link.group.active))
    ]
    links = sorted(links, key=lambda link: (link.display_order, link.id))
    return [
        serialize_option_group(link.group, include_inactive_options=include_inactive_options)
        for link in links
    ]
