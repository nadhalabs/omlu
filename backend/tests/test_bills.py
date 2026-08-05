import datetime
import json
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.database import SessionLocal
from app.models.bill import Bill, PaymentCodeLookupAttempt
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, OrderItemSelectedOption, OrderStatusHistory
from app.models.payment import Payment, RevenueEntry
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffUser
from app.schemas.bill import ReceiptPayloadResponse
from app.services.bills import (
    calculate_gst_totals,
    decrypt_payment_code,
    detach_issued_bill_and_release_table,
    find_unresolved_bill_by_payment_code,
    generate_invoice_number,
    indian_financial_year,
    payment_code_digest,
)
from app.services.dining_sessions import find_current_open_session_for_table
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token
from tests.participant_helpers import ParticipantTestClient, authorize_existing_session, participant_headers


class PhaseOneBillClient(ParticipantTestClient):
    def post(self, url, **kwargs):
        headers = dict(kwargs.pop("headers", {}) or {})
        if url.endswith("/issue"):
            headers.setdefault("Idempotency-Key", f"issue-{url.rsplit('/', 2)[-2]}-phase1")
        elif url.endswith("/confirm-counter-payment"):
            method = (kwargs.get("json") or {}).get("method", "counter_cash")
            headers.setdefault("Idempotency-Key", f"payment-{url.rsplit('/', 2)[-2]}-{method}-phase1")
        return super().post(url, headers=headers, **kwargs)


client = PhaseOneBillClient(app)


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
    authority = authorize_existing_session(
        client,
        data["restaurant_slug"],
        data["table_code"],
        data["session_token"],
        {"Authorization": f"Bearer {data['owner_token']}"},
    )
    data["participant_token"] = authority["participant_token"]
    client.register_authority(authority, data["restaurant_slug"], data["table_code"])

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
    return client.post(
        f"/public/sessions/{data['session_token']}/bill",
        headers=participant_headers(data["participant_token"]),
    )


def issue_bill_for(data, token_key="owner_token"):
    bill = create_bill(data).json()
    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={
            "Authorization": f"Bearer {data[token_key]}",
            "Idempotency-Key": f"issue-{bill['bill_number']}-phase1",
        },
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
        headers={
            "Authorization": f"Bearer {data[token_key]}",
            "Idempotency-Key": f"payment-{bill_number}-{method}-phase1",
        },
    )


def send_to_counter(data, bill_number, token_key="staff_token"):
    return client.post(
        f"/staff/bills/{bill_number}/send-to-counter",
        headers={"Authorization": f"Bearer {data[token_key]}"},
    )


def detach_bill(data, bill_number):
    db = SessionLocal()
    bill = db.query(Bill).filter(
        Bill.restaurant_id == data["restaurant_id"],
        Bill.bill_number == bill_number,
    ).one()
    owner = db.query(StaffUser).filter(StaffUser.id == data["owner_id"]).one()
    result = detach_issued_bill_and_release_table(
        db,
        restaurant_id=data["restaurant_id"],
        bill_id=bill.id,
        actor=owner,
    )
    code = result.payment_code
    db.commit()
    db.close()
    return code


def issue_and_release(data, bill_number, token_key="owner_token", key=None, confirm=True):
    return client.post(
        f"/staff/bills/{bill_number}/issue-and-release",
        json={"confirm_table_is_free": confirm},
        headers={
            "Authorization": f"Bearer {data[token_key]}",
            "Idempotency-Key": key or f"detach-{bill_number}-phase2",
        },
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
    assert body["receipt_token"] is None
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
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "issued"
    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.status == "payment_requested"
    assert session.payment_requested_at is not None
    db.close()


def test_issue_rejects_mismatched_authoritative_line_totals(bill_context):
    order_token = add_order(bill_context)
    draft = create_bill(bill_context).json()
    db = SessionLocal()
    order = db.query(Order).filter(Order.public_token == order_token).one()
    item = db.query(OrderItem).filter(OrderItem.order_id == order.id).one()
    item.total_price = Decimal("99.99")
    db.commit()
    db.close()

    response = client.post(
        f"/staff/bills/{draft['bill_number']}/issue",
        headers={
            "Authorization": f"Bearer {bill_context['owner_token']}",
            "Idempotency-Key": f"mismatch-{uuid.uuid4().hex}",
        },
    )
    assert response.status_code == 409
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == draft["bill_number"]).one()
    assert bill.status == "draft"
    assert bill.invoice_number is None
    db.close()

@pytest.mark.parametrize("token_key", ["owner_token", "admin_token"])
def test_owner_admin_allowed_to_issue_bill(bill_context, token_key):
    add_order(bill_context)
    bill = create_bill(bill_context).json()

    response = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context[token_key]}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "issued"


def test_staff_official_billing_actions_are_rejected(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()
    staff_headers = {"Authorization": f"Bearer {bill_context['staff_token']}"}

    issue = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers=staff_headers,
    )
    assert issue.status_code == 403
    assert issue.json()["detail"]["code"] == "BILLING_PERMISSION_REQUIRED"

    reopen = client.post(
        f"/staff/bills/{bill['bill_number']}/reopen-ordering",
        json={"reason": "Customer changed their mind"},
        headers=staff_headers,
    )
    assert reopen.status_code == 403
    assert reopen.json()["detail"]["code"] == "BILLING_PERMISSION_REQUIRED"

    issued = issue_bill_for(bill_context, token_key="owner_token")
    receipt = client.get(
        f"/staff/bills/{issued['bill_number']}/receipt-payload",
        headers=staff_headers,
    )
    assert receipt.status_code == 403
    assert receipt.json()["detail"]["code"] == "BILLING_PERMISSION_REQUIRED"

    payment = client.post(
        f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
        json={"method": "counter_cash"},
        headers=staff_headers,
    )
    assert payment.status_code == 403
    assert payment.json()["detail"]["code"] == "BILLING_PERMISSION_REQUIRED"


def test_billing_counter_classifies_authoritative_tenant_scoped_queues(bill_context):
    add_order(bill_context)
    draft = create_bill(bill_context).json()
    owner_headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}

    requested = client.get("/staff/bills/billing-counter", headers=owner_headers)
    assert requested.status_code == 200
    requested_item = requested.json()["requested"][0]
    assert requested_item["bill_number"] == draft["bill_number"]
    assert requested_item["status"] == "draft"
    assert requested_item["item_count"] == 1
    assert requested_item["subtotal"] == "100.00"
    assert requested_item["receipt_token"] is None

    issued = issue_bill_for(bill_context, token_key="admin_token")
    awaiting = client.get("/staff/bills/billing-counter", headers=owner_headers).json()
    assert awaiting["requested"] == []
    assert [item["bill_number"] for item in awaiting["awaiting_payment"]] == [issued["bill_number"]]
    assert awaiting["awaiting_payment"][0]["total_amount"] == issued["total_amount"]

    paid = confirm_counter_payment(bill_context, issued["bill_number"])
    assert paid.status_code == 200
    queues = client.get("/staff/bills/billing-counter", headers=owner_headers).json()
    assert queues["awaiting_payment"] == []
    assert queues["paid_recently"][0]["bill_number"] == issued["bill_number"]
    assert queues["paid_recently"][0]["payment_method"] == "counter_cash"
    assert queues["paid_recently"][0]["paid_at"] is not None

    denied = client.get(
        "/staff/bills/billing-counter",
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"]["code"] == "BILLING_PERMISSION_REQUIRED"

    other = client.get(
        "/staff/bills/billing-counter",
        headers={"Authorization": f"Bearer {bill_context['other_token']}"},
    )
    assert all(not values for values in other.json().values())


def test_issuing_locks_ordering(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()
    issued = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={
            "Authorization": f"Bearer {bill_context['owner_token']}",
            "Idempotency-Key": f"issue-{bill['bill_number']}-phase1",
        },
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


def test_public_cannot_select_counter_payment_method(bill_context):
    add_order(bill_context)
    issue_bill_for(bill_context)

    response = request_counter_payment(bill_context, "counter_cash")

    assert response.status_code == 403


def test_staff_sends_issued_bill_to_counter_without_payment_method(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context, token_key="owner_token")

    response = send_to_counter(bill_context, issued["bill_number"])

    assert response.status_code == 200
    assert response.json()["status"] == "payment_pending"
    assert response.json()["payment_method"] is None

    pending = client.get(
        "/staff/bills/pending-payments",
        headers={"Authorization": f"Bearer {bill_context['admin_token']}"},
    )
    assert pending.status_code == 200
    item = pending.json()["items"][0]
    assert item["bill_number"] == issued["bill_number"]
    assert item["sent_by_staff_id"] == bill_context["staff_id"]
    assert item["sent_by_staff_name"] == "Bill Waiter"
    assert item["bill_id"]
    assert item["session_id"] == bill_context["session_id"]
    assert item["table_name"] == "Table 4"
    assert item["amount_paid"] == "0.00"
    assert item["remaining_amount"] == item["grand_total"]
    assert item["session_opened_at"]


def test_public_bill_identifies_staff_preparation_and_counter_handoff(bill_context):
    add_order(bill_context)
    prepared = client.post(
        f"/staff/tables/{bill_context['table_id']}/bill",
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    ).json()
    issued_response = client.post(
        f"/staff/bills/{prepared['bill_number']}/issue",
        headers={
            "Authorization": f"Bearer {bill_context['owner_token']}",
            "Idempotency-Key": f"issue-{prepared['bill_number']}-phase1",
        },
    )
    assert issued_response.status_code == 200
    issued = issued_response.json()

    assert issued["status"] == "issued"
    assert issued["generated_by_role"] == "staff"
    assert issued["sent_to_counter_by_role"] is None

    sent = send_to_counter(bill_context, issued["bill_number"], token_key="staff_token")
    assert sent.status_code == 200
    assert sent.json()["status"] == "payment_pending"
    assert sent.json()["sent_to_counter_by_role"] == "staff"

    customer = client.get(f"/public/sessions/{bill_context['session_token']}/bill")
    assert customer.status_code == 200
    assert customer.json()["generated_by_role"] == "staff"
    assert customer.json()["sent_to_counter_by_role"] == "staff"


@pytest.mark.parametrize(
    ("token_key", "expected_role"),
    [("owner_token", "owner"), ("admin_token", "admin")],
)
def test_public_bill_identifies_owner_or_admin_direct_issue(
    bill_context, token_key, expected_role
):
    add_order(bill_context)
    issued = issue_bill_for(bill_context, token_key=token_key)

    assert issued["status"] == "issued"
    assert issued["generated_by_role"] == expected_role
    assert issued["sent_to_counter_by_role"] is None

    customer = client.get(f"/public/sessions/{bill_context['session_token']}/bill")
    assert customer.status_code == 200
    assert customer.json()["generated_by_role"] == expected_role


def test_old_pending_bill_is_recovered_by_authoritative_queue(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context, token_key="owner_token")
    send_to_counter(bill_context, issued["bill_number"])

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    bill.generated_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=11)
    bill.updated_at = bill.generated_at
    db.commit()
    db.close()

    response = client.get(
        "/staff/bills/pending-payments",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )

    assert response.status_code == 200
    assert [item["bill_number"] for item in response.json()["items"]] == [issued["bill_number"]]


@pytest.mark.parametrize("token_key", ["staff_token", "kitchen_token"])
def test_staff_and_kitchen_cannot_access_pending_payment_queue(bill_context, token_key):
    response = client.get(
        "/staff/bills/pending-payments",
        headers={"Authorization": f"Bearer {bill_context[token_key]}"},
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("token_key", "staff_id_key", "method"),
    [
        ("owner_token", "owner_id", "counter_cash"),
        ("owner_token", "owner_id", "counter_upi"),
        ("admin_token", "admin_id", "counter_cash"),
        ("admin_token", "admin_id", "counter_upi"),
    ],
)
def test_owner_and_admin_can_confirm_counter_payment(bill_context, token_key, staff_id_key, method):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

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


@pytest.mark.parametrize(
    ("token_key", "staff_id_key", "method"),
    [
        ("owner_token", "owner_id", "counter_cash"),
        ("owner_token", "owner_id", "counter_upi"),
        ("admin_token", "admin_id", "counter_cash"),
        ("admin_token", "admin_id", "counter_upi"),
    ],
)
def test_owner_and_admin_can_confirm_issued_bill_without_counter_handoff(
    bill_context, token_key, staff_id_key, method
):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    db = SessionLocal()
    bill_request = ServiceRequest(
        restaurant_id=bill_context["restaurant_id"],
        table_id=bill_context["table_id"],
        dining_session_id=bill_context["session_id"],
        request_type="bill",
        status="pending",
    )
    db.add(bill_request)
    db.commit()
    bill_request_id = bill_request.id
    db.close()

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

    db = SessionLocal()
    session = db.query(DiningSession).filter(
        DiningSession.id == bill_context["session_id"]
    ).one()
    resolved_request = db.query(ServiceRequest).filter(
        ServiceRequest.id == bill_request_id
    ).one()
    db.close()
    assert session.status == "closed"
    assert session.paid_at is not None
    assert session.closed_at is not None
    assert session.closed_by_staff_id == bill_context[staff_id_key]
    assert resolved_request.status == "resolved"
    assert resolved_request.resolved_at is not None
    assert resolved_request.resolved_by_staff_id == bill_context[staff_id_key]


def test_payment_confirmation_updates_queue_table_and_histories(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    paid = confirm_counter_payment(
        bill_context, issued["bill_number"], token_key="admin_token", method="counter_upi"
    )
    assert paid.status_code == 200

    pending = client.get(
        "/staff/bills/pending-payments",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    ).json()["items"]
    assert pending == []

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.status == "closed"
    assert session.closed_at is not None
    assert db.query(DiningSession).filter(
        DiningSession.table_id == bill_context["table_id"],
        DiningSession.status.in_(["open", "payment_requested", "payment_pending"]),
    ).count() == 0
    db.close()

    headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}
    bills = client.get("/admin/history/bills?preset=today", headers=headers).json()["items"]
    sessions = client.get("/admin/history/sessions?preset=today", headers=headers).json()["items"]
    assert any(row["bill_number"] == issued["bill_number"] and row["payment_status"] == "paid" for row in bills)
    assert any(row["session_token"] == bill_context["session_token"] and row["status"] == "closed" for row in sessions)

    requests = client.get("/staff/service-requests?status_filter=pending", headers=headers).json()
    assert all(request.get("request_type") != "payment_pending" for request in requests)


@pytest.mark.parametrize(("method"), ["counter_cash", "counter_upi"])
def test_staff_cannot_confirm_counter_payment(bill_context, method):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="staff_token",
        method=method,
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

    assert response.status_code in {401, 409}


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
    send_to_counter(bill_context, issued["bill_number"])

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


def test_kitchen_payment_authorization_failure_publishes_no_success_event(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    response = confirm_counter_payment(
        bill_context,
        issued["bill_number"],
        token_key="kitchen_token",
        method="counter_cash",
    )

    assert response.status_code == 403
    assert all(event.type != realtime.EVENT_BILL_PAID for event in published)


def test_staff_can_send_bill_to_counter(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context, token_key="owner_token")

    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    response = client.post(
        f"/staff/bills/{issued['bill_number']}/send-to-counter",
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "payment_pending"
    assert any(event.type == realtime.EVENT_BILL_SENT_TO_COUNTER for event in published)
    assert any(event.type == realtime.EVENT_BILL_PAYMENT_PENDING for event in published)
    sent_event = next(event for event in published if event.type == realtime.EVENT_BILL_SENT_TO_COUNTER)
    assert sent_event.restaurant_id == bill_context["restaurant_id"]
    assert "restaurant:%s:operations" % bill_context["restaurant_id"] in sent_event.channels


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
    send_to_counter(bill_context, issued["bill_number"])

    def confirm(method: str):
        local_client = TestClient(app)
        return local_client.post(
            f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
            json={"method": method},
            headers={
                "Authorization": f"Bearer {bill_context['owner_token']}",
                "Idempotency-Key": f"concurrent-{issued['bill_number']}-{method}",
            },
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(confirm, ["counter_cash", "counter_upi"]))

    statuses = sorted(response.status_code for response in responses)
    assert statuses == [200, 409]

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.restaurant_id == bill_context["restaurant_id"], Bill.bill_number == issued["bill_number"]).one()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert db.query(Payment).filter(Payment.bill_id == bill.id).count() == 1
    payment = db.query(Payment).filter(Payment.bill_id == bill.id).one()
    assert db.query(RevenueEntry).filter(RevenueEntry.payment_id == payment.id).count() == 1
    db.close()
    assert bill.status == "paid"
    assert session.status == "closed"
    assert bill.payment_method in {"counter_cash", "counter_upi"}


def test_payment_confirmation_racing_with_session_closure_is_consistent(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    def confirm_payment():
        local_client = TestClient(app)
        return local_client.post(
            f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
            json={"method": "counter_cash"},
            headers={
                "Authorization": f"Bearer {bill_context['owner_token']}",
                "Idempotency-Key": f"race-payment-{issued['bill_number']}",
            },
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
        return local_client.post(
            f"/public/sessions/{bill_context['session_token']}/bill",
            headers=participant_headers(bill_context["participant_token"]),
        )

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


def test_empty_session_closure_racing_with_bill_creation_repeated_20_times(bill_context):
    from app.services.table_participants import create_participant
    for i in range(20):
        db = SessionLocal()
        # Close any active session on table to satisfy unique constraint
        db.query(DiningSession).filter(
            DiningSession.table_id == bill_context["table_id"],
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        ).update({"status": "closed"}, synchronize_session=False)
        db.commit()

        token = f"race-sess-{uuid.uuid4().hex}"
        sess = DiningSession(
            restaurant_id=bill_context["restaurant_id"],
            table_id=bill_context["table_id"],
            public_token=token,
            status="open",
        )
        db.add(sess)
        db.flush()
        _, participant_token = create_participant(db, sess, "127.0.0.1", f"race-{i}")
        db.commit()
        db.close()

        def create_bill_request():
            local_client = TestClient(app)
            return local_client.post(
                f"/public/sessions/{token}/bill",
                headers={"X-Participant-Token": participant_token},
            )

        def close_session():
            local_client = TestClient(app)
            return local_client.post(
                f"/staff/sessions/{token}/close-empty",
                headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
            )

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = [future.result() for future in [executor.submit(create_bill_request), executor.submit(close_session)]]

        success_count = sum(r.status_code in {200, 201} for r in responses)
        assert success_count == 1, f"Iteration {i}: expected 1 success, got {success_count} (statuses: {[r.status_code for r in responses]})"
        assert any(r.status_code == 409 for r in responses), f"Iteration {i}: expected 1 conflict 409"


def test_savepoint_flush_error_preserves_sqlalchemy_session(bill_context):
    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    # Call enforce_session_action_rate
    from app.services.table_participants import enforce_session_action_rate
    enforce_session_action_rate(
        db, session, action="bill_create",
        ip_value="127.0.0.1", participant_token=bill_context["participant_token"],
        limit=5,
    )
    # Session must remain valid and usable for subsequent queries and commits
    assert db.is_active
    db.commit()
    db.close()


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
    send_to_counter(bill_context, issued["bill_number"])
    first = confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")
    assert first.status_code == 200

    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    second = confirm_counter_payment(bill_context, issued["bill_number"], token_key="admin_token", method="counter_upi")

    assert second.status_code == 409
    assert published == []


def test_repeated_send_to_counter_does_not_publish_duplicate_banner_event(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))

    first = send_to_counter(bill_context, issued["bill_number"])
    first_count = len(published)
    second = send_to_counter(bill_context, issued["bill_number"])

    assert first.status_code == 200
    assert second.status_code == 200
    assert first_count == 3
    assert len(published) == first_count


def test_invalid_payment_transition_rolls_back_bill_and_session(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    response = confirm_counter_payment(bill_context, issued["bill_number"], method="online")

    assert response.status_code == 422
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.restaurant_id == bill_context["restaurant_id"], Bill.bill_number == issued["bill_number"]).one()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    db.close()
    assert bill.status == "payment_pending"
    assert bill.payment_method is None
    assert session.status == "payment_pending"


def test_counter_payment_closes_session_and_blocks_old_session_orders(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

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


def test_paid_bill_receipt_survives_participant_revocation(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    assert len(issued["receipt_token"]) >= 40
    send_to_counter(bill_context, issued["bill_number"])
    paid = confirm_counter_payment(bill_context, issued["bill_number"], method="counter_upi")
    assert paid.status_code == 200

    revoked_read = client.get(
        f"/public/sessions/{bill_context['session_token']}/bill",
        headers=participant_headers(bill_context["participant_token"]),
    )
    assert revoked_read.status_code == 401

    receipt = client.get(f"/public/bills/{issued['receipt_token']}")
    assert receipt.status_code == 200
    body = receipt.json()
    assert body["status"] == "paid"
    assert body["payment_method"] == "counter_upi"
    assert body["paid_at"]
    assert body["invoice_number"] == paid.json()["invoice_number"]
    assert body["orders"] == paid.json()["orders"]

    legacy_alias = client.get(
        f"/public/sessions/{bill_context['session_token']}/bill",
        headers={"X-Receipt-Token": issued["receipt_token"]},
    )
    assert legacy_alias.status_code == 200
    assert legacy_alias.json()["bill_number"] == issued["bill_number"]


def test_detachment_releases_table_revokes_authority_and_stays_pending(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    code = detach_bill(bill_context, issued["bill_number"])

    assert len(code) == 6
    assert not set(code) & set("0O1I5S")
    status_response = client.get(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/session-status"
    )
    assert status_response.json() == {"occupied": False}

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    assert session.status == "detached_awaiting_payment"
    assert session.detached_at is not None
    assert session.detached_by_staff_id == bill_context["owner_id"]
    assert session.join_code_hash is None
    assert all(participant.revoked_at is not None for participant in session.participants)
    assert bill.status == "payment_pending"
    assert bill.payment_code_hash == payment_code_digest(bill_context["restaurant_id"], code)
    assert decrypt_payment_code(bill.payment_code_ciphertext) == code
    assert find_current_open_session_for_table(db, bill_context["table_id"]) is None
    db.close()

    pending = client.get(
        "/staff/bills/pending-payments",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    ).json()["items"]
    assert any(item["bill_number"] == issued["bill_number"] for item in pending)

    old_order = client.post(
        f"/public/sessions/{bill_context['session_token']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={
            **participant_headers(bill_context["participant_token"]),
            "Idempotency-Key": f"detached-order-{uuid.uuid4().hex}",
        },
    )
    assert old_order.status_code in {401, 409}
    join = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/join",
        json={"code": "0000", "device_id": uuid.uuid4().hex},
    )
    assert join.status_code == 404


def test_customer_bill_request_creates_draft_and_locks_customer_ordering(bill_context):
    add_order(bill_context)
    url = f"/public/sessions/{bill_context['session_token']}/bill-request"
    headers = participant_headers(bill_context["participant_token"])

    first = client.post(url, headers=headers)
    replay = client.post(url, headers=headers)

    assert first.status_code == replay.status_code == 201
    body = first.json()
    assert replay.json() == body
    assert body["status"] == "draft"
    assert body["session_status"] == "payment_requested"
    assert body["bill_number"]
    assert body["total_amount"] == "100.00"

    status_response = client.get(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/session-status"
    )
    assert status_response.json() == {"occupied": True}

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    bill = db.query(Bill).filter(Bill.dining_session_id == session.id).one()
    assert session.status == "payment_requested"
    assert bill.status == "draft"
    assert db.query(Bill).filter(Bill.dining_session_id == session.id).count() == 1
    db.close()

    # Staff/Admin issues and detaches the bill
    issued = issue_and_release(
        bill_context, body["bill_number"], key=f"admin-issue-{uuid.uuid4().hex}"
    )
    assert issued.status_code == 200
    assert issued.json()["bill_status"] == "payment_pending"
    assert issued.json()["payment_code"] and len(issued.json()["payment_code"]) == 6

    paid = confirm_counter_payment(bill_context, body["bill_number"])
    assert paid.status_code == 200


def test_concurrent_customer_bill_requests_return_one_bill(bill_context):
    add_order(bill_context)
    url = f"/public/sessions/{bill_context['session_token']}/bill-request"
    headers = participant_headers(bill_context["participant_token"])

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _index: client.post(url, headers=headers), range(2)))

    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json()["bill_number"] == responses[1].json()["bill_number"]

    db = SessionLocal()
    assert db.query(Bill).filter(Bill.dining_session_id == bill_context["session_id"]).count() == 1
    db.close()


def test_new_session_is_independent_and_old_detached_bill_remains_payable(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    detach_bill(bill_context, issued["bill_number"])

    created = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/sessions",
        headers={"X-Device-ID": uuid.uuid4().hex},
    )
    assert created.status_code == 201
    new_session_token = created.json()["session"]["public_id"]

    db = SessionLocal()
    active = db.query(DiningSession).filter(
        DiningSession.table_id == bill_context["table_id"],
        DiningSession.status.in_(("open", "payment_requested", "payment_pending")),
    ).all()
    assert len(active) == 1
    assert active[0].public_token == new_session_token
    db.close()

    paid = confirm_counter_payment(bill_context, issued["bill_number"])
    assert paid.status_code == 200

    db = SessionLocal()
    old_session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    new_session = db.query(DiningSession).filter(DiningSession.public_token == new_session_token).one()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    assert old_session.status == "closed"
    assert new_session.status == "open"
    assert bill.status == "paid"
    assert bill.payment_code_hash is None
    assert bill.payment_code_ciphertext is None
    assert db.query(Payment).filter(Payment.bill_id == bill.id).count() == 1
    db.close()

    duplicate = client.post(
        f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
        json={"method": "counter_upi"},
        headers={
            "Authorization": f"Bearer {bill_context['admin_token']}",
            "Idempotency-Key": f"second-payment-{uuid.uuid4().hex}",
        },
    )
    assert duplicate.status_code == 409


def test_payment_code_collision_retries_and_lookup_is_tenant_scoped(monkeypatch, bill_context):
    from app.services import bills as bill_service

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    collision_code = "A7K4P2"
    replacement_code = "B8L6Q3"

    db = SessionLocal()
    second_table = RestaurantTable(
        restaurant_id=bill_context["restaurant_id"],
        table_number=f"collision-{uuid.uuid4().hex[:6]}",
        table_code=f"collision-{uuid.uuid4().hex}",
        is_active=True,
    )
    db.add(second_table)
    db.flush()
    second_session = DiningSession(
        restaurant_id=bill_context["restaurant_id"],
        table_id=second_table.id,
        public_token=uuid.uuid4().hex,
        status="detached_awaiting_payment",
    )
    db.add(second_session)
    db.flush()
    blocker = Bill(
        restaurant_id=bill_context["restaurant_id"],
        dining_session_id=second_session.id,
        bill_number=f"COLLISION-{uuid.uuid4().hex}",
        status="payment_pending",
        subtotal=Decimal("1.00"),
        total_amount=Decimal("1.00"),
        payment_code_hash=payment_code_digest(bill_context["restaurant_id"], collision_code),
    )
    db.add(blocker)
    db.commit()
    db.close()

    candidates = iter((collision_code, replacement_code))
    monkeypatch.setattr(bill_service, "_new_payment_code", lambda: next(candidates))
    allocated = detach_bill(bill_context, issued["bill_number"])
    assert allocated == replacement_code

    db = SessionLocal()
    own = find_unresolved_bill_by_payment_code(
        db, restaurant_id=bill_context["restaurant_id"], code=replacement_code
    )
    cross_tenant = find_unresolved_bill_by_payment_code(
        db, restaurant_id=bill_context["other_restaurant_id"], code=replacement_code
    )
    db.close()
    assert own is not None and own.bill_number == issued["bill_number"]
    assert cross_tenant is None


def test_detachment_failure_rolls_back_every_change(monkeypatch, bill_context):
    from app.services import bills as bill_service

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    owner = db.query(StaffUser).filter(StaffUser.id == bill_context["owner_id"]).one()
    monkeypatch.setattr(
        bill_service,
        "_assign_unique_payment_code",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("injected failure")),
    )
    with pytest.raises(RuntimeError, match="injected failure"):
        detach_issued_bill_and_release_table(
            db,
            restaurant_id=bill_context["restaurant_id"],
            bill_id=bill.id,
            actor=owner,
        )
    db.commit()
    db.close()

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert bill.status == "issued"
    assert bill.payment_code_hash is None
    assert session.status == "payment_requested"
    assert session.detached_at is None
    assert any(participant.revoked_at is None for participant in session.participants)
    db.close()


def test_concurrent_detachment_has_one_winner(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    def attempt():
        db = SessionLocal()
        try:
            bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
            owner = db.query(StaffUser).filter(StaffUser.id == bill_context["owner_id"]).one()
            result = detach_issued_bill_and_release_table(
                db,
                restaurant_id=bill_context["restaurant_id"],
                bill_id=bill.id,
                actor=owner,
            )
            db.commit()
            return ("ok", result.payment_code)
        except HTTPException as exc:
            db.rollback()
            return ("conflict", exc.status_code)
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _value: attempt(), range(2)))
    assert [kind for kind, _value in outcomes].count("ok") == 1
    assert [kind for kind, _value in outcomes].count("conflict") == 1


def test_concurrent_detached_payment_creates_one_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    detach_bill(bill_context, issued["bill_number"])

    def pay(index):
        return client.post(
            f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
            json={"method": "counter_cash"},
            headers={
                "Authorization": f"Bearer {bill_context['owner_token']}",
                "Idempotency-Key": f"concurrent-payment-{index}-{uuid.uuid4().hex}",
            },
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(pay, range(2)))
    assert statuses.count(200) == 1
    assert statuses.count(409) == 1

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    assert db.query(Payment).filter(Payment.bill_id == bill.id).count() == 1
    db.close()


@pytest.mark.parametrize("token_key", ["owner_token", "admin_token"])
def test_issue_and_release_api_authorized_and_secret_safe(bill_context, token_key):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    response = issue_and_release(bill_context, issued["bill_number"], token_key=token_key)

    assert response.status_code == 200
    body = response.json()
    assert body["bill_number"] == issued["bill_number"]
    assert body["bill_status"] == "payment_pending"
    assert body["session_status"] == "detached_awaiting_payment"
    assert len(body["payment_code"]) == 6
    serialized = response.text.lower()
    assert "payment_code_hash" not in serialized
    assert "ciphertext" not in serialized
    assert "receipt_token" not in serialized
    assert "participant" not in serialized


def test_issue_and_release_api_permissions_idempotency_and_state_validation(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    denied = issue_and_release(bill_context, issued["bill_number"], token_key="staff_token")
    assert denied.status_code == 403

    key = f"detach-retry-{uuid.uuid4().hex}"
    first = issue_and_release(bill_context, issued["bill_number"], key=key)
    replay = issue_and_release(bill_context, issued["bill_number"], key=key)
    conflict = issue_and_release(bill_context, issued["bill_number"], key=key, confirm=False)
    assert first.status_code == replay.status_code == 200
    assert replay.json() == first.json()
    assert conflict.status_code == 409

    other_tenant = issue_and_release(
        bill_context, issued["bill_number"], token_key="other_token", key=f"other-{uuid.uuid4().hex}"
    )
    assert other_tenant.status_code == 404


def test_open_session_without_bill_request_cannot_detach(bill_context):
    add_order(bill_context)
    draft = create_bill(bill_context).json()
    response = issue_and_release(bill_context, draft["bill_number"])
    assert response.status_code == 409


def test_payment_code_lookup_scoping_expiry_and_safe_response(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    detached = issue_and_release(bill_context, issued["bill_number"]).json()
    code = detached["payment_code"]

    staff_lookup = client.post(
        "/staff/bills/payment-code/lookup",
        json={"payment_code": f"  {code.lower()}  "},
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    )
    assert staff_lookup.status_code == 200
    body = staff_lookup.json()
    assert body["bill_number"] == issued["bill_number"]
    assert body["can_confirm_payment"] is False
    assert body["order_summary"]["item_count"] == 1
    assert "payment_code" not in body
    assert "receipt_token" not in staff_lookup.text
    assert "ciphertext" not in staff_lookup.text

    cross_tenant = client.post(
        "/staff/bills/payment-code/lookup",
        json={"payment_code": code},
        headers={"Authorization": f"Bearer {bill_context['other_token']}"},
    )
    assert cross_tenant.status_code == 404
    assert cross_tenant.json()["detail"] == "Payment code was not found."

    invalid_format = client.post(
        "/staff/bills/payment-code/lookup",
        json={"payment_code": "O0I15S"},
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )
    assert invalid_format.status_code == 422

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    bill.payment_code_expires_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)
    db.commit()
    db.close()
    expired = client.post(
        "/staff/bills/payment-code/lookup",
        json={"payment_code": code},
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )
    assert expired.status_code == 404


def test_payment_code_lookup_rate_limit_and_audit_never_store_plain_code(monkeypatch, bill_context):
    from app.services import bills as bill_service

    monkeypatch.setattr(bill_service, "PAYMENT_CODE_LOOKUP_LIMIT", 2)
    attempted_code = "A7K4P2"
    headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}
    assert client.post(
        "/staff/bills/payment-code/lookup", json={"payment_code": attempted_code}, headers=headers
    ).status_code == 404
    assert client.post(
        "/staff/bills/payment-code/lookup", json={"payment_code": attempted_code}, headers=headers
    ).status_code == 404
    limited = client.post(
        "/staff/bills/payment-code/lookup", json={"payment_code": attempted_code}, headers=headers
    )
    assert limited.status_code == 429
    assert limited.headers["retry-after"]

    db = SessionLocal()
    attempt = db.query(PaymentCodeLookupAttempt).filter(
        PaymentCodeLookupAttempt.restaurant_id == bill_context["restaurant_id"],
        PaymentCodeLookupAttempt.actor_user_id == bill_context["owner_id"],
    ).one()
    audits = db.query(AuditLog).filter(
        AuditLog.restaurant_id == bill_context["restaurant_id"],
        AuditLog.action == "payment_code_lookup_rate_limited",
    ).all()
    assert attempt.attempt_count == 2
    assert attempt.failed_count == 2
    assert audits
    assert attempted_code not in "".join((audit.new_value or "") + (audit.previous_value or "") for audit in audits)
    db.close()


def test_lookup_audits_success_and_staff_still_cannot_confirm(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    code = issue_and_release(bill_context, issued["bill_number"]).json()["payment_code"]
    lookup = client.post(
        "/staff/bills/payment-code/lookup",
        json={"payment_code": code},
        headers={"Authorization": f"Bearer {bill_context['staff_token']}"},
    )
    assert lookup.status_code == 200
    denied = confirm_counter_payment(
        bill_context, issued["bill_number"], token_key="staff_token"
    )
    assert denied.status_code == 403

    db = SessionLocal()
    audit = db.query(AuditLog).filter(
        AuditLog.restaurant_id == bill_context["restaurant_id"],
        AuditLog.action == "payment_code_lookup_succeeded",
    ).one()
    attempt = db.query(PaymentCodeLookupAttempt).filter(
        PaymentCodeLookupAttempt.restaurant_id == bill_context["restaurant_id"],
        PaymentCodeLookupAttempt.actor_user_id == bill_context["staff_id"],
    ).one()
    assert code not in (audit.new_value or "")
    assert attempt.successful_count == 1
    db.close()


def test_issue_release_and_detached_payment_realtime_are_safe(monkeypatch, bill_context):
    from app.services import realtime

    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))
    detached = issue_and_release(bill_context, issued["bill_number"])
    assert detached.status_code == 200
    code = detached.json()["payment_code"]

    event = next(item for item in published if item.type == "bill.detached_for_payment")
    assert event.state["session_status"] == "detached_awaiting_payment"
    assert event.state["original_table_id"] == bill_context["table_id"]
    assert event.event_id
    assert event.timestamp
    assert code not in json.dumps(event.state)
    assert "payment_code" not in json.dumps(event.state)
    customer_payload = event.public_payload()
    assert customer_payload["state"]["restaurant_id"] == bill_context["restaurant_id"]
    assert customer_payload["state"]["original_session_id"] == bill_context["session_id"]
    assert code not in json.dumps(customer_payload)

    created = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/sessions",
        headers={"X-Device-ID": uuid.uuid4().hex},
    )
    assert created.status_code == 201
    new_token = created.json()["session"]["public_id"]
    published.clear()
    paid = confirm_counter_payment(bill_context, issued["bill_number"])
    assert paid.status_code == 200
    table_event = next(item for item in published if item.type == "table.status_changed")
    assert table_event.state == {"status": "open", "session_token": new_token}

    db = SessionLocal()
    new_session = db.query(DiningSession).filter(DiningSession.public_token == new_token).one()
    old_bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    assert new_session.status == "open"
    assert old_bill.status == "paid"
    assert old_bill.payment_code_hash is None
    assert old_bill.payment_code_ciphertext is None
    assert db.query(AuditLog).filter(
        AuditLog.target_id == str(old_bill.id),
        AuditLog.action == "payment_code_invalidated",
    ).count() == 1
    db.close()


def test_concurrent_lookup_and_payment_preserve_detached_bill_integrity(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    code = issue_and_release(bill_context, issued["bill_number"]).json()["payment_code"]

    def lookup():
        return client.post(
            "/staff/bills/payment-code/lookup",
            json={"payment_code": code},
            headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
        ).status_code

    def pay():
        return client.post(
            f"/staff/bills/{issued['bill_number']}/confirm-counter-payment",
            json={"method": "counter_cash"},
            headers={
                "Authorization": f"Bearer {bill_context['owner_token']}",
                "Idempotency-Key": f"lookup-payment-{uuid.uuid4().hex}",
            },
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        lookup_status = executor.submit(lookup)
        payment_status = executor.submit(pay)
        outcomes = (lookup_status.result(), payment_status.result())
    assert outcomes[0] in {200, 404}
    assert outcomes[1] == 200

    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued["bill_number"]).one()
    assert bill.status == "paid"
    assert db.query(Payment).filter(Payment.bill_id == bill.id).count() == 1
    db.close()

def test_receipt_authority_is_unforgeable_and_restaurant_scoped(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)

    assert client.get("/public/bills/not-a-valid-receipt").status_code == 404
    wrong_tenant = client.get(
        f"/public/restaurants/other-bill-cafe/bills/{issued['receipt_token']}"
    )
    assert wrong_tenant.status_code == 404
    correct_tenant = client.get(
        f"/public/restaurants/{bill_context['restaurant_slug']}/bills/{issued['receipt_token']}"
    )
    assert correct_tenant.status_code == 200


def test_revoked_participant_cannot_order_after_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"])

    response = client.post(
        f"/public/sessions/{bill_context['session_token']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={
            **participant_headers(bill_context["participant_token"]),
            "Idempotency-Key": f"revoked-{uuid.uuid4().hex}",
        },
    )
    assert response.status_code in {401, 409}


def test_paid_bill_response_includes_table_identity_for_customer_cleanup(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    paid = confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")

    assert paid.status_code == 200
    body = paid.json()
    assert body["status"] == "paid"
    assert body["restaurant_slug"] == bill_context["restaurant_slug"]
    assert body["table_code"] == bill_context["table_code"]


def test_new_session_can_start_for_same_table_after_counter_payment(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")

    client.forget_table_authority(bill_context["restaurant_slug"], bill_context["table_code"])
    response = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["dining_session_token"] != bill_context["session_token"]

    old_session_order = client.post(
        f"/public/sessions/{bill_context['session_token']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"},
    )
    assert old_session_order.status_code == 409


def test_paid_customer_data_is_isolated_from_fresh_qr_scan_and_new_session(bill_context):
    customer_a_order_token = add_order(bill_context, item_name="Customer A Item")
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    paid = confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")
    assert paid.status_code == 200

    active_lookup = client.get(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/session"
    )
    assert active_lookup.status_code == 404

    menu_response = client.get(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/menu"
    )
    assert menu_response.status_code == 200
    menu_body = menu_response.json()
    assert set(menu_body.keys()) == {"restaurant", "table", "categories"}
    assert "orders" not in menu_body
    assert "bill" not in menu_body
    assert "payment_status" not in menu_body
    assert "receipt" not in menu_body

    client.forget_table_authority(bill_context["restaurant_slug"], bill_context["table_code"])
    customer_b_order = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={"Idempotency-Key": f"idemp-{uuid.uuid4().hex}"},
    )
    assert customer_b_order.status_code == 201
    customer_b_token = customer_b_order.json()["dining_session_token"]
    assert customer_b_token != bill_context["session_token"]

    customer_b_session = client.get(f"/public/sessions/{customer_b_token}")
    assert customer_b_session.status_code == 200
    customer_b_body = customer_b_session.json()
    assert customer_b_body["public_token"] == customer_b_token
    assert customer_b_body["order_count"] == 1
    assert customer_b_body["bill"] is None
    assert customer_b_body["service_requests"] == []
    assert customer_b_body["orders"][0]["public_token"] != customer_a_order_token
    assert customer_b_body["orders"][0]["items"][0]["item_name"] != "Customer A Item"

    customer_a_receipt = client.get(f"/public/sessions/{bill_context['session_token']}/bill")
    assert customer_a_receipt.status_code == 401

    customer_b_bill_from_a_receipt = client.get(f"/public/sessions/{customer_b_token}/bill")
    assert customer_b_bill_from_a_receipt.status_code == 404

    customer_a_session = client.get(f"/public/sessions/{bill_context['session_token']}")
    assert customer_a_session.status_code == 401


def test_paid_bill_generation_returns_existing_paid_bill(bill_context):
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"], method="counter_cash")

    response = create_bill(bill_context)

    assert response.status_code == 401
    db = SessionLocal()
    assert db.query(Bill).filter(Bill.bill_number == issued["bill_number"], Bill.status == "paid").count() == 1
    db.close()


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
    second_table_code = table.table_code
    db.close()

    authority = authorize_existing_session(
        client,
        bill_context["restaurant_slug"],
        second_table_code,
        second_token,
        {"Authorization": f"Bearer {bill_context['owner_token']}"},
    )
    second = client.post(
        f"/public/sessions/{second_token}/bill",
        headers=participant_headers(authority["participant_token"]),
    ).json()

    assert second["bill_number"] != first["bill_number"]


def test_concurrent_generation_creates_one_bill(bill_context):
    add_order(bill_context)

    def submit():
        local_client = TestClient(app)
        return local_client.post(
            f"/public/sessions/{bill_context['session_token']}/bill",
            headers=participant_headers(bill_context["participant_token"]),
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: submit(), range(2)))

    assert [response.status_code for response in responses] == [201, 201]
    numbers = {response.json()["bill_number"] for response in responses}
    assert len(numbers) == 1

    db = SessionLocal()
    bill_count = db.query(Bill).filter(Bill.dining_session_id == bill_context["session_id"]).count()
    db.close()
    assert bill_count == 1


def _enable_gst(bill_context, *, rate="5.00", mode="exclusive", prefix="MM"):
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_context["restaurant_id"]).one()
    restaurant.gst_enabled = True
    restaurant.gstin = "32ABCDE1234F1Z5"
    restaurant.legal_business_name = "Malabar Meals Private Limited"
    restaurant.registered_billing_address = "MG Road, Kochi, Kerala"
    restaurant.gst_state_name = "Kerala"
    restaurant.gst_state_code = "32"
    restaurant.default_gst_rate = Decimal(rate)
    restaurant.tax_mode = mode
    restaurant.invoice_prefix = prefix
    db.commit()
    db.close()


def test_gst_disabled_preserves_existing_bill_totals(bill_context):
    add_order(bill_context)
    bill = create_bill(bill_context).json()
    assert bill["gst_enabled"] is False
    assert bill["subtotal"] == "100.00"
    assert bill["tax_amount"] == "0.00"
    assert bill["total_amount"] == "100.00"
    assert bill["invoice_number"] is None


def test_five_percent_exclusive_gst_and_cgst_sgst_split(bill_context):
    _enable_gst(bill_context, mode="exclusive")
    add_order(bill_context)
    bill = create_bill(bill_context).json()
    assert bill["gst_enabled"] is True
    assert bill["taxable_amount"] == "100.00"
    assert bill["gst_rate"] == "5.00"
    assert bill["cgst_amount"] == "2.50"
    assert bill["sgst_amount"] == "2.50"
    assert bill["igst_amount"] == "0.00"
    assert bill["tax_amount"] == "5.00"
    assert bill["total_amount"] == "105.00"
    assert bill["invoice_number"] is None
    issued = client.post(
        f"/staff/bills/{bill['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}", "Idempotency-Key": "issue-exclusive-gst"},
    ).json()
    assert issued["invoice_number"].endswith("/000001")


def test_five_percent_inclusive_gst(bill_context):
    _enable_gst(bill_context, mode="inclusive")
    add_order(bill_context)
    bill = create_bill(bill_context).json()
    assert bill["subtotal"] == "100.00"
    assert bill["taxable_amount"] == "95.24"
    assert bill["cgst_amount"] == "2.38"
    assert bill["sgst_amount"] == "2.38"
    assert bill["tax_amount"] == "4.76"
    assert bill["total_amount"] == "100.00"


def test_discount_is_applied_before_gst_and_decimal_rounding():
    totals = calculate_gst_totals(
        subtotal=Decimal("99.99"),
        discount_amount=Decimal("9.99"),
        gst_rate=Decimal("5.00"),
        tax_mode="exclusive",
    )
    assert totals.taxable_amount == Decimal("90.00")
    assert totals.cgst_amount == Decimal("2.25")
    assert totals.sgst_amount == Decimal("2.25")
    assert totals.total_amount == Decimal("94.50")

    rounded = calculate_gst_totals(
        subtotal=Decimal("99.99"),
        discount_amount=Decimal("0.00"),
        gst_rate=Decimal("5.00"),
        tax_mode="exclusive",
    )
    assert rounded.cgst_amount == Decimal("2.50")
    assert rounded.sgst_amount == Decimal("2.50")
    assert rounded.total_amount == Decimal("104.99")


def test_gst_rate_is_applied_before_split_for_exact_360_regression():
    totals = calculate_gst_totals(
        subtotal=Decimal("360.00"), discount_amount=Decimal("0.00"),
        gst_rate=Decimal("5.00"), tax_mode="exclusive",
    )
    assert totals.tax_amount == Decimal("18.00")
    assert totals.cgst_amount == Decimal("9.00")
    assert totals.sgst_amount == Decimal("9.00")
    assert totals.total_amount == Decimal("378.00")

    interstate = calculate_gst_totals(
        subtotal=Decimal("360.00"), discount_amount=Decimal("0.00"),
        gst_rate=Decimal("5.00"), tax_mode="exclusive", interstate=True,
    )
    assert interstate.cgst_amount == interstate.sgst_amount == Decimal("0.00")
    assert interstate.igst_amount == Decimal("18.00")
    assert interstate.total_amount == Decimal("378.00")


def test_gst_bill_snapshots_are_immutable_after_settings_change(bill_context):
    _enable_gst(bill_context, rate="5.00", prefix="MM")
    add_order(bill_context)
    generated = create_bill(bill_context).json()

    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_context["restaurant_id"]).one()
    restaurant.gstin = "29ABCDE1234F1Z7"
    restaurant.legal_business_name = "Changed Legal Name"
    restaurant.default_gst_rate = Decimal("18.00")
    restaurant.invoice_prefix = "NEW"
    db.commit()
    db.close()

    issued = client.post(
        f"/staff/bills/{generated['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    ).json()
    assert issued["gst_rate"] == "5.00"
    assert issued["gstin"] == "32ABCDE1234F1Z5"
    assert issued["legal_business_name"] == "Malabar Meals Private Limited"
    assert generated["invoice_number"] is None
    # The number and its then-current prefix are allocated only at issuance.
    assert issued["invoice_number"].startswith("NEW/")
    assert issued["total_amount"] == generated["total_amount"]


def test_historic_non_gst_bill_remains_unchanged_after_gst_is_enabled(bill_context):
    add_order(bill_context)
    historic = create_bill(bill_context).json()
    _enable_gst(bill_context, rate="18.00")
    issued = client.post(
        f"/staff/bills/{historic['bill_number']}/issue",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    ).json()
    assert issued["gst_enabled"] is False
    assert issued["invoice_number"] is None
    assert issued["tax_amount"] == "0.00"
    assert issued["total_amount"] == "100.00"


def test_indian_financial_year_resets_on_april_first():
    assert indian_financial_year(datetime.date(2027, 3, 31)) == "2026-27"
    assert indian_financial_year(datetime.date(2027, 4, 1)) == "2027-28"


def test_invoice_sequence_resets_by_financial_year_and_is_restaurant_scoped(bill_context):
    _enable_gst(bill_context, prefix="MM")
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_context["restaurant_id"]).one()
    first, _ = generate_invoice_number(
        db, restaurant, now=datetime.datetime(2027, 3, 31, 12, tzinfo=datetime.timezone.utc)
    )
    second, _ = generate_invoice_number(
        db, restaurant, now=datetime.datetime(2027, 4, 1, 12, tzinfo=datetime.timezone.utc)
    )
    other = db.query(Restaurant).filter(Restaurant.id == bill_context["other_restaurant_id"]).one()
    other.invoice_prefix = "OT"
    other_first, _ = generate_invoice_number(
        db, other, now=datetime.datetime(2027, 3, 31, 12, tzinfo=datetime.timezone.utc)
    )
    db.commit()
    db.close()
    assert first == "MM/2026-27/000001"
    assert second == "MM/2027-28/000001"
    assert other_first == "OT/2026-27/000001"


def test_cancelled_draft_does_not_consume_invoice_number(bill_context):
    _enable_gst(bill_context, prefix="MM")
    add_order(bill_context)
    generated = create_bill(bill_context).json()
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == generated["bill_number"]).one()
    bill.status = "cancelled"
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_context["restaurant_id"]).one()
    next_number, _ = generate_invoice_number(db, restaurant)
    db.commit()
    db.close()
    assert generated["invoice_number"] is None
    assert next_number.endswith("/000001")


def test_concurrent_invoice_generation_is_unique(bill_context):
    _enable_gst(bill_context, prefix="MM")

    def allocate(_):
        db = SessionLocal()
        restaurant = db.query(Restaurant).filter(Restaurant.id == bill_context["restaurant_id"]).one()
        number, _ = generate_invoice_number(db, restaurant)
        db.commit()
        db.close()
        return number

    with ThreadPoolExecutor(max_workers=6) as executor:
        numbers = list(executor.map(allocate, range(12)))
    assert len(set(numbers)) == 12
    assert sorted(int(number.rsplit("/", 1)[1]) for number in numbers) == list(range(1, 13))


# ---------------------------------------------------------------------------
# Post-payment lifecycle regression tests
# Scope: explicit checks for the invariants that are most critical for
#   customer-lifecycle correctness but were NOT individually asserted above.
# ---------------------------------------------------------------------------

def test_payment_revokes_all_active_participant_tokens(bill_context):
    """All TableSessionParticipant rows for the session must have revoked_at set after payment."""
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    active_before = sum(1 for p in session.participants if p.revoked_at is None)
    db.close()
    assert active_before >= 1, "at least one active participant must exist before payment"

    paid = confirm_counter_payment(bill_context, issued["bill_number"])
    assert paid.status_code == 200

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    db.refresh(session)
    still_active = [p for p in session.participants if p.revoked_at is None]
    assert still_active == [], f"expected all tokens revoked after payment; {len(still_active)} remain active"
    db.close()


def test_payment_clears_join_code_from_session(bill_context):
    """Session join code hash must be cleared after payment so no new device can join."""
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.join_code_hash is not None, "join code hash must exist before payment"
    db.close()

    paid = confirm_counter_payment(bill_context, issued["bill_number"])
    assert paid.status_code == 200

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.join_code_hash is None, "join code hash must be cleared after payment"
    db.close()


def test_old_participant_cannot_request_service_after_payment(bill_context):
    """A revoked participant token must not be able to submit a service request after payment."""
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"])

    response = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/service-requests",
        json={"request_type": "water"},
        headers=participant_headers(bill_context["participant_token"]),
    )
    assert response.status_code == 401


def test_receipt_token_cannot_be_used_to_place_an_order(bill_context):
    """A receipt_token grants read-only bill access only; it must not authorise ordering."""
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"])

    # Attempt to place an order using the receipt token as a participant token
    response = client.post(
        f"/public/sessions/{bill_context['session_token']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={
            "Idempotency-Key": uuid.uuid4().hex,
            "X-Participant-Token": issued["receipt_token"],
        },
    )
    assert response.status_code in (401, 409)


def test_new_customer_after_full_payment_cannot_access_old_session_or_bill(bill_context):
    """
    After a full payment cycle (not just detachment), a new session at the same
    table must be completely isolated from the previous session and its bill.

    Tests the explicit requirement: 'the new session cannot access any previous
    customer, participant, bill or receipt data'.
    """
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"])

    # Create a new session at the same table
    new_session_resp = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/sessions",
        headers={"X-Device-ID": uuid.uuid4().hex},
    )
    assert new_session_resp.status_code == 201
    new_body = new_session_resp.json()
    new_token = new_body["session"]["public_id"]
    new_participant_token = new_body["participant_token"]

    # New participant must NOT be able to see the old session
    old_session_read = client.get(
        f"/public/sessions/{bill_context['session_token']}",
        headers={"X-Participant-Token": new_participant_token},
    )
    assert old_session_read.status_code in (401, 403, 404), (
        "new participant must not be able to read old session"
    )

    # New participant must NOT be able to read the old bill via participant authority
    old_bill_read = client.get(
        f"/public/sessions/{bill_context['session_token']}/bill",
        headers={"X-Participant-Token": new_participant_token},
    )
    assert old_bill_read.status_code in (401, 403, 404), (
        "new participant must not be able to read old bill via participant token"
    )

    # Old participant must NOT be able to read the new session
    new_session_read = client.get(
        f"/public/sessions/{new_token}",
        headers=participant_headers(bill_context["participant_token"]),
    )
    assert new_session_read.status_code == 401, (
        "revoked old participant token must not be valid for new session"
    )

    # The new session must be independent: has its own public token
    assert new_token != bill_context["session_token"]

    # The old receipt is still accessible via receipt token (not via participant)
    receipt_read = client.get(f"/public/bills/{issued['receipt_token']}")
    assert receipt_read.status_code == 200
    assert receipt_read.json()["status"] == "paid"


def test_staff_can_complete_payment_without_customer_websocket(bill_context):
    """
    Payment confirmation is purely a staff-side action.  It must succeed even
    when called directly by staff with no customer WebSocket connected, and the
    bill must become paid + session must become closed.
    """
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])

    # Confirm without any customer connection (no WS; just staff HTTP call)
    paid = confirm_counter_payment(bill_context, issued["bill_number"], token_key="owner_token")
    assert paid.status_code == 200

    body = paid.json()
    assert body["status"] == "paid"
    assert body["payment_method"] == "counter_cash"

    db = SessionLocal()
    session = db.query(DiningSession).filter(DiningSession.id == bill_context["session_id"]).one()
    assert session.status == "closed"
    assert session.paid_at is not None
    assert session.closed_at is not None
    db.close()


def test_new_session_after_full_payment_has_independent_join_code(bill_context):
    """
    After a complete payment cycle, the new session at the same table must have
    its own independent join authority — old join code must not work.
    """
    add_order(bill_context)
    issued = issue_bill_for(bill_context)
    send_to_counter(bill_context, issued["bill_number"])
    confirm_counter_payment(bill_context, issued["bill_number"])

    new_session_resp = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/"
        f"{bill_context['table_code']}/sessions",
        headers={"X-Device-ID": uuid.uuid4().hex},
    )
    assert new_session_resp.status_code == 201
    new_body = new_session_resp.json()

    # New session has its own join code
    assert new_body["join_code"].isdigit()
    assert len(new_body["join_code"]) == 4
    assert new_body["session"]["public_id"] != bill_context["session_token"]


def test_draft_bill_recalculates_on_late_staff_order_and_freezes_on_issue(bill_context):
    add_order(bill_context)
    url = f"/public/sessions/{bill_context['session_token']}/bill-request"
    headers = participant_headers(bill_context["participant_token"])
    staff_headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}

    req = client.post(url, headers=headers)
    assert req.status_code == 201
    draft = req.json()
    assert draft["status"] == "draft"
    assert draft["total_amount"] == "100.00"

    # Customer ordering is blocked during bill review
    customer_blocked = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/orders",
        headers={**headers, "Idempotency-Key": f"cust-late-{uuid.uuid4().hex}"},
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}], "customer_note": ""},
    )
    assert customer_blocked.status_code == 409

    # Authorized staff adds a late item (Pepsi ₹100) before issuance
    staff_order = client.post(
        f"/staff/tables/{bill_context['table_id']}/orders",
        headers={**staff_headers, "Idempotency-Key": f"staff-late-{uuid.uuid4().hex}"},
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
    )
    assert staff_order.status_code == 201

    # Provisional bill recalculates subtotal and grand total
    provisional = client.get(f"/staff/bills/{draft['bill_number']}", headers=staff_headers).json()
    assert provisional["status"] == "draft"
    assert provisional["total_amount"] == "200.00"
    assert len(provisional["orders"]) == 2

    # Issue Bill allocates invoice number and freezes official bill
    issued = client.post(
        f"/staff/bills/{draft['bill_number']}/issue",
        headers={**staff_headers, "Idempotency-Key": f"issue-{draft['bill_number']}"},
    )
    assert issued.status_code == 200
    issued_dict = issued.json()
    assert issued_dict["status"] == "issued"
    assert issued_dict["total_amount"] == "200.00"

    # Post-issuance staff ordering is blocked
    staff_blocked_post = client.post(
        f"/staff/tables/{bill_context['table_id']}/orders",
        headers={**staff_headers, "Idempotency-Key": f"staff-late-post-{uuid.uuid4().hex}"},
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
    )
    assert staff_blocked_post.status_code == 409


def test_concurrent_issue_and_staff_order_are_serialized_safely(bill_context):
    add_order(bill_context)
    draft = client.post(
        f"/public/sessions/{bill_context['session_token']}/bill-request",
        headers=participant_headers(bill_context["participant_token"]),
    ).json()
    staff_headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}

    def issue():
        return client.post(
            f"/staff/bills/{draft['bill_number']}/issue",
            headers={**staff_headers, "Idempotency-Key": f"race-issue-{uuid.uuid4().hex}"},
        )

    def order():
        return client.post(
            f"/staff/tables/{bill_context['table_id']}/orders",
            headers={**staff_headers, "Idempotency-Key": f"race-order-{uuid.uuid4().hex}"},
            json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        issue_response, order_response = [future.result() for future in (
            executor.submit(issue), executor.submit(order)
        )]

    assert issue_response.status_code == 200
    assert order_response.status_code in {201, 409}
    final_bill = client.get(
        f"/staff/bills/{draft['bill_number']}", headers=staff_headers
    ).json()
    assert final_bill["status"] == "issued"
    expected_total = "200.00" if order_response.status_code == 201 else "100.00"
    assert final_bill["total_amount"] == expected_total
    assert sum(Decimal(order["subtotal"]) for order in final_bill["orders"]) == Decimal(expected_total)

    blocked = order()
    assert blocked.status_code == 409


@pytest.mark.parametrize("token_key", ["owner_token", "admin_token"])
def test_management_can_reopen_ordering_before_issue(bill_context, token_key):
    add_order(bill_context)
    draft = client.post(
        f"/public/sessions/{bill_context['session_token']}/bill-request",
        headers=participant_headers(bill_context["participant_token"]),
    ).json()
    headers = {"Authorization": f"Bearer {bill_context[token_key]}"}

    reopened = client.post(
        f"/staff/bills/{draft['bill_number']}/reopen-ordering",
        json={"reason": "Customer wants another item"},
        headers=headers,
    )
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "draft"
    assert reopened.json()["session_status"] == "open"
    assert reopened.json()["receipt_token"] is None

    customer_order = client.post(
        f"/public/restaurants/{bill_context['restaurant_slug']}/tables/{bill_context['table_code']}/orders",
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
        headers={
            **participant_headers(bill_context["participant_token"]),
            "Idempotency-Key": f"reopened-{uuid.uuid4().hex}",
        },
    )
    assert customer_order.status_code == 201
    db = SessionLocal()
    audit = db.query(AuditLog).filter(
        AuditLog.restaurant_id == bill_context["restaurant_id"],
        AuditLog.action == "ordering.reopened",
    ).one()
    assert "Customer wants another item" in audit.new_value
    db.close()


def test_reopen_ordering_is_blocked_after_issue_and_tenant_scoped(bill_context):
    add_order(bill_context)
    draft = create_bill(bill_context).json()
    owner_headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}
    other_headers = {"Authorization": f"Bearer {bill_context['other_token']}"}
    assert client.post(
        f"/staff/bills/{draft['bill_number']}/reopen-ordering",
        json={"reason": "Cross tenant attempt"},
        headers=other_headers,
    ).status_code == 404
    issued = client.post(
        f"/staff/bills/{draft['bill_number']}/issue",
        headers={**owner_headers, "Idempotency-Key": f"issue-{uuid.uuid4().hex}"},
    )
    assert issued.status_code == 200
    blocked = client.post(
        f"/staff/bills/{draft['bill_number']}/reopen-ordering",
        json={"reason": "Too late"},
        headers=owner_headers,
    )
    assert blocked.status_code == 409


def test_post_request_normal_and_served_entry_paths_are_distinct(bill_context):
    add_order(bill_context)
    draft = client.post(
        f"/public/sessions/{bill_context['session_token']}/bill-request",
        headers=participant_headers(bill_context["participant_token"]),
    ).json()
    headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}

    normal = client.post(
        f"/staff/tables/{bill_context['table_id']}/orders",
        headers={**headers, "Idempotency-Key": f"normal-{uuid.uuid4().hex}"},
        json={"items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}]},
    )
    assert normal.status_code == 201
    assert normal.json()["status"] == "pending"

    served = client.post(
        f"/staff/tables/{bill_context['table_id']}/served-items",
        headers={**headers, "Idempotency-Key": f"served-{uuid.uuid4().hex}"},
        json={
            "items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}],
            "late_entry_reason": "Delivered before the missing ticket was noticed",
        },
    )
    assert served.status_code == 201
    assert served.json()["status"] == "served"

    refreshed = client.get(f"/staff/bills/{draft['bill_number']}", headers=headers).json()
    assert refreshed["total_amount"] == "300.00"
    issued = client.post(
        f"/staff/bills/{draft['bill_number']}/issue",
        headers={**headers, "Idempotency-Key": f"issue-{uuid.uuid4().hex}"},
    )
    assert issued.status_code == 200
    blocked = client.post(
        f"/staff/tables/{bill_context['table_id']}/served-items",
        headers={**headers, "Idempotency-Key": f"served-blocked-{uuid.uuid4().hex}"},
        json={
            "items": [{"menu_item_id": bill_context["item_id"], "quantity": 1}],
            "late_entry_reason": "Should be blocked",
        },
    )
    assert blocked.status_code == 409


def test_receipt_payload_endpoint_returns_authoritative_data(bill_context):
    order_token = add_order(bill_context)
    db = SessionLocal()
    order = db.query(Order).filter(Order.public_token == order_token).one()
    item = db.query(OrderItem).filter(OrderItem.order_id == order.id).one()
    db.add(OrderItemSelectedOption(
        order_item_id=item.id,
        option_name="Large",
        group_name="Size",
        option_type="single",
        price_delta=Decimal("0.00"),
        quantity=1,
    ))
    db.commit()
    db.close()
    issued_dict = issue_bill_for(bill_context)
    issued_number = issued_dict["bill_number"]
    staff_headers = {"Authorization": f"Bearer {bill_context['owner_token']}"}
    payload_resp = client.get(
        f"/staff/bills/{issued_number}/receipt-payload",
        headers=staff_headers,
    )
    assert payload_resp.status_code == 200
    payload = payload_resp.json()
    assert payload["bill_number"] == issued_number
    assert payload["receipt_title"] == "TAX INVOICE"
    assert payload["grand_total"] == "100.00"
    assert len(payload["items"]) == 1
    assert payload["items"][0] == {
        "name": "Original Item",
        "quantity": 1,
        "unit_price": "100.00",
        "line_total": "100.00",
        "options": ["Size: Large"],
    }

    public_payload = client.get(
        f"/public/bills/{issued_dict['receipt_token']}/receipt-payload"
    )
    assert public_payload.status_code == 200
    assert client.get("/public/bills/invalid-token/receipt-payload").status_code == 404

    cross_tenant = client.get(
        f"/staff/bills/{issued_number}/receipt-payload",
        headers={"Authorization": f"Bearer {bill_context['other_token']}"},
    )
    assert cross_tenant.status_code == 404
    assert client.get(f"/staff/bills/{issued_number}/receipt-payload").status_code == 401

    send_to_counter(bill_context, issued_number)
    confirm_counter_payment(bill_context, issued_number)
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued_number).one()
    before = (bill.status, bill.total_amount, db.query(Payment).filter(Payment.bill_id == bill.id).count())
    db.close()
    paid_payload = client.get(
        f"/public/bills/{issued_dict['receipt_token']}/receipt-payload"
    )
    assert paid_payload.status_code == 200
    assert paid_payload.json()["status"] == "paid"
    assert paid_payload.json()["receipt_title"] == "PAYMENT RECEIPT"
    db = SessionLocal()
    bill = db.query(Bill).filter(Bill.bill_number == issued_number).one()
    after = (bill.status, bill.total_amount, db.query(Payment).filter(Payment.bill_id == bill.id).count())
    db.close()
    assert after == before


def test_staff_receipt_payload_rejects_draft_bill(bill_context):
    add_order(bill_context)
    draft = create_bill(bill_context).json()
    response = client.get(
        f"/staff/bills/{draft['bill_number']}/receipt-payload",
        headers={"Authorization": f"Bearer {bill_context['owner_token']}"},
    )
    assert response.status_code == 404
    assert client.get(
        f"/public/bills/{draft['receipt_token']}/receipt-payload"
    ).status_code == 404


def test_receipt_response_schema_enforces_canonical_item_contract():
    payload = {
        "bill_number": "BILL-1",
        "invoice_number": None,
        "receipt_title": "TAX INVOICE",
        "status": "issued",
        "restaurant_name": "OMLU Cafe",
        "legal_business_name": "OMLU Cafe",
        "address": "Kochi",
        "table_number": "4",
        "staff_name": "Staff",
        "created_at": "2026-08-05T10:00:00Z",
        "items": [{
            "name": "A very long configured meal name",
            "quantity": 2,
            "unit_price": "75.00",
            "line_total": "150.00",
            "options": ["Size: Large", "Drink: Lime"],
        }],
        "subtotal": "150.00",
        "discount_amount": "0.00",
        "taxable_amount": "150.00",
        "cgst_amount": "3.75",
        "sgst_amount": "3.75",
        "igst_amount": "0.00",
        "tax_amount": "7.50",
        "grand_total": "157.50",
        "currency": "INR",
        "gst_enabled": True,
        "payment_status": "UNPAID",
        "is_official_invoice": True,
    }
    validated = ReceiptPayloadResponse.model_validate(payload)
    assert validated.items[0].line_total == Decimal("150.00")
    assert validated.items[0].options == ["Size: Large", "Drink: Lime"]

    invalid = {**payload, "items": [{**payload["items"][0], "options": "Size: Large"}]}
    with pytest.raises(ValidationError):
        ReceiptPayloadResponse.model_validate(invalid)
    with pytest.raises(ValidationError):
        ReceiptPayloadResponse.model_validate({**payload, "status": "draft"})
