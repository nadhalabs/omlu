import datetime
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload, joinedload

from app.models.bill import Bill, RestaurantBillDailySequence, RestaurantInvoiceSequence
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem
from app.models.restaurant import Restaurant
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffUser


COUNTER_PAYMENT_METHODS = {"counter_cash", "counter_upi"}
ACTIVE_BILL_SESSION_STATUSES = {"open", "payment_requested", "payment_pending"}
MONEY_QUANTUM = Decimal("0.01")


def round_money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class BillTaxTotals:
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    gst_rate: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal


def calculate_gst_totals(
    *,
    subtotal: Decimal,
    discount_amount: Decimal,
    gst_rate: Decimal,
    tax_mode: str,
) -> BillTaxTotals:
    subtotal = round_money(subtotal)
    discount = round_money(max(Decimal("0.00"), min(discount_amount, subtotal)))
    rate = Decimal(gst_rate)
    discounted = round_money(subtotal - discount)
    if tax_mode == "inclusive":
        taxable = round_money(
            discounted if rate == 0 else discounted * Decimal("100") / (Decimal("100") + rate)
        )
        tax_total = round_money(discounted - taxable)
        cgst = round_money(tax_total / Decimal("2"))
        sgst = round_money(tax_total - cgst)
        total = discounted
    elif tax_mode == "exclusive":
        taxable = discounted
        half_rate = rate / Decimal("2")
        cgst = round_money(taxable * half_rate / Decimal("100"))
        sgst = round_money(taxable * half_rate / Decimal("100"))
        tax_total = round_money(cgst + sgst)
        total = round_money(taxable + tax_total)
    else:
        raise ValueError("tax_mode must be inclusive or exclusive")
    return BillTaxTotals(
        subtotal=subtotal,
        discount_amount=discount,
        taxable_amount=taxable,
        gst_rate=rate.quantize(MONEY_QUANTUM),
        cgst_amount=cgst,
        sgst_amount=sgst,
        igst_amount=Decimal("0.00"),
        tax_amount=tax_total,
        total_amount=total,
    )


def indian_financial_year(local_date: datetime.date) -> str:
    start_year = local_date.year if local_date.month >= 4 else local_date.year - 1
    return f"{start_year:04d}-{(start_year + 1) % 100:02d}"


def _restaurant_now(restaurant: Restaurant, now: datetime.datetime | None = None) -> datetime.datetime:
    current = now or datetime.datetime.now(datetime.timezone.utc)
    try:
        timezone = ZoneInfo(restaurant.timezone or "Asia/Kolkata")
    except ZoneInfoNotFoundError:
        timezone = ZoneInfo("Asia/Kolkata")
    return current.astimezone(timezone)


def _lock_session(db: Session, session_id: int) -> DiningSession:
    locked_session = (
        db.query(DiningSession)
        .filter(DiningSession.id == session_id)
        .with_for_update()
        .first()
    )
    if not locked_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")
    return locked_session


def _lock_bill_for_session(db: Session, session_id: int) -> Bill | None:
    return (
        db.query(Bill)
        .filter(Bill.dining_session_id == session_id)
        .with_for_update()
        .first()
    )


def _lock_bill_after_session(db: Session, bill_id: int, session_id: int) -> Bill:
    locked_bill = (
        db.query(Bill)
        .filter(Bill.id == bill_id, Bill.dining_session_id == session_id)
        .with_for_update()
        .first()
    )
    if not locked_bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return locked_bill


def get_billable_orders(db: Session, dining_session_id: int) -> list[Order]:
    return (
        db.query(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.selected_options))
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


def generate_invoice_number(
    db: Session,
    restaurant: Restaurant,
    *,
    now: datetime.datetime | None = None,
) -> tuple[str, datetime.datetime]:
    local_now = _restaurant_now(restaurant, now)
    financial_year = indian_financial_year(local_now.date())
    stmt = pg_insert(RestaurantInvoiceSequence).values(
        restaurant_id=restaurant.id,
        financial_year=financial_year,
        last_value=1,
    ).on_conflict_do_update(
        constraint="uq_restaurant_invoice_sequence_fy",
        set_={"last_value": RestaurantInvoiceSequence.last_value + 1},
    ).returning(RestaurantInvoiceSequence.last_value)
    sequence = db.execute(stmt).scalar_one()
    return f"{restaurant.invoice_prefix}/{financial_year}/{sequence:06d}", local_now.astimezone(datetime.timezone.utc)


def apply_draft_totals(
    db: Session,
    bill: Bill,
    *,
    initialize_snapshot: bool = False,
    now: datetime.datetime | None = None,
) -> Bill:
    # GST snapshots are immutable after the bill is first generated.
    if bill.gst_enabled_snapshot and not initialize_snapshot:
        return bill

    subtotal = round_money(calculate_bill_subtotal(db, bill.dining_session_id))
    restaurant = bill.dining_session.restaurant
    if initialize_snapshot and restaurant.gst_enabled:
        totals = calculate_gst_totals(
            subtotal=subtotal,
            discount_amount=bill.discount_amount or Decimal("0.00"),
            gst_rate=restaurant.default_gst_rate,
            tax_mode=restaurant.tax_mode,
        )
        bill.gst_enabled_snapshot = True
        bill.subtotal = totals.subtotal
        bill.discount_amount = totals.discount_amount
        bill.taxable_amount = totals.taxable_amount
        bill.gst_rate = totals.gst_rate
        bill.cgst_amount = totals.cgst_amount
        bill.sgst_amount = totals.sgst_amount
        bill.igst_amount = totals.igst_amount
        bill.tax_amount = totals.tax_amount
        bill.total_amount = totals.total_amount
        bill.tax_mode_snapshot = restaurant.tax_mode
        bill.gstin_snapshot = restaurant.gstin
        bill.legal_business_name_snapshot = restaurant.legal_business_name
        bill.billing_address_snapshot = restaurant.registered_billing_address
        bill.state_name_snapshot = restaurant.gst_state_name
        bill.state_code_snapshot = restaurant.gst_state_code
        bill.invoice_number, bill.invoice_date = generate_invoice_number(db, restaurant, now=now)
        return bill

    # This is the pre-GST calculation and remains unchanged for disabled restaurants.
    bill.subtotal = subtotal
    bill.tax_amount = Decimal("0.00")
    bill.discount_amount = Decimal("0.00")
    bill.total_amount = subtotal
    if initialize_snapshot:
        bill.gst_enabled_snapshot = False
        bill.taxable_amount = subtotal
        bill.gst_rate = Decimal("0.00")
        bill.cgst_amount = Decimal("0.00")
        bill.sgst_amount = Decimal("0.00")
        bill.igst_amount = Decimal("0.00")
    return bill


def create_or_refresh_bill_for_session(
    db: Session,
    dining_session: DiningSession,
    generated_by_staff_id: int | None = None,
) -> Bill:
    locked_session = _lock_session(db, dining_session.id)

    bill = _lock_bill_for_session(db, locked_session.id)
    if bill:
        if bill.status == "draft":
            apply_draft_totals(db, bill)
            db.flush()
        return bill

    if locked_session.status in {"cancelled", "closed"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot generate a bill for a {locked_session.status} dining session.",
        )
    if locked_session.status not in ACTIVE_BILL_SESSION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot generate a bill while session status is {locked_session.status}.",
        )

    valid_orders = get_billable_orders(db, locked_session.id)
    if not valid_orders:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot generate a bill before the session has valid orders.",
        )

    bill = Bill(
        restaurant_id=locked_session.restaurant_id,
        dining_session_id=locked_session.id,
        bill_number=generate_bill_number(db, locked_session.restaurant_id),
        status="draft",
        currency=getattr(locked_session.restaurant, "currency", None) or "INR",
        generated_by_staff_id=generated_by_staff_id,
    )
    db.add(bill)
    db.flush()
    apply_draft_totals(db, bill, initialize_snapshot=True)
    db.flush()
    return bill


def issue_bill(db: Session, bill: Bill) -> Bill:
    locked_session = _lock_session(db, bill.dining_session_id)
    locked_bill = _lock_bill_after_session(db, bill.id, locked_session.id)

    if locked_bill.status == "paid":
        return locked_bill

    if locked_bill.status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cancelled bill cannot be issued.",
        )

    if locked_session.status not in {"open", "payment_requested"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot issue bill while session status is {locked_session.status}.",
        )

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

    locked_session = _lock_session(db, dining_session.id)
    bill = _lock_bill_for_session(db, locked_session.id)
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


def send_bill_to_counter(db: Session, bill: Bill) -> Bill:
    """Persist the staff-to-counter handoff without selecting a payment method."""
    locked_session = _lock_session(db, bill.dining_session_id)
    locked_bill = _lock_bill_after_session(db, bill.id, locked_session.id)

    if locked_bill.status == "payment_pending" and locked_session.status == "payment_pending":
        return locked_bill
    if locked_bill.status != "issued":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill must be issued before it can be sent to the counter.",
        )
    if locked_session.status != "payment_requested":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session must be waiting for payment before it can be sent to the counter.",
        )

    locked_bill.status = "payment_pending"
    locked_bill.payment_method = None
    locked_session.status = "payment_pending"
    db.flush()
    return locked_bill


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

    locked_session = _lock_session(db, bill.dining_session_id)
    locked_bill = _lock_bill_after_session(db, bill.id, locked_session.id)

    if (
        locked_bill.restaurant_id != staff_user.restaurant_id
        or locked_session.restaurant_id != staff_user.restaurant_id
        or locked_bill.dining_session_id != locked_session.id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if locked_bill.status == "paid":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill has already been paid.",
        )

    if (
        staff_user.role in {"owner", "admin"}
        and locked_bill.status == "issued"
        and locked_session.status == "payment_requested"
    ):
        locked_bill.status = "payment_pending"
        locked_bill.payment_method = None
        locked_session.status = "payment_pending"

    if locked_bill.status != "payment_pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill must be sent to the counter before confirming payment.",
        )

    if locked_session.status != "payment_pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm payment while session status is {locked_session.status}.",
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    locked_bill.status = "paid"
    locked_bill.paid_at = now
    locked_bill.payment_method = method
    locked_bill.paid_by_staff_id = staff_user.id
    locked_session.status = "closed"
    locked_session.paid_at = now
    locked_session.closed_at = now
    locked_session.closed_by_staff_id = staff_user.id
    pending_bill_requests = db.query(ServiceRequest).filter(
        ServiceRequest.restaurant_id == staff_user.restaurant_id,
        ServiceRequest.dining_session_id == locked_session.id,
        ServiceRequest.request_type == "bill",
        ServiceRequest.status == "pending",
    ).with_for_update().all()
    for service_request in pending_bill_requests:
        service_request.status = "resolved"
        service_request.resolved_at = now
        service_request.resolved_by_staff_id = staff_user.id
    db.flush()
    return locked_bill


def load_bill_for_response(db: Session, bill_id: int) -> Bill:
    return (
        db.query(Bill)
        .options(
            joinedload(Bill.generated_by_staff),
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
    sent_to_counter_audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.restaurant_id == bill.restaurant_id,
            AuditLog.target_type == "bill",
            AuditLog.target_id == str(bill.id),
            AuditLog.action == "bill.sent_to_counter",
        )
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .first()
    )
    return {
        "bill_number": bill.bill_number,
        "restaurant_name": bill.restaurant.name,
        "restaurant_slug": bill.restaurant.slug,
        "table_number": bill.dining_session.table.table_number,
        "table_code": bill.dining_session.table.table_code,
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
                        "selected_options": item.selected_options,
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
        "generated_by_role": bill.generated_by_staff.role if bill.generated_by_staff else None,
        "sent_to_counter_by_role": sent_to_counter_audit.actor_role if sent_to_counter_audit else None,
        "gst_enabled": bill.gst_enabled_snapshot,
        "invoice_number": bill.invoice_number,
        "invoice_date": bill.invoice_date,
        "taxable_amount": bill.taxable_amount,
        "gst_rate": bill.gst_rate,
        "cgst_amount": bill.cgst_amount,
        "sgst_amount": bill.sgst_amount,
        "igst_amount": bill.igst_amount,
        "tax_mode": bill.tax_mode_snapshot,
        "gstin": bill.gstin_snapshot,
        "legal_business_name": bill.legal_business_name_snapshot,
        "registered_billing_address": bill.billing_address_snapshot,
        "state_name": bill.state_name_snapshot,
        "state_code": bill.state_code_snapshot,
    }
