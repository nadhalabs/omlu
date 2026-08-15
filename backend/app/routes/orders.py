import uuid
import datetime
import json
import time
import threading
from collections import defaultdict
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem, OrderItemSelectedOption, OrderStatusHistory, RestaurantDailySequence
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog
from app.models.table_session_participant import TableSessionParticipant
from app.schemas.order import OrderItemCancellationRequest, PublicOrderCreateRequest, PublicOrderResponse
from app.schemas.dining_session import PublicDiningSessionResponse
from app.services.dining_sessions import (
    calculate_session_subtotal,
    create_session_safely,
    find_current_open_session_for_table,
    get_or_create_open_session,
)
from app.services.bills import apply_draft_totals
from app.services.order_pricing import validate_and_price_order_items
from app.services.order_item_cancellation import cancel_order_item
from app.services.idempotency import ensure_same_request, request_hash
from app.utils.business_date import restaurant_business_date
from app.services.table_participants import (
    create_participant,
    enforce_session_action_rate,
    ensure_join_authority,
    load_participant,
    participant_token_header,
    recover_participant_authority,
    store_participant_authority_for_replay,
)
from app.services.realtime import (
    EVENT_ORDER_CREATED,
    EVENT_ORDER_ITEM_CANCELLED,
    EVENT_SESSION_UPDATED,
    order_channel,
    publish_event,
    restaurant_channel,
    session_channel,
    table_channel,
)

import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# In-memory fallback rate limiter: maximum 15 orders per 60 seconds per IP
order_rate_limit_records = defaultdict(list)
_order_rate_limit_redis_client = None
_order_rate_limit_redis_url: str | None = None
_order_rate_limit_redis_lock = threading.Lock()


def _create_order_rate_limit_redis_client(redis_url: str):
    import redis

    return redis.Redis.from_url(
        redis_url,
        socket_timeout=1.0,
        socket_connect_timeout=1.0,
    )


def _get_order_rate_limit_redis_client():
    global _order_rate_limit_redis_client, _order_rate_limit_redis_url

    redis_url = settings.redis_url
    if not redis_url:
        return None
    if _order_rate_limit_redis_client is not None and _order_rate_limit_redis_url == redis_url:
        return _order_rate_limit_redis_client

    with _order_rate_limit_redis_lock:
        if _order_rate_limit_redis_client is not None and _order_rate_limit_redis_url == redis_url:
            return _order_rate_limit_redis_client
        previous_client = _order_rate_limit_redis_client
        _order_rate_limit_redis_client = _create_order_rate_limit_redis_client(redis_url)
        _order_rate_limit_redis_url = redis_url
        if previous_client is not None:
            try:
                previous_client.close()
            except Exception as exc:
                logger.debug(
                    "order_rate_limit.redis_previous_client_close_failed error=%s",
                    exc.__class__.__name__,
                )
        return _order_rate_limit_redis_client


def close_order_rate_limit_redis_client() -> None:
    global _order_rate_limit_redis_client, _order_rate_limit_redis_url

    with _order_rate_limit_redis_lock:
        client = _order_rate_limit_redis_client
        _order_rate_limit_redis_client = None
        _order_rate_limit_redis_url = None
    if client is not None:
        try:
            client.close()
        except Exception as exc:
            logger.debug(
                "order_rate_limit.redis_client_close_failed error=%s",
                exc.__class__.__name__,
            )


def check_rate_limit(client_ip: str) -> bool:
    now = time.time()
    # 1. Try Redis sliding-window counter if configured
    if settings.redis_url:
        try:
            r = _get_order_rate_limit_redis_client()
            key = f"rate_limit:order:{client_ip}"
            pipe = r.pipeline()
            pipe.incr(key)
            pipe.expire(key, 60)
            count, _ = pipe.execute()
            if count > 15:
                return False
            return True
        except Exception as exc:
            logger.debug(
                "order_rate_limit.redis_fallback error=%s",
                exc.__class__.__name__,
            )

    # 2. In-memory rate limiting with stale key pruning
    timestamps = [t for t in order_rate_limit_records[client_ip] if now - t < 60]
    if len(timestamps) >= 15:
        order_rate_limit_records[client_ip] = timestamps
        return False

    timestamps.append(now)
    order_rate_limit_records[client_ip] = timestamps

    # Periodic cleanup of empty or stale IP records to prevent unbounded memory growth
    if len(order_rate_limit_records) > 200:
        stale_keys = [ip for ip, ts in order_rate_limit_records.items() if not ts or all(now - t >= 60 for t in ts)]
        for ip in stale_keys:
            del order_rate_limit_records[ip]

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
    return validate_and_price_order_items(db, restaurant.id, order_req)


def load_order_for_response(db: Session, order_id: int) -> Order:
    return db.query(Order).options(
        selectinload(Order.items).selectinload(OrderItem.selected_options),
        selectinload(Order.status_history),
        joinedload(Order.table),
        joinedload(Order.restaurant),
        joinedload(Order.dining_session),
    ).filter(Order.id == order_id).one()


def load_session_for_response(db: Session, session_id: int) -> DiningSession:
    return db.query(DiningSession).options(
        joinedload(DiningSession.restaurant),
        joinedload(DiningSession.table),
        joinedload(DiningSession.bill),
        selectinload(DiningSession.orders).options(
            selectinload(Order.items).selectinload(OrderItem.selected_options),
            selectinload(Order.status_history),
        ),
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
    for order in orders:
        order.status_history = sorted(order.status_history, key=lambda h: h.changed_at)
    service_requests = db.query(ServiceRequest).filter(
        ServiceRequest.restaurant_id == dining_session.restaurant_id,
        ServiceRequest.table_id == dining_session.table_id,
        ServiceRequest.dining_session_id == dining_session.id,
        ServiceRequest.request_type != "bill",
    ).order_by(ServiceRequest.created_at.asc(), ServiceRequest.id.asc()).all()
    bill = dining_session.bill
    bill_payload = None
    if bill:
        bill_payload = {
            "bill_number": bill.bill_number,
            "status": bill.status,
            "total_amount": bill.total_amount,
            "currency": bill.currency,
            "generated_at": bill.generated_at,
            "paid_at": bill.paid_at,
            "payment_method": bill.payment_method,
            "receipt_token": bill.receipt_token if bill.status in {"issued", "payment_pending", "paid"} else None,
            "invoice_number": bill.invoice_number if bill.status in {"issued", "payment_pending", "paid"} else None,
            "invoice_date": bill.invoice_date if bill.status in {"issued", "payment_pending", "paid"} else None,
            "subtotal": bill.subtotal,
            "discount_amount": bill.discount_amount,
            "taxable_amount": bill.taxable_amount,
            "gst_rate": bill.gst_rate,
            "cgst_amount": bill.cgst_amount,
            "sgst_amount": bill.sgst_amount,
            "igst_amount": bill.igst_amount,
            "tax_amount": bill.tax_amount,
        }
    return {
        "public_token": dining_session.public_token,
        "status": dining_session.status,
        "restaurant_name": dining_session.restaurant.name,
        "restaurant_slug": dining_session.restaurant.slug,
        "table_number": dining_session.table.table_number,
        "table_code": dining_session.table.table_code,
        "opened_at": dining_session.opened_at,
        "payment_requested_at": dining_session.payment_requested_at,
        "orders": orders,
        "combined_subtotal": sum((order.subtotal for order in orders if order.status not in {"rejected", "cancelled", "voided"}), Decimal("0.00")),
        "order_count": len(orders),
        "service_requests_enabled": getattr(dining_session.restaurant, "service_requests_enabled", True),
        "can_order_more": dining_session.status == "open",
        "bill": bill_payload,
        "service_requests": service_requests,
    }


def build_first_order_response(db: Session, dining_session: DiningSession, participant_token: str):
    return {
        "participant_token": participant_token,
        "session": build_session_response(db, dining_session),
    }


def publish_item_cancelled(order: Order, item: OrderItem, dining_session: DiningSession) -> None:
    publish_event(
        EVENT_ORDER_ITEM_CANCELLED,
        restaurant_id=order.restaurant_id,
        channels=[
            restaurant_channel(order.restaurant_id, "operations"),
            restaurant_channel(order.restaurant_id, "kitchen"),
            restaurant_channel(order.restaurant_id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(order.restaurant_id, order.table_id),
            order_channel(order.public_token),
        ],
        resource_id=item.id,
        state={
            "table_id": order.table_id,
            "session_token": dining_session.public_token,
            "order_id": order.id,
            "order_number": order.order_number,
            "order_public_token": order.public_token,
            "order_item_id": item.id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "cancellation_actor_type": item.cancellation_actor_type,
            "cancellation_reason": item.cancellation_reason,
            "cancelled_at": item.cancelled_at.isoformat(),
            "order_status": order.status,
            "order_subtotal": f"{order.subtotal:.2f}",
        },
    )


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


def lock_open_session(
    db: Session,
    dining_session: DiningSession,
    *,
    allow_staff_assisted: bool = False,
) -> DiningSession:
    locked_session = db.query(DiningSession).filter(
        DiningSession.id == dining_session.id
    ).with_for_update().first()
    if not locked_session:
        raise HTTPException(status_code=404, detail="Dining session not found")
    if allow_staff_assisted:
        if locked_session.status not in {"open", "payment_requested"} or (locked_session.bill and locked_session.bill.status != "draft"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ordering is locked for this table session."
            )
    else:
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
    created_by_staff_id: int | None = None,
    source: str = "customer_qr",
    created_by_participant_id: int | None = None,
    initial_status: str = "pending",
) -> Order:
    payload_hash = request_hash({
        "order": order_req.model_dump(mode="json"),
        "initial_status": initial_status,
        "source": source,
    })
    existing_order = db.query(Order).options(
        selectinload(Order.items).selectinload(OrderItem.selected_options),
        selectinload(Order.status_history),
        joinedload(Order.table),
        joinedload(Order.restaurant),
        joinedload(Order.dining_session),
    ).filter(
        Order.restaurant_id == restaurant.id,
        Order.idempotency_key == key_clean
    ).first()

    if existing_order:
        ensure_same_request(existing_order.idempotency_request_hash, payload_hash)
        if existing_order.dining_session_id and existing_order.dining_session_id != dining_session.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Idempotency-Key was already used for another dining session."
            )
        return existing_order

    subtotal, order_items_to_create = validate_public_order_items(db, restaurant, order_req)

    try:
        locked_session = lock_open_session(
            db, dining_session, allow_staff_assisted=created_by_staff_id is not None
        )

        today = restaurant_business_date(restaurant)
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
            status=initial_status,
            subtotal=subtotal,
            customer_note=order_req.customer_note,
            source=source,
            created_by_staff_id=created_by_staff_id,
            created_by_participant_id=created_by_participant_id,
            idempotency_key=key_clean,
            idempotency_request_hash=payload_hash,
        )
        db.add(new_order)
        db.flush()

        for item_data in order_items_to_create:
            order_item = OrderItem(
                order_id=new_order.id,
                menu_item_id=item_data.menu_item_id,
                category_id_snapshot=item_data.category_id_snapshot,
                category_name_snapshot=item_data.category_name_snapshot,
                item_name=item_data.item_name,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                total_price=item_data.total_price,
                item_note=item_data.item_note,
                hsn_sac_code_snapshot=item_data.hsn_sac_code_snapshot,
                gst_rate_snapshot=item_data.gst_rate_snapshot,
            )
            db.add(order_item)
            db.flush()
            for option in item_data.selected_options:
                db.add(OrderItemSelectedOption(
                    order_item_id=order_item.id,
                    menu_option_id=option.menu_option_id,
                    menu_option_group_id=option.menu_option_group_id,
                    option_name=option.option_name,
                    kitchen_display_name=option.kitchen_display_name,
                    group_name=option.group_name,
                    option_type=option.option_type,
                    price_delta=option.price_delta,
                    quantity=option.quantity,
                    display_order=option.display_order,
                ))

        db.add(OrderStatusHistory(
            order_id=new_order.id,
            old_status=None,
            new_status=initial_status,
            changed_by_staff_id=created_by_staff_id
        ))
        db.flush()

        bill = db.query(Bill).filter(
            Bill.dining_session_id == locked_session.id,
            Bill.status == "draft",
        ).with_for_update().first()
        if bill:
            apply_draft_totals(db, bill)
            db.flush()

        return new_order

    except IntegrityError:
        db.rollback()
        existing_order = db.query(Order).options(
            selectinload(Order.items).selectinload(OrderItem.selected_options),
            selectinload(Order.status_history),
            joinedload(Order.table),
            joinedload(Order.restaurant),
            joinedload(Order.dining_session),
        ).filter(
            Order.restaurant_id == restaurant.id,
            Order.idempotency_key == key_clean
        ).first()

        if existing_order:
            ensure_same_request(existing_order.idempotency_request_hash, payload_hash)
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
    participant_token: str = Depends(participant_token_header),
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
    if restaurant.operating_status != "open":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant is not accepting new customer orders.")

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

    dining_session = find_current_open_session_for_table(db, table.id)
    if not dining_session:
        raise HTTPException(status_code=409, detail="Start ordering to create secure table access.")
    participant = load_participant(
        db,
        participant_token,
        restaurant_id=restaurant.id,
        table_id=table.id,
        session_token=dining_session.public_token,
        require_open_for_ordering=True,
    )
    enforce_session_action_rate(
        db, dining_session, action="customer_order", ip_value=client_ip,
        participant_token=participant_token, limit=15,
    )
    new_order = create_order_in_session(db, restaurant, table, dining_session, order_req, key_clean, created_by_participant_id=participant.id)
    db.commit()
    publish_event(
        EVENT_ORDER_CREATED,
        restaurant_id=restaurant.id,
        channels=[
            restaurant_channel(restaurant.id, "operations"),
            restaurant_channel(restaurant.id, "kitchen"),
            restaurant_channel(restaurant.id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(restaurant.id, table.id),
            order_channel(new_order.public_token),
        ],
        resource_id=new_order.id,
        state={"order_number": new_order.order_number, "status": new_order.status, "table_id": table.id, "session_token": dining_session.public_token},
    )
    return build_order_response(db, load_order_for_response(db, new_order.id))


@router.post(
    "/public/restaurants/{restaurant_slug}/tables/{table_code}/first-order",
    status_code=status.HTTP_201_CREATED,
)
def create_first_public_order(
    restaurant_slug: str,
    table_code: str,
    order_req: PublicOrderCreateRequest,
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    device_id: str | None = Header(None, alias="X-Device-ID"),
    db: Session = Depends(get_db),
):
    """Atomically create the first table session, participant, and order."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many order submissions. Please wait a moment.")
    key_clean = validate_idempotency_key(idempotency_key)

    try:
        restaurant = db.query(Restaurant).filter(Restaurant.slug == restaurant_slug).first()
        if not restaurant or not restaurant.is_active:
            raise HTTPException(status_code=404, detail="Restaurant not found")
        if restaurant.operating_status != "open":
            raise HTTPException(status_code=403, detail="Restaurant is not accepting new customer orders.")

        table = db.query(RestaurantTable).filter(
            RestaurantTable.restaurant_id == restaurant.id,
            RestaurantTable.table_code == table_code,
        ).first()
        if not table or not table.is_active:
            raise HTTPException(status_code=404, detail="Table not found")

        locked_table = db.query(RestaurantTable).filter(RestaurantTable.id == table.id).with_for_update().one()
        existing_order = db.query(Order).filter(
            Order.restaurant_id == restaurant.id,
            Order.idempotency_key == key_clean,
        ).first()
        if existing_order:
            ensure_same_request(existing_order.idempotency_request_hash, request_hash({
                "order": order_req.model_dump(mode="json"),
                "initial_status": "pending",
                "source": "customer_qr",
            }))
            if existing_order.table_id != locked_table.id or not existing_order.dining_session_id:
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another table.")
            dining_session = db.query(DiningSession).filter(DiningSession.id == existing_order.dining_session_id).one()
            participant = db.query(TableSessionParticipant).filter(
                TableSessionParticipant.id == existing_order.created_by_participant_id,
                TableSessionParticipant.session_id == dining_session.id,
            ).one_or_none()
            if not participant:
                raise HTTPException(status_code=409, detail="Original participant authority is unavailable for replay.")
            participant_token = recover_participant_authority(participant)
            load_participant(db, participant_token, session_token=dining_session.public_token)
            db.rollback()
            return build_first_order_response(db, dining_session, participant_token)
        # Validate and price before taking occupancy. Invalid orders must never
        # leave an empty active session behind.
        validate_public_order_items(db, restaurant, order_req)
        if find_current_open_session_for_table(db, locked_table.id):
            raise HTTPException(
                status_code=409,
                detail="This table already has an active order. Enter the table join code.",
            )

        dining_session = create_session_safely(db, restaurant, locked_table)
        ensure_join_authority(dining_session)
        participant, participant_token = create_participant(db, dining_session, client_ip, device_id)
        store_participant_authority_for_replay(participant, participant_token)
        new_order = create_order_in_session(
            db,
            restaurant,
            locked_table,
            dining_session,
            order_req,
            key_clean,
            created_by_participant_id=participant.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    publish_event(
        EVENT_ORDER_CREATED,
        restaurant_id=restaurant.id,
        channels=[
            restaurant_channel(restaurant.id, "operations"),
            restaurant_channel(restaurant.id, "kitchen"),
            restaurant_channel(restaurant.id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(restaurant.id, locked_table.id),
            order_channel(new_order.public_token),
        ],
        resource_id=new_order.id,
        state={"order_number": new_order.order_number, "status": new_order.status, "table_id": locked_table.id, "session_token": dining_session.public_token},
    )
    publish_event(
        EVENT_SESSION_UPDATED,
        restaurant_id=restaurant.id,
        channels=[session_channel(dining_session.public_token), table_channel(restaurant.id, locked_table.id)],
        resource_id=dining_session.id,
        state={"session_token": dining_session.public_token},
    )
    return build_first_order_response(db, dining_session, participant_token)


@router.get(
    "/public/restaurants/{restaurant_slug}/tables/{table_code}/session",
)
def get_active_public_table_session(
    restaurant_slug: str,
    table_code: str,
    participant_token: str = Depends(participant_token_header),
    db: Session = Depends(get_db)
):
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == restaurant_slug,
        Restaurant.is_active == True,
    ).first()

    if not restaurant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found"
        )

    table = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant.id,
        RestaurantTable.table_code == table_code,
        RestaurantTable.is_active == True,
    ).first()

    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Table not found"
        )

    dining_session = find_current_open_session_for_table(db, table.id)
    if not dining_session or dining_session.restaurant_id != restaurant.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active table session found"
        )

    load_participant(db, participant_token, restaurant_id=restaurant.id, table_id=table.id, session_token=dining_session.public_token)
    return build_session_response(db, dining_session)


@router.get(
    "/public/sessions/{session_token}",
    response_model=PublicDiningSessionResponse
)
def get_public_session(
    session_token: str,
    participant_token: str = Depends(participant_token_header),
    db: Session = Depends(get_db)
):
    dining_session = db.query(DiningSession).filter(
        DiningSession.public_token == session_token
    ).first()

    if not dining_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SESSION_NOT_FOUND", "message": "Dining session not found"}
        )

    load_participant(db, participant_token, session_token=session_token)
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
    participant_token: str = Depends(participant_token_header),
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
    if dining_session.restaurant.operating_status != "open":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Restaurant is not accepting new customer orders.")
    if not dining_session.table.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table is inactive")

    participant = load_participant(
        db,
        participant_token,
        restaurant_id=dining_session.restaurant_id,
        table_id=dining_session.table_id,
        session_token=session_token,
        require_open_for_ordering=True,
    )
    enforce_session_action_rate(
        db, dining_session, action="customer_order", ip_value=client_ip,
        participant_token=participant_token, limit=15,
    )
    new_order = create_order_in_session(
        db,
        dining_session.restaurant,
        dining_session.table,
        dining_session,
        order_req,
        key_clean,
        created_by_participant_id=participant.id,
    )
    db.commit()
    publish_event(
        EVENT_ORDER_CREATED,
        restaurant_id=dining_session.restaurant_id,
        channels=[
            restaurant_channel(dining_session.restaurant_id, "operations"),
            restaurant_channel(dining_session.restaurant_id, "kitchen"),
            restaurant_channel(dining_session.restaurant_id, "staff"),
            session_channel(dining_session.public_token),
            table_channel(dining_session.restaurant_id, dining_session.table_id),
            order_channel(new_order.public_token),
        ],
        resource_id=new_order.id,
        state={"order_number": new_order.order_number, "status": new_order.status, "table_id": dining_session.table_id, "session_token": dining_session.public_token},
    )
    publish_event(
        EVENT_SESSION_UPDATED,
        restaurant_id=dining_session.restaurant_id,
        channels=[session_channel(dining_session.public_token), table_channel(dining_session.restaurant_id, dining_session.table_id)],
        resource_id=dining_session.id,
        state={"session_token": dining_session.public_token},
    )
    return build_session_response(db, new_order.dining_session)


@router.get(
    "/public/orders/{public_token}",
    response_model=PublicOrderResponse
)
def get_public_order(
    public_token: str,
    x_participant_token: str | None = Header(None, alias="X-Participant-Token"),
    db: Session = Depends(get_db)
):
    order = db.query(Order).options(
        selectinload(Order.items).selectinload(OrderItem.selected_options),
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
    if order.dining_session_id:
        if not x_participant_token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Join this table to continue")
        load_participant(
            db,
            x_participant_token,
            restaurant_id=order.restaurant_id,
            table_id=order.table_id,
            session_token=order.dining_session.public_token,
        )

    return build_order_response(db, order)


@router.post("/public/sessions/{session_token}/orders/{order_public_token}/items/{order_item_id}/cancel")
def cancel_public_order_item(
    session_token: str,
    order_public_token: str,
    order_item_id: int,
    body: OrderItemCancellationRequest,
    participant_token: str = Depends(participant_token_header),
    db: Session = Depends(get_db),
):
    dining_session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
    if not dining_session:
        raise HTTPException(status_code=404, detail="Dining session not found")
    participant = load_participant(db, participant_token, session_token=session_token, lock_for_action=True)
    try:
        order, item, locked_session, bill = cancel_order_item(
            db,
            restaurant_id=participant.restaurant_id,
            session_id=participant.session_id,
            order_public_token=order_public_token,
            order_item_id=order_item_id,
            actor_type="customer",
            reason=(body.reason or "customer_cancelled").strip() or "customer_cancelled",
            participant_id=participant.id,
            require_order_participant=True,
        )
        db.add(AuditLog(
            restaurant_id=order.restaurant_id,
            actor_role="customer",
            target_type="order_item",
            target_id=str(item.id),
            action="order_item_cancelled",
            new_value=json.dumps({
                "order_id": order.id,
                "participant_public_id": participant.public_id,
                "reason": item.cancellation_reason,
                "resulting_order_status": order.status,
            }),
        ))
        db.commit()
    except Exception:
        db.rollback()
        raise
    publish_item_cancelled(order, item, locked_session)
    return build_session_response(db, locked_session)
