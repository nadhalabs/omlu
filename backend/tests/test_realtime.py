import asyncio
import datetime
import os
import uuid
from decimal import Decimal

import pytest
from starlette.websockets import WebSocketDisconnect

from app.database import SessionLocal
from app.main import app
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffSession, StaffUser
from app.services import realtime
from app.services.realtime import (
    AuthorityRevocation,
    InMemoryRealtimeBroker,
    RedisRealtimeBroker,
    RealtimeEvent,
)
from app.utils.auth import (
    create_access_token as create_raw_access_token,
    decode_access_token,
    hash_password,
)
from tests.auth_helpers import create_session_access_token as create_access_token


from tests.participant_helpers import ParticipantTestClient, authorize_existing_session, participant_headers

client = ParticipantTestClient(app)


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
        "owner_id": users["owner"].id,
        "admin_id": users["admin"].id,
        "staff_id": users["staff"].id,
        "kitchen_id": users["kitchen"].id,
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


def create_invalid_staff_order(data):
    return client.post(
        f"/staff/tables/{data['table_id']}/orders",
        headers={**auth(data), "Idempotency-Key": f"rt-invalid-{uuid.uuid4().hex}"},
        json={
            "items": [{"menu_item_id": data["item_id"], "quantity": 0}],
            "customer_note": "Invalid real-time test",
        },
    )


def participant_for_session(data, session_token):
    authority = authorize_existing_session(
        client,
        data["restaurant_slug"],
        data["table_code"],
        session_token,
        auth(data, "owner_token"),
    )
    client.register_authority(authority, data["restaurant_slug"], data["table_code"])
    return authority


def receive_event(ws, event_type: str):
    for _ in range(5):
        message = ws.receive_json()
        if message.get("type") == event_type:
            return message
    raise AssertionError(f"Did not receive {event_type}")


def assert_authority_close(ws):
    message = ws.receive()
    assert message["type"] == "websocket.close"
    assert message["code"] == 1008


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


class FakeRedisServer:
    def __init__(self):
        self.subscribers = {}

    def client(self):
        return FakeRedisClient(self)

    async def publish(self, channel, payload):
        for pubsub in list(self.subscribers.get(channel, set())):
            await pubsub.queue.put({"type": "message", "channel": channel, "data": payload})


class FakeRedisClient:
    def __init__(self, server):
        self.server = server

    def pubsub(self):
        return FakeRedisPubSub(self.server)

    async def publish(self, channel, payload):
        await self.server.publish(channel, payload)

    async def close(self):
        pass


class FakeRedisPubSub:
    def __init__(self, server):
        self.server = server
        self.channels = set()
        self.queue = asyncio.Queue()
        self.closed = False

    async def subscribe(self, *channels):
        for channel in channels:
            self.channels.add(channel)
            self.server.subscribers.setdefault(channel, set()).add(self)

    async def unsubscribe(self, *channels):
        for channel in channels:
            self.server.subscribers.get(channel, set()).discard(self)
            self.channels.discard(channel)

    async def close(self):
        self.closed = True
        await self.unsubscribe(*list(self.channels))

    async def listen(self):
        while not self.closed:
            yield await self.queue.get()


def test_redis_broker_exchanges_events_between_instances():
    async def run():
        server = FakeRedisServer()
        broker_a = RedisRealtimeBroker("redis://test", client_factory=server.client)
        broker_b = RedisRealtimeBroker("redis://test", client_factory=server.client)
        subscriber_id, queue = await broker_b.subscribe({"session:redis-test"})

        event = RealtimeEvent(
            type=realtime.EVENT_SESSION_UPDATED,
            restaurant_id=1,
            channels=("session:redis-test",),
            resource_id="session-1",
            state={"status": "open"},
        )
        await broker_a._publish(event)

        received = await asyncio.wait_for(queue.get(), timeout=1)
        assert received.type == event.type
        assert received.event_id == event.event_id
        assert received.state == {"status": "open"}

        await broker_b.unsubscribe(subscriber_id)

    asyncio.run(run())


def test_redis_broker_propagates_authority_revocation_between_instances():
    async def run():
        server = FakeRedisServer()
        broker_a = RedisRealtimeBroker("redis://test", client_factory=server.client)
        broker_b = RedisRealtimeBroker("redis://test", client_factory=server.client)
        channel = realtime.authority_actor_channel(42)
        subscriber_id, queue = await broker_b.subscribe({channel})
        message = AuthorityRevocation(
            actor_id=42,
            restaurant_id=7,
            reason="role_changed",
        )

        await broker_a._publish(message)

        received = await asyncio.wait_for(queue.get(), timeout=1)
        assert isinstance(received, AuthorityRevocation)
        assert received.actor_id == 42
        assert received.reason == "role_changed"
        await broker_b.unsubscribe(subscriber_id)

    asyncio.run(run())


@pytest.mark.skipif(
    not os.getenv("TEST_REDIS_URL"),
    reason="Set TEST_REDIS_URL for the real Redis multi-process-equivalent drill.",
)
def test_real_redis_propagates_authority_revocation_between_brokers():
    async def run():
        redis_url = os.environ["TEST_REDIS_URL"]
        broker_a = RedisRealtimeBroker(redis_url)
        broker_b = RedisRealtimeBroker(redis_url)
        actor_id = int(uuid.uuid4().int % 1_000_000_000)
        channel = realtime.authority_actor_channel(actor_id)
        subscriber_id, queue = await broker_b.subscribe({channel})
        message = AuthorityRevocation(
            actor_id=actor_id,
            restaurant_id=7,
            reason="real_redis_revocation_test",
        )
        try:
            await broker_a._publish(message)
            received = await asyncio.wait_for(queue.get(), timeout=3)
            assert isinstance(received, AuthorityRevocation)
            assert received.actor_id == actor_id
            assert received.reason == message.reason
        finally:
            await broker_b.unsubscribe(subscriber_id)
            await broker_a.shutdown()
            await broker_b.shutdown()

    asyncio.run(run())


def test_staff_websocket_rejects_kitchen_user_from_staff_channel(realtime_context):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/staff?channel=staff&token={realtime_context['kitchen_token']}"):
            pass


def test_kitchen_websocket_rejects_general_operations_channel(realtime_context):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/staff?channel=operations&token={realtime_context['kitchen_token']}"
        ):
            pass


def test_staff_websocket_rejects_revoked_session_at_handshake(realtime_context):
    payload = decode_access_token(realtime_context["staff_token"])
    db = SessionLocal()
    db.query(StaffSession).filter(
        StaffSession.token_jti == payload["jti"],
    ).update({"status": "revoked"})
    db.commit()
    db.close()

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
        ):
            pass


def test_staff_websocket_rejects_security_version_mismatch(realtime_context):
    db = SessionLocal()
    staff = db.get(StaffUser, realtime_context["staff_id"])
    staff.security_version = (staff.security_version or 0) + 1
    db.commit()
    db.close()

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
        ):
            pass


def test_staff_websocket_rejects_expired_token(realtime_context):
    expired = create_access_token(
        {
            "sub": str(realtime_context["staff_id"]),
            "restaurant_id": realtime_context["restaurant_id"],
            "role": "staff",
        },
        expires_delta=datetime.timedelta(seconds=-1),
    )
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/staff?channel=staff&token={expired}"):
            pass


def test_staff_websocket_rejects_unknown_jti_and_cross_restaurant_claim(
    realtime_context,
):
    unknown_jti = create_raw_access_token(
        {
            "sub": str(realtime_context["staff_id"]),
            "restaurant_id": realtime_context["restaurant_id"],
            "role": "staff",
            "security_version": 0,
            "jti": uuid.uuid4().hex,
        }
    )
    wrong_restaurant = create_raw_access_token(
        {
            "sub": str(realtime_context["staff_id"]),
            "restaurant_id": realtime_context["other_restaurant_id"],
            "role": "staff",
            "security_version": 0,
            "jti": uuid.uuid4().hex,
        }
    )
    for token in (unknown_jti, wrong_restaurant):
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(
                f"/ws/staff?channel=staff&token={token}"
            ):
                pass


def test_explicit_logout_disconnects_all_connections_for_session(realtime_context):
    url = f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    with client.websocket_connect(url) as first, client.websocket_connect(url) as second:
        assert first.receive_json()["type"] == "connection.ready"
        assert second.receive_json()["type"] == "connection.ready"
        response = client.post(
            "/auth/staff/logout",
            headers=auth(realtime_context),
        )
        assert response.status_code == 200
        assert_authority_close(first)
        assert_authority_close(second)


def test_revoke_all_disconnects_live_staff_socket(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.post(
            f"/admin/staff/{realtime_context['staff_id']}/sessions/revoke",
            headers=auth(realtime_context, "owner_token"),
        )
        assert response.status_code == 200
        assert_authority_close(ws)


def test_revoke_all_disconnects_multiple_sessions_for_actor(realtime_context):
    second_token = create_access_token(
        {
            "sub": str(realtime_context["staff_id"]),
            "restaurant_id": realtime_context["restaurant_id"],
            "role": "staff",
        }
    )
    first_url = f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    second_url = f"/ws/staff?channel=staff&token={second_token}"
    with client.websocket_connect(first_url) as first, client.websocket_connect(
        second_url
    ) as second:
        assert first.receive_json()["type"] == "connection.ready"
        assert second.receive_json()["type"] == "connection.ready"
        response = client.post(
            f"/admin/staff/{realtime_context['staff_id']}/sessions/revoke",
            headers=auth(realtime_context, "owner_token"),
        )
        assert response.status_code == 200
        assert_authority_close(first)
        assert_authority_close(second)


def test_role_change_immediately_removes_old_channel_privilege(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.patch(
            f"/admin/staff/{realtime_context['staff_id']}",
            headers=auth(realtime_context, "owner_token"),
            json={"role": "kitchen"},
        )
        assert response.status_code == 200
        assert_authority_close(ws)


def test_suspension_disconnects_live_staff_socket(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.patch(
            f"/admin/staff/{realtime_context['staff_id']}",
            headers=auth(realtime_context, "owner_token"),
            json={"status": "suspended", "reason": "security test"},
        )
        assert response.status_code == 200
        assert_authority_close(ws)


def test_password_reset_disconnects_live_staff_socket(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.post(
            f"/admin/staff/{realtime_context['staff_id']}/reset-password",
            headers=auth(realtime_context, "owner_token"),
            json={"temporary_password": "654321"},
        )
        assert response.status_code == 200
        assert_authority_close(ws)


def test_deletion_disconnects_live_staff_socket(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.delete(
            f"/admin/staff/{realtime_context['staff_id']}",
            headers=auth(realtime_context, "owner_token"),
        )
        assert response.status_code == 204
        assert_authority_close(ws)


def test_restaurant_reassignment_revalidation_ends_old_socket(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        db = SessionLocal()
        staff = db.get(StaffUser, realtime_context["staff_id"])
        old_restaurant_id = staff.restaurant_id
        staff.restaurant_id = realtime_context["other_restaurant_id"]
        staff.security_version = (staff.security_version or 0) + 1
        db.commit()
        db.close()
        realtime.publish_authority_revocation(
            actor_id=realtime_context["staff_id"],
            restaurant_id=old_restaurant_id,
            reason="restaurant_reassigned",
        )
        assert_authority_close(ws)


def test_operations_lock_keeps_live_socket_and_delivers_read_only_state(realtime_context):
    with client.websocket_connect(
        f"/ws/staff?channel=staff&token={realtime_context['staff_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.post(
            f"/admin/staff/{realtime_context['staff_id']}/lock",
            headers=auth(realtime_context, "owner_token"),
            json={"reason": "pause operations", "confirm_active_operations": True},
        )
        assert response.status_code == 200
        event = receive_event(ws, realtime.EVENT_STAFF_LOCKED)
        assert event["state"]["staff_id"] == realtime_context["staff_id"]
        assert client.get(
            f"/staff/tables/{realtime_context['table_id']}",
            headers=auth(realtime_context, "staff_token"),
        ).status_code == 200


def test_production_broker_cannot_use_in_memory_fallback(monkeypatch):
    monkeypatch.setattr(realtime.settings, "redis_url", None)
    monkeypatch.setattr(realtime.settings, "app_environment", "production")

    with pytest.raises(RuntimeError, match="Redis/Valkey is required"):
        realtime._create_broker()


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
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])
    order = create_staff_order(realtime_context).json()

    with client.websocket_connect(
        f"/ws/public/orders/{order['public_token']}?participant_token={authority['participant_token']}"
    ) as ws:
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


def test_public_session_websocket_receives_order_status_change(realtime_context):
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])
    order = create_staff_order(realtime_context).json()

    with client.websocket_connect(
        f"/ws/public/sessions/{session['session_token']}?participant_token={authority['participant_token']}"
    ) as ws:
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


def test_public_session_websocket_receives_bill_payment_and_close_events(realtime_context):
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])
    assert create_staff_order(realtime_context).status_code == 201

    with client.websocket_connect(
        f"/ws/public/sessions/{session['session_token']}?participant_token={authority['participant_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
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
            headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"issue-{uuid.uuid4().hex}"},
        )
        assert issue_response.status_code == 200
        issue_event = receive_event(ws, realtime.EVENT_BILL_UPDATED)
        sent_response = client.post(
            f"/staff/bills/{bill_number}/send-to-counter",
            headers=auth(realtime_context),
        )
        assert sent_response.status_code == 200
        pending_event = receive_event(ws, realtime.EVENT_BILL_PAYMENT_PENDING)
        receive_event(ws, realtime.EVENT_TABLE_STATUS_CHANGED)

        paid_response = client.post(
            f"/staff/bills/{bill_number}/confirm-counter-payment",
            headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"pay-{uuid.uuid4().hex}"},
            json={"method": "counter_cash"},
        )
        assert paid_response.status_code == 200
        terminal = ws.receive_json()
        assert terminal["type"] == realtime.EVENT_BILL_PAID
        assert terminal["state"]["status"] == "paid"
        assert terminal["state"]["receipt_token"] == paid_response.json()["receipt_token"]
        with pytest.raises(WebSocketDisconnect):
            ws.receive_json()

    assert "restaurant_id" not in bill_event
    assert bill_event["state"]["bill_number"] == bill_number
    assert issue_event["state"]["status"] == "issued"
    assert pending_event["state"]["status"] == "payment_pending"
    assert pending_event["state"]["bill_number"] == bill_number
    assert pending_event["state"]["session_token"] == session["session_token"]
    assert pending_event["state"]["table_name"] == "Table 7"
    assert pending_event["state"]["grand_total"] == 80.0
    assert pending_event["state"]["sent_by_name"] == "Staff User"
    assert pending_event["state"]["requested_at"]


def test_public_session_websocket_receives_service_request_resolution(realtime_context):
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])

    with client.websocket_connect(
        f"/ws/public/sessions/{session['session_token']}?participant_token={authority['participant_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        create_response = client.post(
            f"/public/restaurants/{realtime_context['restaurant_slug']}/tables/{realtime_context['table_code']}/service-requests",
            headers=participant_headers(authority["participant_token"]),
            json={"request_type": "water"},
        )
        assert create_response.status_code == 201
        created_event = receive_event(ws, realtime.EVENT_SERVICE_REQUEST_CREATED)

        list_response = client.get(
            "/staff/service-requests",
            headers=auth(realtime_context),
        )
        assert list_response.status_code == 200
        request_id = next(
            request["id"]
            for request in list_response.json()
            if request["request_type"] == "water" and request["status"] == "pending"
        )
        resolve_response = client.patch(
            f"/staff/service-requests/{request_id}/resolve",
            headers=auth(realtime_context),
        )
        assert resolve_response.status_code == 200
        resolved_event = receive_event(ws, realtime.EVENT_SERVICE_REQUEST_RESOLVED)

    assert "restaurant_id" not in created_event
    assert created_event["state"]["status"] == "pending"
    assert resolved_event["state"]["status"] == "resolved"


def test_public_session_websocket_rejects_customer_mutation_messages(realtime_context):
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            f"/ws/public/sessions/{session['session_token']}?participant_token={authority['participant_token']}"
        ) as ws:
            assert ws.receive_json()["type"] == "connection.ready"
            ws.send_json({
                "type": realtime.EVENT_ORDER_STATUS_CHANGED,
                "state": {"status": "served"},
            })
            ws.receive_json()


def test_staff_websocket_receives_service_request_event(realtime_context):
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])

    with client.websocket_connect(f"/ws/staff?channel=staff&token={realtime_context['staff_token']}") as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        response = client.post(
            f"/public/restaurants/{realtime_context['restaurant_slug']}/tables/{realtime_context['table_code']}/service-requests",
            headers=participant_headers(authority["participant_token"]),
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
            headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"issue-{uuid.uuid4().hex}"},
        )
        assert issue_response.status_code == 200
        receive_event(ws, realtime.EVENT_BILL_UPDATED)
        sent_response = client.post(
            f"/staff/bills/{bill_number}/send-to-counter",
            headers=auth(realtime_context),
        )
        assert sent_response.status_code == 200
        pending_event = receive_event(ws, realtime.EVENT_BILL_PAYMENT_PENDING)

        paid_response = client.post(
            f"/staff/bills/{bill_number}/confirm-counter-payment",
            headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"pay-{uuid.uuid4().hex}"},
            json={"method": "counter_cash"},
        )
        assert paid_response.status_code == 200
        payment_event = receive_event(ws, realtime.EVENT_BILL_PAYMENT_RECORDED)
        paid_event = receive_event(ws, realtime.EVENT_BILL_PAID)
        closed_event = receive_event(ws, realtime.EVENT_SESSION_CLOSED)

    assert session_event["state"]["table_id"] == realtime_context["table_id"]
    assert bill_event["state"]["bill_number"] == bill_number
    assert pending_event["state"]["status"] == "payment_pending"
    assert pending_event["state"]["bill_id"]
    assert pending_event["state"]["session_id"]
    assert pending_event["state"]["table_id"] == realtime_context["table_id"]
    assert payment_event["state"] == {"bill_number": bill_number, "status": "paid"}
    assert paid_event["state"]["status"] == "paid"
    assert paid_event["state"]["payment_method"] == "counter_cash"
    assert closed_event["state"]["status"] == "closed"


def test_revoked_participant_gets_terminal_payment_once_and_no_queued_updates(realtime_context):
    session = start_session(realtime_context).json()
    authority = participant_for_session(realtime_context, session["session_token"])
    assert create_staff_order(realtime_context).status_code == 201
    bill = client.post(
        f"/staff/tables/{realtime_context['table_id']}/bill",
        headers=auth(realtime_context),
        json={},
    ).json()
    client.post(f"/staff/bills/{bill['bill_number']}/issue", headers={**auth(realtime_context), "Idempotency-Key": f"issue-{uuid.uuid4().hex}"})
    client.post(f"/staff/bills/{bill['bill_number']}/send-to-counter", headers=auth(realtime_context))

    with client.websocket_connect(
        f"/ws/public/sessions/{session['session_token']}?participant_token={authority['participant_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        paid = client.post(
            f"/staff/bills/{bill['bill_number']}/confirm-counter-payment",
            headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"pay-{uuid.uuid4().hex}"},
            json={"method": "counter_cash"},
        )
        assert paid.status_code == 200
        terminal = ws.receive_json()
        assert terminal["type"] == realtime.EVENT_BILL_PAID
        assert terminal["state"]["status"] == "paid"
        assert terminal["state"]["receipt_token"] == paid.json()["receipt_token"]
        close = ws.receive()
        assert close["type"] == "websocket.close"
        assert close["code"] == 1000


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
    assert "item_id" not in event["state"]


def test_failed_order_validation_does_not_publish(monkeypatch, realtime_context):
    published = []
    monkeypatch.setattr(realtime.broker, "publish", lambda event: published.append(event))

    response = create_invalid_staff_order(realtime_context)

    assert response.status_code == 422
    assert published == []

    db = SessionLocal()
    try:
        assert db.query(DiningSession).filter(
            DiningSession.table_id == realtime_context["table_id"],
        ).count() == 0
        assert db.query(Order).filter(
            Order.table_id == realtime_context["table_id"],
        ).count() == 0
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Production-readiness regression: duplicate publish_event / session WS guard
# ---------------------------------------------------------------------------

import inspect as _inspect


def test_publish_event_defined_exactly_once():
    """DEFECT-001 regression: realtime module must contain exactly one
    publish_event definition.  Python silently uses the last definition when
    there are duplicates, so a naive 'works at runtime' check would pass even
    with dead code present.  We verify the source directly."""
    src = _inspect.getsource(realtime)
    definition_count = src.count("def publish_event(")
    assert definition_count == 1, (
        f"publish_event is defined {definition_count} time(s) in realtime.py; "
        "expected exactly 1.  Remove the dead duplicate definition."
    )


def test_publish_event_enqueues_push_notification(monkeypatch):
    """publish_event must call enqueue_customer_push_for_event in addition to
    broker.publish.  Guards against accidental reversion to the version that
    only called broker.publish."""
    from app.services import push_notifications

    enqueued = []
    monkeypatch.setattr(
        push_notifications, "enqueue_customer_push_for_event",
        lambda e: enqueued.append(e),
    )
    monkeypatch.setattr(realtime.broker, "publish", lambda event: None)

    realtime.publish_event(
        realtime.EVENT_ORDER_STATUS_CHANGED,
        restaurant_id=1,
        channels=["session:test-token"],
        resource_id="99",
        state={"status": "accepted"},
    )

    assert len(enqueued) == 1, "publish_event must enqueue a push notification"
    assert enqueued[0].type == realtime.EVENT_ORDER_STATUS_CHANGED


def test_active_session_websocket_connects(realtime_context):
    """An open dining session must be accepted by the public session WS."""
    session_resp = start_session(realtime_context)
    assert session_resp.status_code == 201
    session_token = session_resp.json()["session_token"]
    authority = participant_for_session(realtime_context, session_token)

    with client.websocket_connect(
        f"/ws/public/sessions/{session_token}?participant_token={authority['participant_token']}"
    ) as ws:
        msg = ws.receive_json()
        assert msg["type"] == "connection.ready"


def test_closed_session_websocket_rejected(realtime_context):
    """A paid/closed dining session must be rejected with WebSocket code 1008."""
    session_resp = start_session(realtime_context)
    assert session_resp.status_code == 201
    session_token = session_resp.json()["session_token"]

    assert create_staff_order(realtime_context).status_code == 201

    bill_resp = client.post(
        f"/staff/tables/{realtime_context['table_id']}/bill",
        headers=auth(realtime_context),
        json={},
    )
    assert bill_resp.status_code == 201
    bill_number = bill_resp.json()["bill_number"]

    client.post(f"/staff/bills/{bill_number}/issue", headers={**auth(realtime_context), "Idempotency-Key": f"issue-{uuid.uuid4().hex}"})
    client.post(f"/staff/bills/{bill_number}/send-to-counter", headers=auth(realtime_context))

    pay_resp = client.post(
        f"/staff/bills/{bill_number}/confirm-counter-payment",
        headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"pay-{uuid.uuid4().hex}"},
        json={"method": "counter_cash"},
    )
    assert pay_resp.status_code == 200

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/public/sessions/{session_token}"):
            pass


def test_cancelled_session_websocket_rejected(realtime_context):
    """A cancelled dining session must be rejected with WebSocket code 1008."""
    session_resp = start_session(realtime_context)
    assert session_resp.status_code == 201
    session_token = session_resp.json()["session_token"]

    cancel_resp = client.post(
        f"/staff/sessions/{session_token}/close-empty",
        headers=auth(realtime_context, "owner_token"),
    )
    assert cancel_resp.status_code == 200

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/public/sessions/{session_token}"):
            pass


def test_old_session_token_cannot_receive_new_session_events(realtime_context):
    """An old (closed) session token must not be accepted by the WS endpoint
    when a new session has been opened at the same table.

    Strategy:
      1. Open session A, pay and close it.
      2. Open session B at the same table.
      3. Verify old token (A) is rejected with 1008.
      4. Verify new token (B) connects and receives events.
    """
    # Session A: open, order, bill, pay, close
    session_a_resp = start_session(realtime_context)
    assert session_a_resp.status_code == 201
    token_a = session_a_resp.json()["session_token"]

    assert create_staff_order(realtime_context).status_code == 201
    bill_resp = client.post(
        f"/staff/tables/{realtime_context['table_id']}/bill",
        headers=auth(realtime_context),
        json={},
    )
    assert bill_resp.status_code == 201
    bill_number = bill_resp.json()["bill_number"]
    client.post(f"/staff/bills/{bill_number}/issue", headers={**auth(realtime_context), "Idempotency-Key": f"issue-{uuid.uuid4().hex}"})
    client.post(f"/staff/bills/{bill_number}/send-to-counter", headers=auth(realtime_context))
    pay_resp = client.post(
        f"/staff/bills/{bill_number}/confirm-counter-payment",
        headers={**auth(realtime_context, "owner_token"), "Idempotency-Key": f"pay-{uuid.uuid4().hex}"},
        json={"method": "counter_cash"},
    )
    assert pay_resp.status_code == 200

    # Session B: open a new session at the same table
    session_b_resp = start_session(realtime_context)
    assert session_b_resp.status_code == 201
    token_b = session_b_resp.json()["session_token"]
    authority_b = participant_for_session(realtime_context, token_b)
    assert token_b != token_a, "New session must have a distinct public_token"

    # Old token must be refused
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(f"/ws/public/sessions/{token_a}"):
            pass

    # New token must be accepted and receive live events
    with client.websocket_connect(
        f"/ws/public/sessions/{token_b}?participant_token={authority_b['participant_token']}"
    ) as ws:
        assert ws.receive_json()["type"] == "connection.ready"
        order_resp = create_staff_order(realtime_context)
        assert order_resp.status_code == 201
        event = receive_event(ws, realtime.EVENT_ORDER_CREATED)
    assert event["type"] == realtime.EVENT_ORDER_CREATED
