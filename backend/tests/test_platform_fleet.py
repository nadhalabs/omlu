import secrets
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.main import app
from app.models.restaurant import Restaurant
from app.models.platform_user import PlatformUser, PlatformSession
from app.utils.auth import hash_password
from app.utils.platform_auth import create_platform_token, decode_platform_token

client = TestClient(app)

@pytest.fixture
def platform_token(db_session: Session):
    user = db_session.query(PlatformUser).filter(PlatformUser.email == "fleet_admin@omlu.platform").first()
    if not user:
        user = PlatformUser(
            email="fleet_admin@omlu.platform",
            username="fleet_admin",
            password_hash=hash_password("PlatformAdmin123!"),
            full_name="Fleet Platform Admin",
            role="platform_admin",
            status="active",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    token_jti = secrets.token_urlsafe(24)
    session_entry = PlatformSession(
        platform_user_id=user.id,
        token_jti=token_jti,
        device="pytest",
        ip_address="127.0.0.1",
        status="active",
        login_at=datetime.now(timezone.utc),
        last_active_at=datetime.now(timezone.utc),
    )
    db_session.add(session_entry)
    db_session.commit()

    token_claims = {
        "sub": str(user.id),
        "role": user.role,
        "jti": token_jti,
        "security_version": user.security_version or 0,
    }
    return create_platform_token(token_claims)


def test_platform_overview_dashboard(platform_token):
    res = client.get(
        "/api/v1/platform/overview",
        headers={"Authorization": f"Bearer {platform_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "kpis" in data
    assert "total_restaurants" in data["kpis"]
    assert "plain_language_insights" in data


def test_platform_restaurants_fleet(platform_token):
    res = client.get(
        "/api/v1/platform/restaurants",
        headers={"Authorization": f"Bearer {platform_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "restaurants" in data
    assert "total" in data


def test_platform_system_health(platform_token):
    res = client.get(
        "/api/v1/platform/system-health",
        headers={"Authorization": f"Bearer {platform_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] in {"Healthy", "Degraded"}
    assert "components" in data


def test_platform_activity_touch_is_throttled(platform_token):
    payload = decode_platform_token(platform_token)
    db = SessionLocal()
    session = db.query(PlatformSession).filter(PlatformSession.token_jti == payload["jti"]).one()
    session.last_active_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    db.commit()
    session_id = session.id
    stale = session.last_active_at
    db.close()

    headers = {"Authorization": f"Bearer {platform_token}"}
    assert client.get("/api/v1/platform/overview", headers=headers).status_code == 200
    db = SessionLocal()
    first_touch = db.get(PlatformSession, session_id).last_active_at
    db.close()
    assert first_touch > stale

    assert client.get("/api/v1/platform/overview", headers=headers).status_code == 200
    db = SessionLocal()
    second_touch = db.get(PlatformSession, session_id).last_active_at
    db.close()
    assert second_touch == first_touch
