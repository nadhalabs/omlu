import logging

import pytest

from app.config import settings
from app.routes import orders


class FakePipeline:
    def __init__(self, client):
        self.client = client

    def incr(self, key):
        self.key = key
        return self

    def expire(self, key, seconds):
        self.expiry = (key, seconds)
        return self

    def execute(self):
        if self.client.error is not None:
            raise self.client.error
        self.client.counts[self.key] = self.client.counts.get(self.key, 0) + 1
        return [self.client.counts[self.key], True]


class FakeRedisClient:
    def __init__(self, *, error=None):
        self.counts = {}
        self.error = error
        self.closed = False

    def pipeline(self):
        return FakePipeline(self)

    def close(self):
        self.closed = True


@pytest.fixture(autouse=True)
def reset_limiter(monkeypatch):
    orders.close_order_rate_limit_redis_client()
    orders.reset_order_rate_limit()
    monkeypatch.setattr(settings, "redis_url", "redis://user:secret@redis.test:6379/0")
    yield
    orders.close_order_rate_limit_redis_client()
    orders.reset_order_rate_limit()


def test_multiple_checks_reuse_one_process_client(monkeypatch):
    client = FakeRedisClient()
    creations = []

    def factory(redis_url):
        creations.append(redis_url)
        return client

    monkeypatch.setattr(orders, "_create_order_rate_limit_redis_client", factory)
    assert orders.check_rate_limit("198.51.100.1") is True
    assert orders.check_rate_limit("198.51.100.1") is True
    assert creations == [settings.redis_url]


def test_redis_success_preserves_fifteen_request_limit(monkeypatch):
    client = FakeRedisClient()
    monkeypatch.setattr(orders, "_create_order_rate_limit_redis_client", lambda _url: client)

    for _ in range(15):
        assert orders.check_rate_limit("198.51.100.2") is True
    assert orders.check_rate_limit("198.51.100.2") is False


def test_redis_unavailable_falls_back_to_existing_memory_limit(monkeypatch):
    client = FakeRedisClient(error=TimeoutError("redis://user:secret@redis.test:6379/0"))
    monkeypatch.setattr(orders, "_create_order_rate_limit_redis_client", lambda _url: client)

    for _ in range(15):
        assert orders.check_rate_limit("198.51.100.3") is True
    assert orders.check_rate_limit("198.51.100.3") is False


def test_client_factory_preserves_bounded_timeouts(monkeypatch):
    captured = {}

    def from_url(redis_url, **kwargs):
        captured.update({"redis_url": redis_url, **kwargs})
        return FakeRedisClient()

    import redis

    monkeypatch.setattr(redis.Redis, "from_url", from_url)
    client = orders._create_order_rate_limit_redis_client(settings.redis_url)
    assert isinstance(client, FakeRedisClient)
    assert captured["socket_timeout"] == 1.0
    assert captured["socket_connect_timeout"] == 1.0


def test_fallback_logs_exception_type_without_credentials(monkeypatch, caplog):
    secret_url = settings.redis_url
    client = FakeRedisClient(error=RuntimeError(secret_url))
    monkeypatch.setattr(orders, "_create_order_rate_limit_redis_client", lambda _url: client)

    with caplog.at_level(logging.DEBUG, logger=orders.__name__):
        assert orders.check_rate_limit("198.51.100.4") is True

    assert "RuntimeError" in caplog.text
    assert secret_url not in caplog.text
    assert "secret" not in caplog.text


def test_client_is_closed_during_lifecycle_cleanup(monkeypatch):
    client = FakeRedisClient()
    monkeypatch.setattr(orders, "_create_order_rate_limit_redis_client", lambda _url: client)
    orders.check_rate_limit("198.51.100.5")

    orders.close_order_rate_limit_redis_client()
    assert client.closed is True
