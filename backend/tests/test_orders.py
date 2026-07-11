import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderStatusHistory, RestaurantDailySequence

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_test_data():
    db = SessionLocal()
    # Clean up test restaurant if exists
    db.query(Restaurant).filter(Restaurant.slug == "test-restaurant").delete()
    db.query(Restaurant).filter(Restaurant.slug == "other-restaurant").delete()
    db.commit()

    # Create active restaurant
    restaurant = Restaurant(name="Test Restaurant", slug="test-restaurant", is_active=True)
    db.add(restaurant)
    
    # Create inactive restaurant
    inactive_restaurant = Restaurant(name="Other Restaurant", slug="other-restaurant", is_active=False)
    db.add(inactive_restaurant)
    db.flush()

    # Create tables
    table_active = RestaurantTable(restaurant_id=restaurant.id, table_number="T1", table_code="T1-TEST", is_active=True)
    table_inactive = RestaurantTable(restaurant_id=restaurant.id, table_number="T2", table_code="T2-INACTIVE", is_active=False)
    table_other = RestaurantTable(restaurant_id=inactive_restaurant.id, table_number="T1", table_code="T1-OTHER", is_active=True)
    db.add_all([table_active, table_inactive, table_other])
    db.flush()

    # Create categories
    category = MenuCategory(restaurant_id=restaurant.id, name_en="Category 1", display_order=1, is_active=True)
    db.add(category)
    other_category = MenuCategory(restaurant_id=inactive_restaurant.id, name_en="Category Other", display_order=1, is_active=True)
    db.add(other_category)
    db.flush()

    # Create items
    item_available = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Item Available", price=100.00, is_available=True)
    item_unavailable = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Item Unavailable", price=50.00, is_available=False)
    item_other = MenuItem(restaurant_id=inactive_restaurant.id, category_id=other_category.id, name_en="Item Other", price=120.00, is_available=True)
    db.add_all([item_available, item_unavailable, item_other])
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "restaurant_slug": restaurant.slug,
        "inactive_restaurant_slug": inactive_restaurant.slug,
        "table_code": table_active.table_code,
        "inactive_table_code": table_inactive.table_code,
        "item_id": item_available.id,
        "unavailable_item_id": item_unavailable.id,
        "other_item_id": item_other.id,
    }
    
    yield data

    # Cleanup
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, inactive_restaurant.id])).delete()
    db.commit()
    db.close()


def test_valid_order_creation(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    payload = {
        "items": [
            {"menu_item_id": data["item_id"], "quantity": 2, "item_note": "Extra cheese"}
        ],
        "customer_note": "Fast please"
    }
    
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    
    assert response.status_code == 201
    res_data = response.json()
    assert "order_number" in res_data
    assert "public_token" in res_data
    assert res_data["status"] == "pending"
    assert res_data["subtotal"] == "200.00"  # 100.00 * 2
    assert res_data["table_number"] == "T1"
    assert len(res_data["items"]) == 1
    assert res_data["items"][0]["item_name"] == "Item Available"
    assert len(res_data["status_history"]) == 1
    assert res_data["status_history"][0]["new_status"] == "pending"


def test_duplicate_idempotency_request(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    payload = {
        "items": [{"menu_item_id": data["item_id"], "quantity": 1}],
        "customer_note": "First submit"
    }
    
    # First submit
    res1 = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert res1.status_code == 201
    order1 = res1.json()

    # Second submit (duplicate key)
    res2 = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert res2.status_code == 200 or res2.status_code == 201
    order2 = res2.json()
    
    assert order1["order_number"] == order2["order_number"]
    assert order1["public_token"] == order2["public_token"]


def test_item_from_another_restaurant(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    payload = {
        "items": [{"menu_item_id": data["other_item_id"], "quantity": 1}]
    }
    
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert response.status_code == 400
    assert "another restaurant" in response.json()["detail"].lower()


def test_unavailable_item(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    payload = {
        "items": [{"menu_item_id": data["unavailable_item_id"], "quantity": 1}]
    }
    
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert response.status_code == 400
    assert "unavailable" in response.json()["detail"].lower()


def test_inactive_table(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    payload = {
        "items": [{"menu_item_id": data["item_id"], "quantity": 1}]
    }
    
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['inactive_table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert response.status_code == 404
    assert "inactive" in response.json()["detail"].lower()


def test_empty_cart(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    payload = {
        "items": []
    }
    
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert response.status_code == 422


def test_merged_quantity_limit(setup_test_data):
    data = setup_test_data
    idempotency_key = f"idemp-{uuid.uuid4().hex}"
    
    # 2 line items of same item summing to 51
    payload = {
        "items": [
            {"menu_item_id": data["item_id"], "quantity": 30},
            {"menu_item_id": data["item_id"], "quantity": 21}
        ]
    }
    
    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": idempotency_key}
    )
    assert response.status_code == 400
    assert "quantity" in response.json()["detail"].lower()


def test_invalid_public_token():
    response = client.get("/public/orders/non-existent-token")
    assert response.status_code == 404
    assert "order not found" in response.json()["detail"].lower()


def test_public_order_rate_limiting(setup_test_data):
    data = setup_test_data
    payload = {
        "items": [{"menu_item_id": data["item_id"], "quantity": 1}]
    }

    for _ in range(15):
        response = client.post(
            f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
            json=payload,
            headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
        )
        assert response.status_code == 201

    response = client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{data['table_code']}/orders",
        json=payload,
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )
    assert response.status_code == 429
    assert "too many order submissions" in response.json()["detail"].lower()
