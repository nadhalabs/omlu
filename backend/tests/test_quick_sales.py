import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOption, MenuOptionGroup
from app.models.quick_sale import QuickSale, QuickSaleItem, QuickSaleItemSelectedOption
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token

client = TestClient(app)


@pytest.fixture
def quick_sale_context():
    db = SessionLocal(); suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(name="Quick Sale Cafe", slug=f"quick-{suffix}", is_active=True, currency="INR")
    other = Restaurant(name="Other Cafe", slug=f"quick-other-{suffix}", is_active=True)
    db.add_all([restaurant, other]); db.flush()
    category = MenuCategory(restaurant_id=restaurant.id, name_en="Counter", is_active=True, display_order=0)
    other_category = MenuCategory(restaurant_id=other.id, name_en="Other", is_active=True, display_order=0)
    db.add_all([category, other_category]); db.flush()
    item = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Dosa", price=Decimal("80.00"), is_available=True)
    configurable = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Mandi", price=Decimal("200.00"), is_available=True)
    other_item = MenuItem(restaurant_id=other.id, category_id=other_category.id, name_en="Other Mandi", price=Decimal("200.00"), is_available=True)
    db.add_all([item, configurable, other_item]); db.flush()
    size = MenuOptionGroup(restaurant_id=restaurant.id, name="Serving type", type="variant", required=True, minimum_selections=1, maximum_selections=1)
    extras = MenuOptionGroup(restaurant_id=restaurant.id, name="Extras", type="addon", required=False, minimum_selections=0, maximum_selections=2)
    other_group = MenuOptionGroup(restaurant_id=other.id, name="Other size", type="variant", required=True, minimum_selections=1, maximum_selections=1)
    db.add_all([size, extras, other_group]); db.flush()
    quarter = MenuOption(restaurant_id=restaurant.id, group_id=size.id, name="Quarter", price_delta=Decimal("240.00"), available=True)
    half = MenuOption(restaurant_id=restaurant.id, group_id=size.id, name="Half", price_delta=Decimal("400.00"), available=True)
    mayo = MenuOption(restaurant_id=restaurant.id, group_id=extras.id, name="Extra mayonnaise", price_delta=Decimal("30.00"), available=True)
    spicy = MenuOption(restaurant_id=restaurant.id, group_id=extras.id, name="Spicy", price_delta=Decimal("0.00"), available=True)
    other_option = MenuOption(restaurant_id=other.id, group_id=other_group.id, name="Other half", price_delta=Decimal("999.00"), available=True)
    db.add_all([quarter, half, mayo, spicy, other_option]); db.flush()
    db.add_all([
        MenuItemOptionGroup(restaurant_id=restaurant.id, menu_item_id=configurable.id, option_group_id=size.id, display_order=1),
        MenuItemOptionGroup(restaurant_id=restaurant.id, menu_item_id=configurable.id, option_group_id=extras.id, display_order=2),
        MenuItemOptionGroup(restaurant_id=other.id, menu_item_id=other_item.id, option_group_id=other_group.id),
    ])
    users = {}
    for role in ("owner", "admin", "staff", "kitchen"):
        user = StaffUser(restaurant_id=restaurant.id, name=f"{role.title()} User", email=f"{role}-{suffix}@quick.local", password_hash=hash_password("Password123!"), role=role, status="active", is_active=True)
        db.add(user); db.flush(); users[role] = user
    other_owner = StaffUser(restaurant_id=other.id, name="Other Owner", email=f"other-{suffix}@quick.local", password_hash=hash_password("Password123!"), role="owner", status="active", is_active=True)
    db.add(other_owner); db.commit()
    data = {
        "restaurant_id": restaurant.id, "other_id": other.id, "slug": restaurant.slug, "item_id": item.id,
        "configurable_id": configurable.id, "size_group_id": size.id, "extras_group_id": extras.id,
        "quarter_id": quarter.id, "half_id": half.id, "mayo_id": mayo.id, "spicy_id": spicy.id,
        "other_group_id": other_group.id, "other_option_id": other_option.id,
    }
    for role, user in users.items(): data[f"{role}_token"] = create_access_token({"sub": str(user.id), "restaurant_id": restaurant.id, "role": role})
    data["other_token"] = create_access_token({"sub": str(other_owner.id), "restaurant_id": other.id, "role": "owner"})
    db.close(); yield data
    db = SessionLocal(); db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, other.id])).delete(); db.commit(); db.close()


def auth(ctx, role): return {"Authorization": f"Bearer {ctx[f'{role}_token']}"}
def payload(ctx, sale_type="takeaway", key=None):
    return {"sale_type": sale_type, "items": [{"menu_item_id": ctx["item_id"], "quantity": 2}], "note": "No onions", "payment_method": "cash" if sale_type == "late_entry" else None, "idempotency_key": key or uuid.uuid4().hex}


def configured_payload(ctx, sale_type="takeaway", key=None, options=None, quantity=1):
    return {
        "sale_type": sale_type,
        "items": [{
            "menu_item_id": ctx["configurable_id"],
            "quantity": quantity,
            "selected_options": options if options is not None else [
                {"group_id": ctx["size_group_id"], "option_id": ctx["half_id"], "quantity": 1},
                {"group_id": ctx["extras_group_id"], "option_id": ctx["mayo_id"], "quantity": 1},
            ],
        }],
        "payment_method": "cash" if sale_type == "late_entry" else None,
        "idempotency_key": key or uuid.uuid4().hex,
    }


def update_kitchen_status(ctx, public_token, status, role="kitchen"):
    return client.patch(
        f"/kitchen/restaurants/{ctx['slug']}/orders/{public_token}/status",
        headers=auth(ctx, role),
        json={"status": status},
    )


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_owner_admin_create_takeaway_without_session(quick_sale_context, role):
    response = client.post("/admin/quick-sales", headers=auth(quick_sale_context, role), json=payload(quick_sale_context))
    assert response.status_code == 201; assert response.json()["status"] == "pending"; assert response.json()["total"] == "160.00"
    db = SessionLocal(); assert db.query(DiningSession).filter(DiningSession.restaurant_id == quick_sale_context["restaurant_id"]).count() == 0; db.close()


@pytest.mark.parametrize("role", ["staff", "kitchen"])
@pytest.mark.parametrize("sale_type", ["takeaway", "late_entry"])
def test_staff_kitchen_cannot_create(quick_sale_context, role, sale_type):
    assert client.post("/admin/quick-sales", headers=auth(quick_sale_context, role), json=payload(quick_sale_context, sale_type)).status_code == 403


def test_takeaway_reaches_kitchen_and_owner_confirms_ready_payment(quick_sale_context):
    sale = client.post("/admin/quick-sales", headers=auth(quick_sale_context, "owner"), json=payload(quick_sale_context)).json()
    kitchen = client.get(f"/kitchen/restaurants/{quick_sale_context['slug']}/orders", headers=auth(quick_sale_context, "kitchen"))
    assert any(item["order_number"] == sale["order_number"] and item["table_number"] == "Takeaway" for item in kitchen.json())
    for state in ("accepted", "preparing", "ready"):
        assert client.patch(f"/kitchen/restaurants/{quick_sale_context['slug']}/orders/{sale['public_token']}/status", headers=auth(quick_sale_context, "kitchen"), json={"status": state}).status_code == 200
    assert client.post(f"/admin/quick-sales/{sale['public_token']}/payment", headers=auth(quick_sale_context, "staff"), json={"method": "cash"}).status_code == 403
    paid = client.post(f"/admin/quick-sales/{sale['public_token']}/payment", headers=auth(quick_sale_context, "owner"), json={"method": "cash"})
    assert paid.status_code == 200; assert paid.json()["status"] == "completed"; assert paid.json()["payment_method"] == "cash"; assert paid.json()["completed_at"] is not None
    assert client.post(f"/admin/quick-sales/{sale['public_token']}/payment", headers=auth(quick_sale_context, "owner"), json={"method": "cash"}).status_code == 409


@pytest.mark.parametrize(
    ("role", "method"),
    [("owner", "cash"), ("admin", "upi")],
)
def test_takeaway_ready_to_served_then_payment_completion(
    quick_sale_context, role, method
):
    sale = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=payload(quick_sale_context),
    ).json()
    for status in ("accepted", "preparing", "ready"):
        assert update_kitchen_status(
            quick_sale_context, sale["public_token"], status
        ).status_code == 200

    served = update_kitchen_status(
        quick_sale_context, sale["public_token"], "served"
    )
    assert served.status_code == 200
    assert served.json()["status"] == "served"

    db = SessionLocal()
    persisted = db.query(QuickSale).filter(
        QuickSale.public_token == sale["public_token"]
    ).one()
    assert persisted.status == "served"
    assert persisted.payment_method is None
    assert persisted.paid_by_staff_id is None
    assert persisted.paid_by_name is None
    assert persisted.paid_by_role is None
    assert persisted.completed_at is None
    db.close()

    home_before_payment = client.get(
        "/admin/quick-sales", headers=auth(quick_sale_context, role)
    ).json()
    assert any(
        item["public_token"] == sale["public_token"]
        for item in home_before_payment["active_takeaways"]
    )
    assert all(
        item["public_token"] != sale["public_token"]
        for item in home_before_payment["completed_today"]
    )

    cross_restaurant_payment = client.post(
        f"/admin/quick-sales/{sale['public_token']}/payment",
        headers=auth(quick_sale_context, "other"),
        json={"method": method},
    )
    assert cross_restaurant_payment.status_code == 404

    repeated = update_kitchen_status(
        quick_sale_context, sale["public_token"], "served"
    )
    assert repeated.status_code == 409

    paid = client.post(
        f"/admin/quick-sales/{sale['public_token']}/payment",
        headers=auth(quick_sale_context, role),
        json={"method": method},
    )
    assert paid.status_code == 200
    assert paid.json()["status"] == "completed"
    assert paid.json()["payment_method"] == method
    assert paid.json()["completed_at"] is not None

    db = SessionLocal()
    completed = db.query(QuickSale).filter(
        QuickSale.public_token == sale["public_token"]
    ).one()
    assert completed.status == "completed"
    assert completed.payment_method == method
    assert completed.paid_by_staff_id is not None
    assert completed.paid_by_name is not None
    assert completed.paid_by_role == role
    assert completed.completed_at is not None
    db.close()

    home_after_payment = client.get(
        "/admin/quick-sales", headers=auth(quick_sale_context, role)
    ).json()
    assert all(
        item["public_token"] != sale["public_token"]
        for item in home_after_payment["active_takeaways"]
    )
    assert any(
        item["public_token"] == sale["public_token"]
        and item["payment_method"] == method
        and item["completed_at"] is not None
        for item in home_after_payment["completed_today"]
    )


@pytest.mark.parametrize("starting_status", ["pending", "accepted", "preparing"])
def test_takeaway_cannot_skip_to_served(quick_sale_context, starting_status):
    sale = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=payload(quick_sale_context),
    ).json()
    transitions = {
        "pending": (),
        "accepted": ("accepted",),
        "preparing": ("accepted", "preparing"),
    }
    for status in transitions[starting_status]:
        assert update_kitchen_status(
            quick_sale_context, sale["public_token"], status
        ).status_code == 200

    response = update_kitchen_status(
        quick_sale_context, sale["public_token"], "served"
    )
    assert response.status_code == 409


def test_cross_restaurant_cannot_serve_takeaway(quick_sale_context):
    sale = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=payload(quick_sale_context),
    ).json()
    response = update_kitchen_status(
        quick_sale_context, sale["public_token"], "served", role="other"
    )
    assert response.status_code == 403


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_late_entry_is_paid_and_never_reaches_kitchen(quick_sale_context, role):
    sale = client.post("/admin/quick-sales", headers=auth(quick_sale_context, role), json=payload(quick_sale_context, "late_entry")).json()
    assert sale["status"] == "completed"; assert sale["reason"] == "Unrecorded verbal order"
    kitchen = client.get(f"/kitchen/restaurants/{quick_sale_context['slug']}/orders", headers=auth(quick_sale_context, "kitchen")).json()
    assert all(item["order_number"] != sale["order_number"] for item in kitchen)


def test_duplicate_creation_and_restaurant_isolation(quick_sale_context):
    body = payload(quick_sale_context, key=uuid.uuid4().hex)
    first = client.post("/admin/quick-sales", headers=auth(quick_sale_context, "owner"), json=body)
    second = client.post("/admin/quick-sales", headers=auth(quick_sale_context, "owner"), json=body)
    assert first.json()["id"] == second.json()["id"]
    assert client.post(f"/admin/quick-sales/{first.json()['public_token']}/payment", headers=auth(quick_sale_context, "other"), json={"method": "cash"}).status_code == 404


def test_quick_sale_home_exposes_configurable_menu_options(quick_sale_context):
    home = client.get(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
    ).json()
    mandi = next(item for item in home["menu_items"] if item["id"] == quick_sale_context["configurable_id"])
    assert mandi["has_options"] is True
    assert {group["name"] for group in mandi["option_groups"]} == {"Serving type", "Extras"}


@pytest.mark.parametrize("sale_type", ["takeaway", "late_entry"])
def test_configured_quick_sale_authoritative_price_and_snapshots(quick_sale_context, sale_type):
    response = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=configured_payload(quick_sale_context, sale_type, quantity=2),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["total"] == "860.00"
    assert body["items"][0]["base_price"] == "200.00"
    assert body["items"][0]["unit_price"] == "430.00"
    assert body["items"][0]["total_price"] == "860.00"
    assert {option["option_name"] for option in body["items"][0]["selected_options"]} == {"Half", "Extra mayonnaise"}
    assert body["status"] == ("pending" if sale_type == "takeaway" else "completed")

    if sale_type == "takeaway":
        kitchen = client.get(
            f"/kitchen/restaurants/{quick_sale_context['slug']}/orders",
            headers=auth(quick_sale_context, "kitchen"),
        ).json()
        ticket = next(item for item in kitchen if item["public_token"] == body["public_token"])
        assert {option["option_name"] for option in ticket["items"][0]["selected_options"]} == {"Half", "Extra mayonnaise"}


def test_multiple_option_groups_and_optional_addons(quick_sale_context):
    options = [
        {"group_id": quick_sale_context["size_group_id"], "option_id": quick_sale_context["quarter_id"], "quantity": 1},
        {"group_id": quick_sale_context["extras_group_id"], "option_id": quick_sale_context["mayo_id"], "quantity": 1},
        {"group_id": quick_sale_context["extras_group_id"], "option_id": quick_sale_context["spicy_id"], "quantity": 1},
    ]
    response = client.post("/admin/quick-sales", headers=auth(quick_sale_context, "admin"), json=configured_payload(quick_sale_context, options=options))
    assert response.status_code == 201
    assert response.json()["total"] == "270.00"
    assert len(response.json()["items"][0]["selected_options"]) == 3


def test_missing_required_unavailable_and_cross_restaurant_options_rejected(quick_sale_context):
    missing = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=configured_payload(quick_sale_context, options=[]),
    )
    cross = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=configured_payload(quick_sale_context, options=[{
            "group_id": quick_sale_context["other_group_id"],
            "option_id": quick_sale_context["other_option_id"],
            "quantity": 1,
        }]),
    )
    db = SessionLocal()
    db.query(MenuOption).filter(MenuOption.id == quick_sale_context["half_id"]).update({"available": False})
    db.commit()
    db.close()
    unavailable = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=configured_payload(quick_sale_context),
    )
    assert missing.status_code == 400
    assert "requires" in missing.json()["detail"]
    assert cross.status_code == 400
    assert "does not belong" in cross.json()["detail"]
    assert unavailable.status_code == 400
    assert "unavailable" in unavailable.json()["detail"].lower()


def test_two_configurations_remain_separate_and_idempotent(quick_sale_context):
    key = uuid.uuid4().hex
    body = configured_payload(quick_sale_context, key=key)
    body["items"].append({
        "menu_item_id": quick_sale_context["configurable_id"],
        "quantity": 1,
        "selected_options": [{"group_id": quick_sale_context["size_group_id"], "option_id": quick_sale_context["quarter_id"], "quantity": 1}],
    })
    first = client.post("/admin/quick-sales", headers=auth(quick_sale_context, "owner"), json=body)
    retry = client.post("/admin/quick-sales", headers=auth(quick_sale_context, "owner"), json=body)
    assert first.status_code == 201
    assert retry.status_code == 201
    assert first.json()["id"] == retry.json()["id"]
    assert len(first.json()["items"]) == 2
    assert {item["unit_price"] for item in first.json()["items"]} == {"430.00", "240.00"}


def test_snapshots_survive_menu_option_edits(quick_sale_context):
    sale = client.post(
        "/admin/quick-sales",
        headers=auth(quick_sale_context, "owner"),
        json=configured_payload(quick_sale_context),
    ).json()
    db = SessionLocal()
    option = db.query(MenuOption).filter(MenuOption.id == quick_sale_context["half_id"]).one()
    option.name = "Family"
    option.price_delta = Decimal("700.00")
    db.commit()
    persisted = db.query(QuickSale).filter(QuickSale.id == sale["id"]).one()
    line = db.query(QuickSaleItem).filter(QuickSaleItem.quick_sale_id == persisted.id).one()
    snapshots = db.query(QuickSaleItemSelectedOption).filter(QuickSaleItemSelectedOption.quick_sale_item_id == line.id).all()
    assert line.unit_price == Decimal("430.00")
    half_snapshot = next(option for option in snapshots if option.option_type == "variant")
    assert half_snapshot.option_name == "Half"
    assert half_snapshot.price_delta == Decimal("400.00")
    db.close()
