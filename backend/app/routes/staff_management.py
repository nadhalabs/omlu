import datetime
import json
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.order import Order
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffSession, StaffUser
from app.schemas.staff_management import (
    StaffAccountCreate,
    StaffAccountResponse,
    StaffAccountUpdate,
    StaffPasswordReset,
    StaffSessionResponse,
    StaffLockRequest,
    StaffOperationsResponse,
    RestaurantStatusRequest,
)
from app.services.realtime import (
    EVENT_RESTAURANT_STATUS_CHANGED, EVENT_STAFF_ALL_LOCKED, EVENT_STAFF_ALL_UNLOCKED,
    EVENT_STAFF_LOCKED, EVENT_STAFF_UNLOCKED, publish_event, restaurant_channel,
)
from app.utils.auth import RoleChecker, hash_password
from app.utils.validation import (
    field_error,
    validate_email,
    validate_owner_name,
    validate_password,
    validate_personal_username,
)


router = APIRouter(prefix="/admin/staff")
_owner_admin = RoleChecker(["owner", "admin"])

VALID_ROLES = {"owner", "admin", "staff", "kitchen"}
MANAGEABLE_ROLES = {"admin", "staff", "kitchen"}
VALID_STATUSES = {"invited", "pending", "active", "suspended", "removed"}


def _validate_managed_credential(value: str, role: str, *, field: str = "temporary_password", **password_context) -> None:
    if role in {"staff", "kitchen"}:
        if len(value) != 6 or not value.isascii() or not value.isdigit():
            field_error(field, "PIN must be exactly 6 digits", status.HTTP_400_BAD_REQUEST)
        return
    validate_password(value, field=field, **password_context)


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


def _serialize_staff(staff: StaffUser, sessions: list[StaffSession] | None = None, locker_name: str | None = None) -> StaffAccountResponse:
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
        operations_locked=staff.operations_locked,
        operations_locked_at=staff.operations_locked_at,
        operations_locked_by_id=staff.operations_locked_by_id,
        operations_locked_by_name=locker_name,
        operations_lock_reason=staff.operations_lock_reason,
    )


def _operations_state(db: Session, actor: StaffUser) -> StaffOperationsResponse:
    restaurant = actor.restaurant
    locker = db.query(StaffUser).filter(StaffUser.id == restaurant.staff_locked_by_id).first() if restaurant.staff_locked_by_id else None
    return StaffOperationsResponse(
        locked=restaurant.staff_operations_locked, locked_at=restaurant.staff_locked_at,
        locked_by_id=restaurant.staff_locked_by_id, locked_by_name=locker.name if locker else None,
        reason=restaurant.staff_lock_reason, operating_status=restaurant.operating_status,
        active_sessions=db.query(DiningSession).filter(DiningSession.restaurant_id == actor.restaurant_id, DiningSession.status.in_(["open", "bill_requested", "payment_pending"])).count(),
        unserved_orders=db.query(Order).filter(Order.restaurant_id == actor.restaurant_id, Order.status.in_(["pending", "accepted", "preparing", "ready"])).count(),
        pending_requests=db.query(ServiceRequest).filter(ServiceRequest.restaurant_id == actor.restaurant_id, ServiceRequest.status == "pending").count(),
        bills_waiting_for_payment=db.query(Bill).filter(Bill.restaurant_id == actor.restaurant_id, Bill.status.in_(["issued", "payment_pending"])).count(),
        occupied_tables=db.query(DiningSession.table_id).filter(DiningSession.restaurant_id == actor.restaurant_id, DiningSession.status.in_(["open", "bill_requested", "payment_pending"])).distinct().count(),
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
    names = {s.id: s.name for s in staff_members}
    return [_serialize_staff(staff, sessions_by_user.get(staff.id, []), names.get(staff.operations_locked_by_id)) for staff in staff_members]


@router.get("/operations", response_model=StaffOperationsResponse)
def get_staff_operations(current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    return _operations_state(db, current_user)


@router.post("/operations/lock", response_model=StaffOperationsResponse)
def lock_all_staff(body: StaffLockRequest, request: Request, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    state = _operations_state(db, current_user)
    if not body.confirm_active_operations and any([state.active_sessions, state.unserved_orders, state.pending_requests, state.bills_waiting_for_payment, state.occupied_tables]):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"message": "Active restaurant operations require explicit confirmation.", "operations": state.model_dump(mode="json")})
    now = datetime.datetime.now(datetime.timezone.utc)
    restaurant = current_user.restaurant
    restaurant.staff_operations_locked = True; restaurant.staff_locked_by_id = current_user.id; restaurant.staff_locked_at = now; restaurant.staff_lock_reason = body.reason
    _audit(db, current_user, request, "all_staff_locked", current_user, new_value={"reason": body.reason})
    db.commit()
    publish_event(EVENT_STAFF_ALL_LOCKED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "staff"), restaurant_channel(current_user.restaurant_id, "operations")], resource_id=current_user.restaurant_id, state={"locked_by": current_user.name, "locked_at": now.isoformat(), "reason": body.reason})
    return _operations_state(db, current_user)


@router.post("/operations/unlock", response_model=StaffOperationsResponse)
def unlock_all_staff(request: Request, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    now = datetime.datetime.now(datetime.timezone.utc); restaurant = current_user.restaurant
    restaurant.staff_operations_locked = False; restaurant.staff_unlocked_by_id = current_user.id; restaurant.staff_unlocked_at = now
    _audit(db, current_user, request, "all_staff_unlocked", current_user)
    db.commit()
    publish_event(EVENT_STAFF_ALL_UNLOCKED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "staff"), restaurant_channel(current_user.restaurant_id, "operations")], resource_id=current_user.restaurant_id, state={"unlocked_by": current_user.name, "unlocked_at": now.isoformat()})
    return _operations_state(db, current_user)


@router.post("/operations/status", response_model=StaffOperationsResponse)
def change_restaurant_status(body: RestaurantStatusRequest, request: Request, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    new_status = body.status.strip().lower()
    if new_status not in {"open", "closing", "closed"}:
        raise HTTPException(status_code=400, detail="Status must be open, closing, or closed")
    previous = current_user.restaurant.operating_status
    current_user.restaurant.operating_status = new_status
    action = "restaurant_reopened" if new_status == "open" else f"restaurant_changed_to_{new_status}"
    _audit(db, current_user, request, action, current_user, previous_value={"status": previous}, new_value={"status": new_status})
    db.commit()
    publish_event(EVENT_RESTAURANT_STATUS_CHANGED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "staff"), restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "kitchen")], resource_id=current_user.restaurant_id, state={"status": new_status, "changed_by": current_user.name})
    return _operations_state(db, current_user)


@router.post("/{staff_id}/lock", response_model=StaffAccountResponse)
def lock_staff(staff_id: int, body: StaffLockRequest, request: Request, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    target = db.query(StaffUser).filter(StaffUser.id == staff_id, StaffUser.restaurant_id == current_user.restaurant_id, StaffUser.role == "staff").first()
    if not target: raise HTTPException(status_code=404, detail="Staff account not found")
    now = datetime.datetime.now(datetime.timezone.utc); target.operations_locked = True; target.operations_locked_at = now; target.operations_locked_by_id = current_user.id; target.operations_lock_reason = body.reason
    _audit(db, current_user, request, "staff_account_locked", target, new_value={"reason": body.reason}); db.commit(); db.refresh(target)
    publish_event(EVENT_STAFF_LOCKED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "staff")], resource_id=target.id, state={"staff_id": target.id, "locked_by": current_user.name, "locked_at": now.isoformat(), "reason": body.reason})
    return _serialize_staff(target, locker_name=current_user.name)


@router.post("/{staff_id}/unlock", response_model=StaffAccountResponse)
def unlock_staff(staff_id: int, request: Request, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    target = db.query(StaffUser).filter(StaffUser.id == staff_id, StaffUser.restaurant_id == current_user.restaurant_id, StaffUser.role == "staff").first()
    if not target: raise HTTPException(status_code=404, detail="Staff account not found")
    now = datetime.datetime.now(datetime.timezone.utc); target.operations_locked = False; target.operations_unlocked_at = now; target.operations_unlocked_by_id = current_user.id
    _audit(db, current_user, request, "staff_account_unlocked", target); db.commit(); db.refresh(target)
    publish_event(EVENT_STAFF_UNLOCKED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "staff")], resource_id=target.id, state={"staff_id": target.id, "unlocked_by": current_user.name, "unlocked_at": now.isoformat()})
    return _serialize_staff(target)


@router.post("", response_model=StaffAccountResponse, status_code=status.HTTP_201_CREATED)
def create_staff_account(
    body: StaffAccountCreate,
    request: Request,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    role = body.role.strip().lower()
    if role not in MANAGEABLE_ROLES:
        field_error("role", "Invalid role for staff account creation", status.HTTP_400_BAD_REQUEST)
    if current_user.role == "admin" and role == "admin":
        field_error("role", "Admins cannot create admin accounts", status.HTTP_403_FORBIDDEN)

    name = validate_owner_name(body.name)
    username = validate_personal_username(body.username, field="username")
    email = None
    if role == "admin":
        if not body.email:
            field_error("email", "Email is required for Admin accounts")
        email = validate_email(body.email, "email", "Enter a valid email address.")
    credential = (body.pin or body.temporary_password) if role in {"staff", "kitchen"} else body.temporary_password
    credential_field = "pin" if role in {"staff", "kitchen"} else "temporary_password"
    if not credential:
        field_error(credential_field, "PIN is required" if credential_field == "pin" else "Temporary password is required")
    if role in {"staff", "kitchen"} and body.pin is not None and body.confirm_pin != body.pin:
        field_error("confirm_pin", "PINs do not match")
    _validate_managed_credential(
        credential,
        role,
        field=credential_field,
        restaurant_username=current_user.restaurant.slug if current_user.restaurant else None,
        personal_username=username,
    )

    existing = db.query(StaffUser).filter(
        StaffUser.restaurant_id == current_user.restaurant_id,
        or_(StaffUser.username == username, *([StaffUser.email == email] if email else [])),
    ).first()
    if existing:
        field = "email" if email and existing.email == email else "username"
        field_error(field, "A staff account with that username or email already exists", status.HTTP_409_CONFLICT)

    staff = StaffUser(
        restaurant_id=current_user.restaurant_id,
        name=name,
        username=username,
        email=email,
        password_hash=hash_password(credential),
        role=role,
        status="active",
        is_active=True,
        must_change_password=role == "admin",
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
    _validate_managed_credential(
        body.temporary_password,
        target.role,
        field="temporary_password",
        restaurant_username=current_user.restaurant.slug if current_user.restaurant else None,
        personal_username=target.username,
    )
    target.password_hash = hash_password(body.temporary_password)
    target.must_change_password = target.role == "admin"
    target.security_version = (target.security_version or 0) + 1
    _revoke_sessions(db, target, current_user)
    _audit(db, current_user, request, "pin_reset" if target.role in {"staff", "kitchen"} else "password_reset_initiated", target)
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
