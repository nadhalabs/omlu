import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.database import SessionLocal
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.utils.auth import create_access_token, hash_password


client = TestClient(app)


@pytest.fixture
def bill_context():
    db = SessionLocal()
    slug = f"bill-test-{uuid.uuid4().hex[:10]}"
    other_slug = f"bill-other-{uuid.uuid4().hex[:10]}"

    restaurant = Restaurant(
        name="Bill Test Cafe",
        slug=slug,
        is_active=True,
        currency="INR",
        order_prefix="BT",
    )
    other_restaurant = Restaurant(
        name="Other Bill Cafe",
        slug=other_slug,
        is_active=True,
        currency="INR",
        order_prefix="OB",
    )
    db.add_all([restaurant, other_restaurant])
    db.flush()

    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="4",
        table_code=f"BILL-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    other_table = RestaurantTable(
        restaurant_id=other_restaurant.id,
        table_number="9",
        table_code=f"OBILL-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add_all([table, other_table])
    db.flush()

    category = MenuCategory(
        restaurant_id=restaurant.id,
        name_en="Food",
        display_order=1,
        is_active=True,
    )
    db.add(category)
    db.flush()

    item = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Original Item",
        price=Decimal("100.00"),
        is_available=True,
    )
    db.add(item)
    db.flush()

    session = DiningSession(
        restaurant_id=restaurant.id,
        table_id=table.id,
        public_token=f"session-{uuid.uuid4().hex}",
        status="open",
    )
    db.add(session)
    db.flush()

    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="Bill Owner",
        email=f"owner-{uuid.uuid4().hex[:8]}@bill.local",
        password_hash=hash_password("owner123"),
        role="owner",
        is_active=True,
    )
    staff_legacy_manager = StaffUser(
        restaurant_id=restaurant.id,
        name="Bill Manager",
        email=f"admin-{uuid.uuid4().hex[:8]}@bill.local",
        password_hash=hash_password("admin123"),
        role="admin",
        is_active=True,
    )
    staff_legacy_waiter = StaffUser(
        restaurant_id=restaurant.id,
        name="Bill Waiter",
        email=f"staff-{uuid.uuid4().hex[:8]}@bill.local",
        password_hash=hash_password("staff123"),
        role="staff",
        is_active=True,
    )
    kitchen = StaffUser(
        restaurant_id=restaurant.id,
        name="Bill Kitchen",
        email=f"kitchen-{uuid.uuid4().hex[:8]}@bill.local",
        password_hash=hash_password("kitchen123"),
        role="kitchen",
        is_active=True,
    )
    other_owner = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Owner",
        email=f"other-{uuid.uuid4().hex[:8]}@bill.local",
        password_hash=hash_password("other123"),
        role="owner",
        is_active=True,
    )
    db.add_all([owner, staff_legacy_manager, staff_legacy_waiter, kitchen, other_owner])
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "other_restaurant_id": other_restaurant.id,
        "restaurant_slug": restaurant.slug,
        "table_id": table.id,
        "table_code": table.table_code,
        "session_id": session.id,
        "session_token": session.public_token,
        "item_id": item.id,
        "owner_id": owner.id,
        "admin_id": staff_legacy_manager.id,
        "staff_id": staff_legacy_waiter.id,
        "owner_token": create_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"}),
        "admin_token": create_access_token({"sub": str(staff_legacy_manager.id), "restaurant_id": restaurant.id, "role": "admin"}),
        "staff_token": create_access_token({"sub": str(staff_legacy_waiter.id), "restaurant_id": restaurant.id, "role": "staff"}),
        "kitchen_token": create_access_token({"sub": str(kitchen.id), "restaurant_id": restaurant.id, "role": "kitchen"}),
        "other_token": create_access_token({"sub": str(other_owner.id), "restaurant_id": other_restaurant.id, "role": "owner"}),
    }
    db.close()

    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([data["restaurant_id"], data["other_restaurant_id"]])).delete()
    db.commit()
    db.close()


def add_order(
    data,
    *,
    subtotal=Decimal("100.00"),
    status="pending",
    item_name="Original Item",
    quantity=1,
    unit_price=Decimal("100.00"),
):
    db = SessionLocal()
    order = Order(
        restaurant_id=data["restaurant_id"],
        table_id=data["table_id"],
        dining_session_id=data["session_id"],
        order_number=f"BT-BILL-{uuid.uuid4().hex[:10]}",
        public_token=uuid.uuid4().hex,
        status=status,
        subtotal=subtotal,
        idempotency_key=f"bill-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        menu_item_id=data["item_id"],
        item_name=item_name,
        quantity=quantity,
        unit_price=unit_price,
        total_price=subtotal,
    ))
    db.add(OrderStatusHistory(order_id=order.id, old_status=None, new_status=status))
    db.commit()
    token = order.public_token
    db.close()
    return token


def create_bill(data):
    return client.post(f"/public/sessions/{data['session_token']}/bill")


def issue_bill_for(data, token_key="owner_token"):
    bill = create_bill(data).json()
    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {data[token_key]}"},
    )
    assert response.status_code == 200
    return response.json()


def request_counter_payment(data, method="counter_cash"):
    return client.post(
        f"/public/sessions/{data['session_token']}/pay-at-counter",
        json={"method": method},
    )


def confirm_counter_payment(data, bill_number, token_key="owner_token", method="counter_cash"):
    return client.post(
        f"/staff/bills/{bill_number}/confirm-counter-payment",
        json={"method": method},
        headers={"Authorization": f"Bearer {data[token_key]}"},
    )


def test_create_bill(bill_context):
    add_order(bill_context)

    response = create_bill(bill_context)

    assert response.status_code == 201
    body = response.json()
    assert body["bill_number"].startswith("BILL-")
    assert body["restaurant_name"] == "Bill Test Cafe"
    assert body["table_number"] == "4"
    assert body["session_token"] == bill_context["session_token"]
    assert body["status"] == "draft"
    assert body["subtotal"] == "100.00"
    assert body["tax_amount"] == "0.00"
    assert body["discount_amount"] == "0.00"
    assert body["total_amount"] == "100.00"
    assert body["currency"] == "INR"


def test_repeated_creation_returns_same_bill(bill_context):
    add_order(bill_context)
    first = create_bill(bill_context).json()
    second = create_bill(bill_context).json()

    assert second["bill_number"] == first["bill_number"]


def test_combined_subtotal_across_multiple_orders(bill_context):
    add_order(bill_context, subtotal=Decimal("100.00"))
    add_order(bill_context, subtotal=Decimal("75.50"), quantity=1, unit_price=Decimal("75.50"))

    body = create_bill(bill_context).json()

    assert body["subtotal"] == "175.50"
    assert body["total_amount"] == "175.50"
    assert len(body["orders"]) == 2


def test_rejected_order_excluded(bill_context):
    add_order(bill_context, subtotal=Decimal("100.00"))
    add_order(bill_context, subtotal=Decimal("999.00"), status="rejected", item_name="Rejected Item", unit_price=Decimal("999.00"))

    body = create_bill(bill_context).json()

    assert body["subtotal"] == "100.00"
    assert len(body["orders"]) == 1
    assert body["orders"][0]["status"] != "rejected"


def test_historical_item_names_preserved(bill_context):
    add_order(bill_context, item_name="Old Snapshot Name")
    db = SessionLocal()
    item = db.query(MenuItem).filter(MenuItem.id == bill_context["item_id"]).one()
    item.name_en = "New Menu Name"
    db.commit()
    db.close()

    body = create_bill(bill_context).json()

    assert body["orders"][0]["items"][0]["item_name"] == "Old Snapshot Name"


def test_negative_values_impossible(bill_context):
    db = SessionLocal()
    bill = Bill(
        restaurant_id=bill_context["restaurant_id"],
        dining_session_id=bill_context["session_id"],
        bill_number=f"BILL-NEG-{uuid.uuid4().hex[:8]}",
        status="draft",
        subtotal=Decimal("-1.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total_amount=Decimal("-1.00"),
        currency="INR",
    )
    db.add(bill)

    with pytest.raises(IntegrityError):
        db.flush()

    db.rollback()
    db.close()


def test_issue_bill(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "issued"

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.status == "payment_requested"
    assert session.payment_requested_at is not None
    db.close()


@pytest.mark.parametrize("token_key", ["owner_token", "admin_token", "staff_token"])
def test_owner_admin_staff_allowed_to_issue_bill(bill_context, token_key):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context[token_key]}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "issued"


def test_issuing_locks_ordering(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()
    issued = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )
    assert issued.status_code == 200

    response = client.post(
        f"/public/sessions/{bill_context['session_token']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"},
    )

    assert response.status_code == 409
    assert "locked" in response.json()["detail"].lower()


def test_issued_bill_remains_unchanged(bill_context):
    add_order(bill_context, subtotal=Decimal("100.00"))
    bill = create_bill(bill_context).json()
    issued = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )
    assert issued.status_code == 200
    assert issued.json()["total_amount"] == "100.00"

    add_order(
        bill_context,
        subtotal=Decimal("50.00"),
        item_name="Late Manual Adjustment",
        unit_price=Decimal("50.00"),
    )
    refreshed = create_bill(bill_context)

    assert refreshed.status_code == 201
    assert refreshed.json()["status"] == "issued"
    assert refreshed.json()["total_amount"] == "100.00"


def test_kitchen_denied(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['kitchen_token']}"},
    )

    assert response.status_code == 403


def test_cross_restaurant_isolation(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['other_token']}"},
    )

    assert response.status_code == 404


@pytest.mark.parametrize("method", ["counter_cash", "counter_upi"])
def test_pay_at_counter_request(bill_context, method):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    response = request_counter_payment(bill_context, method)

    assert response.status_code == 200
    body = response.json()
    assert body["bill_number"] == issued["bill_number"]
    assert body["status"] == "payment_pending"
    assert body["payment_method"] == method

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.status == "payment_pending"
    db.close()


def test_invalid_counter_payment_method_rejected(bill_context):
    add_order(bill_context)
    issue_bill_for(bill_context)

    response = request_counter_payment(bill_context, "online")

    assert response.status_code == 422


def test_pay_at_counter_requires_issued_bill(bill_context):
    add_order(bill_context)
    create_bill(bill_context)

    response = request_counter_payment(bill_context)

    assert response.status_code == 409


def test_repeated_customer_counter_payment_request_is_idempotent(bill_context):
    add_order(bill_context)
    issue_bill_for(bill_context)

    first = request_counter_payment(bill_context, "counter_cash")
    second = request_counter_payment(bill_context, "counter_upi")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["status"] == "payment_pending"
    assert second.json()["payment_method"] == "counter_cash"


@pytest.mark.parametrize(
    ("token_key", "staff_id_key", "method"),
    [
        ("owner_token", "owner_id", "counter_cash"),
        ("owner_token", "owner_id", "counter_upi"),
        ("owner_token", "owner_id", "counter_card"),
        ("admin_token", "admin_id", "counter_cash"),
    ],
)
def test_owner_and_admin_can_confirm_counter_payment(bill_context, token_key, staff_id_key, method):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, method)

    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key=token_key,
        method=method,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "paid"
    assert body["payment_method"] == method
    assert body["paid_at"] is not None
    assert body["paid_by_staff_id"] == bill_context[staff_id_key]


def test_staff_denied_confirm_counter_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="staff_token",
    )

    assert response.status_code == 403


def test_kitchen_denied_confirm_counter_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="kitchen_token",
    )

    assert response.status_code == 403


def test_public_user_denied_confirm_counter_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    response = client.post(
        f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
        json={"method": "counter_cash"},
    )

    assert response.status_code == 401


def test_cross_restaurant_denied_confirm_counter_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="other_token",
    )

    assert response.status_code == 404


def test_repeated_confirmation_preserves_first_payment_time_and_staff(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")

    first = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="owner_token",
        method="counter_cash",
    )
    second = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="admin_token",
        method="counter_upi",
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()


def test_staff_payment_authorization_failure_publishes_no_success_event(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")

    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="staff_token",
        method="counter_cash",
    )

    assert response.status_code == 403
    assert all(event.type != realtime.EVENT_BILL_PAID for event in published)


def test_staff_can_request_payment_assistance(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context, token_key="staff_token")

    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    response = client.post(
        f"/staff/bills/{issued['bill_number']}/payment-assistance",
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "issued"
    assert any(event.type == realtime.EVENT_PAYMENT_ASSISTANCE_REQUESTED for event in published)
    assistance_event = next(event for event in published if event.type == realtime.EVENT_PAYMENT_ASSISTANCE_REQUESTED)
    assert assistance_event.restaurant_id == bill_context["restaurant_id"]
    assert "restaurant:%s:operations" % bill_context["restaurant_id"] in assistance_event.channels


def test_payment_assistance_respects_restaurant_isolation(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    response = client.post(
        f"/staff/bills/{issued['bill_number']}/payment-assistance",
        headers={"Authorization": f"Bearer {bill_context['other_token']}"},
    )

    assert response.status_code == 404


def test_two_simultaneous_payment_confirmations_only_one_succeeds(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")

    def confirm(method: str):
        local_client = TestClient(app)
        return local_client.post(
            f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
            json={"method": method},
            headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(confirm, ["counter_cash", "counter_upi"]))

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [200, 409]

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.restaurant_id == bill_context["restaurant_id"], Bill.bill_number == issued["bill_number"]).one()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    db.close()
    assert bill.status == "paid"
    assert session.status == "closed"
    assert bill.payment_method in {"counter_cash", "counter_upi"}


def test_payment_confirmation_racing_with_session_closure_is_consistent(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")

    def confirm_payment():
        local_client = TestClient(app)
        return local_client.post(
            f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
            json={"method": "counter_cash"},
            headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
        )

    def close_session():
        local_client = TestClient(app)
        return local_client.post(
            f"/staff/sessions/{bill_context['session_token']}/close-empty",
            headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = [future.result() for future in [executor.submit(confirm_payment), executor.submit(close_session)]]

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [200, 409]

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.restaurant_id == bill_context["restaurant_id"], Bill.bill_number == issued["bill_number"]).one()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    db.close()
    assert bill.status == "paid"
    assert session.status == "closed"


def test_empty_session_closure_racing_with_bill_creation_is_consistent(bill_context):
    add_order(bill_context, status="pending")

    def create_bill_request():
        local_client = TestClient(app)
        return local_client.post(f"/public/sessions/{bill_context['session_token']}/bill")

    def close_session():
        local_client = TestClient(app)
        return local_client.post(
            f"/staff/sessions/{bill_context['session_token']}/close-empty",
            headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = [future.result() for future in [executor.submit(create_bill_request), executor.submit(close_session)]]

    success_count = sum(response.status_code in {200, 201} for response in responses)
    assert success_count == 1
    assert any(response.status_code == 409 for response in responses)

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    bill = db.query(Bill).filter(Bill.dining_session_id == bill_context["session_id"]).first()
    orders = db.query(Order).filter(Order.dining_session_id == bill_context["session_id"]).all()
    db.close()
    if bill:
        assert bill.status == "draft"
        assert session.status == "open"
    else:
        assert session.status == "cancelled"
        assert all(order.status == "rejected" for order in orders)


def test_closing_session_with_unpaid_bill_is_rejected(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.post(
        f"/staff/sessions/{bill_context['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )

    assert response.status_code == 409
    assert bill["bill_number"]
    assert "bill" in response.json()["detail"].lower()


def test_failed_payment_transition_does_not_publish_realtime_event(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")
    first = confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")
    assert first.status_code == 200

    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    second = confirm_counter_payment(bill_context, issued["bill_number"], token_key="admin_token", method="counter_upi")

    assert second.status_code == 409
    assert published == []


def test_invalid_payment_transition_rolls_back_bill_and_session(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")

    response = confirm_counter_payment(bill_context, issued["bill_number"], method="online")

    assert response.status_code == 422
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.restaurant_id == bill_context["restaurant_id"], Bill.bill_number == issued["bill_number"]).one()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    db.close()
    assert bill.status == "payment_pending"
    assert bill.payment_method == "counter_cash"
    assert session.status == "payment_pending"


def test_counter_payment_closes_session_and_blocks_old_session_orders(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")

    paid = confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")

    assert paid.status_code == 200
    assert paid.json()["status"] == "paid"

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.status == "closed"
    assert session.paid_at is not None
    assert session.closed_at is not None
    db.close()

    response = client.post(
        f"/public/sessions/{bill_context['session_token']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"},
    )

    assert response.status_code == 409


def test_new_session_can_start_for_same_table_after_counter_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")
    confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")

    response = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["dining_session_token"] != bill_context["session_token"]


def test_paid_bill_generation_returns_existing_paid_bill(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    request_counter_payment(bill_context, "counter_cash")
    confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")

    response = create_bill(bill_context)

    assert response.status_code == 201
    body = response.json()
    assert body["bill_number"] == issued["bill_number"]
    assert body["status"] == "paid"
    assert body["payment_method"] == "counter_cash"


def test_historical_bill_remains_readable_without_payment_fields(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.get(f"/public/sessions/{bill_context['session_token']}/bill")

    assert response.status_code == 200
    body = response.json()
    assert body["bill_number"] == bill["bill_number"]
    assert body["payment_method"] is None
    assert body["paid_at"] is None


def test_unique_bill_number(bill_context):
    add_order(bill_context)
    first = create_bill(bill_context).json()

    db = SessionLocal()
    table = RestaurantTable(
        restaurant_id=bill_context["restaurant_id"],
        table_number="5",
        table_code=f"BILL2-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add(table)
    db.flush()
    session = DiningSession(
        restaurant_id=bill_context["restaurant_id"],
        table_id=table.id,
        public_token=f"session-{uuid.uuid4().hex}",
        status="open",
    )
    db.add(session)
    db.flush()
    order = Order(
        restaurant_id=bill_context["restaurant_id"],
        table_id=bill_context["table_id"],
        dining_session_id=session.id,
        order_number=f"BT-BILL-{uuid.uuid4().hex[:10]}",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=Decimal("20.00"),
        idempotency_key=f"bill-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        menu_item_id=bill_context["item_id"],
        item_name="Second Session Item",
        quantity=1,
        unit_price=Decimal("20.00"),
        total_price=Decimal("20.00"),
    ))
    db.commit()
    second_token = session.public_token
    db.close()

    second = client.post(f"/public/sessions/{second_token}/bill").json()

    assert second["bill_number"] != first["bill_number"]


def test_concurrent_generation_creates_one_bill(bill_context):
    add_order(bill_context)

    def submit():
        local_client = TestClient(app)
        return local_client.post(f"/public/sessions/{bill_context['session_token']}/bill")

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: submit(), range(2)))

    assert [response.status_code for response in responses] == [201, 201]
    numbers = {response.json()["bill_number"] for response in responses}
    assert len(numbers) == 1

    db = SessionLocal()
    bill_count = db.query(Bill).filter(Bill.dining_session_id == bill_context["session_id"]).count()
    db.close()
    assert bill_count == 1
