import datetime
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.dining_session import DiningSession
from app.models.push_subscription import CustomerPushSubscription
from app.schemas.push import (
    CustomerPushConfigResponse,
    CustomerPushSubscriptionRequest,
    CustomerPushSubscriptionResponse,
)


router = APIRouter()
_subscribe_attempts: dict[str, deque[float]] = defaultdict(deque)


def _check_rate_limit(key: str, *, limit: int = 10, window_seconds: int = 300) -> None:
    now = time.monotonic()
    bucket = _subscribe_attempts[key]
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many push subscription attempts.")
    bucket.append(now)


def _active_session_or_404(db: Session, session_token: str) -> DiningSession:
    session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
    if not session or session.status in {"closed", "cancelled"}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active dining session not found")
    return session


@router.get("/public/push/config", response_model=CustomerPushConfigResponse)
def public_push_config():
    enabled = bool(settings.vapid_public_key and settings.vapid_private_key)
    return CustomerPushConfigResponse(enabled=enabled, public_key=settings.vapid_public_key if enabled else None)


@router.post(
    "/public/sessions/{session_token}/push-subscriptions",
    response_model=CustomerPushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_customer_push_subscription(
    session_token: str,
    payload: CustomerPushSubscriptionRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    _check_rate_limit(f"{request.client.host if request.client else 'unknown'}:{session_token[:12]}")
    if not (settings.vapid_public_key and settings.vapid_private_key):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Push notifications are not configured.")

    session = _active_session_or_404(db, session_token)
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=settings.customer_push_ttl_seconds)
    endpoint = str(payload.endpoint)
    subscription = db.query(CustomerPushSubscription).filter(
        CustomerPushSubscription.dining_session_id == session.id,
        CustomerPushSubscription.endpoint == endpoint,
    ).first()
    if not subscription:
        subscription = CustomerPushSubscription(
            restaurant_id=session.restaurant_id,
            dining_session_id=session.id,
            endpoint=endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
        )
        db.add(subscription)
    subscription.restaurant_id = session.restaurant_id
    subscription.p256dh = payload.keys.p256dh
    subscription.auth = payload.keys.auth
    subscription.user_agent = (request.headers.get("user-agent") or "")[:255] or None
    subscription.status = "active"
    subscription.expires_at = expires_at
    db.commit()
    return CustomerPushSubscriptionResponse(status="active")


@router.delete(
    "/public/sessions/{session_token}/push-subscriptions",
    response_model=CustomerPushSubscriptionResponse,
)
def delete_customer_push_subscription(
    session_token: str,
    payload: CustomerPushSubscriptionRequest,
    db: Session = Depends(get_db),
):
    session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")
    db.query(CustomerPushSubscription).filter(
        CustomerPushSubscription.dining_session_id == session.id,
        CustomerPushSubscription.endpoint == str(payload.endpoint),
    ).update({"status": "expired"}, synchronize_session=False)
    db.commit()
    return CustomerPushSubscriptionResponse(status="expired")
