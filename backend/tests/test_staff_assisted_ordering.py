import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderStatusHistory
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffUser
from app.utils.auth import create_access_token, hash_password


client = TestClient(app)


@pytest.fixture
def staff_order_context():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(
        name="Staff Order Cafe",
        slug=f"staff-order-{suffix}",
        is_active=True,
        currency="INR",
        order_prefix="SO",
    )
    other_restaurant = Restaurant(
        name="Other Staff Order Cafe",
        slug=f"staff-order-other-{suffix}",
        is_active=True,
        currency="INR",
        order_prefix="OT",
    )
    db.add_all([restaurant, other_restaurant])
    db.flush()

    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="12",
        table_code=f"ST-{suffix}",
        is_active=True,
    )
    second_table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="13",
        table_code=f"ST2-{suffix}",
        is_active=True,
    )
    other_table = RestaurantTable(
        restaurant_id=other_restaurant.id,
        table_number="99",
        table_code=f"OST-{suffix}",
        is_active=True,
    )
    db.add_all([table, second_table, other_table])
    db.flush()

    category = MenuCategory(
        restaurant_id=restaurant.id,
        name_en="Mains",
        display_order=1,
        is_active=True,
    )
    db.add(category)
    db.flush()
    item = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Paneer Roll",
        price=Decimal("120.00"),
        is_available=True,
    )
    unavailable_item = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Sold Out Shake",
        price=Decimal("90.00"),
        is_available=False,
    )
    db.add_all([item, unavailable_item])
    db.flush()

    users = {}
    for role in ("owner", "admin", "staff", "kitchen"):
      user = StaffUser(
          restaurant_id=restaurant.id,
          name=f"{role.title()} User",
          email=f"{role}-{suffix}@staff-order.local",
          password_hash=hash_password("Password123!"),
          role=role,
          is_active=True,
      )
      db.add(user)
      db.flush()
      users[role] = user

    other_owner = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Owner",
        email=f"other-owner-{suffix}@staff-order.local",
        password_hash=hash_password("Password123!"),
        role="owner",
        is_active=True,
    )
    db.add(other_owner)
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "other_restaurant_id": other_restaurant.id,
        "restaurant_slug": restaurant.slug,
        "table_id": table.id,
        "table_code": table.table_code,
        "second_table_id": second_table.id,
        "second_table_code": second_table.table_code,
        "other_table_id": other_table.id,
        "item_id": item.id,
        "unavailable_item_id": unavailable_item.id,
        "owner_id": users["owner"].id,
        "admin_id": users["admin"].id,
        "staff_id": users["staff"].id,
        "kitchen_id": users["kitchen"].id,
        "owner_token": create_access_token({"sub": str(users["owner"].id), "restaurant_id": restaurant.id, "role": "owner"}),
        "admin_token": create_access_token({"sub": str(users["admin"].id), "restaurant_id": restaurant.id, "role": "admin"}),
        "staff_token": create_access_token({"sub": str(users["staff"].id), "restaurant_id": restaurant.id, "role": "staff"}),
        "kitchen_token": create_access_token({"sub": str(users["kitchen"].id), "restaurant_id": restaurant.id, "role": "kitchen"}),
        "other_token": create_access_token({"sub": str(other_owner.id), "restaurant_id": other_restaurant.id, "role": "owner"}),
    }
    db.close()

    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([data["restaurant_id"], data["other_restaurant_id"]])).delete()
    db.commit()
    db.close()


def auth(data, key="staff_token"):
    return {"Authorization": f"Bearer {data[key]}"}


def order_payload(data, item_key="item_id", quantity=2):
    return {
        "items": [{"menu_item_id": data[item_key], "quantity": quantity, "item_note": "Less spice"}],
        "customer_note": "Staff assisted order",
    }


def start_session(data, table_key="table_id", token_key="staff_token"):
    return client.post(
        f"/staff/tables/{data[table_key]}/sessions",
        headers=auth(data, token_key),
        json={},
    )


def create_manual_order(data, table_key="table_id", token_key="staff_token", payload=None):
    return client.post(
        f"/staff/tables/{data[table_key]}/orders",
        headers={**auth(data, token_key), "Idempotency-Key": f"staff-test-{uuid.uuid4().hex}"},
        json=payload or order_payload(data),
    )


def request_staff_table_bill(data, table_key="table_id", token_key="staff_token"):
    return client.post(
        f"/staff/tables/{data[table_key]}/bill-request",
        headers=auth(data, token_key),
        json={},
    )


@pytest.mark.parametrize("token_key", ["owner_token", "admin_token", "staff_token"])
def test_staff_table_access_allows_owner_admin_and_staff(staff_order_context, token_key):
    response = client.get("/staff/tables", headers=auth(staff_order_context, token_key))

    assert response.status_code == 200
    ids = {row["id"] for row in response.json()["items"]}
    assert staff_order_context["table_id"] in ids
    assert staff_order_context["other_table_id"] not in ids


def test_staff_table_access_rejects_kitchen_role(staff_order_context):
    response = client.get("/staff/tables", headers=auth(staff_order_context, "kitchen_token"))

    assert response.status_code == 403


def test_restaurant_isolation_for_table_detail(staff_order_context):
    response = client.get(
        f"/staff/tables/{staff_order_context['table_id']}",
        headers=auth(staff_order_context, "other_token"),
    )

    assert response.status_code == 404


def test_start_session_and_prevent_duplicate_active_session(staff_order_context):
    first = start_session(staff_order_context)
    second = start_session(staff_order_context)

    assert first.status_code == 201
    assert second.status_code == 409

    db = SessionLocal()
    session = db.query(DiningSession).filter(
        DiningSession.table_id == staff_order_context["table_id"],
        DiningSession.status == "open",
    ).one()
    assert session.opened_by_staff_id == staff_order_context["staff_id"]
    db.close()


def test_manual_order_uses_existing_order_and_kitchen_workflow(staff_order_context):
    start_session(staff_order_context)

    response = create_manual_order(staff_order_context)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert Decimal(str(body["subtotal"])) == Decimal("240.00")
    assert body["items"][0]["item_name"] == "Paneer Roll"

    kitchen_response = client.get(
        f"/kitchen/restaurants/{staff_order_context['restaurant_slug']}/orders",
        headers=auth(staff_order_context, "kitchen_token"),
    )
    assert kitchen_response.status_code == 200
    assert body["order_number"] in {order["order_number"] for order in kitchen_response.json()}

    db = SessionLocal()
    order = db.query(Order).filter(Order.public_token == body["public_token"]).one()
    history = db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == order.id).one()
    audit = db.query(AuditLog).filter(
        AuditLog.restaurant_id == staff_order_context["restaurant_id"],
        AuditLog.action == "staff_manual_order_created",
    ).one()
    assert order.dining_session_id is not None
    assert order.source == "staff_assisted"
    assert order.created_by_staff_id == staff_order_context["staff_id"]
    assert history.changed_by_staff_id == staff_order_context["staff_id"]
    assert audit.actor_user_id == staff_order_context["staff_id"]
    db.close()


def test_staff_order_auto_creates_session_on_first_order(staff_order_context):
    response = create_manual_order(staff_order_context)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"

    db = SessionLocal()
    sessions = db.query(DiningSession).filter(
        DiningSession.table_id == staff_order_context["table_id"],
        DiningSession.status == "open",
    ).all()
    assert len(sessions) == 1
    assert sessions[0].opened_by_staff_id == staff_order_context["staff_id"]
    order = db.query(Order).filter(Order.public_token == body["public_token"]).one()
    assert order.dining_session_id == sessions[0].id
    assert order.source == "staff_assisted"
    assert order.created_by_staff_id == staff_order_context["staff_id"]
    db.close()


def test_staff_order_reuses_existing_active_session(staff_order_context):
    first = create_manual_order(staff_order_context, payload=order_payload(staff_order_context, quantity=1))
    second = create_manual_order(staff_order_context, payload=order_payload(staff_order_context, quantity=2))

    assert first.status_code == 201
    assert second.status_code == 201

    db = SessionLocal()
    sessions = db.query(DiningSession).filter(
        DiningSession.table_id == staff_order_context["table_id"],
        DiningSession.status == "open",
    ).all()
    assert len(sessions) == 1
    orders = db.query(Order).filter(Order.dining_session_id == sessions[0].id).all()
    assert len(orders) == 2
    db.close()


def test_staff_bill_request_requires_valid_order(staff_order_context):
    start_session(staff_order_context)

    response = request_staff_table_bill(staff_order_context)

    assert response.status_code == 409
    assert "valid order" in response.json()["detail"].lower()


def test_staff_bill_request_after_assisted_order_is_idempotent_and_visible(staff_order_context):
    create_manual_order(staff_order_context)

    detail_before = client.get(
        f"/staff/tables/{staff_order_context['table_id']}",
        headers=auth(staff_order_context),
    )
    assert detail_before.status_code == 200
    assert detail_before.json()["session"] is not None
    assert detail_before.json()["session"]["orders"]
    assert detail_before.json()["session"]["bill"] is None

    first = request_staff_table_bill(staff_order_context)
    second = request_staff_table_bill(staff_order_context)

    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["request_type"] == "bill"
    assert first.json()["bill_number"] is not None

    db = SessionLocal()
    requests = db.query(ServiceRequest).filter(
        ServiceRequest.restaurant_id == staff_order_context["restaurant_id"],
        ServiceRequest.table_id == staff_order_context["table_id"],
        ServiceRequest.request_type == "bill",
        ServiceRequest.status == "pending",
    ).all()
    bills = db.query(Bill).filter(Bill.restaurant_id == staff_order_context["restaurant_id"]).all()
    assert len(requests) == 1
    assert len(bills) == 1
    assert requests[0].dining_session_id == bills[0].dining_session_id
    db.close()

    detail_after = client.get(
        f"/staff/tables/{staff_order_context['table_id']}",
        headers=auth(staff_order_context),
    )
    assert detail_after.status_code == 200
    body = detail_after.json()
    assert body["table"]["bill_requested"] is True
    assert body["session"]["bill"]["bill_number"] == first.json()["bill_number"]
    assert any(request["request_type"] == "bill" for request in body["requests"])


def test_owner_admin_service_requests_include_staff_bill_request(staff_order_context):
    create_manual_order(staff_order_context)
    requested = request_staff_table_bill(staff_order_context)
    assert requested.status_code == 201

    owner_requests = client.get(
        "/staff/service-requests",
        headers=auth(staff_order_context, "owner_token"),
    )
    admin_requests = client.get(
        "/staff/service-requests",
        headers=auth(staff_order_context, "admin_token"),
    )

    assert owner_requests.status_code == 200
    assert admin_requests.status_code == 200
    for response in (owner_requests, admin_requests):
        bill_requests = [item for item in response.json() if item["request_type"] == "bill"]
        assert len(bill_requests) == 1
        assert bill_requests[0]["id"] == requested.json()["id"]
        assert bill_requests[0]["bill_number"] == requested.json()["bill_number"]


def test_staff_bill_request_reuses_customer_created_session(staff_order_context):
    public_order = client.post(
        f"/public/restaurants/{staff_order_context['restaurant_slug']}/tables/{staff_order_context['second_table_code']}/orders",
        headers={"Idempotency-Key": f"qr-test-{uuid.uuid4().hex}"},
        json=order_payload(staff_order_context, quantity=1),
    )
    assert public_order.status_code == 201

    response = request_staff_table_bill(staff_order_context, table_key="second_table_id")

    assert response.status_code == 201
    db = SessionLocal()
    order = db.query(Order).filter(Order.public_token == public_order.json()["public_token"]).one()
    request = db.query(ServiceRequest).filter(ServiceRequest.id == response.json()["id"]).one()
    assert request.dining_session_id == order.dining_session_id
    db.close()


def test_staff_bill_request_hidden_after_payment_closes_session(staff_order_context):
    create_manual_order(staff_order_context)
    requested = request_staff_table_bill(staff_order_context).json()
    issued = client.post(
        f"/staff/bills/{requested['bill_number']}/issue",
        headers=auth(staff_order_context, "owner_token"),
    )
    assert issued.status_code == 200
    sent = client.post(
        f"/staff/bills/{requested['bill_number']}/send-to-counter",
        headers=auth(staff_order_context),
    )
    assert sent.status_code == 200
    paid = client.post(
        f"/staff/bills/{requested['bill_number']}/confirm-counter-payment",
        headers=auth(staff_order_context, "owner_token"),
        json={"method": "counter_cash"},
    )
    assert paid.status_code == 200

    detail = client.get(
        f"/staff/tables/{staff_order_context['table_id']}",
        headers=auth(staff_order_context),
    )
    assert detail.status_code == 200
    assert detail.json()["session"] is None

    repeated = request_staff_table_bill(staff_order_context)
    assert repeated.status_code == 404


def test_staff_order_idempotency_prevents_duplicate_session_and_order(staff_order_context):
    key = f"staff-test-fixed-{uuid.uuid4().hex}"
    headers = {**auth(staff_order_context), "Idempotency-Key": key}

    first = client.post(
        f"/staff/tables/{staff_order_context['table_id']}/orders",
        headers=headers,
        json=order_payload(staff_order_context),
    )
    second = client.post(
        f"/staff/tables/{staff_order_context['table_id']}/orders",
        headers=headers,
        json=order_payload(staff_order_context),
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["public_token"] == second.json()["public_token"]

    db = SessionLocal()
    sessions = db.query(DiningSession).filter(
        DiningSession.table_id == staff_order_context["table_id"],
        DiningSession.status == "open",
    ).all()
    assert len(sessions) == 1
    orders = db.query(Order).filter(Order.dining_session_id == sessions[0].id).all()
    assert len(orders) == 1
    db.close()


def test_manual_order_rejects_unavailable_items(staff_order_context):
    start_session(staff_order_context)

    response = create_manual_order(
        staff_order_context,
        payload=order_payload(staff_order_context, item_key="unavailable_item_id"),
    )

    assert response.status_code == 400
    assert "unavailable" in response.json()["detail"].lower()


def test_manual_order_ignores_closed_historical_session(staff_order_context):
    created = start_session(staff_order_context).json()
    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.public_token == created["session_token"]).one()
    session.status = "closed"
    closed_session_id = session.id
    db.commit()
    db.close()

    response = create_manual_order(staff_order_context)

    assert response.status_code == 201
    db = SessionLocal()
    active_sessions = db.query(DiningSession).filter(
        DiningSession.table_id == staff_order_context["table_id"],
        DiningSession.status == "open",
    ).all()
    assert len(active_sessions) == 1
    assert active_sessions[0].id != closed_session_id
    db.close()


def test_resolve_table_request_records_staff_resolver(staff_order_context):
    session = start_session(staff_order_context).json()
    db = SessionLocal()
    service_request = ServiceRequest(
        restaurant_id=staff_order_context["restaurant_id"],
        table_id=staff_order_context["table_id"],
        dining_session_id=session["id"],
        request_type="water",
        status="pending",
    )
    db.add(service_request)
    db.commit()
    request_id = service_request.id
    db.close()

    response = client.post(f"/staff/requests/{request_id}/resolve", headers=auth(staff_order_context))

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "resolved"
    assert body["resolved_by_staff_id"] == staff_order_context["staff_id"]


def test_staff_bill_generation_and_counter_handoff(staff_order_context):
    start_session(staff_order_context)
    create_manual_order(staff_order_context)

    bill_response = client.post(
        f"/staff/tables/{staff_order_context['table_id']}/bill",
        headers=auth(staff_order_context),
        json={},
    )
    assert bill_response.status_code == 201
    bill = bill_response.json()
    assert bill["status"] == "draft"

    issued = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers=auth(staff_order_context),
    )
    assert issued.status_code == 200

    sent = client.post(
        f"/staff/bills/{bill['bill_number']}/send-to-counter",
        headers=auth(staff_order_context),
    )
    assert sent.status_code == 200
    assert sent.json()["status"] == "payment_pending"

    denied = client.post(
        f"/staff/bills/{bill['bill_number']}/confirm-counter-payment",
        headers=auth(staff_order_context),
        json={"method": "counter_upi"},
    )
    assert denied.status_code == 403

    paid = client.post(
        f"/staff/bills/{bill['bill_number']}/confirm-counter-payment",
        headers=auth(staff_order_context, "admin_token"),
        json={"method": "counter_upi"},
    )
    assert paid.status_code == 200
    assert paid.json()["status"] == "paid"

    db = SessionLocal()
    stored_bill = db.query(Bill).filter(
        Bill.restaurant_id == staff_order_context["restaurant_id"],
        Bill.bill_number == bill["bill_number"],
    ).one()
    session = db.query(DiningSession).filter(DiningSession.id == stored_bill.dining_session_id).one()
    assert stored_bill.generated_by_staff_id == staff_order_context["staff_id"]
    assert stored_bill.status == "paid"
    assert stored_bill.payment_method == "counter_upi"
    assert stored_bill.paid_by_staff_id == staff_order_context["admin_id"]
    assert session.status == "closed"
    assert session.closed_by_staff_id == staff_order_context["admin_id"]
    db.close()


def test_kitchen_cannot_generate_staff_table_bill(staff_order_context):
    start_session(staff_order_context)

    response = client.post(
        f"/staff/tables/{staff_order_context['table_id']}/bill",
        headers=auth(staff_order_context, "kitchen_token"),
        json={},
    )

    assert response.status_code == 403


def test_existing_qr_customer_ordering_remains_qr_sourced(staff_order_context):
    response = client.post(
        f"/public/restaurants/{staff_order_context['restaurant_slug']}/tables/{staff_order_context['second_table_code']}/orders",
        headers={"Idempotency-Key": f"qr-test-{uuid.uuid4().hex}"},
        json=order_payload(staff_order_context, quantity=1),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"

    db = SessionLocal()
    order = db.query(Order).filter(Order.public_token == body["public_token"]).one()
    assert order.source == "customer_qr"
    assert order.created_by_staff_id is None
    db.close()
