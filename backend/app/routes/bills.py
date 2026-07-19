from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.staff_user import StaffUser
from app.schemas.bill import BillResponse, CounterPaymentRequest
from app.services.bills import (
    build_bill_response,
    confirm_counter_payment,
    create_or_refresh_bill_for_session,
    issue_bill,
    request_pay_at_counter,
)
from app.utils.auth import RoleChecker
from app.services.realtime import (
    EVENT_BILL_GENERATED,
    EVENT_BILL_PAID,
    EVENT_BILL_UPDATED,
    EVENT_PAYMENT_ASSISTANCE_REQUESTED,
    EVENT_SESSION_CLOSED,
    publish_event,
    restaurant_channel,
    session_channel,
    table_channel,
)


router = APIRouter()

_bill_issue_roles = RoleChecker(["owner", "admin", "staff"])
_payment_record_roles = RoleChecker(["owner", "admin", "staff"])


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
    dining_session = db.query(DiningSession).filter(
        DiningSession.public_token == session_token
    ).first()

    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

    bill = request_pay_at_counter(db, dining_session, payload.method)
    db.commit()
    publish_event(
        EVENT_BILL_UPDATED,
        restaurant_id=dining_session.restaurant_id,
        channels=[
            restaurant_channel(dining_session.restaurant_id, "operations"),
            restaurant_channel(dining_session.restaurant_id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(dining_session.restaurant_id, dining_session.table_id),
        ],
        resource_id=bill.id,
        state={"bill_number": bill.bill_number, "status": bill.status, "payment_method": bill.payment_method},
    )
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
    publish_event(
        EVENT_BILL_PAID,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(paid.dining_session.public_token),
            table_channel(current_user.restaurant_id, paid.dining_session.table_id),
        ],
        resource_id=paid.id,
        state={"bill_number": paid.bill_number, "status": paid.status, "payment_method": paid.payment_method},
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
    return build_bill_response(db, paid)


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

    dining_session = bill.dining_session
    publish_event(
        EVENT_PAYMENT_ASSISTANCE_REQUESTED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(current_user.restaurant_id, dining_session.table_id),
        ],
        resource_id=bill.id,
        state={
            "bill_number": bill.bill_number,
            "status": bill.status,
            "table_id": dining_session.table_id,
            "session_token": dining_session.public_token,
            "requested_by_staff_id": current_user.id,
        },
    )
    return build_bill_response(db, bill)
