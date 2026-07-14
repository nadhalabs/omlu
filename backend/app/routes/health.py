from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.services.push_notifications import push_health
from app.services.realtime import broker, realtime_metrics_snapshot

router = APIRouter()


@router.get("/health")
def health_check():
    """Lightweight health check. Does not require database access."""
    return {"status": "healthy"}


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


@router.get("/health/realtime")
async def realtime_health_check():
    broker_status = await broker.health()
    metrics = realtime_metrics_snapshot()
    status_code = 200 if broker_status.get("status") == "healthy" else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": broker_status.get("status"),
            "broker": broker_status,
            "metrics": metrics,
            "push": push_health(),
        },
    )


@router.get("/health/ready")
async def readiness_check(db: Session = Depends(get_db)):
    checks = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "healthy"
    except Exception:
        checks["database"] = "unavailable"
    broker_status = await broker.health()
    checks["realtime_broker"] = broker_status.get("status", "unavailable")
    checks["redis"] = broker_status.get("redis", "not_configured")
    checks["push"] = push_health()["status"]
    status_code = 200 if checks["database"] == "healthy" and checks["realtime_broker"] == "healthy" else 503
    return JSONResponse(status_code=status_code, content={"status": "healthy" if status_code == 200 else "unavailable", "checks": checks})


@router.get("/metrics/realtime")
def realtime_metrics():
    return realtime_metrics_snapshot()
