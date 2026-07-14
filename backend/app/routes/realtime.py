import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload

from app.database import SessionLocal
from app.models.dining_session import DiningSession
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.services.realtime import (
    broker,
    order_channel,
    public_menu_channel,
    restaurant_channel,
    session_channel,
    table_channel,
)
from app.utils.auth import decode_access_token


router = APIRouter()

STAFF_CHANNELS = {"operations", "kitchen", "staff", "admin", "availability"}


def _staff_from_token(db: Session, token: str | None) -> StaffUser | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    staff_id = payload.get("sub")
    restaurant_id = payload.get("restaurant_id")
    if not staff_id or not restaurant_id:
        return None
    return db.query(StaffUser).options(joinedload(StaffUser.restaurant)).filter(
        StaffUser.id == int(staff_id),
        StaffUser.restaurant_id == int(restaurant_id),
        StaffUser.is_active == True,
        StaffUser.status == "active",
    ).first()


async def _event_loop(websocket: WebSocket, channels: set[str], *, include_restaurant_id: bool) -> None:
    await websocket.accept()
    subscriber_id, queue = await broker.subscribe(channels)
    try:
        await websocket.send_json({"type": "connection.ready"})
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=25)
                await websocket.send_json(event.public_payload(include_restaurant_id=include_restaurant_id))
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        pass
    finally:
        await broker.unsubscribe(subscriber_id)


@router.websocket("/ws/staff")
async def staff_realtime(websocket: WebSocket):
    token = websocket.query_params.get("token")
    requested = websocket.query_params.get("channel", "operations")
    db = SessionLocal()
    try:
        staff = _staff_from_token(db, token)
        if not staff or not staff.restaurant or not staff.restaurant.is_active:
            await websocket.close(code=1008)
            return
        if requested not in STAFF_CHANNELS:
            await websocket.close(code=1008)
            return
        if requested == "kitchen" and staff.role not in {"owner", "admin", "kitchen"}:
            await websocket.close(code=1008)
            return
        if requested in {"staff", "availability"} and staff.role not in {"owner", "admin", "staff"}:
            await websocket.close(code=1008)
            return
        if requested == "admin" and staff.role not in {"owner", "admin"}:
            await websocket.close(code=1008)
            return
        channels = {
            restaurant_channel(staff.restaurant_id, requested),
            restaurant_channel(staff.restaurant_id, "operations"),
        }
    finally:
        db.close()
    await _event_loop(websocket, channels, include_restaurant_id=True)


@router.websocket("/ws/public/sessions/{session_token}")
async def public_session_realtime(websocket: WebSocket, session_token: str):
    db = SessionLocal()
    try:
        session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
        if not session:
            await websocket.close(code=1008)
            return
        channels = {session_channel(session.public_token), table_channel(session.restaurant_id, session.table_id)}
    finally:
        db.close()
    await _event_loop(websocket, channels, include_restaurant_id=False)


@router.websocket("/ws/public/restaurants/{restaurant_slug}/tables/{table_code}/menu")
async def public_menu_realtime(websocket: WebSocket, restaurant_slug: str, table_code: str):
    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(
            Restaurant.slug == restaurant_slug,
            Restaurant.is_active == True,
        ).first()
        if not restaurant:
            await websocket.close(code=1008)
            return
        table = db.query(RestaurantTable).filter(
            RestaurantTable.restaurant_id == restaurant.id,
            RestaurantTable.table_code == table_code,
            RestaurantTable.is_active == True,
        ).first()
        if not table:
            await websocket.close(code=1008)
            return
        channels = {public_menu_channel(restaurant.id), table_channel(restaurant.id, table.id)}
    finally:
        db.close()
    await _event_loop(websocket, channels, include_restaurant_id=False)


@router.websocket("/ws/public/orders/{public_token}")
async def public_order_realtime(websocket: WebSocket, public_token: str):
    db = SessionLocal()
    try:
        order = db.query(Order).options(joinedload(Order.dining_session)).filter(Order.public_token == public_token).first()
        if not order:
            await websocket.close(code=1008)
            return
        channels = {order_channel(order.public_token)}
        if order.dining_session:
            channels.add(session_channel(order.dining_session.public_token))
    finally:
        db.close()
    await _event_loop(websocket, channels, include_restaurant_id=False)
