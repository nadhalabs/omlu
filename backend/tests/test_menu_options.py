import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.bill import Bill
from app.models.menu import MenuOption
from app.models.order import Order, OrderItem, OrderItemSelectedOption
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.staff_user import StaffUser
from app.utils.auth import create_access_token, hash_password


client = TestClient(app)


@pytest.fixture
def option_context():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(name="Options Cafe", slug=f"options-{suffix}", is_active=True, currency="INR", order_prefix="OP")
    other_restaurant = Restaurant(name="Other Options", slug=f"options-other-{suffix}", is_active=True, currency="INR", order_prefix="OX")
    db.add_all([restaurant, other_restaurant])
    db.flush()
    restaurant_ids = [restaurant.id, other_restaurant.id]
    table = RestaurantTable(restaurant_id=restaurant.id, table_number="1", table_code=f"OPT-{suffix}", is_active=True)
    staff_table = RestaurantTable(restaurant_id=restaurant.id, table_number="2", table_code=f"OPTS-{suffix}", is_active=True)
    db.add_all([table, staff_table])
    db.flush()
    category = MenuCategory(restaurant_id=restaurant.id, name_en="Food", display_order=1, is_active=True)
    other_category = MenuCategory(restaurant_id=other_restaurant.id, name_en="Other", display_order=1, is_active=True)
    db.add_all([category, other_category])
    db.flush()
    item = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Pizza", price=Decimal("100.00"), is_available=True)
    simple_item = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Tea", price=Decimal("20.00"), is_available=True)
    other_item = MenuItem(restaurant_id=other_restaurant.id, category_id=other_category.id, name_en="Other Pizza", price=Decimal("100.00"), is_available=True)
    db.add_all([item, simple_item, other_item])
    db.flush()
    users = {}
    for role in ("owner", "admin", "staff", "kitchen"):
        user = StaffUser(
            restaurant_id=restaurant.id,
            name=f"{role} user",
            email=f"{role}-{suffix}@options.local",
            password_hash=hash_password("Password123!"),
            role=role,
            is_active=True,
        )
        db.add(user)
        db.flush()
        users[role] = user
    db.commit()
    data = {
        "restaurant_id": restaurant.id,
        "restaurant_slug": restaurant.slug,
        "table_code": table.table_code,
        "staff_table_id": staff_table.id,
        "item_id": item.id,
        "simple_item_id": simple_item.id,
        "other_item_id": other_item.id,
        "owner_token": create_access_token({"sub": str(users["owner"].id), "restaurant_id": restaurant.id, "role": "owner"}),
        "admin_token": create_access_token({"sub": str(users["admin"].id), "restaurant_id": restaurant.id, "role": "admin"}),
        "staff_token": create_access_token({"sub": str(users["staff"].id), "restaurant_id": restaurant.id, "role": "staff"}),
        "kitchen_token": create_access_token({"sub": str(users["kitchen"].id), "restaurant_id": restaurant.id, "role": "kitchen"}),
    }
    db.close()
    yield data
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_(restaurant_ids)).delete()
    db.commit()
    db.close()


def auth(data, key="owner_token"):
    return {"Authorization": f"Bearer {data[key]}"}


def create_config(data):
    variant_group = client.post(
        "/admin/menu/option-groups",
        headers=auth(data),
        json={"name": "Size", "type": "variant", "required": True, "minimum_selections": 1, "maximum_selections": 1},
    ).json()
    small = client.post("/admin/menu/options", headers=auth(data), json={"group_id": variant_group["id"], "name": "Small", "price_delta": "120.00"}).json()
    large = client.post("/admin/menu/options", headers=auth(data), json={"group_id": variant_group["id"], "name": "Large", "price_delta": "240.00"}).json()
    addon_group = client.post(
        "/admin/menu/option-groups",
        headers=auth(data),
        json={"name": "Toppings", "type": "addon", "required": False, "minimum_selections": 0, "maximum_selections": 2},
    ).json()
    cheese = client.post("/admin/menu/options", headers=auth(data), json={"group_id": addon_group["id"], "name": "Cheese", "price_delta": "30.00"}).json()
    mushroom = client.post("/admin/menu/options", headers=auth(data), json={"group_id": addon_group["id"], "name": "Mushroom", "price_delta": "40.00"}).json()
    client.post("/admin/menu/items/{}/option-groups".format(data["item_id"]), headers=auth(data), json={"option_group_id": variant_group["id"], "display_order": 1})
    client.post("/admin/menu/items/{}/option-groups".format(data["item_id"]), headers=auth(data), json={"option_group_id": addon_group["id"], "display_order": 2})
    return {"variant_group": variant_group, "small": small, "large": large, "addon_group": addon_group, "cheese": cheese, "mushroom": mushroom}


def order_payload(data, options=None, item_key="item_id", quantity=1):
    return {
        "items": [{"menu_item_id": data[item_key], "quantity": quantity, "selected_options": options or []}],
        "customer_note": None,
    }


def post_qr_order(data, payload):
    return client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        headers={"Idempotency-Key": f"options-{uuid.uuid4().hex}"},
        json=payload,
    )


def test_owner_admin_configure_and_staff_kitchen_rejected(option_context):
    owner_response = client.post(
        "/admin/menu/option-groups",
        headers=auth(option_context, "owner_token"),
        json={"name": "Size", "type": "variant", "required": True, "minimum_selections": 1, "maximum_selections": 1},
    )
    assert owner_response.status_code == 201
    staff_response = client.post(
        "/admin/menu/option-groups",
        headers=auth(option_context, "staff_token"),
        json={"name": "Blocked", "type": "addon"},
    )
    kitchen_response = client.post(
        "/admin/menu/option-groups",
        headers=auth(option_context, "kitchen_token"),
        json={"name": "Blocked", "type": "addon"},
    )
    assert staff_response.status_code == 403
    assert kitchen_response.status_code == 403


def test_public_menu_includes_option_configuration(option_context):
    config = create_config(option_context)
    response = client.get(f"/public/restaurants/{option_context['restaurant_slug']}/tables/{option_context['table_code']}/menu")
    item = response.json()["categories"][0]["items"][0]

    assert response.status_code == 200
    assert {group["name"] for group in item["option_groups"]} == {"Size", "Toppings"}
    assert config["large"]["id"] in {option["id"] for group in item["option_groups"] for option in group["options"]}


def test_required_variant_and_min_max_validation(option_context):
    config = create_config(option_context)
    missing_variant = post_qr_order(option_context, order_payload(option_context))
    too_many_addons = post_qr_order(
        option_context,
        order_payload(option_context, [
            {"group_id": config["variant_group"]["id"], "option_id": config["large"]["id"], "quantity": 1},
            {"group_id": config["addon_group"]["id"], "option_id": config["cheese"]["id"], "quantity": 2},
            {"group_id": config["addon_group"]["id"], "option_id": config["mushroom"]["id"], "quantity": 1},
        ]),
    )

    assert missing_variant.status_code == 400
    assert "requires" in missing_variant.json()["detail"]
    assert too_many_addons.status_code == 400
    assert "at most" in too_many_addons.json()["detail"]


def test_qr_order_with_customisations_server_price_and_snapshots(option_context):
    config = create_config(option_context)
    response = post_qr_order(
        option_context,
        order_payload(option_context, [
            {"group_id": config["variant_group"]["id"], "option_id": config["large"]["id"], "quantity": 1},
            {"group_id": config["addon_group"]["id"], "option_id": config["cheese"]["id"], "quantity": 1},
        ], quantity=2),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["subtotal"] == "540.00"
    assert body["items"][0]["unit_price"] == "270.00"
    assert {option["option_name"] for option in body["items"][0]["selected_options"]} == {"Large", "Cheese"}

    db = SessionLocal()
    order = db.query(Order).filter(Order.public_token == body["public_token"]).one()
    line = db.query(OrderItem).filter(OrderItem.order_id == order.id).one()
    assert line.unit_price == Decimal("270.00")
    assert db.query(OrderItemSelectedOption).filter(OrderItemSelectedOption.order_item_id == line.id).count() == 2
    db.close()


def test_unavailable_and_cross_restaurant_options_rejected(option_context):
    config = create_config(option_context)
    client.patch(f"/staff/availability/options/{config['cheese']['id']}", headers=auth(option_context, "staff_token"), json={"available": False})
    unavailable = post_qr_order(
        option_context,
        order_payload(option_context, [
            {"group_id": config["variant_group"]["id"], "option_id": config["large"]["id"], "quantity": 1},
            {"group_id": config["addon_group"]["id"], "option_id": config["cheese"]["id"], "quantity": 1},
        ]),
    )
    cross = post_qr_order(option_context, order_payload(option_context, [{"group_id": config["variant_group"]["id"], "option_id": 999999, "quantity": 1}]))

    assert unavailable.status_code == 400
    assert "unavailable" in unavailable.json()["detail"].lower()
    assert cross.status_code == 400


def test_staff_order_customisations_and_kitchen_ticket(option_context):
    config = create_config(option_context)
    client.post(f"/staff/tables/{option_context['staff_table_id']}/sessions", headers=auth(option_context, "staff_token"), json={})
    order = client.post(
        f"/staff/tables/{option_context['staff_table_id']}/orders",
        headers={**auth(option_context, "staff_token"), "Idempotency-Key": f"staff-options-{uuid.uuid4().hex}"},
        json=order_payload(option_context, [{"group_id": config["variant_group"]["id"], "option_id": config["small"]["id"], "quantity": 1}]),
    )
    kitchen = client.get(f"/kitchen/restaurants/{option_context['restaurant_slug']}/orders", headers=auth(option_context, "kitchen_token"))

    assert order.status_code == 201
    kitchen_order = [item for item in kitchen.json() if item["order_number"] == order.json()["order_number"]][0]
    assert kitchen_order["items"][0]["selected_options"][0]["option_name"] == "Small"


def test_billing_totals_and_historical_snapshots_survive_option_changes(option_context):
    config = create_config(option_context)
    order = post_qr_order(
        option_context,
        order_payload(option_context, [{"group_id": config["variant_group"]["id"], "option_id": config["large"]["id"], "quantity": 1}]),
    ).json()
    db = SessionLocal()
    option = db.query(MenuOption).filter(MenuOption.id == config["large"]["id"]).one()
    option.name = "Renamed Large"
    option.price_delta = Decimal("999.00")
    db.commit()
    db.close()

    bill = client.post(f"/public/sessions/{order['dining_session_token']}/bill")

    assert bill.status_code == 201
    body = bill.json()
    assert body["subtotal"] == "240.00"
    assert body["orders"][0]["items"][0]["selected_options"][0]["option_name"] == "Large"
    assert body["orders"][0]["items"][0]["selected_options"][0]["price_delta"] == "240.00"


def test_simple_menu_item_ordering_remains_unchanged(option_context):
    response = post_qr_order(option_context, order_payload(option_context, item_key="simple_item_id", quantity=3))

    assert response.status_code == 201
    body = response.json()
    assert body["subtotal"] == "60.00"
    assert body["items"][0]["selected_options"] == []


def test_staff_availability_permissions(option_context):
    config = create_config(option_context)
    staff = client.patch(f"/staff/availability/options/{config['large']['id']}", headers=auth(option_context, "staff_token"), json={"available": False})
    kitchen = client.patch(f"/staff/availability/options/{config['small']['id']}", headers=auth(option_context, "kitchen_token"), json={"available": False})

    assert staff.status_code == 200
    assert staff.json()["available"] is False
    assert kitchen.status_code == 403
