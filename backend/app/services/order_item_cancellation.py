import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.services.bills import apply_draft_totals


ELIGIBLE_ORDER_STATUSES = {"pending", "accepted"}


def cancel_order_item(
    db: Session,
    *,
    restaurant_id: int,
    session_id: int,
    order_public_token: str,
    order_item_id: int,
    actor_type: str,
    reason: str,
    staff_id: int | None = None,
    participant_id: int | None = None,
    require_order_participant: bool = False,
) -> tuple[Order, OrderItem, DiningSession, Bill | None]:
    session = db.query(DiningSession).filter(
        DiningSession.id == session_id,
        DiningSession.restaurant_id == restaurant_id,
    ).with_for_update().first()
    if not session:
        raise HTTPException(status_code=404, detail="Dining session not found")
    if session.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This dining session is no longer mutable.")

    bill = db.query(Bill).filter(
        Bill.restaurant_id == restaurant_id,
        Bill.dining_session_id == session.id,
    ).with_for_update().first()
    if bill and bill.status != "draft":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An issued bill is immutable; items can no longer be cancelled.")

    order_query = db.query(Order).filter(
        Order.restaurant_id == restaurant_id,
        Order.dining_session_id == session.id,
        Order.public_token == order_public_token,
    )
    if require_order_participant:
        order_query = order_query.filter(Order.created_by_participant_id == participant_id)
    order = order_query.with_for_update().first()
    if not order:
        raise HTTPException(status_code=404, detail="Order item not found")
    if order.status not in ELIGIBLE_ORDER_STATUSES:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Items cannot be cancelled while the order is {order.status}.")

    item = db.query(OrderItem).filter(
        OrderItem.id == order_item_id,
        OrderItem.order_id == order.id,
    ).with_for_update().first()
    if not item:
        raise HTTPException(status_code=404, detail="Order item not found")
    if item.cancellation_status == "cancelled":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This order item is already cancelled.")

    now = datetime.datetime.now(datetime.timezone.utc)
    item.cancellation_status = "cancelled"
    item.cancellation_reason = reason
    item.cancelled_at = now
    item.cancellation_actor_type = actor_type
    item.cancelled_by_staff_id = staff_id
    item.cancelled_by_participant_id = participant_id

    active_items = db.query(OrderItem).filter(
        OrderItem.order_id == order.id,
        OrderItem.cancellation_status == "active",
        OrderItem.id != item.id,
    ).with_for_update().all()
    order.subtotal = sum((active.total_price for active in active_items), Decimal("0.00"))
    if not active_items:
        old_status = order.status
        order.status = "rejected"
        order.cancellation_reason = "all_items_cancelled"
        db.add(OrderStatusHistory(
            order_id=order.id,
            old_status=old_status,
            new_status="rejected",
            changed_by_staff_id=staff_id,
        ))

    db.flush()
    if bill:
        apply_draft_totals(db, bill)
    db.flush()
    return order, item, session, bill
