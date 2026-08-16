import json

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.order import Order, OrderItem
from app.models.print_bridge import KitchenPrintJob


def enqueue_cancellation_kot(db: Session, order: Order, item: OrderItem) -> KitchenPrintJob | None:
    if order.kitchen_mode_snapshot != "direct_print":
        return None
    key = f"order_item:{item.id}:cancel_kot"
    existing = db.query(KitchenPrintJob).filter(
        KitchenPrintJob.restaurant_id == order.restaurant_id,
        KitchenPrintJob.idempotency_key == key,
    ).first()
    if existing:
        return existing
    job = KitchenPrintJob(
        restaurant_id=order.restaurant_id,
        order_id=order.id,
        order_item_id=item.id,
        document_type="cancellation_kot",
        idempotency_key=key,
        payload=json.dumps({
            "document_type": "cancellation_kot",
            "heading": "CANCELLED ITEM",
            "order_id": order.id,
            "order_number": order.order_number,
            "item_id": item.id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "reason": item.cancellation_reason,
        }),
    )
    db.add(job)
    return job
