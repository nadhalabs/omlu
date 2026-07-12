import datetime
import json
import logging
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.staff_user import AuditLog, StaffUser
from app.schemas.registration import (
    RestaurantRegistrationRequest,
    RestaurantRegistrationResponse,
)
from app.utils.auth import hash_password, normalize_email, normalize_identifier


router = APIRouter(prefix="/public/restaurants")
logger = logging.getLogger("nadha_serve.registration")

# Public registration rate limiter: max 5 attempts per 30 minutes per IP.
registration_attempts = defaultdict(list)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "127.0.0.1"


def _check_registration_rate_limit(client_ip: str) -> bool:
    now = time.time()
    registration_attempts[client_ip] = [
        attempt for attempt in registration_attempts[client_ip] if now - attempt < 1800
    ]
    if len(registration_attempts[client_ip]) >= 5:
        return False
    registration_attempts[client_ip].append(now)
    return True


def reset_registration_rate_limit() -> None:
    registration_attempts.clear()


@router.post("/register", response_model=RestaurantRegistrationResponse, status_code=status.HTTP_201_CREATED)
def register_restaurant(
    body: RestaurantRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = _client_ip(request)
    if not _check_registration_rate_limit(client_ip):
        logger.warning("registration_rate_limited ip=%s", client_ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later.",
        )

    restaurant_slug = normalize_identifier(body.restaurant_slug)
    owner_username = normalize_identifier(body.owner_username)
    contact_email = normalize_email(body.contact_email)
    owner_email = normalize_email(body.owner_email)
    now = datetime.datetime.now(datetime.timezone.utc)

    try:
        existing_restaurant = db.query(Restaurant).filter(
            func.lower(Restaurant.slug) == restaurant_slug
        ).first()
        if existing_restaurant:
            logger.info("registration_duplicate_restaurant_slug slug=%s ip=%s", restaurant_slug, client_ip)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Restaurant username is already taken.",
            )

        restaurant = Restaurant(
            name=body.restaurant_name,
            slug=restaurant_slug,
            contact_email=contact_email,
            phone_number=body.phone_number,
            city=body.city,
            is_active=True,
            timezone="Asia/Kolkata",
            currency="INR",
            order_prefix="NS",
            service_requests_enabled=True,
            plan="free_pilot",
            subscription_status="active",
            trial_started_at=now,
            trial_ends_at=None,
        )
        db.add(restaurant)
        db.flush()

        duplicate_owner = db.query(StaffUser).filter(
            StaffUser.restaurant_id == restaurant.id,
            or_(
                func.lower(StaffUser.username) == owner_username,
                func.lower(StaffUser.email) == owner_email,
            ),
        ).first()
        if duplicate_owner:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Owner username or email is already in use for this restaurant.",
            )

        owner = StaffUser(
            restaurant_id=restaurant.id,
            name=body.owner_full_name,
            username=owner_username,
            email=owner_email,
            password_hash=hash_password(body.password),
            role="owner",
            status="active",
            is_active=True,
            must_change_password=False,
        )
        db.add(owner)
        db.flush()

        db.add(AuditLog(
            restaurant_id=restaurant.id,
            actor_user_id=owner.id,
            actor_role="owner",
            target_type="restaurant",
            target_id=str(restaurant.id),
            action="restaurant_self_registered",
            new_value=json.dumps({
                "slug": restaurant.slug,
                "plan": restaurant.plan,
                "subscription_status": restaurant.subscription_status,
                "city": body.city,
                "contact_email": contact_email,
                "owner_username": owner.username,
            }),
            ip_address=client_ip,
        ))
        db.commit()
        return {
            "success": True,
            "restaurant_slug": restaurant.slug,
            "next_path": "/admin/setup",
        }
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        logger.info("registration_integrity_failure slug=%s ip=%s", restaurant_slug, client_ip)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Restaurant username or owner credentials are already in use.",
        )
    except Exception:
        db.rollback()
        logger.exception("registration_failed slug=%s ip=%s", restaurant_slug, client_ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. No account was created.",
        )
