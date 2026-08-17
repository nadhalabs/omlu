import datetime
import json
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.empty_table_report import EmptyTableReport
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOptionGroup
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffUser
from app.routes.orders import build_order_response, create_order_in_session, load_order_for_response, publish_item_cancelled, validate_idempotency_key
from app.schemas.order import OrderItemCancellationRequest, PublicOrderCreateRequest
from app.schemas.service_request import StaffServiceRequestResponse
from app.services.bills import build_bill_response, create_or_refresh_bill_for_session
from app.services.dining_sessions import create_session_safely, find_current_open_session_for_table, get_or_create_open_session
from app.services.menu_options import serialize_item_option_groups
from app.services.order_item_cancellation import cancel_order_item
from app.services.kitchen_print_jobs import enqueue_cancellation_kot
from app.services.realtime import (
    EVENT_DRAFT_BILL_VOIDED,
    EVENT_EMPTY_TABLE_DISMISSED,
    EVENT_EMPTY_TABLE_REPORTED,
    EVENT_EMPTY_TABLE_RESOLVED,
    EVENT_BILL_GENERATED,
    EVENT_ORDER_CREATED,
    EVENT_SERVICE_REQUEST_CREATED,
    EVENT_SESSION_OPENED,
    EVENT_SESSION_FORCE_CLOSED,
    EVENT_SESSION_ORDERS_CANCELLED,
    EVENT_TABLE_UPDATED,
    publish_event,
    order_channel,
    restaurant_channel,
    session_channel,
    table_channel,
)
from app.services.table_participants import invalidate_session_participants
from app.utils.auth import OperationalWriteChecker, RoleChecker


router = APIRouter(prefix="/staff/tables")
_staff_roles = RoleChecker(["owner", "admin", "staff"])
_staff_write_roles = OperationalWriteChecker(["owner", "admin", "staff"])
_report_role = OperationalWriteChecker(["staff"])
_report_resolution_roles = OperationalWriteChecker(["owner", "admin"])


class EmptyTableReportCreateRequest(BaseModel):
    session_token: str


class ServedItemCreateRequest(PublicOrderCreateRequest):
    late_entry_reason: str


class ResolutionReasonRequest(BaseModel):
    reason: str


@router.post("/{table_id}/orders/{order_public_token}/items/{order_item_id}/cancel")
def cancel_staff_order_item(
    table_id: int,
    order_public_token: str,
    order_item_id: int,
    body: OrderItemCancellationRequest,
    current_user: StaffUser = Depends(_staff_write_roles),
    db: Session = Depends(get_db),
):
    session = db.query(DiningSession).filter(
        DiningSession.restaurant_id == current_user.restaurant_id,
        DiningSession.table_id == table_id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
    ).order_by(DiningSession.opened_at.desc()).first()
    if not session:
        raise HTTPException(status_code=404, detail="Active dining session not found")
    reason = (body.reason or "staff_cancelled").strip()
    if not reason:
        raise HTTPException(status_code=422, detail="Cancellation reason is required")
    try:
        order, item, locked_session, bill = cancel_order_item(
            db,
            restaurant_id=current_user.restaurant_id,
            session_id=session.id,
            order_public_token=order_public_token,
            order_item_id=order_item_id,
            actor_type="staff",
            reason=reason,
            staff_id=current_user.id,
        )
        _audit(db, current_user, "order_item_cancelled", "order_item", str(item.id), {
            "order_id": order.id,
            "order_number": order.order_number,
            "table_id": table_id,
            "reason": reason,
            "resulting_order_status": order.status,
        })
        enqueue_cancellation_kot(db, order, item)
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_item_cancelled(order, item, locked_session)
    return build_order_response(db, load_order_for_response(db, order.id))


def _audit(db: Session, actor: StaffUser, action: str, target_type: str, target_id: str, new_value: dict | None = None) -> None:
    db.add(
        AuditLog(
            restaurant_id=actor.restaurant_id,
            actor_user_id=actor.id,
            actor_role=actor.role,
            target_type=target_type,
            target_id=target_id,
            action=action,
            new_value=json.dumps(new_value) if new_value is not None else None,
        )
    )


def _money(value) -> str:
    return str(value or Decimal("0.00"))


def _minutes_since(value: datetime.datetime | None) -> int | None:
    if not value:
        return None
    return max(int((datetime.datetime.now(datetime.timezone.utc) - value).total_seconds() // 60), 0)


def _active_session_query(db: Session, restaurant_id: int):
    return (
        db.query(DiningSession)
        .options(
            joinedload(DiningSession.table),
            selectinload(DiningSession.orders).selectinload(Order.items).selectinload(OrderItem.selected_options),
            joinedload(DiningSession.bill),
        )
        .filter(
            DiningSession.restaurant_id == restaurant_id,
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        )
    )


def _table_summary(db: Session, table: RestaurantTable, session: DiningSession | None) -> dict:
    pending_requests = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.restaurant_id == table.restaurant_id,
            ServiceRequest.table_id == table.id,
            ServiceRequest.status == "pending",
            ServiceRequest.request_type != "bill",
        )
        .all()
    )
    ready_count = 0
    active_order_count = 0
    current_bill_amount = Decimal("0.00")
    if session:
        active_order_count = len([order for order in session.orders if order.status != "rejected"])
        ready_count = len([order for order in session.orders if order.status == "ready"])
        current_bill_amount = session.bill.total_amount if session.bill else sum((order.subtotal for order in session.orders if order.status != "rejected"), Decimal("0.00"))
    report = None
    if session:
        report = db.query(EmptyTableReport).filter(
            EmptyTableReport.restaurant_id == table.restaurant_id,
            EmptyTableReport.table_id == table.id,
            EmptyTableReport.session_id == session.id,
            EmptyTableReport.status == "open",
        ).first()
    report_payload = None
    if report:
        reporter = db.query(StaffUser).filter(
            StaffUser.id == report.reported_by_user_id,
            StaffUser.restaurant_id == table.restaurant_id,
        ).first()
        report_payload = {
            "reported_at": report.reported_at.isoformat(),
            "reported_by_name": reporter.name if reporter else "Staff",
        }
    attention = [request.request_type for request in pending_requests]
    if ready_count:
        attention.append("ready_order")
    return {
        "id": table.id,
        "table_number": table.table_number,
        "state": "occupied" if session else "available",
        "has_open_session": bool(session),
        "session_token": session.public_token if session else None,
        "session_status": session.status if session else None,
        "active_order_count": active_order_count,
        "current_bill_amount": _money(current_bill_amount),
        "opened_minutes_ago": _minutes_since(session.opened_at) if session else None,
        "attention": attention,
        "bill_requested": bool(session and session.status in {"payment_requested", "payment_pending"}) or "bill" in attention,
        "empty_table_report": report_payload,
    }


def _list_table_summaries(db: Session, restaurant_id: int, tables: list[RestaurantTable]) -> list[dict]:
    """Build compact table-grid rows using a fixed number of bulk queries."""
    sessions = db.query(DiningSession).filter(
        DiningSession.restaurant_id == restaurant_id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
    ).all()
    sessions_by_table = {session.table_id: session for session in sessions}
    session_ids = [session.id for session in sessions]

    order_stats: dict[int, tuple[int, int, Decimal]] = {}
    bills_by_session: dict[int, Decimal] = {}
    if session_ids:
        order_rows = db.query(
            Order.dining_session_id,
            func.sum(case((Order.status != "rejected", 1), else_=0)),
            func.sum(case((Order.status == "ready", 1), else_=0)),
            func.coalesce(
                func.sum(case((Order.status != "rejected", Order.subtotal), else_=Decimal("0.00"))),
                0,
            ),
        ).filter(
            Order.dining_session_id.in_(session_ids),
        ).group_by(Order.dining_session_id).all()
        order_stats = {
            session_id: (
                int(active_count or 0),
                int(ready_count or 0),
                subtotal or Decimal("0.00"),
            )
            for session_id, active_count, ready_count, subtotal in order_rows
        }
        bills_by_session = {
            session_id: total_amount
            for session_id, total_amount in db.query(Bill.dining_session_id, Bill.total_amount).filter(
                Bill.dining_session_id.in_(session_ids)
            ).all()
        }

    requests_by_table: dict[int, list[str]] = {}
    request_rows = db.query(ServiceRequest.table_id, ServiceRequest.request_type).filter(
        ServiceRequest.restaurant_id == restaurant_id,
        ServiceRequest.status == "pending",
        ServiceRequest.request_type != "bill",
    ).all()
    for table_id, request_type in request_rows:
        requests_by_table.setdefault(table_id, []).append(request_type)

    reports_by_session: dict[int, dict[str, str]] = {}
    if session_ids:
        report_rows = db.query(
            EmptyTableReport.session_id,
            EmptyTableReport.reported_at,
            StaffUser.name,
        ).outerjoin(
            StaffUser,
            StaffUser.id == EmptyTableReport.reported_by_user_id,
        ).filter(
            EmptyTableReport.restaurant_id == restaurant_id,
            EmptyTableReport.session_id.in_(session_ids),
            EmptyTableReport.status == "open",
        ).all()
        reports_by_session = {
            session_id: {
                "reported_at": reported_at.isoformat(),
                "reported_by_name": reporter_name or "Staff",
            }
            for session_id, reported_at, reporter_name in report_rows
        }

    items = []
    for table in tables:
        session = sessions_by_table.get(table.id)
        session_id = session.id if session else -1
        active_count, ready_count, subtotal = order_stats.get(
            session_id,
            (0, 0, Decimal("0.00")),
        )
        attention = list(requests_by_table.get(table.id, []))
        if ready_count:
            attention.append("ready_order")
        current_bill_amount = bills_by_session.get(session_id, subtotal) if session else Decimal("0.00")
        items.append({
            "id": table.id,
            "table_number": table.table_number,
            "state": "occupied" if session else "available",
            "has_open_session": bool(session),
            "session_token": session.public_token if session else None,
            "session_status": session.status if session else None,
            "active_order_count": active_count,
            "current_bill_amount": _money(current_bill_amount),
            "opened_minutes_ago": _minutes_since(session.opened_at) if session else None,
            "attention": attention,
            "bill_requested": bool(session and session.status in {"payment_requested", "payment_pending"}) or "bill" in attention,
            "empty_table_report": reports_by_session.get(session_id),
        })
    return items


def _staff_request_response(db: Session, request: ServiceRequest) -> StaffServiceRequestResponse:
    table = db.query(RestaurantTable).filter(RestaurantTable.id == request.table_id).first()
    order_number = None
    dining_session_token = None
    bill_number = None
    resolver_name = None
    if request.order_id:
        order = db.query(Order).filter(Order.id == request.order_id).first()
        if order:
            order_number = order.order_number
    if request.dining_session_id:
        dining_session = db.query(DiningSession).filter(DiningSession.id == request.dining_session_id).first()
        if dining_session:
            dining_session_token = dining_session.public_token
        bill = db.query(Bill).filter(Bill.dining_session_id == request.dining_session_id).first()
        if bill:
            bill_number = bill.bill_number
    if request.resolved_by_staff_id:
        resolver = db.query(StaffUser).filter(StaffUser.id == request.resolved_by_staff_id).first()
        if resolver:
            resolver_name = resolver.name
    return StaffServiceRequestResponse(
        id=request.id,
        restaurant_id=request.restaurant_id,
        table_id=request.table_id,
        order_id=request.order_id,
        dining_session_id=request.dining_session_id,
        request_type=request.request_type,
        status=request.status,
        created_at=request.created_at,
        resolved_at=request.resolved_at,
        resolved_by_staff_id=request.resolved_by_staff_id,
        table_number=table.table_number if table else None,
        order_number=order_number,
        dining_session_token=dining_session_token,
        bill_number=bill_number,
        resolver_name=resolver_name,
    )


@router.get("")
def list_staff_tables(
    filter: str = "all",
    current_user: StaffUser = Depends(_staff_roles),
    db: Session = Depends(get_db),
):
    tables = (
        db.query(RestaurantTable)
        .filter(RestaurantTable.restaurant_id == current_user.restaurant_id, RestaurantTable.is_active == True)
        .order_by(RestaurantTable.table_number.asc(), RestaurantTable.id.asc())
        .all()
    )
    items = _list_table_summaries(db, current_user.restaurant_id, tables)
    items.sort(key=lambda item: 0 if item["empty_table_report"] else 1)
    if filter == "available":
        items = [item for item in items if not item["has_open_session"]]
    elif filter == "occupied":
        items = [item for item in items if item["has_open_session"]]
    elif filter == "needs_attention":
        items = [item for item in items if item["attention"]]
    elif filter == "bill_requested":
        items = [item for item in items if item["bill_requested"]]
    elif filter != "all":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid table filter")
    return {"items": items}


@router.get("/{table_id}")
def get_staff_table(
    table_id: int,
    current_user: StaffUser = Depends(_staff_roles),
    db: Session = Depends(get_db),
):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    session = (
        _active_session_query(db, current_user.restaurant_id)
        .filter(DiningSession.table_id == table.id)
        .order_by(DiningSession.opened_at.desc(), DiningSession.id.desc())
        .first()
    )
    requests = db.query(ServiceRequest).filter(
        ServiceRequest.restaurant_id == current_user.restaurant_id,
        ServiceRequest.table_id == table.id,
        ServiceRequest.status == "pending",
        ServiceRequest.request_type != "bill",
    ).order_by(ServiceRequest.created_at.asc()).all()
    categories = db.query(MenuCategory).options(
        selectinload(MenuCategory.items)
        .selectinload(MenuItem.option_group_links)
        .selectinload(MenuItemOptionGroup.group)
        .selectinload(MenuOptionGroup.options)
    ).filter(
        MenuCategory.restaurant_id == current_user.restaurant_id,
        MenuCategory.is_active == True,
    ).order_by(MenuCategory.display_order.asc(), MenuCategory.name_en.asc()).all()
    activity = []
    if session:
        activity.append({"type": "session_opened", "label": "Session opened", "timestamp": session.opened_at.isoformat() if session.opened_at else None})
        for order in sorted(session.orders, key=lambda item: item.created_at):
            source_label = "Manual order added" if order.source == "staff_assisted" else "Customer order placed"
            activity.append({"type": "order_created", "label": f"{source_label} · {order.order_number}", "timestamp": order.created_at.isoformat()})
            status_labels = {
                "accepted": "Kitchen received order",
                "preparing": "Kitchen started preparing",
                "ready": "Order marked ready",
                "served": "Order served",
                "rejected": "Order cancelled",
            }
            for transition in sorted(order.status_history, key=lambda item: item.changed_at):
                label = status_labels.get(transition.new_status)
                if label:
                    activity.append({"type": "order_status", "label": f"{label} · {order.order_number}", "timestamp": transition.changed_at.isoformat()})
        for request in requests:
            request_labels = {"waiter": "Staff requested", "water": "Water requested", "bill": "Bill requested"}
            activity.append({"type": "request", "label": request_labels.get(request.request_type, "Assistance requested"), "timestamp": request.created_at.isoformat()})
        if session.bill:
            activity.append({"type": "bill", "label": f"Bill generated · {session.bill.bill_number}", "timestamp": session.bill.generated_at.isoformat()})
            sent_audit = db.query(AuditLog).filter(
                AuditLog.restaurant_id == current_user.restaurant_id,
                AuditLog.target_type == "bill",
                AuditLog.target_id == str(session.bill.id),
                AuditLog.action == "bill.sent_to_counter",
            ).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).first()
            if sent_audit:
                activity.append({"type": "bill_sent", "label": "Bill sent to counter", "timestamp": sent_audit.created_at.isoformat()})
        activity.sort(key=lambda item: item["timestamp"] or "")
    return {
        "table": _table_summary(db, table, session),
        "session": {
            "id": session.id,
            "session_token": session.public_token,
            "status": session.status,
            "opened_at": session.opened_at.isoformat() if session.opened_at else None,
            "running_subtotal": _money(sum((order.subtotal for order in session.orders if order.status != "rejected"), Decimal("0.00"))),
            "orders": [
                {
                    "id": order.id,
                    "order_number": order.order_number,
                    "public_token": order.public_token,
                    "status": order.status,
                    "subtotal": _money(order.subtotal),
                    "source": order.source,
                    "created_at": order.created_at.isoformat(),
                    "items": [
                        {
                            "id": item.id,
                            "item_name": item.item_name,
                            "quantity": item.quantity,
                            "unit_price": _money(item.unit_price),
                            "total_price": _money(item.total_price),
                            "item_note": item.item_note,
                            "cancellation_status": item.cancellation_status,
                            "cancellation_reason": item.cancellation_reason,
                            "cancelled_at": item.cancelled_at.isoformat() if item.cancelled_at else None,
                            "cancellation_actor_type": item.cancellation_actor_type,
                            "selected_options": [
                                {
                                    "option_name": option.option_name,
                                    "kitchen_display_name": option.kitchen_display_name,
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
                }
                for order in sorted(session.orders, key=lambda item: item.created_at)
            ],
            "bill": build_bill_response(db, session.bill) if session.bill else None,
        } if session else None,
        "requests": [
            {
                "id": request.id,
                "request_type": request.request_type,
                "created_at": request.created_at.isoformat(),
                "status": request.status,
            }
            for request in requests
        ],
        "menu_categories": [
            {
                "id": category.id,
                "name_en": category.name_en,
                "items": [
                    {
                        "id": item.id,
                        "name_en": item.name_en,
                        "price": _money(item.price),
                        "is_available": item.is_available,
                        "option_groups": serialize_item_option_groups(item),
                    }
                    for item in category.items
                ],
            }
            for category in categories
        ],
        "activity": activity,
        "empty_table_report": _table_summary(db, table, session)["empty_table_report"],
    }


def _report_channels(restaurant_id: int, table_id: int, session_token: str) -> list[str]:
    return [
        restaurant_channel(restaurant_id, "operations"),
        restaurant_channel(restaurant_id, "staff"),
        restaurant_channel(restaurant_id, "admin"),
        restaurant_channel(restaurant_id, "kitchen"),
        table_channel(restaurant_id, table_id),
        session_channel(session_token),
    ]


@router.post("/{table_id}/empty-table-report", status_code=status.HTTP_201_CREATED)
def report_table_empty(
    table_id: int,
    payload: EmptyTableReportCreateRequest,
    current_user: StaffUser = Depends(_report_role),
    db: Session = Depends(get_db),
):
    session = db.query(DiningSession).filter(
        DiningSession.restaurant_id == current_user.restaurant_id,
        DiningSession.table_id == table_id,
        DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
    ).with_for_update().first()
    if not session:
        raise HTTPException(status_code=404, detail="Active session not found")
    if session.public_token != payload.session_token:
        raise HTTPException(
            status_code=409,
            detail="This table session changed. Refresh and try again.",
        )
    existing = db.query(EmptyTableReport).filter(
        EmptyTableReport.restaurant_id == current_user.restaurant_id,
        EmptyTableReport.session_id == session.id,
        EmptyTableReport.status == "open",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Empty table already reported")
    report = EmptyTableReport(
        restaurant_id=current_user.restaurant_id,
        table_id=table_id,
        session_id=session.id,
        reported_by_user_id=current_user.id,
    )
    db.add(report)
    _audit(db, current_user, "empty_table_reported", "dining_session", str(session.id), {"table_id": table_id})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Empty table already reported")
    db.refresh(report)
    publish_event(EVENT_EMPTY_TABLE_REPORTED, restaurant_id=current_user.restaurant_id, channels=_report_channels(current_user.restaurant_id, table_id, session.public_token), resource_id=report.id, state={"table_id": table_id, "session_token": session.public_token, "reported_at": report.reported_at.isoformat()})
    return {
        "status": "open",
        "session_token": session.public_token,
        "reported_at": report.reported_at,
        "reported_by_name": current_user.name,
    }


def _lock_open_report(db: Session, current_user: StaffUser, table_id: int):
    report = db.query(EmptyTableReport).filter(
        EmptyTableReport.restaurant_id == current_user.restaurant_id,
        EmptyTableReport.table_id == table_id,
        EmptyTableReport.status == "open",
    ).with_for_update().first()
    if not report:
        raise HTTPException(status_code=409, detail="No unresolved empty-table report")
    session = db.query(DiningSession).filter(
        DiningSession.id == report.session_id,
        DiningSession.restaurant_id == current_user.restaurant_id,
        DiningSession.table_id == table_id,
    ).with_for_update().first()
    if not session:
        raise HTTPException(status_code=409, detail="Reported session is no longer available")
    return report, session


@router.post("/{table_id}/empty-table-report/dismiss")
def dismiss_empty_table_report(
    table_id: int,
    current_user: StaffUser = Depends(_report_resolution_roles),
    db: Session = Depends(get_db),
):
    report, session = _lock_open_report(db, current_user, table_id)
    now = datetime.datetime.now(datetime.timezone.utc)
    report.status = "dismissed"
    report.resolved_at = now
    report.resolved_by_user_id = current_user.id
    report.resolution_reason = "dismissed"
    _audit(db, current_user, "empty_table_report_dismissed", "dining_session", str(session.id), {"table_id": table_id})
    db.commit()
    publish_event(EVENT_EMPTY_TABLE_DISMISSED, restaurant_id=current_user.restaurant_id, channels=_report_channels(current_user.restaurant_id, table_id, session.public_token), resource_id=report.id, state={"table_id": table_id, "session_token": session.public_token})
    return {"status": "dismissed"}


@router.post("/{table_id}/empty-table-report/close-session")
def close_reported_empty_table_session(
    table_id: int,
    payload: ResolutionReasonRequest,
    current_user: StaffUser = Depends(_report_resolution_roles),
    db: Session = Depends(get_db),
):
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=422, detail="Resolution reason is required")
    report, session = _lock_open_report(db, current_user, table_id)
    if session.status not in ACTIVE_DINING_SESSION_STATUSES:
        raise HTTPException(status_code=409, detail="Reported session is no longer active")
    bill = db.query(Bill).filter(
        Bill.restaurant_id == current_user.restaurant_id,
        Bill.dining_session_id == session.id,
    ).with_for_update().first()
    if bill and bill.status != "draft":
        raise HTTPException(status_code=409, detail=f"Cannot close a session with a {bill.status} bill")
    orders = db.query(Order).filter(
        Order.restaurant_id == current_user.restaurant_id,
        Order.dining_session_id == session.id,
    ).with_for_update().all()
    now = datetime.datetime.now(datetime.timezone.utc)
    cancelled = []
    for order in orders:
        if order.status in {"pending", "accepted", "preparing", "ready"}:
            old_status = order.status
            order.status = "rejected"
            order.cancellation_reason = "session_closed_empty_table"
            db.add(OrderStatusHistory(order_id=order.id, old_status=old_status, new_status="rejected", changed_by_staff_id=current_user.id))
            _audit(db, current_user, "order_cancelled_empty_table", "order", str(order.id), {"table_id": table_id, "session_id": session.id, "reason": order.cancellation_reason})
            cancelled.append(order)
    if bill:
        bill.status = "cancelled"
        _audit(db, current_user, "draft_bill_voided_empty_table", "bill", str(bill.id), {"table_id": table_id, "session_id": session.id})
    session.status = "cancelled"
    session.closed_at = now
    session.closed_by_staff_id = current_user.id
    invalidated = invalidate_session_participants(db, session, "Session closed after empty-table report")
    report.status = "resolved_by_session_close"
    report.resolved_at = now
    report.resolved_by_user_id = current_user.id
    report.resolution_reason = reason
    _audit(db, current_user, "empty_table_session_closed", "dining_session", str(session.id), {"table_id": table_id, "cancelled_order_ids": [order.id for order in cancelled], "reason": reason})
    _audit(db, current_user, "table_participants_invalidated", "dining_session", str(session.id), {"table_id": table_id, "count": invalidated, "reason": "session_closed_empty_table"})
    db.commit()
    channels = _report_channels(current_user.restaurant_id, table_id, session.public_token)
    for event_type, state in (
        (EVENT_SESSION_ORDERS_CANCELLED, {"table_id": table_id, "session_token": session.public_token, "count": len(cancelled)}),
        (EVENT_DRAFT_BILL_VOIDED, {"table_id": table_id, "session_token": session.public_token, "bill_number": bill.bill_number if bill else None}),
        (EVENT_EMPTY_TABLE_RESOLVED, {"table_id": table_id, "session_token": session.public_token}),
        (EVENT_SESSION_FORCE_CLOSED, {"table_id": table_id, "session_token": session.public_token, "status": "cancelled"}),
        (EVENT_TABLE_UPDATED, {"table_id": table_id}),
    ):
        if event_type != EVENT_DRAFT_BILL_VOIDED or bill:
            publish_event(event_type, restaurant_id=current_user.restaurant_id, channels=channels, resource_id=session.id, state=state)
    return {"status": "closed", "cancelled_orders": len(cancelled)}


@router.post("/{table_id}/sessions", status_code=status.HTTP_201_CREATED)
def start_staff_table_session(
    table_id: int,
    current_user: StaffUser = Depends(_staff_write_roles),
    db: Session = Depends(get_db),
):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    existing = find_current_open_session_for_table(db, table.id)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An active session already exists for this table.")
    session = create_session_safely(db, current_user.restaurant, table, opened_by_staff_id=current_user.id)
    _audit(db, current_user, "staff_session_opened", "dining_session", str(session.id), {"table_id": table.id})
    db.commit()
    publish_event(
        EVENT_SESSION_OPENED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), session_channel(session.public_token), table_channel(current_user.restaurant_id, table.id)],
        resource_id=session.id,
        state={"table_id": table.id, "session_token": session.public_token},
    )
    publish_event(
        EVENT_TABLE_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "staff"), table_channel(current_user.restaurant_id, table.id)],
        resource_id=table.id,
        state={"table_id": table.id},
    )
    return {"id": session.id, "session_token": session.public_token, "status": session.status}


@router.post("/{table_id}/orders", status_code=status.HTTP_201_CREATED)
def create_staff_table_order(
    table_id: int,
    order_req: PublicOrderCreateRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_staff_write_roles),
    db: Session = Depends(get_db),
):
    key_clean = validate_idempotency_key(idempotency_key)
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    existing_session = find_current_open_session_for_table(db, table.id)
    session = get_or_create_open_session(
        db,
        current_user.restaurant,
        table,
        opened_by_staff_id=current_user.id,
    )
    if session.status not in {"open", "payment_requested"} or (session.bill and session.bill.status != "draft"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordering is locked for this table session.")
    order = create_order_in_session(
        db,
        current_user.restaurant,
        table,
        session,
        order_req,
        key_clean,
        created_by_staff_id=current_user.id,
        source=f"{current_user.role}_assisted",
    )
    _audit(db, current_user, "staff_manual_order_created", "order", str(order.id), {"table_id": table.id, "source": order.source})
    if session.bill and session.bill.status == "draft":
        from app.services.bills import apply_draft_totals
        apply_draft_totals(db, session.bill)
    if not existing_session:
        _audit(db, current_user, "staff_session_opened", "dining_session", str(session.id), {"table_id": table.id, "opened_by": "staff_order"})
    db.commit()
    if session.bill and session.bill.status == "draft":
        publish_event(
            EVENT_BILL_GENERATED,
            restaurant_id=current_user.restaurant_id,
            channels=[
                restaurant_channel(current_user.restaurant_id, "operations"),
                restaurant_channel(current_user.restaurant_id, "staff"),
                session_channel(session.public_token),
                table_channel(current_user.restaurant_id, table.id),
            ],
            resource_id=session.bill.id,
            state={"bill_number": session.bill.bill_number, "session_token": session.public_token, "status": session.bill.status},
        )
    if not existing_session:
        publish_event(
            EVENT_SESSION_OPENED,
            restaurant_id=current_user.restaurant_id,
            channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), session_channel(session.public_token), table_channel(current_user.restaurant_id, table.id)],
            resource_id=session.id,
            state={"table_id": table.id, "session_token": session.public_token},
        )
    publish_event(
        EVENT_ORDER_CREATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "kitchen"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(session.public_token),
            table_channel(current_user.restaurant_id, table.id),
            order_channel(order.public_token),
        ],
        resource_id=order.id,
        state={"order_number": order.order_number, "status": order.status, "table_id": table.id, "source": order.source},
    )
    publish_event(
        EVENT_TABLE_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "staff"), table_channel(current_user.restaurant_id, table.id)],
        resource_id=table.id,
        state={"table_id": table.id},
    )
    return build_order_response(db, load_order_for_response(db, order.id))


@router.post("/{table_id}/served-items", status_code=status.HTTP_201_CREATED)
def create_staff_served_item(
    table_id: int,
    order_req: ServedItemCreateRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_staff_write_roles),
    db: Session = Depends(get_db),
):
    """Record food already served without sending a new ticket to the kitchen."""
    key_clean = validate_idempotency_key(idempotency_key)
    reason = order_req.late_entry_reason.strip()
    if not reason:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Late-entry reason is required.")
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    session = find_current_open_session_for_table(db, table.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found")
    if session.status not in {"open", "payment_requested"} or (session.bill and session.bill.status != "draft"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordering is locked for this table session.")

    order = create_order_in_session(
        db,
        current_user.restaurant,
        table,
        session,
        order_req,
        key_clean,
        created_by_staff_id=current_user.id,
        source="staff_late_entry",
        initial_status="served",
    )
    _audit(db, current_user, "staff_served_item_created", "order", str(order.id), {
        "table_id": table.id,
        "source": order.source,
        "reason": reason,
    })
    if session.bill and session.bill.status == "draft":
        from app.services.bills import apply_draft_totals
        apply_draft_totals(db, session.bill)
    db.commit()
    channels = [
        restaurant_channel(current_user.restaurant_id, "operations"),
        restaurant_channel(current_user.restaurant_id, "staff"),
        session_channel(session.public_token),
        table_channel(current_user.restaurant_id, table.id),
        order_channel(order.public_token),
    ]
    publish_event(
        EVENT_ORDER_CREATED,
        restaurant_id=current_user.restaurant_id,
        channels=channels,
        resource_id=order.id,
        state={"order_number": order.order_number, "status": "served", "table_id": table.id, "source": order.source},
    )
    if session.bill and session.bill.status == "draft":
        publish_event(
            EVENT_BILL_GENERATED,
            restaurant_id=current_user.restaurant_id,
            channels=channels,
            resource_id=session.bill.id,
            state={"bill_number": session.bill.bill_number, "session_token": session.public_token, "status": "draft"},
        )
    return build_order_response(db, load_order_for_response(db, order.id))


@router.post("/{table_id}/bill", status_code=status.HTTP_201_CREATED)
def create_staff_table_bill(
    table_id: int,
    current_user: StaffUser = Depends(_staff_write_roles),
    db: Session = Depends(get_db),
):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    session = find_current_open_session_for_table(db, table.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found")
    bill = create_or_refresh_bill_for_session(db, session, generated_by_staff_id=current_user.id)
    if not bill.generated_by_staff_id:
        bill.generated_by_staff_id = current_user.id
    _audit(db, current_user, "staff_bill_generated", "bill", str(bill.id), {"table_id": table.id})
    db.commit()
    publish_event(
        EVENT_BILL_GENERATED,
        restaurant_id=current_user.restaurant_id,
        channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), session_channel(session.public_token), table_channel(current_user.restaurant_id, table.id)],
        resource_id=bill.id,
        state={"bill_number": bill.bill_number, "session_token": session.public_token, "status": bill.status},
    )
    return build_bill_response(db, bill)


@router.post("/{table_id}/bill-request")
def request_staff_table_bill(
    table_id: int,
    response: Response,
    current_user: StaffUser = Depends(_staff_write_roles),
    db: Session = Depends(get_db),
):
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    session = find_current_open_session_for_table(db, table.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found")
    session = db.query(DiningSession).filter(
        DiningSession.id == session.id,
        DiningSession.restaurant_id == current_user.restaurant_id,
        DiningSession.table_id == table.id,
    ).with_for_update().first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found")

    if session.status == "payment_requested" and session.bill:
        return build_bill_response(db, session.bill)
    if session.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bill request is not available for this session.")

    valid_order_count = db.query(Order).filter(
        Order.restaurant_id == current_user.restaurant_id,
        Order.table_id == table.id,
        Order.dining_session_id == session.id,
        Order.status != "rejected",
    ).count()
    if valid_order_count < 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="At least one valid order is required before requesting a bill.")

    if session.bill:
        if session.bill.status == "paid":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bill has already been paid.")
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bill has already been generated.")

    bill = create_or_refresh_bill_for_session(db, session, generated_by_staff_id=current_user.id)
    if not bill.generated_by_staff_id:
        bill.generated_by_staff_id = current_user.id
    session.status = "payment_requested"
    session.payment_requested_at = datetime.datetime.now(datetime.timezone.utc)
    _audit(db, current_user, "staff_bill_requested", "bill", str(bill.id), {"table_id": table.id, "session_token": session.public_token})
    db.commit()

    publish_event(
        EVENT_BILL_GENERATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "operations"),
            restaurant_channel(current_user.restaurant_id, "staff"),
            session_channel(session.public_token),
            table_channel(current_user.restaurant_id, table.id),
        ],
        resource_id=bill.id,
        state={"bill_number": bill.bill_number, "session_token": session.public_token, "status": bill.status},
    )
    publish_event(
        EVENT_TABLE_UPDATED,
        restaurant_id=current_user.restaurant_id,
        channels=[
            restaurant_channel(current_user.restaurant_id, "staff"),
            table_channel(current_user.restaurant_id, table.id),
        ],
        resource_id=table.id,
        state={"table_id": table.id},
    )
    response.status_code = status.HTTP_201_CREATED
    return build_bill_response(db, bill)
