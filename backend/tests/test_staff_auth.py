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
        username="test_owner",
        email="owner@test.local",
        password_hash=hash_password("owner123"),
        role="owner",
        is_active=True
    )
    # 2. Kitchen (Active)
    admin = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Admin",
        username="test_admin",
        email="admin@test.local",
        password_hash=hash_password("admin123"),
        role="admin",
        is_active=True
    )
    kitchen = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Kitchen",
        username="test_kitchen",
        email="kitchen@test.local",
        password_hash=hash_password("kitchen123"),
        role="kitchen",
        is_active=True
    )
    # 3. Waiter (Active)
    staff_legacy_waiter = StaffUser(
        restaurant_id=restaurant.id,
        name="Test Staff",
        username="test_staff",
        email="staff@test.local",
        password_hash=hash_password("staff123"),
        role="staff",
        is_active=True
    )
    # 4. Inactive Staff
    inactive_staff = StaffUser(
        restaurant_id=restaurant.id,
        name="Inactive Staff",
        username="inactive_staff",
        email="inactive@test.local",
        password_hash=hash_password("inactive123"),
        role="kitchen",
        is_active=False
    )
    # 5. Inactive Restaurant Staff
    inactive_res_staff = StaffUser(
        restaurant_id=inactive_restaurant.id,
        name="Inactive Res Staff",
        username="inactive_res_staff",
        email="resinactive@test.local",
        password_hash=hash_password("resinactive123"),
        role="owner",
        is_active=True
    )
    # 6. Other Restaurant Staff
    other_staff = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Res Staff",
        username="other_staff",
        email="other@test.local",
        password_hash=hash_password("other123"),
        role="kitchen",
        is_active=True
    )

    db.add_all([owner, admin, kitchen, staff_legacy_waiter, inactive_staff, inactive_res_staff, other_staff])
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "other_restaurant_id": other_restaurant.id,
        "restaurant_slug": restaurant.slug,
        "other_restaurant_slug": other_restaurant.slug,
        "inactive_restaurant_slug": inactive_restaurant.slug,
        "owner_email": owner.email,
        "admin_email": admin.email,
        "kitchen_email": kitchen.email,
        "staff_email": staff_legacy_waiter.email,
        "inactive_email": inactive_staff.email,
        "inactive_res_email": inactive_res_staff.email,
        "other_email": other_staff.email,
        "owner_id": owner.id,
        "admin_id": admin.id,
        "kitchen_id": kitchen.id,
        "staff_id": staff_legacy_waiter.id,
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
        "login": data["owner_email"],
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
    assert res_data["staff"]["status"] == "active"


def test_valid_username_login_is_case_insensitive_for_restaurant(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "login": "test_owner",
        "password": "owner123",
        "restaurant_slug": data["restaurant_slug"].upper()
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 200
    assert response.json()["staff"]["username"] == "test_owner"


@pytest.mark.parametrize(
    ("login_key", "password", "role"),
    [
        ("admin_email", "admin123", "admin"),
        ("staff_email", "staff123", "staff"),
        ("kitchen_email", "kitchen123", "kitchen"),
    ],
)
def test_role_logins(setup_auth_test_data, login_key, password, role):
    data = setup_auth_test_data
    response = client.post(
        "/auth/staff/login",
        json={
            "login": data[login_key],
            "password": password,
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert response.status_code == 200
    assert response.json()["staff"]["role"] == role


def test_correct_credentials_wrong_restaurant_denied(setup_auth_test_data):
    data = setup_auth_test_data
    response = client.post(
        "/auth/staff/login",
        json={
            "login": data["owner_email"],
            "password": "owner123",
            "restaurant_slug": data["other_restaurant_slug"],
        },
    )
    assert response.status_code == 401


def test_wrong_password(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "login": data["owner_email"],
        "password": "wrong-password",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401
    assert "invalid restaurant credentials" in response.json()["detail"].lower()


def test_unknown_restaurant(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "login": data["owner_email"],
        "password": "owner123",
        "restaurant_slug": "unknown-restaurant-slug"
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_unknown_email(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "login": "unknown-email@test.local",
        "password": "owner123",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_inactive_staff_login_denied(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "login": data["inactive_email"],
        "password": "inactive123",
        "restaurant_slug": data["restaurant_slug"]
    }
    response = client.post("/auth/staff/login", json=payload)
    assert response.status_code == 401


def test_inactive_restaurant_login_denied(setup_auth_test_data):
    data = setup_auth_test_data
    payload = {
        "login": data["inactive_res_email"],
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


def test_staff_denied_kitchen_access(setup_auth_test_data):
    data = setup_auth_test_data
    token = create_access_token(
        data={"sub": str(data["staff_id"]), "restaurant_id": data["restaurant_id"], "role": "staff"}
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
        data={"sub": str(data["other_id"]), "restaurant_id": data["other_restaurant_id"], "role": "kitchen"}
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
        "login": data["owner_email"],
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


def test_owner_can_create_staff_account_and_staff_can_login(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": "Created Staff",
            "username": "created_staff",
            "email": "created-staff@test.local",
            "role": "staff",
            "temporary_password": "123456",
        },
    )
    assert response.status_code == 201
    body = response.json()
    assert body["role"] == "staff"
    assert body["status"] == "active"
    assert "password_hash" not in body

    login_response = client.post(
        "/auth/staff/login",
        json={
            "login": "created_staff",
            "password": "123456",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert login_response.status_code == 200


def test_admin_staff_management_cannot_cross_restaurants(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    response = client.patch(
        f"/admin/staff/{data['other_id']}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"status": "suspended", "reason": "isolation test"},
    )
    assert response.status_code == 404


def test_suspend_staff_revokes_login_session(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    login_response = client.post(
        "/auth/staff/login",
        json={
            "login": data["staff_email"],
            "password": "staff123",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert login_response.status_code == 200
    staff_token = login_response.json()["access_token"]

    suspend_response = client.patch(
        f"/admin/staff/{data['staff_id']}",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"status": "suspended", "reason": "end of shift"},
    )
    assert suspend_response.status_code == 200
    assert suspend_response.json()["status"] == "suspended"
    assert suspend_response.json()["active_session_count"] == 0

    me_response = client.get(
        "/auth/staff/me",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert me_response.status_code == 401


def test_admin_revoke_sessions_invalidates_current_token(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    suffix = datetime.datetime.now(datetime.timezone.utc).strftime("%H%M%S%f")
    username = f"revokedstaff{suffix}"
    create_response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": "Revoked Session Staff",
            "username": username,
            "email": f"revoked-session-{suffix}@test.local",
            "role": "staff",
            "temporary_password": "123456",
        },
    )
    assert create_response.status_code == 201
    staff_id = create_response.json()["id"]

    login_response = client.post(
        "/auth/staff/login",
        json={
            "login": username,
            "password": "123456",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert login_response.status_code == 200
    staff_token = login_response.json()["access_token"]

    revoke_response = client.post(
        f"/admin/staff/{staff_id}/sessions/revoke",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert revoke_response.status_code == 200
    assert revoke_response.json()["active_session_count"] == 0

    me_response = client.get(
        "/auth/staff/me",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert me_response.status_code == 401
    assert "revoked" in me_response.json()["detail"].lower()


def test_kitchen_denied_staff_endpoint(setup_auth_test_data):
    data = setup_auth_test_data
    login_response = client.post(
        "/auth/staff/login",
        json={
            "login": data["kitchen_email"],
            "password": "kitchen123",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    response = client.get("/staff/sessions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403


def test_admin_cannot_remove_or_reset_owner(setup_auth_test_data):
    data = setup_auth_test_data
    admin_login = client.post(
        "/auth/staff/login",
        json={
            "login": data["admin_email"],
            "password": "admin123",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    remove_response = client.delete(
        f"/admin/staff/{data['owner_id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert remove_response.status_code == 403
    reset_response = client.post(
        f"/admin/staff/{data['owner_id']}/reset-password",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"temporary_password": "NewOwnerTemp123!"},
    )
    assert reset_response.status_code == 403


def test_new_staff_pin_login_has_no_password_change_blocker(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    create_response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": "First Login Staff",
            "username": "first_login_staff",
            "email": "first-login-staff@test.local",
            "role": "staff",
            "temporary_password": "123456",
        },
    )
    assert create_response.status_code == 201
    login_response = client.post(
        "/auth/staff/login",
        json={
            "login": "first_login_staff",
            "password": "123456",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    assert login_response.json()["staff"]["must_change_password"] is False
    allowed_response = client.get("/staff/sessions", headers={"Authorization": f"Bearer {token}"})
    assert allowed_response.status_code == 200


@pytest.mark.parametrize("role", ["staff", "kitchen"])
def test_operational_account_can_be_created_without_email_and_login_with_username_pin(setup_auth_test_data, role):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    username = f"no_email_{role}"
    create_response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": f"No Email {role.title()}", "username": username, "role": role, "temporary_password": "246810"},
    )
    assert create_response.status_code == 201
    assert create_response.json()["email"] is None
    login_response = client.post(
        "/auth/staff/login",
        json={"restaurant_slug": data["restaurant_slug"], "login": username, "password": "246810"},
    )
    assert login_response.status_code == 200
    assert login_response.json()["staff"]["role"] == role
    assert login_response.json()["staff"]["email"] is None


@pytest.mark.parametrize("role", ["staff", "kitchen"])
def test_operational_account_username_is_required(setup_auth_test_data, role):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Missing Username", "username": "", "role": role, "temporary_password": "246810"},
    )
    assert response.status_code == 422


def test_admin_creation_still_requires_email(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "No Email Admin", "username": "no_email_admin", "role": "admin", "temporary_password": "PilotSecure984!Z"},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["field"] == "email"


def test_operational_username_uniqueness_is_restaurant_scoped(setup_auth_test_data):
    data = setup_auth_test_data
    db = SessionLocal()
    first = StaffUser(
        restaurant_id=data["restaurant_id"], name="First Shared Name", username="shared_operator",
        email=None, password_hash=hash_password("135790"), role="staff", status="active", is_active=True,
    )
    second = StaffUser(
        restaurant_id=data["other_restaurant_id"], name="Second Shared Name", username="shared_operator",
        email=None, password_hash=hash_password("135790"), role="kitchen", status="active", is_active=True,
    )
    db.add_all([first, second]); db.commit(); db.close()

    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    duplicate = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Duplicate", "username": "shared_operator", "role": "staff", "temporary_password": "135790"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["field"] == "username"


@pytest.mark.parametrize(("role", "username"), [("staff", "legacy_pin_staff"), ("kitchen", "legacy_pin_kitchen")])
def test_legacy_operational_account_clears_password_change_flag(setup_auth_test_data, role, username):
    data = setup_auth_test_data
    db = SessionLocal()
    legacy = StaffUser(
        restaurant_id=data["restaurant_id"], name=f"Legacy {role}", username=username,
        email=f"{username}@test.local", password_hash=hash_password("654321"), role=role,
        status="active", is_active=True, must_change_password=True,
    )
    db.add(legacy); db.commit(); db.close()
    response = client.post("/auth/staff/login", json={
        "login": username, "password": "654321", "restaurant_slug": data["restaurant_slug"],
    })
    assert response.status_code == 200
    assert response.json()["staff"]["must_change_password"] is False
    assert client.get("/auth/staff/me", headers={"Authorization": f"Bearer {response.json()['access_token']}"}).status_code == 200


@pytest.mark.parametrize("pin", ["12345", "1234567", "12a456"])
def test_staff_pin_must_be_exactly_six_digits(setup_auth_test_data, pin):
    data = setup_auth_test_data
    owner_token = create_access_token(data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"})
    response = client.post("/admin/staff", headers={"Authorization": f"Bearer {owner_token}"}, json={
        "name": "Bad Pin Staff", "username": f"bad_pin_{len(pin)}_{pin[-1]}",
        "email": f"bad-{len(pin)}-{pin[-1]}@test.local", "role": "staff", "temporary_password": pin,
    })
    assert response.status_code in {400, 422}


def test_logout_revokes_current_session(setup_auth_test_data):
    data = setup_auth_test_data
    login_response = client.post(
        "/auth/staff/login",
        json={
            "login": data["owner_email"],
            "password": "owner123",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
    logout_response = client.post("/auth/staff/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout_response.status_code == 200
    me_response = client.get("/auth/staff/me", headers={"Authorization": f"Bearer {token}"})
    assert me_response.status_code == 401


def test_password_reset_revokes_existing_token(setup_auth_test_data):
    data = setup_auth_test_data
    owner_token = create_access_token(
        data={"sub": str(data["owner_id"]), "restaurant_id": data["restaurant_id"], "role": "owner"}
    )
    create_response = client.post(
        "/admin/staff",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": "Reset Token Staff",
            "username": "reset_token_staff",
            "email": "reset-token-staff@test.local",
            "role": "staff",
            "temporary_password": "123456",
        },
    )
    assert create_response.status_code == 201
    staff_id = create_response.json()["id"]
    change_login = client.post(
        "/auth/staff/login",
        json={
            "login": "reset_token_staff",
            "password": "123456",
            "restaurant_slug": data["restaurant_slug"],
        },
    )
    assert change_login.status_code == 200
    staff_token = change_login.json()["access_token"]
    reset_response = client.post(
        f"/admin/staff/{staff_id}/reset-password",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"temporary_password": "654321"},
    )
    assert reset_response.status_code == 200
    assert reset_response.json()["must_change_password"] is False
    me_response = client.get("/auth/staff/me", headers={"Authorization": f"Bearer {staff_token}"})
    assert me_response.status_code == 401
