import logging
import uuid
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import app.models  # Ensures all models are registered on Base

from app.config import settings

# Configure structured logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format='%(asctime)s %(levelname)s [%(name)s] %(message)s'
)
logger = logging.getLogger("nadha_serve")

# Table creation is managed via Alembic migrations
app = FastAPI(
    title="OMLU API",
    version="0.1.0",
)

# CORS: use explicit origins from environment, never wildcard with credentials
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every request with method, path, status, and timing. Never log secrets or bodies."""
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    response = await call_next(request)

    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(
        "request method=%s path=%s status=%d duration_ms=%d request_id=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        request_id
    )
    response.headers["X-Request-ID"] = request_id
    return response


from app.routes import (
    public_menu_router,
    orders_router,
    kitchen_router,
    auth_router,
    admin_router,
    service_request_router,
    dashboard_router,
    settings_router,
    health_router,
    bills_router,
    sessions_router,
    staff_management_router,
    registration_router,
    history_router,
    menu_options_router,
    realtime_router,
    staff_tables_router,
    push_router,
)

app.include_router(health_router)
app.include_router(public_menu_router)
app.include_router(orders_router)
app.include_router(service_request_router)
app.include_router(kitchen_router)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(dashboard_router)
app.include_router(settings_router)
app.include_router(bills_router)
app.include_router(sessions_router)
app.include_router(staff_management_router)
app.include_router(registration_router)
app.include_router(history_router)
app.include_router(menu_options_router)
app.include_router(realtime_router)
app.include_router(staff_tables_router)
app.include_router(push_router)


@app.on_event("shutdown")
async def shutdown_realtime_broker():
    from app.services.realtime import broker

    await broker.shutdown()


@app.get("/")
def root():
    return {
        "name": "OMLU API",
        "status": "running",
    }
