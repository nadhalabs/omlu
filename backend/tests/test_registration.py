from fastapi.testclient import TestClient

import app.routes.registration as registration_route
from app.main import app
from app.database import SessionLocal
from app.models.restaurant import Restaurant
from app.models.staff_user import AuditLog, StaffUser
from app.utils.auth import verify_password


client = TestClient(app)


def _payload(slug: str = "registration-test-cafe", owner_username: str = "owner_one") -> dict:
    return {
        "restaurant_name": "Registration Test Cafe",
        "restaurant_slug": slug,
        "contact_email": "contact@registration.test",
        "phone_number": "+91 99999 99999",
        "city": "Kochi",
        "owner_full_name": "Registration Owner",
        "owner_username": owner_username,
        "owner_email": "owner@registration.test",
        "password": "StrongPass1!",
        "confirm_password": "StrongPass1!",
        "accept_terms": True,
    }


def _delete_restaurant(slug: str) -> None:
    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.slug == slug).first()
        if restaurant:
            db.delete(restaurant)
            db.commit()
    finally:
        db.close()


def test_restaurant_registration_creates_active_owner_and_defaults():
    slug = "registration-test-cafe"
    _delete_restaurant(slug)

    response = client.post("/public/restaurants/register", json=_payload(slug=slug))

    assert response.status_code == 201
    assert response.json() == {
        "success": True,
        "restaurant_slug": slug,
        "next_path": "/admin/setup",
    }
    assert "id" not in response.text.lower()

    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.slug == slug).one()
        owner = db.query(StaffUser).filter(StaffUser.restaurant_id == restaurant.id).one()
        audit_log = db.query(AuditLog).filter(
            AuditLog.restaurant_id == restaurant.id,
            AuditLog.action == "restaurant_self_registered",
        ).one()

        assert restaurant.is_active is True
        assert restaurant.contact_email == "contact@registration.test"
        assert restaurant.phone_number == "+919999999999"
        assert restaurant.city == "Kochi"
        assert restaurant.plan == "free_pilot"
        assert restaurant.subscription_status == "active"
        assert restaurant.trial_started_at is not None
        assert owner.role == "owner"
        assert owner.status == "active"
        assert owner.is_active is True
        assert owner.must_change_password is False
        assert owner.username == "owner_one"
        assert owner.email == "owner@registration.test"
        assert verify_password("StrongPass1!", owner.password_hash)
        assert audit_log.actor_user_id == owner.id
    finally:
        db.close()
        _delete_restaurant(slug)


def test_duplicate_restaurant_username_is_rejected_case_insensitively():
    slug = "registration-duplicate-cafe"
    _delete_restaurant(slug)

    first = client.post("/public/restaurants/register", json=_payload(slug=slug))
    assert first.status_code == 201

    duplicate = _payload(slug=slug)
    duplicate["owner_username"] = "owner_two"
    duplicate["owner_email"] = "owner2@registration.test"
    response = client.post("/public/restaurants/register", json=duplicate)

    assert response.status_code == 409
    assert response.json()["detail"] == {
        "field": "restaurant_username",
        "message": "Restaurant username is already taken.",
    }

    db = SessionLocal()
    try:
        count = db.query(Restaurant).filter(Restaurant.slug == slug).count()
        assert count == 1
    finally:
        db.close()
        _delete_restaurant(slug)


def test_registration_ignores_frontend_role_values_and_owner_can_login():
    slug = "registration-role-cafe"
    _delete_restaurant(slug)
    payload = _payload(slug=slug)
    payload["role"] = "kitchen"

    response = client.post("/public/restaurants/register", json=payload)
    assert response.status_code == 201

    login_response = client.post(
        "/auth/staff/login",
        json={
            "restaurant_slug": slug,
            "login": payload["owner_username"],
            "password": payload["password"],
        },
    )

    assert login_response.status_code == 200
    assert login_response.json()["staff"]["role"] == "owner"
    assert login_response.json()["staff"]["must_change_password"] is False

    _delete_restaurant(slug)


def test_registration_validation_rejects_bad_username_password_and_terms():
    response = client.post(
        "/public/restaurants/register",
        json={
            **_payload(slug="Invalid Uppercase"),
            "password": "weakpassword",
            "confirm_password": "weakpassword",
            "accept_terms": False,
        },
    )

    assert response.status_code == 422


def test_registration_rolls_back_when_owner_creation_fails(monkeypatch):
    slug = "registration-rollback-cafe"
    _delete_restaurant(slug)

    def fail_hash_password(_password: str) -> str:
        raise RuntimeError("hashing unavailable")

    monkeypatch.setattr(registration_route, "hash_password", fail_hash_password)
    response = client.post("/public/restaurants/register", json=_payload(slug=slug))

    assert response.status_code == 500
    db = SessionLocal()
    try:
        assert db.query(Restaurant).filter(Restaurant.slug == slug).count() == 0
        assert db.query(StaffUser).filter(StaffUser.email == "owner@registration.test").count() == 0
    finally:
        db.close()
