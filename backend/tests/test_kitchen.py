import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderStatusHistory
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password, create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_kitchen_test_data():
    db = SessionLocal()
    # Clean up test restaurant if exists
    db.query(Restaurant).filter(Restaurant.slug == "kitchen-test-slug").delete()
    db.query(Restaurant).filter(Restaurant.slug == "kitchen-other-slug").delete()
    db.commit()

    # Create active restaurant
    restaurant = Restaurant(name="Kitchen Test Cafe", slug="kitchen-test-slug", is_active=True)
    db.add(restaurant)
    
    other_restaurant = Restaurant(name="Kitchen Other Cafe", slug="kitchen-other-slug", is_active=True)
    db.add(other_restaurant)
    db.flush()

    # Create tables
    table = RestaurantTable(restaurant_id=restaurant.id, table_number="K1", table_code="K1-CODE", is_active=True)
    other_table = RestaurantTable(restaurant_id=other_restaurant.id, table_number="O1", table_code="O1-CODE", is_active=True)
    db.add_all([table, other_table])
    db.flush()

    # Create category
    category = MenuCategory(restaurant_id=restaurant.id, name_en="Category K", display_order=1, is_active=True)
    db.add(category)
    db.flush()

    # Create item
    item = MenuItem(restaurant_id=restaurant.id, category_id=category.id, name_en="Item K", price=100.00, is_available=True)
    db.add(item)
    db.flush()

    # Create staff user for test restaurant
    staff = StaffUser(
        restaurant_id=restaurant.id,
        name="Kitchen Staff",
        email="kitchen@test.local",
        password_hash=hash_password("kitchen123"),
        role="kitchen",
        is_active=True
    )
    db.add(staff)
    db.flush()

    token = create_access_token(
        data={"sub": str(staff.id), "restaurant_id": restaurant.id, "role": "kitchen"}
    )

    # Create some test orders
    # Order 1: Pending (test-slug)
    order_pending = Order(
        restaurant_id=restaurant.id,
        table_id=table.id,
        order_number="NS-K-PENDING",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=100.00,
        idempotency_key="idem-k-1"
    )
    # Order 2: Accepted (test-slug)
    order_accepted = Order(
        restaurant_id=restaurant.id,
        table_id=table.id,
        order_number="NS-K-ACCEPTED",
        public_token=uuid.uuid4().hex,
        status="accepted",
        subtotal=100.00,
        idempotency_key="idem-k-2"
    )
    # Order 3: Other Restaurant
    order_other = Order(
        restaurant_id=other_restaurant.id,
        table_id=other_table.id,
        order_number="NS-K-OTHER",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=100.00,
        idempotency_key="idem-k-3"
    )
    db.add_all([order_pending, order_accepted, order_other])
    db.flush()

    # Create historical status rows
    h1 = OrderStatusHistory(order_id=order_pending.id, old_status=None, new_status="pending")
    h2 = OrderStatusHistory(order_id=order_accepted.id, old_status=None, new_status="pending")
    h3 = OrderStatusHistory(order_id=order_accepted.id, old_status="pending", new_status="accepted")
    h4 = OrderStatusHistory(order_id=order_other.id, old_status=None, new_status="pending")
    db.add_all([h1, h2, h3, h4])
    db.commit()

    data = {
        "restaurant_slug": restaurant.slug,
        "other_restaurant_slug": other_restaurant.slug,
        "pending_token": order_pending.public_token,
        "accepted_token": order_accepted.public_token,
        "other_token": order_other.public_token,
        "pending_order_id": order_pending.id,
        "token": token,
    }
    
    yield data

    # Cleanup
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, other_restaurant.id])).delete()
    db.commit()
    db.close()


def test_missing_token(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    response = client.get(f"/kitchen/restaurants/{data['restaurant_slug']}/orders")
    assert response.status_code == 401


def test_invalid_token(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": "Bearer invalid-token"}
    )
    assert response.status_code == 401


def test_valid_kitchen_order_list(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {data['token']}"}
    )
    assert response.status_code == 200
    orders = response.json()
    assert len(orders) == 2
    statuses = {o["status"] for o in orders}
    assert "pending" in statuses
    assert "accepted" in statuses
    assert orders[0]["table_number"] == "K1"


def test_restaurant_isolation(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    # Query test-slug orders
    res1 = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {data['token']}"}
    )
    tokens = {o["public_token"] for o in res1.json()}
    assert data["other_token"] not in tokens

    # Attempt to update other-slug order under test-slug endpoint -> should return 404 (because we restrict scope inside database query by restaurant ID first!)
    res2 = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{data['other_token']}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "accepted"}
    )
    assert res2.status_code == 404


def test_invalid_status_filter(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {data['token']}"},
        params={"status": "invalid-status"}
    )
    assert response.status_code == 400


def test_complete_valid_transitions_chain(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    db = SessionLocal()
    
    # Create a fresh order for sequence tests
    order = Order(
        restaurant_id=db.query(Restaurant).filter(Restaurant.slug == data["restaurant_slug"]).first().id,
        table_id=db.query(RestaurantTable).filter(RestaurantTable.table_code == "K1-CODE").first().id,
        order_number="NS-K-CHAIN",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=100.00,
        idempotency_key="idem-k-chain"
    )
    db.add(order)
    db.flush()
    db.add(OrderStatusHistory(order_id=order.id, old_status=None, new_status="pending"))
    db.commit()
    token = order.public_token
    db.close()

    # 1. pending -> accepted
    res_accepted = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{token}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "accepted"}
    )
    assert res_accepted.status_code == 200
    assert res_accepted.json()["status"] == "accepted"

    # 2. accepted -> preparing
    res_preparing = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{token}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "preparing"}
    )
    assert res_preparing.status_code == 200
    assert res_preparing.json()["status"] == "preparing"

    # 3. preparing -> ready
    res_ready = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{token}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "ready"}
      )
    assert res_ready.status_code == 200
    assert res_ready.json()["status"] == "ready"

    # 4. ready -> served
    res_served = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{token}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "served"}
    )
    assert res_served.status_code == 200
    assert res_served.json()["status"] == "served"


def test_alternative_transitions(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    db = SessionLocal()
    
    # Order for reject test
    order_rej = Order(
        restaurant_id=db.query(Restaurant).filter(Restaurant.slug == data["restaurant_slug"]).first().id,
        table_id=db.query(RestaurantTable).filter(RestaurantTable.table_code == "K1-CODE").first().id,
        order_number="NS-K-REJ",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=100.00,
        idempotency_key="idem-k-rej"
    )
    db.add(order_rej)
    db.flush()
    db.add(OrderStatusHistory(order_id=order_rej.id, old_status=None, new_status="pending"))
    db.commit()
    token = order_rej.public_token
    db.close()

    # pending -> rejected
    res_rejected = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{token}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "rejected"}
    )
    assert res_rejected.status_code == 200
    assert res_rejected.json()["status"] == "rejected"


def test_invalid_transitions_fail(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    
    # 1. pending -> ready (must fail with 409)
    res1 = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{data['pending_token']}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "ready"}
    )
    assert res1.status_code == 409

    # 2. accepted -> served (must fail with 409)
    res2 = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{data['accepted_token']}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "served"}
    )
    assert res2.status_code == 409


def test_history_unchanged_after_failed_transition(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    db = SessionLocal()
    
    # Read count before
    hist_before = db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == data["pending_order_id"]).count()

    # Attempt invalid pending -> ready transition
    res = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{data['pending_token']}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "ready"}
    )
    assert res.status_code == 409

    # Check count is same
    hist_after = db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == data["pending_order_id"]).count()
    assert hist_before == hist_after
    db.close()


def test_customer_tracking_reflects_kitchen_update(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    # Initially accepted
    track1 = client.get(f"/public/orders/{data['accepted_token']}")
    assert track1.json()["status"] == "accepted"

    # Move accepted -> preparing in kitchen
    res = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/{data['accepted_token']}/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "preparing"}
    )
    assert res.status_code == 200

    # Tracking endpoint shows update
    track2 = client.get(f"/public/orders/{data['accepted_token']}")
    assert track2.json()["status"] == "preparing"
    assert len(track2.json()["status_history"]) > 1


def test_unknown_order_returns_404(setup_kitchen_test_data):
    data = setup_kitchen_test_data
    response = client.patch(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders/non-existent-token/status",
        headers={"Authorization": f"Bearer {data['token']}"},
        json={"status": "accepted"}
    )
    assert response.status_code == 404
