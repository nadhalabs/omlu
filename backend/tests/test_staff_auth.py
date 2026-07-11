import datetime
import pytest
import jwt
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.config import settings
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password, create_access_token

client = TestClient(app)

@pytest.fixture(scope="module")
def setup_auth_test_data():
    db = SessionLocal()
    # Clean up test restaurant
    db.query(Restaurant).filter(Restaurant.slug == "auth-test-slug").delete()
    db.query(Restaurant).filter(Restaurant.slug == "auth-other-slug").delete()
    db.commit()

    # Create active restaurant
    restaurant = Restaurant(name="Auth Test Restaurant", slug="auth-test-slug", is_active=True)
    db.add(restaurant)
    
    other_restaurant = Restaurant(name="Auth Other Restaurant", slug="auth-other-slug", is_active=True)
    db.add(other_restaurant)
    
    inactive_restaurant = Restaurant(name="Auth Inactive Restaurant", slug="auth-inactive-slug", is_active=False)
    db.add(inactive_restaurant)
    db.flush()

    # Create staff users
    # 1. Owner (Active)
    owner = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Owner",
        email="owner@test.local",
        password_hash=hash_password("owner123"),
        role="owner",
        is_active=True
    )
    # 2. Kitchen (Active)
    kitchen = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Kitchen",
        email="kitchen@test.local",
        password_hash=hash_password("kitchen123"),
        role="kitchen",
        is_active=True
    )
    # 3. Waiter (Active)
    waiter = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Waiter",
        email="waiter@test.local",
        password_hash=hash_password("waiter123"),
        role="waiter",
        is_active=True
    )
    # 4. Inactive Staff
    inactive_staff = StaffUser(
        restaurant_id=restaurant.id,
        name="Inactive Staff",
        email="inactive@test.local",
        password_hash=hash_password("inactive123"),
        role="kitchen",
        is_active=False
    )
    # 5. Inactive Restaurant Staff
    inactive_res_staff = StaffUser(
        restaurant_id=inactive_restaurant.id,
        name="Inactive Res Staff",
        email="resinactive@test.local",
        password_hash=hash_password("resinactive123"),
        role="owner",
        is_active=True
    )
    # 6. Other Restaurant Staff
    other_staff = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Res Staff",
        email="other@test.local",
        password_hash=hash_password("other123"),
        role="kitchen",
        is_active=True
    )

    db.add_all([owner, kitchen, waiter, inactive_staff, inactive_res_staff, other_staff])
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "restaurant_slug": restaurant.slug,
        "other_restaurant_slug": other_restaurant.slug,
        "inactive_restaurant_slug": inactive_restaurant.slug,
        "owner_email": owner.email,
        "kitchen_email": kitchen.email,
        "waiter_email": waiter.email,
        "inactive_email": inactive_staff.email,
        "inactive_res_email": inactive_res_staff.email,
        "other_email": other_staff.email,
        "owner_id": owner.id,
        "kitchen_id": kitchen.id,
        "waiter_id": waiter.id,
        "other_id": other_staff.id,
    }
    
    yield data

    # Cleanup
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([restaurant.id, other_restaurant.id, inactive_restaurant.id])).delete()
    db.commit()
    db.close()


def test_valid_login(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": data["owner_email"],
        "password": "owner123",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert "access_token" in res_data
    assert res_data["token_type"] == "bearer"
    assert res_data["staff"]["name"] == "Test Owner"
    assert res_data["staff"]["role"] == "owner"


def test_wrong_password(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": data["owner_email"],
        "password": "wrong-password",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401
    assert "invalid restaurant credentials" in response.json()["detail"].lower()


def test_unknown_restaurant(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": data["owner_email"],
        "password": "owner123",
        "restaurant_slug": "unknown-restaurant-slug"
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_unknown_email(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": "unknown-email@test.local",
        "password": "owner123",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_inactive_staff_login_denied(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": data["inactive_email"],
        "password": "inactive123",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_inactive_restaurant_login_denied(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": data["inactive_res_email"],
        "password": "resinactive123",
        "restaurant_slug": data["inactive_restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_missing_token():
    response = client.get("/auth/staff/me")
    assert response.status_code == 401
    assert "credentials missing" in response.json()["detail"].lower()


def test_invalid_token():
    response = client.get(
        "/auth/staff/me",
        headers={"Authorization": "Bearer invalid-token-string"}
    )
    assert response.status_code == 401
    assert "invalid or expired" in response.json()["detail"].lower()


def test_expired_token(setup_auth_test_data):
    data = setup_auth_test_data
    expired_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"},
        expires_delta=datetime.timedelta(seconds=-10) # Expired 10 seconds ago
    )
    response = client.get(
        "/auth/staff/me",
        headers={"Authorization": f"Bearer {expired_token}"}
    )
    assert response.status_code == 401


def test_auth_me_endpoint(setup_auth_test_data):
    data = setup_auth_test_data
    token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    response = client.get(
        "/auth/staff/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["name"] == "Test Owner"
    assert res_data["role"] == "owner"


def test_owner_kitchen_access_allowed(setup_auth_test_data):
    data = setup_auth_test_data
    token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_kitchen_role_access_allowed(setup_auth_test_data):
    data = setup_auth_test_data
    token = create_access_token(
        data={"sub": str(data["kitchen_id"]), "restaurant_id": data["restaurant_id"], "role": "kitchen"}
    )
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200


def test_waiter_denied_kitchen_access(setup_auth_test_data):
    data = setup_auth_test_data
    token = create_access_token(
        data={"sub": str(data["waiter_id"]), "restaurant_id": data["restaurant_id"], "role": "waiter"}
    )
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert "not permitted" in response.json()["detail"].lower()


def test_cross_restaurant_access_denied(setup_auth_test_data):
    data = setup_auth_test_data
    # Other staff token attempts to access restaurant slug of test restaurant
    token = create_access_token(
        data={"sub": str(data["other_id"]), "restaurant_id": 9999, "role": "kitchen"} # Fake restaurant ID
    )
    response = client.get(
        f"/kitchen/restaurants/{data['restaurant_slug']}/orders",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403
    assert "access denied for this restaurant" in response.json()["detail"].lower()


def test_password_hash_is_not_plain_text(setup_auth_test_data):
    db = SessionLocal()
    staff = db.query(StaffUser).filter(StaffUser.email == "owner@test.local").first()
    assert staff.password_hash != "owner123"
    assert "$argon2id$" in staff.password_hash
    db.close()


def test_login_rate_limiting(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "email": data["owner_email"],
        "password": "owner123",
        "restaurant_slug": data["restaurant_slug"]
    }
    # Trigger 10 logins (allowed)
    for _ in range(10):
        res = client.post("/auth/staff/login", json=payload)
        assert res.status_code == 200

    # 11th login should return 429
    res = client.post("/auth/staff/login", json=payload)
    assert res.status_code == 429
    assert "too many login attempts" in res.json()["detail"].lower()
