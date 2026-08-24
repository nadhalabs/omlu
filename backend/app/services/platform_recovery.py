import datetime
import json
from typing import Dict, Any, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.dining_session import DiningSession, ACTIVE_DINING_SESSION_STATUSES
from app.models.bill import Bill
from app.models.order import Order
from app.models.platform_user import PlatformAuditLog
from app.services.dining_sessions import find_current_open_session_for_table
from app.services.bills import complete_paid_dining_session
from app.services.realtime import (
    publish_event,
    EVENT_SESSION_CLOSED,
    EVENT_TABLE_UPDATED,
    restaurant_channel,
    session_channel,
    table_channel,
)


def finalize_paid_session(
    db: Session,
    session_id: int,
    operator_id: int,
    operator_role: str,
    reason: str,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Canonical paid session completion service.
    Used by both payment confirmation and platform recovery workflows.
    Validates paid bill, locks rows, transitions session to 'closed',
    invalidates participant authority, emits realtime events, and logs an append-only audit entry.
    """
    if not reason or len(reason.strip()) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A mandatory operator reason of at least 10 characters is required.",
        )

    # 1. Lock dining session
    session = (
        db.query(DiningSession)
        .filter(DiningSession.id == session_id)
        .with_for_update()
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dining session not found.",
        )

    # Idempotent check
    if session.status == "closed":
        return {
            "session_id": session.id,
            "status": "closed",
            "message": "Session is already closed.",
            "table_available": find_current_open_session_for_table(db, session.table_id) is None,
        }

    # 2. Lock and validate Bill
    bill = (
        db.query(Bill)
        .filter(Bill.dining_session_id == session.id)
        .with_for_update()
        .first()
    )
    if not bill or bill.status != "paid":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot finalize session: no paid bill exists for this session.",
        )

    old_status = session.status
    now = datetime.datetime.now(datetime.timezone.utc)

    # 3-5. Use the same transactional paid-session completion as checkout.
    completion = complete_paid_dining_session(
        db,
        session=session,
        bill=bill,
        reason=f"Paid session finalized: {reason.strip()}",
        now=now,
    )
    invalidated_count = completion.invalidated_participants

    # 6. Bounded allowlisted transactional audit log (No PII, zero tokens/PINs/bill amounts)
    audit_entry = PlatformAuditLog(
        actor_user_id=operator_id,
        actor_role=operator_role,
        target_type="dining_session",
        target_id=str(session.id),
        action="finalize_paid_session",
        restaurant_id=session.restaurant_id,
        previous_value=json.dumps({"status": old_status}),
        new_value=json.dumps({
            "reason": reason.strip()[:300],
            "previous_status": old_status,
            "new_status": "closed",
            "pending_orders_rejected_count": 0,
            "participants_revoked_count": invalidated_count,
            "request_id": request_id,
            "outcome": "success",
        }),
        request_id=request_id,
    )
    db.add(audit_entry)

    # Single DB transaction commit FIRST before public availability lookup
    db.commit()

    # 7. Verification via public table availability check
    open_session = find_current_open_session_for_table(db, session.table_id)

    # 8. Realtime events
    publish_event(
        EVENT_SESSION_CLOSED,
        restaurant_id=session.restaurant_id,
        channels=[
            restaurant_channel(session.restaurant_id, "operations"),
            restaurant_channel(session.restaurant_id, "staff"),
            session_channel(session.public_token),
            table_channel(session.restaurant_id, session.table_id),
        ],
        resource_id=session.id,
        state={"session_token": session.public_token, "status": "closed", "table_id": session.table_id},
    )
    publish_event(
        EVENT_TABLE_UPDATED,
        restaurant_id=session.restaurant_id,
        channels=[
            restaurant_channel(session.restaurant_id, "staff"),
            table_channel(session.restaurant_id, session.table_id),
        ],
        resource_id=session.table_id,
        state={"table_id": session.table_id},
    )

    return {
        "session_id": session.id,
        "status": "closed",
        "participants_revoked": invalidated_count,
        "table_available": open_session is None,
    }


def recover_abandoned_empty_session(
    db: Session,
    session_id: int,
    operator_id: int,
    operator_role: str,
    reason: str,
    request_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Abandoned empty session recovery service.
    Rejects recovery if ANY order is accepted, preparing, ready, served, billed, or completed.
    Cancels empty/abandoned session, rejects unaccepted pending orders, invalidates participant authority,
    writes bounded audit log, and emits realtime events.
    """
    if not reason or len(reason.strip()) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A mandatory operator reason of at least 10 characters is required.",
        )

    # 1. Lock dining session
    session = (
        db.query(DiningSession)
        .filter(DiningSession.id == session_id)
        .with_for_update()
        .first()
    )
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dining session not found.",
        )

    # Idempotent check
    if session.status == "cancelled":
        return {
            "session_id": session.id,
            "status": "cancelled",
            "message": "Session is already cancelled.",
            "table_available": find_current_open_session_for_table(db, session.table_id) is None,
        }

    # Lock bill
    bill = (
        db.query(Bill)
        .filter(Bill.dining_session_id == session.id)
        .with_for_update()
        .first()
    )
    if bill and bill.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot cancel session: paid bill exists. Use paid session finalization instead.",
        )

    # Lock orders and check operational activity
    orders = (
        db.query(Order)
        .filter(Order.dining_session_id == session.id)
        .with_for_update()
        .all()
    )
    # Strictly reject if ANY order is accepted, preparing, ready, served, billed, or completed
    blocking_orders = [o for o in orders if o.status not in {"pending", "rejected", "cancelled"}]
    if blocking_orders:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot recover session: contains {len(blocking_orders)} active/accepted order(s) in kitchen.",
        )

    old_status = session.status
    now = datetime.datetime.now(datetime.timezone.utc)

    # Reject unaccepted draft/pending orders
    pending_rejected_count = 0
    for order in orders:
        if order.status == "pending":
            order.status = "rejected"
            pending_rejected_count += 1

    # Transition session state
    session.status = "cancelled"
    session.closed_at = now

    # Invalidate participant authority
    invalidated_count = invalidate_session_participants(
        db, session, f"Abandoned empty session cancelled: {reason.strip()}"
    )

    # Bounded allowlisted transactional audit log (No PII, zero tokens/PINs/bill amounts)
    audit_entry = PlatformAuditLog(
        actor_user_id=operator_id,
        actor_role=operator_role,
        target_type="dining_session",
        target_id=str(session.id),
        action="recover_abandoned_empty_session",
        restaurant_id=session.restaurant_id,
        previous_value=json.dumps({"status": old_status}),
        new_value=json.dumps({
            "reason": reason.strip()[:300],
            "previous_status": old_status,
            "new_status": "cancelled",
            "pending_orders_rejected_count": pending_rejected_count,
            "participants_revoked_count": invalidated_count,
            "request_id": request_id,
            "outcome": "success",
        }),
        request_id=request_id,
    )
    db.add(audit_entry)

    # Single DB transaction commit FIRST before public availability lookup
    db.commit()

    open_session = find_current_open_session_for_table(db, session.table_id)

    # Realtime events
    publish_event(
        EVENT_SESSION_CLOSED,
        restaurant_id=session.restaurant_id,
        channels=[
            restaurant_channel(session.restaurant_id, "operations"),
            restaurant_channel(session.restaurant_id, "staff"),
            session_channel(session.public_token),
            table_channel(session.restaurant_id, session.table_id),
        ],
        resource_id=session.id,
        state={"session_token": session.public_token, "status": "cancelled", "table_id": session.table_id},
    )
    publish_event(
        EVENT_TABLE_UPDATED,
        restaurant_id=session.restaurant_id,
        channels=[
            restaurant_channel(session.restaurant_id, "staff"),
            table_channel(session.restaurant_id, session.table_id),
        ],
        resource_id=session.table_id,
        state={"table_id": session.table_id},
    )

    return {
        "session_id": session.id,
        "status": "cancelled",
        "participants_revoked": invalidated_count,
        "table_available": open_session is None,
    }


def detect_duplicate_active_sessions(db: Session) -> List[Dict[str, Any]]:
    """
    Diagnostic-only engine. Detects tables containing duplicate active dining sessions.
    Surfaces duplicate tables for operator inspection with zero DB mutation or side effects.
    """
    from app.models.restaurant import Restaurant
    from app.models.restaurant_table import RestaurantTable

    results = (
        db.query(
            DiningSession.table_id,
            DiningSession.restaurant_id,
            func.count(DiningSession.id).label("active_count"),
        )
        .filter(DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES))
        .group_by(DiningSession.table_id, DiningSession.restaurant_id)
        .having(func.count(DiningSession.id) > 1)
        .all()
    )

    violations = []
    for row in results:
        t_id, r_id, count = row.table_id, row.restaurant_id, row.active_count
        restaurant = db.query(Restaurant).filter(Restaurant.id == r_id).first()
        table = db.query(RestaurantTable).filter(RestaurantTable.id == t_id).first()

        active_sessions = (
            db.query(DiningSession)
            .filter(
                DiningSession.table_id == t_id,
                DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
            )
            .order_by(DiningSession.opened_at.desc())
            .all()
        )

        violations.append({
            "table_id": t_id,
            "table_number": table.table_number if table else str(t_id),
            "restaurant_id": r_id,
            "restaurant_name": restaurant.name if restaurant else "Unknown",
            "active_sessions_count": count,
            "session_ids": [s.id for s in active_sessions],
            "severity": "Critical",
            "message": f"Table {table.table_number if table else t_id} has {count} duplicate active sessions.",
        })

    return violations
