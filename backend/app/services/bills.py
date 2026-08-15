import base64
import datetime
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import HTTPException, status
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import settings
from app.models.bill import (
    Bill,
    PaymentCodeLookupAttempt,
    RestaurantBillDailySequence,
    RestaurantInvoiceSequence,
)
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffUser
from app.models.payment import Payment, RevenueEntry
from app.services.idempotency import ensure_same_request
from app.services.table_participants import invalidate_session_participants
from app.utils.business_date import restaurant_business_date, restaurant_local_now


COUNTER_PAYMENT_METHODS = {"counter_cash", "counter_upi"}
ACTIVE_BILL_SESSION_STATUSES = {"open", "payment_requested", "payment_pending"}
MONEY_QUANTUM = Decimal("0.01")
PAYMENT_CODE_ALPHABET = "2346789ABCDEFGHJKLMNPQRTUVWXYZ"
PAYMENT_CODE_LENGTH = 6
PAYMENT_CODE_TTL = datetime.timedelta(days=30)
PAYMENT_CODE_COLLISION_RETRIES = 20
PAYMENT_CODE_LOOKUP_LIMIT = 10
PAYMENT_CODE_LOOKUP_WINDOW = datetime.timedelta(minutes=10)
PAYMENT_CODE_LOOKUP_RETENTION = datetime.timedelta(hours=24)


@dataclass(frozen=True)
class DetachedBillResult:
    bill: Bill
    payment_code: str


def _payment_code_secret() -> bytes:
    return (settings.participant_hmac_secret or settings.jwt_secret_key).encode()


def payment_code_digest(restaurant_id: int, code: str) -> str:
    normalized = code.strip().upper()
    material = f"payment-code:{restaurant_id}:{normalized}".encode()
    return hmac.new(_payment_code_secret(), material, hashlib.sha256).hexdigest()


def _encrypt_payment_code(code: str) -> str:
    key = hashlib.sha256(_payment_code_secret() + b":payment-code-encryption").digest()
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(key).encrypt(nonce, code.encode(), None)
    return base64.urlsafe_b64encode(nonce + encrypted).decode()


def decrypt_payment_code(ciphertext: str) -> str:
    raw = base64.urlsafe_b64decode(ciphertext.encode())
    key = hashlib.sha256(_payment_code_secret() + b":payment-code-encryption").digest()
    return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode()


def _new_payment_code() -> str:
    return "".join(secrets.choice(PAYMENT_CODE_ALPHABET) for _ in range(PAYMENT_CODE_LENGTH))


def find_unresolved_bill_by_payment_code(
    db: Session,
    *,
    restaurant_id: int,
    code: str,
    lock_for_update: bool = False,
) -> Bill | None:
    query = db.query(Bill).filter(
        Bill.restaurant_id == restaurant_id,
        Bill.payment_code_hash == payment_code_digest(restaurant_id, code),
        Bill.status.in_(("issued", "payment_pending")),
        Bill.payment_code_expires_at > datetime.datetime.now(datetime.timezone.utc),
    )
    if lock_for_update:
        query = query.with_for_update()
    return query.first()


def begin_payment_code_lookup_attempt(
    db: Session,
    *,
    restaurant_id: int,
    actor_user_id: int,
    client_identifier_hash: str,
) -> tuple[PaymentCodeLookupAttempt, int | None]:
    now = datetime.datetime.now(datetime.timezone.utc)
    db.query(PaymentCodeLookupAttempt).filter(
        PaymentCodeLookupAttempt.window_started_at < now - PAYMENT_CODE_LOOKUP_RETENTION
    ).delete(synchronize_session=False)
    insert = pg_insert(PaymentCodeLookupAttempt).values(
        restaurant_id=restaurant_id,
        actor_user_id=actor_user_id,
        client_identifier_hash=client_identifier_hash,
        window_started_at=now,
    ).on_conflict_do_nothing(constraint="uq_payment_code_lookup_actor_client")
    db.execute(insert)
    attempt = db.query(PaymentCodeLookupAttempt).filter(
        PaymentCodeLookupAttempt.restaurant_id == restaurant_id,
        PaymentCodeLookupAttempt.actor_user_id == actor_user_id,
        PaymentCodeLookupAttempt.client_identifier_hash == client_identifier_hash,
    ).with_for_update().one()
    if now - attempt.window_started_at >= PAYMENT_CODE_LOOKUP_WINDOW:
        attempt.window_started_at = now
        attempt.attempt_count = 0
        attempt.successful_count = 0
        attempt.failed_count = 0
        attempt.blocked_until = None
    if attempt.blocked_until and attempt.blocked_until > now:
        return attempt, max(1, int((attempt.blocked_until - now).total_seconds()))
    if attempt.attempt_count >= PAYMENT_CODE_LOOKUP_LIMIT:
        attempt.blocked_until = attempt.window_started_at + PAYMENT_CODE_LOOKUP_WINDOW
        return attempt, max(1, int((attempt.blocked_until - now).total_seconds()))
    attempt.attempt_count += 1
    return attempt, None


def finish_payment_code_lookup_attempt(
    attempt: PaymentCodeLookupAttempt,
    *,
    succeeded: bool,
) -> None:
    if succeeded:
        attempt.successful_count += 1
    else:
        attempt.failed_count += 1


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
    interstate: bool = False,
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
        total = discounted
    elif tax_mode == "exclusive":
        taxable = discounted
        tax_total = round_money(taxable * rate / Decimal("100"))
        total = round_money(taxable + tax_total)
    else:
        raise ValueError("tax_mode must be inclusive or exclusive")
    if interstate:
        cgst = Decimal("0.00")
        sgst = Decimal("0.00")
        igst = tax_total
    else:
        # Apply the configured GST rate once, then split that resulting tax.
        # Deriving the second component as the remainder preserves paise exactly.
        cgst = round_money(tax_total * Decimal("50") / Decimal("100"))
        sgst = round_money(tax_total - cgst)
        igst = Decimal("0.00")
    return BillTaxTotals(
        subtotal=subtotal,
        discount_amount=discount,
        taxable_amount=taxable,
        gst_rate=rate.quantize(MONEY_QUANTUM),
        cgst_amount=cgst,
        sgst_amount=sgst,
        igst_amount=igst,
        tax_amount=tax_total,
        total_amount=total,
    )


def indian_financial_year(local_date: datetime.date) -> str:
    start_year = local_date.year if local_date.month >= 4 else local_date.year - 1
    return f"{start_year:04d}-{(start_year + 1) % 100:02d}"


def _restaurant_now(restaurant: Restaurant, now: datetime.datetime | None = None) -> datetime.datetime:
    return restaurant_local_now(restaurant, now=now)


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
            Order.status.notin_(["rejected", "cancelled", "voided"]),
        )
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )


def calculate_bill_subtotal(db: Session, dining_session_id: int) -> Decimal:
    orders = get_billable_orders(db, dining_session_id)
    return sum((order.subtotal for order in orders), Decimal("0.00"))


def generate_bill_number(db: Session, restaurant: Restaurant) -> str:
    today = restaurant_business_date(restaurant)
    stmt = pg_insert(RestaurantBillDailySequence).values(
        restaurant_id=restaurant.id,
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
    # Issued, payment_pending, paid, and cancelled bills are immutable.
    if bill.status in {"issued", "payment_pending", "paid", "cancelled"}:
        return bill

    subtotal = round_money(calculate_bill_subtotal(db, bill.dining_session_id))
    restaurant = bill.dining_session.restaurant

    if initialize_snapshot or bill.gst_enabled_snapshot is None:
        bill.gst_enabled_snapshot = bool(restaurant.gst_enabled)

    is_gst = bill.gst_enabled_snapshot

    if is_gst:
        pos_code = bill.place_of_supply_code_snapshot or bill.customer_state_code_snapshot
        rest_state = restaurant.gst_state_code
        interstate = bool(pos_code and rest_state and pos_code.strip() != rest_state.strip())

        totals = calculate_gst_totals(
            subtotal=subtotal,
            discount_amount=bill.discount_amount or Decimal("0.00"),
            gst_rate=bill.gst_rate or restaurant.default_gst_rate,
            tax_mode=bill.tax_mode_snapshot or restaurant.tax_mode,
            interstate=interstate,
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
        bill.tax_mode_snapshot = bill.tax_mode_snapshot or restaurant.tax_mode
        bill.gstin_snapshot = bill.gstin_snapshot or restaurant.gstin
        bill.legal_business_name_snapshot = bill.legal_business_name_snapshot or restaurant.legal_business_name
        bill.billing_address_snapshot = bill.billing_address_snapshot or restaurant.registered_billing_address
        bill.state_name_snapshot = bill.state_name_snapshot or restaurant.gst_state_name
        bill.state_code_snapshot = bill.state_code_snapshot or restaurant.gst_state_code
        return bill

    bill.subtotal = subtotal
    bill.tax_amount = Decimal("0.00")
    bill.discount_amount = Decimal("0.00")
    bill.total_amount = subtotal
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
        bill_number=generate_bill_number(db, locked_session.restaurant),
        receipt_token=secrets.token_urlsafe(48),
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

    if locked_bill.status in {"issued", "payment_pending", "paid"}:
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
    billable_orders = get_billable_orders(db, locked_session.id)
    displayed_line_total = round_money(sum(
        (item.total_price for order in billable_orders for item in order.items if item.cancellation_status == "active"),
        Decimal("0.00"),
    ))
    authoritative_subtotal = round_money(sum(
        (order.subtotal for order in billable_orders),
        Decimal("0.00"),
    ))
    if displayed_line_total != authoritative_subtotal or locked_bill.subtotal != authoritative_subtotal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Bill lines do not match the authoritative subtotal. Correct the order before issuing.",
        )
    restaurant = locked_session.restaurant
    if locked_bill.gst_enabled_snapshot:
        if locked_bill.customer_tax_type == "b2b":
            if not locked_bill.customer_gstin_snapshot:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Customer GSTIN is required for B2B GST bills")
            if not locked_bill.customer_legal_name_snapshot or not locked_bill.customer_legal_name_snapshot.strip():
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Customer Legal Name is required for B2B GST bills")
            if not locked_bill.customer_billing_address_snapshot or not locked_bill.customer_billing_address_snapshot.strip():
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Customer Billing Address is required for B2B GST bills")
            if not locked_bill.customer_state_code_snapshot:
                locked_bill.customer_state_code_snapshot = locked_bill.customer_gstin_snapshot[:2]
            if not locked_bill.place_of_supply_code_snapshot:
                locked_bill.place_of_supply_code_snapshot = locked_bill.customer_state_code_snapshot

        if not locked_bill.invoice_number:
            locked_bill.invoice_number, locked_bill.invoice_date = generate_invoice_number(db, restaurant)

        # Freeze line-level gst_rate_snapshot from the final authoritative bill rate
        final_gst_rate = locked_bill.gst_rate
        for order in billable_orders:
            for item in order.items:
                if item.cancellation_status != "active":
                    continue
                if item.gst_rate_snapshot is None:
                    item.gst_rate_snapshot = final_gst_rate

    locked_bill.status = "issued"
    locked_session.status = "payment_requested"
    locked_session.payment_requested_at = datetime.datetime.now(datetime.timezone.utc)
    db.flush()
    return locked_bill


def _assign_unique_payment_code(db: Session, bill: Bill, now: datetime.datetime) -> str:
    for _ in range(PAYMENT_CODE_COLLISION_RETRIES):
        code = _new_payment_code()
        digest = payment_code_digest(bill.restaurant_id, code)
        collision = db.query(Bill.id).filter(
            Bill.restaurant_id == bill.restaurant_id,
            Bill.payment_code_hash == digest,
            Bill.status.in_(("issued", "payment_pending")),
            Bill.id != bill.id,
        ).first()
        if collision:
            continue
        try:
            with db.begin_nested():
                bill.payment_code_version += 1
                bill.payment_code_hash = digest
                bill.payment_code_ciphertext = _encrypt_payment_code(code)
                bill.payment_code_created_at = now
                bill.payment_code_expires_at = now + PAYMENT_CODE_TTL
                db.flush([bill])
            return code
        except IntegrityError:
            # A concurrent unresolved bill claimed the same restaurant-scoped
            # digest after our preflight check. The savepoint keeps the outer
            # detachment transaction usable for another cryptographic retry.
            db.refresh(bill)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Could not allocate a unique payment code. Please retry.",
    )


def detach_issued_bill_and_release_table(
    db: Session,
    *,
    restaurant_id: int,
    bill_id: int,
    actor: StaffUser | None,
    idempotency_key: str | None = None,
    payload_hash: str | None = None,
    request_id: str | None = None,
) -> DetachedBillResult:
    """Atomically issue a bill, revoke ordering authority, and free its table.

    The caller owns the outer transaction and must commit the returned result.
    This savepoint guarantees that a raised error cannot leave a partial
    detachment staged in that transaction.
    """
    if actor is not None and actor.restaurant_id != restaurant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    result: DetachedBillResult | None = None
    with db.begin_nested():
        identity = db.query(Bill.dining_session_id, DiningSession.table_id).join(
            DiningSession, DiningSession.id == Bill.dining_session_id
        ).filter(
            Bill.id == bill_id,
            Bill.restaurant_id == restaurant_id,
            DiningSession.restaurant_id == restaurant_id,
        ).first()
        if not identity:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

        table = db.query(RestaurantTable).filter(
            RestaurantTable.id == identity.table_id,
            RestaurantTable.restaurant_id == restaurant_id,
        ).with_for_update().first()
        if not table:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

        session = db.query(DiningSession).filter(
            DiningSession.id == identity.dining_session_id,
            DiningSession.restaurant_id == restaurant_id,
            DiningSession.table_id == table.id,
        ).with_for_update().first()
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

        bill = db.query(Bill).filter(
            Bill.id == bill_id,
            Bill.restaurant_id == restaurant_id,
            Bill.dining_session_id == session.id,
        ).with_for_update().first()
        if not bill:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

        # A customer retry can arrive after the first request committed and
        # revoked that customer's participant authority. Replaying the already
        # detached result under the same row locks is safe and, importantly,
        # never allocates a second code.
        if (
            session.status == "detached_awaiting_payment"
            and bill.status == "payment_pending"
            and bill.payment_code_ciphertext
        ):
            return DetachedBillResult(
                bill=bill,
                payment_code=decrypt_payment_code(bill.payment_code_ciphertext),
            )

        active_session = db.query(DiningSession.id).filter(
            DiningSession.restaurant_id == restaurant_id,
            DiningSession.table_id == table.id,
            DiningSession.status.in_(("open", "payment_requested", "payment_pending")),
        ).with_for_update().first()
        if not active_session or active_session.id != session.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The table is no longer occupied by this dining session.",
            )
        if session.status != "payment_requested":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Session must have a requested bill before detachment.",
            )
        if db.query(Payment.id).filter(Payment.bill_id == bill.id).first() or bill.status == "paid":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bill has already been paid.")
        if bill.status not in {"draft", "issued"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bill cannot be detached while status is {bill.status}.",
            )
        if idempotency_key is not None:
            bill.detachment_idempotency_key = idempotency_key
            bill.detachment_request_hash = payload_hash

        previous_state = {
            "bill_status": bill.status,
            "session_status": session.status,
            "table_id": table.id,
        }
        if bill.status == "draft":
            apply_draft_totals(db, bill)
            bill.status = "issued"

        now = datetime.datetime.now(datetime.timezone.utc)
        bill.status = "payment_pending"
        bill.payment_method = None
        session.status = "detached_awaiting_payment"
        session.detached_at = now
        session.detached_by_staff_id = actor.id if actor is not None else None
        revoked_count = invalidate_session_participants(
            db, session, "Ordering authority revoked after bill detachment"
        )
        db.flush()
        payment_code = _assign_unique_payment_code(db, bill, now)
        db.add(AuditLog(
            restaurant_id=restaurant_id,
            actor_user_id=actor.id if actor is not None else None,
            actor_role=actor.role if actor is not None else "customer",
            target_type="bill",
            target_id=str(bill.id),
            action="bill.detached_and_table_released",
            previous_value=json.dumps(previous_state, sort_keys=True),
            new_value=json.dumps({
                "bill_status": bill.status,
                "session_status": session.status,
                "table_id": table.id,
                "detached_at": now.isoformat(),
                "detached_by_staff_id": actor.id if actor is not None else None,
                "revoked_participant_count": revoked_count,
                "request_id": request_id,
            }, sort_keys=True),
        ))
        db.flush()
        result = DetachedBillResult(bill=bill, payment_code=payment_code)

    assert result is not None
    return result


def request_pay_at_counter(
    db: Session,
    dining_session: DiningSession,
    method: str,
) -> Bill:
    if method not in COUNTER_PAYMENT_METHODS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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
    idempotency_key: str,
    payload_hash: str,
) -> tuple[Bill, bool]:
    if method not in COUNTER_PAYMENT_METHODS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
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

    if locked_bill.payment_idempotency_key == idempotency_key:
        ensure_same_request(locked_bill.payment_request_hash, payload_hash)
        return locked_bill, True

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

    if locked_session.status not in {"payment_pending", "detached_awaiting_payment"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot confirm payment while session status is {locked_session.status}.",
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    locked_bill.status = "paid"
    locked_bill.paid_at = now
    locked_bill.payment_method = method
    locked_bill.paid_by_staff_id = staff_user.id
    locked_bill.payment_idempotency_key = idempotency_key
    locked_bill.payment_request_hash = payload_hash
    locked_bill.payment_code_hash = None
    locked_bill.payment_code_ciphertext = None
    locked_bill.payment_code_expires_at = now
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
    payment = Payment(
        restaurant_id=staff_user.restaurant_id,
        bill_id=locked_bill.id,
        idempotency_key=idempotency_key,
        method=method,
        amount=locked_bill.total_amount,
        recorded_by_staff_id=staff_user.id,
    )
    db.add(payment)
    db.flush()
    db.add(RevenueEntry(
        restaurant_id=staff_user.restaurant_id,
        payment_id=payment.id,
        amount=locked_bill.total_amount,
        currency=locked_bill.currency,
        occurred_at=now,
    ))
    db.flush()
    return locked_bill, False


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
        # Drafts are provisional and must not grant durable receipt access.
        "receipt_token": bill.receipt_token if bill.status != "draft" else None,
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
                    if item.cancellation_status == "active"
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
        "customer_tax_type": bill.customer_tax_type,
        "customer_gstin_snapshot": bill.customer_gstin_snapshot,
        "customer_legal_name_snapshot": bill.customer_legal_name_snapshot,
        "customer_billing_address_snapshot": bill.customer_billing_address_snapshot,
        "customer_state_code_snapshot": bill.customer_state_code_snapshot,
        "customer_state_name_snapshot": bill.customer_state_name_snapshot,
        "place_of_supply_code_snapshot": bill.place_of_supply_code_snapshot,
        "session_status": bill.dining_session.status,
        "payment_requested_at": bill.dining_session.payment_requested_at,
        "detached_at": bill.dining_session.detached_at,
        "payment_code": (
            decrypt_payment_code(bill.payment_code_ciphertext)
            if bill.dining_session.status == "detached_awaiting_payment"
            and bill.status == "payment_pending"
            and bill.payment_code_ciphertext
            and bill.payment_code_expires_at
            and bill.payment_code_expires_at > datetime.datetime.now(datetime.timezone.utc)
            else None
        ),
        "payment_code_expires_at": bill.payment_code_expires_at,
        "amount_due": bill.total_amount,
        "original_table": bill.dining_session.table.table_number,
        "issued_at": bill.payment_code_created_at or bill.generated_at,
        "detached_session_status": bill.dining_session.status,
        "receipt_access": bill.receipt_token if bill.status != "draft" else None,
    }


def build_receipt_payload(db: Session, bill: Bill) -> dict:
    bill = load_bill_for_response(db, bill.id)
    orders = get_billable_orders(db, bill.dining_session_id)
    items = []
    for order in orders:
        for item in order.items:
            if item.cancellation_status != "active":
                continue
            options = [
                f"{option.group_name}: {option.option_name}"
                for option in item.selected_options
            ]
            items.append({
                "name": item.item_name,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "line_total": item.total_price,
                "options": options,
            })
    receipt_title = (
        "PROVISIONAL BILL PREVIEW" if bill.status == "draft"
        else "TAX INVOICE" if bill.status in {"issued", "payment_pending"}
        else "PAYMENT RECEIPT"
    )
    return {
        "bill_number": bill.bill_number,
        "invoice_number": bill.invoice_number,
        "receipt_title": receipt_title,
        "status": bill.status,
        "restaurant_name": bill.restaurant.name,
        "legal_business_name": bill.legal_business_name_snapshot or bill.restaurant.legal_business_name or bill.restaurant.name,
        "address": bill.billing_address_snapshot or bill.restaurant.registered_billing_address or "",
        "gstin": bill.gstin_snapshot or bill.restaurant.gstin or None,
        "state_name": bill.state_name_snapshot or bill.restaurant.gst_state_name or None,
        "state_code": bill.state_code_snapshot or bill.restaurant.gst_state_code or None,
        "customer_gstin": bill.customer_gstin_snapshot if bill.customer_tax_type == "b2b" else None,
        "customer_legal_name": bill.customer_legal_name_snapshot if bill.customer_tax_type == "b2b" else None,
        "customer_billing_address": bill.customer_billing_address_snapshot if bill.customer_tax_type == "b2b" else None,
        "customer_state_name": bill.customer_state_name_snapshot if bill.customer_tax_type == "b2b" else None,
        "customer_state_code": bill.customer_state_code_snapshot if bill.customer_tax_type == "b2b" else None,
        "table_number": bill.dining_session.table.table_number,
        "staff_name": bill.generated_by_staff.name if bill.generated_by_staff else "Staff",
        "created_at": (bill.invoice_date or bill.generated_at).isoformat(),
        "paid_at": bill.paid_at.isoformat() if bill.paid_at else None,
        "items": items,
        "subtotal": bill.subtotal,
        "discount_amount": bill.discount_amount,
        "taxable_amount": bill.taxable_amount,
        "cgst_amount": bill.cgst_amount,
        "sgst_amount": bill.sgst_amount,
        "igst_amount": bill.igst_amount,
        "tax_amount": bill.tax_amount,
        "grand_total": bill.total_amount,
        "currency": bill.currency,
        "gst_enabled": bill.gst_enabled_snapshot,
        "tax_mode": bill.tax_mode_snapshot,
        "payment_method": bill.payment_method,
        "payment_status": "PAID" if bill.status == "paid" else "UNPAID",
        "is_official_invoice": bill.status in {"issued", "payment_pending", "paid"},
    }
