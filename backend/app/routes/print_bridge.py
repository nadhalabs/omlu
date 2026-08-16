import hashlib
import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.utils.auth import get_current_staff_user, RoleChecker
from app.models.print_bridge import PrintBridgeInstallation, PrintBridgePairingChallenge, KitchenPrintJob
from app.services.print_bridge_service import (
    get_public_key_pem,
    get_public_key_raw_base64,
    hash_pairing_code,
    issue_action_token,
    validate_bill_for_printing,
    verify_print_bridge_token,
)

router = APIRouter(prefix="/api/admin/print-bridge", tags=["print-bridge"])

# Single-use exchange tokens cache: exchange_token -> { installation_id, tenant_id, credential_secret, expires_at }
_EXCHANGE_TOKENS: dict[str, dict] = {}


class PairingChallengeRequest(BaseModel):
    installation_id: str = Field(..., min_length=1, max_length=64)


class PairingConfirmRequest(BaseModel):
    installation_id: str = Field(..., min_length=1, max_length=64)
    pairing_code: str = Field(..., min_length=6, max_length=6)


class ExchangeRequest(BaseModel):
    exchange_token: str = Field(..., min_length=1)


class ActionAuthRequest(BaseModel):
    action: str = Field(..., description="bridge:pair, printer:configure, printer:test, bill:print, receipt:reprint")
    installation_id: str = Field(..., min_length=1, max_length=64)
    bill_id: Optional[str] = Field(None, description="Required for bill:print and receipt:reprint")


class TokenVerifyRequest(BaseModel):
    token: str = Field(..., min_length=1)
    expected_action: str = Field(...)
    expected_installation_id: str = Field(...)
    expected_bill_id: Optional[str] = Field(None)


class RevokeInstallationRequest(BaseModel):
    installation_id: str = Field(..., min_length=1, max_length=64)


class PrintJobStatusRequest(BaseModel):
    status: str
    failure_message: Optional[str] = Field(None, max_length=500)


@router.get("/public-key")
def get_print_bridge_public_key():
    """Returns backend Ed25519 public key for desktop print bridge token verification."""
    return {
        "kid": "omlu-print-bridge-key-v1",
        "algorithm": "Ed25519",
        "public_key_pem": get_public_key_pem(),
        "public_key_raw_base64": get_public_key_raw_base64(),
    }


@router.post("/pairing-challenge")
def create_pairing_challenge(
    req: PairingChallengeRequest,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    """Generates an expiring single-use pairing challenge code for a bridge installation."""
    now = datetime.now(timezone.utc)

    # Invalidate previous active challenges for this installation
    active_challenges = db.query(PrintBridgePairingChallenge).filter(
        PrintBridgePairingChallenge.installation_id == req.installation_id,
        PrintBridgePairingChallenge.tenant_id == str(current_staff.restaurant_id),
        PrintBridgePairingChallenge.consumed_at.is_(None),
    ).all()
    for c in active_challenges:
        c.consumed_at = now

    # Generate 6-digit code
    code_raw = str(uuid.uuid4().int % 900000 + 100000)
    code_hash = hash_pairing_code(code_raw)

    challenge = PrintBridgePairingChallenge(
        id=str(uuid.uuid4()),
        installation_id=req.installation_id,
        tenant_id=str(current_staff.restaurant_id),
        creator_user_id=current_staff.id,
        hashed_pairing_code=code_hash,
        attempt_count=0,
        created_at=now,
        expires_at=now + timedelta(minutes=5),
        consumed_at=None,
    )
    db.add(challenge)
    db.commit()

    return {
        "status": "challenge_created",
        "installation_id": req.installation_id,
        "pairing_code": code_raw,
        "expires_in_seconds": 300,
    }


@router.post("/confirm-pairing")
def confirm_pairing(
    req: PairingConfirmRequest,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    """Confirms pairing code, binds installation to tenant, and issues a single-use exchange token."""
    now = datetime.now(timezone.utc)
    challenge = db.query(PrintBridgePairingChallenge).filter(
        PrintBridgePairingChallenge.installation_id == req.installation_id,
        PrintBridgePairingChallenge.tenant_id == str(current_staff.restaurant_id),
        PrintBridgePairingChallenge.consumed_at.is_(None),
    ).order_by(PrintBridgePairingChallenge.created_at.desc()).first()

    if not challenge or not challenge.is_valid():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_PAIRING_CHALLENGE: Challenge code has expired, been consumed, or reached attempt limits.",
        )

    code_hash = hash_pairing_code(req.pairing_code)
    if challenge.hashed_pairing_code != code_hash:
        challenge.attempt_count += 1
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"WRONG_PAIRING_CODE: Incorrect code. Attempt {challenge.attempt_count}/3.",
        )

    # Consume challenge
    challenge.consumed_at = now

    # Create or update installation record with incremented credential_version
    inst = db.query(PrintBridgeInstallation).filter(
        PrintBridgeInstallation.installation_id == req.installation_id,
        PrintBridgeInstallation.tenant_id == str(current_staff.restaurant_id),
    ).first()

    credential_secret = uuid.uuid4().hex
    hashed_secret = hashlib.sha256(credential_secret.encode("utf-8")).hexdigest()

    if inst:
        inst.credential_version += 1
        inst.hashed_credential = hashed_secret
        inst.status = "paired"
        inst.paired_by_user_id = current_staff.id
        inst.revoked_at = None
        inst.last_used_at = now
    else:
        inst = PrintBridgeInstallation(
            id=str(uuid.uuid4()),
            installation_id=req.installation_id,
            tenant_id=str(current_staff.restaurant_id),
            hashed_credential=hashed_secret,
            status="paired",
            paired_by_user_id=current_staff.id,
            credential_version=1,
            created_at=now,
            last_used_at=now,
        )
        db.add(inst)

    db.commit()

    # Generate single-use exchange token valid for 60 seconds
    exchange_token = f"exch_{uuid.uuid4().hex}"
    _EXCHANGE_TOKENS[exchange_token] = {
        "installation_id": req.installation_id,
        "tenant_id": str(current_staff.restaurant_id),
        "credential_secret": credential_secret,
        "expires_at": time.time() + 60.0,
    }

    return {
        "status": "success",
        "installation_id": req.installation_id,
        "exchange_token": exchange_token,
    }


@router.post("/exchange")
def redeem_exchange_token(req: ExchangeRequest):
    """Redeems a single-use exchange token directly from the local bridge to receive installation credentials."""
    now = time.time()
    info = _EXCHANGE_TOKENS.pop(req.exchange_token, None)
    if not info or info["expires_at"] <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_EXCHANGE_TOKEN: Token is invalid, expired, or already consumed.",
        )

    return {
        "status": "paired",
        "installation_id": info["installation_id"],
        "tenant_id": info["tenant_id"],
        "credential_secret": info["credential_secret"],
    }


@router.post("/authorize-action")
def authorize_action(
    req: ActionAuthRequest,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    """Issues an action-scoped Ed25519 signed JWT token for print bridge operations."""
    valid_actions = {"bridge:pair", "printer:configure", "printer:test", "bill:print", "receipt:reprint"}
    if req.action not in valid_actions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"INVALID_ACTION_SCOPE: Action '{req.action}' is not supported.",
        )

    # Validate bill database existence and status for bill:print / receipt:reprint
    if req.action in {"bill:print", "receipt:reprint"}:
        try:
            validate_bill_for_printing(db, req.bill_id, str(current_staff.restaurant_id), req.action)
        except ValueError as err:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))

    # Verify installation active pairing
    inst = db.query(PrintBridgeInstallation).filter(
        PrintBridgeInstallation.installation_id == req.installation_id,
        PrintBridgeInstallation.tenant_id == str(current_staff.restaurant_id),
    ).first()

    if not inst or inst.status != "paired" or inst.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="INSTALLATION_UNAUTHORIZED: Print bridge installation is not paired or has been revoked.",
        )

    token = issue_action_token(
        user_id=current_staff.id,
        tenant_id=str(current_staff.restaurant_id),
        installation_id=req.installation_id,
        action=req.action,
        credential_version=inst.credential_version,
        bill_id=req.bill_id,
        expires_in_seconds=300,
    )

    return {
        "status": "authorized",
        "token": token,
        "expires_in_seconds": 300,
        "kid": "omlu-print-bridge-key-v1",
    }


@router.post("/verify-token")
def verify_token(
    req: TokenVerifyRequest,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    """Verifies a signed print bridge token strictly against database installation status and claims."""
    try:
        claims = verify_print_bridge_token(
            db=db,
            token=req.token,
            expected_action=req.expected_action,
            expected_tenant_id=str(current_staff.restaurant_id),
            expected_installation_id=req.expected_installation_id,
            expected_bill_id=req.expected_bill_id,
        )
        return {"status": "valid", "claims": claims}
    except ValueError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))


@router.get("/installations")
def list_installations(
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    """Lists registered print bridge installations for the restaurant."""
    items = db.query(PrintBridgeInstallation).filter(
        PrintBridgeInstallation.tenant_id == str(current_staff.restaurant_id)
    ).all()
    return {"installations": [i.to_dict() for i in items]}


@router.post("/revoke-installation")
def revoke_installation(
    req: RevokeInstallationRequest,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    """Revokes a print bridge installation."""
    inst = db.query(PrintBridgeInstallation).filter(
        PrintBridgeInstallation.installation_id == req.installation_id,
        PrintBridgeInstallation.tenant_id == current_staff.restaurant_id,
    ).first()

    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="INSTALLATION_NOT_FOUND")

    inst.status = "revoked"
    inst.revoked_at = datetime.now(timezone.utc)
    db.commit()

    return {"status": "revoked", "installation_id": req.installation_id}


def _job_payload(job: KitchenPrintJob) -> dict:
    return {
        "id": job.id,
        "document_type": job.document_type,
        "order_id": job.order_id,
        "quick_sale_id": job.quick_sale_id,
        "order_item_id": job.order_item_id,
        "destination": job.destination,
        "payload": json.loads(job.payload),
        "status": job.status,
        "retry_count": job.retry_count,
        "failure_message": "Kitchen printer offline" if job.status == "failed" else None,
        "created_at": job.created_at,
        "printed_at": job.printed_at,
    }


@router.get("/kitchen-jobs")
def list_kitchen_jobs(
    job_status: Optional[str] = None,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin", "kitchen"])),
    db: Session = Depends(get_db),
):
    query = db.query(KitchenPrintJob).filter(KitchenPrintJob.restaurant_id == current_staff.restaurant_id)
    if job_status:
        if job_status not in {"pending", "printing", "printed", "failed"}:
            raise HTTPException(status_code=422, detail="Invalid print job status")
        query = query.filter(KitchenPrintJob.status == job_status)
    jobs = query.order_by(KitchenPrintJob.created_at.asc(), KitchenPrintJob.id.asc()).limit(100).all()
    return {"jobs": [_job_payload(job) for job in jobs]}


@router.post("/kitchen-jobs/{job_id}/status")
def update_kitchen_job_status(
    job_id: int,
    req: PrintJobStatusRequest,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin", "kitchen"])),
    db: Session = Depends(get_db),
):
    if req.status not in {"printing", "printed", "failed"}:
        raise HTTPException(status_code=422, detail="Invalid print job status")
    job = db.query(KitchenPrintJob).filter(
        KitchenPrintJob.id == job_id,
        KitchenPrintJob.restaurant_id == current_staff.restaurant_id,
    ).with_for_update().first()
    if not job:
        raise HTTPException(status_code=404, detail="Kitchen print job not found")
    if job.status == "printed":
        if req.status == "printed":
            return _job_payload(job)
        raise HTTPException(status_code=409, detail="This kitchen ticket is already printed")
    allowed_transition = {
        "pending": "printing",
        "printing": req.status if req.status in {"printed", "failed"} else None,
        "failed": None,
    }.get(job.status)
    if allowed_transition != req.status:
        raise HTTPException(status_code=409, detail="Kitchen ticket state changed; refresh before trying again")
    job.status = req.status
    if req.status == "printed":
        job.printed_at = datetime.now(timezone.utc)
        job.failure_message = None
    elif req.status == "failed":
        job.failure_message = req.failure_message or "Printer unavailable"
    db.commit()
    db.refresh(job)
    return _job_payload(job)


@router.post("/kitchen-jobs/{job_id}/retry")
def retry_kitchen_job(
    job_id: int,
    current_staff=Depends(get_current_staff_user),
    _=Depends(RoleChecker(["owner", "admin"])),
    db: Session = Depends(get_db),
):
    job = db.query(KitchenPrintJob).filter(
        KitchenPrintJob.id == job_id,
        KitchenPrintJob.restaurant_id == current_staff.restaurant_id,
    ).with_for_update().first()
    if not job:
        raise HTTPException(status_code=404, detail="Kitchen print job not found")
    if job.status == "printed":
        raise HTTPException(status_code=409, detail="This kitchen ticket is already printed")
    if job.status == "printing":
        raise HTTPException(status_code=409, detail="This kitchen ticket is currently printing")
    job.status = "pending"
    job.retry_count += 1
    job.failure_message = None
    db.commit()
    db.refresh(job)
    return _job_payload(job)
