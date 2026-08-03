import base64
import datetime
import hashlib
import hmac
import secrets
import uuid

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import Header, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.table_session_participant import TableSessionParticipant
from app.models.table_session_participant import TableSessionJoinAttempt


def _secret() -> bytes:
    return (settings.participant_hmac_secret or settings.jwt_secret_key).encode()


def _utc(value: datetime.datetime) -> datetime.datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=datetime.timezone.utc)


def token_hash(token: str) -> str:
    return hmac.new(_secret(), f"participant:{token}".encode(), hashlib.sha256).hexdigest()


def authority_hash(value: str) -> str:
    return hmac.new(_secret(), f"authority:{value}".encode(), hashlib.sha256).hexdigest()


def join_code_digest(session: DiningSession, code: str) -> str:
    material = f"{session.restaurant_id}:{session.id}:{session.join_code_version}:{code}"
    return hmac.new(_secret(), material.encode(), hashlib.sha256).hexdigest()


def _encrypt_authority(value: str, purpose: bytes) -> str:
    key = hashlib.sha256(_secret() + purpose).digest()
    nonce = secrets.token_bytes(12)
    encrypted = AESGCM(key).encrypt(nonce, value.encode(), None)
    return base64.urlsafe_b64encode(nonce + encrypted).decode()


def _decrypt_authority(ciphertext: str, purpose: bytes) -> str:
    raw = base64.urlsafe_b64decode(ciphertext.encode())
    key = hashlib.sha256(_secret() + purpose).digest()
    return AESGCM(key).decrypt(raw[:12], raw[12:], None).decode()


def _encrypt_code(code: str) -> str:
    return _encrypt_authority(code, b":join-code-encryption")


def decrypt_join_code(ciphertext: str) -> str:
    return _decrypt_authority(ciphertext, b":join-code-encryption")


def store_participant_authority_for_replay(participant: TableSessionParticipant, token: str) -> None:
    participant.authority_ciphertext = _encrypt_authority(token, b":participant-replay-encryption")


def recover_participant_authority(participant: TableSessionParticipant) -> str:
    if not participant.authority_ciphertext:
        raise HTTPException(status_code=409, detail="Original participant authority is unavailable for replay.")
    token = _decrypt_authority(participant.authority_ciphertext, b":participant-replay-encryption")
    if not hmac.compare_digest(participant.token_hash, token_hash(token)):
        raise HTTPException(status_code=409, detail="Original participant authority is invalid.")
    return token


def rotate_join_code(session: DiningSession) -> str:
    code = f"{secrets.randbelow(10000):04d}"
    now = datetime.datetime.now(datetime.timezone.utc)
    session.join_code_version += 1
    session.join_code_hash = join_code_digest(session, code)
    session.join_code_ciphertext = _encrypt_code(code)
    session.join_code_created_at = now
    session.join_code_expires_at = now + datetime.timedelta(hours=12)
    return code


def ensure_join_authority(session: DiningSession) -> str:
    now = datetime.datetime.now(datetime.timezone.utc)
    if (
        not session.join_code_hash
        or not session.join_code_ciphertext
        or not session.join_code_expires_at
        or session.join_code_expires_at <= now
    ):
        return rotate_join_code(session)
    return decrypt_join_code(session.join_code_ciphertext)


def create_participant(
    db: Session,
    session: DiningSession,
    ip_value: str | None,
    fingerprint: str | None = None,
):
    raw_token = secrets.token_urlsafe(48)
    next_label = (db.query(func.max(TableSessionParticipant.label_number)).filter(
        TableSessionParticipant.session_id == session.id
    ).scalar() or 0) + 1
    participant = TableSessionParticipant(
        public_id=uuid.uuid4().hex,
        restaurant_id=session.restaurant_id,
        table_id=session.table_id,
        session_id=session.id,
        token_hash=token_hash(raw_token),
        label_number=next_label,
        created_ip_hash=authority_hash(ip_value) if ip_value else None,
        device_fingerprint_hash=authority_hash(fingerprint) if fingerprint else None,
    )
    db.add(participant)
    db.flush()
    return participant, raw_token


def load_participant(
    db: Session,
    raw_token: str,
    *,
    restaurant_id: int | None = None,
    table_id: int | None = None,
    session_token: str | None = None,
    require_open_for_ordering: bool = False,
    lock_for_action: bool = False,
    allow_revoked_for_detached_bill: bool = False,
) -> TableSessionParticipant:
    query = db.query(TableSessionParticipant).options(
        joinedload(TableSessionParticipant.session).joinedload(DiningSession.restaurant),
        joinedload(TableSessionParticipant.session).joinedload(DiningSession.table),
    ).filter(TableSessionParticipant.token_hash == token_hash(raw_token))
    if require_open_for_ordering or lock_for_action:
        query = query.with_for_update(of=TableSessionParticipant)
    participant = query.first()
    if not participant or participant.revoked_at:
        if not (
            participant
            and allow_revoked_for_detached_bill
            and participant.session.status == "detached_awaiting_payment"
        ):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Table access is no longer valid")
    session = participant.session
    if (
        (restaurant_id is not None and participant.restaurant_id != restaurant_id)
        or (table_id is not None and participant.table_id != table_id)
        or (session_token is not None and session.public_token != session_token)
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Table access does not match this session")
    if session.status not in ACTIVE_DINING_SESSION_STATUSES and not (
        allow_revoked_for_detached_bill and session.status == "detached_awaiting_payment"
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Table session has ended")
    if require_open_for_ordering and session.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordering is locked for this table session")
    if not session.restaurant.is_active or not session.table.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Table access is no longer valid")
    participant.last_seen_at = datetime.datetime.now(datetime.timezone.utc)
    return participant


def participant_token_header(
    x_participant_token: str | None = Header(None, alias="X-Participant-Token"),
) -> str:
    if not x_participant_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Join this table to continue")
    return x_participant_token


def invalidate_session_participants(db: Session, session: DiningSession, reason: str) -> int:
    now = datetime.datetime.now(datetime.timezone.utc)
    updated = db.query(TableSessionParticipant).filter(
        TableSessionParticipant.session_id == session.id,
        TableSessionParticipant.revoked_at.is_(None),
    ).update({
        "revoked_at": now,
        "revocation_reason": reason,
    })
    session.join_code_hash = None
    session.join_code_ciphertext = None
    session.join_code_expires_at = now
    session.join_code_version += 1
    return updated


def enforce_session_action_rate(
    db: Session,
    session: DiningSession,
    *,
    action: str,
    ip_value: str,
    participant_token: str,
    limit: int,
    window_seconds: int = 60,
) -> None:
    """Database-backed limit shared by all application workers."""
    now = datetime.datetime.now(datetime.timezone.utc)
    db.query(TableSessionJoinAttempt).filter(
        TableSessionJoinAttempt.session_id == session.id,
        TableSessionJoinAttempt.window_started_at < now - datetime.timedelta(hours=24),
    ).delete(synchronize_session=False)
    key = authority_hash(f"{action}:{ip_value}:{token_hash(participant_token)}")
    record = db.query(TableSessionJoinAttempt).filter(
        TableSessionJoinAttempt.session_id == session.id,
        TableSessionJoinAttempt.authority_hash == key,
    ).with_for_update().first()
    if not record:
        record = TableSessionJoinAttempt(
            session_id=session.id,
            authority_hash=key,
            window_started_at=now,
            failed_count=0,
        )
        db.add(record)
        db.flush()
    if now - _utc(record.window_started_at) >= datetime.timedelta(seconds=window_seconds):
        record.window_started_at = now
        record.failed_count = 0
        record.blocked_until = None
    if record.failed_count >= limit:
        record.blocked_until = _utc(record.window_started_at) + datetime.timedelta(seconds=window_seconds)
        db.commit()
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests. Please wait.")
    record.failed_count += 1
