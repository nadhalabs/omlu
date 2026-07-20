from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.staff_user import AuditLog, StaffUser
from app.schemas.bill import BillResponse, CounterPaymentRequest
from app.services.bills import (
    build_bill_response,
    confirm_counter_payment,
    create_or_refresh_bill_for_session,
    issue_bill,
    send_bill_to_counter,
)
from app.utils.auth import RoleChecker
from app.services.realtime import (
    EVENT_BILL_GENERATED,
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

_bill_issue_roles = RoleChecker(["owner", "admin", "staff"])
_payment_record_roles = RoleChecker(["owner", "admin"])


@router.post(
    "/public/sessions/{session_token}/bill",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_public_session_bill(
    session_token: str,
    db: Session = Depends(get_db),
):
    dining_session = db.query(DiningSession).options(
        joinedload(DiningSession.restaurant),
        joinedload(DiningSession.table),
    ).filter(DiningSession.public_token == session_token).first()

    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

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


@router.get(
    "/public/sessions/{session_token}/bill",
    response_model=BillResponse,
)
def get_public_session_bill(
    session_token: str,
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
            Bill.status == "payment_pending",
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
        items.append({
            "bill_id": bill.id,
            "bill_number": bill.bill_number,
            "session_id": session.id,
            "table_id": session.table_id,
            "table_number": session.table.table_number,
            "session_token": session.public_token,
            "total_amount": f"{bill.total_amount:.2f}",
            "currency": bill.currency,
            "requested_at": (session.payment_requested_at or bill.generated_at).isoformat(),
            "sent_at": sent_audit.created_at.isoformat() if sent_audit else None,
            "sent_by_staff_id": sender.id if sender else None,
            "sent_by_staff_name": sender.name if sender else None,
            "status": bill.status,
        })
    return {"items": items}


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
    current_user: StaffUser = Depends(_bill_issue_roles),
    db: Session = Depends(get_db),
):
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()

    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    if not bill.generated_by_staff_id:
        bill.generated_by_staff_id = current_user.id
    issued = issue_bill(db, bill)
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
    current_user: StaffUser = Depends(_payment_record_roles),
    db: Session = Depends(get_db),
):
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.bill_number == bill_number,
    ).first()

    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")

    paid = confirm_counter_payment(db, bill, current_user, payload.method)
    db.commit()
    event_channels = [
        restaurant_channel(current_user.restaurant_id, "operations"),
        restaurant_channel(current_user.restaurant_id, "staff"),
        session_channel(paid.dining_session.public_token),
        table_channel(current_user.restaurant_id, paid.dining_session.table_id),
    ]
    publish_event(
        EVENT_BILL_PAYMENT_RECORDED,
        restaurant_id=current_user.restaurant_id,
        channels=event_channels,
        resource_id=paid.id,
        state={"bill_number": paid.bill_number, "status": paid.status},
    )
    publish_event(
        EVENT_BILL_PAID,
        restaurant_id=current_user.restaurant_id,
        channels=event_channels,
        resource_id=paid.id,
        state={"bill_number": paid.bill_number, "status": paid.status},
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
    publish_event(
        EVENT_TABLE_STATUS_CHANGED,
        restaurant_id=current_user.restaurant_id,
        channels=event_channels,
        resource_id=paid.dining_session.table_id,
        state={"status": "free"},
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
