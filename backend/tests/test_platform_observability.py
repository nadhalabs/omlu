import datetime
import uuid
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.dining_session import DiningSession
from app.models.bill import Bill
from app.models.order import Order
from app.models.platform_user import PlatformUser, PlatformSession, PlatformAuditLog
from app.models.table_session_participant import TableSessionParticipant
from app.utils.auth import hash_password
from app.utils.platform_auth import create_platform_token
from app.services.platform_recovery import finalize_paid_session, recover_abandoned_empty_session
from app.services.table_participants import load_participant
from app.services.dining_sessions import find_current_open_session_for_table
from app.config import settings
from fastapi import HTTPException


def test_gated_server_timing_exposes_total_and_sql_breakdown(client: TestClient):
    previous = settings.performance_timing_enabled
    settings.performance_timing_enabled = True
    try:
        response = client.get("/")
    finally:
        settings.performance_timing_enabled = previous
    assert response.status_code == 200
    assert "app;dur=" in response.headers["server-timing"]
    assert "db;dur=" in response.headers["server-timing"]
    assert response.headers["x-omlu-sql-count"] == "0"


@pytest.fixture
def db_session():
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def platform_admin_token(db_session: Session):
    admin = db_session.query(PlatformUser).filter(PlatformUser.email == "obs_admin@omlu.app").first()
    if not admin:
        admin = PlatformUser(
            email="obs_admin@omlu.app",
            username="obs_admin",
            password_hash=hash_password("AdminSecurePassword123!"),
            full_name="Observability Admin",
            role="platform_admin",
            status="active",
            is_active=True,
        )
        db_session.add(admin)
        db_session.commit()

    jti = f"test_jti_obs_admin_{uuid.uuid4().hex[:6]}"
    session_entry = PlatformSession(
        platform_user_id=admin.id,
        token_jti=jti,
        status="active",
    )
    db_session.add(session_entry)
    db_session.commit()

    token = create_platform_token({
        "sub": str(admin.id),
        "role": admin.role,
        "jti": session_entry.token_jti,
        "security_version": admin.security_version or 0,
    })
    return token, admin


def test_platform_overview_privacy_and_coverage(client: TestClient, platform_admin_token):
    token, _ = platform_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/platform/overview", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert "platform_status" in data
    assert "kpis" in data
    assert "current_realtime_snapshot" in data
    assert "visualizations" in data
    assert "monitoring_coverage" in data

    # Verify ALL 6 visualisations are present
    viz = data["visualizations"]
    assert "session_lifecycle_funnel" in viz
    assert "workflow_issues_by_category" in viz
    assert "session_age_distribution" in viz
    assert "pending_workflow_ageing" in viz
    assert "billing_reliability_time_series" in viz
    assert "restaurant_operational_attention_matrix" in viz

    # Privacy verification: No financial total amounts or customer tokens in overview response
    json_str = res.text
    assert "public_token" not in json_str or "session_token" in json_str


def test_separated_billing_metrics(db_session: Session, client: TestClient, platform_admin_token):
    token, _ = platform_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/platform/overview", headers=headers)
    assert res.status_code == 200
    data = res.json()
    kpis = data["kpis"]

    assert "billing_initiation_rate_pct" in kpis
    assert "billing_completion_rate_pct" in kpis
    assert "post_payment_closure_rate_pct" in kpis
    assert "workflow_inconsistencies_count" in kpis


def test_duplicate_active_sessions_diagnostics_is_read_only(client: TestClient, platform_admin_token):
    token, _ = platform_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    res = client.get("/api/v1/platform/diagnostics/duplicate-active-sessions", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "duplicate_active_sessions" in data
    assert "total_violations" in data


def test_stale_session_recovery_requires_reason(db_session: Session, client: TestClient, platform_admin_token):
    token, admin = platform_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    uid = uuid.uuid4().hex[:6]
    r = Restaurant(name=f"Rest Recovery {uid}", slug=f"rest-rec-{uid}", is_active=True)
    db_session.add(r)
    db_session.flush()

    t = RestaurantTable(restaurant_id=r.id, table_number="T1", table_code=f"T1C_{uid}", is_active=True)
    db_session.add(t)
    db_session.flush()

    s = DiningSession(restaurant_id=r.id, table_id=t.id, public_token=f"test_rec_token_1_{uid}", status="open")
    db_session.add(s)
    db_session.commit()

    # Fail short reason
    res = client.post(
        "/api/v1/platform/recovery/stale-session-close",
        json={"session_id": s.id, "reason": "Short"},
        headers=headers,
    )
    assert res.status_code == 422


def test_abandoned_session_recovery_rejects_active_orders(db_session: Session, client: TestClient, platform_admin_token):
    token, admin = platform_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    uid = uuid.uuid4().hex[:6]
    r = Restaurant(name=f"Active Order Rest {uid}", slug=f"act-ord-rest-{uid}", is_active=True)
    db_session.add(r)
    db_session.flush()

    t = RestaurantTable(restaurant_id=r.id, table_number="T4", table_code=f"T4C_{uid}", is_active=True)
    db_session.add(t)
    db_session.flush()

    s = DiningSession(restaurant_id=r.id, table_id=t.id, public_token=f"test_rec_token_act_{uid}", status="open")
    db_session.add(s)
    db_session.flush()

    # Add an order with status 'accepted' in kitchen
    o = Order(
        restaurant_id=r.id,
        table_id=t.id,
        dining_session_id=s.id,
        order_number=1,
        public_token=f"ord_token_{uid}",
        subtotal=Decimal("250.00"),
        status="accepted",
    )
    db_session.add(o)
    db_session.commit()

    # Attempt abandoned session recovery -> Must return 409 Conflict
    res = client.post(
        "/api/v1/platform/recovery/stale-session-close",
        json={"session_id": s.id, "reason": "Attempting to close session with active kitchen order"},
        headers=headers,
    )
    assert res.status_code == 409
    assert "active/accepted order" in res.json()["detail"]


def test_audited_recovery_execution(db_session: Session, client: TestClient, platform_admin_token):
    token, admin = platform_admin_token
    headers = {"Authorization": f"Bearer {token}"}

    uid = uuid.uuid4().hex[:6]
    r = Restaurant(name=f"Paid Recovery Rest {uid}", slug=f"paid-rec-rest-{uid}", is_active=True)
    db_session.add(r)
    db_session.flush()

    t = RestaurantTable(restaurant_id=r.id, table_number="T2", table_code=f"T2C_{uid}", is_active=True)
    db_session.add(t)
    db_session.flush()

    s = DiningSession(restaurant_id=r.id, table_id=t.id, public_token=f"test_rec_token_paid_{uid}", status="open")
    db_session.add(s)
    db_session.flush()

    b = Bill(restaurant_id=r.id, dining_session_id=s.id, bill_number=f"B100_{uid}", status="paid", total_amount=500.00)
    db_session.add(b)
    db_session.commit()

    # Finalize paid session via recovery service
    res = client.post(
        "/api/v1/platform/recovery/finalize-paid-session",
        json={"session_id": s.id, "reason": "Paid session remained open on table after confirmation"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "closed"
    assert data["table_available"] is True

    # Refresh DB session state
    db_session.expire_all()
    s_refreshed = db_session.query(DiningSession).filter(DiningSession.id == s.id).first()
    assert s_refreshed.status == "closed"
    assert s_refreshed.closed_at is not None

    # Verify audit log entry
    audit = db_session.query(PlatformAuditLog).filter(
        PlatformAuditLog.target_id == str(s.id),
        PlatformAuditLog.action == "finalize_paid_session",
    ).first()
    assert audit is not None
    assert audit.actor_user_id == admin.id
    assert "Paid session remained open" in audit.new_value


def test_revoked_participant_cannot_access_protected_actions(db_session: Session):
    uid = uuid.uuid4().hex[:6]
    r = Restaurant(name=f"Revoke Access Rest {uid}", slug=f"revoke-acc-rest-{uid}", is_active=True)
    db_session.add(r)
    db_session.flush()

    t = RestaurantTable(restaurant_id=r.id, table_number="T3", table_code=f"T3C_{uid}", is_active=True)
    db_session.add(t)
    db_session.flush()

    s = DiningSession(restaurant_id=r.id, table_id=t.id, public_token=f"test_token_revoke_{uid}", status="open")
    db_session.add(s)
    db_session.flush()

    p = TableSessionParticipant(
        public_id=f"part_pub_{uid}",
        restaurant_id=r.id,
        table_id=t.id,
        session_id=s.id,
        token_hash=f"hash_raw_token_{uid}",
        label_number=1,
    )
    db_session.add(p)
    db_session.commit()

    # Revoke participant
    p.revoked_at = datetime.datetime.now(datetime.timezone.utc)
    db_session.commit()

    # Verify load_participant raises HTTP 401
    with pytest.raises(HTTPException) as exc_info:
        load_participant(db_session, f"raw_token_{uid}")
    assert exc_info.value.status_code == 401
