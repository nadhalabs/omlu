import uuid
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.services.dining_sessions import (
    calculate_session_subtotal,
    find_current_open_session_for_table,
    generate_session_token,
    get_or_create_open_session,
)


@pytest.fixture
def sqlite_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'dining_sessions.sqlite3'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


def create_restaurant_with_table(db, slug="session-test", table_code="T-1"):
    restaurant = Restaurant(name=f"Restaurant {slug}", slug=slug, is_active=True)
    db.add(restaurant)
    db.flush()
    table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="1",
        table_code=table_code,
        is_active=True,
    )
    db.add(table)
    db.flush()
    return restaurant, table


def create_order(db, restaurant, table, dining_session=None, subtotal=Decimal("100.00")):
    order = Order(
        restaurant_id=restaurant.id,
        table_id=table.id,
        dining_session_id=dining_session.id if dining_session else None,
        order_number=f"DS-{uuid.uuid4().hex[:12]}",
        public_token=uuid.uuid4().hex,
        status="pending",
        subtotal=subtotal,
        idempotency_key=uuid.uuid4().hex,
    )
    db.add(order)
    db.flush()
    return order


def test_create_first_open_session(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)

    dining_session = get_or_create_open_session(sqlite_session, restaurant, table)

    assert dining_session.id is not None
    assert dining_session.restaurant_id == restaurant.id
    assert dining_session.table_id == table.id
    assert dining_session.status == "open"
    assert len(dining_session.public_token) >= 32


def test_retrieve_existing_open_session(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    first = get_or_create_open_session(sqlite_session, restaurant, table)
    second = get_or_create_open_session(sqlite_session, restaurant, table)

    assert second.id == first.id
    assert sqlite_session.query(DiningSession).count() == 1


def test_one_open_session_per_table(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    first = get_or_create_open_session(sqlite_session, restaurant, table)
    first_id = first.id
    sqlite_session.commit()
    duplicate = DiningSession(
        restaurant_id=restaurant.id,
        table_id=table.id,
        public_token=generate_session_token(),
        status="payment_pending",
    )
    sqlite_session.add(duplicate)

    with pytest.raises(IntegrityError):
        sqlite_session.flush()

    sqlite_session.rollback()
    existing = find_current_open_session_for_table(sqlite_session, table.id)
    assert existing.id == first_id


def test_another_table_can_have_own_session(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    other_table = RestaurantTable(
        restaurant_id=restaurant.id,
        table_number="2",
        table_code="T-2",
        is_active=True,
    )
    sqlite_session.add(other_table)
    sqlite_session.flush()

    first = get_or_create_open_session(sqlite_session, restaurant, table)
    second = get_or_create_open_session(sqlite_session, restaurant, other_table)

    assert second.id != first.id


def test_another_restaurant_can_have_own_session(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session, "session-a", "A-1")
    other_restaurant, other_table = create_restaurant_with_table(sqlite_session, "session-b", "B-1")

    first = get_or_create_open_session(sqlite_session, restaurant, table)
    second = get_or_create_open_session(sqlite_session, other_restaurant, other_table)

    assert second.id != first.id


@pytest.mark.parametrize("terminal_status", ["closed", "cancelled"])
def test_terminal_session_allows_new_session(sqlite_session, terminal_status):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    first = get_or_create_open_session(sqlite_session, restaurant, table)
    first.status = terminal_status
    sqlite_session.flush()

    second = get_or_create_open_session(sqlite_session, restaurant, table)

    assert second.id != first.id
    assert second.status == "open"


def test_secure_token_uniqueness():
    tokens = {generate_session_token() for _ in range(500)}

    assert len(tokens) == 500
    assert all(len(token) >= 32 for token in tokens)


def test_existing_historical_orders_remain_valid(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    order = create_order(sqlite_session, restaurant, table, dining_session=None)
    sqlite_session.commit()

    saved_order = sqlite_session.query(Order).filter(Order.id == order.id).one()

    assert saved_order.dining_session_id is None


def test_session_subtotal(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    dining_session = get_or_create_open_session(sqlite_session, restaurant, table)
    create_order(sqlite_session, restaurant, table, dining_session, Decimal("100.00"))
    create_order(sqlite_session, restaurant, table, dining_session, Decimal("75.50"))

    assert calculate_session_subtotal(sqlite_session, dining_session.id) == Decimal("175.50")


def test_order_can_attach_to_dining_session(sqlite_session):
    restaurant, table = create_restaurant_with_table(sqlite_session)
    category = MenuCategory(
        restaurant_id=restaurant.id,
        name_en="Food",
        display_order=1,
        is_active=True,
    )
    sqlite_session.add(category)
    sqlite_session.flush()
    item = MenuItem(
        restaurant_id=restaurant.id,
        category_id=category.id,
        name_en="Dosa",
        price=Decimal("80.00"),
        is_available=True,
    )
    sqlite_session.add(item)
    sqlite_session.flush()
    dining_session = get_or_create_open_session(sqlite_session, restaurant, table)
    order = create_order(sqlite_session, restaurant, table, dining_session, Decimal("80.00"))

    assert order.dining_session_id == dining_session.id
    assert order.dining_session.public_token == dining_session.public_token
