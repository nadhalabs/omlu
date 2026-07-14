import datetime
import json
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.bill import Bill
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOptionGroup
from app.models.order import Order, OrderItem
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffUser
from app.routes.orders import build_order_response, create_order_in_session, load_order_for_response, validate_idempotency_key
from app.schemas.order import PublicOrderCreateRequest
from app.services.bills import build_bill_response, create_or_refresh_bill_for_session
from app.services.dining_sessions import create_session_safely, find_current_open_session_for_table
from app.services.menu_options import serialize_item_option_groups
from app.services.realtime import (
    EVENT_BILL_GENERATED,
    EVENT_ORDER_CREATED,
    EVENT_SESSION_OPENED,
    EVENT_TABLE_UPDATED,
    publish_event,
    order_channel,
    restaurant_channel,
    session_channel,
    table_channel,
)
from app.utils.auth import RoleChecker


router = APIRouter(prefix="/staff/tables")
_staff_roles = RoleChecker(["owner", "admin", "staff"])


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
    }


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
    sessions = {session.table_id: session for session in _active_session_query(db, current_user.restaurant_id).all()}
    items = [_table_summary(db, table, sessions.get(table.id)) for table in tables]
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
            activity.append({"type": "order", "label": f"Order {order.order_number} {order.status}", "timestamp": order.created_at.isoformat()})
        if session.bill:
            activity.append({"type": "bill", "label": f"Bill {session.bill.bill_number} {session.bill.status}", "timestamp": session.bill.generated_at.isoformat()})
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
                    "status": order.status,
                    "subtotal": _money(order.subtotal),
                    "source": order.source,
                    "created_at": order.created_at.isoformat(),
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
    }


@router.post("/{table_id}/sessions", status_code=status.HTTP_201_CREATED)
def start_staff_table_session(
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
    current_user: StaffUser = Depends(_staff_roles),
    db: Session = Depends(get_db),
):
    key_clean = validate_idempotency_key(idempotency_key or f"staff-{current_user.id}-{uuid.uuid4().hex[:24]}")
    table = db.query(RestaurantTable).filter(
        RestaurantTable.id == table_id,
        RestaurantTable.restaurant_id == current_user.restaurant_id,
        RestaurantTable.is_active == True,
    ).first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")
    session = find_current_open_session_for_table(db, table.id)
    if not session:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Start a table session before placing an order.")
    if session.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordering is locked for this table session.")
    order = create_order_in_session(
        db,
        current_user.restaurant,
        table,
        session,
        order_req,
        key_clean,
        created_by_staff_id=current_user.id,
        source="staff_assisted",
    )
    _audit(db, current_user, "staff_manual_order_created", "order", str(order.id), {"table_id": table.id, "source": "staff_assisted"})
    db.commit()
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
        state={"order_number": order.order_number, "status": order.status, "table_id": table.id, "source": "staff_assisted"},
    )
    return build_order_response(db, load_order_for_response(db, order.id))


@router.post("/{table_id}/bill", status_code=status.HTTP_201_CREATED)
def create_staff_table_bill(
    table_id: int,
    current_user: StaffUser = Depends(_staff_roles),
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
