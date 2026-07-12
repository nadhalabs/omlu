import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload, joinedload

from app.models.bill import Bill, RestaurantBillDailySequence
from app.models.dining_session import DiningSession
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser


COUNTER_PAYMENT_METHODS = {"counter_cash", "counter_upi"}


def get_billable_orders(db: Session, dining_session_id: int) -> list[Order]:
    return (
        db.query(Order)
        .options(selectinload(Order.items))
        .filter(
            Order.dining_session_id == dining_session_id,
            Order.status != "rejected",
        )
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )


def calculate_bill_subtotal(db: Session, dining_session_id: int) -> Decimal:
    orders = get_billable_orders(db, dining_session_id)
    return sum((order.subtotal for order in orders), Decimal("0.00"))


def generate_bill_number(db: Session, restaurant_id: int) -> str:
    today = datetime.date.today()
    stmt = pg_insert(RestaurantBillDailySequence).values(
        restaurant_id=restaurant_id,
        sequence_date=today,
        last_value=1,
    ).on_conflict_do_update(
        constraint="uq_restaurant_bill_daily_sequence_date",
        set_={"last_value": RestaurantBillDailySequence.last_value + 1},
    ).returning(RestaurantBillDailySequence.last_value)

    seq_val = db.execute(stmt).scalar()
    return f"BILL-{today.strftime('%Y%m%d')}-{seq_val:04d}"


def apply_draft_totals(db: Session, bill: Bill) -> Bill:
    subtotal = calculate_bill_subtotal(db, bill.dining_session_id)
    bill.subtotal = subtotal
    bill.tax_amount = Decimal("0.00")
    bill.discount_amount = Decimal("0.00")
    bill.total_amount = subtotal
    return bill


def create_or_refresh_bill_for_session(
    db: Session,
    dining_session: DiningSession,
) -> Bill:
    if dining_session.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot generate a bill for a cancelled dining session.",
        )

    valid_orders = get_billable_orders(db, dining_session.id)
    if not valid_orders:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot generate a bill before the session has valid orders.",
        )

    locked_session = (
        db.query(DiningSession)
        .filter(DiningSession.id == dining_session.id)
        .with_for_update()
        .first()
    )
    if not locked_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

    bill = (
        db.query(Bill)
        .filter(Bill.dining_session_id == locked_session.id)
        .with_for_update()
        .first()
    )

    if bill:
        if bill.status == "draft":
            apply_draft_totals(db, bill)
            db.flush()
        return bill

    bill = Bill(
        restaurant_id=locked_session.restaurant_id,
        dining_session_id=locked_session.id,
        bill_number=generate_bill_number(db, locked_session.restaurant_id),
        status="draft",
        currency=getattr(locked_session.restaurant, "currency", None) or "INR",
    )
    db.add(bill)
    db.flush()
    apply_draft_totals(db, bill)
    db.flush()
    return bill


def issue_bill(db: Session, bill: Bill) -> Bill:
    locked_bill = (
        db.query(Bill)
        .filter(Bill.id == bill.id)
        .with_for_update()
        .first()
    )
    if not locked_bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if locked_bill.status == "paid":
        return locked_bill

    if locked_bill.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled bill cannot be issued.",
        )

    locked_session = (
        db.query(DiningSession)
        .filter(DiningSession.id == locked_bill.dining_session_id)
        .with_for_update()
        .first()
    )
    if not locked_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

    apply_draft_totals(db, locked_bill)
    locked_bill.status = "issued"
    locked_session.status = "payment_requested"
    locked_session.payment_requested_at = datetime.datetime.now(datetime.timezone.utc)
    db.flush()
    return locked_bill


def request_pay_at_counter(
    db: Session,
    dining_session: DiningSession,
    method: str,
) -> Bill:
    if method not in COUNTER_PAYMENT_METHODS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid counter payment method.",
        )

    locked_session = (
        db.query(DiningSession)
        .filter(DiningSession.id == dining_session.id)
        .with_for_update()
        .first()
    )
    if not locked_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

    bill = (
        db.query(Bill)
        .filter(Bill.dining_session_id == locked_session.id)
        .with_for_update()
        .first()
    )
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if bill.status == "payment_pending" and locked_session.status == "payment_pending":
        return bill

    if bill.status != "issued":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill must be issued before requesting counter payment.",
        )

    if locked_session.status != "payment_requested":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session must be waiting for payment before requesting counter payment.",
        )

    bill.status = "payment_pending"
    bill.payment_method = method
    locked_session.status = "payment_pending"
    db.flush()
    return bill


def confirm_counter_payment(
    db: Session,
    bill: Bill,
    staff_user: StaffUser,
    method: str,
) -> Bill:
    if method not in COUNTER_PAYMENT_METHODS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid counter payment method.",
        )

    locked_bill = (
        db.query(Bill)
        .filter(Bill.id == bill.id)
        .with_for_update()
        .first()
    )
    if not locked_bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if locked_bill.status == "paid":
        return locked_bill

    if locked_bill.status not in {"issued", "payment_pending"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill must be issued or payment pending before confirming counter payment.",
        )

    locked_session = (
        db.query(DiningSession)
        .filter(DiningSession.id == locked_bill.dining_session_id)
        .with_for_update()
        .first()
    )
    if not locked_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

    now = datetime.datetime.now(datetime.timezone.utc)
    locked_bill.status = "paid"
    locked_bill.paid_at = now
    locked_bill.payment_method = method
    locked_bill.paid_by_staff_id = staff_user.id
    locked_session.status = "closed"
    locked_session.paid_at = now
    locked_session.closed_at = now
    db.flush()
    return locked_bill


def load_bill_for_response(db: Session, bill_id: int) -> Bill:
    return (
        db.query(Bill)
        .options(
            joinedload(Bill.restaurant),
            joinedload(Bill.dining_session).joinedload(DiningSession.table),
            joinedload(Bill.dining_session).joinedload(DiningSession.restaurant),
        )
        .filter(Bill.id == bill_id)
        .one()
    )


def build_bill_response(db: Session, bill: Bill):
    bill = load_bill_for_response(db, bill.id)
    orders = get_billable_orders(db, bill.dining_session_id)
    return {
        "bill_number": bill.bill_number,
        "restaurant_name": bill.restaurant.name,
        "table_number": bill.dining_session.table.table_number,
        "session_token": bill.dining_session.public_token,
        "status": bill.status,
        "orders": [
            {
                "order_number": order.order_number,
                "status": order.status,
                "subtotal": order.subtotal,
                "items": [
                    {
                        "item_name": item.item_name,
                        "quantity": item.quantity,
                        "unit_price": item.unit_price,
                        "line_total": item.total_price,
                    }
                    for item in order.items
                ],
            }
            for order in orders
        ],
        "subtotal": bill.subtotal,
        "tax_amount": bill.tax_amount,
        "discount_amount": bill.discount_amount,
        "total_amount": bill.total_amount,
        "currency": bill.currency,
        "generated_at": bill.generated_at,
        "paid_at": bill.paid_at,
        "payment_method": bill.payment_method,
        "payment_reference": bill.payment_reference,
        "paid_by_staff_id": bill.paid_by_staff_id,
    }
