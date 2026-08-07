import asyncio
import datetime
import json
import uuid
from collections import Counter
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session, joinedload
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.database import SessionLocal
from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.services.realtime import (
    AuthorityRevocation,
    EVENT_BILL_PAID,
    EVENT_SESSION_FORCE_CLOSED,
    authority_actor_channel,
    authority_restaurant_channel,
    authority_session_channel,
    authority_session_key,
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
from app.utils.auth import AuthenticatedContext, external_authority_epoch, resolve_bearer_token_context
from app.services.table_participants import load_participant


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


@dataclass(frozen=True, slots=True)
class StaffConnectionAuthority:
    connection_id: str
    restaurant_id: int
    actor_id: int
    role: str
    authority_epoch: str
    session_key: str
    connected_at: datetime.datetime
    requested_channel: str


def _staff_context_from_token(
    db: Session,
    token: str | None,
) -> AuthenticatedContext | None:
    if not token:
        return None
    try:
        return resolve_bearer_token_context(token, db)
    except (HTTPException, TypeError, ValueError):
        return None


def _connection_authority(
    context: AuthenticatedContext,
    requested: str,
) -> StaffConnectionAuthority:
    return StaffConnectionAuthority(
        connection_id=uuid.uuid4().hex,
        restaurant_id=context.scope.restaurant_id,
        actor_id=context.scope.actor_id,
        role=context.scope.role,
        authority_epoch=external_authority_epoch(context.scope),
        session_key=authority_session_key(context.session.token_jti),
        connected_at=datetime.datetime.now(datetime.timezone.utc),
        requested_channel=requested,
    )


def _is_current_staff_authority(
    token: str,
    authority: StaffConnectionAuthority,
) -> bool:
    db = SessionLocal()
    try:
        context = _staff_context_from_token(db, token)
        if context is None:
            return False
        return (
            context.scope.restaurant_id == authority.restaurant_id
            and context.scope.actor_id == authority.actor_id
            and context.scope.role == authority.role
            and external_authority_epoch(context.scope) == authority.authority_epoch
            and authority.requested_channel
            in ROLE_CHANNELS.get(context.scope.role, set())
        )
    finally:
        db.close()


def _revokes_connection(
    message: AuthorityRevocation,
    authority: StaffConnectionAuthority,
) -> bool:
    if message.restaurant_id != authority.restaurant_id:
        return False
    if message.actor_id is not None and message.actor_id != authority.actor_id:
        return False
    return message.session_key is None or message.session_key == authority.session_key


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


def _check_participant_valid_sync(participant_token: str, participant_session_token: str) -> bool:
    """Sync helper: validates participant token inside a worker thread.

    Creates and closes its own SessionLocal(). Must not be called concurrently
    with any other operation on the same session — each call owns its session.
    Returns True if the participant is still valid, False if revoked/expired.
    """
    db = SessionLocal()
    try:
        load_participant(db, participant_token, session_token=participant_session_token)
        return True
    except HTTPException:
        return False
    finally:
        db.close()


async def _event_loop(
    websocket: WebSocket,
    channels: set[str],
    *,
    include_restaurant_id: bool,
    limit_key: str,
    staff_authority: StaffConnectionAuthority | None = None,
    staff_token: str | None = None,
    participant_token: str | None = None,
    participant_session_token: str | None = None,
) -> None:
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
                if isinstance(event, AuthorityRevocation):
                    if staff_authority and _revokes_connection(event, staff_authority):
                        await websocket.close(code=1008)
                        break
                    continue
                if staff_authority and (
                    not staff_token
                    # _is_current_staff_authority opens/closes its own SessionLocal internally;
                    # sequential call here — must not be used concurrently.
                    or not await run_in_threadpool(_is_current_staff_authority, staff_token, staff_authority)
                ):
                    await websocket.close(code=1008)
                    break
                participant_is_current = True
                if participant_token and participant_session_token:
                    # _check_participant_valid_sync opens/closes its own SessionLocal;
                    # sequential call — same session must not be shared concurrently.
                    participant_is_current = await run_in_threadpool(
                        _check_participant_valid_sync,
                        participant_token,
                        participant_session_token,
                    )
                terminal_session_event = (
                    not participant_is_current
                    and event.type in {EVENT_BILL_PAID, EVENT_SESSION_FORCE_CLOSED}
                    and event.state.get("session_token") == participant_session_token
                )
                if not participant_is_current and not terminal_session_event:
                    # Revocation blocks already-queued active-session events, but
                    # the session terminal is allowed to cross this boundary once.
                    continue
                try:
                    await websocket.send_json(event.public_payload(include_restaurant_id=include_restaurant_id))
                    record_delivery(event, success=True)
                except Exception:
                    record_delivery(event, success=False)
                    raise
                if terminal_session_event:
                    await websocket.close(code=1000)
                    break
            else:
                if staff_authority and (
                    not staff_token
                    # Sequential threadpool call for heartbeat revalidation.
                    or not await run_in_threadpool(_is_current_staff_authority, staff_token, staff_authority)
                ):
                    await websocket.close(code=1008)
                    break
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        pass
    finally:
        client_reader.cancel()
        await broker.unsubscribe(subscriber_id)
        await _release_connection(websocket, limit_key)


# ---------------------------------------------------------------------------
# Sync handshake helpers — each creates/closes its own SessionLocal().
# Returns plain data only (frozen dataclass, sets of strings, scalars).
# No live ORM objects are returned to the async layer.
# ---------------------------------------------------------------------------

def _staff_handshake_sync(
    token: str | None,
    requested: str,
) -> tuple[StaffConnectionAuthority, set[str]] | None:
    """Validates staff token and builds channel set inside a worker thread.

    Opens its own SessionLocal(); closes it in finally.
    Returns (authority, channels) on success, None on any auth failure.
    """
    db = SessionLocal()
    try:
        context = _staff_context_from_token(db, token)
        if context is None:
            return None
        if requested not in ROLE_CHANNELS.get(context.scope.role, set()):
            return None
        authority = _connection_authority(context, requested)
        channels: set[str] = {
            restaurant_channel(authority.restaurant_id, requested),
            authority_actor_channel(authority.actor_id),
            authority_session_channel(authority.session_key),
            authority_restaurant_channel(authority.restaurant_id),
        }
        if authority.role != "kitchen":
            channels.add(restaurant_channel(authority.restaurant_id, "operations"))
        # StaffConnectionAuthority is a frozen dataclass (plain data); channels is a set of strings.
        return authority, channels
    finally:
        db.close()


def _session_handshake_sync(
    session_token: str,
    participant_token: str | None,
) -> tuple[set[str], str] | None:
    """Validates dining session and participant token inside a worker thread.

    Opens its own SessionLocal(); closes it in finally.
    Returns (channels, participant_public_id) on success, None on any failure.
    Preserves exact rejection semantics: missing participant_token → None,
    inactive session → None, invalid participant → None.
    """
    db = SessionLocal()
    try:
        session = db.query(DiningSession).filter(DiningSession.public_token == session_token).first()
        if not session or session.status not in ACTIVE_DINING_SESSION_STATUSES:
            return None
        if not participant_token:
            return None
        try:
            participant = load_participant(db, participant_token, session_token=session_token)
        except HTTPException:
            return None
        channels: set[str] = {session_channel(session.public_token)}
        # Return only plain scalars — no ORM objects.
        return channels, participant.public_id
    finally:
        db.close()


def _menu_handshake_sync(
    restaurant_slug: str,
    table_code: str,
) -> tuple[set[str], str] | None:
    """Validates restaurant slug and table code inside a worker thread.

    Opens its own SessionLocal(); closes it in finally.
    Returns (channels, limit_key) on success, None if restaurant or table not found.
    """
    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(
            Restaurant.slug == restaurant_slug,
            Restaurant.is_active == True,
        ).first()
        if not restaurant:
            return None
        table = db.query(RestaurantTable).filter(
            RestaurantTable.restaurant_id == restaurant.id,
            RestaurantTable.table_code == table_code,
            RestaurantTable.is_active == True,
        ).first()
        if not table:
            return None
        channels: set[str] = {public_menu_channel(restaurant.id), table_channel(restaurant.id, table.id)}
        limit_key = f"menu:{restaurant.id}:{table.id}"
        # Return only plain scalars — no ORM objects.
        return channels, limit_key
    finally:
        db.close()


def _order_handshake_sync(
    public_token: str,
    participant_token: str | None,
) -> tuple[set[str], str | None, str] | None:
    """Validates order public token and participant inside a worker thread.

    Opens its own SessionLocal(); closes it in finally.
    Returns (channels, participant_session_token, limit_key) on success.
    Returns None on any failure.
    Preserves exact rejection semantics: order not found → None,
    session-linked order with no participant_token → None,
    invalid participant → None.
    """
    db = SessionLocal()
    try:
        order = db.query(Order).options(joinedload(Order.dining_session)).filter(Order.public_token == public_token).first()
        if not order:
            return None
        participant_session_token: str | None = None
        if order.dining_session:
            if not participant_token:
                return None
            try:
                load_participant(db, participant_token, session_token=order.dining_session.public_token)
            except HTTPException:
                return None
            participant_session_token = order.dining_session.public_token
        channels: set[str] = {order_channel(order.public_token)}
        if order.dining_session:
            channels.add(session_channel(order.dining_session.public_token))
        limit_key = f"order:{public_token}"
        # Return only plain scalars/strings — no ORM objects.
        return channels, participant_session_token, limit_key
    finally:
        db.close()


# ---------------------------------------------------------------------------
# WebSocket route handlers
# ---------------------------------------------------------------------------

@router.websocket("/ws/staff")
async def staff_realtime(websocket: WebSocket):
    token = websocket.query_params.get("token")
    requested = websocket.query_params.get("channel", "operations")
    # Offload sync DB work to threadpool; session is created/closed inside the helper.
    result = await run_in_threadpool(_staff_handshake_sync, token, requested)
    if result is None:
        await websocket.close(code=1008)
        return
    authority, channels = result
    await _event_loop(
        websocket,
        channels,
        include_restaurant_id=True,
        limit_key=f"staff-session:{authority.session_key}",
        staff_authority=authority,
        staff_token=token,
    )


@router.websocket("/ws/public/sessions/{session_token}")
async def public_session_realtime(websocket: WebSocket, session_token: str, participant_token: str | None = None):
    # Offload sync DB work to threadpool; session is created/closed inside the helper.
    result = await run_in_threadpool(_session_handshake_sync, session_token, participant_token)
    if result is None:
        await websocket.close(code=1008)
        return
    channels, participant_public_id = result
    await _event_loop(
        websocket,
        channels,
        include_restaurant_id=False,
        limit_key=f"participant:{participant_public_id}",
        participant_token=participant_token,
        participant_session_token=session_token,
    )


@router.websocket("/ws/public/restaurants/{restaurant_slug}/tables/{table_code}/menu")
async def public_menu_realtime(websocket: WebSocket, restaurant_slug: str, table_code: str):
    # Offload sync DB work to threadpool; session is created/closed inside the helper.
    result = await run_in_threadpool(_menu_handshake_sync, restaurant_slug, table_code)
    if result is None:
        await websocket.close(code=1008)
        return
    channels, limit_key = result
    await _event_loop(websocket, channels, include_restaurant_id=False, limit_key=limit_key)


@router.websocket("/ws/public/orders/{public_token}")
async def public_order_realtime(websocket: WebSocket, public_token: str, participant_token: str | None = None):
    # Offload sync DB work to threadpool; session is created/closed inside the helper.
    result = await run_in_threadpool(_order_handshake_sync, public_token, participant_token)
    if result is None:
        await websocket.close(code=1008)
        return
    channels, participant_session_token, limit_key = result
    await _event_loop(
        websocket,
        channels,
        include_restaurant_id=False,
        limit_key=limit_key,
        participant_token=participant_token if participant_session_token else None,
        participant_session_token=participant_session_token,
    )
