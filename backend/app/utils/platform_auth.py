import logging
import jwt
import datetime
import uuid
import secrets
import json
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal, get_db
from app.config import settings
from app.models.platform_user import PlatformUser, PlatformSession, PlatformAuditLog
from app.utils.auth import hash_password, verify_password, normalize_email, normalize_identifier

logger = logging.getLogger(__name__)

security_scheme = HTTPBearer(auto_error=False)

VALID_PLATFORM_ROLES = frozenset({"platform_owner", "platform_admin", "platform_support", "platform_readonly"})

ROLE_HIERARCHY = {
    "platform_owner": {"platform_owner", "platform_admin", "platform_support", "platform_readonly"},
    "platform_admin": {"platform_admin", "platform_support", "platform_readonly"},
    "platform_support": {"platform_support", "platform_readonly"},
    "platform_readonly": {"platform_readonly"},
}


@dataclass(frozen=True, slots=True)
class PlatformContext:
    actor: PlatformUser
    session: PlatformSession
    role: str

    def can_access(self, required_role: str) -> bool:
        allowed = ROLE_HIERARCHY.get(self.role, set())
        return required_role in allowed


def create_platform_token(data: dict, expires_delta: Optional[datetime.timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.datetime.now(datetime.timezone.utc) + expires_delta
    else:
        # Platform sessions have 8 hour lifetime
        expire = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)
    
    to_encode.update({
        "token_type": "platform",
        "exp": int(expire.timestamp()),
        "iat": int(datetime.datetime.now(datetime.timezone.utc).timestamp()),
        "jti": to_encode.get("jti") or secrets.token_urlsafe(24),
    })
    
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt


def decode_platform_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("token_type") != "platform":
            return None
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_platform_context(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> PlatformContext:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform authorization credentials missing",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_platform_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired platform access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    platform_user_id = payload.get("sub")
    token_jti = payload.get("jti")
    token_security_version = payload.get("security_version")

    if not platform_user_id or not token_jti:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed platform token claims",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        actor_id = int(platform_user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed platform user identity",
            headers={"WWW-Authenticate": "Bearer"},
        )

    platform_user = (
        db.query(PlatformUser)
        .filter(PlatformUser.id == actor_id)
        .first()
    )

    if not platform_user or not platform_user.is_active or platform_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform operator account is inactive or disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if platform_user.role not in VALID_PLATFORM_ROLES:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid platform operator role",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        version_matches = int(token_security_version) == int(platform_user.security_version or 0)
    except (TypeError, ValueError):
        version_matches = False

    if not version_matches:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform security credentials have been updated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    platform_session = (
        db.query(PlatformSession)
        .filter(
            PlatformSession.token_jti == token_jti,
            PlatformSession.platform_user_id == platform_user.id,
            PlatformSession.status == "active",
        )
        .first()
    )

    if not platform_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform session has been revoked or expired",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update session touch timestamp
    now = datetime.datetime.now(datetime.timezone.utc)
    platform_session.last_active_at = now
    try:
        with SessionLocal() as auth_db:
            auth_db.query(PlatformSession).filter(
                PlatformSession.id == platform_session.id
            ).update({PlatformSession.last_active_at: now}, synchronize_session=False)
            auth_db.commit()
    except Exception as e:
        logger.warning("Failed to persist platform session last_active_at: %s", e)

    return PlatformContext(actor=platform_user, session=platform_session, role=platform_user.role)


def require_platform_role(*required_roles: str):
    def role_dependency(ctx: PlatformContext = Depends(get_platform_context)) -> PlatformContext:
        if not any(ctx.can_access(role) for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Action requires one of platform roles: {', '.join(required_roles)}",
            )
        return ctx
    return role_dependency


def audit_platform_action(
    db: Session,
    ctx: PlatformContext,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    restaurant_id: Optional[int] = None,
    previous_value: Any = None,
    new_value: Any = None,
    ip_address: Optional[str] = None,
    request_id: Optional[str] = None,
) -> PlatformAuditLog:
    log_entry = PlatformAuditLog(
        actor_user_id=ctx.actor.id,
        actor_role=ctx.role,
        target_type=target_type,
        target_id=str(target_id) if target_id is not None else None,
        action=action,
        restaurant_id=restaurant_id,
        previous_value=json.dumps(previous_value) if previous_value is not None else None,
        new_value=json.dumps(new_value) if new_value is not None else None,
        ip_address=ip_address,
        request_id=request_id,
    )
    db.add(log_entry)
    db.commit()
    return log_entry
