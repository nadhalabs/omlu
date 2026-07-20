import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.quick_sale import QuickSale
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.utils.auth import create_access_token, hash_password

client = TestClient(app)


@pytest.fixture
def quick_sale_context():
    db = SessionLocal(); suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(name="Quick Sale Cafe", slug=f"quick-{suffix}", is_active=True, currency="INR")
    other = Restaurant(name="Other Cafe", slug=f"quick-other-{suffix}", is_active=True)
    db.add_all([restaurant, other]); db.flush()
    category = MenuCategory(restaurant_id=restaurant.id, name_en="Counter", is_active=True, display_order=0)
    db.add(category); db.flush()
    item = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Dosa", price=Decimal("80.00"), is_available=True)
    db.add(item); db.flush()
    users = {}
    for role in ("owner", "admin", "staff", "kitchen"):
        user = StaffUser(restaurant_id=restaurant.id, name=f"{role.title()} User", email=f"{role}-{suffix}@quick.local", password_hash=hash_password("Password123!"), role=role, status="active", is_active=True)
        db.add(user); db.flush(); users[role] = user
    other_owner = StaffUser(restaurant_id=other.id, name="Other Owner", email=f"other-{suffix}@quick.local", password_hash=hash_password("Password123!"), role="owner", status="active", is_active=True)
    db.add(other_owner); db.commit()
    data = {"restaurant_id": restaurant.id, "other_id": other.id, "slug": restaurant.slug, "item_id": item.id}
    for role, user in users.items(): data[f"{role}_token"] = create_access_token({"sub": str(user.id), "restaurant_id": restaurant.id, "role": role})
    data["other_token"] = create_access_token({"sub": str(other_owner.id), "restaurant_id": other.id, "role": "owner"})
    db.close(); yield data
    db = SessionLocal(); db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, other.id])).delete(); db.commit(); db.close()


def auth(ctx, role): return {"Authorization": f"Bearer {ctx[f'{role}_token']}"}
def payload(ctx, sale_type="takeaway", key=None):
    return {"sale_type": sale_type, "items": [{"menu_item_id": ctx["item_id"], "quantity": 2}], "note": "No onions", "payment_method": "cash" if sale_type == "late_entry" else None, "idempotency_key": key or uuid.uuid4().hex}


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
    paid = client.post(f"/admin/quick-sales/{sale['public_token']}/payment", headers=auth(quick_sale_context, "admin"), json={"method": "upi"})
    assert paid.status_code == 200; assert paid.json()["status"] == "completed"; assert paid.json()["payment_method"] == "upi"
    assert client.post(f"/admin/quick-sales/{sale['public_token']}/payment", headers=auth(quick_sale_context, "owner"), json={"method": "cash"}).status_code == 409


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
