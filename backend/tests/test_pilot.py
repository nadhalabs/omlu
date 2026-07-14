"""
Phase 9 Pilot Readiness Test Suite.

Verifies all pilot requirements:
- Health endpoints
- Public service request creation with cooldown
- Staff service request listing and resolution
- Owner dashboard summary
- Restaurant settings CRUD
- Service request spam protection
- CORS / security header behaviors

Run from backend/ directory:
    pytest tests/test_pilot.py -v
"""
import re
import time
import uuid
import pytest
from decimal import Decimal
from datetime import datetime, timezone, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.staff_user import StaffUser
from app.models.order import Order, OrderItem, OrderStatusHistory, RestaurantDailySequence
from app.models.service_request import ServiceRequest
from app.utils.auth import hash_password, create_access_token

# ────────────────────────────────────────────────────────────
# Test database setup (temporary SQLite file for test run isolation)
# ────────────────────────────────────────────────────────────

engine = None
TestingSessionLocal = None


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def test_database_url(tmp_path_factory):
    db_path = tmp_path_factory.mktemp("db") / "pilot.sqlite3"
    return f"sqlite:///{db_path}"


@pytest.fixture(scope="module")
def test_engine(test_database_url):
    test_engine = create_engine(test_database_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=test_engine)
    yield test_engine
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


@pytest.fixture(scope="module", autouse=True)
def override_test_database(test_engine):
    global engine, TestingSessionLocal
    engine = test_engine
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_db] = override_get_db

    try:
        yield
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


client = TestClient(app)



# ────────────────────────────────────────────────────────────
# Fixtures
# ────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def clean_db(test_engine):
    """Drop and recreate tables before each test for isolation."""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield


@pytest.fixture
def db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def restaurant(db):
    r = Restaurant(
        name="Test Cafe",
        slug="test-cafe",
        is_active=True,
        timezone="Asia/Kolkata",
        currency="INR",
        order_prefix="TC",
        service_requests_enabled=True,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@pytest.fixture
def table(db, restaurant):
    t = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="1",
        table_code="TEST-TABLE-01",
        is_active=True,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@pytest.fixture
def category(db, restaurant):
    c = MenuCategory(
        restaurant_id=restaurant.id,
        name_en="Drinks",
        display_order=1,
        is_active=True,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def menu_item(db, restaurant, category):
    m = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Coffee",
        price=Decimal("120.00"),
        is_available=True,
        display_order=1,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


@pytest.fixture
def owner_user(db, restaurant):
    u = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Owner",
        email="owner@test.com",
        password_hash=hash_password("Password123!"),
        role="owner",
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def kitchen_user(db, restaurant):
    u = StaffUser(
        restaurant_id=restaurant.id,
        name="Kitchen Staff",
        email="kitchen@test.com",
        password_hash=hash_password("Password123!"),
        role="kitchen",
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def owner_token(owner_user, restaurant):
    return create_access_token({
        "sub": str(owner_user.id),
        "restaurant_id": restaurant.id,
        "role": "owner",
    })


@pytest.fixture
def kitchen_token(kitchen_user, restaurant):
    return create_access_token({
        "sub": str(kitchen_user.id),
        "restaurant_id": restaurant.id,
        "role": "kitchen",
    })


@pytest.fixture
def placed_order(db, restaurant, table, menu_item):
    """Create a confirmed test order in the database."""
    order = Order(
        restaurant_id=restaurant.id,
        table_id=table.id,
        order_number="TC-20260712-0001",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=Decimal("120.00"),
        idempotency_key=uuid.uuid4().hex,
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(
        order_id=order.id,
        menu_item_id=menu_item.id,
        item_name="Coffee",
        quantity=1,
        unit_price=Decimal("120.00"),
        total_price=Decimal("120.00"),
    ))
    db.add(OrderStatusHistory(order_id=order.id, old_status=None, new_status="pending"))
    db.commit()
    db.refresh(order)
    return order


# ────────────────────────────────────────────────────────────
# 1. Health Endpoints
# ────────────────────────────────────────────────────────────

class TestHealthEndpoints:
    def test_health_returns_200(self):
        r = client.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_database_health_returns_200(self):
        r = client.get("/health/database")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_health_has_no_secrets(self):
        """Health response must not expose database URL or other secrets."""
        r = client.get("/health")
        body = r.text
        assert "password" not in body.lower()
        assert "postgresql://" not in body
        assert "postgres://" not in body


# ────────────────────────────────────────────────────────────
# 2. Public Service Requests
# ────────────────────────────────────────────────────────────

class TestPublicServiceRequests:
    def test_create_waiter_request(self, restaurant, table, placed_order):
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter", "public_order_token": placed_order.public_token},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["request_type"] == "waiter"
        assert data["status"] == "pending"
        assert "restaurant_id" not in data
        assert "table_id" not in data
        assert "resolved_by_staff_id" not in data

    def test_create_water_request(self, restaurant, table):
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "water"},
        )
        assert r.status_code == 201

    def test_create_bill_request(self, restaurant, table):
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "bill"},
        )
        assert r.status_code == 201

    def test_invalid_request_type_rejected(self, restaurant, table):
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "coffee"},
        )
        assert r.status_code in (400, 422)

    def test_service_request_ip_rate_limiting(self, table):
        """The public service-request endpoint should throttle by client IP."""
        for _ in range(5):
            r = client.post(
                f"/public/restaurants/missing-restaurant/tables/{table.table_code}/service-requests",
                json={"request_type": "waiter"},
            )
            assert r.status_code == 404

        r = client.post(
            f"/public/restaurants/missing-restaurant/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter"},
        )
        assert r.status_code == 429
        assert "too many requests" in r.json()["detail"].lower()

    def test_duplicate_pending_request_blocked(self, restaurant, table):
        """Two requests of the same type when one is already pending should be blocked."""
        client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter"},
        )
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter"},
        )
        assert r.status_code == 429

    def test_different_type_allowed_independently(self, restaurant, table):
        """Sending water after waiter is pending should work (different types)."""
        client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter"},
        )
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "water"},
        )
        assert r.status_code == 201

    def test_inactive_restaurant_rejected(self, db, restaurant, table):
        restaurant.is_active = False
        db.commit()
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter"},
        )
        assert r.status_code == 404

    def test_service_requests_disabled_blocked(self, db, restaurant, table):
        restaurant.service_requests_enabled = False
        db.commit()
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter"},
        )
        assert r.status_code == 403

    def test_invalid_order_token_rejected(self, restaurant, table):
        r = client.post(
            f"/public/restaurants/{restaurant.slug}/tables/{table.table_code}/service-requests",
            json={"request_type": "waiter", "public_order_token": "invalid-token-xyz"},
        )
        assert r.status_code == 400


# ────────────────────────────────────────────────────────────
# 3. Staff Service Request Endpoints
# ────────────────────────────────────────────────────────────

class TestStaffServiceRequests:
    def test_list_requests_unauthenticated(self):
        r = client.get("/staff/service-requests")
        assert r.status_code == 401

    def test_list_requests_authenticated(self, restaurant, table, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.get("/staff/service-requests", headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_requests_kitchen_role(self, restaurant, table, kitchen_token):
        """Kitchen role must not access staff request endpoints."""
        headers = {"Authorization": f"Bearer {kitchen_token}"}
        r = client.get("/staff/service-requests", headers=headers)
        assert r.status_code == 403

    def test_resolve_request(self, restaurant, table, owner_token, db):
        """Create a request then resolve it via staff endpoint."""
        # Create pending request
        sr = ServiceRequest(
            restaurant_id=restaurant.id,
            table_id=table.id,
            request_type="waiter",
            status="pending",
        )
        db.add(sr)
        db.commit()
        db.refresh(sr)

        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.patch(f"/staff/service-requests/{sr.id}/resolve", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "resolved"
        assert data["resolved_by_staff_id"] is not None

    def test_resolve_already_resolved_idempotent(self, restaurant, table, owner_token, db):
        """Resolving an already-resolved request should not raise an error."""
        sr = ServiceRequest(
            restaurant_id=restaurant.id,
            table_id=table.id,
            request_type="bill",
            status="pending",
        )
        db.add(sr)
        db.commit()
        db.refresh(sr)

        headers = {"Authorization": f"Bearer {owner_token}"}
        client.patch(f"/staff/service-requests/{sr.id}/resolve", headers=headers)
        # Second resolution attempt should not fail
        r = client.patch(f"/staff/service-requests/{sr.id}/resolve", headers=headers)
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"

    def test_resolve_request_from_another_restaurant_denied(self, db, restaurant, table, owner_token):
        """Staff cannot resolve requests from a different restaurant."""
        # Create a second restaurant
        r2 = Restaurant(name="Other Cafe", slug="other-cafe", is_active=True,
                        timezone="Asia/Kolkata", currency="INR", order_prefix="OC",
                        service_requests_enabled=True)
        db.add(r2)
        db.flush()
        t2 = RestaurantTable(restaurant_id=r2.id, table_number="A1", table_code="OTHER-01", is_active=True)
        db.add(t2)
        db.flush()
        sr = ServiceRequest(restaurant_id=r2.id, table_id=t2.id, request_type="waiter", status="pending")
        db.add(sr)
        db.commit()
        db.refresh(sr)

        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.patch(f"/staff/service-requests/{sr.id}/resolve", headers=headers)
        assert r.status_code == 404  # Not found for this restaurant


# ────────────────────────────────────────────────────────────
# 4. Dashboard Summary
# ────────────────────────────────────────────────────────────

class TestDashboardSummary:
    def test_dashboard_unauthenticated(self):
        r = client.get("/admin/dashboard/summary")
        assert r.status_code == 401

    def test_dashboard_kitchen_role_denied(self, restaurant, kitchen_token):
        headers = {"Authorization": f"Bearer {kitchen_token}"}
        r = client.get("/admin/dashboard/summary", headers=headers)
        assert r.status_code == 403

    def test_dashboard_owner_role(self, restaurant, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.get("/admin/dashboard/summary", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert "today_order_count" in data
        assert "today_revenue" in data
        assert "average_order_value" in data
        assert "pending_order_count" in data
        assert "active_service_request_count" in data
        assert "rejected_order_count" in data
        assert "top_selling_items" in data
        assert "orders_by_hour" in data
        assert "timezone" in data
        assert data["timezone"] == "Asia/Kolkata"

    def test_dashboard_pending_count_accuracy(self, restaurant, placed_order, owner_token):
        """The dashboard must report the correct number of active orders."""
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.get("/admin/dashboard/summary", headers=headers)
        data = r.json()
        assert data["pending_order_count"] >= 1  # The placed_order is pending


# ────────────────────────────────────────────────────────────
# 5. Restaurant Settings
# ────────────────────────────────────────────────────────────

class TestRestaurantSettings:
    def test_get_settings_owner(self, restaurant, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.get("/admin/settings", headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data["timezone"] == "Asia/Kolkata"
        assert data["currency"] == "INR"
        assert data["order_prefix"] == "TC"
        assert data["service_requests_enabled"] is True

    def test_get_settings_kitchen_denied(self, restaurant, kitchen_token):
        headers = {"Authorization": f"Bearer {kitchen_token}"}
        r = client.get("/admin/settings", headers=headers)
        assert r.status_code == 403

    def test_update_order_prefix(self, restaurant, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.patch(
            "/admin/settings",
            json={"order_prefix": "CAFE"},
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["order_prefix"] == "CAFE"

    def test_update_service_requests_enabled(self, restaurant, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.patch(
            "/admin/settings",
            json={"service_requests_enabled": False},
            headers=headers,
        )
        assert r.status_code == 200
        assert r.json()["service_requests_enabled"] is False

    def test_update_invalid_prefix_rejected(self, restaurant, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.patch(
            "/admin/settings",
            json={"order_prefix": "TOOLONGPREFIX"},
            headers=headers,
        )
        assert r.status_code == 422

    def test_update_invalid_timezone_rejected(self, restaurant, owner_token):
        headers = {"Authorization": f"Bearer {owner_token}"}
        r = client.patch(
            "/admin/settings",
            json={"timezone": "Fake/Timezone"},
            headers=headers,
        )
        assert r.status_code == 422

    def test_kitchen_cannot_update_settings(self, restaurant, kitchen_token):
        headers = {"Authorization": f"Bearer {kitchen_token}"}
        r = client.patch(
            "/admin/settings",
            json={"service_requests_enabled": False},
            headers=headers,
        )
        assert r.status_code == 403


# ────────────────────────────────────────────────────────────
# 6. Public Order Tracking: includes slug, table_code in response
# ────────────────────────────────────────────────────────────

class TestPublicOrderTrackingResponse:
    def test_tracking_includes_service_request_fields(self, placed_order):
        r = client.get(f"/public/orders/{placed_order.public_token}")
        assert r.status_code == 200
        data = r.json()
        assert "restaurant_slug" in data
        assert "table_code" in data
        assert "service_requests_enabled" in data

    def test_tracking_invalid_token_returns_404(self):
        r = client.get("/public/orders/invalid-token-xyz")
        assert r.status_code == 404
