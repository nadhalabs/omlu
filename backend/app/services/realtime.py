import asyncio
import datetime
import uuid
from dataclasses import dataclass, field
from typing import Any


EVENT_ORDER_CREATED = "order.created"
EVENT_ORDER_STATUS_CHANGED = "order.status_changed"
EVENT_SERVICE_REQUEST_CREATED = "service_request.created"
EVENT_SERVICE_REQUEST_RESOLVED = "service_request.resolved"
EVENT_SESSION_OPENED = "session.opened"
EVENT_SESSION_UPDATED = "session.updated"
EVENT_SESSION_CLOSED = "session.closed"
EVENT_BILL_GENERATED = "bill.generated"
EVENT_BILL_UPDATED = "bill.updated"
EVENT_BILL_PAID = "bill.paid"
EVENT_PAYMENT_ASSISTANCE_REQUESTED = "payment.assistance_requested"
EVENT_TABLE_UPDATED = "table.updated"
EVENT_AVAILABILITY_UPDATED = "availability.updated"


@dataclass(frozen=True)
class RealtimeEvent:
    type: str
    restaurant_id: int
    channels: tuple[str, ...]
    resource_id: str
    state: dict[str, Any] = field(default_factory=dict)
    event_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: str = field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

    def public_payload(self, *, include_restaurant_id: bool = False) -> dict[str, Any]:
        payload = {
            "id": self.event_id,
            "type": self.type,
            "resource_id": self.resource_id,
            "timestamp": self.timestamp,
            "state": self.state,
        }
        if include_restaurant_id:
            payload["restaurant_id"] = self.restaurant_id
        return payload


class RealtimeBroker:
    async def subscribe(self, channels: set[str]):
        raise NotImplementedError

    async def unsubscribe(self, subscriber_id: str) -> None:
        raise NotImplementedError

    def publish(self, event: RealtimeEvent) -> None:
        raise NotImplementedError


class InMemoryRealtimeBroker(RealtimeBroker):
    """Single-process broker for local development.

    Production multi-instance deployments should replace this with Redis Pub/Sub
    or another shared broker while preserving this broker interface.
    """

    def __init__(self) -> None:
        self._subscribers: dict[str, tuple[set[str], asyncio.AbstractEventLoop, asyncio.Queue[RealtimeEvent]]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, channels: set[str]):
        subscriber_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[RealtimeEvent] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers[subscriber_id] = (channels, loop, queue)
        return subscriber_id, queue

    async def unsubscribe(self, subscriber_id: str) -> None:
        async with self._lock:
            self._subscribers.pop(subscriber_id, None)

    def publish(self, event: RealtimeEvent) -> None:
        for channels, loop, queue in list(self._subscribers.values()):
            if channels.intersection(event.channels):
                def put_event(target_queue: asyncio.Queue[RealtimeEvent] = queue) -> None:
                    try:
                        target_queue.put_nowait(event)
                    except asyncio.QueueFull:
                        # Drop oldest under pressure rather than blocking request handlers.
                        try:
                            target_queue.get_nowait()
                            target_queue.put_nowait(event)
                        except asyncio.QueueEmpty:
                            pass

                try:
                    loop.call_soon_threadsafe(put_event)
                except RuntimeError:
                    put_event()


broker = InMemoryRealtimeBroker()


def restaurant_channel(restaurant_id: int, name: str) -> str:
    return f"restaurant:{restaurant_id}:{name}"


def public_menu_channel(restaurant_id: int) -> str:
    return f"restaurant:{restaurant_id}:public_menu"


def session_channel(session_token: str) -> str:
    return f"session:{session_token}"


def order_channel(public_token: str) -> str:
    return f"order:{public_token}"


def table_channel(restaurant_id: int, table_id: int) -> str:
    return f"restaurant:{restaurant_id}:table:{table_id}"


def publish_event(
    event_type: str,
    *,
    restaurant_id: int,
    channels: list[str],
    resource_id: str | int,
    state: dict[str, Any] | None = None,
) -> None:
    broker.publish(
        RealtimeEvent(
            type=event_type,
            restaurant_id=restaurant_id,
            channels=tuple(channels),
            resource_id=str(resource_id),
            state=state or {},
        )
    )
