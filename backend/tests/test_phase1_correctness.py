import datetime
from decimal import Decimal

import pytest
from fastapi import HTTPException, Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.main import app
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffSession, StaffUser
from app.routes.orders import create_order_in_session
from app.schemas.order import PublicOrderCreateRequest, OrderItemRequest
from app.services.bills import (
    apply_draft_totals,
    create_or_refresh_bill_for_session,
    issue_bill,
    confirm_counter_payment,
)
from app.utils.auth import (
    _resolve_authenticated_context,
    get_authenticated_context,
    hash_password,
)


client = TestClient(app)


# ---------------------------------------------------------------------------
# ISSUE-01 Tests: Auth Transaction Ownership & Isolation
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_isolation_setup():
    db = SessionLocal()
    restaurant = Restaurant(name="Auth Iso Rest", slug="auth-iso-rest", is_active=True)
    db.add(restaurant)
    db.flush()

    staff = StaffUser(
        restaurant_id=restaurant.id,
        name="Auth Iso Staff",
        username="auth_iso_staff",
        email="auth-iso@test.local",
        password_hash=hash_password("password123"),
        role="owner",
        status="active",
        is_active=True,
    )
    db.add(staff)
    db.flush()

    session = StaffSession(
        staff_user_id=staff.id,
        restaurant_id=restaurant.id,
        token_jti="test-auth-iso-jti",
        status="active",
        expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
        last_active_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10),
    )
    db.add(session)
    db.commit()

    token_claims = {
        "sub": str(staff.id),
        "restaurant_id": restaurant.id,
        "role": staff.role,
        "jti": session.token_jti,
        "security_version": 0,
    }
    from app.utils.auth import create_access_token
    token = create_access_token(data=token_claims)

    data = {
        "restaurant_id": restaurant.id,
        "staff_id": staff.id,
        "session_id": session.id,
        "token": token,
    }
    db.close()
    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id == data["restaurant_id"]).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_auth_does_not_commit_unrelated_pending_changes(auth_isolation_setup):
    """Prove that resolving auth context does NOT commit pending uncommitted ORM changes on request DB."""
    db = SessionLocal()
    try:
        # Create an uncommitted table object on the request session
        table = RestaurantTable(
            restaurant_id=auth_isolation_setup["restaurant_id"],
            table_number="UNCOMMITTED-1",
            table_code="T-UNCOMMITTED-1",
            is_active=True,
        )
        db.add(table)
        db.flush()
        assert table.id is not None

        # Resolve authentication context using the same DB session
        from fastapi.security import HTTPAuthorizationCredentials
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_isolation_setup["token"])
        context = _resolve_authenticated_context(creds, db)
        assert context.actor.id == auth_isolation_setup["staff_id"]

        # The table must STILL be uncommitted in DB. A separate DB session should NOT see it.
        check_db = SessionLocal()
        found_in_db = check_db.query(RestaurantTable).filter(RestaurantTable.table_code == "T-UNCOMMITTED-1").first()
        assert found_in_db is None
        check_db.close()

        # Roll back the request DB session
        db.rollback()

        # Confirm table was cleanly rolled back
        check_db = SessionLocal()
        found_after_rollback = check_db.query(RestaurantTable).filter(RestaurantTable.table_code == "T-UNCOMMITTED-1").first()
        assert found_after_rollback is None
        check_db.close()
    finally:
        db.close()


def test_auth_last_active_at_persists_on_get_request(auth_isolation_setup):
    """A normal HTTP authentication persists a meaningfully stale activity time."""
    db = SessionLocal()
    before = db.get(StaffSession, auth_isolation_setup["session_id"]).last_active_at
    db.close()

    token = auth_isolation_setup["token"]
    response = client.get("/auth/staff/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200

    db = SessionLocal()
    sess = db.query(StaffSession).filter(StaffSession.id == auth_isolation_setup["session_id"]).one()
    assert sess.last_active_at > before
    db.close()


def test_auth_last_active_at_is_not_rewritten_inside_threshold(auth_isolation_setup):
    token = auth_isolation_setup["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/auth/staff/me", headers=headers).status_code == 200

    db = SessionLocal()
    first_touch = db.get(StaffSession, auth_isolation_setup["session_id"]).last_active_at
    db.close()

    assert client.get("/auth/staff/me", headers=headers).status_code == 200
    db = SessionLocal()
    second_touch = db.get(StaffSession, auth_isolation_setup["session_id"]).last_active_at
    db.close()
    assert second_touch == first_touch


def test_failed_endpoint_mutations_roll_back_cleanly(auth_isolation_setup):
    """Prove that if an endpoint fails after auth succeeds, its mutations roll back completely."""
    token = auth_isolation_setup["token"]

    # Post an invalid category payload (missing name_en) to trigger 422
    response = client.post(
        "/admin/categories",
        json={"display_order": 99},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code in {400, 422}

    # Verify database has no orphaned category
    db = SessionLocal()
    count = db.query(MenuCategory).filter(
        MenuCategory.restaurant_id == auth_isolation_setup["restaurant_id"],
        MenuCategory.display_order == 99,
    ).count()
    assert count == 0
    db.close()


def test_successful_endpoint_commits_work(auth_isolation_setup):
    """Prove that legitimate endpoint commits continue to persist cleanly."""
    token = auth_isolation_setup["token"]
    response = client.post(
        "/admin/categories",
        json={"name_en": "Phase1 Category", "display_order": 1},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201

    db = SessionLocal()
    cat = db.query(MenuCategory).filter(
        MenuCategory.restaurant_id == auth_isolation_setup["restaurant_id"],
        MenuCategory.name_en == "Phase1 Category",
    ).first()
    assert cat is not None
    db.close()


# ---------------------------------------------------------------------------
# ISSUE-02 Tests: Reopened Draft Bill Totals Synchronization
# ---------------------------------------------------------------------------


@pytest.fixture
def bill_reopen_setup():
    db = SessionLocal()
    restaurant = Restaurant(
        name="Bill Reopen Rest",
        slug="bill-reopen-rest",
        is_active=True,
        operating_status="open",
        gst_enabled=True,
        default_gst_rate=Decimal("5.00"),
        tax_mode="exclusive",
    )
    db.add(restaurant)
    db.flush()

    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="T-B1",
        table_code="T-CODE-B1",
        is_active=True,
    )
    db.add(table)
    db.flush()

    category = MenuCategory(restaurant_id=restaurant.id, name_en="Main", display_order=1)
    db.add(category)
    db.flush()

    item1 = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Curry",
        price=Decimal("100.00"),
        is_available=True,
    )
    item2 = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Rice",
        price=Decimal("50.00"),
        is_available=True,
    )
    db.add_all([item1, item2])
    db.flush()

    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="Bill Owner",
        username="bill_owner",
        email="bill-owner@test.local",
        password_hash=hash_password("owner123"),
        role="owner",
        status="active",
        is_active=True,
    )
    db.add(owner)
    db.commit()

    token_claims = {
        "sub": str(owner.id),
        "restaurant_id": restaurant.id,
        "role": owner.role,
        "jti": "jti-bill-owner",
        "security_version": 0,
    }
    from app.utils.auth import create_access_token
    token = create_access_token(data=token_claims)
    staff_session = StaffSession(
        staff_user_id=owner.id,
        restaurant_id=restaurant.id,
        token_jti="jti-bill-owner",
        status="active",
        expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
    )
    db.add(staff_session)
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "table_id": table.id,
        "item1_id": item1.id,
        "item2_id": item2.id,
        "owner_id": owner.id,
        "token": token,
    }
    db.close()
    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id == data["restaurant_id"]).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_reopen_bill_customer_and_staff_add_items_updates_draft_totals(bill_reopen_setup):
    """Test 1 & 2: request bill -> reopen -> customer/staff adds item -> draft totals updated correctly."""
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_reopen_setup["restaurant_id"]).one()
    table = db.query(RestaurantTable).filter(RestaurantTable.id == bill_reopen_setup["table_id"]).one()

    # 1. Create session and initial order (Curry @ 100)
    order_req1 = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item1_id"], quantity=1)]
    )
    from app.services.dining_sessions import get_or_create_open_session
    session = get_or_create_open_session(db, restaurant, table)
    create_order_in_session(db, restaurant, table, session, order_req1, "idemp-key-bill-1")
    db.commit()

    # 2. Request bill
    session = db.query(DiningSession).filter(DiningSession.id == session.id).one()
    bill = create_or_refresh_bill_for_session(db, session)
    session.status = "payment_requested"
    db.commit()

    assert bill.status == "draft"
    assert bill.subtotal == Decimal("100.00")
    # GST exclusive 5% on 100 = 5.00 -> total = 105.00
    assert bill.total_amount == Decimal("105.00")

    # 3. Reopen ordering
    session.status = "open"
    db.commit()

    # 4. Customer adds item2 (Rice @ 50)
    order_req2 = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item2_id"], quantity=1)]
    )
    create_order_in_session(db, restaurant, table, session, order_req2, "idemp-key-bill-2")
    db.commit()

    # 5. Verify draft bill totals automatically updated to subtotal 150.00, total 157.50
    db.refresh(bill)
    assert bill.subtotal == Decimal("150.00")
    assert bill.tax_amount == Decimal("7.50")
    assert bill.total_amount == Decimal("157.50")
    db.close()


def test_late_served_item_updates_draft_bill(bill_reopen_setup):
    """Test 3: late served item addition updates draft bill subtotal & total."""
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_reopen_setup["restaurant_id"]).one()
    table = db.query(RestaurantTable).filter(RestaurantTable.id == bill_reopen_setup["table_id"]).one()

    from app.services.dining_sessions import get_or_create_open_session
    session = get_or_create_open_session(db, restaurant, table)
    order_req1 = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item1_id"], quantity=1)]
    )
    create_order_in_session(db, restaurant, table, session, order_req1, "idemp-late-1")
    bill = create_or_refresh_bill_for_session(db, session)
    session.status = "open"
    db.commit()

    # Add late served item
    order_req2 = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item2_id"], quantity=2)]
    )
    create_order_in_session(
        db, restaurant, table, session, order_req2, "idemp-late-2", initial_status="served"
    )
    db.commit()

    # Subtotal: 100 + (50 * 2) = 200. Tax: 10. Total: 210
    db.refresh(bill)
    assert bill.subtotal == Decimal("200.00")
    assert bill.total_amount == Decimal("210.00")
    db.close()


def test_multiple_additions_accumulate_correctly(bill_reopen_setup):
    """Test 4 & 5: multiple additions & GST tax recalculation."""
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_reopen_setup["restaurant_id"]).one()
    table = db.query(RestaurantTable).filter(RestaurantTable.id == bill_reopen_setup["table_id"]).one()

    from app.services.dining_sessions import get_or_create_open_session
    session = get_or_create_open_session(db, restaurant, table)
    order_req1 = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item1_id"], quantity=1)]
    )
    create_order_in_session(db, restaurant, table, session, order_req1, "idemp-mult-1")
    bill = create_or_refresh_bill_for_session(db, session)
    session.status = "open"
    db.commit()

    # Add 3 items in sequence
    for i in range(2, 5):
        req = PublicOrderCreateRequest(
            items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item2_id"], quantity=1)]
        )
        create_order_in_session(db, restaurant, table, session, req, f"idemp-mult-{i}")
        db.commit()

    db.refresh(bill)
    # 1 Curry (100) + 3 Rice (150) = 250 subtotal
    assert bill.subtotal == Decimal("250.00")
    assert bill.cgst_amount == Decimal("6.25")
    assert bill.sgst_amount == Decimal("6.25")
    assert bill.tax_amount == Decimal("12.50")
    assert bill.total_amount == Decimal("262.50")
    db.close()


def test_idempotent_order_retry_does_not_double_count(bill_reopen_setup):
    """Test 6: retried idempotent request returns existing order without double-counting draft totals."""
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_reopen_setup["restaurant_id"]).one()
    table = db.query(RestaurantTable).filter(RestaurantTable.id == bill_reopen_setup["table_id"]).one()

    from app.services.dining_sessions import get_or_create_open_session
    session = get_or_create_open_session(db, restaurant, table)
    order_req = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item1_id"], quantity=1)]
    )
    create_order_in_session(db, restaurant, table, session, order_req, "idemp-retry-unique")
    bill = create_or_refresh_bill_for_session(db, session)
    session.status = "open"
    db.commit()

    # Retry exact same request with same idempotency key
    create_order_in_session(db, restaurant, table, session, order_req, "idemp-retry-unique")
    db.commit()

    db.refresh(bill)
    assert bill.subtotal == Decimal("100.00")
    assert bill.total_amount == Decimal("105.00")
    db.close()


def test_issuance_freezes_and_paid_immutable(bill_reopen_setup):
    """Test 7, 8, 9, 10: issuance freezes amount, issued/paid bills cannot mutate."""
    db = SessionLocal()
    restaurant = db.query(Restaurant).filter(Restaurant.id == bill_reopen_setup["restaurant_id"]).one()
    table = db.query(RestaurantTable).filter(RestaurantTable.id == bill_reopen_setup["table_id"]).one()

    from app.services.dining_sessions import get_or_create_open_session
    session = get_or_create_open_session(db, restaurant, table)
    order_req = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item1_id"], quantity=1)]
    )
    create_order_in_session(db, restaurant, table, session, order_req, "idemp-freeze-1")
    bill = create_or_refresh_bill_for_session(db, session)
    issued_bill = issue_bill(db, bill)
    db.commit()

    assert issued_bill.status == "issued"
    assert issued_bill.total_amount == Decimal("105.00")

    # Ordering is locked when bill is issued
    order_req2 = PublicOrderCreateRequest(
        items=[OrderItemRequest(menu_item_id=bill_reopen_setup["item2_id"], quantity=1)]
    )
    with pytest.raises(HTTPException) as exc_info:
        create_order_in_session(db, restaurant, table, session, order_req2, "idemp-freeze-2")
    assert exc_info.value.status_code == 409

    # Confirm counter payment to pay bill
    owner = db.query(StaffUser).filter(StaffUser.id == bill_reopen_setup["owner_id"]).one()
    paid_bill, _ = confirm_counter_payment(db, issued_bill, owner, "counter_cash", "pay-key-1", "hash-1")
    db.commit()

    assert paid_bill.status == "paid"
    assert paid_bill.total_amount == Decimal("105.00")
    db.close()
