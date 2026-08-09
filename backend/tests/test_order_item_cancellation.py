import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem, OrderItemSelectedOption, OrderStatusHistory
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.table_session_participant import TableSessionParticipant
from app.routes.orders import publish_item_cancelled
from app.services.bills import apply_draft_totals
from app.services.order_item_cancellation import cancel_order_item


@pytest.fixture
def cancellation_factory(db_session):
    created_restaurants = []

    def create(*, order_status="pending", item_totals=(Decimal("100.00"), Decimal("50.00")), bill_status=None, gst=False):
        suffix = uuid.uuid4().hex[:10]
        restaurant = Restaurant(
            name=f"Cancellation {suffix}", slug=f"cancel-{suffix}", is_active=True,
            gst_enabled=gst, default_gst_rate=Decimal("18.00"), tax_mode="exclusive",
        )
        db_session.add(restaurant); db_session.flush(); created_restaurants.append(restaurant.id)
        table = RestaurantTable(restaurant_id=restaurant.id, table_number=suffix[:4], table_code=suffix, is_active=True)
        db_session.add(table); db_session.flush()
        session = DiningSession(restaurant_id=restaurant.id, table_id=table.id, public_token=uuid.uuid4().hex, status="open")
        db_session.add(session); db_session.flush()
        participant = TableSessionParticipant(
            public_id=uuid.uuid4().hex, restaurant_id=restaurant.id, table_id=table.id,
            session_id=session.id, token_hash=uuid.uuid4().hex, label_number=1,
        )
        db_session.add(participant); db_session.flush()
        order = Order(
            restaurant_id=restaurant.id, table_id=table.id, dining_session_id=session.id,
            order_number=f"ORD-{suffix}", public_token=uuid.uuid4().hex, status=order_status,
            subtotal=sum(item_totals, Decimal("0.00")), created_by_participant_id=participant.id,
        )
        db_session.add(order); db_session.flush()
        items = []
        for index, total in enumerate(item_totals):
            item = OrderItem(
                order_id=order.id, item_name=f"Snapshot item {index}", quantity=index + 1,
                unit_price=total / (index + 1), total_price=total, item_note=f"note-{index}",
            )
            db_session.add(item); db_session.flush()
            db_session.add(OrderItemSelectedOption(
                order_item_id=item.id, option_name="Original option", group_name="Size",
                option_type="single", price_delta=Decimal("0.00"), quantity=1,
            ))
            items.append(item)
        bill = None
        if bill_status:
            bill = Bill(
                restaurant_id=restaurant.id, dining_session_id=session.id,
                bill_number=f"B-{suffix}", receipt_token=uuid.uuid4().hex, status=bill_status,
                currency="INR", subtotal=order.subtotal, total_amount=order.subtotal,
                discount_amount=Decimal("0.00"), gst_enabled_snapshot=gst,
                gst_rate=Decimal("18.00"), tax_mode_snapshot="exclusive",
            )
            db_session.add(bill)
        db_session.commit()
        return restaurant, table, session, participant, order, items, bill

    yield create
    db_session.rollback()
    for restaurant_id in created_restaurants:
        db_session.query(Restaurant).filter(Restaurant.id == restaurant_id).delete()
    db_session.commit()


def perform(db, context, item_index=0, *, actor_type="customer"):
    restaurant, table, session, participant, order, items, bill = context
    result = cancel_order_item(
        db, restaurant_id=restaurant.id, session_id=session.id,
        order_public_token=order.public_token, order_item_id=items[item_index].id,
        actor_type=actor_type, reason=f"{actor_type}_cancelled",
        participant_id=participant.id if actor_type == "customer" else None,
        staff_id=99 if actor_type == "staff" else None,
        require_order_participant=actor_type == "customer",
    )
    db.commit()
    return result


@pytest.mark.parametrize("order_status", ["pending", "accepted"])
def test_customer_cancels_eligible_item_and_preserves_snapshot(db_session, cancellation_factory, order_status):
    context = cancellation_factory(order_status=order_status)
    order, item, _, _ = perform(db_session, context)
    db_session.refresh(item); db_session.refresh(order)
    assert item.cancellation_status == "cancelled"
    assert item.cancellation_actor_type == "customer"
    assert item.cancelled_at is not None
    assert (item.item_name, item.quantity, item.total_price, item.item_note) == ("Snapshot item 0", 1, Decimal("100.00"), "note-0")
    assert item.selected_options[0].option_name == "Original option"
    assert order.status == order_status
    assert order.subtotal == Decimal("50.00")


@pytest.mark.parametrize("order_status", ["preparing", "ready", "served", "rejected"])
def test_customer_cannot_cancel_after_eligibility_window(db_session, cancellation_factory, order_status):
    context = cancellation_factory(order_status=order_status)
    with pytest.raises(HTTPException) as error:
        perform(db_session, context)
    db_session.rollback()
    assert error.value.status_code == 409
    assert context[5][0].cancellation_status == "active"


def test_customer_cannot_cancel_another_participants_order(db_session, cancellation_factory):
    context = cancellation_factory()
    restaurant, table, session, participant, order, items, bill = context
    other = TableSessionParticipant(public_id=uuid.uuid4().hex, restaurant_id=restaurant.id, table_id=table.id, session_id=session.id, token_hash=uuid.uuid4().hex, label_number=2)
    db_session.add(other); db_session.commit()
    with pytest.raises(HTTPException) as error:
        cancel_order_item(db_session, restaurant_id=restaurant.id, session_id=session.id, order_public_token=order.public_token, order_item_id=items[0].id, actor_type="customer", reason="customer_cancelled", participant_id=other.id, require_order_participant=True)
    db_session.rollback()
    assert error.value.status_code == 404


def test_staff_has_same_eligibility_window(db_session, cancellation_factory):
    eligible = cancellation_factory(order_status="accepted")
    _, item, _, _ = perform(db_session, eligible, actor_type="staff")
    assert item.cancelled_by_staff_id == 99
    blocked = cancellation_factory(order_status="preparing")
    with pytest.raises(HTTPException) as error:
        perform(db_session, blocked, actor_type="staff")
    db_session.rollback()
    assert error.value.status_code == 409


def test_draft_bill_and_gst_totals_recalculate_from_active_items(db_session, cancellation_factory):
    context = cancellation_factory(bill_status="draft", gst=True)
    order, item, _, bill = perform(db_session, context)
    db_session.refresh(bill)
    assert order.subtotal == Decimal("50.00")
    assert bill.subtotal == Decimal("50.00")
    assert bill.taxable_amount == Decimal("50.00")
    assert bill.tax_amount == Decimal("9.00")
    assert bill.total_amount == Decimal("59.00")


@pytest.mark.parametrize("bill_status", ["issued", "payment_pending", "paid"])
def test_immutable_bill_blocks_item_cancellation(db_session, cancellation_factory, bill_status):
    context = cancellation_factory(bill_status=bill_status)
    before = context[6].total_amount
    with pytest.raises(HTTPException) as error:
        perform(db_session, context)
    db_session.rollback(); db_session.refresh(context[6])
    assert error.value.status_code == 409
    assert context[6].total_amount == before
    assert context[5][0].cancellation_status == "active"


def test_final_item_rejects_order_and_records_history(db_session, cancellation_factory):
    context = cancellation_factory(item_totals=(Decimal("100.00"),))
    order, item, _, _ = perform(db_session, context)
    db_session.refresh(order)
    history = db_session.query(OrderStatusHistory).filter(OrderStatusHistory.order_id == order.id).one()
    assert order.subtotal == Decimal("0.00")
    assert order.status == "rejected"
    assert order.cancellation_reason == "all_items_cancelled"
    assert (history.old_status, history.new_status) == ("pending", "rejected")


def test_repeated_cancellation_is_deterministic_conflict(db_session, cancellation_factory):
    context = cancellation_factory()
    perform(db_session, context)
    with pytest.raises(HTTPException) as error:
        perform(db_session, context)
    db_session.rollback()
    assert error.value.status_code == 409


def test_event_payload_and_channels_are_scoped(db_session, cancellation_factory, monkeypatch):
    order, item, session, _ = perform(db_session, cancellation_factory())
    published = {}
    monkeypatch.setattr("app.routes.orders.publish_event", lambda event_type, **kwargs: published.update(type=event_type, **kwargs))
    publish_item_cancelled(order, item, session)
    assert published["type"] == "order.item_cancelled"
    assert {"order_item_id", "order_number", "table_id", "session_token", "cancellation_actor_type", "order_subtotal"} <= published["state"].keys()
    assert any(channel.endswith(":kitchen") for channel in published["channels"])
    assert any(channel.endswith(":staff") for channel in published["channels"])
    assert any("session:" in channel for channel in published["channels"])
    assert any("order:" in channel for channel in published["channels"])


def test_cancellation_service_uses_row_locks_for_races():
    source = open("app/services/order_item_cancellation.py", encoding="utf-8").read()
    assert source.count("with_for_update()") >= 4
    assert source.index("query(DiningSession)") < source.index("query(Bill)") < source.index("query(Order)") < source.index("query(OrderItem)")
