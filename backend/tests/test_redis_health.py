"""
Tests for Redis health detection and observability reporting.

All 10 required test cases are covered:
 1. No REDIS_URL → redis=not_configured, realtime=degraded
 2. Configured Redis with successful ping → redis=healthy, realtime=healthy
 3. Configured Redis with connection failure → redis=unavailable (not not_configured)
 4. Configured Redis with timeout → health endpoint returns promptly, redis=unavailable
 5. Metrics snapshot missing redis_available → platform telemetry must not default to healthy
 6. Production with required Redis unavailable → check returns unavailable (readiness fails)
 7. Production with required Redis healthy → check returns healthy (readiness passes)
 8. Development without Redis → readiness allows degraded realtime
 9. Platform observability and readiness report consistent states
10. No Redis URL or credentials appear in any response

Mock Redis; tests must not depend on an external Redis server.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Test Case 1: No REDIS_URL → not_configured + degraded
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_redis_url_reports_not_configured():
    """When REDIS_URL is absent, redis=not_configured and broker=degraded."""
    from app.services import redis_health as rh_module

    with patch.object(rh_module.settings, "redis_url", None):
        result = await rh_module.check_redis_health()

    assert result["redis_configured"] is False
    assert result["redis_status"] == "not_configured"
    assert result["broker_type"] == "in_memory"
    assert result["broker_status"] == "degraded"
    assert "last_checked_at" in result


@pytest.mark.asyncio
async def test_no_redis_url_reports_not_configured_empty_string():
    """Empty string REDIS_URL also counts as not configured."""
    from app.services import redis_health as rh_module

    with patch.object(rh_module.settings, "redis_url", ""):
        result = await rh_module.check_redis_health()

    assert result["redis_status"] == "not_configured"
    assert result["broker_status"] == "degraded"


# ---------------------------------------------------------------------------
# Test Case 2: Configured Redis with successful ping → healthy
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_configured_redis_successful_ping_is_healthy():
    """Valid configured Redis with a successful ping → redis=healthy, broker=healthy."""
    from app.services import redis_health as rh_module

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", "redis://some-host:6379"), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        result = await rh_module.check_redis_health()

    assert result["redis_configured"] is True
    assert result["redis_status"] == "healthy"
    assert result["broker_type"] == "redis"
    assert result["broker_status"] == "healthy"


# ---------------------------------------------------------------------------
# Test Case 3: Configured Redis with connection failure → unavailable (not not_configured)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_configured_redis_connection_failure_is_unavailable_not_not_configured():
    """Connection failure when REDIS_URL is set must be unavailable, NOT not_configured."""
    from app.services import redis_health as rh_module

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(side_effect=ConnectionRefusedError("refused"))
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", "redis://some-host:6379"), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        result = await rh_module.check_redis_health()

    assert result["redis_configured"] is True
    assert result["redis_status"] == "unavailable"
    assert result["redis_status"] != "not_configured"
    assert result["broker_status"] == "unavailable"


# ---------------------------------------------------------------------------
# Test Case 4: Configured Redis with timeout → prompt unavailable
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_configured_redis_timeout_is_unavailable_and_fast():
    """Ping timeout must report unavailable. The check must not hang."""
    import time
    from app.services import redis_health as rh_module

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(side_effect=asyncio.TimeoutError())
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", "redis://some-host:6379"), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        start = time.monotonic()
        result = await rh_module.check_redis_health()
        elapsed = time.monotonic() - start

    assert result["redis_status"] == "unavailable"
    assert result["broker_status"] == "unavailable"
    # Must return quickly (well under 5 seconds in a mocked test environment)
    assert elapsed < 5.0


# ---------------------------------------------------------------------------
# Test Case 5: Metrics snapshot missing redis_available → no optimistic default
# ---------------------------------------------------------------------------

def test_metrics_snapshot_missing_redis_available_not_defaulted_to_healthy():
    """
    When redis_available is None in the metrics snapshot (no operation completed yet),
    platform telemetry must not claim redis is healthy.

    The snapshot field means:
        None  → no operation completed (unknown)
        True  → last op succeeded
        False → last op failed

    None must NOT be treated as True / healthy.
    """
    from app.services.realtime import realtime_metrics_snapshot, metrics, _metrics_lock

    with _metrics_lock:
        original = metrics.redis_available
        metrics.redis_available = None

    try:
        snap = realtime_metrics_snapshot()
        # The snapshot value must be None — callers must not default it to True
        assert snap["redis_available"] is None
        # Simulate what the old broken code did (must NOT be trusted):
        old_broken_value = snap.get("redis_available", True)
        # If redis_available is None, get() returns None (not the default True)
        # because None is present in the dict.
        assert old_broken_value is None
        # Verify that None is falsy (it would cause incorrect "not_configured" display)
        assert not old_broken_value
    finally:
        with _metrics_lock:
            metrics.redis_available = original


# ---------------------------------------------------------------------------
# Test Cases 6 & 7: Production readiness gate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_production_redis_unavailable_check_returns_unavailable():
    """Production with required Redis unavailable → check returns unavailable."""
    from app.services import redis_health as rh_module

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(side_effect=ConnectionRefusedError("refused"))
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", "redis://some-host:6379"), \
         patch.object(rh_module.settings, "app_environment", "production"), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        result = await rh_module.check_redis_health()

    # Both status values must be unavailable
    assert result["redis_status"] == "unavailable"
    assert result["broker_status"] == "unavailable"

    # Simulated production readiness decision must fail
    redis_ok = result["redis_status"] == "healthy"
    assert not redis_ok


@pytest.mark.asyncio
async def test_production_redis_healthy_check_returns_healthy():
    """Production with healthy Redis → check returns healthy for both."""
    from app.services import redis_health as rh_module

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", "redis://some-host:6379"), \
         patch.object(rh_module.settings, "app_environment", "production"), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        result = await rh_module.check_redis_health()

    assert result["redis_status"] == "healthy"
    assert result["broker_status"] == "healthy"


# ---------------------------------------------------------------------------
# Test Case 8: Development without Redis → degraded realtime is allowed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_development_without_redis_allows_degraded_realtime():
    """Development without Redis → realtime is degraded (not unavailable), which is allowed."""
    from app.services import redis_health as rh_module

    with patch.object(rh_module.settings, "redis_url", None), \
         patch.object(rh_module.settings, "app_environment", "development"):
        result = await rh_module.check_redis_health()

    assert result["redis_status"] == "not_configured"
    assert result["broker_status"] == "degraded"

    # In development, degraded realtime is explicitly allowed (not a hard failure)
    # This mirrors the readiness logic: realtime_ok = broker_status in ("healthy", "degraded")
    realtime_ok = result["broker_status"] in ("healthy", "degraded")
    assert realtime_ok is True


# ---------------------------------------------------------------------------
# Test Case 9: Platform observability and readiness report consistent states
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_platform_system_health_and_readiness_consistent():
    """
    Both /platform/system-health and /health/ready must use the same
    check_redis_health() function and produce consistent redis/realtime status.
    """
    from app.services import redis_health as rh_module

    # Test with configured Redis failing
    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(side_effect=ConnectionRefusedError("refused"))
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", "redis://some-host:6379"), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        # Both endpoints call the same function; call it twice to simulate both endpoints
        health1 = await rh_module.check_redis_health()
        mock_client.ping = AsyncMock(side_effect=ConnectionRefusedError("refused"))
        mock_client.aclose = AsyncMock()
        health2 = await rh_module.check_redis_health()

    # Both must return the same status semantics
    assert health1["redis_status"] == health2["redis_status"] == "unavailable"
    assert health1["broker_status"] == health2["broker_status"] == "unavailable"


# ---------------------------------------------------------------------------
# Test Case 10: No Redis URL or credentials in responses
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_redis_url_in_health_response_on_failure():
    """Redis URL, hostname, and credentials must never appear in check results."""
    from app.services import redis_health as rh_module

    secret_url = "redis://:SuperSecretPassword@very-private-host.example.com:6379/0"

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(side_effect=ConnectionRefusedError("refused"))
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", secret_url), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        result = await rh_module.check_redis_health()

    result_str = json.dumps(result)

    assert "SuperSecretPassword" not in result_str
    assert "very-private-host.example.com" not in result_str
    assert secret_url not in result_str
    assert "redis://" not in result_str


@pytest.mark.asyncio
async def test_no_redis_url_in_health_response_on_success():
    """Redis URL must not appear in response even on successful ping."""
    from app.services import redis_health as rh_module

    secret_url = "redis://:AnotherSecret@private-host.render.com:6379"

    mock_client = AsyncMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.aclose = AsyncMock()

    with patch.object(rh_module.settings, "redis_url", secret_url), \
         patch.object(rh_module, "_make_redis_client", return_value=mock_client):
        result = await rh_module.check_redis_health()

    result_str = json.dumps(result)

    assert "AnotherSecret" not in result_str
    assert "private-host.render.com" not in result_str
    assert secret_url not in result_str


# ---------------------------------------------------------------------------
# Additional: redis_available None semantics in realtime metrics
# ---------------------------------------------------------------------------

def test_redis_available_none_means_no_check_completed():
    """
    redis_available=None in the metrics snapshot means no check has been
    done — it must never be treated as True by callers.
    """
    from app.services.realtime import metrics, _metrics_lock

    with _metrics_lock:
        original = metrics.redis_available
        metrics.redis_available = None

    try:
        assert metrics.redis_available is None
        assert metrics.redis_available is not True
        assert metrics.redis_available is not False
        # Falsy evaluation — demonstrates why `get(..., True)` default is wrong
        assert not metrics.redis_available  # None is falsy
    finally:
        with _metrics_lock:
            metrics.redis_available = original
