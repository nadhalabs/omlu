import datetime
from types import SimpleNamespace

from app.routes.dashboard import (
    DASHBOARD_ACTIVITY_LIMIT,
    _group_dashboard_activity,
    _latest_meaningful_order_histories,
)


UTC = datetime.timezone.utc
BASE = datetime.datetime(2026, 7, 28, 18, 14, tzinfo=UTC)


def event(event_id, *, table="1", source="table", status="served", seconds=0, restaurant_id=1):
    return {
        "id": event_id,
        "restaurant_id": restaurant_id,
        "table_number": table,
        "source": source,
        "status": status,
        "actor": "System",
        "timestamp": BASE - datetime.timedelta(seconds=seconds),
    }


def test_same_order_keeps_only_latest_meaningful_transition():
    histories = [
        SimpleNamespace(id=3, order_id=10, new_status="served"),
        SimpleNamespace(id=2, order_id=10, new_status="ready"),
        SimpleNamespace(id=1, order_id=11, new_status="ready"),
    ]
    latest = _latest_meaningful_order_histories(histories)
    assert [(item.order_id, item.new_status) for item in latest] == [(10, "served"), (11, "ready")]
    assert len(histories) == 3  # The immutable source history is untouched.


def test_two_served_orders_from_same_table_are_grouped_with_stable_id():
    grouped = _group_dashboard_activity([event("b"), event("a", seconds=30)])
    assert len(grouped) == 1
    assert grouped[0].action == "2 orders served"
    assert grouped[0].count == 2
    assert grouped[0].id == "a|b"


def test_different_tables_are_not_grouped():
    grouped = _group_dashboard_activity([event("a", table="1"), event("b", table="2")])
    assert len(grouped) == 2


def test_different_restaurants_or_sources_are_not_grouped():
    assert len(_group_dashboard_activity([event("a"), event("b", restaurant_id=2)])) == 2
    assert len(_group_dashboard_activity([
        event("a", table=None, source="delivery"),
        event("b", table=None, source="counter"),
    ])) == 2


def test_different_statuses_are_not_grouped():
    grouped = _group_dashboard_activity([event("a"), event("b", status="ready")])
    assert len(grouped) == 2


def test_events_outside_grouping_window_remain_separate():
    grouped = _group_dashboard_activity([event("a"), event("b", seconds=61)])
    assert len(grouped) == 2


def test_dashboard_activity_respects_maximum_and_deduplicates_realtime_refreshes():
    events = [event(f"event-{index}", table=str(index)) for index in range(DASHBOARD_ACTIVITY_LIMIT + 3)]
    first = _group_dashboard_activity(events)
    refreshed = _group_dashboard_activity(events)
    assert len(first) == DASHBOARD_ACTIVITY_LIMIT
    assert [item.id for item in refreshed] == [item.id for item in first]
