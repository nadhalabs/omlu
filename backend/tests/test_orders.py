import datetime
import uuid
import pytest
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.dining_session import DiningSession
from app.models.bill import Bill
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderStatusHistory, RestaurantDailySequence
from app.models.service_request import ServiceRequest

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
    table_second = RestaurantTable(restaurant_id=restaurant.id, table_number="T3", table_code="T3-TEST", is_active=True)
    table_inactive = RestaurantTable(restaurant_id=restaurant.id, table_number="T2", table_code="T2-INACTIVE", is_active=False)
    table_other = RestaurantTable(restaurant_id=inactive_restaurant.id, table_number="T1", table_code="T1-OTHER", is_active=True)
    db.add_all([table_active, table_second, table_inactive, table_other])
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
        "second_table_code": table_second.table_code,
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
    assert res_data["dining_session_token"]
    assert res_data["session_subtotal"] == "200.00"
    assert res_data["session_order_count"] >= 1
    assert res_data["can_order_more"] is True


def create_order_payload(item_id, quantity=1):
    return {"items": [{"menu_item_id": item_id, "quantity": quantity}]}


def post_table_order(data, table_code=None, item_id=None, idempotency_key=None, quantity=1):
    return client.post(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{table_code or data['table_code']}/orders",
        json=create_order_payload(item_id or data["item_id"], quantity),
        headers={"Idempotency-Key": idempotency_key or f"idemp-{uuid.uuid4().hex}"}
    )


def create_test_table(data, table_number="S"):
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.slug == data["restaurant_slug"]).one()
    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number=table_number,
        table_code=f"{table_number}-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(table)
    db.commit()
    table_code = table.table_code
    db.close()
    return table_code


def test_first_order_creates_session(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "S1")

    response = post_table_order(data, table_code=table_code)

    assert response.status_code == 201
    body = response.json()
    assert body["dining_session_token"]
    session_response = client.get(f"/public/sessions/{body['dining_session_token']}")
    assert session_response.status_code == 200
    session_body = session_response.json()
    assert session_body["order_count"] == 1
    assert session_body["combined_subtotal"] == "100.00"
    assert session_body["bill"] is None
    assert session_body["service_requests"] == []


def test_rescanning_qr_restores_active_session_orders(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "RS1")
    first = post_table_order(data, table_code=table_code, quantity=1).json()
    client.post(
        f"/public/sessions/{first['dining_session_token']}/orders",
        json=create_order_payload(data["item_id"], 2),
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )

    response = client.get(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{table_code}/session"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["public_token"] == first["dining_session_token"]
    assert body["order_count"] == 2
    assert [order["status"] for order in body["orders"]] == ["pending", "pending"]
    assert body["combined_subtotal"] == "300.00"


def test_active_session_lookup_is_table_scoped(setup_test_data):
    data = setup_test_data
    first_table = create_test_table(data, "RS2A")
    second_table = create_test_table(data, "RS2B")
    first = post_table_order(data, table_code=first_table).json()
    second = post_table_order(data, table_code=second_table).json()

    response = client.get(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{second_table}/session"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["public_token"] == second["dining_session_token"]
    assert body["public_token"] != first["dining_session_token"]
    assert body["table_code"] == second_table


def test_closed_session_no_longer_restores_as_active(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "RS3")
    first = post_table_order(data, table_code=table_code).json()
    db = SessionLocal()
    session = db.query(DiningSession).filter(
        DiningSession.public_token == first["dining_session_token"]
    ).one()
    session.status = "closed"
    db.commit()
    db.close()

    response = client.get(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{table_code}/session"
    )

    assert response.status_code == 404
    assert "no active" in response.json()["detail"].lower()


def test_public_session_includes_public_bill_and_request_state(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "RS4")
    first = post_table_order(data, table_code=table_code, quantity=2).json()

    db = SessionLocal()
    session = db.query(DiningSession).filter(
        DiningSession.public_token == first["dining_session_token"]
    ).one()
    bill = Bill(
        restaurant_id=session.restaurant_id,
        dining_session_id=session.id,
        bill_number=f"BILL-RS4-{uuid.uuid4().hex[:8]}",
        status="issued",
        subtotal=200.00,
        tax_amount=0.00,
        discount_amount=0.00,
        total_amount=200.00,
        currency="INR",
    )
    request = ServiceRequest(
        restaurant_id=session.restaurant_id,
        table_id=session.table_id,
        dining_session_id=session.id,
        request_type="water",
        status="pending",
    )
    db.add_all([bill, request])
    db.commit()
    db.close()

    response = client.get(f"/public/sessions/{first['dining_session_token']}")

    assert response.status_code == 200
    body = response.json()
    assert body["bill"]["bill_number"].startswith("BILL-RS4-")
    assert body["bill"]["status"] == "issued"
    assert body["bill"]["total_amount"] == "200.00"
    assert body["service_requests"] == [
        {
            "request_type": "water",
            "status": "pending",
            "created_at": body["service_requests"][0]["created_at"],
            "resolved_at": None,
        }
    ]


def test_active_session_recovery_reflects_missed_database_changes(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "RS5")
    first = post_table_order(data, table_code=table_code, quantity=1).json()

    db = SessionLocal()
    session = db.query(DiningSession).filter(
        DiningSession.public_token == first["dining_session_token"]
    ).one()
    order = db.query(Order).filter(Order.dining_session_id == session.id).one()
    order.status = "ready"
    db.add(OrderStatusHistory(order_id=order.id, old_status="pending", new_status="ready"))
    bill = Bill(
        restaurant_id=session.restaurant_id,
        dining_session_id=session.id,
        bill_number=f"BILL-RS5-{uuid.uuid4().hex[:8]}",
        status="payment_pending",
        subtotal=100.00,
        tax_amount=0.00,
        discount_amount=0.00,
        total_amount=100.00,
        currency="INR",
        payment_method="counter_cash",
    )
    request = ServiceRequest(
        restaurant_id=session.restaurant_id,
        table_id=session.table_id,
        dining_session_id=session.id,
        request_type="waiter",
        status="resolved",
        resolved_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add_all([bill, request])
    db.commit()
    db.close()

    response = client.get(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{table_code}/session"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["public_token"] == first["dining_session_token"]
    assert body["orders"][0]["status"] == "ready"
    assert body["bill"]["status"] == "payment_pending"
    assert body["bill"]["payment_method"] == "counter_cash"
    assert body["service_requests"][0]["status"] == "resolved"


def test_old_session_token_does_not_follow_new_table_session(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "RS6")
    first = post_table_order(data, table_code=table_code).json()

    db = SessionLocal()
    old_session = db.query(DiningSession).filter(
        DiningSession.public_token == first["dining_session_token"]
    ).one()
    old_session.status = "closed"
    old_session.closed_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.close()

    second = post_table_order(data, table_code=table_code).json()

    old_response = client.get(f"/public/sessions/{first['dining_session_token']}")
    active_response = client.get(
        f"/public/restaurants/{data['restaurant_slug']}/tables/{table_code}/session"
    )

    assert old_response.status_code == 200
    assert active_response.status_code == 200
    old_body = old_response.json()
    active_body = active_response.json()
    assert old_body["public_token"] == first["dining_session_token"]
    assert old_body["status"] == "closed"
    assert old_body["order_count"] == 1
    assert active_body["public_token"] == second["dining_session_token"]
    assert active_body["public_token"] != first["dining_session_token"]


def test_second_order_joins_same_session_and_combines_subtotal(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "S2")
    first = post_table_order(data, table_code=table_code, quantity=1).json()
    second = client.post(
        f"/public/sessions/{first['dining_session_token']}/orders",
        json=create_order_payload(data["item_id"], 2),
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )

    assert second.status_code == 201
    session_body = second.json()
    assert session_body["public_token"] == first["dining_session_token"]
    assert session_body["order_count"] == 2
    assert session_body["combined_subtotal"] == "300.00"
    assert [order["subtotal"] for order in session_body["orders"]] == ["100.00", "200.00"]


def test_another_table_gets_another_session(setup_test_data):
    data = setup_test_data
    first = post_table_order(data, table_code=create_test_table(data, "S3A")).json()
    second = post_table_order(data, table_code=create_test_table(data, "S3B")).json()

    assert first["dining_session_token"] != second["dining_session_token"]


def test_idempotent_retry_does_not_create_another_order_or_session(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "S4")
    key = f"idemp-{uuid.uuid4().hex}"
    first = post_table_order(data, table_code=table_code, idempotency_key=key).json()
    second = post_table_order(data, table_code=table_code, idempotency_key=key).json()

    assert second["public_token"] == first["public_token"]
    assert second["dining_session_token"] == first["dining_session_token"]

    session_response = client.get(f"/public/sessions/{first['dining_session_token']}")
    assert session_response.status_code == 200
    session_body = session_response.json()
    assert session_body["order_count"] == 1
    assert session_body["combined_subtotal"] == "100.00"


@pytest.mark.parametrize("locked_status", ["closed", "payment_requested"])
def test_locked_session_rejects_new_orders(setup_test_data, locked_status):
    data = setup_test_data
    table_code = create_test_table(data, f"S5-{locked_status[:3]}")
    first = post_table_order(data, table_code=table_code).json()
    db = SessionLocal()
    session = db.query(DiningSession).filter(
        DiningSession.public_token == first["dining_session_token"]
    ).one()
    session.status = locked_status
    db.commit()
    db.close()

    response = client.post(
        f"/public/sessions/{first['dining_session_token']}/orders",
        json=create_order_payload(data["item_id"]),
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )

    assert response.status_code == 409
    assert "ordering is locked" in response.json()["detail"].lower()


def test_order_tracking_returns_session_information(setup_test_data):
    data = setup_test_data
    table_code = create_test_table(data, "S6")
    first = post_table_order(data, table_code=table_code, quantity=1).json()
    client.post(
        f"/public/sessions/{first['dining_session_token']}/orders",
        json=create_order_payload(data["item_id"], 2),
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )

    response = client.get(f"/public/orders/{first['public_token']}")

    assert response.status_code == 200
    body = response.json()
    assert body["dining_session_token"] == first["dining_session_token"]
    assert body["session_subtotal"] == "300.00"
    assert body["session_order_count"] == 2
    assert body["can_order_more"] is True


def test_historical_null_session_order_remains_readable(setup_test_data):
    data = setup_test_data
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.slug == data["restaurant_slug"]).one()
    table = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant.id,
        RestaurantTable.table_code == data["table_code"]
    ).one()
    order = Order(
        restaurant_id=restaurant.id,
        table_id=table.id,
        order_number=f"NS-HIST-{uuid.uuid4().hex[:8]}",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=100.00,
        idempotency_key=f"hist-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    db.add(OrderStatusHistory(order_id=order.id, old_status=None, new_status="pending"))
    token = order.public_token
    db.commit()
    db.close()

    response = client.get(f"/public/orders/{token}")

    assert response.status_code == 200
    body = response.json()
    assert body["dining_session_token"] is None
    assert body["session_subtotal"] is None
    assert body["session_order_count"] is None


def test_session_order_item_from_another_restaurant_rejected(setup_test_data):
    data = setup_test_data
    first = post_table_order(data, table_code=create_test_table(data, "S8")).json()

    response = client.post(
        f"/public/sessions/{first['dining_session_token']}/orders",
        json=create_order_payload(data["other_item_id"]),
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )

    assert response.status_code == 400
    assert "another restaurant" in response.json()["detail"].lower()


def test_session_order_unavailable_item_rejected(setup_test_data):
    data = setup_test_data
    first = post_table_order(data, table_code=create_test_table(data, "S9")).json()

    response = client.post(
        f"/public/sessions/{first['dining_session_token']}/orders",
        json=create_order_payload(data["unavailable_item_id"]),
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
    )

    assert response.status_code == 400
    assert "unavailable" in response.json()["detail"].lower()


def test_concurrent_first_orders_create_one_session(setup_test_data):
    data = setup_test_data
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.slug == data["restaurant_slug"]).one()
    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="TC",
        table_code=f"TC-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(table)
    db.commit()
    table_code = table.table_code
    table_id = table.id
    db.close()

    def submit_order():
        local_client = TestClient(app)
        return local_client.post(
            f"/public/restaurants/{data['restaurant_slug']}/tables/{table_code}/orders",
            json=create_order_payload(data["item_id"]),
            headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"}
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: submit_order(), range(2)))

    assert [response.status_code for response in responses] == [201, 201]
    tokens = {response.json()["dining_session_token"] for response in responses}
    assert len(tokens) == 1

    db = SessionLocal()
    session_count = db.query(DiningSession).filter(DiningSession.table_id == table_id).count()
    order_count = db.query(Order).join(DiningSession).filter(DiningSession.table_id == table_id).count()
    db.close()

    assert session_count == 1
    assert order_count == 2


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
