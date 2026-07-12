import datetime
import json
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.staff_user import AuditLog, StaffSession, StaffUser
from app.schemas.staff_management import (
    StaffAccountCreate,
    StaffAccountResponse,
    StaffAccountUpdate,
    StaffPasswordReset,
    StaffSessionResponse,
)
from app.utils.auth import RoleChecker, hash_password, normalize_email, normalize_identifier


router = APIRouter(prefix="/admin/staff")
_owner_admin = RoleChecker(["owner", "admin"])

VALID_ROLES = {"owner", "admin", "staff", "kitchen"}
MANAGEABLE_ROLES = {"admin", "staff", "kitchen"}
VALID_STATUSES = {"invited", "pending", "active", "suspended", "removed"}
USERNAME_RE = re.compile(r"^[a-z0-9_-]+$")


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def _audit(
    db: Session,
    actor: StaffUser,
    request: Request,
    action: str,
    target: StaffUser,
    previous_value: dict | None = None,
    new_value: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            restaurant_id=actor.restaurant_id,
            actor_user_id=actor.id,
            actor_role=actor.role,
            target_type="staff_user",
            target_id=str(target.id),
            action=action,
            previous_value=json.dumps(previous_value) if previous_value is not None else None,
            new_value=json.dumps(new_value) if new_value is not None else None,
            ip_address=_client_ip(request),
        )
    )


def _serialize_staff(staff: StaffUser, sessions: list[StaffSession] | None = None) -> StaffAccountResponse:
    sessions = sessions or []
    active_sessions = [s for s in sessions if s.status == "active"]
    last_active = staff.last_login_at
    if active_sessions:
        last_active = max(s.last_active_at for s in active_sessions)
    return StaffAccountResponse(
        id=staff.id,
        name=staff.name,
        username=staff.username,
        email=staff.email,
        role=staff.role,
        status=staff.status,
        is_active=staff.is_active,
        must_change_password=staff.must_change_password,
        last_active_at=last_active,
        created_at=staff.created_at,
        added_by_staff_id=staff.added_by_staff_id,
        active_session_count=len(active_sessions),
        sessions=[
            StaffSessionResponse(
                id=s.id,
                device=s.device,
                ip_address=s.ip_address,
                login_at=s.login_at,
                last_active_at=s.last_active_at,
                status=s.status,
            )
            for s in sessions
        ],
    )


def _assert_can_manage(actor: StaffUser, target: StaffUser) -> None:
    if target.restaurant_id != actor.restaurant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")
    if target.role == "owner" and actor.id != target.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="The owner account cannot be managed by admins")
    if actor.role == "admin" and target.role == "admin" and actor.id != target.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins cannot manage other admins")


def _revoke_sessions(db: Session, target: StaffUser, actor: StaffUser) -> int:
    now = datetime.datetime.now(datetime.timezone.utc)
    sessions = db.query(StaffSession).filter(
        StaffSession.staff_user_id == target.id,
        StaffSession.restaurant_id == actor.restaurant_id,
        StaffSession.status == "active",
    ).all()
    for session in sessions:
        session.status = "revoked"
        session.revoked_at = now
        session.revoked_by_staff_id = actor.id
    return len(sessions)


@router.get("", response_model=List[StaffAccountResponse])
def list_staff_accounts(
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    staff_members = db.query(StaffUser).filter(
        StaffUser.restaurant_id == current_user.restaurant_id,
        StaffUser.status != "removed",
    ).order_by(StaffUser.created_at.asc(), StaffUser.id.asc()).all()
    staff_ids = [staff.id for staff in staff_members]
    sessions_by_user: dict[int, list[StaffSession]] = {staff_id: [] for staff_id in staff_ids}
    if staff_ids:
        for session in db.query(StaffSession).filter(
            StaffSession.restaurant_id == current_user.restaurant_id,
            StaffSession.staff_user_id.in_(staff_ids),
        ).order_by(StaffSession.last_active_at.desc()).all():
            sessions_by_user.setdefault(session.staff_user_id, []).append(session)
    return [_serialize_staff(staff, sessions_by_user.get(staff.id, [])) for staff in staff_members]


@router.post("", response_model=StaffAccountResponse, status_code=status.HTTP_201_CREATED)
def create_staff_account(
    body: StaffAccountCreate,
    request: Request,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    role = body.role.strip().lower()
    if role not in MANAGEABLE_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role for staff account creation")
    if current_user.role == "admin" and role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins cannot create admin accounts")

    username = normalize_identifier(body.username)
    if not USERNAME_RE.match(username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username must use lowercase letters, numbers, hyphens, or underscores")
    email = normalize_email(body.email)

    existing = db.query(StaffUser).filter(
        StaffUser.restaurant_id == current_user.restaurant_id,
        or_(StaffUser.username == username, StaffUser.email == email),
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A staff account with that username or email already exists")

    staff = StaffUser(
        restaurant_id=current_user.restaurant_id,
        name=body.name.strip(),
        username=username,
        email=email,
        password_hash=hash_password(body.temporary_password),
        role=role,
        status="active",
        is_active=True,
        must_change_password=True,
        added_by_staff_id=current_user.id,
    )
    db.add(staff)
    db.flush()
    _audit(db, current_user, request, "user_created", staff, new_value={"role": role, "status": "active"})
    db.commit()
    db.refresh(staff)
    return _serialize_staff(staff, [])


@router.patch("/{staff_id}", response_model=StaffAccountResponse)
def update_staff_account(
    staff_id: int,
    body: StaffAccountUpdate,
    request: Request,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    target = db.query(StaffUser).filter(
        StaffUser.id == staff_id,
        StaffUser.restaurant_id == current_user.restaurant_id,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")
    _assert_can_manage(current_user, target)

    previous = {"role": target.role, "status": target.status, "is_active": target.is_active}
    action = "user_updated"

    if body.role is not None:
        role = body.role.strip().lower()
        if role not in VALID_ROLES or role == "owner":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role change")
        if current_user.role == "admin" and role == "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins cannot create or manage admin accounts")
        if target.role != role:
            target.role = role
            target.security_version = (target.security_version or 0) + 1
            _revoke_sessions(db, target, current_user)
            action = "role_changed"

    if body.status is not None:
        new_status = body.status.strip().lower()
        if new_status not in VALID_STATUSES:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        if target.role == "owner" and new_status != "active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner account cannot be disabled or removed")
        target.status = new_status
        target.is_active = new_status == "active"
        if new_status in {"suspended", "removed"}:
            target.disabled_at = datetime.datetime.now(datetime.timezone.utc)
            target.disabled_by_staff_id = current_user.id
            target.disabled_reason = body.reason
            target.security_version = (target.security_version or 0) + 1
            _revoke_sessions(db, target, current_user)
            action = "user_removed" if new_status == "removed" else "user_suspended"
        elif new_status == "active":
            target.disabled_at = None
            target.disabled_by_staff_id = None
            target.disabled_reason = None
            action = "user_reactivated"

    _audit(
        db,
        current_user,
        request,
        action,
        target,
        previous_value=previous,
        new_value={"role": target.role, "status": target.status, "is_active": target.is_active},
    )
    db.commit()
    db.refresh(target)
    sessions = db.query(StaffSession).filter(StaffSession.staff_user_id == target.id).all()
    return _serialize_staff(target, sessions)


@router.post("/{staff_id}/reset-password", response_model=StaffAccountResponse)
def reset_staff_password(
    staff_id: int,
    body: StaffPasswordReset,
    request: Request,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    target = db.query(StaffUser).filter(
        StaffUser.id == staff_id,
        StaffUser.restaurant_id == current_user.restaurant_id,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")
    _assert_can_manage(current_user, target)
    if target.role == "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner password cannot be reset from staff management")
    target.password_hash = hash_password(body.temporary_password)
    target.must_change_password = True
    target.security_version = (target.security_version or 0) + 1
    _revoke_sessions(db, target, current_user)
    _audit(db, current_user, request, "password_reset_initiated", target)
    db.commit()
    db.refresh(target)
    return _serialize_staff(target, [])


@router.post("/{staff_id}/sessions/revoke", response_model=StaffAccountResponse)
def revoke_staff_sessions(
    staff_id: int,
    request: Request,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    target = db.query(StaffUser).filter(
        StaffUser.id == staff_id,
        StaffUser.restaurant_id == current_user.restaurant_id,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")
    _assert_can_manage(current_user, target)
    revoked = _revoke_sessions(db, target, current_user)
    _audit(db, current_user, request, "active_sessions_revoked", target, new_value={"revoked": revoked})
    db.commit()
    db.refresh(target)
    sessions = db.query(StaffSession).filter(StaffSession.staff_user_id == target.id).all()
    return _serialize_staff(target, sessions)


@router.delete("/{staff_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_staff_access(
    staff_id: int,
    request: Request,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    target = db.query(StaffUser).filter(
        StaffUser.id == staff_id,
        StaffUser.restaurant_id == current_user.restaurant_id,
    ).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")
    _assert_can_manage(current_user, target)
    if target.role == "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner account cannot be removed")
    previous = {"role": target.role, "status": target.status}
    target.status = "removed"
    target.is_active = False
    target.disabled_at = datetime.datetime.now(datetime.timezone.utc)
    target.disabled_by_staff_id = current_user.id
    _revoke_sessions(db, target, current_user)
    _audit(db, current_user, request, "user_removed", target, previous_value=previous)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
