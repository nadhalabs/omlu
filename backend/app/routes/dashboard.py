import datetime
from decimal import Decimal
from typing import List
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.database import get_db
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.service_request import ServiceRequest
from app.schemas.dashboard import DashboardSummaryResponse, TopSellingItem, OrdersByHour
from app.utils.auth import RoleChecker
from app.models.staff_user import StaffUser

router = APIRouter(prefix="/admin/dashboard")

_owner_manager = RoleChecker(["owner", "manager"])


def _get_local_day_bounds_utc(timezone_str: str):
    """
    Compute UTC-aware start and end datetimes for today's local day.
    Uses the restaurant's configured timezone (default: Asia/Kolkata).
    Returns (day_start_utc, day_end_utc).
    """
    try:
        tz = ZoneInfo(timezone_str)
    except Exception:
        tz = ZoneInfo("Asia/Kolkata")

    # Current local time in restaurant's timezone
    now_local = datetime.datetime.now(tz)
    # Start of today in that timezone (midnight)
    day_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    # End of today (just before midnight of next day)
    day_end_local = day_start_local + datetime.timedelta(days=1)

    # Convert to UTC for database filtering
    day_start_utc = day_start_local.astimezone(datetime.timezone.utc)
    day_end_utc = day_end_local.astimezone(datetime.timezone.utc)

    return day_start_utc, day_end_utc, tz


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(
    current_user: StaffUser = Depends(_owner_manager),
    db: Session = Depends(get_db)
):
    """
    Owner/manager dashboard summary. All metrics use the restaurant's configured timezone.

    Metric definitions:
    - today_order_count: All orders created during the restaurant's current local day
    - today_revenue: Subtotal from orders whose 'served' status transition occurred today
    - average_order_value: today_revenue / count of served-today orders (0 if none)
    - pending_order_count: Orders with status in (pending, accepted, preparing, ready)
    - rejected_order_count: Orders created today with status=rejected
    - top_selling_items: Item quantities from order_items in orders served today (uses snapshot item_name)
    - orders_by_hour: Orders created today grouped by local hour
    """
    restaurant_id = current_user.restaurant_id
    timezone_str = current_user.restaurant.timezone if current_user.restaurant.timezone else "Asia/Kolkata"

    day_start_utc, day_end_utc, tz = _get_local_day_bounds_utc(timezone_str)

    # 1. Today's total order count (all statuses)
    today_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.created_at >= day_start_utc,
        Order.created_at < day_end_utc
    ).scalar() or 0

    # 2. Revenue: sum subtotals of orders whose 'served' status transition occurred today
    # We join order_status_history to find orders marked 'served' today
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


    today_revenue = sum(o.subtotal for o in served_orders) if served_orders else Decimal("0.00")
    served_count = len(served_orders)
    average_order_value = (today_revenue / served_count) if served_count > 0 else Decimal("0.00")

    # 3. Pending orders (statuses that mean "in progress")
    pending_order_count = db.query(func.count(Order.id)).filter(
        Order.restaurant_id == restaurant_id,
        Order.status.in_(["pending", "accepted", "preparing", "ready"])
    ).scalar() or 0

    # 4. Active service requests
    active_service_request_count = db.query(func.count(ServiceRequest.id)).filter(
        ServiceRequest.restaurant_id == restaurant_id,
        ServiceRequest.status == "pending"
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
            OrderItem.order_id.in_(served_order_ids)
        ).group_by(
            OrderItem.item_name
        ).order_by(
            func.sum(OrderItem.quantity).desc()
        ).limit(5).all()

        top_items_data = [
            TopSellingItem(item_name=row.item_name, total_quantity=int(row.total_quantity))
            for row in top_items_raw
        ]

    # 7. Orders by local hour: created today, grouped by local hour
    #    Fetch all today's orders and compute local hour in Python to avoid TZ SQL complexity
    today_orders = db.query(Order).filter(
        Order.restaurant_id == restaurant_id,
        Order.created_at >= day_start_utc,
        Order.created_at < day_end_utc
    ).all()

    hour_counts: dict[int, int] = {}
    for order in today_orders:
        local_dt = order.created_at.astimezone(tz)
        h = local_dt.hour
        hour_counts[h] = hour_counts.get(h, 0) + 1

    orders_by_hour = [
        OrdersByHour(hour=h, count=c)
        for h, c in sorted(hour_counts.items())
    ]

    return DashboardSummaryResponse(
        today_order_count=today_order_count,
        today_revenue=f"{today_revenue:.2f}",
        average_order_value=f"{average_order_value:.2f}",
        pending_order_count=pending_order_count,
        active_service_request_count=active_service_request_count,
        rejected_order_count=rejected_order_count,
        top_selling_items=top_items_data,
        orders_by_hour=orders_by_hour,
        timezone=timezone_str
    )
