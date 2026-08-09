import datetime
from decimal import Decimal
from typing import List
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text

from app.database import get_db
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.service_request import ServiceRequest
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.restaurant_table import RestaurantTable
from app.schemas.dashboard import (
    DashboardActivityItem,
    DashboardAttentionItem,
    DashboardSummaryResponse,
    DashboardTableOverview,
    TopSellingItem,
    OrdersByHour,
)
from app.utils.auth import RoleChecker
from app.models.staff_user import StaffUser
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.bill import Bill
from app.services.revenue import collected_revenue
from app.utils.business_date import current_business_day_bounds_utc

router = APIRouter(prefix="/admin/dashboard")

_owner_admin = RoleChecker(["owner", "admin"])
DASHBOARD_ACTIVITY_LIMIT = 8
DASHBOARD_ACTIVITY_GROUP_WINDOW = datetime.timedelta(seconds=60)
DASHBOARD_ACTIVITY_QUERY_LIMIT = 200


def _activity_label(status: str, count: int) -> str:
    labels = {
        "ready": "order ready",
        "served": "order served",
        "payment_requested": "payment requested",
        "payment_completed": "payment completed",
        "service_request_created": "service request created",
        "service_request_resolved": "service request resolved",
    }
    singular = labels[status]
    if count == 1:
        return singular.capitalize()
    if status in {"ready", "served"}:
        return f"{count} orders {status}"
    return f"{count} {singular} events"


def _group_dashboard_activity(
    events: list[dict],
    *,
    window: datetime.timedelta = DASHBOARD_ACTIVITY_GROUP_WINDOW,
    limit: int = DASHBOARD_ACTIVITY_LIMIT,
) -> list[DashboardActivityItem]:
    """Presentation-only aggregation; source audit rows are never mutated."""
    groups: list[dict] = []
    for event in sorted(events, key=lambda item: item["timestamp"], reverse=True):
        matching = next((
            group for group in groups
            if group["restaurant_id"] == event["restaurant_id"]
            and group["table_number"] == event["table_number"]
            and (
                group["table_number"] is not None
                or group["source"] == event["source"]
            )
            and group["status"] == event["status"]
            and group["timestamp"] - event["timestamp"] <= window
        ), None)
        if matching:
            matching["event_ids"].append(event["id"])
            matching["count"] += 1
            continue
        groups.append({**event, "event_ids": [event["id"]], "count": 1})

    return [
        DashboardActivityItem(
            id="|".join(sorted(group["event_ids"])),
            actor=group["actor"],
            table_number=group["table_number"],
            action=_activity_label(group["status"], group["count"]),
            status=group["status"],
            count=group["count"],
            timestamp=group["timestamp"].isoformat(),
        )
        for group in groups[:limit]
    ]


def _latest_meaningful_order_histories(histories) -> list[OrderStatusHistory]:
    latest = []
    seen_order_ids: set[int] = set()
    for history in histories:
        if history.order_id in seen_order_ids:
            continue
        seen_order_ids.add(history.order_id)
        latest.append(history)
    return latest


def _recent_dashboard_activity(db: Session, restaurant_id: int) -> list[DashboardActivityItem]:
    events: list[dict] = []

    # Descending order plus seen IDs keeps only the latest meaningful state per order.
    histories = (
        db.query(OrderStatusHistory)
        .options(joinedload(OrderStatusHistory.order).joinedload(Order.table))
        .join(Order, OrderStatusHistory.order_id == Order.id)
        .filter(
            Order.restaurant_id == restaurant_id,
            OrderStatusHistory.new_status.in_(["ready", "served"]),
        )
        .order_by(OrderStatusHistory.changed_at.desc(), OrderStatusHistory.id.desc())
        .limit(DASHBOARD_ACTIVITY_QUERY_LIMIT)
        .all()
    )
    for history in _latest_meaningful_order_histories(histories):
        events.append({
            "id": f"order-status:{history.id}",
            "restaurant_id": restaurant_id,
            "table_number": history.order.table.table_number if history.order and history.order.table else None,
            "source": history.order.source if history.order else None,
            "status": history.new_status,
            "actor": f"Staff #{history.changed_by_staff_id}" if history.changed_by_staff_id else "System",
            "timestamp": history.changed_at,
        })

    sessions = (
        db.query(DiningSession)
        .options(joinedload(DiningSession.table))
        .filter(
            DiningSession.restaurant_id == restaurant_id,
            DiningSession.payment_requested_at.is_not(None),
        )
        .order_by(DiningSession.payment_requested_at.desc())
        .limit(DASHBOARD_ACTIVITY_QUERY_LIMIT)
        .all()
    )
    for session in sessions:
        events.append({
            "id": f"payment-requested:{session.id}",
            "restaurant_id": restaurant_id,
            "table_number": session.table.table_number if session.table else None,
            "source": "table",
            "status": "payment_requested",
            "actor": "System",
            "timestamp": session.payment_requested_at,
        })

    bills = (
        db.query(Bill)
        .options(joinedload(Bill.dining_session).joinedload(DiningSession.table))
        .filter(Bill.restaurant_id == restaurant_id, Bill.paid_at.is_not(None))
        .order_by(Bill.paid_at.desc())
        .limit(DASHBOARD_ACTIVITY_QUERY_LIMIT)
        .all()
    )
    for bill in bills:
        events.append({
            "id": f"payment-completed:{bill.id}",
            "restaurant_id": restaurant_id,
            "table_number": bill.dining_session.table.table_number,
            "source": "table",
            "status": "payment_completed",
            "actor": f"Staff #{bill.paid_by_staff_id}" if bill.paid_by_staff_id else "System",
            "timestamp": bill.paid_at,
        })

    requests = (
        db.query(ServiceRequest)
        .options(joinedload(ServiceRequest.table))
        .filter(ServiceRequest.restaurant_id == restaurant_id, ServiceRequest.request_type != "bill")
        .order_by(ServiceRequest.created_at.desc())
        .limit(DASHBOARD_ACTIVITY_QUERY_LIMIT)
        .all()
    )
    for request in requests:
        events.append({
            "id": f"service-created:{request.id}",
            "restaurant_id": restaurant_id,
            "table_number": request.table.table_number if request.table else None,
            "source": "table",
            "status": "service_request_created",
            "actor": "System",
            "timestamp": request.created_at,
        })
        if request.resolved_at:
            events.append({
                "id": f"service-resolved:{request.id}",
                "restaurant_id": restaurant_id,
                "table_number": request.table.table_number if request.table else None,
                "source": "table",
                "status": "service_request_resolved",
                "actor": f"Staff #{request.resolved_by_staff_id}" if request.resolved_by_staff_id else "System",
                "timestamp": request.resolved_at,
            })

    return _group_dashboard_activity(events)


def _get_local_day_bounds_utc(
    timezone_str: str | None,
    *,
    now: datetime.datetime | None = None,
):
    """
    Compute UTC-aware start and end datetimes for today's local day.
    Uses the restaurant's configured timezone (default: Asia/Kolkata).
    Returns (day_start_utc, day_end_utc).
    """
    return current_business_day_bounds_utc(timezone_str, now=now)


def _orders_by_local_hour(orders, quick_sales, tz: ZoneInfo) -> list[OrdersByHour]:
    hour_counts = [0] * 24
    for record in (*orders, *quick_sales):
        hour_counts[record.created_at.astimezone(tz).hour] += 1
    return [
        OrdersByHour(hour=hour, orders=count)
        for hour, count in enumerate(hour_counts)
    ]


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db)
):
    """
    Owner/admin dashboard summary. All metrics use the restaurant's configured timezone.

    Metric definitions:
    - today_order_count: All orders created during the restaurant's current local day
    - today_revenue: Paid bills and completed paid Quick Sales collected today
    - average_order_value: today_revenue / count of collected transactions (0 if none)
    - pending_order_count: Orders with status in (pending, accepted, preparing, ready)
    - rejected_order_count: Orders created today with status=rejected
    - top_selling_items: Item quantities from order_items in orders served today (uses snapshot item_name)
    - orders_by_hour: Orders created today grouped by local hour
    """
    restaurant_id = current_user.restaurant_id
    timezone_str = current_user.restaurant.timezone

    day_start_utc, day_end_utc, tz = _get_local_day_bounds_utc(timezone_str)
    timezone_str = tz.key

    # 1. Today's total order count (all statuses)
    today_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.created_at >= day_start_utc,
        Order.created_at < day_end_utc
    ).scalar() or 0
    today_order_count += db.query(func.count(QuickSale.id)).filter(QuickSale.restaurant_id == restaurant_id, QuickSale.created_at >= day_start_utc, QuickSale.created_at < day_end_utc).scalar() or 0

    # Served orders remain relevant to operational item rankings below, but
    # collected revenue is intentionally derived only from payment records.
    from sqlalchemy import select
    served_today_subquery = select(OrderStatusHistory.order_id).where(
        OrderStatusHistory.new_status == "served",
        OrderStatusHistory.changed_at >= day_start_utc,
        OrderStatusHistory.changed_at < day_end_utc
    )

    served_orders = db.query(Order).filter(
        Order.restaurant_id == restaurant_id,
        Order.id.in_(served_today_subquery),
        Order.status == "served"  # Confirm current status is still served
    ).all()

    paid_quick_sales = db.query(QuickSale).filter(
        QuickSale.restaurant_id == restaurant_id, QuickSale.status == "completed",
        QuickSale.completed_at >= day_start_utc, QuickSale.completed_at < day_end_utc,
    ).all()


    revenue = collected_revenue(
        db,
        restaurant_id=restaurant_id,
        start_utc=day_start_utc,
        end_utc=day_end_utc,
    )
    today_revenue = revenue.total
    average_order_value = (
        today_revenue / revenue.transaction_count
        if revenue.transaction_count > 0
        else Decimal("0.00")
    )

    # 3. Pending orders (statuses that mean "in progress")
    pending_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.status.in_(["pending", "accepted", "preparing", "ready"])
    ).scalar() or 0
    pending_order_count += db.query(func.count(QuickSale.id)).filter(QuickSale.restaurant_id == restaurant_id, QuickSale.sale_type == "takeaway", QuickSale.status.in_(["pending", "accepted", "preparing", "ready"])).scalar() or 0

    accepted_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.status == "accepted"
    ).scalar() or 0
    accepted_order_count += db.query(func.count(QuickSale.id)).filter(QuickSale.restaurant_id == restaurant_id, QuickSale.status == "accepted").scalar() or 0
    preparing_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.status == "preparing"
    ).scalar() or 0
    preparing_order_count += db.query(func.count(QuickSale.id)).filter(QuickSale.restaurant_id == restaurant_id, QuickSale.status == "preparing").scalar() or 0
    ready_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.status == "ready"
    ).scalar() or 0
    ready_order_count += db.query(func.count(QuickSale.id)).filter(QuickSale.restaurant_id == restaurant_id, QuickSale.status == "ready").scalar() or 0

    # 4. Active service requests
    active_service_request_count = db.query(func.count(ServiceRequest.id)).filter(
        ServiceRequest.restaurant_id == restaurant_id,
        ServiceRequest.status == "pending",
        ServiceRequest.request_type != "bill",
    ).scalar() or 0

    open_session_count = db.query(func.count(DiningSession.id)).filter(
        DiningSession.restaurant_id == restaurant_id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES)
    ).scalar() or 0
    payment_pending_count = db.query(func.count(DiningSession.id)).filter(
        DiningSession.restaurant_id == restaurant_id,
        DiningSession.status.in_(["payment_requested", "payment_pending"])
    ).scalar() or 0

    # 5. Rejected orders count (created today, status=rejected)
    rejected_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.status == "rejected",
        Order.created_at >= day_start_utc,
        Order.created_at < day_end_utc
    ).scalar() or 0

    # 6. Top 5 selling items: from order_items in orders served today
    #    Uses order_items.item_name (historical snapshot, not current menu name)
    served_order_ids = [o.id for o in served_orders]
    top_items_data = []
    if served_order_ids:
        top_items_raw = db.query(
            OrderItem.item_name,
            func.sum(OrderItem.quantity).label("total_quantity")
        ).filter(
            OrderItem.order_id.in_(served_order_ids),
            OrderItem.cancellation_status == "active",
        ).group_by(
            OrderItem.item_name
        ).order_by(
            func.sum(OrderItem.quantity).desc()
        ).limit(5).all()

        top_items_data = [
            TopSellingItem(item_name=row.item_name, total_quantity=int(row.total_quantity))
            for row in top_items_raw
        ]
    quick_item_rows = db.query(QuickSaleItem.item_name, func.sum(QuickSaleItem.quantity)).join(QuickSale).filter(QuickSale.id.in_([sale.id for sale in paid_quick_sales])).group_by(QuickSaleItem.item_name).all() if paid_quick_sales else []
    combined_items: dict[str, int] = {item.item_name: item.total_quantity for item in top_items_data}
    for name, qty in quick_item_rows: combined_items[name] = combined_items.get(name, 0) + int(qty)
    top_items_data = [TopSellingItem(item_name=name, total_quantity=qty) for name, qty in sorted(combined_items.items(), key=lambda pair: pair[1], reverse=True)[:5]]

    # 7. Orders by local hour: created today, grouped by local hour
    #    Fetch all today's orders and compute local hour in Python to avoid TZ SQL complexity
    today_orders = db.query(Order).filter(
        Order.restaurant_id == restaurant_id,
        Order.created_at >= day_start_utc,
        Order.created_at < day_end_utc
    ).all()

    today_quick_sales = db.query(QuickSale).filter(
        QuickSale.restaurant_id == restaurant_id,
        QuickSale.created_at >= day_start_utc,
        QuickSale.created_at < day_end_utc,
    ).all()
    orders_by_hour = _orders_by_local_hour(today_orders, today_quick_sales, tz)

    active_sessions = db.query(DiningSession).filter(
        DiningSession.restaurant_id == restaurant_id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
    ).all()
    session_by_table_id = {session.table_id: session for session in active_sessions}

    pending_requests = db.query(ServiceRequest).filter(
        ServiceRequest.restaurant_id == restaurant_id,
        ServiceRequest.status == "pending",
        ServiceRequest.request_type != "bill",
    ).order_by(ServiceRequest.created_at.asc()).all()
    request_by_table_id = {}
    for req in pending_requests:
        request_by_table_id.setdefault(req.table_id, req)

    tables = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant_id,
        RestaurantTable.is_active == True,
    ).order_by(RestaurantTable.table_number.asc()).all()

    table_overview = []
    for table in tables:
        session = session_by_table_id.get(table.id)
        request = request_by_table_id.get(table.id)
        status_label = "Available"
        order_count = 0
        bill_total = Decimal("0.00")
        last_activity_at = None
        payment_status = None
        session_token = None

        if session:
            session_token = session.public_token
            order_count = len(session.orders)
            bill_total = session.bill.total_amount if session.bill else session.subtotal
            payment_status = session.bill.status if session.bill else None
            last_candidates = [session.opened_at]
            if session.payment_requested_at:
                last_candidates.append(session.payment_requested_at)
            last_candidates.extend([order.created_at for order in session.orders])
            last_activity_at = max(last_candidates).isoformat() if last_candidates else None
            if request:
                status_label = "Needs Attention"
            elif session.status == "payment_requested":
                status_label = "Bill Requested"
            elif session.status == "payment_pending":
                status_label = "Payment Pending"
            else:
                status_label = "Active"

        table_overview.append(DashboardTableOverview(
            table_id=table.id,
            table_number=table.table_number,
            status=status_label,
            session_token=session_token,
            order_count=order_count,
            bill_total=f"{bill_total:.2f}",
            last_activity_at=last_activity_at,
            pending_request=request.request_type if request else None,
            payment_status=payment_status,
        ))

    attention_items = []
    for order in db.query(Order).join(RestaurantTable, Order.table_id == RestaurantTable.id).filter(
        Order.restaurant_id == restaurant_id,
        Order.status.in_(["pending", "ready"]),
    ).order_by(Order.created_at.asc()).limit(10).all():
        label = "Unaccepted order" if order.status == "pending" else "Order ready to serve"
        attention_items.append(DashboardAttentionItem(
            type=order.status,
            label=label,
            table_number=order.table.table_number,
            timestamp=order.created_at.isoformat(),
        ))
    for req in pending_requests[:10]:
        attention_items.append(DashboardAttentionItem(
            type=req.request_type,
            label=f"{req.request_type.replace('_', ' ').title()} request",
            table_number=req.table.table_number if req.table else None,
            timestamp=req.created_at.isoformat(),
        ))
    attention_items = sorted(attention_items, key=lambda item: item.timestamp or "")[:12]

    recent_activity = _recent_dashboard_activity(db, restaurant_id)

    return DashboardSummaryResponse(
        restaurant_name=current_user.restaurant.name,
        restaurant_slug=current_user.restaurant.slug,
        today_order_count=today_order_count,
        today_revenue=f"{today_revenue:.2f}",
        collected_revenue=f"{revenue.collected_revenue:.2f}",
        pending_collection=f"{revenue.pending_collection:.2f}",
        completed_quick_sale_revenue=f"{revenue.completed_quick_sale_revenue:.2f}",
        average_order_value=f"{average_order_value:.2f}",
        pending_order_count=pending_order_count,
        accepted_order_count=accepted_order_count,
        preparing_order_count=preparing_order_count,
        ready_order_count=ready_order_count,
        active_table_count=len(active_sessions),
        open_session_count=open_session_count,
        payment_pending_count=payment_pending_count,
        active_service_request_count=active_service_request_count,
        rejected_order_count=rejected_order_count,
        top_selling_items=top_items_data,
        orders_by_hour=orders_by_hour,
        tables=table_overview,
        attention_items=attention_items,
        recent_activity=recent_activity,
        timezone=timezone_str
    )
