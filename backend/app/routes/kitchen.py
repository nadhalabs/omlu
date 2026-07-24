import secrets
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status as fastapi_status
from sqlalchemy.orm import Session, selectinload, joinedload
from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.staff_user import StaffUser
from app.models.quick_sale import QuickSale
from app.schemas.kitchen import KitchenOrderResponse, KitchenStatusUpdateRequest
from app.utils.auth import get_current_staff_user, RoleChecker
from app.services.realtime import EVENT_ORDER_STATUS_CHANGED, order_channel, publish_event, restaurant_channel, session_channel, table_channel

router = APIRouter()

# Setup Role Checking dependency for kitchen actions
kitchen_access_dependency = RoleChecker(["owner", "admin", "kitchen"])

ALLOWED_STATUSES = {"pending", "accepted", "preparing", "ready", "served", "rejected"}
DEFAULT_ACTIVE_STATUSES = ["pending", "accepted", "preparing", "ready"]

@router.get(
    "/kitchen/restaurants/{restaurant_slug}/orders",
    response_model=List[KitchenOrderResponse]
)
def get_kitchen_orders(
    restaurant_slug: str,
    status: Optional[str] = None,
    limit: int = 100,
    since: Optional[str] = None,
    current_user: StaffUser = Depends(kitchen_access_dependency),
    db: Session = Depends(get_db)
):
    # 1. Enforce Restaurant Tenant Isolation
    if current_user.restaurant.slug != restaurant_slug:
        raise HTTPException(
            status_code=fastapi_status.HTTP_403_FORBIDDEN,
            detail="Access denied for this restaurant"
        )

    # 2. Validate restaurant
    restaurant = db.query(Restaurant).filter(Restaurant.slug == restaurant_slug).first()
    if not restaurant or not restaurant.is_active:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found"
        )

    # 3. Limit validations
    if limit <= 0 or limit > 200:
        limit = 100

    # 4. Status filter validation
    status_list = DEFAULT_ACTIVE_STATUSES
    if status:
        individual_statuses = [s.strip() for s in status.split(",") if s.strip()]
        for s in individual_statuses:
            if s not in ALLOWED_STATUSES:
                raise HTTPException(
                    status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status filter value: {s}"
                )
        status_list = individual_statuses

    # 5. Build query
    query = db.query(Order).options(
        joinedload(Order.table),
        selectinload(Order.items).selectinload(OrderItem.selected_options),
        selectinload(Order.status_history)
    ).filter(
        Order.restaurant_id == restaurant.id,
        Order.status.in_(status_list)
    )

    # 6. Parse since filter (ISO 8601 timezone aware)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            # Filter using created_at as requested in limitation
            query = query.filter(Order.created_at >= since_dt)
        except ValueError:
            raise HTTPException(
                status_code=fastapi_status.HTTP_400_BAD_REQUEST,
                detail="Invalid 'since' ISO 8601 timestamp format."
            )

    # Sort oldest first (created_at ascending)
    orders = query.order_by(Order.created_at.asc()).limit(limit).all()
    takeaways = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(
        QuickSale.restaurant_id == restaurant.id,
        QuickSale.sale_type == "takeaway",
        QuickSale.status.in_(status_list),
    ).order_by(QuickSale.created_at.asc()).limit(limit).all()

    # Sort status history records by changed_at ascending
    for order in orders:
        order.status_history = sorted(order.status_history, key=lambda h: h.changed_at)

    # Map responses to format table number correctly
    response = []
    for order in orders:
        response.append({
            "order_number": order.order_number,
            "public_token": order.public_token,
            "table_number": order.table.table_number,
            "status": order.status,
            "subtotal": order.subtotal,
            "customer_note": order.customer_note,
            "created_at": order.created_at,
            "status_history": order.status_history,
            "items": order.items
        })
    for sale in takeaways:
        response.append({
            "order_number": sale.order_number, "public_token": sale.public_token, "table_number": "Takeaway",
            "status": sale.status, "subtotal": sale.subtotal, "customer_note": sale.note, "created_at": sale.created_at,
            "status_history": [], "source": "takeaway",
            "items": [{"item_name": item.item_name, "quantity": item.quantity, "unit_price": item.unit_price, "total_price": item.total_price, "item_note": None, "selected_options": []} for item in sale.items],
        })

    return response


@router.patch(
    "/kitchen/restaurants/{restaurant_slug}/orders/{public_token}/status",
    response_model=KitchenOrderResponse
)
def update_kitchen_order_status(
    restaurant_slug: str,
    public_token: str,
    update_req: KitchenStatusUpdateRequest,
    current_user: StaffUser = Depends(kitchen_access_dependency),
    db: Session = Depends(get_db)
):
    # 1. Enforce Restaurant Tenant Isolation
    if current_user.restaurant.slug != restaurant_slug:
        raise HTTPException(
            status_code=fastapi_status.HTTP_403_FORBIDDEN,
            detail="Access denied for this restaurant"
        )

    # 2. Validate restaurant
    restaurant = db.query(Restaurant).filter(Restaurant.slug == restaurant_slug).first()
    if not restaurant or not restaurant.is_active:
        raise HTTPException(
            status_code=fastapi_status.HTTP_404_NOT_FOUND,
            detail="Restaurant not found"
        )

    # Allowed state transition map
    ALLOWED_TRANSITIONS = {
        "pending": {"accepted", "rejected"},
        "accepted": {"preparing", "rejected"},
        "preparing": {"ready"},
        "ready": {"served"}
    }

    if public_token.startswith("qs_"):
        sale = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(QuickSale.restaurant_id == restaurant.id, QuickSale.public_token == public_token, QuickSale.sale_type == "takeaway").with_for_update().first()
        if not sale: raise HTTPException(status_code=fastapi_status.HTTP_404_NOT_FOUND, detail="Takeaway not found")
        transitions = {
            "pending": {"accepted"},
            "accepted": {"preparing"},
            "preparing": {"ready"},
            "ready": {"served"},
        }
        if update_req.status not in transitions.get(sale.status, set()):
            raise HTTPException(status_code=fastapi_status.HTTP_409_CONFLICT, detail=f"Invalid transition from '{sale.status}' to '{update_req.status}'.")
        sale.status = update_req.status; db.commit(); db.refresh(sale)
        publish_event(EVENT_ORDER_STATUS_CHANGED, restaurant_id=restaurant.id, channels=[restaurant_channel(restaurant.id, "operations"), restaurant_channel(restaurant.id, "kitchen")], resource_id=sale.id, state={"order_number": sale.order_number, "status": sale.status, "source": "takeaway"})
        return {"order_number": sale.order_number, "public_token": sale.public_token, "table_number": "Takeaway", "status": sale.status, "subtotal": sale.subtotal, "customer_note": sale.note, "created_at": sale.created_at, "status_history": [], "items": [{"item_name": item.item_name, "quantity": item.quantity, "unit_price": item.unit_price, "total_price": item.total_price, "item_note": None, "selected_options": []} for item in sale.items]}

    try:
        # Start of Row Lock / Update transaction block
        # Find order using both restaurant and public token to enforce isolation.
        order = db.query(Order).filter(
            Order.restaurant_id == restaurant.id,
            Order.public_token == public_token
        ).with_for_update().first()

        if not order:
            raise HTTPException(
                status_code=fastapi_status.HTTP_404_NOT_FOUND,
                detail="Order not found"
            )

        old_status = order.status
        new_status = update_req.status

        # Transition validation
        if old_status not in ALLOWED_TRANSITIONS or new_status not in ALLOWED_TRANSITIONS[old_status]:
            raise HTTPException(
                status_code=fastapi_status.HTTP_409_CONFLICT,
                detail=f"Invalid transition from '{old_status}' to '{new_status}'."
            )

        # Update order status
        order.status = new_status

        # Insert status history entry
        history_entry = OrderStatusHistory(
            order_id=order.id,
            old_status=old_status,
            new_status=new_status,
            changed_by_staff_id=None
        )
        db.add(history_entry)

        db.commit()

        # Load committed order with relationships loaded separately
        full_order = db.query(Order).options(
            joinedload(Order.table),
            joinedload(Order.dining_session),
            selectinload(Order.items).selectinload(OrderItem.selected_options),
            selectinload(Order.status_history)
        ).filter(
            Order.id == order.id
        ).first()
        channels = [
            restaurant_channel(restaurant.id, "operations"),
            restaurant_channel(restaurant.id, "kitchen"),
            restaurant_channel(restaurant.id, "staff"),
            order_channel(full_order.public_token),
            table_channel(restaurant.id, full_order.table_id),
        ]
        if full_order.dining_session:
            channels.append(session_channel(full_order.dining_session.public_token))
        publish_event(
            EVENT_ORDER_STATUS_CHANGED,
            restaurant_id=restaurant.id,
            channels=channels,
            resource_id=full_order.id,
            state={"order_number": full_order.order_number, "status": full_order.status, "table_id": full_order.table_id},
        )

        # Sort history for response
        full_order.status_history = sorted(full_order.status_history, key=lambda h: h.changed_at)

        return {
            "order_number": full_order.order_number,
            "public_token": full_order.public_token,
            "table_number": full_order.table.table_number,
            "status": full_order.status,
            "subtotal": full_order.subtotal,
            "customer_note": full_order.customer_note,
            "created_at": full_order.created_at,
            "status_history": full_order.status_history,
            "items": full_order.items
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal database update failure: {str(e)}"
        )
