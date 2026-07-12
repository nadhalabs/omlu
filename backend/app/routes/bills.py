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


router = APIRouter()

_bill_issue_roles = RoleChecker(["owner", "admin", "staff"])


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

    issued = issue_bill(db, bill)
    db.commit()
    return build_bill_response(db, issued)


@router.post(
    "/staff/bills/{bill_number}/confirm-counter-payment",
    response_model=BillResponse,
)
def confirm_staff_counter_payment(
    bill_number: str,
    payload: CounterPaymentRequest,
    current_user: StaffUser = Depends(_bill_issue_roles),
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
    return build_bill_response(db, paid)
