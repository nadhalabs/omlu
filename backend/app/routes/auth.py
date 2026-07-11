from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.config import settings
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.schemas.auth import StaffLoginRequest, StaffLoginResponse, CurrentStaffResponse
from app.utils.auth import (
    normalize_email,
    verify_password,
    create_access_token,
    get_current_staff_user,
)
import datetime
import time
from collections import defaultdict

router = APIRouter(prefix="/auth/staff")

# Simple login rate limiter: max 10 attempts per 5 minutes per IP
login_attempts = defaultdict(list)


def check_login_rate_limit(client_ip: str) -> bool:
    now = time.time()
    login_attempts[client_ip] = [t for t in login_attempts[client_ip] if now - t < 300]
    if len(login_attempts[client_ip]) >= 10:
        return False
    login_attempts[client_ip].append(now)
    return True


def reset_login_rate_limit() -> None:
    login_attempts.clear()



@router.post("/login", response_model=StaffLoginResponse)
def staff_login(
    login_req: StaffLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    # 0. Rate limiting check
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_login_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later."
        )

    email_normalized = normalize_email(login_req.email)
    
    # 1. Find restaurant by slug
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == login_req.restaurant_slug
    ).first()

    if not restaurant or not restaurant.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid restaurant credentials, email or password"
        )

    # 2. Find staff user by email and restaurant ID
    staff = db.query(StaffUser).filter(
        StaffUser.restaurant_id == restaurant.id,
        StaffUser.email == email_normalized
    ).first()

    if not staff or not staff.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid restaurant credentials, email or password"
        )

    # 3. Verify password
    if not verify_password(login_req.password, staff.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid restaurant credentials, email or password"
        )

    # 4. Update last login timestamp
    staff.last_login_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()

    # 5. Create JWT Access Token
    token_claims = {
        "sub": str(staff.id),
        "restaurant_id": staff.restaurant_id,
        "role": staff.role
    }
    
    expires_in_seconds = settings.jwt_access_token_minutes * 60
    access_token = create_access_token(data=token_claims)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in_seconds,
        "staff": {
            "name": staff.name,
            "email": staff.email,
            "role": staff.role,
            "restaurant_name": restaurant.name,
            "restaurant_slug": restaurant.slug
        }
    }


@router.get("/me", response_model=CurrentStaffResponse)
def get_me(
    current_user: StaffUser = Depends(get_current_staff_user)
):
    return {
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
        "restaurant_name": current_user.restaurant.name,
        "restaurant_slug": current_user.restaurant.slug
    }
