import datetime

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffSession, StaffUser
from app.utils.auth import (
    TenantScope,
    _resolve_authenticated_context,
    create_access_token,
    hash_password,
)


client = TestClient(app)


def _bearer(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def _login(slug: str, login: str, password: str) -> str:
    response = client.post(
        "/auth/staff/login",
        json={"restaurant_slug": slug, "login": login, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _resolve(token: str):
    db = SessionLocal()
    try:
        return _resolve_authenticated_context(_bearer(token), db)
    finally:
        db.close()


@pytest.fixture()
def scope_data():
    db = SessionLocal()
    first = Restaurant(name="Scope First", slug="scope-first", is_active=True)
    second = Restaurant(name="Scope Second", slug="scope-second", is_active=True)
    db.add_all([first, second])
    db.flush()
    owner = StaffUser(
        restaurant_id=first.id,
        name="Scope Owner",
        username="scope_owner",
        email="scope-owner@test.local",
        password_hash=hash_password("scope-owner-password"),
        role="owner",
        status="active",
        is_active=True,
        security_version=3,
    )
    kitchen = StaffUser(
        restaurant_id=second.id,
        name="Scope Kitchen",
        username="scope_kitchen",
        email="scope-kitchen@test.local",
        password_hash=hash_password("scope-kitchen-password"),
        role="kitchen",
        status="active",
        is_active=True,
    )
    db.add_all([owner, kitchen])
    db.commit()
    result = {
        "first_id": first.id,
        "second_id": second.id,
        "owner_id": owner.id,
        "kitchen_id": kitchen.id,
    }
    db.close()
    yield result
    db = SessionLocal()
    db.query(Restaurant).filter(
        Restaurant.id.in_([result["first_id"], result["second_id"]])
    ).delete(synchronize_session=False)
    db.commit()
    db.close()


def test_valid_scope_is_immutable_and_database_authoritative(scope_data):
    token = _login("scope-first", "scope_owner", "scope-owner-password")
    context = _resolve(token)
    payload = jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )

    assert context.scope == TenantScope(
        restaurant_id=scope_data["first_id"],
        actor_id=scope_data["owner_id"],
        role="owner",
        authority_epoch=f"3:{payload['jti']}",
    )
    assert context.session.token_jti == payload["jti"]
    with pytest.raises((AttributeError, TypeError)):
        context.scope.restaurant_id = scope_data["second_id"]


def test_request_values_cannot_override_scope(scope_data):
    token = _login("scope-first", "scope_owner", "scope-owner-password")
    response = client.get(
        "/auth/staff/me",
        params={
            "restaurant_id": scope_data["second_id"],
            "actor_id": scope_data["kitchen_id"],
            "role": "kitchen",
            "authority_epoch": "client-selected",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    context = _resolve(token)
    assert context.scope.restaurant_id == scope_data["first_id"]
    assert context.scope.actor_id == scope_data["owner_id"]
    assert context.scope.role == "owner"

    payload = jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )
    payload["role"] = "kitchen"
    stale_role_token = jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )
    assert _resolve(stale_role_token).scope.role == "owner"


def test_different_active_session_changes_authority_epoch(scope_data):
    first_token = _login("scope-first", "scope_owner", "scope-owner-password")
    second_token = _login("scope-first", "scope_owner", "scope-owner-password")
    first = _resolve(first_token).scope
    second = _resolve(second_token).scope

    assert first.restaurant_id == second.restaurant_id
    assert first.actor_id == second.actor_id
    assert first.authority_epoch != second.authority_epoch


def test_security_version_change_rejects_old_epoch_and_changes_new_epoch(scope_data):
    old_token = _login("scope-first", "scope_owner", "scope-owner-password")
    old_epoch = _resolve(old_token).scope.authority_epoch
    db = SessionLocal()
    owner = db.query(StaffUser).filter(StaffUser.id == scope_data["owner_id"]).one()
    owner.security_version += 1
    db.commit()
    db.close()

    with pytest.raises(HTTPException) as rejected:
        _resolve(old_token)
    assert rejected.value.status_code == 401

    new_token = _login("scope-first", "scope_owner", "scope-owner-password")
    assert _resolve(new_token).scope.authority_epoch != old_epoch


def test_two_restaurants_resolve_only_their_database_tenant(scope_data):
    owner_token = _login("scope-first", "scope_owner", "scope-owner-password")
    kitchen_token = _login(
        "scope-second", "scope_kitchen", "scope-kitchen-password"
    )
    assert _resolve(owner_token).scope.restaurant_id == scope_data["first_id"]
    assert _resolve(kitchen_token).scope.restaurant_id == scope_data["second_id"]

    forged = create_access_token(
        {
            "sub": str(scope_data["owner_id"]),
            "restaurant_id": scope_data["second_id"],
            "role": "kitchen",
            "security_version": 3,
            "jti": "forged-scope-jti",
            "session_required": True,
        }
    )
    with pytest.raises(HTTPException) as rejected:
        _resolve(forged)
    assert rejected.value.status_code == 401


def test_expired_missing_revoked_and_mismatched_sessions_fail_closed(scope_data):
    token = _login("scope-first", "scope_owner", "scope-owner-password")
    payload = jwt.decode(
        token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
    )

    expired = create_access_token(
        {
            "sub": str(scope_data["owner_id"]),
            "restaurant_id": scope_data["first_id"],
            "role": "owner",
            "security_version": 3,
            "jti": payload["jti"],
        },
        expires_delta=datetime.timedelta(seconds=-1),
    )
    with pytest.raises(HTTPException) as expired_error:
        _resolve(expired)
    assert expired_error.value.status_code == 401

    missing = create_access_token(
        {
            "sub": str(scope_data["owner_id"]),
            "restaurant_id": scope_data["first_id"],
            "role": "owner",
            "security_version": 3,
            "jti": "unknown-session-jti",
        }
    )
    with pytest.raises(HTTPException) as missing_error:
        _resolve(missing)
    assert missing_error.value.status_code == 401

    no_jti = jwt.encode(
        {
            "sub": str(scope_data["owner_id"]),
            "restaurant_id": scope_data["first_id"],
            "role": "owner",
            "security_version": 3,
            "exp": int(
                (
                    datetime.datetime.now(datetime.timezone.utc)
                    + datetime.timedelta(minutes=5)
                ).timestamp()
            ),
        },
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )
    with pytest.raises(HTTPException) as no_jti_error:
        _resolve(no_jti)
    assert no_jti_error.value.status_code == 401

    db = SessionLocal()
    session = (
        db.query(StaffSession)
        .filter(StaffSession.token_jti == payload["jti"])
        .one()
    )
    session.status = "revoked"
    session.revoked_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.close()
    with pytest.raises(HTTPException) as revoked_error:
        _resolve(token)
    assert revoked_error.value.status_code == 401


def test_inactive_and_missing_actor_fail_closed(scope_data):
    token = _login("scope-second", "scope_kitchen", "scope-kitchen-password")
    db = SessionLocal()
    actor = db.query(StaffUser).filter(StaffUser.id == scope_data["kitchen_id"]).one()
    actor.status = "suspended"
    db.commit()
    db.close()
    with pytest.raises(HTTPException) as suspended:
        _resolve(token)
    assert suspended.value.status_code == 401

    db = SessionLocal()
    actor = db.query(StaffUser).filter(StaffUser.id == scope_data["kitchen_id"]).one()
    actor.status = "active"
    actor.is_active = False
    db.commit()
    db.close()
    with pytest.raises(HTTPException) as inactive:
        _resolve(token)
    assert inactive.value.status_code == 401

    unknown = create_access_token(
        {
            "sub": "2147483647",
            "restaurant_id": scope_data["second_id"],
            "role": "kitchen",
            "security_version": 0,
            "jti": "unknown-actor-jti",
        }
    )
    with pytest.raises(HTTPException) as missing:
        _resolve(unknown)
    assert missing.value.status_code == 401


@pytest.mark.parametrize(
    ("slug", "login", "password", "expected_role"),
    [
        ("scope-first", "scope_owner", "scope-owner-password", "owner"),
        ("scope-second", "scope_kitchen", "scope-kitchen-password", "kitchen"),
    ],
)
def test_existing_me_endpoint_uses_compatibility_dependency(
    scope_data, slug, login, password, expected_role
):
    token = _login(slug, login, password)
    response = client.get(
        "/auth/staff/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["role"] == expected_role
