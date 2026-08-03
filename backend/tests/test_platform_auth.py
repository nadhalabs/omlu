import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.platform_user import PlatformUser, PlatformSession
from app.utils.auth import hash_password
from app.routes.platform import platform_login_attempts
from app.seed import seed_platform_users, seed_database
from app.config import settings

client = TestClient(app)

@pytest.fixture(autouse=True)
def reset_rate_limit():
    platform_login_attempts.clear()
    yield
    platform_login_attempts.clear()


@pytest.fixture
def seed_platform_users_fixture(db_session: Session):
    user = db_session.query(PlatformUser).filter(PlatformUser.email == "admin@omlu.platform").first()
    if not user:
        user = PlatformUser(
            email="admin@omlu.platform",
            username="platform_admin",
            password_hash=hash_password("PlatformAdmin123!"),
            full_name="Platform Admin",
            role="platform_admin",
            status="active",
            is_active=True,
        )
        db_session.add(user)
        db_session.commit()
    return user


def test_platform_login_success(seed_platform_users_fixture):
    res = client.post(
        "/api/v1/platform/auth/login",
        json={"identifier": "admin@omlu.platform", "password": "PlatformAdmin123!"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data, data
    assert data["user"]["role"] == "platform_admin"


def test_platform_login_bad_credentials(seed_platform_users_fixture):
    res = client.post(
        "/api/v1/platform/auth/login",
        json={"identifier": "admin@omlu.platform", "password": "WrongPassword!"}
    )
    assert res.status_code == 401, res.text
    assert res.json()["detail"] == "Invalid platform credentials"


def test_platform_me(seed_platform_users_fixture):
    login_res = client.post(
        "/api/v1/platform/auth/login",
        json={"identifier": "admin@omlu.platform", "password": "PlatformAdmin123!"}
    )
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]

    me_res = client.get(
        "/api/v1/platform/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_res.status_code == 200, me_res.text
    data = me_res.json()
    assert data["user"]["username"] == "platform_admin"


def test_platform_logout(seed_platform_users_fixture):
    login_res = client.post(
        "/api/v1/platform/auth/login",
        json={"identifier": "admin@omlu.platform", "password": "PlatformAdmin123!"}
    )
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]

    logout_res = client.post(
        "/api/v1/platform/auth/logout",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert logout_res.status_code == 200, logout_res.text

    # Next call should fail because session is revoked
    me_res = client.get(
        "/api/v1/platform/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert me_res.status_code == 401, me_res.text


def test_production_seeding_disabled(db_session: Session, monkeypatch):
    """Proves that seeding refuses to create default users in a production environment."""
    monkeypatch.setattr(settings, "app_environment", "production")

    initial_platform_users = db_session.query(PlatformUser).count()

    seed_platform_users(db_session)
    seed_database()

    final_platform_users = db_session.query(PlatformUser).count()
    assert final_platform_users == initial_platform_users
