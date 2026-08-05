import base64
import hashlib
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from sqlalchemy.orm import Session

from app.models.print_bridge import PrintBridgeInstallation, PrintBridgePairingChallenge
from app.models.bill import Bill

KEY_ID = "omlu-print-bridge-key-v1"
ISSUER = "omlu-backend"
AUDIENCE = "omlu-print-bridge"
MAX_TOKEN_LIFETIME_SECONDS = 600  # 10 minutes

# Generated or configured Ed25519 Key Pair
_PRIVATE_KEY: Optional[ed25519.Ed25519PrivateKey] = None
_PUBLIC_KEY: Optional[ed25519.Ed25519PublicKey] = None
_USED_JTIS: Dict[str, float] = {}  # JTI -> Expiry timestamp for replay protection


def _get_or_create_key_pair() -> tuple[ed25519.Ed25519PrivateKey, ed25519.Ed25519PublicKey]:
    global _PRIVATE_KEY, _PUBLIC_KEY
    if _PRIVATE_KEY is None or _PUBLIC_KEY is None:
        _PRIVATE_KEY = ed25519.Ed25519PrivateKey.generate()
        _PUBLIC_KEY = _PRIVATE_KEY.public_key()
    return _PRIVATE_KEY, _PUBLIC_KEY


def get_public_key_pem() -> str:
    _, pub = _get_or_create_key_pair()
    pem_bytes = pub.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return pem_bytes.decode("utf-8")


def get_public_key_raw_base64() -> str:
    _, pub = _get_or_create_key_pair()
    raw_bytes = pub.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return base64.urlsafe_b64encode(raw_bytes).decode("utf-8").rstrip("=")


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _base64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def hash_pairing_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def issue_action_token(
    user_id: str,
    tenant_id: str,
    installation_id: str,
    action: str,
    credential_version: int,
    bill_id: Optional[str] = None,
    expires_in_seconds: int = 300,
) -> str:
    priv, _ = _get_or_create_key_pair()
    now = int(time.time())
    exp = now + min(expires_in_seconds, MAX_TOKEN_LIFETIME_SECONDS)

    header = {
        "alg": "EdDSA",
        "typ": "JWT",
        "kid": KEY_ID,
    }
    payload = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": user_id,
        "tenant_id": tenant_id,
        "installation_id": installation_id,
        "action": action,
        "bill_id": bill_id,
        "credential_version": credential_version,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "nbf": now,
        "exp": exp,
    }

    header_b64 = _base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = priv.sign(signing_input)
    signature_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def verify_print_bridge_token(
    db: Session,
    token: str,
    expected_action: str,
    expected_tenant_id: str,
    expected_installation_id: str,
    expected_bill_id: Optional[str] = None,
) -> Dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("INVALID_TOKEN_FORMAT: Signed token must contain header, payload, and signature.")

    header_b64, payload_b64, signature_b64 = parts
    try:
        header = json.loads(_base64url_decode(header_b64).decode("utf-8"))
        payload = json.loads(_base64url_decode(payload_b64).decode("utf-8"))
        signature = _base64url_decode(signature_b64)
    except Exception as e:
        raise ValueError(f"INVALID_TOKEN_ENCODING: Could not decode token: {str(e)}")

    # 1. Header checks
    if header.get("alg") != "EdDSA":
        raise ValueError("UNSUPPORTED_ALGORITHM: Token algorithm must be EdDSA.")
    if header.get("kid") != KEY_ID:
        raise ValueError(f"UNKNOWN_KEY_ID: Token key ID '{header.get('kid')}' is unknown or retired.")

    # 2. Signature verification
    _, pub = _get_or_create_key_pair()
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    try:
        pub.verify(signature, signing_input)
    except Exception:
        raise ValueError("INVALID_SIGNATURE: Signed token verification failed.")

    # 3. Claims verification
    now = int(time.time())
    if payload.get("iss") != ISSUER:
        raise ValueError(f"INVALID_ISSUER: Expected issuer '{ISSUER}'.")
    if payload.get("aud") != AUDIENCE:
        raise ValueError(f"INVALID_AUDIENCE: Expected audience '{AUDIENCE}'.")
    if payload.get("action") != expected_action:
        raise ValueError(f"ACTION_MISMATCH: Token action '{payload.get('action')}' does not match expected '{expected_action}'.")
    if payload.get("tenant_id") != expected_tenant_id:
        raise ValueError("TENANT_MISMATCH: Token tenant ID does not match expected tenant.")
    if payload.get("installation_id") != expected_installation_id:
        raise ValueError("INSTALLATION_MISMATCH: Token installation ID does not match expected installation.")

    if expected_bill_id is not None and payload.get("bill_id") != expected_bill_id:
        raise ValueError("BILL_MISMATCH: Token bill ID does not match expected bill.")

    iat = payload.get("iat", 0)
    nbf = payload.get("nbf", 0)
    exp = payload.get("exp", 0)

    if iat > now + 5:
        raise ValueError("FUTURE_ISSUED_AT: Token issued-at time is in the future.")
    if nbf > now:
        raise ValueError("TOKEN_NOT_YET_VALID: Token not-before constraint not satisfied.")
    if exp <= now:
        raise ValueError("TOKEN_EXPIRED: Token has expired.")
    if exp - iat > MAX_TOKEN_LIFETIME_SECONDS:
        raise ValueError("EXCESSIVE_TOKEN_LIFETIME: Token lifetime exceeds maximum allowed duration.")

    # 4. JTI Replay Protection
    jti = payload.get("jti")
    if not jti:
        raise ValueError("MISSING_JTI: Token missing unique JTI identifier.")

    # Cleanup expired JTIs
    expired_jtis = [k for k, v in _USED_JTIS.items() if v <= now]
    for k in expired_jtis:
        del _USED_JTIS[k]

    if jti in _USED_JTIS:
        raise ValueError("REPLAYED_JTI: Token JTI has already been consumed.")
    _USED_JTIS[jti] = float(exp)

    # 5. Database Installation Revocation & Credential Version Verification
    inst = db.query(PrintBridgeInstallation).filter(
        PrintBridgeInstallation.installation_id == expected_installation_id,
        PrintBridgeInstallation.tenant_id == str(expected_tenant_id),
    ).first()

    if not inst:
        raise ValueError("INSTALLATION_NOT_FOUND: Installation is not registered.")
    if inst.status != "paired":
        raise ValueError("INSTALLATION_NOT_PAIRED: Installation is not in paired status.")
    if inst.revoked_at is not None:
        raise ValueError("INSTALLATION_REVOKED: Installation credential has been revoked.")
    if inst.credential_version != payload.get("credential_version"):
        raise ValueError("CREDENTIAL_VERSION_MISMATCH: Token credential version does not match installation.")

    return payload


def validate_bill_for_printing(db: Session, bill_id: str, tenant_id: str, action: str) -> Bill:
    if not bill_id or not str(bill_id).strip():
        raise ValueError("INVALID_BILL_ID: Bill ID must be specified.")

    try:
        rest_id = int(tenant_id)
    except (TypeError, ValueError):
        raise ValueError("INVALID_TENANT_ID: Tenant ID must be valid.")

    query = db.query(Bill).filter(Bill.restaurant_id == rest_id)
    if str(bill_id).isdigit():
        bill = query.filter((Bill.bill_number == str(bill_id)) | (Bill.id == int(bill_id))).first()
    else:
        bill = query.filter(Bill.bill_number == str(bill_id)).first()

    if not bill:
        raise ValueError("BILL_NOT_FOUND: Bill does not exist or does not belong to your restaurant.")

    if bill.status == "draft":
        raise ValueError("DRAFT_BILL_REJECTED: Draft bills cannot be authorized for printing.")

    if action == "bill:print":
        if bill.status not in {"issued", "payment_pending", "paid"}:
            raise ValueError(f"CANNOT_PRINT_BILL: Bill status '{bill.status}' is not eligible for initial printing.")

    if action == "receipt:reprint":
        if bill.status not in {"issued", "payment_pending", "paid"}:
            raise ValueError(f"CANNOT_REPRINT_RECEIPT: Bill status '{bill.status}' is not eligible for receipt reprinting.")

    return bill
