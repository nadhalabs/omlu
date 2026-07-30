import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


DEFAULT_RESTAURANT_TIMEZONE = "Asia/Kolkata"


def restaurant_timezone(value: object | str | None) -> ZoneInfo:
    if isinstance(value, str):
        name = value
    else:
        name = getattr(value, "timezone", None)
    try:
        return ZoneInfo(name or DEFAULT_RESTAURANT_TIMEZONE)
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return ZoneInfo(DEFAULT_RESTAURANT_TIMEZONE)


def restaurant_local_now(
    restaurant: object | str | None,
    *,
    now: datetime.datetime | None = None,
) -> datetime.datetime:
    current = now or datetime.datetime.now(datetime.timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=datetime.timezone.utc)
    return current.astimezone(restaurant_timezone(restaurant))


def restaurant_business_date(
    restaurant: object | str | None,
    *,
    now: datetime.datetime | None = None,
) -> datetime.date:
    return restaurant_local_now(restaurant, now=now).date()


def local_date_bounds_utc(
    restaurant: object | str | None,
    start_date: datetime.date,
    end_date: datetime.date | None = None,
) -> tuple[datetime.datetime, datetime.datetime]:
    tz = restaurant_timezone(restaurant)
    final_date = end_date or start_date
    start_local = datetime.datetime.combine(start_date, datetime.time.min, tzinfo=tz)
    end_local = datetime.datetime.combine(
        final_date + datetime.timedelta(days=1),
        datetime.time.min,
        tzinfo=tz,
    )
    return (
        start_local.astimezone(datetime.timezone.utc),
        end_local.astimezone(datetime.timezone.utc),
    )


def current_business_day_bounds_utc(
    restaurant: object | str | None,
    *,
    now: datetime.datetime | None = None,
) -> tuple[datetime.datetime, datetime.datetime, ZoneInfo]:
    current_date = restaurant_business_date(restaurant, now=now)
    start_utc, end_utc = local_date_bounds_utc(restaurant, current_date)
    return start_utc, end_utc, restaurant_timezone(restaurant)
