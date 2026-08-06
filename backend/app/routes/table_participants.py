import datetime
import hmac
import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import AuditLog, StaffUser
from app.models.table_session_participant import TableSessionCreationAttempt, TableSessionJoinAttempt, TableSessionParticipant
from app.services.dining_sessions import create_session_safely, find_current_open_session_for_table
from app.services.realtime import EVENT_SESSION_UPDATED, publish_event, restaurant_channel, session_channel, table_channel
from app.services.table_participants import (
    authority_hash,
    create_participant,
    ensure_join_authority,
    join_code_digest,
    load_participant,
    participant_token_header,
    rotate_join_code,
)
from app.utils.auth import RoleChecker

router = APIRouter()
staff_roles = RoleChecker(["owner", "admin", "staff"])


def _utc(value: datetime.datetime) -> datetime.datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=datetime.timezone.utc)


class JoinRequest(BaseModel):
    code: str = Field(pattern=r"^\d{4}$")
    device_id: str | None = Field(default=None, max_length=200)


class RevokeRequest(BaseModel):
    reason: str = Field(default="Revoked by staff", min_length=1, max_length=300)


def _table(db: Session, slug: str, code: str):
    restaurant = db.query(Restaurant).filter(Restaurant.slug == slug, Restaurant.is_active == True).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")
    table = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant.id,
        RestaurantTable.table_code == code,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return restaurant, table


def _audit(db: Session, restaurant_id: int, action: str, session: DiningSession, details: dict, actor: StaffUser | None = None):
    db.add(AuditLog(
        restaurant_id=restaurant_id,
        actor_user_id=actor.id if actor else None,
        actor_role=actor.role if actor else "customer",
        target_type="dining_session",
        target_id=str(session.id),
        action=action,
        new_value=json.dumps({"table_id": session.table_id, "session_id": session.id, **details}),
    ))


def _check_creation_rate(db: Session, table: RestaurantTable, request: Request, device_id: str | None):
    now = datetime.datetime.now(datetime.timezone.utc)
    db.query(TableSessionCreationAttempt).filter(
        TableSessionCreationAttempt.table_id == table.id,
        TableSessionCreationAttempt.window_started_at < now - datetime.timedelta(hours=24),
    ).delete(synchronize_session=False)
    identity = f"{request.client.host if request.client else 'unknown'}:{device_id or 'none'}"
    identity_hash = authority_hash(f"session-create:{identity}")
    attempt = db.query(TableSessionCreationAttempt).filter(
        TableSessionCreationAttempt.table_id == table.id,
        TableSessionCreationAttempt.authority_hash == identity_hash,
    ).with_for_update().first()
    if not attempt:
        attempt = TableSessionCreationAttempt(
            table_id=table.id, authority_hash=identity_hash, window_started_at=now
        )
        db.add(attempt)
        db.flush()
    if attempt.blocked_until and _utc(attempt.blocked_until) > now:
        db.commit()
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait before trying again.")
    if now - _utc(attempt.window_started_at) >= datetime.timedelta(minutes=10):
        attempt.window_started_at = now
        attempt.attempt_count = 0
        attempt.blocked_until = None
    if attempt.attempt_count >= 5:
        attempt.blocked_until = _utc(attempt.window_started_at) + datetime.timedelta(minutes=10)
        db.commit()
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait before trying again.")
    attempt.attempt_count += 1


def _response(participant: TableSessionParticipant, token: str, session: DiningSession, join_code: str):
    count = sum(1 for value in session.participants if value.revoked_at is None)
    return {
        "participant_token": token,
        "participant": {
            "public_id": participant.public_id,
            "joined_at": participant.joined_at,
            "label": f"Device {participant.label_number}",
        },
        "session": {
            "public_id": session.public_token,
            "public_token": session.public_token,
            "table_number": session.table.table_number,
            "status": session.status,
        },
        "join_code": join_code,
        "participant_count": count,
    }


@router.get("/public/restaurants/{slug}/tables/{table_code}/session-status")
def table_session_status(slug: str, table_code: str, db: Session = Depends(get_db)):
    restaurant, table = _table(db, slug, table_code)
    session = find_current_open_session_for_table(db, table.id)
    return {"occupied": bool(session and session.restaurant_id == restaurant.id)}


@router.post("/public/restaurants/{slug}/tables/{table_code}/sessions", status_code=201)
def start_table_session(
    slug: str,
    table_code: str,
    request: Request,
    device_id: str | None = Header(None, alias="X-Device-ID"),
    db: Session = Depends(get_db),
):
    restaurant, table = _table(db, slug, table_code)
    locked_table = db.query(RestaurantTable).filter(RestaurantTable.id == table.id).with_for_update().one()
    existing = find_current_open_session_for_table(db, locked_table.id)
    if existing:
        raise HTTPException(status_code=409, detail="This table already has an active order. Enter the table join code.")
    _check_creation_rate(db, locked_table, request, device_id)
    session = create_session_safely(db, restaurant, locked_table)
    session = db.query(DiningSession).options(joinedload(DiningSession.table), joinedload(DiningSession.participants)).filter(DiningSession.id == session.id).one()
    join_code = ensure_join_authority(session)
    participant, token = create_participant(db, session, request.client.host if request.client else None, device_id)
    _audit(db, restaurant.id, "table_session_created", session, {"participant_public_id": participant.public_id})
    _audit(db, restaurant.id, "table_participant_joined", session, {"participant_public_id": participant.public_id})
    db.commit()
    db.refresh(participant)
    db.refresh(session)
    publish_event(
        EVENT_SESSION_UPDATED,
        restaurant_id=session.restaurant_id,
        channels=[session_channel(session.public_token)],
        resource_id=session.id,
        state={"participant_count": sum(1 for value in session.participants if value.revoked_at is None)},
    )
    return _response(participant, token, session, join_code)


def _check_join_rate(db: Session, session: DiningSession, request: Request, device_id: str | None):
    now = datetime.datetime.now(datetime.timezone.utc)
    db.query(TableSessionJoinAttempt).filter(
        TableSessionJoinAttempt.session_id == session.id,
        TableSessionJoinAttempt.window_started_at < now - datetime.timedelta(hours=24),
    ).delete(synchronize_session=False)
    identity = f"{request.client.host if request.client else 'unknown'}:{device_id or 'none'}"
    identity_hash = authority_hash(identity)
    attempt = db.query(TableSessionJoinAttempt).filter(
        TableSessionJoinAttempt.session_id == session.id,
        TableSessionJoinAttempt.authority_hash == identity_hash,
    ).with_for_update().first()
    if not attempt:
        attempt = TableSessionJoinAttempt(session_id=session.id, authority_hash=identity_hash, window_started_at=now)
        db.add(attempt)
        db.flush()
    if attempt.blocked_until and _utc(attempt.blocked_until) > now:
        _audit(db, session.restaurant_id, "table_participant_rate_limited", session, {"reason": "join_attempt_limit"})
        db.commit()
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait before trying again.")
    if now - _utc(attempt.window_started_at) >= datetime.timedelta(minutes=10):
        attempt.window_started_at = now
        attempt.failed_count = 0
        attempt.blocked_until = None
    return attempt


@router.post("/public/restaurants/{slug}/tables/{table_code}/join")
def join_table(slug: str, table_code: str, body: JoinRequest, request: Request, db: Session = Depends(get_db)):
    restaurant, table = _table(db, slug, table_code)
    session = db.query(DiningSession).options(joinedload(DiningSession.table), joinedload(DiningSession.participants)).filter(
        DiningSession.restaurant_id == restaurant.id,
        DiningSession.table_id == table.id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
    ).with_for_update(of=DiningSession).first()
    if not session:
        raise HTTPException(status_code=404, detail="No active table session found")
    attempt = _check_join_rate(db, session, request, body.device_id)
    ensure_join_authority(session)
    now = datetime.datetime.now(datetime.timezone.utc)
    valid = bool(
        session.join_code_hash
        and session.join_code_expires_at
        and session.join_code_expires_at > now
        and hmac.compare_digest(session.join_code_hash, join_code_digest(session, body.code))
    )
    if not valid:
        attempt.failed_count += 1
        if attempt.failed_count >= 5:
            attempt.blocked_until = now + datetime.timedelta(minutes=10)
        _audit(db, restaurant.id, "table_participant_join_failed", session, {"reason": "invalid_code"})
        db.commit()
        if attempt.failed_count >= 5:
            raise HTTPException(status_code=429, detail="Too many attempts. Please wait before trying again.")
        raise HTTPException(status_code=401, detail="Incorrect table code")
    participant, token = create_participant(db, session, request.client.host if request.client else None, body.device_id)
    join_code = ensure_join_authority(session)
    _audit(db, restaurant.id, "table_participant_joined", session, {"participant_public_id": participant.public_id})
    db.commit()
    db.refresh(participant)
    db.refresh(session)
    publish_event(
        EVENT_SESSION_UPDATED,
        restaurant_id=session.restaurant_id,
        channels=[session_channel(session.public_token)],
        resource_id=session.id,
        state={"participant_count": sum(1 for value in session.participants if value.revoked_at is None)},
    )
    return _response(participant, token, session, join_code)


@router.get("/public/sessions/{session_token}/participant")
def participant_me(session_token: str, token: str = Depends(participant_token_header), db: Session = Depends(get_db)):
    participant = load_participant(db, token, session_token=session_token)
    session = participant.session
    code = ensure_join_authority(session)
    db.commit()
    active_count = db.query(TableSessionParticipant).filter(
        TableSessionParticipant.session_id == session.id,
        TableSessionParticipant.revoked_at.is_(None),
    ).count()
    return {
        "participant": {"public_id": participant.public_id, "label": f"Device {participant.label_number}", "joined_at": participant.joined_at},
        "join_code": code,
        "participant_count": active_count,
        "session": {"public_id": session.public_token, "public_token": session.public_token, "status": session.status, "table_number": session.table.table_number},
    }


def _staff_session(db: Session, user: StaffUser, token: str):
    session = db.query(DiningSession).options(joinedload(DiningSession.participants)).filter(
        DiningSession.public_token == token,
        DiningSession.restaurant_id == user.restaurant_id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")
    return session


@router.get("/staff/table-sessions/{session_token}/participants")
def list_participants(session_token: str, current_user: StaffUser = Depends(staff_roles), db: Session = Depends(get_db)):
    session = _staff_session(db, current_user, session_token)
    code = ensure_join_authority(session)
    db.commit()
    return {
        "join_code": code,
        "participants": [{"public_id": p.public_id, "label": f"Device {p.label_number}", "joined_at": p.joined_at, "revoked_at": p.revoked_at} for p in session.participants],
    }


@router.post("/staff/table-sessions/{session_token}/rotate-join-code")
def staff_rotate_code(session_token: str, current_user: StaffUser = Depends(staff_roles), db: Session = Depends(get_db)):
    session = _staff_session(db, current_user, session_token)
    code = rotate_join_code(session)
    _audit(db, current_user.restaurant_id, "table_join_code_rotated", session, {}, current_user)
    db.commit()
    publish_event(EVENT_SESSION_UPDATED, restaurant_id=session.restaurant_id, channels=[session_channel(session.public_token)], resource_id=session.id, state={"join_code_version": session.join_code_version})
    return {"join_code": code, "join_code_version": session.join_code_version}


@router.post("/staff/table-sessions/{session_token}/participants/{public_id}/revoke")
def revoke_participant(session_token: str, public_id: str, body: RevokeRequest, current_user: StaffUser = Depends(staff_roles), db: Session = Depends(get_db)):
    session = _staff_session(db, current_user, session_token)
    participant = db.query(TableSessionParticipant).filter(
        TableSessionParticipant.session_id == session.id,
        TableSessionParticipant.public_id == public_id,
    ).with_for_update().first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")
    participant.revoked_at = datetime.datetime.now(datetime.timezone.utc)
    participant.revoked_by_staff_id = current_user.id
    participant.revocation_reason = body.reason
    _audit(db, current_user.restaurant_id, "table_participant_revoked", session, {"participant_public_id": public_id, "reason": body.reason}, current_user)
    db.commit()
    publish_event(EVENT_SESSION_UPDATED, restaurant_id=session.restaurant_id, channels=[session_channel(session.public_token)], resource_id=session.id, state={"participant_revoked": public_id})
    return {"status": "revoked"}
