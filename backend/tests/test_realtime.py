import asyncio
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.database import SessionLocal
from app.main import app
from app.models.menu import MenuCategory, MenuItem
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.services import realtime
from app.services.realtime import InMemoryRealtimeBroker, RealtimeEvent
from app.utils.auth import create_access_token, hash_password


client = TestClient(app)


@pytest.fixture
def realtime_context():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    restaurant = Restaurant(
        name="Realtime Cafe",
        slug=f"realtime-{suffix}",
        is_active=True,
        currency="INR",
        order_prefix="RT",
    )
    other_restaurant = Restaurant(
        name="Other Realtime Cafe",
        slug=f"other-realtime-{suffix}",
        is_active=True,
        currency="INR",
        order_prefix="OR",
    )
    db.add_all([restaurant, other_restaurant])
    db.flush()

    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="7",
        table_code=f"RT-{suffix}",
        is_active=True,
    )
    db.add(table)
    db.flush()

    category = MenuCategory(
        restaurant_id=restaurant.id,
        name_en="Mains",
        display_order=1,
        is_active=True,
    )
    db.add(category)
    db.flush()
    item = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Live Dosa",
        price=Decimal("80.00"),
        is_available=True,
    )
    db.add(item)
    db.flush()

    users = {}
    for role in ("owner", "admin", "staff", "kitchen"):
        user = StaffUser(
            restaurant_id=restaurant.id,
            name=f"{role.title()} User",
            email=f"{role}-{suffix}@realtime.local",
            password_hash=hash_password("Password123!"),
            role=role,
            status="active",
            is_active=True,
        )
        db.add(user)
        db.flush()
        users[role] = user

    other_owner = StaffUser(
        restaurant_id=other_restaurant.id,
        name="Other Owner",
        email=f"other-owner-{suffix}@realtime.local",
        password_hash=hash_password("Password123!"),
        role="owner",
        status="active",
        is_active=True,
    )
    db.add(other_owner)
    db.commit()

    data = {
        "restaurant_id": restaurant.id,
        "other_restaurant_id": other_restaurant.id,
        "restaurant_slug": restaurant.slug,
        "table_id": table.id,
        "table_code": table.table_code,
        "item_id": item.id,
        "owner_token": create_access_token({"sub": str(users["owner"].id), "restaurant_id": restaurant.id, "role": "owner"}),
        "admin_token": create_access_token({"sub": str(users["admin"].id), "restaurant_id": restaurant.id, "role": "admin"}),
        "staff_token": create_access_token({"sub": str(users["staff"].id), "restaurant_id": restaurant.id, "role": "staff"}),
        "kitchen_token": create_access_token({"sub": str(users["kitchen"].id), "restaurant_id": restaurant.id, "role": "kitchen"}),
        "other_token": create_access_token({"sub": str(other_owner.id), "restaurant_id": other_restaurant.id, "role": "owner"}),
    }
    db.close()

    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([data["restaurant_id"], data["other_restaurant_id"]])).delete()
    db.commit()
    db.close()


def auth(data, key="staff_token"):
    return {"Authorization": f"Bearer {data[key]}"}


def start_session(data):
    return client.post(
        f"/staff/tables/{data['table_id']}/sessions",
        headers=auth(data),
        json={},
    )


def create_staff_order(data):
    return client.post(
        f"/staff/tables/{data['table_id']}/orders",
        headers={**auth(data), "Idempotency-Key": f"rt-{uuid.uuid4().hex}"},
        json={
            "items": [{"menu_item_id": data["item_id"], "quantity": 1}],
            "customer_note": "Real-time test",
        },
    )


def receive_event(ws, event_type: str):
    for _ in range(5):
        message = ws.receive_json()
        if message.get("type") == event_type:
            return message
    raise AssertionError(f"Did not receive {event_type}")


def test_in_memory_broker_scopes_channels_and_unsubscribes():
    async def run():
        broker = InMemoryRealtimeBroker()
        subscriber_a, queue_a = await broker.subscribe({"restaurant:1:staff"})
        subscriber_b, queue_b = await broker.subscribe({"restaurant:2:staff"})

        broker.publish(
            RealtimeEvent(
                type=realtime.EVENT_TABLE_UPDATED,
                restaurant_id=1,
                channels=("restaurant:1:staff",),
                resource_id="1",
            )
        )

        event = await asyncio.wait_for(queue_a.get(), timeout=1)
        assert event.type == realtime.EVENT_TABLE_UPDATED
        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(queue_b.get(), timeout=0.05)

        await broker.unsubscribe(subscriber_a)
        await broker.unsubscribe(subscriber_b)
        assert broker._subscribers == {}

    asyncio.run(run())


def test_staff_websocket_rejects_kitchen_user_from_staff_channel(realtime_context):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/staff?channel=staff&token={realtime_context['kitchen_token']}"):
            pass


def test_staff_websocket_receives_order_created_after_commit(realtime_context):
    assert start_session(realtime_context).status_code == 201

    with client.websocket_connect(f"/ws/staff?channel=kitchen&token={realtime_context['kitchen_token']}") as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = create_staff_order(realtime_context)
        assert response.status_code == 201
        event = receive_event(ws, realtime.EVENT_ORDER_CREATED)

    assert event["restaurant_id"] == realtime_context["restaurant_id"]
    assert event["state"]["status"] == "pending"
    assert event["state"]["table_id"] == realtime_context["table_id"]


def test_public_order_websocket_receives_status_change(realtime_context):
    assert start_session(realtime_context).status_code == 201
    order = create_staff_order(realtime_context).json()

    with client.websocket_connect(f"/ws/public/orders/{order['public_token']}") as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.patch(
            f"/kitchen/restaurants/{realtime_context['restaurant_slug']}/orders/{order['public_token']}/status",
            headers=auth(realtime_context, "kitchen_token"),
            json={"status": "accepted"},
        )
        assert response.status_code == 200
        event = receive_event(ws, realtime.EVENT_ORDER_STATUS_CHANGED)

    assert "restaurant_id" not in event
    assert event["state"]["status"] == "accepted"


def test_staff_websocket_receives_service_request_event(realtime_context):
    assert start_session(realtime_context).status_code == 201

    with client.websocket_connect(f"/ws/staff?channel=staff&token={realtime_context['staff_token']}") as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.post(
            f"/public/restaurants/{realtime_context['restaurant_slug']}/tables/{realtime_context['table_code']}/service-requests",
            json={"request_type": "water"},
        )
        assert response.status_code == 201
        event = receive_event(ws, realtime.EVENT_SERVICE_REQUEST_CREATED)

    assert event["restaurant_id"] == realtime_context["restaurant_id"]
    assert event["state"]["request_type"] == "water"


def test_staff_websocket_receives_session_bill_and_payment_events(realtime_context):
    with client.websocket_connect(f"/ws/staff?channel=staff&token={realtime_context['staff_token']}") as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        session_response = start_session(realtime_context)
        assert session_response.status_code == 201
        session_event = receive_event(ws, realtime.EVENT_SESSION_OPENED)

        assert create_staff_order(realtime_context).status_code == 201
        receive_event(ws, realtime.EVENT_ORDER_CREATED)

        bill_response = client.post(
            f"/staff/tables/{realtime_context['table_id']}/bill",
            headers=auth(realtime_context),
            json={},
        )
        assert bill_response.status_code == 201
        bill_event = receive_event(ws, realtime.EVENT_BILL_GENERATED)
        bill_number = bill_response.json()["bill_number"]

        issue_response = client.post(
            f"/staff/bills/{bill_number}/issue",
            headers=auth(realtime_context),
        )
        assert issue_response.status_code == 200
        receive_event(ws, realtime.EVENT_BILL_UPDATED)

        paid_response = client.post(
            f"/staff/bills/{bill_number}/confirm-counter-payment",
            headers=auth(realtime_context, "owner_token"),
            json={"method": "counter_cash"},
        )
        assert paid_response.status_code == 200
        paid_event = receive_event(ws, realtime.EVENT_BILL_PAID)
        closed_event = receive_event(ws, realtime.EVENT_SESSION_CLOSED)

    assert session_event["state"]["table_id"] == realtime_context["table_id"]
    assert bill_event["state"]["bill_number"] == bill_number
    assert paid_event["state"]["status"] == "paid"
    assert closed_event["state"]["status"] == "closed"


def test_availability_websocket_receives_item_update(realtime_context):
    with client.websocket_connect(f"/ws/staff?channel=availability&token={realtime_context['staff_token']}") as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.patch(
            f"/staff/availability/items/{realtime_context['item_id']}",
            headers=auth(realtime_context),
            json={"is_available": False},
        )
        assert response.status_code == 200
        event = receive_event(ws, realtime.EVENT_AVAILABILITY_UPDATED)

    assert event["state"]["kind"] == "item"
    assert event["state"]["item_id"] == realtime_context["item_id"]
    assert event["state"]["is_available"] is False


def test_public_menu_websocket_receives_safe_availability_update(realtime_context):
    with client.websocket_connect(
        f"/ws/public/restaurants/{realtime_context['restaurant_slug']}/tables/{realtime_context['table_code']}/menu"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.patch(
            f"/staff/availability/items/{realtime_context['item_id']}",
            headers=auth(realtime_context),
            json={"is_available": False},
        )
        assert response.status_code == 200
        event = receive_event(ws, realtime.EVENT_AVAILABILITY_UPDATED)

    assert "restaurant_id" not in event
    assert event["state"]["kind"] == "item"
    assert event["state"]["item_id"] == realtime_context["item_id"]


def test_failed_order_validation_does_not_publish(monkeypatch, realtime_context):
    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))

    response = create_staff_order(realtime_context)

    assert response.status_code == 409
    assert published == []
