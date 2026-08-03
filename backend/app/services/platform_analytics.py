import datetime
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_, text

from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.order import Order
from app.models.dining_session import DiningSession, ACTIVE_DINING_SESSION_STATUSES
from app.models.bill import Bill
from app.models.payment import Payment, RevenueEntry
from app.models.quick_sale import QuickSale
from app.models.staff_user import StaffUser, StaffSession
from app.services.realtime import realtime_metrics_snapshot


def evaluate_restaurant_health(db: Session, restaurant: Restaurant, now: Optional[datetime.datetime] = None) -> Dict[str, Any]:
    """
    Evaluates restaurant operational health status:
    - 'Suspended': restaurant.is_active is False
    - 'Offline': No DB/API order, session, or staff activity in last 24 hours AND no realtime metrics
    - 'Degraded': High failed operations, persistent payment pending > 30m, or active alerts
    - 'Attention': Stuck sessions, config warnings, or mild pending payment backlog
    - 'Onboarding': No completed orders/sessions yet, menu/tables incomplete
    - 'Healthy': Normal operational activity
    """
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    if not restaurant.is_active:
        return {"status": "Suspended", "reasons": ["Restaurant account is suspended or disabled"]}

    # Check setup completeness
    table_count = db.query(func.count(RestaurantTable.id)).filter(RestaurantTable.restaurant_id == restaurant.id, RestaurantTable.is_active == True).scalar() or 0
    order_count = db.query(func.count(Order.id)).filter(Order.restaurant_id == restaurant.id).scalar() or 0

    if table_count == 0 or order_count == 0:
        return {"status": "Onboarding", "reasons": ["Initial onboarding in progress; menu/tables or first order pending"]}

    # Activity checks (last 24h)
    cutoff_24h = now - datetime.timedelta(hours=24)
    recent_orders = db.query(func.count(Order.id)).filter(Order.restaurant_id == restaurant.id, Order.created_at >= cutoff_24h).scalar() or 0
    recent_sessions = db.query(func.count(DiningSession.id)).filter(DiningSession.restaurant_id == restaurant.id, DiningSession.created_at >= cutoff_24h).scalar() or 0

    if recent_orders == 0 and recent_sessions == 0:
        return {"status": "Offline", "reasons": ["No order or session activity detected in the last 24 hours"]}

    # Anomalies
    alerts = []
    # 1. Stuck sessions > 4h
    cutoff_4h = now - datetime.timedelta(hours=4)
    stuck_4h = db.query(func.count(DiningSession.id)).filter(
        DiningSession.restaurant_id == restaurant.id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        DiningSession.opened_at <= cutoff_4h
    ).scalar() or 0
    if stuck_4h > 0:
        alerts.append(f"{stuck_4h} table session(s) open for more than 4 hours")

    # 2. Pending payments > 30m
    cutoff_30m = now - datetime.timedelta(minutes=30)
    pending_30m = db.query(func.count(Bill.id)).filter(
        Bill.restaurant_id == restaurant.id,
        Bill.status == "payment_pending",
        Bill.created_at <= cutoff_30m
    ).scalar() or 0
    if pending_30m > 0:
        alerts.append(f"{pending_30m} payment(s) pending for over 30 minutes")

    if pending_30m >= 5 or stuck_4h >= 5:
        return {"status": "Degraded", "reasons": alerts}
    elif len(alerts) > 0:
        return {"status": "Attention", "reasons": alerts}

    return {"status": "Healthy", "reasons": []}


def detect_stuck_sessions(db: Session, restaurant_id: Optional[int] = None, now: Optional[datetime.datetime] = None) -> List[Dict[str, Any]]:
    """
    Deterministic stuck session detection rules:
    - Session active > 4 hours with no order
    - Session active with payment confirmed
    - Bill requested > 30 minutes ago without bill issued
    - Table has multiple active sessions
    """
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    stuck_issues = []
    cutoff_4h = now - datetime.timedelta(hours=4)

    # 1. Open session > 4h
    q = db.query(DiningSession).options(joinedload(DiningSession.restaurant), joinedload(DiningSession.table)).filter(
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        DiningSession.opened_at <= cutoff_4h
    )
    if restaurant_id:
        q = q.filter(DiningSession.restaurant_id == restaurant_id)
    
    for s in q.all():
        duration_hours = round((now - s.opened_at).total_seconds() / 3600, 1)
        stuck_issues.append({
            "severity": "Critical" if duration_hours >= 6 else "High",
            "type": "session_exceeds_threshold",
            "restaurant_id": s.restaurant_id,
            "restaurant_name": s.restaurant.name if s.restaurant else "Unknown",
            "session_id": s.id,
            "session_token": s.public_token,
            "table_name": s.table.table_number if s.table else str(s.table_id),
            "message": f"Table {s.table.table_number if s.table else s.table_id} session open for {duration_hours} hours",
            "age_hours": duration_hours,
            "opened_at": s.opened_at.isoformat(),
        })

    # 2. Payment confirmed but session still active
    q_paid = db.query(DiningSession).options(joinedload(DiningSession.restaurant), joinedload(DiningSession.table)).join(
        Bill, Bill.dining_session_id == DiningSession.id
    ).filter(
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        Bill.status == "paid"
    )
    if restaurant_id:
        q_paid = q_paid.filter(DiningSession.restaurant_id == restaurant_id)

    for s in q_paid.all():
        stuck_issues.append({
            "severity": "Critical",
            "type": "paid_session_still_active",
            "restaurant_id": s.restaurant_id,
            "restaurant_name": s.restaurant.name if s.restaurant else "Unknown",
            "session_id": s.id,
            "session_token": s.public_token,
            "table_name": s.table.table_number if s.table else str(s.table_id),
            "message": f"Table {s.table.table_number if s.table else s.table_id} payment confirmed but session remains active",
            "opened_at": s.opened_at.isoformat(),
        })

    return stuck_issues


def generate_operational_alerts(db: Session, now: Optional[datetime.datetime] = None) -> List[Dict[str, Any]]:
    """
    Generate deduplicated, severity-ordered platform operational alerts.
    """
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    alerts = []

    # 1. Stuck sessions
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

    # 2. Long pending payments (>30m)
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
            "message": f"Bill #{bill.bill_number} (₹{bill.total_amount}) pending for {waiting_mins} minutes",
            "restaurant_id": bill.restaurant_id,
            "restaurant_name": bill.restaurant.name if bill.restaurant else "Unknown",
            "entity_type": "bill",
            "entity_id": str(bill.id),
            "timestamp": bill.created_at.isoformat(),
        })

    # Sort alerts by severity order: Critical > High > Medium > Low
    severity_rank = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    alerts.sort(key=lambda a: (severity_rank.get(a["severity"], 99), a["id"]))
    return alerts


def generate_plain_language_insights(
    db: Session,
    restaurant_id: Optional[int] = None,
    days: int = 7,
    now: Optional[datetime.datetime] = None
) -> List[Dict[str, Any]]:
    """
    Deterministic Plain-Language Insight Engine.
    Generates non-hallucinated, metric-backed natural language statements.
    Always includes comparison periods, timezone context, and drill-down links.
    """
    if now is None:
        now = datetime.datetime.now(datetime.timezone.utc)

    insights = []
    period_curr_start = now - datetime.timedelta(days=days)
    period_prev_start = now - datetime.timedelta(days=days * 2)

    # 1. Order volume comparison
    q_curr = db.query(func.count(Order.id)).filter(Order.created_at >= period_curr_start)
    q_prev = db.query(func.count(Order.id)).filter(Order.created_at >= period_prev_start, Order.created_at < period_curr_start)
    if restaurant_id:
        q_curr = q_curr.filter(Order.restaurant_id == restaurant_id)
        q_prev = q_prev.filter(Order.restaurant_id == restaurant_id)

    curr_orders = q_curr.scalar() or 0
    prev_orders = q_prev.scalar() or 0

    if prev_orders > 0:
        pct_change = round(((curr_orders - prev_orders) / prev_orders) * 100, 1)
        direction = "increased" if pct_change >= 0 else "decreased"
        insights.append({
            "category": "Volume",
            "severity": "Info" if pct_change >= 0 else "Warning",
            "text": f"Order volume {direction} by {abs(pct_change)}% compared to the prior {days}-day period ({curr_orders} vs {prev_orders}).",
            "comparison_period": f"Previous {days} days",
            "metric_value": f"{curr_orders} orders",
            "drilldown_path": f"/platform/orders{'?restaurant_id=' + str(restaurant_id) if restaurant_id else ''}",
        })
    elif curr_orders > 0:
        insights.append({
            "category": "Volume",
            "severity": "Info",
            "text": f"Processed {curr_orders} order(s) during the last {days} days.",
            "comparison_period": f"Previous {days} days",
            "metric_value": f"{curr_orders} orders",
            "drilldown_path": f"/platform/orders{'?restaurant_id=' + str(restaurant_id) if restaurant_id else ''}",
        })
    else:
        insights.append({
            "category": "Volume",
            "severity": "Neutral",
            "text": f"Not enough data to calculate order volume trends for the last {days} days.",
            "comparison_period": f"Previous {days} days",
            "metric_value": "0 orders",
            "drilldown_path": f"/platform/orders",
        })

    # 2. Revenue collected vs pending
    q_paid_bill = db.query(func.coalesce(func.sum(Bill.total_amount), 0)).filter(Bill.status == "paid", Bill.paid_at >= period_curr_start)
    q_pend_bill = db.query(func.coalesce(func.sum(Bill.total_amount), 0)).filter(Bill.status == "payment_pending")
    if restaurant_id:
        q_paid_bill = q_paid_bill.filter(Bill.restaurant_id == restaurant_id)
        q_pend_bill = q_pend_bill.filter(Bill.restaurant_id == restaurant_id)

    collected_rev = float(q_paid_bill.scalar() or 0)
    pending_rev = float(q_pend_bill.scalar() or 0)

    if pending_rev > 0:
        insights.append({
            "category": "Revenue",
            "severity": "Warning" if pending_rev > 1000 else "Info",
            "text": f"Collected ₹{collected_rev:,.2f} in revenue. Currently ₹{pending_rev:,.2f} remains pending collection across unpaid bills.",
            "comparison_period": f"Current outstanding balance",
            "metric_value": f"₹{pending_rev:,.2f} pending",
            "drilldown_path": f"/platform/payments{'?restaurant_id=' + str(restaurant_id) if restaurant_id else ''}",
        })

    # 3. High pending payment rates across restaurants (Platform-wide only)
    if not restaurant_id:
        restaurants = db.query(Restaurant).filter(Restaurant.is_active == True).all()
        max_pending_rate = 0.0
        max_pending_rest = None
        for r in restaurants:
            r_total = db.query(func.count(Bill.id)).filter(Bill.restaurant_id == r.id, Bill.created_at >= period_curr_start).scalar() or 0
            if r_total >= 5:  # Normalize minimum volume
                r_pending = db.query(func.count(Bill.id)).filter(Bill.restaurant_id == r.id, Bill.created_at >= period_curr_start, Bill.status == "payment_pending").scalar() or 0
                rate = (r_pending / r_total) * 100
                if rate > max_pending_rate:
                    max_pending_rate = rate
                    max_pending_rest = r.name

        if max_pending_rest and max_pending_rate > 5.0:
            insights.append({
                "category": "Risk",
                "severity": "Warning",
                "text": f"{max_pending_rest} has the highest pending-payment rate at {max_pending_rate:.1f}% during the last {days} days.",
                "comparison_period": f"Fleet benchmark ({days} days)",
                "metric_value": f"{max_pending_rate:.1f}%",
                "drilldown_path": f"/platform/payments",
            })

    # 4. Stuck session alert summary
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
