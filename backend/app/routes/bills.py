import datetime
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.empty_table_report import EmptyTableReport
from app.models.staff_user import AuditLog, StaffUser
from app.services.idempotency import ensure_same_request, request_hash, require_key
from app.schemas.bill import (
    BillResponse,
    CounterPaymentRequest,
    DetachedPendingBillResponse,
    IssueAndReleaseRequest,
    IssueAndReleaseResponse,
    PaymentCodeLookupRequest,
    PaymentCodeLookupResponse,
    RateLimitErrorResponse,
    ShortOrderSummary,
)
from app.services.bills import (
    begin_payment_code_lookup_attempt,
    build_bill_response,
    confirm_counter_payment,
    create_or_refresh_bill_for_session,
    decrypt_payment_code,
    detach_issued_bill_and_release_table,
    find_unresolved_bill_by_payment_code,
    finish_payment_code_lookup_attempt,
    get_billable_orders,
    issue_bill,
    send_bill_to_counter,
)
from app.services.dining_sessions import find_current_open_session_for_table
from app.services.table_participants import authority_hash, enforce_session_action_rate, load_participant, participant_token_header
from app.services.table_participants import invalidate_session_participants
from app.utils.auth import OperationalWriteChecker, RoleChecker
from app.services.realtime import (
    EVENT_BILL_GENERATED,
    EVENT_BILL_DETACHED_FOR_PAYMENT,
    EVENT_BILL_PAYMENT_PENDING,
    EVENT_BILL_PAYMENT_RECORDED,
    EVENT_BILL_PAID,
    EVENT_BILL_SENT_TO_COUNTER,
    EVENT_BILL_UPDATED,
    EVENT_SESSION_CLOSED,
    EVENT_TABLE_STATUS_CHANGED,
    publish_event,
    restaurant_channel,
    session_channel,
    table_channel,
)


router = APIRouter()
logger = logging.getLogger(__name__)

_bill_issue_roles = OperationalWriteChecker(["owner", "admin", "staff"])
_payment_record_roles = RoleChecker(["owner", "admin"])
_payment_lookup_roles = RoleChecker(["owner", "admin", "staff"])


def _short_order_summary(db: Session, bill: Bill) -> ShortOrderSummary:
    orders = get_billable_orders(db, bill.dining_session_id)
    item_count = sum(item.quantity for order in orders for item in order.items)
    labels = [
        f"{item.quantity} × {item.item_name}"
        for order in orders
        for item in order.items
    ][:5]
    return ShortOrderSummary(order_count=len(orders), item_count=item_count, items=labels)


def _detached_response(
    db: Session,
    bill: Bill,
    *,
    payment_code: str | None = None,
    actor: StaffUser | None = None,
) -> DetachedPendingBillResponse | IssueAndReleaseResponse | PaymentCodeLookupResponse:
    session = bill.dining_session
    common = {
        "bill_number": bill.bill_number,
        "restaurant_name": bill.restaurant.name,
        "original_table": session.table.table_number,
        "original_table_id": session.table_id,
        "session_id": session.id,
        "bill_status": bill.status,
        "session_status": session.status,
        "amount_due": bill.total_amount,
        "currency": bill.currency,
        "issued_at": bill.generated_at,
        "detached_at": session.detached_at,
        "payment_code_expires_at": bill.payment_code_expires_at,
    }
    if payment_code is not None:
        return IssueAndReleaseResponse(**common, payment_code=payment_code)
    now = datetime.datetime.now(datetime.timezone.utc)
    detached_at = session.detached_at
    if detached_at.tzinfo is None:
        detached_at = detached_at.replace(tzinfo=datetime.timezone.utc)
    return PaymentCodeLookupResponse(
        **common,
        waiting_seconds=max(0, int((now - detached_at).total_seconds())),
        order_summary=_short_order_summary(db, bill),
        can_confirm_payment=bool(actor and actor.role in {"owner", "admin"}),
    )


@router.post(
    "/public/sessions/{session_token}/bill-request",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
)
def request_public_session_bill(
    session_token: str,
    request: Request,
    participant_token: str = Depends(participant_token_header),
    db: Session = Depends(get_db),
):
    session = db.query(DiningSession).filter(
        DiningSession.public_token == session_token
    ).with_for_update().first()
    if not session:
        raise HTTPException(status_code=404, detail="Dining session not found")
    load_participant(
        db,
        participant_token,
        session_token=session_token,
        lock_for_action=True,
        allow_revoked_for_detached_bill=True,
    )
    enforce_session_action_rate(
        db, session, action="bill_request",
        ip_value=request.client.host if request.client else "unknown",
        participant_token=participant_token, limit=5,
    )
    if session.status == "detached_awaiting_payment" and session.bill:
        # Secure retry: only a token that belonged to this exact session reaches
        # this branch, and the secret is returned directly in the response.
        return build_bill_response(db, session.bill)
    if session.status not in {"open", "payment_requested"}:
        raise HTTPException(status_code=409, detail="Bill cannot be requested for this session")
    bill = create_or_refresh_bill_for_session(db, session)
    if session.status == "open":
        session.status = "payment_requested"
        session.payment_requested_at = datetime.datetime.now(datetime.timezone.utc)
    result = detach_issued_bill_and_release_table(
        db,
        restaurant_id=session.restaurant_id,
        bill_id=bill.id,
        actor=None,
        idempotency_key=f"customer-bill-request:{session.id}",
        payload_hash=request_hash({"session_id": session.id, "action": "bill_request"}),
        request_id=getattr(request.state, "request_id", None),
    )
    db.commit()
    bill = result.bill
    publish_event(
        EVENT_BILL_DETACHED_FOR_PAYMENT,
        restaurant_id=session.restaurant_id,
        channels=[
            restaurant_channel(session.restaurant_id, "operations"),
            restaurant_channel(session.restaurant_id, "staff"),
            session_channel(session.public_token),
            table_channel(session.restaurant_id, session.table_id),
        ],
        resource_id=bill.id,
        state={
            "restaurant_id": session.restaurant_id,
            "original_table_id": session.table_id,
            "original_session_id": session.id,
            "bill_number": bill.bill_number,
            "bill_status": bill.status,
            "session_status": session.status,
            "detached_at": session.detached_at.isoformat(),
            "authority_epoch": session.join_code_version,
        },
    )
    current_table_session = find_current_open_session_for_table(db, session.table_id)
    publish_event(
        EVENT_TABLE_STATUS_CHANGED,
        restaurant_id=session.restaurant_id,
        channels=[
            restaurant_channel(session.restaurant_id, "operations"),
            table_channel(session.restaurant_id, session.table_id),
        ],
        resource_id=session.table_id,
        state={
            "status": current_table_session.status if current_table_session else "free",
            "session_token": current_table_session.public_token if current_table_session else None,
        },
    )
    return build_bill_response(db, bill)


@router.post(
    "/public/sessions/{session_token}/bill",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_public_session_bill(
    session_token: str,
    request: Request,
    participant_token: str = Depends(participant_token_header),
    db: Session = Depends(get_db),
):
    dining_session = db.query(DiningSession).options(
        joinedload(DiningSession.restaurant),
        joinedload(DiningSession.table),
    ).filter(DiningSession.public_token == session_token).first()

    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")
    load_participant(db, participant_token, session_token=session_token, lock_for_action=True)
    enforce_session_action_rate(
        db, dining_session, action="bill_create",
        ip_value=request.client.host if request.client else "unknown",
        participant_token=participant_token, limit=5,
    )

    bill = create_or_refresh_bill_for_session(db, dining_session)
    db.commit()
    publish_event(
        EVENT_BILL_GENERATED,
        restaurant_id=dining_session.restaurant_id,
        channels=[
            restaurant_channel(dining_session.restaurant_id, "operations"),
            restaurant_channel(dining_session.restaurant_id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(dining_session.restaurant_id, dining_session.table_id),
        ],
        resource_id=bill.id,
        state={"bill_number": bill.bill_number, "status": bill.status, "session_token": dining_session.public_token},
    )
    return build_bill_response(db, bill)


@router.post(
    "/staff/sessions/{session_token}/bill",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_staff_session_bill(
    session_token: str,
    current_user: StaffUser = Depends(_bill_issue_roles),
    db: Session = Depends(get_db),
):
    dining_session = db.query(DiningSession).filter(
        DiningSession.public_token == session_token,
        DiningSession.restaurant_id == current_user.restaurant_id,
    ).first()
    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")
    bill = create_or_refresh_bill_for_session(
        db,
        dining_session,
        generated_by_staff_id=current_user.id,
    )
    db.add(AuditLog(
        restaurant_id=current_user.restaurant_id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        target_type="bill",
        target_id=str(bill.id),
        action="staff_bill_generated",
    ))
    db.commit()
    return build_bill_response(db, bill)


@router.get(
    "/public/sessions/{session_token}/bill",
    response_model=BillResponse,
)
def get_public_session_bill(
    session_token: str,
    participant_token: str | None = Header(None, alias="X-Participant-Token"),
    receipt_token: str | None = Header(None, alias="X-Receipt-Token"),
    db: Session = Depends(get_db),
):
    dining_session = db.query(DiningSession).filter(
        DiningSession.public_token == session_token
    ).first()

    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")
    bill = db.query(Bill).filter(Bill.dining_session_id == dining_session.id).first()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    if receipt_token:
        if bill.receipt_token != receipt_token:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    elif participant_token:
        load_participant(db, participant_token, session_token=session_token)
    else:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bill access token is required")

    return build_bill_response(db, bill)


def _load_public_receipt(db: Session, receipt_token: str, restaurant_slug: str | None = None) -> Bill:
    query = (
        db.query(Bill)
        .join(DiningSession, DiningSession.id == Bill.dining_session_id)
        .filter(
            Bill.receipt_token == receipt_token,
            Bill.restaurant_id == DiningSession.restaurant_id,
            Bill.status.in_(["issued", "payment_pending", "paid"]),
        )
    )
    if restaurant_slug is not None:
        query = query.filter(Bill.restaurant.has(slug=restaurant_slug))
    bill = query.first()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


@router.get("/public/bills/{receipt_token}", response_model=BillResponse)
def get_public_bill_receipt(receipt_token: str, db: Session = Depends(get_db)):
    """Read-only bill access, independent of active dining-session authority."""
    bill = _load_public_receipt(db, receipt_token)
    return build_bill_response(db, bill)


@router.get("/public/restaurants/{restaurant_slug}/bills/{receipt_token}", response_model=BillResponse)
def get_restaurant_public_bill_receipt(
    restaurant_slug: str,
    receipt_token: str,
    db: Session = Depends(get_db),
):
    bill = _load_public_receipt(db, receipt_token, restaurant_slug)
    return build_bill_response(db, bill)


@router.post(
    "/public/sessions/{session_token}/pay-at-counter",
    response_model=BillResponse,
)
def request_public_pay_at_counter(
    session_token: str,
    payload: CounterPaymentRequest,
    db: Session = Depends(get_db),
):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Payment method selection is restricted to the restaurant counter.",
    )


@router.get("/staff/bills/pending-payments")
def list_pending_counter_payments(
    current_user: StaffUser = Depends(_payment_record_roles),
    db: Session = Depends(get_db),
):
    bills = (
        db.query(Bill)
        .options(
            joinedload(Bill.dining_session).joinedload(DiningSession.table),
            joinedload(Bill.generated_by_staff),
        )
        .filter(
            Bill.restaurant_id == current_user.restaurant_id,
            Bill.status.in_(["draft", "issued", "payment_pending"]),
        )
        .order_by(Bill.updated_at.desc(), Bill.id.desc())
        .all()
    )
    items = []
    for bill in bills:
        sent_audit = (
            db.query(AuditLog)
            .filter(
                AuditLog.restaurant_id == current_user.restaurant_id,
                AuditLog.target_type == "bill",
                AuditLog.target_id == str(bill.id),
                AuditLog.action == "bill.sent_to_counter",
            )
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .first()
        )
        sender = db.query(StaffUser).filter(StaffUser.id == sent_audit.actor_user_id).first() if sent_audit and sent_audit.actor_user_id else bill.generated_by_staff
        session = bill.dining_session
        summary = _short_order_summary(db, bill)
        items.append({
            "bill_id": bill.id,
            "bill_number": bill.bill_number,
            "session_id": session.id,
            "table_id": session.table_id,
            "table_number": session.table.table_number,
            "table_name": f"Table {session.table.table_number}",
            "session_token": session.public_token,
            "total_amount": f"{bill.total_amount:.2f}",
            "grand_total": f"{bill.total_amount:.2f}",
            "amount_paid": "0.00",
            "remaining_amount": f"{bill.total_amount:.2f}",
            "currency": bill.currency,
            "requested_at": (session.payment_requested_at or bill.generated_at).isoformat(),
            "session_opened_at": session.opened_at.isoformat(),
            "sent_at": sent_audit.created_at.isoformat() if sent_audit else None,
            "sent_by_staff_id": sender.id if sender else None,
            "sent_by_staff_name": sender.name if sender else None,
            "status": bill.status,
            "session_status": session.status,
            "detached_at": session.detached_at.isoformat() if session.detached_at else None,
            "payment_code": (
                decrypt_payment_code(bill.payment_code_ciphertext)
                if session.status == "detached_awaiting_payment"
                and bill.payment_code_ciphertext
                and bill.payment_code_expires_at
                and bill.payment_code_expires_at > datetime.datetime.now(datetime.timezone.utc)
                else None
            ),
            "payment_code_expires_at": (
                bill.payment_code_expires_at.isoformat() if bill.payment_code_expires_at else None
            ),
            "order_summary": summary.model_dump(),
            "stage": (
                "bill_requested" if bill.status == "draft"
                else "bill_issued" if bill.status == "issued" and not sent_audit
                else "detached_awaiting_payment" if session.status == "detached_awaiting_payment"
                else "ready_for_payment" if bill.status == "payment_pending" and bill.payment_method is None
                else "payment_pending"
            ),
        })
    return {"items": items}


@router.post(
    "/staff/bills/payment-code/lookup",
    response_model=PaymentCodeLookupResponse,
    responses={429: {"model": RateLimitErrorResponse}},
)
def lookup_staff_bill_by_payment_code(
    payload: PaymentCodeLookupRequest,
    request: Request,
    current_user: StaffUser = Depends(_payment_lookup_roles),
    db: Session = Depends(get_db),
):
    request_id = getattr(request.state, "request_id", None)
    client_material = (
        f"{request.client.host if request.client else 'unknown'}:"
        f"{request.headers.get('user-agent', 'unknown')[:200]}"
    )
    client_identifier_hash = authority_hash(f"payment-code-lookup:{client_material}")
    attempt, retry_after = begin_payment_code_lookup_attempt(
        db,
        restaurant_id=current_user.restaurant_id,
        actor_user_id=current_user.id,
        client_identifier_hash=client_identifier_hash,
    )
    if retry_after is not None:
        db.add(AuditLog(
            restaurant_id=current_user.restaurant_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            target_type="payment_code_lookup",
            target_id=None,
            action="payment_code_lookup_rate_limited",
            new_value=json.dumps({
                "request_id": request_id,
                "attempt_count": attempt.attempt_count,
                "retry_after_seconds": retry_after,
            }, sort_keys=True),
        ))
        db.commit()
        logger.warning(
            "event=payment_code_lookup_rate_limited restaurant_id=%s actor_id=%s request_id=%s",
            current_user.restaurant_id,
            current_user.id,
            request_id,
        )
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "detail": "Too many payment-code lookup attempts. Please wait and retry.",
                "retry_after_seconds": retry_after,
                "request_id": request_id,
            },
            headers={"Retry-After": str(retry_after)},
        )

    bill = find_unresolved_bill_by_payment_code(
        db,
        restaurant_id=current_user.restaurant_id,
        code=payload.payment_code,
        lock_for_update=True,
    )
    finish_payment_code_lookup_attempt(attempt, succeeded=bill is not None)
    if bill is not None:
        db.add(AuditLog(
            restaurant_id=current_user.restaurant_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            target_type="bill",
            target_id=str(bill.id),
            action="payment_code_lookup_succeeded",
            previous_value=json.dumps({"bill_status": bill.status}, sort_keys=True),
            new_value=json.dumps({
                "bill_status": bill.status,
                "session_id": bill.dining_session_id,
                "table_id": bill.dining_session.table_id,
                "request_id": request_id,
            }, sort_keys=True),
        ))
    db.commit()
    logger.info(
        "event=payment_code_lookup restaurant_id=%s actor_id=%s outcome=%s request_id=%s",
        current_user.restaurant_id,
        current_user.id,
        "success" if bill else "not_found",
        request_id,
    )
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment code was not found.")
    return _detached_response(db, bill, actor=current_user)


@router.post(
    "/staff/bills/{bill_number}/issue-and-release",
    response_model=IssueAndReleaseResponse,
)
def issue_and_release_staff_bill(
    bill_number: str,
    payload: IssueAndReleaseRequest,
    request: Request,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_payment_record_roles),
    db: Session = Depends(get_db),
):
    key = require_key(idempotency_key)
    payload_hash = request_hash(payload.model_dump(mode="json"))
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if bill.detachment_idempotency_key:
        if (
            bill.detachment_idempotency_key.startswith("customer-bill-request:")
            and bill.dining_session.status == "detached_awaiting_payment"
            and bill.status == "payment_pending"
            and bill.payment_code_ciphertext
        ):
            # Administrative recovery is deliberately idempotent after the
            # normal customer-triggered transition has already succeeded.
            return _detached_response(
                db, bill, payment_code=decrypt_payment_code(bill.payment_code_ciphertext)
            )
        if bill.detachment_idempotency_key != key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bill was already detached with a different Idempotency-Key.",
            )
        ensure_same_request(bill.detachment_request_hash, payload_hash)
        if (
            bill.dining_session.status != "detached_awaiting_payment"
            or bill.status != "payment_pending"
            or not bill.payment_code_ciphertext
            or not bill.payment_code_expires_at
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The detached bill is no longer awaiting payment.",
            )
        return _detached_response(
            db, bill, payment_code=decrypt_payment_code(bill.payment_code_ciphertext)
        )

    if not payload.confirm_table_is_free:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Staff must confirm that the table is physically free.",
        )
    result = detach_issued_bill_and_release_table(
        db,
        restaurant_id=current_user.restaurant_id,
        bill_id=bill.id,
        actor=current_user,
        idempotency_key=key,
        payload_hash=payload_hash,
        request_id=getattr(request.state, "request_id", None),
    )
    db.commit()
    detached = result.bill
    current_table_session = find_current_open_session_for_table(
        db, detached.dining_session.table_id
    )
    event_state = {
        "restaurant_id": current_user.restaurant_id,
        "original_table_id": detached.dining_session.table_id,
        "original_session_id": detached.dining_session_id,
        "bill_number": detached.bill_number,
        "bill_status": detached.status,
        "session_status": detached.dining_session.status,
        "detached_at": detached.dining_session.detached_at.isoformat(),
        "authority_epoch": detached.dining_session.join_code_version,
    }
    publish_event(
        EVENT_BILL_DETACHED_FOR_PAYMENT,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(detached.dining_session.public_token),
            table_channel(current_user.restaurant_id, detached.dining_session.table_id),
        ],
        resource_id=detached.id,
        state=event_state,
    )
    publish_event(
        EVENT_BILL_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "operations")],
        resource_id=detached.id,
        state={"bill_number": detached.bill_number, "status": detached.status},
    )
    publish_event(
        EVENT_TABLE_STATUS_CHANGED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            table_channel(current_user.restaurant_id, detached.dining_session.table_id),
        ],
        resource_id=detached.dining_session.table_id,
        state={
            "status": current_table_session.status if current_table_session else "free",
            "session_token": current_table_session.public_token if current_table_session else None,
        },
    )
    return _detached_response(db, detached, payment_code=result.payment_code)


@router.get("/staff/bills/{bill_number}", response_model=BillResponse)
def get_staff_bill(
    bill_number: str,
    current_user: StaffUser = Depends(_payment_record_roles),
    db: Session = Depends(get_db),
):
    """Return the authoritative state for an Owner/Admin bill deep link."""
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return build_bill_response(db, bill)


@router.post(
    "/staff/bills/{bill_number}/issue",
    response_model=BillResponse,
)
def issue_staff_bill(
    bill_number: str,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_bill_issue_roles),
    db: Session = Depends(get_db),
):
    key = require_key(idempotency_key)
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()

    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if bill.issue_idempotency_key:
        if bill.issue_idempotency_key != key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bill was already issued with a different Idempotency-Key.",
            )
        return build_bill_response(db, bill)

    if not bill.generated_by_staff_id:
        bill.generated_by_staff_id = current_user.id
    issued = issue_bill(db, bill)
    issued.issue_idempotency_key = key
    db.commit()
    publish_event(
        EVENT_BILL_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(issued.dining_session.public_token),
            table_channel(current_user.restaurant_id, issued.dining_session.table_id),
        ],
        resource_id=issued.id,
        state={"bill_number": issued.bill_number, "status": issued.status},
    )
    return build_bill_response(db, issued)


@router.post(
    "/staff/bills/{bill_number}/confirm-counter-payment",
    response_model=BillResponse,
)
def confirm_staff_counter_payment(
    bill_number: str,
    payload: CounterPaymentRequest,
    request: Request,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_payment_record_roles),
    db: Session = Depends(get_db),
):
    key = require_key(idempotency_key)
    payload_hash = request_hash(payload.model_dump(mode="json"))
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()

    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    previous_bill_status = bill.status
    had_payment_code = bool(bill.payment_code_hash or bill.payment_code_ciphertext)
    previous_session_status = (
        "detached_awaiting_payment" if had_payment_code else "payment_pending"
    )
    paid, replayed = confirm_counter_payment(db, bill, current_user, payload.method, key, payload_hash)
    if replayed:
        return build_bill_response(db, paid)
    invalidated = invalidate_session_participants(db, paid.dining_session, "Session closed after payment")
    open_report = db.query(EmptyTableReport).filter(
        EmptyTableReport.restaurant_id == current_user.restaurant_id,
        EmptyTableReport.session_id == paid.dining_session_id,
        EmptyTableReport.status == "open",
    ).with_for_update().first()
    if open_report:
        open_report.status = "resolved_by_session_close"
        open_report.resolved_at = paid.paid_at
        open_report.resolved_by_user_id = current_user.id
        open_report.resolution_reason = "payment_completed"
    db.add(AuditLog(
        restaurant_id=current_user.restaurant_id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        target_type="dining_session",
        target_id=str(paid.dining_session_id),
        action="table_participants_invalidated",
        new_value=f'{{"count": {invalidated}, "reason": "payment_completed"}}',
    ))
    db.add(AuditLog(
        restaurant_id=current_user.restaurant_id,
        actor_user_id=current_user.id,
        actor_role=current_user.role,
        target_type="bill",
        target_id=str(paid.id),
        action="counter_payment_recorded",
        previous_value=json.dumps({
            "bill_status": previous_bill_status,
            "session_status": previous_session_status,
        }, sort_keys=True),
        new_value=json.dumps({
            "bill_number": paid.bill_number,
            "bill_status": paid.status,
            "session_status": paid.dining_session.status,
            "session_id": paid.dining_session_id,
            "table_id": paid.dining_session.table_id,
            "method": paid.payment_method,
            "amount": str(paid.total_amount),
            "request_id": getattr(request.state, "request_id", None),
        }, sort_keys=True),
    ))
    if had_payment_code:
        db.add(AuditLog(
            restaurant_id=current_user.restaurant_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            target_type="bill",
            target_id=str(paid.id),
            action="payment_code_invalidated",
            previous_value=json.dumps({
                "bill_status": previous_bill_status,
                "session_status": previous_session_status,
                "code_active": True,
            }, sort_keys=True),
            new_value=json.dumps({
                "bill_status": paid.status,
                "session_status": paid.dining_session.status,
                "code_active": False,
                "session_id": paid.dining_session_id,
                "table_id": paid.dining_session.table_id,
                "request_id": getattr(request.state, "request_id", None),
            }, sort_keys=True),
        ))
    db.commit()
    staff_event_channels = [
        restaurant_channel(current_user.restaurant_id, "operations"),
        restaurant_channel(current_user.restaurant_id, "staff"),
        restaurant_channel(current_user.restaurant_id, "admin"),
        table_channel(current_user.restaurant_id, paid.dining_session.table_id),
    ]
    publish_event(
        EVENT_BILL_PAYMENT_RECORDED,
        restaurant_id=current_user.restaurant_id,
        channels=staff_event_channels,
        resource_id=paid.id,
        state={"bill_number": paid.bill_number, "status": paid.status},
    )
    publish_event(
        EVENT_BILL_PAID,
        restaurant_id=current_user.restaurant_id,
        channels=[*staff_event_channels, session_channel(paid.dining_session.public_token)],
        resource_id=paid.id,
        state={
            "bill_number": paid.bill_number,
            "status": paid.status,
            "session_token": paid.dining_session.public_token,
            "receipt_token": paid.receipt_token,
            "payment_method": paid.payment_method,
            "paid_at": paid.paid_at.isoformat() if paid.paid_at else None,
        },
    )
    publish_event(
        EVENT_SESSION_CLOSED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(paid.dining_session.public_token),
            table_channel(current_user.restaurant_id, paid.dining_session.table_id),
        ],
        resource_id=paid.dining_session_id,
        state={"session_token": paid.dining_session.public_token, "status": "closed"},
    )
    current_table_session = find_current_open_session_for_table(
        db, paid.dining_session.table_id
    )
    publish_event(
        EVENT_TABLE_STATUS_CHANGED,
        restaurant_id=current_user.restaurant_id,
        channels=staff_event_channels,
        resource_id=paid.dining_session.table_id,
        state={
            "status": current_table_session.status if current_table_session else "free",
            "session_token": current_table_session.public_token if current_table_session else None,
        },
    )
    return build_bill_response(db, paid)


def _send_counter_handoff(db: Session, bill: Bill, current_user: StaffUser) -> Bill:
    already_pending = bill.status == "payment_pending"
    if bill.status == "draft":
        bill = issue_bill(db, bill)
    pending = send_bill_to_counter(db, bill)
    existing_audit = db.query(AuditLog).filter(
        AuditLog.restaurant_id == current_user.restaurant_id,
        AuditLog.target_type == "bill",
        AuditLog.target_id == str(pending.id),
        AuditLog.action == "bill.sent_to_counter",
    ).first()
    if not existing_audit:
        db.add(AuditLog(
            restaurant_id=current_user.restaurant_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            target_type="bill",
            target_id=str(pending.id),
            action="bill.sent_to_counter",
        ))
    db.commit()
    # Idempotent retries return the current bill without producing a second
    # card/banner event with a different event id.
    if already_pending:
        return pending
    channels = [
        restaurant_channel(current_user.restaurant_id, "operations"),
        restaurant_channel(current_user.restaurant_id, "staff"),
        session_channel(pending.dining_session.public_token),
        table_channel(current_user.restaurant_id, pending.dining_session.table_id),
    ]
    state = {
        "bill_id": pending.id,
        "bill_number": pending.bill_number,
        "status": pending.status,
        "session_id": pending.dining_session.id,
        "table_id": pending.dining_session.table_id,
        "table_name": f"Table {pending.dining_session.table.table_number}",
        "session_token": pending.dining_session.public_token,
        "grand_total": float(pending.total_amount),
        "sent_by_name": current_user.name,
        "requested_at": (
            pending.dining_session.payment_requested_at or pending.generated_at
        ).isoformat(),
    }
    for event_type in (EVENT_BILL_SENT_TO_COUNTER, EVENT_BILL_PAYMENT_PENDING):
        publish_event(
            event_type,
            restaurant_id=current_user.restaurant_id,
            channels=channels,
            resource_id=pending.id,
            state=state,
        )
    publish_event(
        EVENT_TABLE_STATUS_CHANGED,
        restaurant_id=current_user.restaurant_id,
        channels=channels,
        resource_id=pending.dining_session.table_id,
        state={"status": "payment_pending"},
    )
    return pending


@router.post(
    "/staff/bills/{bill_number}/send-to-counter",
    response_model=BillResponse,
)
def send_staff_bill_to_counter(
    bill_number: str,
    current_user: StaffUser = Depends(_bill_issue_roles),
    db: Session = Depends(get_db),
):
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return build_bill_response(db, _send_counter_handoff(db, bill, current_user))


@router.post(
    "/staff/bills/{bill_number}/payment-assistance",
    response_model=BillResponse,
)
def request_staff_payment_assistance(
    bill_number: str,
    current_user: StaffUser = Depends(_bill_issue_roles),
    db: Session = Depends(get_db),
):
    bill = (
        db.query(Bill)
        .options(joinedload(Bill.dining_session))
        .filter(
            Bill.restaurant_id == current_user.restaurant_id,
            Bill.bill_number == bill_number,
        )
        .first()
    )

    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if bill.status == "paid":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bill has already been paid.")
    return build_bill_response(db, _send_counter_handoff(db, bill, current_user))
