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
from app.models.payment import Payment, RevenueEntry
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
)
from app.services.realtime import broker, realtime_metrics_snapshot
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


# --- PLATFORM OVERVIEW DASHBOARD ---

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
        if h["status"] in {"Attention", "Degraded", "Offline"}:
            attention_restaurants.append({
                "restaurant_id": r.id,
                "restaurant_name": r.name,
                "status": h["status"],
                "reasons": h["reasons"],
            })

    order_query = db.query(Order).filter(Order.created_at >= period_start)
    if restaurant_id:
        order_query = order_query.filter(Order.restaurant_id == restaurant_id)
    orders_in_period = order_query.all()

    total_orders_today = len(orders_in_period)
    active_orders_today = sum(1 for o in orders_in_period if o.status in {"pending", "accepted", "preparing", "ready"})

    gross_order_value = sum(o.subtotal for o in orders_in_period)
    
    bill_query = db.query(Bill).filter(Bill.created_at >= period_start)
    if restaurant_id:
        bill_query = bill_query.filter(Bill.restaurant_id == restaurant_id)
    bills = bill_query.all()

    collected_revenue = sum(b.total_amount for b in bills if b.status == "paid")
    pending_collection = sum(b.total_amount for b in bills if b.status == "payment_pending")

    quick_sales = db.query(QuickSale).filter(
        QuickSale.created_at >= period_start,
        QuickSale.status.in_(["completed", "paid", "served"])
    )
    if restaurant_id:
        quick_sales = quick_sales.filter(QuickSale.restaurant_id == restaurant_id)
    completed_quick_sale_revenue = sum(qs.total_amount for qs in quick_sales.all())

    open_sessions = db.query(func.count(DiningSession.id)).filter(
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        *( [DiningSession.restaurant_id == restaurant_id] if restaurant_id else [] )
    ).scalar() or 0

    pending_payments_count = db.query(func.count(Bill.id)).filter(
        Bill.status == "payment_pending",
        *( [Bill.restaurant_id == restaurant_id] if restaurant_id else [] )
    ).scalar() or 0

    alerts = generate_operational_alerts(db, now=now)
    insights = generate_plain_language_insights(db, restaurant_id=restaurant_id, days=days, now=now)
    realtime_snap = realtime_metrics_snapshot()

    return {
        "metadata": {
            "refreshed_at": now.isoformat(),
            "period_days": days,
            "scope": f"Restaurant {restaurant_id}" if restaurant_id else "All Platform Restaurants",
            "timezone_normalized": "UTC / Restaurant Local",
        },
        "kpis": {
            "total_restaurants": total_restaurants,
            "active_restaurants": active_restaurants,
            "restaurants_online": health_counts["Healthy"],
            "restaurants_requiring_attention": len(attention_restaurants),
            "orders_today": total_orders_today,
            "active_orders": active_orders_today,
            "gross_order_value": float(gross_order_value),
            "collected_revenue": float(collected_revenue),
            "pending_collection": float(pending_collection),
            "completed_quick_sale_revenue": float(completed_quick_sale_revenue),
            "open_table_sessions": open_sessions,
            "pending_payments": pending_payments_count,
            "realtime_connected_clients": realtime_snap.get("active_websocket_connections", 0),
        },
        "health_summary": dict(health_counts),
        "operational_attention_panel": alerts[:10],
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
        collected_today = db.query(func.coalesce(func.sum(Bill.total_amount), 0)).filter(Bill.restaurant_id == r.id, Bill.status == "paid", Bill.paid_at >= cutoff_24h).scalar() or 0
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
            "collected_revenue_today": float(collected_today),
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
    collected_today = db.query(func.coalesce(func.sum(Bill.total_amount), 0)).filter(Bill.restaurant_id == restaurant.id, Bill.status == "paid", Bill.paid_at >= cutoff_24h).scalar() or 0
    pending_today = db.query(func.coalesce(func.sum(Bill.total_amount), 0)).filter(Bill.restaurant_id == restaurant.id, Bill.status == "payment_pending").scalar() or 0

    open_sessions = db.query(func.count(DiningSession.id)).filter(DiningSession.restaurant_id == restaurant.id, DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES)).scalar() or 0
    pending_payments = db.query(func.count(Bill.id)).filter(Bill.restaurant_id == restaurant.id, Bill.status == "payment_pending").scalar() or 0
    active_staff = db.query(func.count(StaffUser.id)).filter(StaffUser.restaurant_id == restaurant.id, StaffUser.status == "active").scalar() or 0

    insights = generate_plain_language_insights(db, restaurant_id=restaurant_id, days=7, now=now)

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
            "contact_email": restaurant.contact_email if ctx.can_access("platform_support") else None,
            "phone_number": restaurant.phone_number if ctx.can_access("platform_support") else None,
        },
        "summary": {
            "orders_today": orders_today,
            "collected_revenue_today": float(collected_today),
            "pending_collection_today": float(pending_today),
            "open_sessions": open_sessions,
            "pending_payments": pending_payments,
            "active_staff": active_staff,
        },
        "insights": insights,
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


@router.get("/restaurants/{restaurant_id}/orders")
def platform_restaurant_orders(
    restaurant_id: int,
    limit: int = Query(default=50, le=200),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    orders = db.query(Order).options(joinedload(Order.table)).filter(Order.restaurant_id == restaurant_id).order_by(Order.created_at.desc()).limit(limit).all()
    now = datetime.datetime.now(datetime.timezone.utc)

    return {
        "orders": [
            {
                "id": o.id,
                "order_number": o.order_number,
                "table_number": o.table.table_number if o.table else "Quick Sale / Counter",
                "status": o.status,
                "total_amount": float(o.subtotal),
                "created_at": o.created_at.isoformat(),
                "duration_minutes": int((now - o.created_at).total_seconds() / 60),
                "order_source": o.source or "customer_qr",
                "idempotency_key": getattr(o, "idempotency_key", "")[:8] + "..." if getattr(o, "idempotency_key", None) else None,
            } for o in orders
        ]
    }


@router.get("/restaurants/{restaurant_id}/bills")
def platform_restaurant_bills(
    restaurant_id: int,
    limit: int = Query(default=50, le=200),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    bills = db.query(Bill).filter(Bill.restaurant_id == restaurant_id).order_by(Bill.created_at.desc()).limit(limit).all()
    return {
        "bills": [
            {
                "id": b.id,
                "bill_number": b.bill_number,
                "total_amount": float(b.total_amount),
                "bill_status": b.status,
                "payment_status": b.status,
                "payment_method": b.payment_method,
                "created_at": b.created_at.isoformat(),
                "paid_at": b.paid_at.isoformat() if b.paid_at else None,
            } for b in bills
        ]
    }


@router.get("/restaurants/{restaurant_id}/staff")
def platform_restaurant_staff(
    restaurant_id: int,
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    staff_list = db.query(StaffUser).filter(StaffUser.restaurant_id == restaurant_id).all()
    return {
        "staff": [
            {
                "id": s.id,
                "name": s.name,
                "username": s.username,
                "email": s.email,
                "role": s.role,
                "status": s.status,
                "is_active": s.is_active,
                "operations_locked": s.operations_locked,
                "security_version": s.security_version,
                "last_login_at": s.last_login_at.isoformat() if s.last_login_at else None,
            } for s in staff_list
        ]
    }


@router.get("/restaurants/{restaurant_id}/config-readiness")
def platform_restaurant_config(
    restaurant_id: int,
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    tables_count = db.query(func.count(RestaurantTable.id)).filter(RestaurantTable.restaurant_id == restaurant_id, RestaurantTable.is_active == True).scalar() or 0
    menu_items_count = db.query(func.count(MenuItem.id)).filter(MenuItem.restaurant_id == restaurant_id, MenuItem.is_available == True).scalar() or 0
    staff_count = db.query(func.count(StaffUser.id)).filter(StaffUser.restaurant_id == restaurant_id, StaffUser.status == "active").scalar() or 0

    readiness = {
        "timezone_configured": bool(restaurant.timezone),
        "tables_configured": tables_count > 0,
        "tables_count": tables_count,
        "menu_configured": menu_items_count > 0,
        "active_menu_items": menu_items_count,
        "staff_configured": staff_count > 0,
        "active_staff_count": staff_count,
        "gst_enabled": restaurant.gst_enabled,
        "gstin_present": bool(restaurant.gstin) if restaurant.gst_enabled else True,
        "is_ready_for_service": tables_count > 0 and menu_items_count > 0 and staff_count > 0,
    }
    return readiness


# --- LIVE OPERATIONS ---

@router.get("/live-operations")
def platform_live_operations(
    restaurant_id: Optional[int] = Query(default=None),
    limit: int = Query(default=50, le=200),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    recent_orders = db.query(Order).options(joinedload(Order.restaurant), joinedload(Order.table)).order_by(Order.created_at.desc())
    if restaurant_id:
        recent_orders = recent_orders.filter(Order.restaurant_id == restaurant_id)
    orders = recent_orders.limit(limit).all()

    events = []
    for o in orders:
        events.append({
            "event_id": f"evt_order_{o.id}",
            "timestamp": o.created_at.isoformat(),
            "restaurant_id": o.restaurant_id,
            "restaurant_name": o.restaurant.name if o.restaurant else f"Restaurant #{o.restaurant_id}",
            "event_type": f"order.{o.status}",
            "entity_id": str(o.id),
            "reference": f"Order #{o.order_number} (Table {o.table.table_number if o.table else 'Counter'})",
            "success": True,
        })

    realtime_snap = realtime_metrics_snapshot()
    return {
        "refreshed_at": now.isoformat(),
        "events": events,
        "realtime_status": {
            "broker_healthy": realtime_snap.get("redis_available", True),
            "active_connections": realtime_snap.get("active_websocket_connections", 0),
            "mode": "live_websocket" if realtime_snap.get("redis_available", True) else "polling_fallback",
        }
    }


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
            "total_amount": float(b.total_amount),
            "payment_code": getattr(b, "payment_code_ciphertext", None),
            "waiting_minutes": waiting_mins,
            "duration_bucket": bucket,
            "created_at": b.created_at.isoformat(),
            "alert_status": "Critical" if waiting_mins >= 30 else "Warning" if waiting_mins >= 15 else "Normal",
        })

    return {"payments": queue, "total_pending": len(queue)}


# --- REVENUE & RECONCILIATION ---

@router.get("/revenue")
def platform_revenue(
    days: int = Query(default=30, ge=1, le=365),
    restaurant_id: Optional[int] = Query(default=None),
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    now = datetime.datetime.now(datetime.timezone.utc)
    period_start = now - datetime.timedelta(days=days)

    bill_q = db.query(Bill).filter(Bill.created_at >= period_start)
    qs_q = db.query(QuickSale).filter(QuickSale.created_at >= period_start)

    if restaurant_id:
        bill_q = bill_q.filter(Bill.restaurant_id == restaurant_id)
        qs_q = qs_q.filter(QuickSale.restaurant_id == restaurant_id)

    bills = bill_q.all()
    quick_sales = qs_q.all()

    collected_dining = sum(b.total_amount for b in bills if b.status == "paid")
    pending_dining = sum(b.total_amount for b in bills if b.status == "payment_pending")
    completed_quick_sales = sum(qs.total_amount for qs in quick_sales if qs.status in ["completed", "paid", "served"])

    cash_total = sum(b.total_amount for b in bills if b.status == "paid" and b.payment_method in ["cash", "counter_cash"])
    upi_total = sum(b.total_amount for b in bills if b.status == "paid" and b.payment_method in ["upi", "counter_upi"])

    cgst = sum(b.cgst_amount or Decimal("0.00") for b in bills if b.status == "paid")
    sgst = sum(b.sgst_amount or Decimal("0.00") for b in bills if b.status == "paid")

    return {
        "period_days": days,
        "collected_dining_revenue": float(collected_dining),
        "completed_quick_sale_revenue": float(completed_quick_sales),
        "pending_collection": float(pending_dining),
        "payment_methods": {
            "cash": float(cash_total),
            "upi": float(upi_total),
        },
        "tax_breakdown": {
            "cgst": float(cgst),
            "sgst": float(sgst),
            "total_gst": float(cgst + sgst),
        },
        "reconciliation_anomalies": [],
    }


# --- INCIDENTS & ALERTS ---

@router.get("/incidents")
def platform_incidents(
    ctx: PlatformContext = Depends(get_platform_context),
    db: Session = Depends(get_db)
):
    alerts = generate_operational_alerts(db)
    return {"incidents": alerts, "total_active": len(alerts)}


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
        "metrics": {
            "active_connections": realtime_snap.get("active_websocket_connections", 0),
            "average_latency_ms": realtime_snap.get("average_delivery_latency_ms", 0.0),
            "error_rate_5xx": 0.0,
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
                "timestamp": log.created_at.isoformat(),
            } for log in logs
        ]
    }
