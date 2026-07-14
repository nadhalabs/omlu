import uuid

from fastapi.testclient import TestClient

from app.config import settings
from app.database import SessionLocal
from app.main import app
from app.models.dining_session import DiningSession
from app.models.push_subscription import CustomerPushSubscription
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.services import push_notifications
from app.services.realtime import (
    EVENT_BILL_PAID,
    EVENT_ORDER_STATUS_CHANGED,
    EVENT_SESSION_CLOSED,
    RealtimeEvent,
    session_channel,
)


client = TestClient(app)


def _setup_session(status="open"):
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:8]
    restaurant = Restaurant(name=f"Push Cafe {suffix}", slug=f"push-{suffix}", is_active=True)
    db.add(restaurant)
    db.flush()
    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="P1",
        table_code=f"PUSH-{suffix}",
        is_active=True,
    )
    db.add(table)
    db.flush()
    session = DiningSession(
        restaurant_id=restaurant.id,
        table_id=table.id,
        public_token=f"push-session-{suffix}",
        status=status,
    )
    db.add(session)
    db.commit()
    data = {
        "restaurant_id": restaurant.id,
        "session_id": session.id,
        "session_token": session.public_token,
    }
    db.close()
    return data


def _cleanup(restaurant_id):
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id == restaurant_id).delete()
    db.commit()
    db.close()


def _subscription_payload(endpoint_suffix="1"):
    return {
        "endpoint": f"https://push.example.test/send/{endpoint_suffix}",
        "keys": {
            "p256dh": "a" * 32,
            "auth": "b" * 24,
        },
    }


def test_customer_push_subscription_is_session_scoped(monkeypatch):
    data = _setup_session()
    monkeypatch.setattr(settings, "vapid_public_key", "public-key")
    monkeypatch.setattr(settings, "vapid_private_key", "private-key")
    try:
        response = client.post(
            f"/public/sessions/{data['session_token']}/push-subscriptions",
            json=_subscription_payload(),
        )

        assert response.status_code == 201
        db = SessionLocal()
        subscription = db.query(CustomerPushSubscription).filter(
            CustomerPushSubscription.dining_session_id == data["session_id"]
        ).one()
        assert subscription.restaurant_id == data["restaurant_id"]
        assert subscription.status == "active"
        db.close()
    finally:
        _cleanup(data["restaurant_id"])


def test_customer_push_rejects_closed_session(monkeypatch):
    data = _setup_session(status="closed")
    monkeypatch.setattr(settings, "vapid_public_key", "public-key")
    monkeypatch.setattr(settings, "vapid_private_key", "private-key")
    try:
        response = client.post(
            f"/public/sessions/{data['session_token']}/push-subscriptions",
            json=_subscription_payload(),
        )

        assert response.status_code == 404
    finally:
        _cleanup(data["restaurant_id"])


def test_customer_push_enqueues_only_safe_customer_events(monkeypatch):
    calls = []

    class ImmediateExecutor:
        def submit(self, fn, *args, **kwargs):
            calls.append((fn.__name__, args))
            return None

    monkeypatch.setattr(push_notifications, "_executor", ImmediateExecutor())
    event = RealtimeEvent(
        type=EVENT_ORDER_STATUS_CHANGED,
        restaurant_id=1,
        channels=(session_channel("session-token"),),
        resource_id="99",
        state={"status": "ready", "order_id": 123, "table_id": 456},
    )

    push_notifications.enqueue_customer_push_for_event(event)

    assert calls == [("_send_session_notification", ("session-token", {"title": "Order ready", "body": "Your order is ready.", "tag": "order-ready"}))]


def test_customer_push_ignores_pending_payment_and_expires_on_close(monkeypatch):
    calls = []

    class ImmediateExecutor:
        def submit(self, fn, *args, **kwargs):
            calls.append((fn.__name__, args))
            return None

    monkeypatch.setattr(push_notifications, "_executor", ImmediateExecutor())
    pending = RealtimeEvent(
        type=EVENT_BILL_PAID,
        restaurant_id=1,
        channels=(session_channel("session-token"),),
        resource_id="1",
        state={"status": "payment_pending"},
    )
    closed = RealtimeEvent(
        type=EVENT_SESSION_CLOSED,
        restaurant_id=1,
        channels=(session_channel("session-token"),),
        resource_id="1",
        state={"status": "closed"},
    )

    push_notifications.enqueue_customer_push_for_event(pending)
    push_notifications.enqueue_customer_push_for_event(closed)

    assert calls == [("_deactivate_session_subscriptions", ("session-token",))]
