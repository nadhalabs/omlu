"""
Bounded Redis health check service for OMLU.

Provides a single function `check_redis_health()` that performs a live
ping against the configured Redis/Valkey instance and returns a structured
result with explicit status semantics.

Status semantics:
    not_configured  - settings.redis_url is empty/None
    healthy         - ping succeeded within timeout
    unavailable     - url is set but connection, auth, DNS, or timeout failed
    unknown         - reserved; not returned by this function

Callers must NOT use this to infer realtime broker state — the broker
derives its own broker_status from this result.

Security:
    Never exposes the URL, hostname, credentials, exception message, or
    stack trace to callers. Logs only the exception class name and a
    safe component identifier.
"""
from __future__ import annotations

import asyncio
import datetime
import logging
from typing import Any, Literal

from app.config import settings

logger = logging.getLogger(__name__)

RedisStatus = Literal["not_configured", "healthy", "unavailable", "unknown"]
RealtimeStatus = Literal["healthy", "degraded", "unavailable", "unknown"]

# Maximum seconds the Redis ping is allowed to take before being declared unavailable.
_REDIS_PING_TIMEOUT_S = 2.0


def _make_redis_client(redis_url: str):
    """
    Create a Redis async client with bounded timeouts.
    Importable as a module-level reference so tests can patch it.
    """
    from redis import asyncio as redis_asyncio
    return redis_asyncio.from_url(
        redis_url,
        decode_responses=False,
        socket_connect_timeout=_REDIS_PING_TIMEOUT_S,
        socket_timeout=_REDIS_PING_TIMEOUT_S,
    )


async def check_redis_health() -> dict[str, Any]:
    """
    Perform a bounded Redis ping and return structured health data.

    Returns:
        {
            "redis_configured": bool,
            "redis_status": RedisStatus,
            "broker_type": "redis" | "in_memory",
            "broker_status": RealtimeStatus,
            "last_checked_at": str (ISO-8601 UTC),
        }

    Never raises; all exceptions are caught and translated to "unavailable".
    Never returns URL, hostname, credentials, or exception message.
    """
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # ── Case 1: Redis not configured ──────────────────────────────────────────
    if not settings.redis_url:
        return {
            "redis_configured": False,
            "redis_status": "not_configured",
            "broker_type": "in_memory",
            "broker_status": "degraded",  # intentional fallback, not an error
            "last_checked_at": now,
        }

    # ── Case 2: Redis configured — attempt a bounded ping ────────────────────
    client = None
    try:
        client = _make_redis_client(settings.redis_url)
        await asyncio.wait_for(client.ping(), timeout=_REDIS_PING_TIMEOUT_S)
        now_after = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return {
            "redis_configured": True,
            "redis_status": "healthy",
            "broker_type": "redis",
            "broker_status": "healthy",
            "last_checked_at": now_after,
        }
    except asyncio.TimeoutError:
        # Log only exception class name — not the URL or any credentials.
        logger.warning(
            "redis_health.check: ping timed out component=redis_health error=TimeoutError"
        )
        return {
            "redis_configured": True,
            "redis_status": "unavailable",
            "broker_type": "redis",
            "broker_status": "unavailable",
            "last_checked_at": now,
        }
    except ImportError:
        logger.warning(
            "redis_health.check: redis package not installed component=redis_health error=ImportError"
        )
        return {
            "redis_configured": True,
            "redis_status": "unavailable",
            "broker_type": "redis",
            "broker_status": "unavailable",
            "last_checked_at": now,
        }
    except Exception as exc:
        logger.warning(
            "redis_health.check: ping failed component=redis_health error=%s",
            exc.__class__.__name__,
        )
        return {
            "redis_configured": True,
            "redis_status": "unavailable",
            "broker_type": "redis",
            "broker_status": "unavailable",
            "last_checked_at": now,
        }
    finally:
        if client is not None:
            try:
                await client.aclose()
            except Exception:
                pass
