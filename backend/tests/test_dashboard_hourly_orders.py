import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.routes.dashboard import _get_local_day_bounds_utc, _orders_by_local_hour


UTC = datetime.timezone.utc
IST = ZoneInfo("Asia/Kolkata")


def record(timestamp):
    return SimpleNamespace(created_at=timestamp)


def test_local_day_bounds_convert_ist_midnight_to_utc():
    start, end, timezone = _get_local_day_bounds_utc(
        "Asia/Kolkata",
        now=datetime.datetime(2026, 7, 29, 6, 30, tzinfo=UTC),
    )
    assert timezone == IST
    assert start == datetime.datetime(2026, 7, 28, 18, 30, tzinfo=UTC)
    assert end == datetime.datetime(2026, 7, 29, 18, 30, tzinfo=UTC)


def test_invalid_timezone_uses_india_fallback():
    start, _, timezone = _get_local_day_bounds_utc(
        "Invalid/Timezone",
        now=datetime.datetime(2026, 7, 29, 6, 30, tzinfo=UTC),
    )
    assert timezone == IST
    assert start.hour == 18 and start.minute == 30


def test_midnight_and_late_night_orders_land_in_correct_local_hours():
    buckets = _orders_by_local_hour(
        [
            record(datetime.datetime(2026, 7, 28, 18, 30, tzinfo=UTC)),
            record(datetime.datetime(2026, 7, 29, 18, 29, 59, tzinfo=UTC)),
        ],
        [],
        IST,
    )
    assert len(buckets) == 24
    assert buckets[0].orders == 1
    assert buckets[23].orders == 1
    assert sum(bucket.orders for bucket in buckets) == 2


def test_regular_orders_and_quick_sales_share_the_same_hourly_contract():
    buckets = _orders_by_local_hour(
        [record(datetime.datetime(2026, 7, 29, 4, 0, tzinfo=UTC))],
        [record(datetime.datetime(2026, 7, 29, 4, 15, tzinfo=UTC))],
        IST,
    )
    assert buckets[9].model_dump() == {"hour": 9, "orders": 2}


def test_zero_order_day_returns_24_predictable_zero_buckets():
    buckets = _orders_by_local_hour([], [], IST)
    assert [bucket.hour for bucket in buckets] == list(range(24))
    assert all(bucket.orders == 0 for bucket in buckets)
