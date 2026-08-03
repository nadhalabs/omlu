import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from collections import defaultdict
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, text

from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.order import Order
from app.models.dining_session import DiningSession, ACTIVE_DINING_SESSION_STATUSES
from app.models.bill import Bill
from app.models.quick_sale import QuickSale
from app.models.table_session_participant import TableSessionParticipant
from app.services.realtime import realtime_metrics_snapshot
from app.services.platform_recovery import detect_duplicate_active_sessions


def evaluate_restaurant_health(
    db: Session, restaurant: Restaurant, now: Optional[datetime.datetime] = None
) -> Dict[str, Any]:
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    if not restaurant.is_active:
        return {"status": "Suspended", "reasons": ["Restaurant account is suspended or disabled"]}

    table_count = (
        db.query(func.count(RestaurantTable.id))
        .filter(RestaurantTable.restaurant_id == restaurant.id, RestaurantTable.is_active == True)
        .scalar() or 0
    )
    order_count = (
        db.query(func.count(Order.id))
        .filter(Order.restaurant_id == restaurant.id)
        .scalar() or 0
    )

    if table_count == 0 or order_count == 0:
        return {
            "status": "Onboarding / Incomplete Setup",
            "reasons": ["Initial onboarding in progress; menu/tables or first order pending"],
        }

    cutoff_24h = now - datetime.timedelta(hours=24)
    recent_orders = (
        db.query(func.count(Order.id))
        .filter(Order.restaurant_id == restaurant.id, Order.created_at >= cutoff_24h)
        .scalar() or 0
    )
    recent_sessions = (
        db.query(func.count(DiningSession.id))
        .filter(DiningSession.restaurant_id == restaurant.id, DiningSession.created_at >= cutoff_24h)
        .scalar() or 0
    )

    if recent_orders == 0 and recent_sessions == 0:
        return {
            "status": "No Recent Operational Activity",
            "reasons": ["No order or session activity detected in the last 24 hours"],
        }

    reasons = []

    paid_active = (
        db.query(func.count(DiningSession.id))
        .join(Bill, Bill.dining_session_id == DiningSession.id)
        .filter(
            DiningSession.restaurant_id == restaurant.id,
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
            Bill.status == "paid",
        )
        .scalar() or 0
    )
    if paid_active > 0:
        reasons.append(f"{paid_active} paid session(s) remain active on occupied tables")
        return {"status": "Critical Inconsistency", "reasons": reasons}

    cutoff_4h = now - datetime.timedelta(hours=4)
    stuck_4h = (
        db.query(func.count(DiningSession.id))
        .filter(
            DiningSession.restaurant_id == restaurant.id,
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
            DiningSession.opened_at <= cutoff_4h,
        )
        .scalar() or 0
    )
    if stuck_4h > 0:
        reasons.append(f"{stuck_4h} session(s) open for more than 4 hours")

    cutoff_30m = now - datetime.timedelta(minutes=30)
    pending_30m = (
        db.query(func.count(Bill.id))
        .filter(
            Bill.restaurant_id == restaurant.id,
            Bill.status == "payment_pending",
            Bill.created_at <= cutoff_30m,
        )
        .scalar() or 0
    )
    if pending_30m > 0:
        reasons.append(f"{pending_30m} payment(s) pending for over 30 minutes")

    if len(reasons) > 0:
        return {"status": "Attention Required", "reasons": reasons}

    return {"status": "Healthy", "reasons": []}


def detect_stuck_sessions(
    db: Session, restaurant_id: Optional[int] = None, now: Optional[datetime.datetime] = None
) -> List[Dict[str, Any]]:
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    issues = []
    cutoff_4h = now - datetime.timedelta(hours=4)

    # 1. Paid session still active
    q_paid = (
        db.query(DiningSession)
        .options(joinedload(DiningSession.restaurant), joinedload(DiningSession.table))
        .join(Bill, Bill.dining_session_id == DiningSession.id)
        .filter(
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
            Bill.status == "paid",
        )
    )
    if restaurant_id:
        q_paid = q_paid.filter(DiningSession.restaurant_id == restaurant_id)

    for s in q_paid.all():
        flags = []
        active_participants = (
            db.query(func.count(TableSessionParticipant.id))
            .filter(
                TableSessionParticipant.session_id == s.id,
                TableSessionParticipant.revoked_at.is_(None),
            )
            .scalar() or 0
        )
        if active_participants > 0:
            flags.append("participant_authority_active")
        if s.join_code_hash:
            flags.append("join_code_active")

        issues.append({
            "session_id": s.id,
            "restaurant_id": s.restaurant_id,
            "restaurant_name": s.restaurant.name if s.restaurant else "Unknown",
            "table_name": s.table.table_number if s.table else str(s.table_id),
            "primary_classification": "paid_session_still_active",
            "human_label": "Paid Session Still Occupying Table",
            "confidence": "Confirmed Invariant Violation",
            "severity": "Critical",
            "message": f"Table {s.table.table_number if s.table else s.table_id} payment confirmed but session remains active",
            "opened_at": s.opened_at.isoformat(),
            "diagnostic_flags": flags,
        })

    # 2. Abandoned empty session > 4h
    q_empty = (
        db.query(DiningSession)
        .options(joinedload(DiningSession.restaurant), joinedload(DiningSession.table))
        .filter(
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
            DiningSession.opened_at <= cutoff_4h,
        )
    )
    if restaurant_id:
        q_empty = q_empty.filter(DiningSession.restaurant_id == restaurant_id)

    seen_session_ids = {i["session_id"] for i in issues}

    for s in q_empty.all():
        if s.id in seen_session_ids:
            continue

        valid_orders = (
            db.query(func.count(Order.id))
            .filter(
                Order.dining_session_id == s.id,
                Order.status.notin_(["rejected", "cancelled"]),
            )
            .scalar() or 0
        )

        if valid_orders == 0:
            duration_hours = round((now - s.opened_at).total_seconds() / 3600, 1)
            flags = ["no_valid_orders"]
            active_participants = (
                db.query(func.count(TableSessionParticipant.id))
                .filter(
                    TableSessionParticipant.session_id == s.id,
                    TableSessionParticipant.revoked_at.is_(None),
                )
                .scalar() or 0
            )
            if active_participants > 0:
                flags.append("participant_authority_active")

            issues.append({
                "session_id": s.id,
                "restaurant_id": s.restaurant_id,
                "restaurant_name": s.restaurant.name if s.restaurant else "Unknown",
                "table_name": s.table.table_number if s.table else str(s.table_id),
                "primary_classification": "stale_unpaid_session",
                "human_label": "Abandoned Empty Session",
                "confidence": "High-Confidence Inconsistency",
                "severity": "High",
                "message": f"Table {s.table.table_number if s.table else s.table_id} session open for {duration_hours} hours without orders",
                "opened_at": s.opened_at.isoformat(),
                "diagnostic_flags": flags,
            })

    return issues


def generate_operational_alerts(db: Session, now: Optional[datetime.datetime] = None) -> List[Dict[str, Any]]:
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    alerts = []

    stuck_sessions = detect_stuck_sessions(db, now=now)
    for issue in stuck_sessions:
        alerts.append({
            "id": f"stuck_session_{issue['session_id']}",
            "severity": issue["severity"],
            "title": f"Stuck Session at {issue['restaurant_name']}",
            "message": issue["message"],
            "restaurant_id": issue["restaurant_id"],
            "restaurant_name": issue["restaurant_name"],
            "entity_type": "dining_session",
            "entity_id": str(issue["session_id"]),
            "timestamp": issue["opened_at"],
        })

    cutoff_30m = now - datetime.timedelta(minutes=30)
    pending_bills = db.query(Bill).options(joinedload(Bill.restaurant)).filter(
        Bill.status == "payment_pending",
        Bill.created_at <= cutoff_30m
    ).all()

    for bill in pending_bills:
        waiting_mins = int((now - bill.created_at).total_seconds() / 60)
        alerts.append({
            "id": f"pending_bill_{bill.id}",
            "severity": "High" if waiting_mins >= 60 else "Medium",
            "title": f"Pending Payment at {bill.restaurant.name if bill.restaurant else 'Restaurant'}",
            "message": f"Bill #{bill.bill_number} pending for {waiting_mins} minutes",
            "restaurant_id": bill.restaurant_id,
            "restaurant_name": bill.restaurant.name if bill.restaurant else "Unknown",
            "entity_type": "bill",
            "entity_id": str(bill.id),
            "timestamp": bill.created_at.isoformat(),
        })

    severity_rank = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    alerts.sort(key=lambda a: (severity_rank.get(a["severity"], 99), a["id"]))
    return alerts


def generate_plain_language_insights(
    db: Session,
    restaurant_id: Optional[int] = None,
    days: int = 7,
    now: Optional[datetime.datetime] = None
) -> List[Dict[str, Any]]:
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    insights = []
    stuck = detect_stuck_sessions(db, restaurant_id=restaurant_id, now=now)
    if len(stuck) > 0:
        insights.append({
            "category": "Operations",
            "severity": "Alert",
            "text": f"{len(stuck)} dining session(s) require operational attention due to excessive duration or status inconsistencies.",
            "comparison_period": "Live operational state",
            "metric_value": f"{len(stuck)} stuck sessions",
            "drilldown_path": f"/platform/sessions{'?restaurant_id=' + str(restaurant_id) if restaurant_id else ''}",
        })

    return insights


def calculate_separated_billing_metrics(
    db: Session,
    days: int = 1,
    restaurant_id: Optional[int] = None,
    now: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    period_start = now - datetime.timedelta(days=days)

    q_served_sessions = (
        db.query(func.count(DiningSession.id))
        .join(Order, Order.dining_session_id == DiningSession.id)
        .filter(
            DiningSession.created_at >= period_start,
            Order.status == "served",
        )
    )
    q_requested_sessions = (
        db.query(func.count(DiningSession.id))
        .filter(
            DiningSession.created_at >= period_start,
            DiningSession.status.in_(["payment_requested", "payment_pending", "paid", "closed"]),
        )
    )
    if restaurant_id:
        q_served_sessions = q_served_sessions.filter(DiningSession.restaurant_id == restaurant_id)
        q_requested_sessions = q_requested_sessions.filter(DiningSession.restaurant_id == restaurant_id)

    served_count = q_served_sessions.scalar() or 0
    requested_count = q_requested_sessions.scalar() or 0

    initiation_rate = (
        round((requested_count / served_count) * 100, 1) if served_count >= 5 else None
    )

    q_issued_bills = db.query(func.count(Bill.id)).filter(
        Bill.created_at >= period_start, Bill.status.in_(["issued", "payment_pending", "paid"])
    )
    q_paid_bills = db.query(func.count(Bill.id)).filter(
        Bill.created_at >= period_start, Bill.status == "paid"
    )
    if restaurant_id:
        q_issued_bills = q_issued_bills.filter(Bill.restaurant_id == restaurant_id)
        q_paid_bills = q_paid_bills.filter(Bill.restaurant_id == restaurant_id)

    issued_count = q_issued_bills.scalar() or 0
    paid_count = q_paid_bills.scalar() or 0

    completion_rate = (
        round((paid_count / issued_count) * 100, 1) if issued_count >= 5 else None
    )

    q_paid_sessions = db.query(func.count(DiningSession.id)).filter(
        DiningSession.paid_at >= period_start
    )
    q_closed_paid_sessions = db.query(func.count(DiningSession.id)).filter(
        DiningSession.paid_at >= period_start, DiningSession.status == "closed"
    )
    if restaurant_id:
        q_paid_sessions = q_paid_sessions.filter(DiningSession.restaurant_id == restaurant_id)
        q_closed_paid_sessions = q_closed_paid_sessions.filter(DiningSession.restaurant_id == restaurant_id)

    total_paid_sessions = q_paid_sessions.scalar() or 0
    closed_paid_sessions = q_closed_paid_sessions.scalar() or 0

    closure_rate = (
        round((closed_paid_sessions / total_paid_sessions) * 100, 1)
        if total_paid_sessions >= 5
        else None
    )

    inconsistencies = detect_stuck_sessions(db, restaurant_id=restaurant_id, now=now)

    return {
        "billing_initiation_rate": {
            "rate_pct": initiation_rate,
            "numerator": requested_count,
            "denominator": served_count,
            "reliability_status": "Reliable" if served_count >= 5 else "Insufficient Sample",
        },
        "billing_completion_rate": {
            "rate_pct": completion_rate,
            "numerator": paid_count,
            "denominator": issued_count,
            "reliability_status": "Reliable" if issued_count >= 5 else "Insufficient Sample",
        },
        "post_payment_closure_rate": {
            "rate_pct": closure_rate,
            "numerator": closed_paid_sessions,
            "denominator": total_paid_sessions,
            "reliability_status": "Reliable" if total_paid_sessions >= 5 else "Insufficient Sample",
        },
        "workflow_inconsistencies_count": len(inconsistencies),
    }


def generate_operational_visualizations(
    db: Session,
    days: int = 1,
    restaurant_id: Optional[int] = None,
    now: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    """
    Generates all 6 concrete Phase 1 operational chart payloads backed 100% by authoritative DB data:
    1. Session Lifecycle Funnel
    2. Workflow Issues by Category
    3. Session Age Distribution
    4. Pending Workflow Ageing
    5. Billing Reliability Time Series
    6. Restaurant Operational-Attention Matrix
    """
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    period_start = now - datetime.timedelta(days=days)

    # 1. Session Lifecycle Funnel
    q_base = db.query(DiningSession).filter(DiningSession.created_at >= period_start)
    if restaurant_id:
        q_base = q_base.filter(DiningSession.restaurant_id == restaurant_id)

    all_sessions = q_base.all()
    opened_c = len(all_sessions)
    ordered_c = sum(1 for s in all_sessions if len(s.orders) > 0)
    req_c = sum(1 for s in all_sessions if s.status in ["payment_requested", "payment_pending", "paid", "closed"])
    issued_c = sum(1 for s in all_sessions if s.bill is not None)
    paid_c = sum(1 for s in all_sessions if s.bill and s.bill.status == "paid")
    closed_c = sum(1 for s in all_sessions if s.status == "closed")

    funnel = [
        {"stage": "Opened", "count": opened_c, "conversion_pct": 100.0},
        {"stage": "Ordered", "count": ordered_c, "conversion_pct": round((ordered_c / opened_c * 100), 1) if opened_c else 0.0},
        {"stage": "Bill Requested", "count": req_c, "conversion_pct": round((req_c / opened_c * 100), 1) if opened_c else 0.0},
        {"stage": "Bill Issued", "count": issued_c, "conversion_pct": round((issued_c / opened_c * 100), 1) if opened_c else 0.0},
        {"stage": "Paid", "count": paid_c, "conversion_pct": round((paid_c / opened_c * 100), 1) if opened_c else 0.0},
        {"stage": "Closed", "count": closed_c, "conversion_pct": round((closed_c / opened_c * 100), 1) if opened_c else 0.0},
    ]

    # 2. Workflow Issues by Category
    stuck_issues = detect_stuck_sessions(db, restaurant_id=restaurant_id, now=now)
    issues_by_cat = defaultdict(int)
    for issue in stuck_issues:
        issues_by_cat[issue["human_label"]] += 1

    issues_chart = [{"category": cat, "count": cnt} for cat, cnt in issues_by_cat.items()]

    # 3. Session Age Distribution
    q_active = db.query(DiningSession).filter(DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES))
    if restaurant_id:
        q_active = q_active.filter(DiningSession.restaurant_id == restaurant_id)

    age_buckets = {"under_30m": 0, "30_60m": 0, "1_2h": 0, "2_4h": 0, "4_12h": 0, "over_12h": 0}
    for s in q_active.all():
        age_mins = int((now - s.opened_at).total_seconds() / 60)
        if age_mins < 30:
            age_buckets["under_30m"] += 1
        elif 30 <= age_mins < 60:
            age_buckets["30_60m"] += 1
        elif 60 <= age_mins < 120:
            age_buckets["1_2h"] += 1
        elif 120 <= age_mins < 240:
            age_buckets["2_4h"] += 1
        elif 240 <= age_mins < 720:
            age_buckets["4_12h"] += 1
        else:
            age_buckets["over_12h"] += 1

    age_chart = [{"bucket": b, "count": cnt} for b, cnt in age_buckets.items()]

    # 4. Pending Workflow Ageing
    q_pending_bills = db.query(Bill).filter(Bill.status == "payment_pending")
    if restaurant_id:
        q_pending_bills = q_pending_bills.filter(Bill.restaurant_id == restaurant_id)

    pending_buckets = {"under_5m": 0, "5_15m": 0, "15_60m": 0, "1_6h": 0, "over_6h": 0}
    for b in q_pending_bills.all():
        wait_mins = int((now - b.created_at).total_seconds() / 60)
        if wait_mins < 5:
            pending_buckets["under_5m"] += 1
        elif 5 <= wait_mins < 15:
            pending_buckets["5_15m"] += 1
        elif 15 <= wait_mins < 60:
            pending_buckets["15_60m"] += 1
        elif 60 <= wait_mins < 360:
            pending_buckets["1_6h"] += 1
        else:
            pending_buckets["over_6h"] += 1

    pending_chart = [{"bucket": b, "count": cnt} for b, cnt in pending_buckets.items()]

    # 5. Billing Reliability Time Series (Daily breakdown)
    reliability_series = []
    for day_offset in range(days - 1, -1, -1):
        day_date = (now - datetime.timedelta(days=day_offset)).date()
        m = calculate_separated_billing_metrics(db, days=1, restaurant_id=restaurant_id, now=now)
        reliability_series.append({
            "date": day_date.isoformat(),
            "initiation_rate_pct": m["billing_initiation_rate"]["rate_pct"],
            "completion_rate_pct": m["billing_completion_rate"]["rate_pct"],
            "closure_rate_pct": m["post_payment_closure_rate"]["rate_pct"],
            "reliability_status": m["billing_completion_rate"]["reliability_status"],
        })

    # 6. Restaurant Operational-Attention Matrix
    attention_matrix = []
    r_query = db.query(Restaurant)
    if restaurant_id:
        r_query = r_query.filter(Restaurant.id == restaurant_id)
    for r in r_query.all():
        health = evaluate_restaurant_health(db, r, now=now)
        if health["status"] in {"Attention Required", "Critical Inconsistency"}:
            stuck_count = (
                db.query(func.count(DiningSession.id))
                .filter(
                    DiningSession.restaurant_id == r.id,
                    DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
                    DiningSession.opened_at <= now - datetime.timedelta(hours=4),
                )
                .scalar() or 0
            )
            pending_bills_count = (
                db.query(func.count(Bill.id))
                .filter(Bill.restaurant_id == r.id, Bill.status == "payment_pending")
                .scalar() or 0
            )
            attention_matrix.append({
                "restaurant_id": r.id,
                "restaurant_name": r.name,
                "health_status": health["status"],
                "reasons": health["reasons"],
                "stuck_sessions_count": stuck_count,
                "pending_payments_count": pending_bills_count,
            })

    return {
        "session_lifecycle_funnel": funnel,
        "workflow_issues_by_category": issues_chart,
        "session_age_distribution": age_chart,
        "pending_workflow_ageing": pending_chart,
        "billing_reliability_time_series": reliability_series,
        "restaurant_operational_attention_matrix": attention_matrix,
    }


def monitoring_coverage_metadata() -> Dict[str, Any]:
    return {
        "available_now": [
            "Session Lifecycle State & Funnels",
            "Billing Workflow Integrity & Pending Queues",
            "Platform Transactional Audit Trail",
            "Current Realtime Snapshot",
            "Audited Safe Recovery (Stale Session & Paid Finalization)",
        ],
        "not_instrumented": [
            "API Latency Percentiles (P95/P99) - Phase 2 Middleware",
            "Sanitised Error Fingerprints - Phase 2 Error Sink",
            "Device Heartbeats & Client Versions - Phase 3 Heartbeat Protocol",
            "Historical Percentage Uptime - Phase 5 Scheduled Probe Worker",
            "Deployment Before/After Markers - Phase 5 Operational Event Sink",
        ],
    }
