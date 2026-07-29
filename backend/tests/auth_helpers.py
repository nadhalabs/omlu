import secrets

from app.database import SessionLocal
from app.models.staff_user import StaffSession, StaffUser
from app.utils.auth import create_access_token as _create_access_token


def create_session_access_token(data: dict, expires_delta=None, *, db=None) -> str:
    """Create a JWT plus its authoritative StaffSession for route tests."""
    claims = dict(data)
    jti = claims.get("jti") or secrets.token_urlsafe(24)
    claims["jti"] = jti
    owns_session = db is None
    if owns_session:
        db = SessionLocal()
    try:
        staff = db.query(StaffUser).filter(StaffUser.id == int(claims["sub"])).first()
        if staff:
            claims["restaurant_id"] = staff.restaurant_id
            claims["security_version"] = staff.security_version or 0
            claims["session_required"] = True
            db.add(
                StaffSession(
                    staff_user_id=staff.id,
                    restaurant_id=staff.restaurant_id,
                    token_jti=jti,
                    status="active",
                )
            )
            db.commit()
    finally:
        if owns_session:
            db.close()
    return _create_access_token(claims, expires_delta=expires_delta)
