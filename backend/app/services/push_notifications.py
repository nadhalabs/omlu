import datetime
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import SessionLocal
from app.models.dining_session import DiningSession
from app.models.push_subscription import CustomerPushSubscription
from app.services.realtime import (
    EVENT_BILL_GENERATED,
    EVENT_BILL_PAID,
    EVENT_BILL_UPDATED,
    EVENT_ORDER_STATUS_CHANGED,
    EVENT_SESSION_CLOSED,
    RealtimeEvent,
    session_channel,
)


logger = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="omlu-push")


def push_enabled() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def _notification_for_event(event: RealtimeEvent) -> dict[str, str] | None:
    status_value = str(event.state.get("status") or "")
    if event.type == EVENT_ORDER_STATUS_CHANGED and status_value == "accepted":
        return {"title": "Order accepted", "body": "Your order has been accepted.", "tag": "order-accepted"}
    if event.type == EVENT_ORDER_STATUS_CHANGED and status_value == "ready":
        return {"title": "Order ready", "body": "Your order is ready.", "tag": "order-ready"}
    if event.type in {EVENT_BILL_GENERATED, EVENT_BILL_UPDATED} and status_value in {"issued", "payment_pending"}:
        return {"title": "Bill issued", "body": "Your bill is ready to view.", "tag": "bill-issued"}
    if event.type == EVENT_BILL_PAID and status_value == "paid":
        return {"title": "Payment received", "body": "Payment has been confirmed.", "tag": "payment-received"}
    return None


def _session_token_from_event(event: RealtimeEvent) -> str | None:
    for channel in event.channels:
        if channel.startswith("session:"):
            return channel.split(":", 1)[1]
    token = event.state.get("session_token")
    return str(token) if token else None


def enqueue_customer_push_for_event(event: RealtimeEvent) -> None:
    token = _session_token_from_event(event)
    if not token:
        return
    if event.type == EVENT_SESSION_CLOSED:
        _executor.submit(_deactivate_session_subscriptions, token)
        return
    notification = _notification_for_event(event)
    if not notification:
        return
    _executor.submit(_send_session_notification, token, notification)


def _deactivate_session_subscriptions(session_token: str) -> None:
    db = SessionLocal()
    try:
        session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
        if not session:
            return
        db.query(CustomerPushSubscription).filter(
            CustomerPushSubscription.dining_session_id == session.id,
            CustomerPushSubscription.status == "active",
        ).update({"status": "expired"}, synchronize_session=False)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("push.expire_failed session_token=%s error=%s", session_token[:8], exc.__class__.__name__)
    finally:
        db.close()


def _send_session_notification(session_token: str, notification: dict[str, str]) -> None:
    if not push_enabled():
        logger.info("push.skipped reason=not_configured event=%s", notification.get("tag"))
        return

    db = SessionLocal()
    try:
        session = db.query(DiningSession).options(joinedload(DiningSession.restaurant)).filter(
            DiningSession.public_token == session_token,
            DiningSession.status.notin_(["closed", "cancelled"]),
        ).first()
        if not session:
            return
        now = datetime.datetime.now(datetime.timezone.utc)
        subscriptions = db.query(CustomerPushSubscription).filter(
            CustomerPushSubscription.dining_session_id == session.id,
            CustomerPushSubscription.status == "active",
            or_(CustomerPushSubscription.expires_at.is_(None), CustomerPushSubscription.expires_at > now),
        ).limit(100).all()
        for subscription in subscriptions:
            _send_one(db, session.public_token, subscription, notification)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("push.delivery_batch_failed session_token=%s error=%s", session_token[:8], exc.__class__.__name__)
    finally:
        db.close()


def _send_one(
    db,
    session_token: str,
    subscription: CustomerPushSubscription,
    notification: dict[str, str],
) -> None:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("push.delivery_skipped reason=pywebpush_missing")
        return

    payload = {
        "title": notification["title"],
        "body": notification["body"],
        "tag": notification["tag"],
        "url": f"/session/{session_token}",
    }
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload, separators=(",", ":")),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=settings.customer_push_ttl_seconds,
        )
        subscription.last_success_at = datetime.datetime.now(datetime.timezone.utc)
        subscription.failure_count = 0
    except WebPushException as exc:
        subscription.last_failure_at = datetime.datetime.now(datetime.timezone.utc)
        subscription.failure_count += 1
        if getattr(getattr(exc, "response", None), "status_code", None) in {404, 410}:
            subscription.status = "expired"
        logger.warning("push.delivery_failed status=%s error=%s", getattr(getattr(exc, "response", None), "status_code", None), exc.__class__.__name__)
    except Exception as exc:
        subscription.last_failure_at = datetime.datetime.now(datetime.timezone.utc)
        subscription.failure_count += 1
        logger.warning("push.delivery_failed error=%s", exc.__class__.__name__)


def push_health() -> dict[str, Any]:
    return {
        "status": "enabled" if push_enabled() else "disabled",
        "vapid_public_key_configured": bool(settings.vapid_public_key),
        "vapid_private_key_configured": bool(settings.vapid_private_key),
    }
