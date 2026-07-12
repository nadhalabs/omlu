import uuid
import datetime
import time
from collections import defaultdict
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuItem
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem, OrderStatusHistory, RestaurantDailySequence
from app.schemas.order import PublicOrderCreateRequest, PublicOrderResponse
from app.schemas.dining_session import PublicDiningSessionResponse
from app.services.dining_sessions import (
    calculate_session_subtotal,
    get_or_create_open_session,
)

router = APIRouter()

# Simple in-memory rate limiter: maximum 15 orders per 60 seconds per IP
order_rate_limit_records = defaultdict(list)


def check_rate_limit(client_ip: str) -> bool:
    now = time.time()
    order_rate_limit_records[client_ip] = [
        t for t in order_rate_limit_records[client_ip] if now - t < 60
    ]
    if len(order_rate_limit_records[client_ip]) >= 15:
        return False
    order_rate_limit_records[client_ip].append(now)
    return True


def reset_order_rate_limit() -> None:
    order_rate_limit_records.clear()


def validate_idempotency_key(idempotency_key: Optional[str]) -> str:
    if not idempotency_key or not idempotency_key.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Idempotency-Key header is required"
        )

    key_clean = idempotency_key.strip()
    if len(key_clean) < 10 or len(key_clean) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid Idempotency-Key length. Must be between 10 and 50 characters."
        )
    return key_clean


def validate_public_order_items(
    db: Session,
    restaurant: Restaurant,
    order_req: PublicOrderCreateRequest,
):
    if not order_req.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty cart"
        )

    merged_items = {}
    for item in order_req.items:
        if item.quantity < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity must be greater than zero"
            )
        if item.menu_item_id in merged_items:
            merged_qty = merged_items[item.menu_item_id][0] + item.quantity
            merged_note = merged_items[item.menu_item_id][1]
            if item.item_note:
                merged_note = f"{merged_note}, {item.item_note}" if merged_note else item.item_note
            merged_items[item.menu_item_id] = (merged_qty, merged_note)
        else:
            merged_items[item.menu_item_id] = (item.quantity, item.item_note)

    if len(merged_items) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many unique line items (maximum 50)"
        )

    db_items = db.query(MenuItem).filter(MenuItem.id.in_(list(merged_items.keys()))).all()
    db_items_map = {item.id: item for item in db_items}

    order_items_to_create = []
    subtotal = Decimal("0.00")

    for menu_item_id, (quantity, item_note) in merged_items.items():
        if menu_item_id not in db_items_map:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Item not found"
            )

        db_item = db_items_map[menu_item_id]
        if db_item.restaurant_id != restaurant.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item belonging to another restaurant"
            )

        if not db_item.is_available:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Item unavailable"
            )

        if quantity < 1 or quantity > 50:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Merged quantity must be between 1 and 50"
            )

        total_price = db_item.price * quantity
        subtotal += total_price
        order_items_to_create.append({
            "menu_item_id": db_item.id,
            "item_name": db_item.name_en,
            "quantity": quantity,
            "unit_price": db_item.price,
            "total_price": total_price,
            "item_note": item_note,
        })

    return subtotal, order_items_to_create


def load_order_for_response(db: Session, order_id: int) -> Order:
    return db.query(Order).options(
        selectinload(Order.items),
        selectinload(Order.status_history),
        joinedload(Order.table),
        joinedload(Order.restaurant),
        joinedload(Order.dining_session),
    ).filter(Order.id == order_id).one()


def load_session_for_response(db: Session, session_id: int) -> DiningSession:
    return db.query(DiningSession).options(
        joinedload(DiningSession.restaurant),
        joinedload(DiningSession.table),
        selectinload(DiningSession.orders).selectinload(Order.items),
    ).filter(DiningSession.id == session_id).one()


def build_order_response(db: Session, order: Order):
    session_subtotal = None
    session_order_count = None
    dining_session_token = None
    can_order_more = None

    if order.dining_session_id and order.dining_session:
        dining_session_token = order.dining_session.public_token
        session_subtotal = calculate_session_subtotal(db, order.dining_session_id)
        session_order_count = db.query(Order).filter(
            Order.dining_session_id == order.dining_session_id
        ).count()
        can_order_more = order.dining_session.status == "open"

    return {
        "order_number": order.order_number,
        "public_token": order.public_token,
        "restaurant_name": order.restaurant.name,
        "restaurant_slug": order.restaurant.slug,
        "status": order.status,
        "subtotal": order.subtotal,
        "table_number": order.table.table_number,
        "table_code": order.table.table_code,
        "created_at": order.created_at,
        "customer_note": order.customer_note,
        "items": order.items,
        "status_history": order.status_history,
        "service_requests_enabled": getattr(order.restaurant, "service_requests_enabled", True),
        "dining_session_token": dining_session_token,
        "session_subtotal": session_subtotal,
        "session_order_count": session_order_count,
        "can_order_more": can_order_more,
    }


def build_session_response(db: Session, dining_session: DiningSession):
    dining_session = load_session_for_response(db, dining_session.id)
    orders = sorted(dining_session.orders, key=lambda order: (order.created_at, order.id))
    return {
        "public_token": dining_session.public_token,
        "status": dining_session.status,
        "restaurant_name": dining_session.restaurant.name,
        "restaurant_slug": dining_session.restaurant.slug,
        "table_number": dining_session.table.table_number,
        "table_code": dining_session.table.table_code,
        "opened_at": dining_session.opened_at,
        "orders": orders,
        "combined_subtotal": sum((order.subtotal for order in orders), Decimal("0.00")),
        "order_count": len(orders),
        "service_requests_enabled": getattr(dining_session.restaurant, "service_requests_enabled", True),
        "can_order_more": dining_session.status == "open",
    }


def get_orderable_session_for_table(
    db: Session,
    restaurant: Restaurant,
    table: RestaurantTable,
) -> DiningSession:
    dining_session = get_or_create_open_session(db, restaurant, table)
    if dining_session.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ordering is locked for this table session."
        )
    return dining_session


def lock_open_session(db: Session, dining_session: DiningSession) -> DiningSession:
    locked_session = db.query(DiningSession).filter(
        DiningSession.id == dining_session.id
    ).with_for_update().first()
    if not locked_session:
        raise HTTPException(status_code=404, detail="Dining session not found")
    if locked_session.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ordering is locked for this table session."
        )
    return locked_session


def create_order_in_session(
    db: Session,
    restaurant: Restaurant,
    table: RestaurantTable,
    dining_session: DiningSession,
    order_req: PublicOrderCreateRequest,
    key_clean: str,
) -> Order:
    existing_order = db.query(Order).options(
        selectinload(Order.items),
        selectinload(Order.status_history),
        joinedload(Order.table),
        joinedload(Order.restaurant),
        joinedload(Order.dining_session),
    ).filter(
        Order.restaurant_id == restaurant.id,
        Order.idempotency_key == key_clean
    ).first()

    if existing_order:
        if existing_order.dining_session_id and existing_order.dining_session_id != dining_session.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key was already used for another dining session."
            )
        return existing_order

    subtotal, order_items_to_create = validate_public_order_items(db, restaurant, order_req)

    try:
        locked_session = lock_open_session(db, dining_session)

        today = datetime.date.today()
        stmt = pg_insert(RestaurantDailySequence).values(
            restaurant_id=restaurant.id,
            sequence_date=today,
            last_value=1
        ).on_conflict_do_update(
            constraint="uq_restaurant_daily_sequence_date",
            set_={"last_value": RestaurantDailySequence.last_value + 1}
        ).returning(RestaurantDailySequence.last_value)

        seq_val = db.execute(stmt).scalar()
        order_prefix = getattr(restaurant, "order_prefix", "NS") or "NS"
        order_number = f"{order_prefix}-{today.strftime('%Y%m%d')}-{seq_val:04d}"

        new_order = Order(
            restaurant_id=restaurant.id,
            table_id=table.id,
            dining_session_id=locked_session.id,
            order_number=order_number,
            public_token=uuid.uuid4().hex,
            status="pending",
            subtotal=subtotal,
            customer_note=order_req.customer_note,
            idempotency_key=key_clean
        )
        db.add(new_order)
        db.flush()

        for item_data in order_items_to_create:
            db.add(OrderItem(
                order_id=new_order.id,
                menu_item_id=item_data["menu_item_id"],
                item_name=item_data["item_name"],
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
                total_price=item_data["total_price"],
                item_note=item_data["item_note"]
            ))

        db.add(OrderStatusHistory(
            order_id=new_order.id,
            old_status=None,
            new_status="pending",
            changed_by_staff_id=None
        ))
        db.flush()
        return new_order

    except IntegrityError:
        db.rollback()
        existing_order = db.query(Order).options(
            selectinload(Order.items),
            selectinload(Order.status_history),
            joinedload(Order.table),
            joinedload(Order.restaurant),
            joinedload(Order.dining_session),
        ).filter(
            Order.restaurant_id == restaurant.id,
            Order.idempotency_key == key_clean
        ).first()

        if existing_order:
            return existing_order

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Order processing failed due to conflicts. Please retry."
        )


@router.post(
    "/public/restaurants/{restaurant_slug}/tables/{table_code}/orders",
    response_model=PublicOrderResponse,
    status_code=status.HTTP_201_CREATED
)
def create_public_order(
    restaurant_slug: str,
    table_code: str,
    order_req: PublicOrderCreateRequest,
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db)
):
    # 1. Rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order submissions. Please wait a moment."
        )

    key_clean = validate_idempotency_key(idempotency_key)

    # 3. Validate Restaurant
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == restaurant_slug
    ).first()

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found"
        )
    if not restaurant.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant is inactive"
        )

    # 4. Validate Table
    table = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant.id,
        RestaurantTable.table_code == table_code
    ).first()

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )
    if not table.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table is inactive"
        )

    dining_session = get_orderable_session_for_table(db, restaurant, table)
    new_order = create_order_in_session(db, restaurant, table, dining_session, order_req, key_clean)
    db.commit()
    return build_order_response(db, load_order_for_response(db, new_order.id))


@router.get(
    "/public/sessions/{session_token}",
    response_model=PublicDiningSessionResponse
)
def get_public_session(
    session_token: str,
    db: Session = Depends(get_db)
):
    dining_session = db.query(DiningSession).filter(
        DiningSession.public_token == session_token
    ).first()

    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")

    return build_session_response(db, dining_session)


@router.post(
    "/public/sessions/{session_token}/orders",
    response_model=PublicDiningSessionResponse,
    status_code=status.HTTP_201_CREATED
)
def create_public_session_order(
    session_token: str,
    order_req: PublicOrderCreateRequest,
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db)
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order submissions. Please wait a moment."
        )

    key_clean = validate_idempotency_key(idempotency_key)
    dining_session = db.query(DiningSession).options(
        joinedload(DiningSession.restaurant),
        joinedload(DiningSession.table),
    ).filter(DiningSession.public_token == session_token).first()

    if not dining_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dining session not found")
    if dining_session.status != "open":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ordering is locked for this table session."
        )
    if not dining_session.restaurant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant is inactive")
    if not dining_session.table.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table is inactive")

    new_order = create_order_in_session(
        db,
        dining_session.restaurant,
        dining_session.table,
        dining_session,
        order_req,
        key_clean,
    )
    db.commit()
    return build_session_response(db, new_order.dining_session)


@router.get(
    "/public/orders/{public_token}",
    response_model=PublicOrderResponse
)
def get_public_order(
    public_token: str,
    db: Session = Depends(get_db)
):
    order = db.query(Order).options(
        selectinload(Order.items),
        selectinload(Order.status_history),
        joinedload(Order.table),
        joinedload(Order.restaurant),
        joinedload(Order.dining_session),
    ).filter(
        Order.public_token == public_token
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )

    return build_order_response(db, order)
