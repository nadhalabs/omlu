import logging
import re
import time
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
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


SENSITIVE_PATH_PATTERNS = [
    (re.compile(r'(/public/sessions/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/public/bills/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/public/orders/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/public/restaurants/[^/]+/bills/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/staff/sessions/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/session/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/bill/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/order/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/complete/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/quick-sales/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/receipts?/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/reset-password/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
    (re.compile(r'(/verify-token/)[^/]+(/.*)?'), r'\1[REDACTED]\2'),
]

def sanitize_path_for_logging(path: str) -> str:
    for pattern, replacement in SENSITIVE_PATH_PATTERNS:
        if pattern.search(path):
            path = pattern.sub(replacement, path)
    return path


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Log every request with method, path, status, and timing. Never log secrets or bodies."""
    request_id = str(uuid.uuid4())[:8]
    request.state.request_id = request_id
    start_time = time.time()

    response = await call_next(request)

    duration_ms = int((time.time() - start_time) * 1000)
    sanitized_path = sanitize_path_for_logging(request.url.path)
    logger.info(
        "request method=%s path=%s status=%d duration_ms=%d request_id=%s",
        request.method,
        sanitized_path,
        response.status_code,
        duration_ms,
        request_id
    )
    if response.status_code >= 400:
        event = None
        if request.method == "POST" and "/orders" in sanitized_path:
            event = "order_creation_failure"
        elif "confirm-counter-payment" in sanitized_path or "/payment" in sanitized_path:
            event = "unauthorized_payment_attempt" if response.status_code in {401, 403} else "payment_failure"
        elif request.method == "POST" and ("close-empty" in sanitized_path or sanitized_path.endswith("/close")):
            event = "session_closure_failure"
        if response.status_code == 409 and request.headers.get("Idempotency-Key"):
            logger.warning(
                "event=duplicate_idempotency_conflict method=%s path=%s status=%d request_id=%s",
                request.method, sanitized_path, response.status_code, request_id,
            )
        if event:
            logger.warning(
                "event=%s method=%s path=%s status=%d request_id=%s",
                event, request.method, sanitized_path, response.status_code, request_id,
            )
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", "unknown")
    sanitized_path = sanitize_path_for_logging(request.url.path)
    if exc.status_code == 405:
        logger.warning(
            "event=method_not_allowed method=%s path=%s request_id=%s",
            request.method,
            sanitized_path,
            request_id,
        )
        headers = dict(exc.headers) if exc.headers else {}
        return JSONResponse(
            status_code=405,
            content={
                "code": "METHOD_NOT_ALLOWED",
                "message": "Method not allowed for this endpoint.",
                "request_id": request_id,
            },
            headers=headers,
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "request_id": request_id,
        },
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    sanitized_path = sanitize_path_for_logging(request.url.path)
    logger.exception(
        "event=unhandled_api_failure method=%s path=%s request_id=%s error_type=%s",
        request.method,
        sanitized_path,
        request_id,
        exc.__class__.__name__,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Something went wrong while processing the request. Please try again.",
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
    )


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
    quick_sales_router,
    menu_imports_router,
    table_participants_router,
    platform_router,
    print_bridge_router,
    gst_router,
)

app.include_router(health_router)
app.include_router(platform_router)
app.include_router(print_bridge_router)
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
app.include_router(quick_sales_router)
app.include_router(menu_imports_router)
app.include_router(table_participants_router)
app.include_router(gst_router)


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
