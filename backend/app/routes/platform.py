import datetime
import time
import secrets
from decimal import Decimal
from typing import Optional, List, Dict, Any
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, text

from app.database import get_db
from app.config import settings
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem
from app.models.dining_session import DiningSession, ACTIVE_DINING_SESSION_STATUSES
from app.models.bill import Bill
from app.models.quick_sale import QuickSale
from app.models.staff_user import StaffUser, StaffSession
from app.models.platform_user import PlatformUser, PlatformSession, PlatformAuditLog
from app.utils.auth import hash_password, verify_password, normalize_email, normalize_identifier
from app.utils.platform_auth import (
    create_platform_token,
    decode_platform_token,
    get_platform_context,
    require_platform_role,
    audit_platform_action,
    PlatformContext,
)
from app.services.platform_analytics import (
    evaluate_restaurant_health,
    detect_stuck_sessions,
    generate_operational_alerts,
    generate_plain_language_insights,
    calculate_separated_billing_metrics,
    generate_operational_visualizations,
    monitoring_coverage_metadata,
)
from app.services.platform_recovery import (
    finalize_paid_session as service_finalize_paid_session,
    recover_abandoned_empty_session as service_recover_abandoned_empty_session,
    detect_duplicate_active_sessions as service_detect_duplicate_active_sessions,
)
from app.services.realtime import realtime_metrics_snapshot
from app.services.push_notifications import push_health

router = APIRouter(prefix="/api/v1/platform", tags=["Platform Operations"])

# Login rate limiter for platform
platform_login_attempts = defaultdict(list)


def _check_platform_login_rate_limit(client_ip: str) -> bool:
    now = time.time()
    platform_login_attempts[client_ip] = [t for t in platform_login_attempts[client_ip] if now - t < 300]
    if len(platform_login_attempts[client_ip]) >= 20:
        return False
    platform_login_attempts[client_ip].append(now)
    return True


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "127.0.0.1"


# --- AUTHENTICATION ---

@router.post("/auth/login")
def platform_login(
    payload: dict,
    request: Request,
    db: Session = Depends(get_db)
):
    client_ip = _client_ip(request)
    if not _check_platform_login_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait 5 minutes before trying again."
        )

    identifier = payload.get("identifier") or payload.get("username") or payload.get("email")
    password = payload.get("password")

    if not identifier or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Identifier and password are required")

    norm_id = normalize_identifier(identifier)
    platform_user = db.query(PlatformUser).filter(
        or_(
            func.lower(PlatformUser.email) == norm_id,
            func.lower(PlatformUser.username) == norm_id
        )
    ).first()

    if not platform_user or not verify_password(password, platform_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid platform credentials"
        )

    if not platform_user.is_active or platform_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Platform operator account is suspended or inactive"
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    platform_user.last_login_at = now
    token_jti = secrets.token_urlsafe(24)

    session_entry = PlatformSession(
        platform_user_id=platform_user.id,
        token_jti=token_jti,
        device=request.headers.get("user-agent"),
        ip_address=client_ip,
        status="active",
        login_at=now,
        last_active_at=now,
    )
    db.add(session_entry)

    audit_entry = PlatformAuditLog(
        actor_user_id=platform_user.id,
        actor_role=platform_user.role,
        target_type="platform_user",
        target_id=str(platform_user.id),
        action="platform_login",
        ip_address=client_ip,
        request_id=getattr(request.state, "request_id", None)
    )
    db.add(audit_entry)
    db.commit()

    token_claims = {
        "sub": str(platform_user.id),
        "role": platform_user.role,
        "jti": token_jti,
        "security_version": platform_user.security_version or 0,
    }
    access_token = create_platform_token(token_claims)

    return {
        "access_token": access_token,
        "expires_in": 28800,  # 8 hours
        "user": {
            "id": platform_user.id,
            "email": platform_user.email,
            "username": platform_user.username,
            "full_name": platform_user.full_name,
            "role": platform_user.role,
        }
    }


@router.post("/auth/logout")
def platform_logout(
    request: Request,
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    ctx.session.status = "revoked"
    ctx.session.revoked_at = datetime.datetime.now(datetime.timezone.utc)
    audit_platform_action(
        db, ctx, action="platform_logout", target_type="platform_user",
        target_id=str(ctx.actor.id), ip_address=_client_ip(request),
        request_id=getattr(request.state, "request_id", None)
    )
    db.commit()
    return {"message": "Logged out successfully"}


@router.get("/auth/me")
def platform_me(ctx: PlatformContext = Depends(get_platform_context)):
    return {
        "user": {
            "id": ctx.actor.id,
            "email": ctx.actor.email,
            "username": ctx.actor.username,
            "full_name": ctx.actor.full_name,
            "role": ctx.actor.role,
        }
    }


# --- OMLU OBSERVABILITY OVERVIEW ---

@router.get("/overview")
def platform_overview(
    days: int = Query(default=1, ge=1, le=90),
    restaurant_id: Optional[int] = Query(default=None),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    period_start = now - datetime.timedelta(days=days)

    r_query = db.query(Restaurant)
    if restaurant_id:
        r_query = r_query.filter(Restaurant.id == restaurant_id)
    restaurants = r_query.all()

    total_restaurants = len(restaurants)
    active_restaurants = sum(1 for r in restaurants if r.is_active)
    health_counts = defaultdict(int)
    attention_restaurants = []

    for r in restaurants:
        h = evaluate_restaurant_health(db, r, now=now)
        health_counts[h["status"]] += 1
        if h["status"] in {"Attention Required", "Critical Inconsistency"}:
            attention_restaurants.append({
                "restaurant_id": r.id,
                "restaurant_name": r.name,
                "status": h["status"],
                "reasons": h["reasons"],
            })

    # Operational metrics
    stuck_issues = detect_stuck_sessions(db, restaurant_id=restaurant_id, now=now)
    duplicate_violations = service_detect_duplicate_active_sessions(db)
    separated_billing = calculate_separated_billing_metrics(db, days=days, restaurant_id=restaurant_id, now=now)
    visualizations = generate_operational_visualizations(db, days=days, restaurant_id=restaurant_id, now=now)
    coverage = monitoring_coverage_metadata()
    realtime_snap = realtime_metrics_snapshot()
    insights = generate_plain_language_insights(db, restaurant_id=restaurant_id, days=days, now=now)

    # Determine Overall Platform Operational Status
    platform_status = "Healthy"
    if len(duplicate_violations) > 0 or health_counts["Critical Inconsistency"] > 0:
        platform_status = "Critical Inconsistency Detected"
    elif health_counts["Attention Required"] > 0 or len(stuck_issues) > 0:
        platform_status = "Operational Attention Required"

    return {
        "metadata": {
            "refreshed_at": now.isoformat(),
            "period_days": days,
            "scope": f"Restaurant {restaurant_id}" if restaurant_id else "All Platform Restaurants",
            "timezone_normalized": "UTC / Restaurant Local",
        },
        "platform_status": platform_status,
        "kpis": {
            "total_restaurants": total_restaurants,
            "total_restaurants_monitored": total_restaurants,
            "active_restaurants": active_restaurants,
            "restaurants_healthy": health_counts["Healthy"],
            "restaurants_requiring_attention": len(attention_restaurants),
            "stuck_sessions_count": len(stuck_issues),
            "duplicate_active_sessions_count": len(duplicate_violations),
            "billing_initiation_rate_pct": separated_billing["billing_initiation_rate"]["rate_pct"],
            "billing_completion_rate_pct": separated_billing["billing_completion_rate"]["rate_pct"],
            "post_payment_closure_rate_pct": separated_billing["post_payment_closure_rate"]["rate_pct"],
            "workflow_inconsistencies_count": separated_billing["workflow_inconsistencies_count"],
        },
        "current_realtime_snapshot": {
            "active_websocket_connections": realtime_snap.get("active_websocket_connections", 0),
            "redis_available": realtime_snap.get("redis_available", True),
            "mode": "live_websocket" if realtime_snap.get("redis_available", True) else "polling_fallback",
        },
        "health_summary": dict(health_counts),
        "operational_attention_panel": stuck_issues[:10],
        "duplicate_active_sessions_panel": duplicate_violations[:10],
        "visualizations": visualizations,
        "monitoring_coverage": coverage,
        "plain_language_insights": insights,
    }


# --- RESTAURANT FLEET VIEW ---

@router.get("/restaurants")
def platform_restaurants(
    status_filter: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff_24h = now - datetime.timedelta(hours=24)

    query = db.query(Restaurant)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter(
            or_(
                func.lower(Restaurant.name).like(s),
                func.lower(Restaurant.slug).like(s),
                func.lower(Restaurant.city).like(s)
            )
        )

    restaurants = query.order_by(Restaurant.name.asc()).all()
    result = []

    for r in restaurants:
        health = evaluate_restaurant_health(db, r, now=now)
        if status_filter and health["status"].lower() != status_filter.lower():
            continue

        orders_today = db.query(func.count(Order.id)).filter(Order.restaurant_id == r.id, Order.created_at >= cutoff_24h).scalar() or 0
        open_tables = db.query(func.count(DiningSession.id)).filter(DiningSession.restaurant_id == r.id, DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES)).scalar() or 0
        pending_payments = db.query(func.count(Bill.id)).filter(Bill.restaurant_id == r.id, Bill.status == "payment_pending").scalar() or 0
        active_staff = db.query(func.count(StaffUser.id)).filter(StaffUser.restaurant_id == r.id, StaffUser.status == "active").scalar() or 0

        last_order = db.query(func.max(Order.created_at)).filter(Order.restaurant_id == r.id).scalar()
        last_activity_str = last_order.isoformat() if last_order else "Never"

        result.append({
            "id": r.id,
            "name": r.name,
            "slug": r.slug,
            "city": r.city or "Unspecified",
            "is_active": r.is_active,
            "plan": r.plan,
            "health_status": health["status"],
            "health_reasons": health["reasons"],
            "orders_today": orders_today,
            "open_tables": open_tables,
            "pending_payments": pending_payments,
            "active_staff_count": active_staff,
            "last_activity_at": last_activity_str,
            "timezone": r.timezone,
        })

    return {"restaurants": result, "total": len(result)}


# --- RESTAURANT DETAIL COMMAND CENTRE ---

@router.get("/restaurants/{restaurant_id}")
def platform_restaurant_detail(
    restaurant_id: int,
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    health = evaluate_restaurant_health(db, restaurant, now=now)
    cutoff_24h = now - datetime.timedelta(hours=24)

    orders_today = db.query(func.count(Order.id)).filter(Order.restaurant_id == restaurant.id, Order.created_at >= cutoff_24h).scalar() or 0
    open_sessions = db.query(func.count(DiningSession.id)).filter(DiningSession.restaurant_id == restaurant.id, DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES)).scalar() or 0
    pending_payments = db.query(func.count(Bill.id)).filter(Bill.restaurant_id == restaurant.id, Bill.status == "payment_pending").scalar() or 0
    active_staff = db.query(func.count(StaffUser.id)).filter(StaffUser.restaurant_id == restaurant.id, StaffUser.status == "active").scalar() or 0

    return {
        "header": {
            "id": restaurant.id,
            "name": restaurant.name,
            "slug": restaurant.slug,
            "timezone": restaurant.timezone,
            "city": restaurant.city,
            "is_active": restaurant.is_active,
            "plan": restaurant.plan,
            "health_status": health["status"],
            "health_reasons": health["reasons"],
        },
        "summary": {
            "orders_today": orders_today,
            "open_sessions": open_sessions,
            "pending_payments": pending_payments,
            "active_staff": active_staff,
        },
    }


@router.get("/restaurants/{restaurant_id}/tables")
def platform_restaurant_tables(
    restaurant_id: int,
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    tables = db.query(RestaurantTable).filter(RestaurantTable.restaurant_id == restaurant_id).all()
    active_sessions = db.query(DiningSession).filter(DiningSession.restaurant_id == restaurant_id, DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES)).all()
    session_map = {s.table_id: s for s in active_sessions}

    result = []
    for t in tables:
        session = session_map.get(t.id)
        session_age_mins = 0
        bill_state = "No Bill"
        payment_state = "Unpaid"
        order_count = 0
        anomaly_flags = []

        if session:
            session_age_mins = int((now - session.opened_at).total_seconds() / 60)
            order_count = db.query(func.count(Order.id)).filter(Order.dining_session_id == session.id).scalar() or 0
            bill = db.query(Bill).filter(Bill.dining_session_id == session.id).first()
            if bill:
                bill_state = bill.status
                payment_state = bill.status

            if session_age_mins > 240:
                anomaly_flags.append("Session open unusually long (>4h)")
            if payment_state == "paid":
                anomaly_flags.append("Paid session still occupying table")

        result.append({
            "table_id": t.id,
            "table_number": t.table_number,
            "table_code": t.table_code,
            "is_occupied": session is not None,
            "session_id": session.id if session else None,
            "session_age_minutes": session_age_mins,
            "order_count": order_count,
            "bill_state": bill_state,
            "payment_state": payment_state,
            "anomaly_flags": anomaly_flags,
        })

    return {"tables": result}


# --- PENDING PAYMENTS QUEUE ---

@router.get("/payments")
def platform_payments(
    duration_bucket: Optional[str] = Query(default=None),
    restaurant_id: Optional[int] = Query(default=None),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    query = db.query(Bill).options(joinedload(Bill.restaurant), joinedload(Bill.dining_session)).filter(Bill.status == "payment_pending")

    if restaurant_id:
        query = query.filter(Bill.restaurant_id == restaurant_id)

    bills = query.order_by(Bill.created_at.asc()).all()
    queue = []

    for b in bills:
        waiting_mins = int((now - b.created_at).total_seconds() / 60)
        bucket = "under_5m"
        if 5 <= waiting_mins < 15:
            bucket = "5_15m"
        elif 15 <= waiting_mins < 30:
            bucket = "15_30m"
        elif 30 <= waiting_mins < 60:
            bucket = "30_60m"
        elif waiting_mins >= 60:
            bucket = "over_1h"

        if duration_bucket and duration_bucket != bucket:
            continue

        queue.append({
            "bill_id": b.id,
            "bill_number": b.bill_number,
            "restaurant_id": b.restaurant_id,
            "restaurant_name": b.restaurant.name if b.restaurant else "Unknown",
            "waiting_minutes": waiting_mins,
            "duration_bucket": bucket,
            "created_at": b.created_at.isoformat(),
            "alert_status": "Critical" if waiting_mins >= 30 else "Warning" if waiting_mins >= 15 else "Normal",
        })

    return {"payments": queue, "total_pending": len(queue)}


# --- DIAGNOSTICS & RECOVERY WORKFLOWS ---

@router.get("/diagnostics/duplicate-active-sessions")
def platform_duplicate_active_sessions_diagnostics(
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    """
    Diagnostic-only endpoint surfacing duplicate active table sessions with zero DB mutation.
    """
    violations = service_detect_duplicate_active_sessions(db)
    return {"duplicate_active_sessions": violations, "total_violations": len(violations)}


@router.post("/recovery/finalize-paid-session")
def platform_finalize_paid_session(
    payload: dict,
    request: Request,
    ctx: PlatformContext = Depends(require_platform_role("platform_admin", "platform_owner")),
    db: Session = Depends(get_db)
):
    session_id = payload.get("session_id")
    reason = payload.get("reason")
    if not session_id or not isinstance(session_id, int):
        raise HTTPException(status_code=400, detail="session_id integer is required.")

    request_id = getattr(request.state, "request_id", None)
    return service_finalize_paid_session(
        db,
        session_id=session_id,
        operator_id=ctx.actor.id,
        operator_role=ctx.role,
        reason=reason or "",
        request_id=request_id,
    )


@router.post("/recovery/stale-session-close")
def platform_stale_session_close(
    payload: dict,
    request: Request,
    ctx: PlatformContext = Depends(require_platform_role("platform_admin", "platform_owner")),
    db: Session = Depends(get_db)
):
    session_id = payload.get("session_id")
    reason = payload.get("reason")
    if not session_id or not isinstance(session_id, int):
        raise HTTPException(status_code=400, detail="session_id integer is required.")

    request_id = getattr(request.state, "request_id", None)
    return service_recover_abandoned_empty_session(
        db,
        session_id=session_id,
        operator_id=ctx.actor.id,
        operator_role=ctx.role,
        reason=reason or "",
        request_id=request_id,
    )


# --- SYSTEM TELEMETRY & HEALTH ---

@router.get("/system-health")
def platform_system_health(
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    db_status = "healthy"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unavailable"

    realtime_snap = realtime_metrics_snapshot()

    return {
        "status": "Healthy" if db_status == "healthy" else "Degraded",
        "timestamp": now.isoformat(),
        "components": {
            "api_server": "healthy",
            "postgresql": db_status,
            "redis": "healthy" if realtime_snap.get("redis_available", True) else "not_configured",
            "realtime_broker": "healthy" if realtime_snap.get("redis_available", True) else "degraded",
            "push_service": push_health().get("status", "unknown"),
        },
        "version": {
            "app_version": "0.1.0",
            "migration_revision": "f5e6d7c8b9a0",
        }
    }


# --- PLATFORM AUDIT LOG ---

@router.get("/audit-log")
def platform_audit_log(
    limit: int = Query(default=100, le=500),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    logs = db.query(PlatformAuditLog).options(joinedload(PlatformAuditLog.actor_user)).order_by(PlatformAuditLog.created_at.desc()).limit(limit).all()
    return {
        "audit_logs": [
            {
                "id": log.id,
                "actor_name": log.actor_user.full_name if log.actor_user else "System",
                "actor_role": log.actor_role,
                "action": log.action,
                "target_type": log.target_type,
                "target_id": log.target_id,
                "restaurant_id": log.restaurant_id,
                "ip_address": log.ip_address,
                "previous_value": log.previous_value,
                "new_value": log.new_value,
                "request_id": log.request_id,
                "timestamp": log.created_at.isoformat(),
            } for log in logs
        ]
    }
