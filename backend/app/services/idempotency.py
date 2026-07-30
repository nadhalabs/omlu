import hashlib
import json

from fastapi import HTTPException, status


def request_hash(payload: object) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def require_key(value: str | None) -> str:
    key = (value or "").strip()
    if len(key) < 10 or len(key) > 255:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header is required and must be between 10 and 255 characters.",
        )
    return key


def ensure_same_request(stored_hash: str | None, incoming_hash: str) -> None:
    if stored_hash != incoming_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Idempotency-Key was already used with a different request payload.",
        )
