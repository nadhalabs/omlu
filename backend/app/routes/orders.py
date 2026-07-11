import uuid
import datetime
import time
from collections import defaultdict
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem, OrderStatusHistory, RestaurantDailySequence
from app.schemas.order import PublicOrderCreateRequest, PublicOrderResponse

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

    # 2. Idempotency Key Validation
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

    # 5. Check duplicate key pre-check to save DB work (optimistic execution path)
    existing_order = db.query(Order).options(
        selectinload(Order.items),
        selectinload(Order.status_history),
        joinedload(Order.table),
        joinedload(Order.restaurant)
    ).filter(
        Order.restaurant_id == restaurant.id,
        Order.idempotency_key == key_clean
    ).first()

    if existing_order:
        # Return existing order immediately
        return {
            "order_number": existing_order.order_number,
            "public_token": existing_order.public_token,
            "status": existing_order.status,
            "subtotal": existing_order.subtotal,
            "table_number": existing_order.table.table_number,
            "created_at": existing_order.created_at,
            "restaurant_name": existing_order.restaurant.name,
            "customer_note": existing_order.customer_note,
            "items": existing_order.items,
            "status_history": existing_order.status_history
        }

    # 6. Validate & Merge Cart Items
    if not order_req.items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty cart"
        )
    
    # Merge quantities by item ID
    merged_items = {}  # menu_item_id -> (quantity, item_note)
    for item in order_req.items:
        # Check raw quantity limits
        if item.quantity < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity must be greater than zero"
            )
        if item.menu_item_id in merged_items:
            merged_qty = merged_items[item.menu_item_id][0] + item.quantity
            # Keep first item_note or concatenate if both exist
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

    # Fetch menu items from database
    menu_item_ids = list(merged_items.keys())
    db_items = db.query(MenuItem).filter(
        MenuItem.id.in_(menu_item_ids)
    ).all()

    db_items_map = {item.id: item for item in db_items}

    # Validate items
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
        
        item_price = db_item.price
        total_price = item_price * quantity
        subtotal += total_price

        order_items_to_create.append({
            "menu_item_id": db_item.id,
            "item_name": db_item.name_en,
            "quantity": quantity,
            "unit_price": item_price,
            "total_price": total_price,
            "item_note": item_note
        })

    # Start transactional write
    try:
        # Generates restaurant-specific daily sequence and atomic increment
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

        # Format Order Number using restaurant's configured prefix
        order_prefix = getattr(restaurant, "order_prefix", "NS") or "NS"
        order_number = f"{order_prefix}-{today.strftime('%Y%m%d')}-{seq_val:04d}"
        public_token = uuid.uuid4().hex

        # Create Order
        new_order = Order(
            restaurant_id=restaurant.id,
            table_id=table.id,
            order_number=order_number,
            public_token=public_token,
            status="pending",
            subtotal=subtotal,
            customer_note=order_req.customer_note,
            idempotency_key=key_clean
        )
        db.add(new_order)
        db.flush()

        # Create Order Items
        for item_data in order_items_to_create:
            order_item = OrderItem(
                order_id=new_order.id,
                menu_item_id=item_data["menu_item_id"],
                item_name=item_data["item_name"],
                quantity=item_data["quantity"],
                unit_price=item_data["unit_price"],
                total_price=item_data["total_price"],
                item_note=item_data["item_note"]
            )
            db.add(order_item)

        # Create Status History Row
        history_entry = OrderStatusHistory(
            order_id=new_order.id,
            old_status=None,
            new_status="pending",
            changed_by_staff_id=None
        )
        db.add(history_entry)

        db.commit()

        # Refresh with loaded relationships for response
        db.refresh(new_order)

        return {
            "order_number": new_order.order_number,
            "public_token": new_order.public_token,
            "status": new_order.status,
            "subtotal": new_order.subtotal,
            "table_number": table.table_number,
            "created_at": new_order.created_at,
            "restaurant_name": restaurant.name,
            "customer_note": new_order.customer_note,
            "items": new_order.items,
            "status_history": new_order.status_history
        }

    except IntegrityError:
        db.rollback()
        # Concurrency safety block: Look up existing order on conflict
        # Fetch the existing order for this restaurant and key
        existing_order = db.query(Order).options(
            selectinload(Order.items),
            selectinload(Order.status_history),
            joinedload(Order.table),
            joinedload(Order.restaurant)
        ).filter(
            Order.restaurant_id == restaurant.id,
            Order.idempotency_key == key_clean
        ).first()

        if existing_order:
            return {
                "order_number": existing_order.order_number,
                "public_token": existing_order.public_token,
                "status": existing_order.status,
                "subtotal": existing_order.subtotal,
                "table_number": existing_order.table.table_number,
                "created_at": existing_order.created_at,
                "restaurant_name": existing_order.restaurant.name,
                "customer_note": existing_order.customer_note,
                "items": existing_order.items,
                "status_history": existing_order.status_history
            }
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Order processing failed due to conflicts. Please retry."
        )


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
        joinedload(Order.restaurant)
    ).filter(
        Order.public_token == public_token
    ).first()

    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )

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
    }
