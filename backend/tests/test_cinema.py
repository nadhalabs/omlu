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
    assert client.get("/admin/categories", headers=auth(d["cinema_token"])).status_code == 403
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
    assert client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["restaurant_token"]), json={"status":"ready"}).status_code == 403
    assert client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["other_token"]), json={"status":"ready"}).status_code == 404
    assert client.patch(f"/api/cinema/orders/{order_id}/status", headers=auth(d["cinema_token"]), json={"status":"accepted"}).status_code == 409
    for state in ["ready", "delivered"]:
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


@pytest.mark.parametrize(("legacy_status", "next_status"), [("accepted", "ready"), ("preparing", "ready"), ("out_for_delivery", "delivered")])
def test_legacy_cinema_orders_can_enter_the_simplified_workflow(cinema_data, legacy_status, next_status):
    db = SessionLocal()
    source = db.query(Order).filter(Order.restaurant_id == cinema_data["cinema"].id).first()
    source.status = legacy_status
    db.commit()
    order_id = source.id
    db.close()

    response = client.patch(
        f"/api/cinema/orders/{order_id}/status",
        headers=auth(cinema_data["cinema_token"]),
        json={"status": next_status},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == next_status


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


def test_flexible_seat_layout_persists_identity_and_uneven_rows(cinema_data):
    d = cinema_data
    screen = client.get("/api/cinema/screens", headers=auth(d["cinema_token"])).json()[0]
    screen_id = screen["id"]
    assert client.post(
        f"/api/cinema/screens/{screen_id}/rows",
        headers=auth(d["restaurant_token"]),
        json={"row_label": "Z", "number_of_seats": 3, "starting_number": 1},
    ).status_code == 403
    row = client.post(
        f"/api/cinema/screens/{screen_id}/rows",
        headers=auth(d["cinema_token"]),
        json={"row_label": "Z", "number_of_seats": 3, "starting_number": 4},
    )
    assert row.status_code == 201, row.text
    z_seats = [seat for seat in row.json()["seats"] if seat["row_label"] == "Z"]
    assert [seat["public_code"] for seat in z_seats] == ["Z4", "Z5", "Z6"]
    assert len({seat["layout_y"] for seat in z_seats}) == 1

    manual = client.post(
        f"/api/cinema/screens/{screen_id}/seats",
        headers=auth(d["cinema_token"]),
        json={"row_label": "G", "seat_number": 14, "public_code": "G14", "layout_x": 416, "layout_y": 224, "display_order": 99, "is_accessible": True},
    )
    assert manual.status_code == 201, manual.text
    created = manual.json()
    seat_id, public_code = created["id"], created["public_code"]
    moved = client.patch(
        f"/api/cinema/screens/{screen_id}/seats/{seat_id}",
        headers=auth(d["cinema_token"]),
        json={"layout_x": 608, "layout_y": 280, "display_order": 7},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["id"] == seat_id
    assert moved.json()["public_code"] == public_code
    assert (moved.json()["layout_x"], moved.json()["layout_y"], moved.json()["position_index"]) == (608, 280, 7)
    duplicate = client.post(
        f"/api/cinema/screens/{screen_id}/seats",
        headers=auth(d["cinema_token"]),
        json={"row_label": "G", "seat_number": 15, "public_code": "G14"},
    )
    assert duplicate.status_code == 409

def test_cinema_menu_crud(cinema_data):
    d = cinema_data

    # 1. Create a category
    category_res = client.post("/api/cinema/menu/categories", headers=auth(d["cinema_token"]), json={"name": "Drinks"})
    assert category_res.status_code == 201
    category_id = category_res.json()["id"]

    # 2. Create an item in that category
    item_res = client.post("/api/cinema/menu/items", headers=auth(d["cinema_token"]), json={
        "category_id": category_id,
        "name": "Coke",
        "price": "50.00"
    })
    assert item_res.status_code == 201
    item_id = item_res.json()["id"]

    # 3. Edit the item (rename, reprice)
    edit_res = client.patch(f"/api/cinema/menu/items/{item_id}", headers=auth(d["cinema_token"]), json={
        "name": "Diet Coke",
        "price": "60.00"
    })
    assert edit_res.status_code == 200
    assert edit_res.json()["name"] == "Diet Coke"
    assert edit_res.json()["price"] == "60.00"

    # 4. Deactivate the item
    del_res = client.delete(f"/api/cinema/menu/items/{item_id}", headers=auth(d["cinema_token"]))
    assert del_res.status_code == 204

    # Verify deactivated
    menu = client.get("/api/cinema/menu", headers=auth(d["cinema_token"]))
    drinks_cat = next(c for c in menu.json()["categories"] if c["id"] == category_id)
    diet_coke = next(i for i in drinks_cat["items"] if i["id"] == item_id)
    assert diet_coke["is_available"] is False

    # 5. Verify tenant isolation (other tenant can't access)
    other_cat_res = client.post("/api/cinema/menu/categories", headers=auth(d["restaurant_token"]), json={"name": "Other Drinks"})
    assert other_cat_res.status_code == 403

    other_cinema_cat_res = client.post("/api/cinema/menu/categories", headers=auth(d["other_token"]), json={"name": "Other Drinks"})
    assert other_cinema_cat_res.status_code == 201

    edit_other_cat = client.patch(f"/api/cinema/menu/categories/{category_id}", headers=auth(d["other_token"]), json={"name": "Hacked"})
    assert edit_other_cat.status_code == 404
