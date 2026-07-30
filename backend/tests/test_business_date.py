import datetime

from app.utils.business_date import (
    DEFAULT_RESTAURANT_TIMEZONE,
    current_business_day_bounds_utc,
    restaurant_business_date,
    restaurant_timezone,
)


def test_business_date_uses_restaurant_timezone_not_server_date():
    now = datetime.datetime(2026, 7, 30, 23, 30, tzinfo=datetime.timezone.utc)

    assert restaurant_business_date("America/New_York", now=now) == datetime.date(2026, 7, 30)
    assert restaurant_business_date("Asia/Kolkata", now=now) == datetime.date(2026, 7, 31)


def test_business_day_bounds_handle_non_utc_midnight():
    now = datetime.datetime(2026, 7, 30, 20, 0, tzinfo=datetime.timezone.utc)

    start, end, timezone = current_business_day_bounds_utc("Asia/Kolkata", now=now)

    assert timezone.key == "Asia/Kolkata"
    assert start == datetime.datetime(2026, 7, 30, 18, 30, tzinfo=datetime.timezone.utc)
    assert end == datetime.datetime(2026, 7, 31, 18, 30, tzinfo=datetime.timezone.utc)


def test_invalid_restaurant_timezone_uses_existing_fallback():
    assert restaurant_timezone("Not/A-Timezone").key == DEFAULT_RESTAURANT_TIMEZONE
