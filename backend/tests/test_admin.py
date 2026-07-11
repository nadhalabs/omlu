import datetime
import uuid
import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password, create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_admin_test_data():
    db = SessionLocal()
    # Clean up test restaurant
    db.query(Restaurant).filter(Restaurant.slug == "admin-test-slug").delete()
    db.query(Restaurant).filter(Restaurant.slug == "admin-other-slug").delete()
    db.commit()

    # Create active restaurants
    restaurant = Restaurant(name="Admin Test Restaurant", slug="admin-test-slug", is_active=True)
    db.add(restaurant)
    
    other_restaurant = Restaurant(name="Admin Other Restaurant", slug="admin-other-slug", is_active=True)
    db.add(other_restaurant)
    db.flush()

    # Create staff users for test restaurant
    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Owner",
        email="owner@admin.local",
        password_hash=hash_password("owner123"),
        role="owner",
        is_active=True
    )
    manager = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Manager",
        email="manager@admin.local",
        password_hash=hash_password("manager123"),
        role="manager",
        is_active=True
    )
    kitchen = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Kitchen",
        email="kitchen@admin.local",
        password_hash=hash_password("kitchen123"),
        role="kitchen",
        is_active=True
    )
    waiter = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Waiter",
        email="waiter@admin.local",
        password_hash=hash_password("waiter123"),
        role="waiter",
        is_active=True
    )

    # Create staff user for other restaurant
    other_owner = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Owner",
        email="other@admin.local",
        password_hash=hash_password("other123"),
        role="owner",
        is_active=True
    )

    db.add_all([owner, manager, kitchen, waiter, other_owner])
    db.flush()

    # Create tokens
    owner_token = create_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"})
    manager_token = create_access_token({"sub": str(manager.id), "restaurant_id": restaurant.id, "role": "manager"})
    kitchen_token = create_access_token({"sub": str(kitchen.id), "restaurant_id": restaurant.id, "role": "kitchen"})
    waiter_token = create_access_token({"sub": str(waiter.id), "restaurant_id": restaurant.id, "role": "waiter"})
    other_token = create_access_token({"sub": str(other_owner.id), "restaurant_id": other_restaurant.id, "role": "owner"})

    # Create tables
    table1 = RestaurantTable(restaurant_id=restaurant.id, table_number="1", table_code="T1-ADMIN", is_active=True)
    table_other = RestaurantTable(restaurant_id=other_restaurant.id, table_number="9", table_code="T9-ADMIN", is_active=True)
    db.add_all([table1, table_other])
    db.flush()

    # Create category and items
    cat1 = MenuCategory(restaurant_id=restaurant.id, name_en="Appetizers", display_order=1, is_active=True)
    cat_other = MenuCategory(restaurant_id=other_restaurant.id, name_en="Sides", display_order=1, is_active=True)
    db.add_all([cat1, cat_other])
    db.flush()

    item_no_history = MenuItem(
        restaurant_id=restaurant.id,
        category_id=cat1.id,
        name_en="Spring Rolls",
        price=Decimal("120.00"),
        is_available=True
    )
    item_with_history = MenuItem(
        restaurant_id=restaurant.id,
        category_id=cat1.id,
        name_en="Samosas",
        price=Decimal("90.00"),
        is_available=True
    )
    db.add_all([item_no_history, item_with_history])
    db.flush()

    # Create a historical order referencing Samosas
    order = Order(
        restaurant_id=restaurant.id,
        table_id=table1.id,
        order_number="NS-ADMIN-1",
        public_token=uuid.uuid4().hex,
        status="served",
        subtotal=Decimal("90.00"),
        idempotency_key="admin-test-idem-1"
    )
    db.add(order)
    db.flush()

    order_item = OrderItem(
        order_id=order.id,
        menu_item_id=item_with_history.id,
        item_name="Samosas",
        quantity=1,
        unit_price=Decimal("90.00"),
        total_price=Decimal("90.00")
    )
    db.add(order_item)
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "restaurant_slug": restaurant.slug,
        "other_restaurant_slug": other_restaurant.slug,
        "owner_token": owner_token,
        "manager_token": manager_token,
        "kitchen_token": kitchen_token,
        "waiter_token": waiter_token,
        "other_token": other_token,
        "table_id": table1.id,
        "table_code": table1.table_code,
        "other_table_id": table_other.id,
        "other_table_code": table_other.table_code,
        "category_id": cat1.id,
        "other_category_id": cat_other.id,
        "item_no_history_id": item_no_history.id,
        "item_with_history_id": item_with_history.id,
    }

    yield data

    # Cleanup
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, other_restaurant.id])).delete()
    db.commit()
    db.close()


# --- Role and Authentication Checks ---

def test_missing_authentication():
    response = client.get("/admin/categories")
    assert response.status_code == 401


def test_kitchen_and_waiter_denied(setup_admin_test_data):
    data = setup_admin_test_data
    # Test categories list denied
    res_k = client.get("/admin/categories", headers={"Authorization": f"Bearer {data['kitchen_token']}"})
    assert res_k.status_code == 403
    res_w = client.get("/admin/categories", headers={"Authorization": f"Bearer {data['waiter_token']}"})
    assert res_w.status_code == 403


def test_owner_and_manager_allowed(setup_admin_test_data):
    data = setup_admin_test_data
    res_o = client.get("/admin/categories", headers={"Authorization": f"Bearer {data['owner_token']}"})
    assert res_o.status_code == 200
    res_m = client.get("/admin/categories", headers={"Authorization": f"Bearer {data['manager_token']}"})
    assert res_m.status_code == 200


def test_another_restaurants_record_returns_404(setup_admin_test_data):
    data = setup_admin_test_data
    # Retrieve other restaurant's category
    res = client.patch(
        f"/admin/categories/{data['other_category_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"name_en": "Updated Hack"}
    )
    assert res.status_code == 404

    # Retrieve other restaurant's table
    res_table = client.patch(
        f"/admin/tables/{data['other_table_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"is_active": False}
    )
    assert res_table.status_code == 404


# --- Category Endpoints ---

def test_create_category(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "name_en": "Desserts",
        "name_ml": "മധുരപലഹാരങ്ങൾ",
        "display_order": 5,
        "is_active": True
    }
    response = client.post(
        "/admin/categories",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 201
    res_data = response.json()
    assert res_data["name_en"] == "Desserts"
    assert res_data["name_ml"] == "മധുരപലഹാരങ്ങൾ"
    assert res_data["display_order"] == 5
    assert res_data["item_count"] == 0


def test_update_category(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "name_en": "Hot Starters",
        "display_order": 2
    }
    response = client.patch(
        f"/admin/categories/{data['category_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 200
    assert response.json()["name_en"] == "Hot Starters"
    assert response.json()["display_order"] == 2


def test_delete_category_blocked_when_items_exist(setup_admin_test_data):
    data = setup_admin_test_data
    # Delete category which contains Spring Rolls and Samosas
    response = client.delete(
        f"/admin/categories/{data['category_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert response.status_code == 409
    assert "contains menu items" in response.json()["detail"]


# --- Menu Item Endpoints ---

def test_create_menu_item(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "category_id": data["category_id"],
        "name_en": "French Fries",
        "price": 100.00,
        "is_available": True,
        "display_order": 1
    }
    response = client.post(
        "/admin/menu-items",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 201
    assert response.json()["name_en"] == "French Fries"
    assert response.json()["price"] == "100.00"  # Hashed/Stringified with 2 decimal places


def test_invalid_category_rejected(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "category_id": 99999,  # Non existent category
        "name_en": "Ghost Dish",
        "price": 10.00
    }
    response = client.post(
        "/admin/menu-items",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 400


def test_cross_restaurant_category_rejected(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "category_id": data["other_category_id"],  # Belongs to other restaurant
        "name_en": "Steal Dish",
        "price": 50.00
    }
    response = client.post(
        "/admin/menu-items",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 400


def test_unsafe_image_url_rejected(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "category_id": data["category_id"],
        "name_en": "Safe Dish",
        "price": 50.00,
        "image_url": "javascript:alert(1)"  # Unsafe scheme
    }
    response = client.post(
        "/admin/menu-items",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 422  # validation error


def test_negative_price_rejected(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "category_id": data["category_id"],
        "name_en": "Negative Dish",
        "price": -10.00  # Negative price
    }
    response = client.post(
        "/admin/menu-items",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 422


def test_update_menu_item(setup_admin_test_data):
    data = setup_admin_test_data
    payload = {
        "price": 130.50,
        "display_order": 9
    }
    response = client.patch(
        f"/admin/menu-items/{data['item_no_history_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json=payload
    )
    assert response.status_code == 200
    assert response.json()["price"] == "130.50"
    assert response.json()["display_order"] == 9


def test_availability_toggle(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.patch(
        f"/admin/menu-items/{data['item_no_history_id']}/availability",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"is_available": False}
    )
    assert response.status_code == 200
    assert response.json()["is_available"] is False


def test_item_with_no_history_can_be_deleted(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.delete(
        f"/admin/menu-items/{data['item_no_history_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert response.status_code == 204


def test_item_with_history_cannot_be_deleted(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.delete(
        f"/admin/menu-items/{data['item_with_history_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert response.status_code == 409
    assert "has order history" in response.json()["detail"]


# --- Table Endpoints ---

def test_create_table(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.post(
        "/admin/tables",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"table_number": "6"}
    )
    assert response.status_code == 201
    assert response.json()["table_number"] == "6"
    assert response.json()["table_code"].startswith("T6-")


def test_blank_table_number_rejected(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.post(
        "/admin/tables",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"table_number": "   "}
    )
    assert response.status_code == 422


def test_regenerating_code_twice_creates_distinct_codes(setup_admin_test_data):
    data = setup_admin_test_data
    # 1st regeneration
    res1 = client.post(
        f"/admin/tables/{data['table_id']}/regenerate-code",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert res1.status_code == 200
    code1 = res1.json()["table_code"]

    # 2nd regeneration
    res2 = client.post(
        f"/admin/tables/{data['table_id']}/regenerate-code",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert res2.status_code == 200
    code2 = res2.json()["table_code"]

    assert code1 != code2


def test_old_table_code_becomes_invalid(setup_admin_test_data):
    data = setup_admin_test_data
    # Attempt to query public menu with the original code (before regeneration in previous test)
    # The original table code was data["table_code"]
    response = client.get(f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/menu")
    assert response.status_code == 404


def test_inactive_table_cannot_order(setup_admin_test_data):
    data = setup_admin_test_data
    db = SessionLocal()
    # Create an inactive table mapping
    table = RestaurantTable(
        restaurant_id=data["restaurant_id"],
        table_number="99",
        table_code="T99-INACTIVE",
        is_active=False
    )
    db.add(table)
    db.commit()
    db.close()

    # Customer tries to order on inactive table
    payload = {
        "items": [{"menu_item_id": data["item_with_history_id"], "quantity": 1, "item_note": None}],
        "customer_note": None
    }
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/T99-INACTIVE/orders",
        headers={"Idempotency-Key": "test-inactive-table-idem"},
        json=payload
    )
    assert response.status_code == 404
    assert "table is inactive" in response.json()["detail"].lower()


# --- Table QR Endpoints ---

def test_qr_endpoint_returns_png(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.get(
        f"/admin/tables/{data['table_id']}/qr",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "image/png"
    assert "Content-Disposition" in response.headers
    assert f"table-" in response.headers["Content-Disposition"]


def test_qr_endpoint_for_another_restaurant_returns_404(setup_admin_test_data):
    data = setup_admin_test_data
    response = client.get(
        f"/admin/tables/{data['other_table_id']}/qr",
        headers={"Authorization": f"Bearer {data['owner_token']}"}
    )
    assert response.status_code == 404


# --- Public Menu Updates reflect instantly ---

def test_category_deactivation_disappears_without_altering_item_avail(setup_admin_test_data):
    data = setup_admin_test_data
    db = SessionLocal()
    # Ensure item Samosas is available
    item = db.query(MenuItem).filter(MenuItem.id == data["item_with_history_id"]).first()
    item.is_available = True
    db.commit()

    # Get active table code
    table = db.query(RestaurantTable).filter(RestaurantTable.id == data["table_id"]).first()
    active_code = table.table_code
    db.close()

    # Confirm appetizers are in public menu
    res1 = client.get(f"/public/restaurants/{data['restaurant_slug']}/tables/{active_code}/menu")
    assert res1.status_code == 200
    categories = res1.json()["categories"]
    assert any(c["name_en"] == "Hot Starters" for c in categories)

    # Deactivate the category Appetizers
    res_deact = client.patch(
        f"/admin/categories/{data['category_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"is_active": False}
    )
    assert res_deact.status_code == 200

    # Public menu should hide Appetizers category
    res2 = client.get(f"/public/restaurants/{data['restaurant_slug']}/tables/{active_code}/menu")
    assert res2.status_code == 200
    categories2 = res2.json()["categories"]
    assert not any(c["name_en"] == "Hot Starters" for c in categories2)

    # Item availability must remain true in DB
    db = SessionLocal()
    item = db.query(MenuItem).filter(MenuItem.id == data["item_with_history_id"]).first()
    assert item.is_available is True

    # Reactivate category Appetizers
    res_react = client.patch(
        f"/admin/categories/{data['category_id']}",
        headers={"Authorization": f"Bearer {data['owner_token']}"},
        json={"is_active": True}
    )
    assert res_react.status_code == 200

    # Appetizers category and samosas restore in public menu
    res3 = client.get(f"/public/restaurants/{data['restaurant_slug']}/tables/{active_code}/menu")
    assert res3.status_code == 200
    categories3 = res3.json()["categories"]
    assert any(c["name_en"] == "Hot Starters" for c in categories3)
    db.close()
