import asyncio
import datetime
import json
import logging
import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.config import settings


logger = logging.getLogger(__name__)


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


@dataclass
class RealtimeMetrics:
    active_connections: int = 0
    connection_opened_total: int = 0
    reconnect_total: int = 0
    publish_total: int = 0
    publish_failures: int = 0
    delivery_total: int = 0
    delivery_failures: int = 0
    delivery_latency_ms_total: float = 0.0
    redis_publish_failures: int = 0
    redis_subscribe_failures: int = 0
    redis_reconnect_total: int = 0
    redis_available: bool | None = None

    @property
    def average_delivery_latency_ms(self) -> float:
        if self.delivery_total <= 0:
            return 0.0
        return round(self.delivery_latency_ms_total / self.delivery_total, 2)

    def snapshot(self, *, broker_name: str) -> dict[str, Any]:
        return {
            "broker": broker_name,
            "active_websocket_connections": self.active_connections,
            "connection_opened_total": self.connection_opened_total,
            "reconnect_total": self.reconnect_total,
            "publish_total": self.publish_total,
            "publish_failures": self.publish_failures,
            "event_delivery_total": self.delivery_total,
            "event_delivery_failures": self.delivery_failures,
            "average_delivery_latency_ms": self.average_delivery_latency_ms,
            "redis_publish_failures": self.redis_publish_failures,
            "redis_subscribe_failures": self.redis_subscribe_failures,
            "redis_reconnect_total": self.redis_reconnect_total,
            "redis_available": self.redis_available,
        }


metrics = RealtimeMetrics()
_metrics_lock = threading.Lock()


def record_connection_opened(*, reconnect: bool = False) -> None:
    with _metrics_lock:
        metrics.active_connections += 1
        metrics.connection_opened_total += 1
        if reconnect:
            metrics.reconnect_total += 1


def record_connection_closed() -> None:
    with _metrics_lock:
        metrics.active_connections = max(0, metrics.active_connections - 1)


def record_delivery(event: "RealtimeEvent", *, success: bool) -> None:
    with _metrics_lock:
        if success:
            metrics.delivery_total += 1
            try:
                created_at = datetime.datetime.fromisoformat(event.timestamp)
                latency_ms = (datetime.datetime.now(datetime.timezone.utc) - created_at).total_seconds() * 1000
                metrics.delivery_latency_ms_total += max(0.0, latency_ms)
            except Exception:
                pass
        else:
            metrics.delivery_failures += 1


def realtime_metrics_snapshot() -> dict[str, Any]:
    with _metrics_lock:
        return metrics.snapshot(broker_name=broker.__class__.__name__)


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
            "timestamp": self.timestamp,
            "state": self.state if include_restaurant_id else _public_safe_state(self.state),
        }
        if include_restaurant_id:
            payload["restaurant_id"] = self.restaurant_id
            payload["resource_id"] = self.resource_id
        return payload

    def broker_payload(self) -> str:
        return json.dumps(
            {
                "id": self.event_id,
                "type": self.type,
                "restaurant_id": self.restaurant_id,
                "channels": list(self.channels),
                "resource_id": self.resource_id,
                "state": self.state,
                "timestamp": self.timestamp,
            },
            separators=(",", ":"),
            default=str,
        )

    @classmethod
    def from_broker_payload(cls, payload: str | bytes) -> "RealtimeEvent":
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")
        data = json.loads(payload)
        return cls(
            type=str(data["type"]),
            restaurant_id=int(data["restaurant_id"]),
            channels=tuple(str(channel) for channel in data["channels"]),
            resource_id=str(data["resource_id"]),
            state=dict(data.get("state") or {}),
            event_id=str(data["id"]),
            timestamp=str(data["timestamp"]),
        )


_PUBLIC_STATE_DENYLIST = {
    "restaurant_id",
    "table_id",
    "order_id",
    "bill_id",
    "dining_session_id",
    "staff_id",
    "requested_by_staff_id",
    "resolved_by_staff_id",
    "paid_by_staff_id",
    "generated_by_staff_id",
    "opened_by_staff_id",
    "closed_by_staff_id",
    "item_id",
    "category_id",
}


def _public_safe_state(state: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in state.items()
        if key not in _PUBLIC_STATE_DENYLIST and not key.endswith("_id")
    }


class RealtimeBroker:
    async def subscribe(self, channels: set[str]):
        raise NotImplementedError

    async def unsubscribe(self, subscriber_id: str) -> None:
        raise NotImplementedError

    def publish(self, event: RealtimeEvent) -> None:
        raise NotImplementedError

    async def health(self) -> dict[str, Any]:
        return {"status": "healthy", "broker": self.__class__.__name__}

    async def shutdown(self) -> None:
        return None


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
        with _metrics_lock:
            metrics.publish_total += 1
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


class RedisRealtimeBroker(RealtimeBroker):
    """Redis Pub/Sub broker for production multi-process realtime delivery."""

    def __init__(self, redis_url: str, *, client_factory: Any | None = None) -> None:
        self.redis_url = redis_url
        self._client_factory = client_factory
        self._subscribers: dict[str, dict[str, Any]] = {}
        self._publish_loop = asyncio.new_event_loop()
        self._publish_thread = threading.Thread(
            target=self._run_publish_loop,
            name="omlu-redis-realtime-publisher",
            daemon=True,
        )
        self._publish_thread.start()

    def _run_publish_loop(self) -> None:
        asyncio.set_event_loop(self._publish_loop)
        self._publish_loop.run_forever()

    def _new_client(self):
        if self._client_factory:
            return self._client_factory()
        try:
            from redis import asyncio as redis_asyncio
        except ImportError as exc:
            raise RuntimeError("Redis realtime requires the 'redis' package.") from exc
        return redis_asyncio.from_url(self.redis_url, decode_responses=False)

    async def subscribe(self, channels: set[str]):
        subscriber_id = uuid.uuid4().hex
        queue: asyncio.Queue[RealtimeEvent] = asyncio.Queue(maxsize=100)
        client = self._new_client()
        pubsub = client.pubsub()
        try:
            await pubsub.subscribe(*channels)
        except Exception as exc:
            logger.warning(
                "realtime.redis.initial_subscribe_failed subscriber_id=%s channel_count=%d error=%s",
                subscriber_id,
                len(channels),
                exc.__class__.__name__,
            )
            with _metrics_lock:
                metrics.redis_subscribe_failures += 1
                metrics.redis_available = False
            try:
                await client.close()
            except Exception:
                pass
            raise
        task = asyncio.create_task(
            self._listen(subscriber_id, pubsub, queue, channels)
        )
        self._subscribers[subscriber_id] = {
            "client": client,
            "pubsub": pubsub,
            "task": task,
            "channels": channels,
        }
        return subscriber_id, queue

    async def unsubscribe(self, subscriber_id: str) -> None:
        subscription = self._subscribers.pop(subscriber_id, None)
        if not subscription:
            return
        task = subscription["task"]
        task.cancel()
        try:
            await subscription["pubsub"].unsubscribe(*subscription["channels"])
        except Exception as exc:
            logger.warning("realtime.redis.unsubscribe_failed subscriber_id=%s error=%s", subscriber_id, exc.__class__.__name__)
        try:
            await subscription["pubsub"].close()
        except Exception as exc:
            logger.warning("realtime.redis.pubsub_close_failed subscriber_id=%s error=%s", subscriber_id, exc.__class__.__name__)
        try:
            await subscription["client"].close()
        except Exception as exc:
            logger.warning("realtime.redis.client_close_failed subscriber_id=%s error=%s", subscriber_id, exc.__class__.__name__)

    async def _listen(
        self,
        subscriber_id: str,
        pubsub: Any,
        queue: asyncio.Queue[RealtimeEvent],
        channels: set[str],
    ) -> None:
        current_pubsub = pubsub
        while True:
            try:
                async for message in current_pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    event = RealtimeEvent.from_broker_payload(message["data"])
                    try:
                        queue.put_nowait(event)
                    except asyncio.QueueFull:
                        try:
                            queue.get_nowait()
                            queue.put_nowait(event)
                        except asyncio.QueueEmpty:
                            pass
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(
                    "realtime.redis.subscribe_failed subscriber_id=%s channel_count=%d error=%s",
                    subscriber_id,
                    len(channels),
                    exc.__class__.__name__,
                )
                with _metrics_lock:
                    metrics.redis_subscribe_failures += 1
                    metrics.redis_available = False
                await asyncio.sleep(1)
                current_pubsub = await self._reconnect_subscription(
                    subscriber_id,
                    current_pubsub,
                    channels,
                )

    async def _reconnect_subscription(
        self,
        subscriber_id: str,
        old_pubsub: Any,
        channels: set[str],
    ):
        try:
            await old_pubsub.close()
        except Exception:
            pass
        client = self._new_client()
        pubsub = client.pubsub()
        await pubsub.subscribe(*channels)
        subscription = self._subscribers.get(subscriber_id)
        if subscription:
            try:
                await subscription["client"].close()
            except Exception:
                pass
            subscription["client"] = client
            subscription["pubsub"] = pubsub
        logger.info(
            "realtime.redis.subscription_reconnected subscriber_id=%s channel_count=%d",
            subscriber_id,
            len(channels),
        )
        with _metrics_lock:
            metrics.redis_reconnect_total += 1
            metrics.redis_available = True
        return pubsub

    def publish(self, event: RealtimeEvent) -> None:
        with _metrics_lock:
            metrics.publish_total += 1
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._publish(event),
                self._publish_loop,
            )
            future.add_done_callback(self._log_publish_result)
        except Exception as exc:
            logger.warning(
                "realtime.redis.publish_schedule_failed event_type=%s channel_count=%d error=%s",
                event.type,
                len(event.channels),
                exc.__class__.__name__,
            )
            with _metrics_lock:
                metrics.publish_failures += 1
                metrics.redis_publish_failures += 1
                metrics.redis_available = False

    async def _publish(self, event: RealtimeEvent) -> None:
        client = self._new_client()
        try:
            payload = event.broker_payload()
            for channel in event.channels:
                await client.publish(channel, payload)
            with _metrics_lock:
                metrics.redis_available = True
        finally:
            try:
                await client.close()
            except Exception as exc:
                logger.warning("realtime.redis.publish_client_close_failed error=%s", exc.__class__.__name__)

    @staticmethod
    def _log_publish_result(future) -> None:
        try:
            future.result()
        except Exception as exc:
            logger.warning("realtime.redis.publish_failed error=%s", exc.__class__.__name__)
            with _metrics_lock:
                metrics.publish_failures += 1
                metrics.redis_publish_failures += 1
                metrics.redis_available = False

    async def health(self) -> dict[str, Any]:
        client = self._new_client()
        try:
            await client.ping()
            with _metrics_lock:
                metrics.redis_available = True
            return {"status": "healthy", "broker": self.__class__.__name__, "redis": "available"}
        except Exception:
            with _metrics_lock:
                metrics.redis_available = False
            return {"status": "unavailable", "broker": self.__class__.__name__, "redis": "unavailable"}
        finally:
            try:
                await client.close()
            except Exception:
                pass

    async def shutdown(self) -> None:
        for subscriber_id in list(self._subscribers.keys()):
            await self.unsubscribe(subscriber_id)
        self._publish_loop.call_soon_threadsafe(self._publish_loop.stop)


def _create_broker() -> RealtimeBroker:
    if settings.redis_url:
        logger.info("realtime.broker=redis")
        return RedisRealtimeBroker(settings.redis_url)
    logger.info("realtime.broker=in_memory")
    return InMemoryRealtimeBroker()


broker = _create_broker()


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
    event = RealtimeEvent(
        type=event_type,
        restaurant_id=restaurant_id,
        channels=tuple(channels),
        resource_id=str(resource_id),
        state=state or {},
    )
    broker.publish(event)
    try:
        from app.services.push_notifications import enqueue_customer_push_for_event

        enqueue_customer_push_for_event(event)
    except Exception as exc:
        logger.warning("push.enqueue_failed event_type=%s error=%s", event.type, exc.__class__.__name__)
