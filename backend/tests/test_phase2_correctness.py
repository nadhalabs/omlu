import time
import pytest
from app.config import settings
from app.routes.orders import check_rate_limit, reset_order_rate_limit, order_rate_limit_records


@pytest.fixture(autouse=True)
def clean_rate_limits():
    reset_order_rate_limit()
    yield
    reset_order_rate_limit()


def test_rate_limit_below_threshold():
    ip = "192.168.1.10"
    for _ in range(14):
        assert check_rate_limit(ip) is True


def test_rate_limit_exceeding_threshold_blocks():
    ip = "192.168.1.11"
    for _ in range(15):
        check_rate_limit(ip)
    assert check_rate_limit(ip) is False


def test_rate_limit_reset():
    ip = "192.168.1.12"
    for _ in range(15):
        check_rate_limit(ip)
    assert check_rate_limit(ip) is False

    reset_order_rate_limit()
    assert check_rate_limit(ip) is True


def test_separate_client_ips_isolated():
    ip1 = "192.168.1.13"
    ip2 = "192.168.1.14"

    for _ in range(15):
        check_rate_limit(ip1)

    assert check_rate_limit(ip1) is False
    assert check_rate_limit(ip2) is True


def test_stale_memory_pruning():
    """Verify that old IP keys are pruned when memory limit threshold is reached."""
    # Populate dictionary with 250 stale keys
    old_time = time.time() - 100
    for i in range(250):
        order_rate_limit_records[f"stale.ip.{i}"] = [old_time]

    assert len(order_rate_limit_records) >= 250

    # Trigger rate limit check for a new IP
    check_rate_limit("10.0.0.1")

    # Stale keys should have been pruned
    assert len(order_rate_limit_records) < 50
    assert "10.0.0.1" in order_rate_limit_records


def test_redis_fallback_on_error(monkeypatch):
    """Verify that if Redis throws an exception, rate limiting safely falls back to in-memory."""
    monkeypatch.setattr(settings, "redis_url", "redis://invalid-host-for-testing:6379/0")
    ip = "192.168.1.20"

    # Should not raise exception, falls back to in-memory
    assert check_rate_limit(ip) is True
