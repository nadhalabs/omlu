import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.models.platform_user import PlatformUser
from app.utils.auth import hash_password, create_access_token

client = TestClient(app)

def test_restaurant_staff_cannot_access_platform_endpoints(db_session: Session):
    existing = db_session.query(Restaurant).filter(Restaurant.slug == "test-isolated-cafe").first()
    if existing:
        db_session.delete(existing)
        db_session.commit()

    # Create a restaurant owner user
    restaurant = Restaurant(name="Test Isolated Cafe", slug="test-isolated-cafe", is_active=True)
    db_session.add(restaurant)
    db_session.commit()

    staff = StaffUser(
        restaurant_id=restaurant.id,
        name="Restaurant Owner",
        email="owner@testisolated.com",
        password_hash=hash_password("OwnerPass123!"),
        role="owner",
        status="active",
        is_active=True,
    )
    db_session.add(staff)
    db_session.commit()

    # Issue a standard staff token (restaurant-scoped)
    staff_token = create_access_token({
        "sub": str(staff.id),
        "restaurant_id": restaurant.id,
        "role": staff.role,
        "jti": "mock_staff_jti",
        "security_version": 0,
    })

    # Attempt to access platform endpoints using restaurant staff token
    res = client.get(
        "/api/v1/platform/overview",
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert res.status_code == 401
    assert "Invalid or expired platform access token" in res.json()["detail"]


def test_unauthenticated_request_rejected():
    res = client.get("/api/v1/platform/overview")
    assert res.status_code == 401
    assert res.json()["detail"] == "Platform authorization credentials missing"
