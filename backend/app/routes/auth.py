from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.database import get_db
from app.config import settings
from app.models.restaurant import Restaurant
from app.models.staff_user import AuditLog, StaffSession, StaffUser
from app.schemas.auth import (
    CurrentStaffResponse,
    StaffLoginRequest,
    StaffLoginResponse,
    StaffPasswordChangeRequest,
    StaffPasswordChangeResponse,
)
from app.utils.auth import (
    decode_access_token,
    normalize_email,
    normalize_identifier,
    normalize_restaurant_slug,
    hash_password,
    verify_password,
    create_access_token,
    get_current_staff_user,
    get_current_staff_user_for_password_change,
    security_scheme,
)
from app.utils.validation import field_error, validate_password
import datetime
import time
import secrets
import json
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


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "127.0.0.1"


def _audit(db: Session, staff: StaffUser, request: Request, action: str, previous_value=None, new_value=None) -> None:
    db.add(AuditLog(
        restaurant_id=staff.restaurant_id,
        actor_user_id=staff.id,
        actor_role=staff.role,
        target_type="staff_user",
        target_id=str(staff.id),
        action=action,
        previous_value=json.dumps(previous_value) if previous_value is not None else None,
        new_value=json.dumps(new_value) if new_value is not None else None,
        ip_address=_client_ip(request),
    ))


def _staff_payload(staff: StaffUser, restaurant: Restaurant) -> dict:
    return {
        "name": staff.name,
        "username": staff.username,
        "email": staff.email,
        "role": staff.role,
        "status": staff.status,
        "must_change_password": staff.must_change_password,
        "restaurant_name": restaurant.name,
        "restaurant_slug": restaurant.slug
    }


def _issue_session_token(staff: StaffUser, request: Request, db: Session) -> tuple[str, int]:
    now = datetime.datetime.now(datetime.timezone.utc)
    staff.last_login_at = now
    token_jti = secrets.token_urlsafe(24)
    db.add(StaffSession(
        staff_user_id=staff.id,
        restaurant_id=staff.restaurant_id,
        token_jti=token_jti,
        device=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
        status="active",
        login_at=now,
        last_active_at=now,
    ))
    token_claims = {
        "sub": str(staff.id),
        "restaurant_id": staff.restaurant_id,
        "role": staff.role,
        "jti": token_jti,
        "security_version": staff.security_version or 0,
        "session_required": True,
    }
    expires_in_seconds = settings.jwt_access_token_minutes * 60
    return create_access_token(data=token_claims), expires_in_seconds


def _revoke_sessions_for_staff(
    db: Session,
    staff: StaffUser,
    *,
    except_jti: str | None = None,
    revoked_by_staff_id: int | None = None,
) -> int:
    now = datetime.datetime.now(datetime.timezone.utc)
    query = db.query(StaffSession).filter(
        StaffSession.staff_user_id == staff.id,
        StaffSession.restaurant_id == staff.restaurant_id,
        StaffSession.status == "active",
    )
    if except_jti:
        query = query.filter(StaffSession.token_jti != except_jti)
    sessions = query.all()
    for session in sessions:
        session.status = "revoked"
        session.revoked_at = now
        session.revoked_by_staff_id = revoked_by_staff_id or staff.id
    return len(sessions)


@router.post("/login", response_model=StaffLoginResponse)
def staff_login(
    login_req: StaffLoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    # 0. Rate limiting check
    client_ip = _client_ip(request)
    if not check_login_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later."
        )

    login_normalized = normalize_identifier(login_req.login)
    restaurant_slug = normalize_restaurant_slug(login_req.restaurant_slug)
    if not restaurant_slug:
        field_error("restaurant_slug", "Restaurant username is required.")
    if not login_normalized:
        field_error("login", "Personal username or email is required.")
    if not login_req.password:
        field_error("password", "Password is required.")
    
    # 1. Find restaurant by slug
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == restaurant_slug
    ).first()

    if not restaurant or not restaurant.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid restaurant credentials, email or password"
        )

    # 2. Find staff user by email and restaurant ID
    staff = db.query(StaffUser).filter(
        StaffUser.restaurant_id == restaurant.id,
        or_(
            StaffUser.email == normalize_email(login_normalized),
            StaffUser.username == login_normalized,
        )
    ).first()

    valid_roles = {"owner", "admin", "staff", "kitchen"}
    if not staff or not staff.is_active or staff.status != "active" or staff.role not in valid_roles:
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

    # Staff and Kitchen use an owner-managed PIN and must never be blocked by
    # legacy first-login password-change flags.
    if staff.role in {"staff", "kitchen"} and staff.must_change_password:
        staff.must_change_password = False

    access_token, expires_in_seconds = _issue_session_token(staff, request, db)
    db.commit()

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in_seconds,
        "staff": _staff_payload(staff, restaurant)
    }


@router.get("/me", response_model=CurrentStaffResponse)
def get_me(
    current_user: StaffUser = Depends(get_current_staff_user_for_password_change)
):
    return _staff_payload(current_user, current_user.restaurant)


@router.post("/change-password", response_model=StaffPasswordChangeResponse)
def change_password(
    body: StaffPasswordChangeRequest,
    request: Request,
    current_user: StaffUser = Depends(get_current_staff_user_for_password_change),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        field_error("current_password", "Current password is incorrect", status.HTTP_400_BAD_REQUEST)
    if verify_password(body.new_password, current_user.password_hash):
        field_error("new_password", "New password must be different", status.HTTP_400_BAD_REQUEST)
    validate_password(
        body.new_password,
        field="new_password",
        restaurant_username=current_user.restaurant.slug if current_user.restaurant else None,
        personal_username=current_user.username,
    )

    current_user.password_hash = hash_password(body.new_password)
    previous_must_change = current_user.must_change_password
    current_user.must_change_password = False
    current_user.security_version = (current_user.security_version or 0) + 1
    _revoke_sessions_for_staff(db, current_user, revoked_by_staff_id=current_user.id)
    _audit(
        db,
        current_user,
        request,
        "password_changed",
        previous_value={"must_change_password": previous_must_change},
        new_value={"must_change_password": False},
    )
    access_token, expires_in_seconds = _issue_session_token(current_user, request, db)
    db.commit()
    db.refresh(current_user)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": expires_in_seconds,
        "staff": _staff_payload(current_user, current_user.restaurant),
    }


@router.post("/logout")
def logout(
    request: Request,
    credentials=Depends(security_scheme),
    current_user: StaffUser = Depends(get_current_staff_user_for_password_change),
    db: Session = Depends(get_db),
):
    payload = decode_access_token(credentials.credentials) if credentials else None
    token_jti = payload.get("jti") if payload else None
    if token_jti:
        session = db.query(StaffSession).filter(
            StaffSession.staff_user_id == current_user.id,
            StaffSession.restaurant_id == current_user.restaurant_id,
            StaffSession.token_jti == token_jti,
            StaffSession.status == "active",
        ).first()
        if session:
            session.status = "revoked"
            session.revoked_at = datetime.datetime.now(datetime.timezone.utc)
            session.revoked_by_staff_id = current_user.id
    _audit(db, current_user, request, "logout")
    db.commit()
    return {"success": True}
