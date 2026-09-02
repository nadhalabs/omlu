import datetime
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.cinema import CinemaSeatSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token

client = TestClient(app)


@pytest.fixture(scope="module")
def cinema_data():
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    cinema = Restaurant(name="Cinema Test", slug=f"cinema-{suffix}", venue_type="cinema", is_active=True)
    restaurant = Restaurant(name="Restaurant Test", slug=f"restaurant-{suffix}", is_active=True)
    other_cinema = Restaurant(name="Other Cinema", slug=f"other-cinema-{suffix}", venue_type="cinema", is_active=True)
    db.add_all([cinema, restaurant, other_cinema]); db.flush()
    cinema_owner = StaffUser(restaurant_id=cinema.id, name="Owner", email=f"cinema-{suffix}@test.local", password_hash=hash_password("Password123!"), role="owner", is_active=True)
    restaurant_owner = StaffUser(restaurant_id=restaurant.id, name="Owner", email=f"restaurant-{suffix}@test.local", password_hash=hash_password("Password123!"), role="owner", is_active=True)
    other_owner = StaffUser(restaurant_id=other_cinema.id, name="Owner", email=f"other-cinema-{suffix}@test.local", password_hash=hash_password("Password123!"), role="owner", is_active=True)
    category = MenuCategory(restaurant_id=cinema.id, name_en="Snacks", display_order=0, is_active=True)
    db.add_all([cinema_owner, restaurant_owner, other_owner, category]); db.flush()
    item = MenuItem(restaurant_id=cinema.id, category_id=category.id, name_en="Popcorn", price=Decimal("125.00"), is_available=True)
    db.add(item); db.commit()
    cinema_token = create_session_access_token({"sub": str(cinema_owner.id), "role": "owner"})
    restaurant_token = create_session_access_token({"sub": str(restaurant_owner.id), "role": "owner"})
    other_token = create_session_access_token({"sub": str(other_owner.id), "role": "owner"})
    yield {"cinema": cinema, "restaurant": restaurant, "other_cinema": other_cinema, "item": item, "cinema_token": cinema_token, "restaurant_token": restaurant_token, "other_token": other_token}
    db = SessionLocal(); db.query(Restaurant).filter(Restaurant.id.in_([cinema.id, restaurant.id, other_cinema.id])).delete(synchronize_session=False); db.commit(); db.close()


def auth(token): return {"Authorization": f"Bearer {token}"}


def test_screen_layout_public_authority_and_order_flow(cinema_data):
    d = cinema_data
    assert client.get("/api/cinema/screens", headers=auth(d["restaurant_token"])).status_code == 403
    created = client.post("/api/cinema/screens", headers=auth(d["cinema_token"]), json={"name":"Screen 1","code":"s1","rows":2,"seats_per_row":3,"aisles_after":[2]})
    assert created.status_code == 201, created.text
    screen = created.json(); assert len(screen["seats"]) == 6
    seat = next(value for value in screen["seats"] if value["public_code"] == "A1")
    changed = client.patch(f'/api/cinema/screens/{screen["id"]}/seats/{seat["id"]}', headers=auth(d["cinema_token"]), json={"public_code":"VIP1","is_accessible":True})
    assert changed.status_code == 200 and changed.json()["is_accessible"] is True
    resized = client.put(f'/api/cinema/screens/{screen["id"]}/layout', headers=auth(d["cinema_token"]), json={"rows":1,"seats_per_row":2,"aisles_after":[]})
    retained = next(value for value in resized.json()["seats"] if value["id"] == seat["id"])
    assert retained["public_code"] == "VIP1" and retained["is_accessible"] is True
    public_path = f'/public/cinemas/{d["cinema"].slug}/screens/S1/seats/VIP1'
    public = client.get(public_path)
    assert public.status_code == 200
    assert public.json()["screen"] == {"id": screen["id"], "name": "Screen 1", "code": "S1"}
    assert public.json()["seat"]["public_code"] == "VIP1"
    authority = client.post(public_path + "/sessions").json()
    headers = {"X-Cinema-Seat-Token": authority["authority_token"], "Idempotency-Key": "cinema-test-key-0001"}
    body = {"items":[{"menu_item_id":d["item"].id,"quantity":2}]}
    first = client.post("/public/cinemas/orders", headers=headers, json=body)
    assert first.status_code == 201, first.text
    assert first.json()["subtotal"] == "250.00" and first.json()["seat_code"] == "VIP1"
    again = client.post("/public/cinemas/orders", headers=headers, json=body)
    assert again.json()["id"] == first.json()["id"]
    order_id = first.json()["id"]
    assert client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["restaurant_token"]), json={"status":"accepted"}).status_code == 403
    assert client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["other_token"]), json={"status":"accepted"}).status_code == 404
    for state in ["accepted","preparing","ready","out_for_delivery","delivered"]:
        response = client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["cinema_token"]), json={"status":state})
        assert response.status_code == 200, response.text
    assert client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["cinema_token"]), json={"status":"ready"}).status_code == 409
    dashboard = client.get("/api/cinema/dashboard", headers=auth(d["cinema_token"])).json()
    assert dashboard["order_count"] == 1
    assert dashboard["status_counts"]["delivered"] == 1
    assert dashboard["revenue"] == "250.00"
    assert dashboard["active_screens"] == 1
    assert dashboard["active_seats"] == 2
    assert dashboard["disabled_seats"] == 4
    assert dashboard["orders_by_screen"] == [{"screen": "Screen 1", "orders": 1}]


def test_authority_revocation_and_disabled_seat(cinema_data):
    d=cinema_data
    screen=client.get("/api/cinema/screens",headers=auth(d["cinema_token"])).json()[0]
    seat=next(value for value in screen["seats"] if value["is_active"])
    path=f'/public/cinemas/{d["cinema"].slug}/screens/{screen["code"]}/seats/{seat["public_code"]}'
    session=client.post(path+"/sessions").json()
    db=SessionLocal(); authority=db.query(CinemaSeatSession).filter_by(token_hash=__import__('hashlib').sha256(session["authority_token"].encode()).hexdigest()).one(); authority.revoked_at=datetime.datetime.now(datetime.timezone.utc); db.commit(); db.close()
    response=client.post("/public/cinemas/orders",headers={"X-Cinema-Seat-Token":session["authority_token"],"Idempotency-Key":"cinema-test-key-0002"},json={"items":[{"menu_item_id":d["item"].id,"quantity":1}]})
    assert response.status_code == 401


def test_cinema_menu_is_tenant_scoped_and_persistent(cinema_data):
    d = cinema_data
    menu = client.get("/api/cinema/menu", headers=auth(d["cinema_token"]))
    assert menu.status_code == 200
    assert menu.json()["categories"][0]["items"][0]["name"] == "Popcorn"
    assert client.get("/api/cinema/menu", headers=auth(d["restaurant_token"])).status_code == 403
    changed = client.patch(
        f'/api/cinema/menu/items/{d["item"].id}/availability',
        headers=auth(d["cinema_token"]),
        json={"is_available": False},
    )
    assert changed.status_code == 200 and changed.json()["is_available"] is False
    db = SessionLocal()
    assert db.get(MenuItem, d["item"].id).is_available is False
    db.close()
