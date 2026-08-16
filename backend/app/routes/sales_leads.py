import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.sales_lead import SalesLead
from app.schemas.sales_lead import SalesLeadRequest, SalesLeadResponse


router = APIRouter(prefix="/public/sales-leads")
logger = logging.getLogger("nadha_serve.sales_leads")

# Public enquiry protection: at most 5 submissions per phone/client pair in 30 minutes.
lead_attempts: dict[str, list[float]] = defaultdict(list)


def _rate_limit_key(request: Request, phone: str) -> str:
    client_ip = request.client.host if request.client else "127.0.0.1"
    return f"{client_ip}:{phone}"


def check_sales_lead_rate_limit(key: str) -> bool:
    now = time.time()
    lead_attempts[key] = [attempt for attempt in lead_attempts[key] if now - attempt < 1800]
    if len(lead_attempts[key]) >= 5:
        return False
    lead_attempts[key].append(now)
    if len(lead_attempts) > 500:
        stale = [candidate for candidate, attempts in lead_attempts.items() if not attempts or all(now - item >= 1800 for item in attempts)]
        for candidate in stale:
            lead_attempts.pop(candidate, None)
    return True


def reset_sales_lead_rate_limit() -> None:
    lead_attempts.clear()


@router.post("", response_model=SalesLeadResponse, status_code=status.HTTP_201_CREATED)
def create_sales_lead(body: SalesLeadRequest, request: Request, db: Session = Depends(get_db)):
    key = _rate_limit_key(request, body.phone)
    if not check_sales_lead_rate_limit(key):
        logger.warning("sales_lead_rate_limited")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )

    lead = SalesLead(
        name=body.name,
        phone=body.phone,
        email=body.email,
        restaurant_name=body.restaurant_name,
        city=body.city,
        number_of_outlets=body.number_of_outlets,
        selected_plan=body.selected_plan,
        request_type=body.request_type,
        status="new",
    )
    try:
        db.add(lead)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("sales_lead_creation_failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="We could not save your request. Please try again.",
        )
    return SalesLeadResponse()
