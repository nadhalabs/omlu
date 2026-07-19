import csv
import io
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Iterable
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import and_, case, distinct, func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import StaffUser
from app.services.pdf_reports import build_performance_pdf
from app.utils.auth import RoleChecker


router = APIRouter(prefix="/admin/history")
_owner_admin = RoleChecker(["owner", "admin"])
_history_roles = RoleChecker(["owner", "admin", "staff"])

COMPLETED_ORDER_STATUSES = {"served", "rejected"}
VALID_ORDER_STATUSES = {"pending", "accepted", "preparing", "ready", "served", "rejected"}
VALID_BILL_STATUSES = {"draft", "issued", "payment_pending", "paid", "cancelled", "void", "unpaid"}
VALID_SESSION_STATUSES = {"open", "payment_requested", "payment_pending", "paid", "closed", "cancelled"}
VALID_PAYMENT_METHODS = {"counter_cash", "counter_upi", "counter_card", "online"}


def _restaurant_timezone(staff: StaffUser) -> ZoneInfo:
    name = staff.restaurant.timezone if staff.restaurant and staff.restaurant.timezone else "Asia/Kolkata"
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("Asia/Kolkata")


def _local_date_range(
    *,
    staff: StaffUser,
    preset: str | None,
    start_date: date | None,
    end_date: date | None,
) -> tuple[date, date]:
    tz = _restaurant_timezone(staff)
    local_today = datetime.now(tz).date()
    normalized_preset = (preset or "today").strip().lower()

    if normalized_preset == "today":
        start_local = local_today
        end_local = local_today
    elif normalized_preset == "yesterday":
        start_local = local_today - timedelta(days=1)
        end_local = start_local
    elif normalized_preset in {"last_7_days", "last7"}:
        start_local = local_today - timedelta(days=6)
        end_local = local_today
    elif normalized_preset in {"last_30_days", "last30"}:
        start_local = local_today - timedelta(days=29)
        end_local = local_today
    elif normalized_preset in {"month", "monthly", "this_month"}:
        start_local = local_today.replace(day=1)
        next_month = (start_local.replace(day=28) + timedelta(days=4)).replace(day=1)
        end_local = next_month - timedelta(days=1)
    elif normalized_preset == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Custom date range requires start_date and end_date")
        start_local = start_date
        end_local = end_date
    else:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid date preset")

    if start_local > end_local:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="start_date must be before or equal to end_date")
    if (end_local - start_local).days > 370:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Date range cannot exceed 370 days")
    return start_local, end_local


def _utc_bounds(
    *,
    staff: StaffUser,
    preset: str | None,
    start_date: date | None,
    end_date: date | None,
) -> tuple[datetime, datetime]:
    tz = _restaurant_timezone(staff)
    start_local, end_local = _local_date_range(staff=staff, preset=preset, start_date=start_date, end_date=end_date)

    start_dt = datetime.combine(start_local, time.min, tzinfo=tz).astimezone(timezone.utc)
    end_dt = datetime.combine(end_local + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    return start_dt, end_dt


def _page_bounds(page: int, page_size: int) -> tuple[int, int]:
    safe_page = max(page, 1)
    safe_size = min(max(page_size, 1), 100)
    return safe_page, safe_size


def _money(value) -> str:
    return str(value or Decimal("0.00"))


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _status_times(order: Order) -> dict[str, str | None]:
    times: dict[str, str | None] = {
        "accepted_at": None,
        "preparing_at": None,
        "ready_at": None,
        "served_at": None,
        "rejected_at": None,
    }
    for item in sorted(order.status_history, key=lambda history: history.changed_at):
        key = f"{item.new_status}_at"
        if key in times and times[key] is None:
            times[key] = _iso(item.changed_at)
    return times


def _staff_names(db: Session, staff_ids: Iterable[int | None]) -> dict[int, str]:
    ids = sorted({staff_id for staff_id in staff_ids if staff_id})
    if not ids:
        return {}
    return {
        staff.id: staff.name
        for staff in db.query(StaffUser).filter(StaffUser.id.in_(ids)).all()
    }


def _order_actor_ids(order: Order) -> tuple[int | None, int | None]:
    accepted_by = None
    served_by = None
    for item in sorted(order.status_history, key=lambda history: history.changed_at):
        if item.new_status == "accepted" and accepted_by is None:
            accepted_by = item.changed_by_staff_id
        if item.new_status == "served" and served_by is None:
            served_by = item.changed_by_staff_id
    return accepted_by, served_by


def _order_row(order: Order, staff_names: dict[int, str]) -> dict:
    accepted_by_id, served_by_id = _order_actor_ids(order)
    item_count = sum(item.quantity for item in order.items)
    return {
        "id": order.id,
        "order_number": order.order_number,
        "created_at": _iso(order.created_at),
        "table_number": order.table.table_number if order.table else None,
        "session_token": order.dining_session.public_token if order.dining_session else None,
        "item_count": item_count,
        "status": order.status,
        "total": _money(order.subtotal),
        "accepted_by": staff_names.get(accepted_by_id) if accepted_by_id else None,
        "served_by": staff_names.get(served_by_id) if served_by_id else None,
    }


def _orders_query(
    db: Session,
    staff: StaffUser,
    start_utc: datetime,
    end_utc: datetime,
    status_filter: str | None,
    table_id: int | None,
    staff_id: int | None,
    order_number: str | None,
):
    query = db.query(Order).filter(
        Order.restaurant_id == staff.restaurant_id,
        Order.created_at >= start_utc,
        Order.created_at < end_utc,
    )
    if status_filter:
        if status_filter not in VALID_ORDER_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid order status")
        query = query.filter(Order.status == status_filter)
    else:
        query = query.filter(Order.status.in_(COMPLETED_ORDER_STATUSES))
    if table_id:
        query = query.filter(Order.table_id == table_id)
    if staff_id:
        query = query.join(OrderStatusHistory).filter(OrderStatusHistory.changed_by_staff_id == staff_id)
    if order_number:
        query = query.filter(Order.order_number.ilike(f"%{order_number.strip()}%"))
    return query


@router.get("/orders")
def order_history(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    table_id: int | None = None,
    staff_id: int | None = None,
    order_number: str | None = None,
    page: int = 1,
    page_size: int = 25,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    safe_page, safe_size = _page_bounds(page, page_size)
    query = _orders_query(db, current_user, start_utc, end_utc, status_filter, table_id, staff_id, order_number)
    total = query.distinct(Order.id).count()
    orders = (
        query.options(
            joinedload(Order.table),
            joinedload(Order.dining_session),
            joinedload(Order.items).joinedload(OrderItem.selected_options),
            joinedload(Order.status_history),
        )
        .order_by(Order.created_at.desc(), Order.id.desc())
        .offset((safe_page - 1) * safe_size)
        .limit(safe_size)
        .all()
    )
    actor_ids = []
    for order in orders:
        actor_ids.extend(_order_actor_ids(order))
    staff_names = _staff_names(db, actor_ids)
    return {"items": [_order_row(order, staff_names) for order in orders], "page": safe_page, "page_size": safe_size, "total": total}


def _bills_query(
    db: Session,
    staff: StaffUser,
    start_utc: datetime,
    end_utc: datetime,
    status_filter: str | None,
    payment_method: str | None,
    table_id: int | None,
):
    query = db.query(Bill).join(DiningSession).filter(
        Bill.restaurant_id == staff.restaurant_id,
        Bill.generated_at >= start_utc,
        Bill.generated_at < end_utc,
    )
    if status_filter:
        normalized = status_filter.lower()
        if normalized == "unpaid":
            query = query.filter(Bill.status.in_(["draft", "issued"]))
        elif normalized == "void":
            query = query.filter(Bill.status == "cancelled")
        elif normalized in VALID_BILL_STATUSES:
            query = query.filter(Bill.status == normalized)
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid bill status")
    if payment_method:
        if payment_method not in VALID_PAYMENT_METHODS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid payment method")
        query = query.filter(Bill.payment_method == payment_method)
    if table_id:
        query = query.filter(DiningSession.table_id == table_id)
    return query


def _bill_row(bill: Bill) -> dict:
    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "date": _iso(bill.generated_at),
        "table_number": bill.dining_session.table.table_number if bill.dining_session and bill.dining_session.table else None,
        "session_token": bill.dining_session.public_token if bill.dining_session else None,
        "subtotal": _money(bill.subtotal),
        "tax_amount": _money(bill.tax_amount),
        "discount_amount": _money(bill.discount_amount),
        "grand_total": _money(bill.total_amount),
        "payment_status": bill.status,
        "payment_method": bill.payment_method,
        "paid_at": _iso(bill.paid_at),
    }


@router.get("/bills")
def bill_history(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    payment_method: str | None = None,
    table_id: int | None = None,
    page: int = 1,
    page_size: int = 25,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    safe_page, safe_size = _page_bounds(page, page_size)
    query = _bills_query(db, current_user, start_utc, end_utc, status_filter, payment_method, table_id)
    total = query.count()
    bills = (
        query.options(joinedload(Bill.dining_session).joinedload(DiningSession.table))
        .order_by(Bill.generated_at.desc(), Bill.id.desc())
        .offset((safe_page - 1) * safe_size)
        .limit(safe_size)
        .all()
    )
    return {"items": [_bill_row(bill) for bill in bills], "page": safe_page, "page_size": safe_size, "total": total}


def _sessions_query(
    db: Session,
    staff: StaffUser,
    start_utc: datetime,
    end_utc: datetime,
    status_filter: str | None,
    table_id: int | None,
):
    query = db.query(DiningSession).filter(
        DiningSession.restaurant_id == staff.restaurant_id,
        DiningSession.opened_at >= start_utc,
        DiningSession.opened_at < end_utc,
    )
    if status_filter:
        if status_filter not in VALID_SESSION_STATUSES:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid session status")
        query = query.filter(DiningSession.status == status_filter)
    if table_id:
        query = query.filter(DiningSession.table_id == table_id)
    return query


def _duration_minutes(session: DiningSession) -> int | None:
    if not session.closed_at:
        return None
    return max(int((session.closed_at - session.opened_at).total_seconds() // 60), 0)


def _session_row(session: DiningSession) -> dict:
    order_count = len(session.orders)
    combined_subtotal = sum((order.subtotal for order in session.orders), Decimal("0.00"))
    closed_by = None
    if session.closed_by_staff_id:
        closed_by = session.closed_by_staff_id
    return {
        "id": session.id,
        "session_token": session.public_token,
        "table_number": session.table.table_number if session.table else None,
        "started_at": _iso(session.opened_at),
        "closed_at": _iso(session.closed_at),
        "duration_minutes": _duration_minutes(session),
        "order_count": order_count,
        "combined_subtotal": _money(combined_subtotal),
        "final_bill_total": _money(session.bill.total_amount) if session.bill else "0.00",
        "payment_status": session.bill.status if session.bill else session.status,
        "closed_by": closed_by,
        "status": session.status,
    }


@router.get("/sessions")
def session_history(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    table_id: int | None = None,
    closed_by: int | None = None,
    page: int = 1,
    page_size: int = 25,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    if closed_by:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Closed-by history is not available yet")
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    safe_page, safe_size = _page_bounds(page, page_size)
    query = _sessions_query(db, current_user, start_utc, end_utc, status_filter, table_id)
    total = query.count()
    sessions = (
        query.options(joinedload(DiningSession.table), joinedload(DiningSession.orders), joinedload(DiningSession.bill))
        .order_by(DiningSession.opened_at.desc(), DiningSession.id.desc())
        .offset((safe_page - 1) * safe_size)
        .limit(safe_size)
        .all()
    )
    return {"items": [_session_row(session) for session in sessions], "page": safe_page, "page_size": safe_size, "total": total}


@router.get("/performance")
def performance_summary(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    tz_name = current_user.restaurant.timezone if current_user.restaurant and current_user.restaurant.timezone else "Asia/Kolkata"

    order_metrics = db.query(
        func.count(Order.id),
        func.coalesce(func.sum(Order.subtotal), 0),
        func.coalesce(func.sum(case((Order.status == "rejected", 1), else_=0)), 0),
    ).filter(
        Order.restaurant_id == current_user.restaurant_id,
        Order.created_at >= start_utc,
        Order.created_at < end_utc,
    ).one()
    bill_metrics = db.query(
        func.count(Bill.id),
        func.coalesce(func.sum(case((Bill.status == "paid", 1), else_=0)), 0),
        func.coalesce(func.sum(case((Bill.status.in_(["draft", "issued"]), 1), else_=0)), 0),
        func.coalesce(func.sum(case((Bill.status == "paid", Bill.total_amount), else_=0)), 0),
    ).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.generated_at >= start_utc,
        Bill.generated_at < end_utc,
    ).one()
    duration_seconds = func.extract("epoch", DiningSession.closed_at - DiningSession.opened_at)
    session_metrics = db.query(
        func.coalesce(func.sum(duration_seconds), 0),
        func.coalesce(func.avg(duration_seconds), 0),
    ).filter(
        DiningSession.restaurant_id == current_user.restaurant_id,
        DiningSession.opened_at >= start_utc,
        DiningSession.opened_at < end_utc,
        DiningSession.closed_at.isnot(None),
    ).one()

    total_orders = int(order_metrics[0] or 0)
    total_revenue = Decimal(str(bill_metrics[3] or 0))

    revenue_by_day = [
        {"date": str(row[0]), "revenue": _money(row[1])}
        for row in db.query(
            func.date(func.timezone(tz_name, Bill.generated_at)).label("day"),
            func.coalesce(func.sum(Bill.total_amount), 0),
        )
        .filter(Bill.restaurant_id == current_user.restaurant_id, Bill.status == "paid", Bill.generated_at >= start_utc, Bill.generated_at < end_utc)
        .group_by("day")
        .order_by("day")
        .all()
    ]
    orders_by_day = [
        {"date": str(row[0]), "orders": int(row[1])}
        for row in db.query(
            func.date(func.timezone(tz_name, Order.created_at)).label("day"),
            func.count(Order.id),
        )
        .filter(Order.restaurant_id == current_user.restaurant_id, Order.created_at >= start_utc, Order.created_at < end_utc)
        .group_by("day")
        .order_by("day")
        .all()
    ]
    orders_by_hour = [
        {"hour": int(row[0]), "orders": int(row[1])}
        for row in db.query(
            func.extract("hour", func.timezone(tz_name, Order.created_at)).label("hour"),
            func.count(Order.id),
        )
        .filter(Order.restaurant_id == current_user.restaurant_id, Order.created_at >= start_utc, Order.created_at < end_utc)
        .group_by("hour")
        .order_by("hour")
        .all()
    ]
    item_query = (
        db.query(
            OrderItem.item_name,
            func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(OrderItem.total_price), 0).label("revenue"),
        )
        .join(Order)
        .filter(Order.restaurant_id == current_user.restaurant_id, Order.created_at >= start_utc, Order.created_at < end_utc, Order.status != "rejected")
        .group_by(OrderItem.item_name)
    )
    top_items = [{"item_name": row[0], "quantity": int(row[1]), "revenue": _money(row[2])} for row in item_query.order_by(func.sum(OrderItem.quantity).desc()).limit(10).all()]
    low_items = [{"item_name": row[0], "quantity": int(row[1]), "revenue": _money(row[2])} for row in item_query.order_by(func.sum(OrderItem.quantity).asc()).limit(10).all()]
    category_performance = [
        {"category_name": row[0] or "Uncategorized", "quantity": int(row[1]), "revenue": _money(row[2])}
        for row in db.query(
            MenuCategory.name_en,
            func.coalesce(func.sum(OrderItem.quantity), 0),
            func.coalesce(func.sum(OrderItem.total_price), 0),
        )
        .select_from(OrderItem)
        .join(Order)
        .outerjoin(MenuItem, MenuItem.id == OrderItem.menu_item_id)
        .outerjoin(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .filter(Order.restaurant_id == current_user.restaurant_id, Order.created_at >= start_utc, Order.created_at < end_utc, Order.status != "rejected")
        .group_by(MenuCategory.name_en)
        .order_by(func.sum(OrderItem.total_price).desc())
        .limit(10)
        .all()
    ]
    table_usage = [
        {"table_number": row[0], "sessions": int(row[1]), "orders": int(row[2]), "revenue": _money(row[3])}
        for row in db.query(
            RestaurantTable.table_number,
            func.count(distinct(DiningSession.id)),
            func.count(distinct(Order.id)),
            func.coalesce(func.sum(Order.subtotal), 0),
        )
        .select_from(RestaurantTable)
        .join(DiningSession, DiningSession.table_id == RestaurantTable.id)
        .outerjoin(Order, Order.dining_session_id == DiningSession.id)
        .filter(RestaurantTable.restaurant_id == current_user.restaurant_id, DiningSession.opened_at >= start_utc, DiningSession.opened_at < end_utc)
        .group_by(RestaurantTable.table_number)
        .order_by(func.count(distinct(DiningSession.id)).desc())
        .limit(10)
        .all()
    ]
    staff_activity = [
        {"staff_name": row[0], "status_changes": int(row[1]), "accepted": int(row[2]), "served": int(row[3])}
        for row in db.query(
            StaffUser.name,
            func.count(OrderStatusHistory.id),
            func.coalesce(func.sum(case((OrderStatusHistory.new_status == "accepted", 1), else_=0)), 0),
            func.coalesce(func.sum(case((OrderStatusHistory.new_status == "served", 1), else_=0)), 0),
        )
        .join(OrderStatusHistory, OrderStatusHistory.changed_by_staff_id == StaffUser.id)
        .join(Order)
        .filter(StaffUser.restaurant_id == current_user.restaurant_id, Order.created_at >= start_utc, Order.created_at < end_utc)
        .group_by(StaffUser.name)
        .order_by(func.count(OrderStatusHistory.id).desc())
        .limit(10)
        .all()
    ]

    return {
        "metrics": {
            "total_revenue": _money(total_revenue),
            "total_orders": total_orders,
            "average_order_value": _money((Decimal(str(order_metrics[1] or 0)) / total_orders) if total_orders else Decimal("0.00")),
            "total_bills": int(bill_metrics[0] or 0),
            "paid_bills": int(bill_metrics[1] or 0),
            "unpaid_bills": int(bill_metrics[2] or 0),
            "cancelled_orders": 0,
            "rejected_orders": int(order_metrics[2] or 0),
            "payment_failures": 0,
            "active_table_time_minutes": int((session_metrics[0] or 0) // 60),
            "average_session_duration_minutes": int((session_metrics[1] or 0) // 60),
        },
        "revenue_by_day": revenue_by_day,
        "orders_by_day": orders_by_day,
        "orders_by_hour": orders_by_hour,
        "top_selling_items": top_items,
        "lowest_selling_items": low_items,
        "category_performance": category_performance,
        "table_usage": table_usage,
        "staff_activity": staff_activity,
    }


@router.get("/performance/summary")
def performance_summary_only(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    return {"metrics": performance_summary(preset, start_date, end_date, current_user, db)["metrics"]}


@router.get("/performance/revenue-timeline")
def revenue_timeline(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    return {"items": performance_summary(preset, start_date, end_date, current_user, db)["revenue_by_day"]}


@router.get("/performance/busy-hours")
def busy_hour_analysis(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    return {"items": performance_summary(preset, start_date, end_date, current_user, db)["orders_by_hour"]}


@router.get("/performance/top-selling-items")
def top_selling_items(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    return {"items": performance_summary(preset, start_date, end_date, current_user, db)["top_selling_items"]}


@router.get("/performance/staff-activity")
def staff_activity(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    return {"items": performance_summary(preset, start_date, end_date, current_user, db)["staff_activity"]}


def _csv_response(filename: str, rows: list[dict]) -> StreamingResponse:
    output = io.StringIO()
    fieldnames = list(rows[0].keys()) if rows else ["message"]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    if rows:
        writer.writerows(rows)
    else:
        writer.writerow({"message": "No data"})
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _report_type(preset: str | None, start_local: date, end_local: date) -> str:
    normalized = (preset or "today").strip().lower()
    if normalized == "today" and start_local == end_local:
        return "Daily report"
    if normalized in {"month", "monthly", "this_month"}:
        return "Monthly report"
    return "Custom date range report"


def _safe_report_filename(preset: str | None, start_local: date, end_local: date) -> str:
    normalized = (preset or "today").strip().lower()
    if normalized == "today" and start_local == end_local:
        return f"omlu-daily-report-{start_local.isoformat()}.pdf"
    if normalized in {"month", "monthly", "this_month"}:
        return f"omlu-monthly-report-{start_local.strftime('%Y-%m')}.pdf"
    return f"omlu-report-{start_local.isoformat()}-to-{end_local.isoformat()}.pdf"


def _payment_method_label(method: str | None) -> str:
    return {
        "counter_cash": "Cash",
        "counter_upi": "UPI",
        "counter_card": "Card",
        "online": "Online",
        None: "Other or unknown",
    }.get(method, "Other or unknown")


def _payment_breakdown(db: Session, staff: StaffUser, start_utc: datetime, end_utc: datetime, total_revenue: Decimal) -> list[dict]:
    rows = db.query(
        Bill.payment_method,
        func.count(Bill.id),
        func.coalesce(func.sum(Bill.total_amount), 0),
    ).filter(
        Bill.restaurant_id == staff.restaurant_id,
        Bill.status == "paid",
        Bill.generated_at >= start_utc,
        Bill.generated_at < end_utc,
    ).group_by(Bill.payment_method).all()
    breakdown = []
    for method, count, amount in rows:
        value = Decimal(str(amount or 0))
        percentage = (value / total_revenue * Decimal("100")) if total_revenue else Decimal("0")
        breakdown.append({
            "method": _payment_method_label(method),
            "bill_count": int(count or 0),
            "amount": _money(value),
            "percentage": f"{percentage.quantize(Decimal('0.01'))}",
        })
    if not breakdown:
        breakdown.append({"method": "Other or unknown", "bill_count": 0, "amount": "0.00", "percentage": "0.00"})
    return breakdown


def _detailed_staff_activity(db: Session, staff: StaffUser, start_utc: datetime, end_utc: datetime) -> list[dict]:
    activity: dict[int, dict] = {}

    def row_for(staff_id: int | None, name: str | None = None) -> dict | None:
        if not staff_id:
            return None
        if staff_id not in activity:
            staff_user = db.query(StaffUser).filter(StaffUser.id == staff_id, StaffUser.restaurant_id == staff.restaurant_id).first()
            activity[staff_id] = {
                "staff_name": name or (staff_user.name if staff_user else "Unknown staff"),
                "orders_created": 0,
                "requests_resolved": 0,
                "bills_generated": 0,
                "payments_recorded": 0,
                "sessions_opened": 0,
                "sessions_closed": 0,
            }
        return activity[staff_id]

    for staff_id, name, count in db.query(StaffUser.id, StaffUser.name, func.count(Order.id)).join(Order, Order.created_by_staff_id == StaffUser.id).filter(
        StaffUser.restaurant_id == staff.restaurant_id,
        Order.created_at >= start_utc,
        Order.created_at < end_utc,
    ).group_by(StaffUser.id, StaffUser.name).all():
        row_for(staff_id, name)["orders_created"] = int(count or 0)

    for staff_id, name, count in db.query(StaffUser.id, StaffUser.name, func.count(ServiceRequest.id)).join(ServiceRequest, ServiceRequest.resolved_by_staff_id == StaffUser.id).filter(
        StaffUser.restaurant_id == staff.restaurant_id,
        ServiceRequest.resolved_at >= start_utc,
        ServiceRequest.resolved_at < end_utc,
    ).group_by(StaffUser.id, StaffUser.name).all():
        row_for(staff_id, name)["requests_resolved"] = int(count or 0)

    for staff_id, name, count in db.query(StaffUser.id, StaffUser.name, func.count(Bill.id)).join(Bill, Bill.generated_by_staff_id == StaffUser.id).filter(
        StaffUser.restaurant_id == staff.restaurant_id,
        Bill.generated_at >= start_utc,
        Bill.generated_at < end_utc,
    ).group_by(StaffUser.id, StaffUser.name).all():
        row_for(staff_id, name)["bills_generated"] = int(count or 0)

    for staff_id, name, count in db.query(StaffUser.id, StaffUser.name, func.count(Bill.id)).join(Bill, Bill.paid_by_staff_id == StaffUser.id).filter(
        StaffUser.restaurant_id == staff.restaurant_id,
        Bill.paid_at >= start_utc,
        Bill.paid_at < end_utc,
    ).group_by(StaffUser.id, StaffUser.name).all():
        row_for(staff_id, name)["payments_recorded"] = int(count or 0)

    for staff_id, name, count in db.query(StaffUser.id, StaffUser.name, func.count(DiningSession.id)).join(DiningSession, DiningSession.opened_by_staff_id == StaffUser.id).filter(
        StaffUser.restaurant_id == staff.restaurant_id,
        DiningSession.opened_at >= start_utc,
        DiningSession.opened_at < end_utc,
    ).group_by(StaffUser.id, StaffUser.name).all():
        row_for(staff_id, name)["sessions_opened"] = int(count or 0)

    for staff_id, name, count in db.query(StaffUser.id, StaffUser.name, func.count(DiningSession.id)).join(DiningSession, DiningSession.closed_by_staff_id == StaffUser.id).filter(
        StaffUser.restaurant_id == staff.restaurant_id,
        DiningSession.closed_at >= start_utc,
        DiningSession.closed_at < end_utc,
    ).group_by(StaffUser.id, StaffUser.name).all():
        row_for(staff_id, name)["sessions_closed"] = int(count or 0)

    return sorted(activity.values(), key=lambda item: sum(value for key, value in item.items() if key != "staff_name"), reverse=True)[:20]


def _performance_pdf_context(
    *,
    preset: str | None,
    start_date: date | None,
    end_date: date | None,
    current_user: StaffUser,
    db: Session,
) -> tuple[dict, str]:
    start_local, end_local = _local_date_range(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    summary = performance_summary(preset, start_date, end_date, current_user, db)
    total_revenue = Decimal(str(summary["metrics"]["total_revenue"] or 0))
    tz = _restaurant_timezone(current_user)
    generated_at = datetime.now(tz)
    context = {
        "restaurant": {
            "name": current_user.restaurant.name if current_user.restaurant else "Restaurant",
            "logo_url": current_user.restaurant.logo_url if current_user.restaurant else None,
            "timezone": current_user.restaurant.timezone if current_user.restaurant and current_user.restaurant.timezone else "Asia/Kolkata",
        },
        "report": {
            "type": _report_type(preset, start_local, end_local),
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
            "generated_at": generated_at.strftime("%Y-%m-%d %H:%M:%S %Z"),
        },
        "summary": summary,
        "payment_breakdown": _payment_breakdown(db, current_user, start_utc, end_utc, total_revenue),
        "staff_activity_detail": _detailed_staff_activity(db, current_user, start_utc, end_utc),
    }
    return context, _safe_report_filename(preset, start_local, end_local)


@router.get("/orders/export")
def export_orders(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    table_id: int | None = None,
    staff_id: int | None = None,
    order_number: str | None = None,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    orders = _orders_query(db, current_user, start_utc, end_utc, status_filter, table_id, staff_id, order_number).options(joinedload(Order.table), joinedload(Order.dining_session), joinedload(Order.items).joinedload(OrderItem.selected_options), joinedload(Order.status_history)).order_by(Order.created_at.desc()).limit(5000).all()
    actor_ids = []
    for order in orders:
        actor_ids.extend(_order_actor_ids(order))
    staff_names = _staff_names(db, actor_ids)
    return _csv_response("orders-history.csv", [_order_row(order, staff_names) for order in orders])


@router.get("/orders/{order_id}")
def order_history_detail(
    order_id: int,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.table), joinedload(Order.dining_session), joinedload(Order.items).joinedload(OrderItem.selected_options), joinedload(Order.status_history))
        .filter(Order.id == order_id, Order.restaurant_id == current_user.restaurant_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    actor_ids = [history.changed_by_staff_id for history in order.status_history]
    staff_names = _staff_names(db, actor_ids)
    row = _order_row(order, staff_names)
    row.update(
        {
            "customer_note": order.customer_note,
            "items": [
                {
                    "item_name": item.item_name,
                    "quantity": item.quantity,
                    "unit_price": _money(item.unit_price),
                    "total_price": _money(item.total_price),
                    "item_note": item.item_note,
                    "selected_options": [
                        {
                            "option_name": option.option_name,
                            "group_name": option.group_name,
                            "option_type": option.option_type,
                            "price_delta": _money(option.price_delta),
                            "quantity": option.quantity,
                        }
                        for option in sorted(item.selected_options, key=lambda option: (option.display_order, option.id))
                    ],
                }
                for item in order.items
            ],
            "status_history": [
                {
                    "old_status": history.old_status,
                    "new_status": history.new_status,
                    "changed_at": _iso(history.changed_at),
                    "changed_by": staff_names.get(history.changed_by_staff_id) if history.changed_by_staff_id else None,
                }
                for history in sorted(order.status_history, key=lambda item: item.changed_at)
            ],
            "created_at": _iso(order.created_at),
            "cancel_reason": None,
            **_status_times(order),
        }
    )
    return row


@router.get("/bills/export")
def export_bills(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    payment_method: str | None = None,
    table_id: int | None = None,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    rows = [_bill_row(bill) for bill in _bills_query(db, current_user, start_utc, end_utc, status_filter, payment_method, table_id).options(joinedload(Bill.dining_session).joinedload(DiningSession.table)).order_by(Bill.generated_at.desc()).limit(5000).all()]
    return _csv_response("bills-history.csv", rows)


@router.get("/sessions/export")
def export_sessions(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    status_filter: str | None = None,
    table_id: int | None = None,
    current_user: StaffUser = Depends(_history_roles),
    db: Session = Depends(get_db),
):
    start_utc, end_utc = _utc_bounds(staff=current_user, preset=preset, start_date=start_date, end_date=end_date)
    rows = [_session_row(session) for session in _sessions_query(db, current_user, start_utc, end_utc, status_filter, table_id).options(joinedload(DiningSession.table), joinedload(DiningSession.orders), joinedload(DiningSession.bill)).order_by(DiningSession.opened_at.desc()).limit(5000).all()]
    return _csv_response("sessions-history.csv", rows)


@router.get("/performance/export")
def export_performance(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    response = performance_summary(preset, start_date, end_date, current_user, db)
    rows = [{"metric": key, "value": value} for key, value in response["metrics"].items()]
    return _csv_response("performance-summary.csv", rows)


@router.get("/performance/export.pdf")
def export_performance_pdf(
    preset: str | None = Query("today"),
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    context, filename = _performance_pdf_context(
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        current_user=current_user,
        db=db,
    )
    pdf_bytes = build_performance_pdf(context)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
