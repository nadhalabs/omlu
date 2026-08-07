import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.database import get_db, SessionLocal
from app.services.push_notifications import push_health
from app.services.realtime import realtime_metrics_snapshot
from app.services.redis_health import check_redis_health
from app.config import settings

# NOTE: `Session`, `Depends`, `get_db` are kept for the synchronous
# `database_health_check` route which uses FastAPI dependency injection.

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health_check():
    """Process liveness only; dependency readiness is reported separately."""
    return {"status": "healthy", "checks": {"api": "healthy"}}


@router.get("/health/database")
def database_health_check(db: Session = Depends(get_db)):
    """
    Database connectivity check.
    Runs SELECT 1 to verify reachability.
    Returns 200 on success, 503 on failure.
    Never exposes connection strings or exception details.
    """
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        # Return generic message; never expose credentials or stack traces
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable"}
        )


def _check_pg_sync() -> str:
    """Execute SELECT 1 inside a worker thread to avoid blocking the event loop.

    Creates and closes its own SessionLocal(). Returns 'healthy' or 'unavailable'.
    """
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return "healthy"
    except Exception:
        return "unavailable"
    finally:
        db.close()


@router.get("/health/realtime")
async def realtime_health_check():
    redis_health = await check_redis_health()
    metrics = realtime_metrics_snapshot()
    broker_status = redis_health["broker_status"]
    status_code = 200 if broker_status == "healthy" else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": broker_status,
            "broker_type": redis_health["broker_type"],
            "redis_status": redis_health["redis_status"],
            "broker_status": broker_status,
            "last_checked_at": redis_health["last_checked_at"],
            "metrics": metrics,
            "push": push_health(),
        },
    )


@router.get("/health/ready")
async def readiness_check():
    """
    Readiness check.

    Status semantics:
        redis:    not_configured | healthy | unavailable | unknown
        realtime: healthy | degraded | unavailable | unknown

    Production readiness (app_environment=production OR require_redis=True):
        Fails with 503 when redis is not_configured, unavailable, or unknown.
        Fails with 503 when realtime is unavailable.
        A degraded realtime (in-memory fallback with no Redis) is also
        treated as a hard failure in production since Redis is required.

    Development / staging (no require_redis):
        Fails with 503 only when postgresql or realtime are unavailable.
        A degraded realtime (in-memory) is allowed.
    """
    checks: dict[str, str] = {"api": "healthy"}

    # ── PostgreSQL ───────────────────────────────────────────────────────────────────────────
    # Offload the synchronous SELECT 1 to the threadpool; session is
    # created/closed inside the helper — not held across the await.
    checks["postgresql"] = await run_in_threadpool(_check_pg_sync)

    # ── Redis & Realtime ───────────────────────────────────────────────────────────────────────
    redis_health = await check_redis_health()
    checks["redis"] = redis_health["redis_status"]          # explicit 4-state
    checks["realtime"] = redis_health["broker_status"]      # explicit 4-state
    checks["push"] = push_health()["status"]

    # ── Readiness decision ──────────────────────────────────────────────────────────────────────────────
    requires_redis = (
        settings.app_environment == "production" or settings.require_redis
    )

    pg_ok = checks["postgresql"] == "healthy"
    redis_ok = checks["redis"] == "healthy"
    realtime_ok = checks["realtime"] in ("healthy", "degraded")

    if requires_redis:
        # Redis must be healthy in production; degraded or unavailable fails.
        ready = pg_ok and redis_ok and checks["realtime"] == "healthy"
    else:
        # Development/staging: allow degraded realtime (in-memory fallback).
        ready = pg_ok and realtime_ok

    status_code = 200 if ready else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if ready else "unavailable",
            "checks": checks,
        },
    )


@router.get("/ready")
async def ready():
    """Render-compatible readiness alias with dependency checks."""
    return await readiness_check()


@router.get("/metrics/realtime")
def realtime_metrics():
    return realtime_metrics_snapshot()
