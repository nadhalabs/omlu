"""Tests for GET /staff/sessions and POST /staff/sessions/{token}/close-empty."""
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

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
def sess_ctx():
    """Fixture providing two restaurants with tables, staff, and helper data."""
    db = SessionLocal()
    slug = f"sess-test-{uuid.uuid4().hex[:10]}"
    other_slug = f"sess-other-{uuid.uuid4().hex[:10]}"

    restaurant = Restaurant(
        name="Session Test Cafe",
        slug=slug,
        is_active=True,
        currency="INR",
        order_prefix="ST",
    )
    other_restaurant = Restaurant(
        name="Other Session Cafe",
        slug=other_slug,
        is_active=True,
        currency="INR",
        order_prefix="OS",
    )
    db.add_all([restaurant, other_restaurant])
    db.flush()

    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="7",
        table_code=f"SESS-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    table2 = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="8",
        table_code=f"SESS2-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    other_table = RestaurantTable(
        restaurant_id=other_restaurant.id,
        table_number="1",
        table_code=f"OTHER-{uuid.uuid4().hex[:8]}",
        is_active=True,
    )
    db.add_all([table, table2, other_table])
    db.flush()

    category = MenuCategory(
        restaurant_id=restaurant.id,
        name_en="Drinks",
        display_order=1,
        is_active=True,
    )
    db.add(category)
    db.flush()

    item = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Tea",
        price=Decimal("50.00"),
        is_available=True,
    )
    db.add(item)
    db.flush()

    session = DiningSession(
        restaurant_id=restaurant.id,
        table_id=table.id,
        public_token=f"sess-{uuid.uuid4().hex}",
        status="open",
    )
    other_session = DiningSession(
        restaurant_id=other_restaurant.id,
        table_id=other_table.id,
        public_token=f"other-sess-{uuid.uuid4().hex}",
        status="open",
    )
    db.add_all([session, other_session])
    db.flush()

    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="S Owner",
        email=f"sess-owner-{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("pw"),
        role="owner",
        is_active=True,
    )
    staff_legacy_manager = StaffUser(
        restaurant_id=restaurant.id,
        name="S Manager",
        email=f"sess-mgr-{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("pw"),
        role="admin",
        is_active=True,
    )
    staff_legacy_waiter = StaffUser(
        restaurant_id=restaurant.id,
        name="S Waiter",
        email=f"sess-wtr-{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("pw"),
        role="staff",
        is_active=True,
    )
    kitchen = StaffUser(
        restaurant_id=restaurant.id,
        name="S Kitchen",
        email=f"sess-ktn-{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("pw"),
        role="kitchen",
        is_active=True,
    )
    other_owner = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Owner",
        email=f"sess-other-{uuid.uuid4().hex[:8]}@test.local",
        password_hash=hash_password("pw"),
        role="owner",
        is_active=True,
    )
    db.add_all([owner, staff_legacy_manager, staff_legacy_waiter, kitchen, other_owner])
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "other_restaurant_id": other_restaurant.id,
        "table_id": table.id,
        "table2_id": table2.id,
        "other_table_id": other_table.id,
        "session_id": session.id,
        "session_token": session.public_token,
        "other_session_id": other_session.id,
        "other_session_token": other_session.public_token,
        "item_id": item.id,
        "owner_token": create_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"}),
        "admin_token": create_access_token({"sub": str(staff_legacy_manager.id), "restaurant_id": restaurant.id, "role": "admin"}),
        "staff_token": create_access_token({"sub": str(staff_legacy_waiter.id), "restaurant_id": restaurant.id, "role": "staff"}),
        "kitchen_token": create_access_token({"sub": str(kitchen.id), "restaurant_id": restaurant.id, "role": "kitchen"}),
        "other_token": create_access_token({"sub": str(other_owner.id), "restaurant_id": other_restaurant.id, "role": "owner"}),
    }
    db.close()

    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(
        Restaurant.id.in_([data["restaurant_id"], data["other_restaurant_id"]])
    ).delete()
    db.commit()
    db.close()


def _add_order(data, *, session_id=None, status="pending", subtotal=Decimal("50.00")):
    """Insert a direct order into the DB and return its public_token."""
    db = SessionLocal()
    sid = session_id if session_id is not None else data["session_id"]
    order = Order(
        restaurant_id=data["restaurant_id"],
        table_id=data["table_id"],
        dining_session_id=sid,
        order_number=f"ST-{uuid.uuid4().hex[:12]}",
        public_token=uuid.uuid4().hex,
        status=status,
        subtotal=subtotal,
        idempotency_key=f"idem-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        menu_item_id=data["item_id"],
        item_name="Tea",
        quantity=1,
        unit_price=subtotal,
        total_price=subtotal,
    ))
    db.add(OrderStatusHistory(order_id=order.id, old_status=None, new_status=status))
    db.commit()
    token = order.public_token
    db.close()
    return token


def _add_paid_bill(data):
    """Issue a bill and mark it paid directly in DB."""
    db = SessionLocal()
    import datetime
    bill = Bill(
        restaurant_id=data["restaurant_id"],
        dining_session_id=data["session_id"],
        bill_number=f"BILL-{uuid.uuid4().hex[:10]}",
        status="paid",
        subtotal=Decimal("50.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total_amount=Decimal("50.00"),
        currency="INR",
        paid_at=datetime.datetime.now(datetime.timezone.utc),
        payment_method="counter_cash",
    )
    db.add(bill)
    db.commit()
    db.close()


# ── LIST tests ────────────────────────────────────────────────────────────────

def test_owner_can_list_sessions(sess_ctx):
    res = client.get(
        "/staff/sessions",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    tokens = [s["session_token"] for s in data]
    assert sess_ctx["session_token"] in tokens


def test_kitchen_cannot_list_sessions(sess_ctx):
    res = client.get(
        "/staff/sessions",
        headers={"Authorization": f"Bearer {sess_ctx['kitchen_token']}"},
    )
    assert res.status_code == 403


def test_list_sessions_unauthenticated(sess_ctx):
    res = client.get("/staff/sessions")
    assert res.status_code == 401


def test_list_sessions_only_returns_own_restaurant(sess_ctx):
    """Owner of restaurant A must not see sessions from restaurant B."""
    res = client.get(
        "/staff/sessions",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    tokens = [s["session_token"] for s in res.json()]
    assert sess_ctx["other_session_token"] not in tokens


def test_list_sessions_response_shape(sess_ctx):
    _add_order(sess_ctx)
    res = client.get(
        "/staff/sessions",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    s = next(x for x in res.json() if x["session_token"] == sess_ctx["session_token"])
    assert "table_number" in s
    assert "status" in s
    assert "opened_at" in s
    assert "last_activity_at" in s
    assert "order_count" in s
    assert "combined_subtotal" in s
    assert "latest_order_status" in s


def test_list_sessions_sorted_by_last_activity_desc(sess_ctx):
    """Two sessions: second one should appear first after its order is added."""
    db = SessionLocal()
    session2 = DiningSession(
        restaurant_id=sess_ctx["restaurant_id"],
        table_id=sess_ctx["table2_id"],
        public_token=f"sess2-{uuid.uuid4().hex}",
        status="open",
    )
    db.add(session2)
    db.commit()
    sess2_token = session2.public_token
    sess2_id = session2.id
    db.close()

    # Add order to session2 (makes it more recently active)
    import time
    time.sleep(0.05)
    _add_order(sess_ctx, session_id=sess2_id)

    res = client.get(
        "/staff/sessions",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    tokens = [s["session_token"] for s in res.json()]
    # sess2 should be at index 0 (most recent)
    assert tokens.index(sess2_token) < tokens.index(sess_ctx["session_token"])


# ── CLOSE tests ───────────────────────────────────────────────────────────────

def test_owner_can_close_empty_session(sess_ctx):
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


def test_admin_can_close_empty_session(sess_ctx):
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['admin_token']}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


def test_staff_can_close_empty_session(sess_ctx):
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['staff_token']}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"


def test_kitchen_cannot_close_session(sess_ctx):
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['kitchen_token']}"},
    )
    assert res.status_code == 403


def test_cross_restaurant_close_blocked(sess_ctx):
    """Owner of restaurant B cannot close a session from restaurant A."""
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['other_token']}"},
    )
    assert res.status_code == 404


def test_pending_order_is_cancelled_on_close(sess_ctx):
    _add_order(sess_ctx, status="pending")
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"

    db = SessionLocal()
    orders = db.query(Order).filter(Order.dining_session_id == sess_ctx["session_id"]).all()
    db.close()
    # Every order should be rejected (not pending)
    for o in orders:
        assert o.status == "rejected", f"Expected rejected, got {o.status}"


def test_rejected_only_order_does_not_block_close(sess_ctx):
    _add_order(sess_ctx, status="rejected")
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200


def test_accepted_order_blocks_close(sess_ctx):
    _add_order(sess_ctx, status="accepted")
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 409
    assert "accepted" in res.json()["detail"].lower() or "active" in res.json()["detail"].lower()


def test_preparing_order_blocks_close(sess_ctx):
    _add_order(sess_ctx, status="preparing")
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 409


def test_ready_order_blocks_close(sess_ctx):
    _add_order(sess_ctx, status="ready")
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 409


def test_served_order_blocks_close(sess_ctx):
    _add_order(sess_ctx, status="served")
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 409


def test_paid_bill_blocks_close(sess_ctx):
    _add_order(sess_ctx, status="served")
    _add_paid_bill(sess_ctx)
    res = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 409
    assert "paid" in res.json()["detail"].lower()


def test_repeated_close_is_idempotent(sess_ctx):
    r1 = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert r1.status_code == 200

    r2 = client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert r2.status_code == 200
    assert r2.json()["status"] == "cancelled"


def test_closed_session_not_in_list(sess_ctx):
    client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    res = client.get(
        "/staff/sessions",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )
    assert res.status_code == 200
    tokens = [s["session_token"] for s in res.json()]
    assert sess_ctx["session_token"] not in tokens


def test_new_session_can_start_for_same_table_after_close(sess_ctx):
    """After closing, the same table must be orderable again (new session)."""
    client.post(
        f"/staff/sessions/{sess_ctx['session_token']}/close-empty",
        headers={"Authorization": f"Bearer {sess_ctx['owner_token']}"},
    )

    # Use the public menu order endpoint which auto-creates a session
    res = client.post(
        f"/public/restaurants/{_get_slug(sess_ctx)}/tables/{_get_table_code(sess_ctx)}/orders",
        headers={"Idempotency-Key": f"new-order-{uuid.uuid4().hex}"},
        json={"items": [{"menu_item_id": sess_ctx["item_id"], "quantity": 1}]},
    )
    # 201 = new session started and order placed
    assert res.status_code == 201


def _get_slug(data):
    db = SessionLocal()
    r = db.query(Restaurant).filter(Restaurant.id == data["restaurant_id"]).first()
    slug = r.slug
    db.close()
    return slug


def _get_table_code(data):
    db = SessionLocal()
    t = db.query(RestaurantTable).filter(RestaurantTable.id == data["table_id"]).first()
    code = t.table_code
    db.close()
    return code
