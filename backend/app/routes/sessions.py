import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.order import Order, OrderItem
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.schemas.sessions import StaffSessionListItem, StaffSessionDetail
from app.services.realtime import EVENT_SESSION_CLOSED, EVENT_TABLE_UPDATED, publish_event, restaurant_channel, session_channel, table_channel
from app.utils.auth import RoleChecker, get_current_staff_user

router = APIRouter()

# View: all authenticated staff may list active sessions
_view_roles = RoleChecker(["owner", "admin", "staff"])
# Manual closure is a management action. Payment closes its session atomically.
_close_roles = RoleChecker(["owner", "admin"])

# Statuses that block closing an empty session
_BLOCKING_ORDER_STATUSES = {"accepted", "preparing", "ready", "served"}


def _load_sessions(db: Session, restaurant_id: int) -> List[DiningSession]:
    return (
        db.query(DiningSession)
        .options(
            joinedload(DiningSession.table),
            selectinload(DiningSession.orders).selectinload(Order.items).selectinload(OrderItem.selected_options),
            joinedload(DiningSession.bill),
        )
        .filter(
            DiningSession.restaurant_id == restaurant_id,
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        )
        .all()
    )


def _session_last_activity(session: DiningSession) -> datetime.datetime:
    """Return the most recent of: opened_at, payment_requested_at, or latest order created_at."""
    ts = session.opened_at
    if session.payment_requested_at and session.payment_requested_at > ts:
        ts = session.payment_requested_at
    for order in session.orders:
        if order.created_at > ts:
            ts = order.created_at
    return ts


def _latest_order_status(session: DiningSession) -> str | None:
    if not session.orders:
        return None
    latest = max(session.orders, key=lambda o: o.created_at)
    return latest.status


def _build_list_item(session: DiningSession) -> StaffSessionListItem:
    order_count = len(session.orders)
    subtotal = sum(o.subtotal for o in session.orders)
    return StaffSessionListItem(
        session_token=session.public_token,
        table_number=session.table.table_number,
        status=session.status,
        opened_at=session.opened_at,
        last_activity_at=_session_last_activity(session),
        order_count=order_count,
        combined_subtotal=subtotal,
        latest_order_status=_latest_order_status(session),
        bill_id=session.bill.id if session.bill else None,
        bill_number=session.bill.bill_number if session.bill else None,
    )


@router.get(
    "/staff/sessions",
    response_model=List[StaffSessionListItem],
)
def list_staff_sessions(
    current_user: StaffUser = Depends(_view_roles),
    db: Session = Depends(get_db),
):
    sessions = _load_sessions(db, current_user.restaurant_id)
    items = [_build_list_item(s) for s in sessions]
    # Sort by last activity descending
    items.sort(key=lambda x: x.last_activity_at, reverse=True)
    return items


@router.post(
    "/staff/sessions/{session_token}/close-empty",
    response_model=StaffSessionDetail,
)
def close_empty_session(
    session_token: str,
    current_user: StaffUser = Depends(_close_roles),
    db: Session = Depends(get_db),
):
    # Tenant-scoped lookup with row lock
    session = (
        db.query(DiningSession)
        .filter(
            DiningSession.public_token == session_token,
            DiningSession.restaurant_id == current_user.restaurant_id,
        )
        .with_for_update()
        .first()
    )

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Idempotency: already cancelled is fine
    if session.status == "cancelled":
        return _build_session_detail(db, session)

    # Only active sessions can be closed
    if session.status not in ACTIVE_DINING_SESSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session is not active (status: {session.status})",
        )

    # Lock any bill after the session lock. A bill means the session is no longer empty.
    bill = db.query(Bill).filter(Bill.dining_session_id == session.id).with_for_update().first()
    if bill:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot close a session with a {bill.status} bill.",
        )

    # Load orders with lock
    orders = (
        db.query(Order)
        .filter(Order.dining_session_id == session.id)
        .with_for_update()
        .all()
    )

    # Block if any order is in a blocking status
    blocking = [o for o in orders if o.status in _BLOCKING_ORDER_STATUSES]
    if blocking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot close: session has {len(blocking)} order(s) in "
                f"active kitchen state ({', '.join(o.status for o in blocking)})."
            ),
        )

    # Cancel any pending orders
    now = datetime.datetime.now(datetime.timezone.utc)
    for order in orders:
        if order.status == "pending":
            order.status = "rejected"

    # Cancel the session
    session.status = "cancelled"
    session.closed_at = now
    session.closed_by_staff_id = current_user.id
    session_id = session.id
    table_id = session.table_id
    token = session.public_token
    db.commit()
    publish_event(
        EVENT_SESSION_CLOSED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), session_channel(token), table_channel(current_user.restaurant_id, table_id)],
        resource_id=session_id,
        state={"session_token": token, "status": "cancelled", "table_id": table_id},
    )
    publish_event(
        EVENT_TABLE_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "staff"), table_channel(current_user.restaurant_id, table_id)],
        resource_id=table_id,
        state={"table_id": table_id},
    )

    # Reload for response
    session = (
        db.query(DiningSession)
        .options(
            joinedload(DiningSession.table),
            selectinload(DiningSession.orders),
        )
        .filter(DiningSession.id == session.id)
        .first()
    )
    return _build_session_detail(db, session)


def _build_session_detail(db: Session, session: DiningSession) -> "StaffSessionDetail":
    order_count = len(session.orders)
    subtotal = sum(o.subtotal for o in session.orders)
    return StaffSessionDetail(
        session_token=session.public_token,
        table_number=session.table.table_number,
        status=session.status,
        opened_at=session.opened_at,
        last_activity_at=_session_last_activity(session),
        closed_at=session.closed_at,
        order_count=order_count,
        combined_subtotal=subtotal,
        latest_order_status=_latest_order_status(session),
    )
