import jwt
import datetime
import uuid
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.database import get_db
from app.config import settings
from app.models.staff_user import AuditLog, StaffSession, StaffUser

security_scheme = HTTPBearer(auto_error=False)
ph = PasswordHasher()

def normalize_email(email: str) -> str:
    return email.strip().lower()

def normalize_identifier(identifier: str) -> str:
    return identifier.strip().lower()

def normalize_restaurant_slug(slug: str) -> str:
    return slug.strip().lower()

def hash_password(password: str) -> str:
    return ph.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except VerifyMismatchError:
        return False

def create_access_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.now(datetime.timezone.utc) + expires_delta
    else:
        expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=settings.jwt_access_token_minutes)
    
    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(datetime.datetime.now(datetime.timezone.utc).timestamp()),
        "jti": to_encode.get("jti") or uuid.uuid4().hex,
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def _load_current_staff_user(
    credentials: Optional[HTTPAuthorizationCredentials],
    db: Session,
    *,
    allow_password_change: bool = False,
) -> StaffUser:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization credentials missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    staff_id = payload.get("sub")
    restaurant_id = payload.get("restaurant_id")

    if not staff_id or not restaurant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Load record from database (do not trust JWT claims alone!)
    staff = db.query(StaffUser).options(joinedload(StaffUser.restaurant)).filter(
        StaffUser.id == int(staff_id),
        StaffUser.restaurant_id == int(restaurant_id)
    ).first()

    if not staff:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff member not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not staff.is_active or staff.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff member is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not staff.restaurant or not staff.restaurant.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Restaurant is inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_security_version = payload.get("security_version", 0)
    if int(token_security_version) != int(staff.security_version or 0):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff security credentials have changed",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_jti = payload.get("jti")
    session_required = bool(payload.get("session_required"))
    if session_required and not token_jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session claim missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    session = None
    if token_jti:
        session = db.query(StaffSession).filter(
            StaffSession.token_jti == token_jti,
            StaffSession.staff_user_id == staff.id,
            StaffSession.restaurant_id == staff.restaurant_id,
        ).first()
    if session_required and (not session or session.status != "active"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Staff session has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if staff.role in {"owner", "admin"} and staff.must_change_password and not allow_password_change:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required before accessing this resource",
        )

    if session:
        session.last_active_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
    return staff


def get_current_staff_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> StaffUser:
    return _load_current_staff_user(credentials, db)


def get_current_staff_user_for_password_change(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db)
) -> StaffUser:
    return _load_current_staff_user(credentials, db, allow_password_change=True)


class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: StaffUser = Depends(get_current_staff_user)):
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for this role"
            )
        return current_user


class OperationalWriteChecker(RoleChecker):
    """Role check plus authoritative restaurant/staff write-lock enforcement."""

    def __call__(
        self,
        current_user: StaffUser = Depends(get_current_staff_user),
        db: Session = Depends(get_db),
    ):
        super().__call__(current_user)
        if current_user.role != "staff":
            return current_user
        restaurant = current_user.restaurant
        locked = bool(
            current_user.operations_locked
            or restaurant.staff_operations_locked
            or restaurant.operating_status == "closed"
        )
        if not locked:
            return current_user
        reason = (
            "individual_account_lock" if current_user.operations_locked
            else "restaurant_closed" if restaurant.operating_status == "closed"
            else "all_staff_lock"
        )
        db.add(AuditLog(
            restaurant_id=current_user.restaurant_id,
            actor_user_id=current_user.id,
            actor_role=current_user.role,
            target_type="staff_operations",
            target_id=str(current_user.id),
            action="staff_locked_action_blocked",
            new_value=f'{{"reason":"{reason}"}}',
        ))
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff operations are currently locked. Contact the restaurant owner or administrator.",
        )
