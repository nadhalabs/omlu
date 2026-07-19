import asyncio
import json
from collections import Counter

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import SessionLocal
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.services.realtime import (
    broker,
    order_channel,
    public_menu_channel,
    record_connection_closed,
    record_connection_opened,
    record_delivery,
    restaurant_channel,
    session_channel,
    table_channel,
)
from app.utils.auth import decode_access_token


router = APIRouter()

STAFF_CHANNELS = {"operations", "kitchen", "staff", "admin", "availability"}
ROLE_CHANNELS = {
    "owner": STAFF_CHANNELS,
    "admin": STAFF_CHANNELS,
    "staff": {"operations", "staff", "availability"},
    "kitchen": {"kitchen"},
}
_active_total = 0
_active_by_ip: Counter[str] = Counter()
_active_by_limit_key: Counter[str] = Counter()
_connection_lock = asyncio.Lock()


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


def _is_allowed_read_only_client_message(message: dict) -> bool:
    text = message.get("text")
    raw_bytes = message.get("bytes")
    if text is None and raw_bytes is None:
        return True
    if raw_bytes is not None:
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return False
    if text is None:
        return True
    if text.lower() in {"ping", "heartbeat"}:
        return True
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return False
    return isinstance(payload, dict) and payload.get("type") in {"ping", "heartbeat"}


async def _read_only_client_loop(websocket: WebSocket) -> None:
    while True:
        message = await websocket.receive()
        if message.get("type") == "websocket.disconnect":
            raise WebSocketDisconnect
        if not _is_allowed_read_only_client_message(message):
            await websocket.close(code=1008)
            return


async def _acquire_connection(websocket: WebSocket, limit_key: str) -> bool:
    global _active_total
    ip = websocket.client.host if websocket.client else "unknown"
    async with _connection_lock:
        if _active_total >= settings.realtime_max_connections:
            return False
        if _active_by_ip[ip] >= settings.realtime_max_connections_per_ip:
            return False
        if _active_by_limit_key[limit_key] >= settings.realtime_max_connections_per_session:
            return False
        _active_total += 1
        _active_by_ip[ip] += 1
        _active_by_limit_key[limit_key] += 1
        record_connection_opened(reconnect=_active_by_limit_key[limit_key] > 1)
        return True


async def _release_connection(websocket: WebSocket, limit_key: str) -> None:
    global _active_total
    ip = websocket.client.host if websocket.client else "unknown"
    async with _connection_lock:
        _active_total = max(0, _active_total - 1)
        if _active_by_ip[ip] > 0:
            _active_by_ip[ip] -= 1
        if _active_by_limit_key[limit_key] > 0:
            _active_by_limit_key[limit_key] -= 1
        record_connection_closed()


async def _event_loop(websocket: WebSocket, channels: set[str], *, include_restaurant_id: bool, limit_key: str) -> None:
    if not await _acquire_connection(websocket, limit_key):
        await websocket.close(code=1013)
        return
    await websocket.accept()
    try:
        subscriber_id, queue = await broker.subscribe(channels)
    except Exception:
        await _release_connection(websocket, limit_key)
        await websocket.close(code=1013)
        return
    client_reader = asyncio.create_task(_read_only_client_loop(websocket))
    try:
        await websocket.send_json({"type": "connection.ready"})
        while True:
            event_task = asyncio.create_task(queue.get())
            done, pending = await asyncio.wait(
                {event_task, client_reader},
                timeout=25,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if event_task in pending:
                event_task.cancel()
            if client_reader in done:
                try:
                    client_reader.result()
                except WebSocketDisconnect:
                    pass
                break
            if event_task in done:
                event = event_task.result()
                try:
                    await websocket.send_json(event.public_payload(include_restaurant_id=include_restaurant_id))
                    record_delivery(event, success=True)
                except Exception:
                    record_delivery(event, success=False)
                    raise
            else:
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        pass
    finally:
        client_reader.cancel()
        await broker.unsubscribe(subscriber_id)
        await _release_connection(websocket, limit_key)


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
        if requested not in ROLE_CHANNELS.get(staff.role, set()):
            await websocket.close(code=1008)
            return
        channels = {restaurant_channel(staff.restaurant_id, requested)}
        if staff.role != "kitchen":
            channels.add(restaurant_channel(staff.restaurant_id, "operations"))
    finally:
        db.close()
    await _event_loop(websocket, channels, include_restaurant_id=True, limit_key=f"staff:{staff.restaurant_id}:{requested}")


@router.websocket("/ws/public/sessions/{session_token}")
async def public_session_realtime(websocket: WebSocket, session_token: str):
    db = SessionLocal()
    try:
        session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
        if not session or session.status not in ACTIVE_DINING_SESSION_STATUSES:
            await websocket.close(code=1008)
            return
        channels = {session_channel(session.public_token)}
    finally:
        db.close()
    await _event_loop(websocket, channels, include_restaurant_id=False, limit_key=f"session:{session_token}")


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
    await _event_loop(websocket, channels, include_restaurant_id=False, limit_key=f"menu:{restaurant.id}:{table.id}")


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
    await _event_loop(websocket, channels, include_restaurant_id=False, limit_key=f"order:{public_token}")
