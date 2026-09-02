import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.cinema import CinemaScreen, CinemaSeat
from app.models.menu import MenuCategory, MenuItem, MenuItemOptionGroup, MenuOptionGroup
from app.models.order import Order, OrderItem, OrderItemSelectedOption, OrderStatusHistory, RestaurantDailySequence
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.schemas.cinema import CinemaOrderCreate, LayoutUpdate, ScreenCreate, ScreenResponse, ScreenUpdate, SeatUpdate, StatusUpdate
from app.services.cinema import apply_layout, create_seat_session, load_authority, normalize_code, require_cinema, resolve_public_seat
from app.services.idempotency import ensure_same_request, request_hash
from app.services.menu_options import serialize_item_option_groups
from app.services.order_pricing import validate_and_price_order_items
from app.services.realtime import EVENT_ORDER_CREATED, EVENT_ORDER_STATUS_CHANGED, order_channel, publish_event, restaurant_channel
from app.utils.auth import get_current_staff_user
from app.utils.business_date import current_business_day_bounds_utc, restaurant_business_date

router = APIRouter()
ADMIN_ROLES = {"owner", "admin", "staff", "kitchen"}
TRANSITIONS = {
    "pending": {"ready"},
    # Legacy Cinema orders remain actionable without exposing the retired stages.
    "accepted": {"ready"},
    "preparing": {"ready"},
    "ready": {"delivered"},
    "out_for_delivery": {"delivered"},
    "delivered": set(),
}


def cinema_staff(current: StaffUser = Depends(get_current_staff_user)) -> StaffUser:
    if current.role not in ADMIN_ROLES or current.restaurant.venue_type != "cinema":
        raise HTTPException(status_code=403, detail="Cinema access required")
    return current


def screen_query(db: Session, staff: StaffUser):
    return db.query(CinemaScreen).options(selectinload(CinemaScreen.seats)).filter(CinemaScreen.restaurant_id == staff.restaurant_id)


def get_screen(db: Session, staff: StaffUser, screen_id: int) -> CinemaScreen:
    screen = screen_query(db, staff).filter(CinemaScreen.id == screen_id).first()
    if not screen:
        raise HTTPException(404, "Cinema screen not found")
    return screen


@router.get("/api/cinema/screens", response_model=list[ScreenResponse])
def list_screens(db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    return screen_query(db, staff).order_by(CinemaScreen.sort_order, CinemaScreen.id).all()


@router.post("/api/cinema/screens", response_model=ScreenResponse, status_code=201)
def create_screen(body: ScreenCreate, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    screen = CinemaScreen(restaurant_id=staff.restaurant_id, name=body.name.strip(), code=normalize_code(body.code))
    db.add(screen)
    try:
        db.flush()
        apply_layout(db, screen, body.rows, body.seats_per_row, body.aisles_after)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Screen or seat code already exists")
    return get_screen(db, staff, screen.id)


@router.get("/api/cinema/screens/{screen_id}", response_model=ScreenResponse)
def read_screen(screen_id: int, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    return get_screen(db, staff, screen_id)


@router.patch("/api/cinema/screens/{screen_id}", response_model=ScreenResponse)
def update_screen(screen_id: int, body: ScreenUpdate, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    screen = get_screen(db, staff, screen_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(screen, field, normalize_code(value) if field == "code" else value.strip() if field == "name" else value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "Screen code already exists")
    return get_screen(db, staff, screen_id)


@router.delete("/api/cinema/screens/{screen_id}", status_code=204)
def delete_screen(screen_id: int, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    screen = get_screen(db, staff, screen_id)
    historical_orders = db.query(Order.id).join(CinemaSeat, Order.cinema_seat_id == CinemaSeat.id).filter(
        CinemaSeat.cinema_screen_id == screen.id,
        Order.restaurant_id == staff.restaurant_id,
    ).first()
    if historical_orders:
        screen.is_active = False
        for seat in screen.seats:
            seat.is_active = False
    else:
        db.delete(screen)
    db.commit()
    return None


@router.put("/api/cinema/screens/{screen_id}/layout", response_model=ScreenResponse)
def update_layout(screen_id: int, body: LayoutUpdate, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    screen = get_screen(db, staff, screen_id)
    apply_layout(db, screen, body.rows, body.seats_per_row, body.aisles_after)
    try:
        db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "Generated seat code conflicts with an existing seat")
    return get_screen(db, staff, screen_id)


@router.get("/api/cinema/screens/{screen_id}/seats")
def list_seats(screen_id: int, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    return get_screen(db, staff, screen_id).seats


@router.patch("/api/cinema/screens/{screen_id}/seats/{seat_id}")
def update_seat(screen_id: int, seat_id: int, body: SeatUpdate, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    screen = get_screen(db, staff, screen_id)
    seat = next((seat for seat in screen.seats if seat.id == seat_id), None)
    if not seat:
        raise HTTPException(404, "Cinema seat not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(seat, field, normalize_code(value, "seat code") if field == "public_code" else value)
    try:
        db.commit(); db.refresh(seat)
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "Seat code already exists")
    return seat


def public_payload(restaurant, screen, seat, token=None, expires_at=None):
    return {
        "cinema_name": restaurant.name,
        "cinema_slug": restaurant.slug,
        "screen": {"id": screen.id, "name": screen.name, "code": screen.code},
        "seat": {
            "id": seat.id,
            "row_label": seat.row_label,
            "seat_number": seat.seat_number,
            "public_code": seat.public_code,
            "is_accessible": seat.is_accessible,
        },
        "authority_token": token,
        "authority_expires_at": expires_at,
    }


@router.get("/public/cinemas/{slug}/screens/{screen_code}/seats/{seat_code}")
def public_seat(slug: str, screen_code: str, seat_code: str, db: Session = Depends(get_db)):
    return public_payload(*resolve_public_seat(db, slug, screen_code, seat_code))


@router.post("/public/cinemas/{slug}/screens/{screen_code}/seats/{seat_code}/sessions", status_code=201)
def establish_authority(slug: str, screen_code: str, seat_code: str, db: Session = Depends(get_db)):
    restaurant, screen, seat = resolve_public_seat(db, slug, screen_code, seat_code)
    authority, token = create_seat_session(db, restaurant, screen, seat)
    db.commit()
    return public_payload(restaurant, screen, seat, token, authority.expires_at)


@router.get("/public/cinemas/{slug}/screens/{screen_code}/seats/{seat_code}/menu")
def public_cinema_menu(slug: str, screen_code: str, seat_code: str, db: Session = Depends(get_db)):
    restaurant, _, _ = resolve_public_seat(db, slug, screen_code, seat_code)
    categories = db.query(MenuCategory).options(selectinload(MenuCategory.items).selectinload(MenuItem.option_group_links).selectinload(MenuItemOptionGroup.group).selectinload(MenuOptionGroup.options)).filter(MenuCategory.restaurant_id == restaurant.id, MenuCategory.is_active.is_(True)).order_by(MenuCategory.display_order, MenuCategory.id).all()
    return {"cinema": {"name": restaurant.name, "slug": restaurant.slug}, "categories": [{"id": c.id, "name_en": c.name_en, "items": [{"id": i.id, "name_en": i.name_en, "description_en": i.description_en, "price": str(i.price), "image_url": i.image_url, "option_groups": serialize_item_option_groups(i)} for i in sorted(c.items, key=lambda x: (x.display_order, x.id)) if i.is_available]} for c in categories]}


@router.get("/api/cinema/menu")
def admin_cinema_menu(db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    categories = db.query(MenuCategory).options(selectinload(MenuCategory.items).selectinload(MenuItem.option_group_links).selectinload(MenuItemOptionGroup.group).selectinload(MenuOptionGroup.options)).filter(MenuCategory.restaurant_id == staff.restaurant_id).order_by(MenuCategory.display_order, MenuCategory.id).all()
    return {"categories": [{"id": c.id, "name": c.name_en, "is_active": c.is_active, "items": [{"id": i.id, "name": i.name_en, "description": i.description_en, "price": str(i.price), "is_available": i.is_available, "display_order": i.display_order, "option_groups": serialize_item_option_groups(i)} for i in sorted(c.items, key=lambda x: (x.display_order, x.id))]} for c in categories]}


@router.patch("/api/cinema/menu/items/{item_id}/availability")
def update_cinema_item_availability(item_id: int, body: dict, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    item = db.query(MenuItem).filter(MenuItem.id == item_id, MenuItem.restaurant_id == staff.restaurant_id).first()
    if not item:
        raise HTTPException(404, "Cinema menu item not found")
    if not isinstance(body.get("is_available"), bool):
        raise HTTPException(422, "is_available must be a boolean")
    item.is_available = body["is_available"]
    db.commit()
    return {"id": item.id, "is_available": item.is_available}


def serialize_order(order: Order):
    seat = order.cinema_seat
    screen = seat.screen
    return {"id": order.id, "order_number": order.order_number, "public_token": order.public_token, "status": order.status, "subtotal": str(order.subtotal), "screen_id": screen.id, "screen_name": screen.name, "screen_code": screen.code, "seat_id": seat.id, "seat_code": seat.public_code, "created_at": order.created_at, "customer_note": order.customer_note, "items": [{"id": i.id, "menu_item_id": i.menu_item_id, "name": i.item_name, "quantity": i.quantity, "unit_price": str(i.unit_price), "total_price": str(i.total_price), "note": i.item_note, "options": [{"name": o.kitchen_display_name or o.option_name, "quantity": o.quantity} for o in i.selected_options]} for i in order.items]}


def load_cinema_order(db, *filters):
    return db.query(Order).options(selectinload(Order.items).selectinload(OrderItem.selected_options), selectinload(Order.cinema_seat).selectinload(CinemaSeat.screen)).filter(Order.order_context_type == "cinema", *filters)


@router.post("/public/cinemas/orders", status_code=201)
def create_cinema_order(body: CinemaOrderCreate, authorization: str = Header(..., alias="X-Cinema-Seat-Token"), idempotency_key: str = Header(..., alias="Idempotency-Key"), db: Session = Depends(get_db)):
    if not 10 <= len(idempotency_key.strip()) <= 50:
        raise HTTPException(400, "Invalid Idempotency-Key")
    authority = load_authority(db, authorization)
    digest = request_hash(body.model_dump(mode="json"))
    existing = db.query(Order).filter(Order.restaurant_id == authority.restaurant_id, Order.idempotency_key == idempotency_key.strip()).first()
    if existing:
        ensure_same_request(existing.idempotency_request_hash, digest)
        return serialize_order(load_cinema_order(db, Order.id == existing.id).one())
    restaurant = require_cinema(db.get(Restaurant, authority.restaurant_id))
    subtotal, priced = validate_and_price_order_items(db, restaurant.id, body)
    today = restaurant_business_date(restaurant)
    sequence = db.query(RestaurantDailySequence).filter_by(restaurant_id=restaurant.id, sequence_date=today).with_for_update().first()
    if not sequence:
        sequence = RestaurantDailySequence(restaurant_id=restaurant.id, sequence_date=today, last_value=0); db.add(sequence); db.flush()
    sequence.last_value += 1
    order = Order(restaurant_id=restaurant.id, table_id=None, dining_session_id=None, cinema_seat_id=authority.cinema_seat_id, cinema_seat_session_id=authority.id, order_context_type="cinema", order_number=f"{restaurant.order_prefix}-{today:%Y%m%d}-{sequence.last_value:04d}", public_token=secrets.token_urlsafe(24), status="pending", subtotal=subtotal, customer_note=body.customer_note, source="cinema_qr", kitchen_mode_snapshot="kds", idempotency_key=idempotency_key.strip(), idempotency_request_hash=digest)
    db.add(order); db.flush()
    for item in priced:
        row = OrderItem(order_id=order.id, menu_item_id=item.menu_item_id, category_id_snapshot=item.category_id_snapshot, category_name_snapshot=item.category_name_snapshot, item_name=item.item_name, quantity=item.quantity, unit_price=item.unit_price, total_price=item.total_price, item_note=item.item_note, hsn_sac_code_snapshot=item.hsn_sac_code_snapshot, gst_rate_snapshot=item.gst_rate_snapshot)
        db.add(row); db.flush()
        for option in item.selected_options:
            db.add(OrderItemSelectedOption(order_item_id=row.id, **option.__dict__))
    db.add(OrderStatusHistory(order_id=order.id, old_status=None, new_status="pending"))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Order).filter_by(restaurant_id=restaurant.id, idempotency_key=idempotency_key.strip()).first()
        if not existing: raise
        ensure_same_request(existing.idempotency_request_hash, digest)
        order = existing
    persisted = load_cinema_order(db, Order.id == order.id).one()
    publish_event(EVENT_ORDER_CREATED, restaurant_id=restaurant.id, channels=[restaurant_channel(restaurant.id, "cinema"), order_channel(order.public_token)], resource_id=order.id, state={"order_number": order.order_number, "status": order.status, "context": "cinema"})
    return serialize_order(persisted)


@router.get("/public/cinemas/orders/{public_token}")
def track_cinema_order(public_token: str, authority_token: str = Header(..., alias="X-Cinema-Seat-Token"), db: Session = Depends(get_db)):
    authority = load_authority(db, authority_token)
    order = load_cinema_order(db, Order.public_token == public_token, Order.restaurant_id == authority.restaurant_id, Order.cinema_seat_id == authority.cinema_seat_id).first()
    if not order: raise HTTPException(404, "Cinema order not found")
    db.commit()
    return serialize_order(order)


@router.get("/api/cinema/orders")
def admin_orders(order_status: str | None = Query(None, alias="status"), screen_id: int | None = None, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    query = load_cinema_order(db, Order.restaurant_id == staff.restaurant_id)
    if order_status: query = query.filter(Order.status == order_status)
    if screen_id: query = query.join(CinemaSeat, Order.cinema_seat_id == CinemaSeat.id).filter(CinemaSeat.cinema_screen_id == screen_id)
    return [serialize_order(o) for o in query.order_by(Order.created_at.desc()).all()]


@router.get("/api/cinema/orders/{order_id}")
def admin_order(order_id: int, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    order = load_cinema_order(db, Order.restaurant_id == staff.restaurant_id, Order.id == order_id).first()
    if not order: raise HTTPException(404, "Cinema order not found")
    return serialize_order(order)


@router.patch("/api/cinema/orders/{order_id}/status")
def transition_order(order_id: int, body: StatusUpdate, db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    order = load_cinema_order(db, Order.restaurant_id == staff.restaurant_id, Order.id == order_id).with_for_update().first()
    if not order: raise HTTPException(404, "Cinema order not found")
    if body.status not in TRANSITIONS.get(order.status, set()): raise HTTPException(409, "Invalid Cinema order transition")
    old = order.status; order.status = body.status
    db.add(OrderStatusHistory(order_id=order.id, old_status=old, new_status=body.status, changed_by_staff_id=staff.id)); db.commit()
    persisted = load_cinema_order(db, Order.id == order.id).one()
    publish_event(EVENT_ORDER_STATUS_CHANGED, restaurant_id=staff.restaurant_id, channels=[restaurant_channel(staff.restaurant_id, "cinema"), order_channel(order.public_token)], resource_id=order.id, state={"order_number": order.order_number, "status": order.status, "context": "cinema"})
    return serialize_order(persisted)


@router.get("/api/cinema/dashboard")
def cinema_dashboard(db: Session = Depends(get_db), staff: StaffUser = Depends(cinema_staff)):
    start_utc, end_utc, _ = current_business_day_bounds_utc(staff.restaurant)
    orders = load_cinema_order(db, Order.restaurant_id == staff.restaurant_id, Order.created_at >= start_utc, Order.created_at < end_utc).all()
    revenue = sum((o.subtotal for o in orders), 0)
    statuses = {key: 0 for key in TRANSITIONS}
    screens = {}
    items = {}
    for order in orders:
        statuses[order.status] = statuses.get(order.status, 0) + 1
        screens[order.cinema_seat.screen.name] = screens.get(order.cinema_seat.screen.name, 0) + order.subtotal
        for item in order.items: items[item.item_name] = items.get(item.item_name, 0) + item.quantity
    all_screens = screen_query(db, staff).all()
    seats = [seat for screen in all_screens for seat in screen.seats]
    orders_by_screen = {}
    orders_by_seat = {}
    for order in orders:
        orders_by_screen[order.cinema_seat.screen.name] = orders_by_screen.get(order.cinema_seat.screen.name, 0) + 1
        seat_key = f"{order.cinema_seat.screen.name} · {order.cinema_seat.public_code}"
        orders_by_seat[seat_key] = orders_by_seat.get(seat_key, 0) + 1
    simplified_statuses = {
        "pending": sum(statuses.get(s, 0) for s in ("pending", "accepted", "preparing")),
        "ready": sum(statuses.get(s, 0) for s in ("ready", "out_for_delivery")),
        "delivered": statuses.get("delivered", 0),
    }
    return {"cinema_name": staff.restaurant.name, "cinema_slug": staff.restaurant.slug, "revenue": str(revenue), "order_count": len(orders), "active_order_count": simplified_statuses["pending"] + simplified_statuses["ready"], "average_order_value": str(revenue / len(orders) if orders else 0), "active_screens": sum(1 for s in all_screens if s.is_active), "active_seats": sum(1 for s in seats if s.is_active), "disabled_seats": sum(1 for s in seats if not s.is_active), "status_counts": simplified_statuses, "revenue_by_screen": [{"screen": k, "revenue": str(v)} for k, v in screens.items()], "orders_by_screen": [{"screen": k, "orders": v} for k, v in orders_by_screen.items()], "orders_by_seat": [{"seat": k, "orders": v} for k, v in sorted(orders_by_seat.items(), key=lambda x: -x[1])], "top_items": [{"name": k, "quantity": v} for k, v in sorted(items.items(), key=lambda x: -x[1])[:5]]}
