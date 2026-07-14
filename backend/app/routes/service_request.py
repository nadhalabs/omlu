import time
import datetime
from collections import defaultdict
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.order import Order
from app.models.service_request import ServiceRequest
from app.models.dining_session import DiningSession
from app.models.bill import Bill
from app.schemas.service_request import ServiceRequestCreate, PublicServiceRequestResponse, StaffServiceRequestResponse
from app.services.dining_sessions import find_current_open_session_for_table
from app.utils.auth import get_current_staff_user, RoleChecker
from app.models.staff_user import StaffUser
from app.services.realtime import (
    EVENT_SERVICE_REQUEST_CREATED,
    EVENT_SERVICE_REQUEST_RESOLVED,
    publish_event,
    restaurant_channel,
    session_channel,
    table_channel,
)

router = APIRouter()

# In-memory rate limiter: max 5 service requests per 60 seconds per IP
service_req_rate_records = defaultdict(list)


def check_service_req_rate_limit(client_ip: str) -> bool:
    now = time.time()
    service_req_rate_records[client_ip] = [
        t for t in service_req_rate_records[client_ip] if now - t < 60
    ]
    if len(service_req_rate_records[client_ip]) >= 5:
        return False
    service_req_rate_records[client_ip].append(now)
    return True


def reset_service_request_rate_limit() -> None:
    service_req_rate_records.clear()



VALID_REQUEST_TYPES = {"waiter", "water", "bill"}


@router.post(
    "/public/restaurants/{restaurant_slug}/tables/{table_code}/service-requests",
    response_model=PublicServiceRequestResponse,
    status_code=status.HTTP_201_CREATED
)
def create_public_service_request(
    restaurant_slug: str,
    table_code: str,
    req_body: ServiceRequestCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """Public endpoint: customer submits a service request from their table."""
    # 1. IP rate limiting
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_service_req_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait before trying again."
        )

    # 2. Validate request type
    if req_body.request_type not in VALID_REQUEST_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid request_type. Must be one of: {', '.join(sorted(VALID_REQUEST_TYPES))}"
        )

    # 3. Validate restaurant (never trust IDs from frontend)
    restaurant = db.query(Restaurant).filter(
        Restaurant.slug == restaurant_slug,
        Restaurant.is_active == True
    ).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # 4. Check service_requests_enabled setting
    if not restaurant.service_requests_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Service requests are disabled for this restaurant."
        )

    # 5. Validate active table (by code, not ID)
    table = db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id == restaurant.id,
        RestaurantTable.table_code == table_code,
        RestaurantTable.is_active == True
    ).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found or inactive")

    # 6. If order token provided, validate it belongs to this restaurant and table
    order_id = None
    dining_session_id = None
    if req_body.public_order_token:
        order = db.query(Order).filter(
            Order.public_token == req_body.public_order_token,
            Order.restaurant_id == restaurant.id,
            Order.table_id == table.id
        ).first()
        if not order:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order token is not valid for this table."
            )
        if order.status == "rejected":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot associate a service request with a rejected order."
            )
        order_id = order.id
        dining_session_id = order.dining_session_id

        current_session = find_current_open_session_for_table(db, table.id)
        if current_session and dining_session_id and current_session.id != dining_session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Order token is not valid for the current table session."
            )
    else:
        current_session = find_current_open_session_for_table(db, table.id)
        if current_session:
            dining_session_id = current_session.id

    # 7. Cooldown check: use a SELECT FOR UPDATE within a transaction to prevent races
    # Rule: a table cannot have another PENDING request of the same type
    # Additionally enforce 2-minute cooldown after creation for just-resolved requests
    with db.begin_nested():
        # Lock check: find existing pending request of same type for this table
        existing_pending = db.query(ServiceRequest).filter(
            ServiceRequest.table_id == table.id,
            ServiceRequest.request_type == req_body.request_type,
            ServiceRequest.status == "pending"
        ).with_for_update().first()

        if existing_pending:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"A {req_body.request_type} request is already pending for this table."
            )

        # Also check 2-minute cooldown for recently resolved/created requests
        two_minutes_ago = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=2)
        recent_request = db.query(ServiceRequest).filter(
            ServiceRequest.table_id == table.id,
            ServiceRequest.request_type == req_body.request_type,
            ServiceRequest.created_at >= two_minutes_ago
        ).first()
        if recent_request:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Please wait before sending this request again."
            )

        # 8. Create the service request
        new_request = ServiceRequest(
            restaurant_id=restaurant.id,
            table_id=table.id,
            order_id=order_id,
            dining_session_id=dining_session_id,
            request_type=req_body.request_type,
            status="pending"
        )
        db.add(new_request)
        db.flush()

    db.commit()
    db.refresh(new_request)
    channels = [
        restaurant_channel(restaurant.id, "operations"),
        restaurant_channel(restaurant.id, "staff"),
        table_channel(restaurant.id, table.id),
    ]
    if dining_session_id:
        session = db.query(DiningSession).filter(DiningSession.id == dining_session_id).first()
        if session:
            channels.append(session_channel(session.public_token))
    publish_event(
        EVENT_SERVICE_REQUEST_CREATED,
        restaurant_id=restaurant.id,
        channels=channels,
        resource_id=new_request.id,
        state={"request_type": new_request.request_type, "status": new_request.status, "table_id": table.id},
    )
    return new_request


# --- Staff Service Request Endpoints ---

_staff_view_roles = RoleChecker(["owner", "admin", "staff"])
_staff_resolve_roles = RoleChecker(["owner", "admin", "staff"])


@router.get(
    "/staff/service-requests",
    response_model=List[StaffServiceRequestResponse]
)
def list_staff_service_requests(
    status_filter: Optional[str] = None,  # "pending" | "resolved" | "all"
    current_user: StaffUser = Depends(_staff_view_roles),
    db: Session = Depends(get_db)
):
    """Staff view: list service requests for this restaurant. Pending shown first, oldest first."""
    query = db.query(ServiceRequest).filter(
        ServiceRequest.restaurant_id == current_user.restaurant_id
    )

    if status_filter and status_filter != "all":
        query = query.filter(ServiceRequest.status == status_filter)
    else:
        # Default: show pending first, then resolved, oldest-first within each group
        query = query.order_by(
            # pending=0, resolved=1, cancelled=2 for ordering
            (ServiceRequest.status != "pending").asc(),
            ServiceRequest.created_at.asc()
        )

    if status_filter != "all":
        # Use default ordering above when not filtering
        pass

    requests_list = query.all()

    # Build enriched response with table number, order number, resolver name
    result = []
    for r in requests_list:
        table = db.query(RestaurantTable).filter(RestaurantTable.id == r.table_id).first()
        order_number = None
        dining_session_token = None
        bill_number = None
        if r.order_id:
            order = db.query(Order).filter(Order.id == r.order_id).first()
            if order:
                order_number = order.order_number
        if r.dining_session_id:
            dining_session = db.query(DiningSession).filter(DiningSession.id == r.dining_session_id).first()
            if dining_session:
                dining_session_token = dining_session.public_token
            bill = db.query(Bill).filter(Bill.dining_session_id == r.dining_session_id).first()
            if bill:
                bill_number = bill.bill_number
        resolver_name = None
        if r.resolved_by_staff_id:
            resolver = db.query(StaffUser).filter(StaffUser.id == r.resolved_by_staff_id).first()
            if resolver:
                resolver_name = resolver.name

        result.append(StaffServiceRequestResponse(
            id=r.id,
            restaurant_id=r.restaurant_id,
            table_id=r.table_id,
            order_id=r.order_id,
            dining_session_id=r.dining_session_id,
            request_type=r.request_type,
            status=r.status,
            created_at=r.created_at,
            resolved_at=r.resolved_at,
            resolved_by_staff_id=r.resolved_by_staff_id,
            table_number=table.table_number if table else None,
            order_number=order_number,
            dining_session_token=dining_session_token,
            bill_number=bill_number,
            resolver_name=resolver_name
        ))

    return result


@router.patch(
    "/staff/service-requests/{request_id}/resolve",
    response_model=StaffServiceRequestResponse
)
def resolve_service_request(
    request_id: int,
    current_user: StaffUser = Depends(_staff_resolve_roles),
    db: Session = Depends(get_db)
):
    """Staff resolve: mark a service request as resolved. Concurrency-safe with row lock.
    If already resolved, returns the existing resolved response safely (idempotent).
    """
    with db.begin_nested():
        # Query with both request ID and restaurant ID, then lock the row
        service_req = db.query(ServiceRequest).filter(
            ServiceRequest.id == request_id,
            ServiceRequest.restaurant_id == current_user.restaurant_id
        ).with_for_update().first()

        if not service_req:
            raise HTTPException(status_code=404, detail="Service request not found")

        if service_req.status == "resolved":
            # Already resolved: return existing resolution idempotently
            # Do NOT overwrite original resolver or resolved_at
            pass
        elif service_req.status == "cancelled":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Service request is cancelled and cannot be resolved."
            )
        else:
            # Mark as resolved
            service_req.status = "resolved"
            service_req.resolved_at = datetime.datetime.now(datetime.timezone.utc)
            service_req.resolved_by_staff_id = current_user.id
            db.flush()

    db.commit()
    db.refresh(service_req)
    channels = [
        restaurant_channel(current_user.restaurant_id, "operations"),
        restaurant_channel(current_user.restaurant_id, "staff"),
        table_channel(current_user.restaurant_id, service_req.table_id),
    ]

    # Build enriched response
    table = db.query(RestaurantTable).filter(RestaurantTable.id == service_req.table_id).first()
    order_number = None
    dining_session_token = None
    bill_number = None
    if service_req.order_id:
        order = db.query(Order).filter(Order.id == service_req.order_id).first()
        if order:
            order_number = order.order_number
    if service_req.dining_session_id:
        dining_session = db.query(DiningSession).filter(DiningSession.id == service_req.dining_session_id).first()
        if dining_session:
            dining_session_token = dining_session.public_token
            channels.append(session_channel(dining_session.public_token))
        bill = db.query(Bill).filter(Bill.dining_session_id == service_req.dining_session_id).first()
        if bill:
            bill_number = bill.bill_number
    resolver_name = None
    if service_req.resolved_by_staff_id:
        resolver = db.query(StaffUser).filter(StaffUser.id == service_req.resolved_by_staff_id).first()
        if resolver:
            resolver_name = resolver.name
    publish_event(
        EVENT_SERVICE_REQUEST_RESOLVED,
        restaurant_id=current_user.restaurant_id,
        channels=channels,
        resource_id=service_req.id,
        state={"request_type": service_req.request_type, "status": service_req.status, "table_id": service_req.table_id},
    )

    return StaffServiceRequestResponse(
        id=service_req.id,
        restaurant_id=service_req.restaurant_id,
        table_id=service_req.table_id,
        order_id=service_req.order_id,
        dining_session_id=service_req.dining_session_id,
        request_type=service_req.request_type,
        status=service_req.status,
        created_at=service_req.created_at,
        resolved_at=service_req.resolved_at,
        resolved_by_staff_id=service_req.resolved_by_staff_id,
        table_number=table.table_number if table else None,
        order_number=order_number,
        dining_session_token=dining_session_token,
        bill_number=bill_number,
        resolver_name=resolver_name
    )


@router.post(
    "/staff/requests/{request_id}/resolve",
    response_model=StaffServiceRequestResponse,
)
def resolve_staff_request_alias(
    request_id: int,
    current_user: StaffUser = Depends(_staff_resolve_roles),
    db: Session = Depends(get_db),
):
    return resolve_service_request(request_id, current_user=current_user, db=db)
