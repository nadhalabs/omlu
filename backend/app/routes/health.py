from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db

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
