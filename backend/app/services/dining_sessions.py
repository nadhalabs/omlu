import secrets
from decimal import Decimal
from typing import Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.dining_session import ACTIVE_DINING_SESSION_STATUSES, DiningSession
from app.models.order import Order
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def validate_restaurant_table_ownership(
    restaurant: Restaurant,
    table: RestaurantTable,
) -> None:
    if table.restaurant_id != restaurant.id:
        raise ValueError("Table does not belong to restaurant")


def find_current_open_session_for_table(
    db: Session,
    table_id: int,
) -> Optional[DiningSession]:
    return (
        db.query(DiningSession)
        .options(selectinload(DiningSession.orders))
        .filter(
            DiningSession.table_id == table_id,
            DiningSession.status.in_(ACTIVE_DINING_SESSION_STATUSES),
        )
        .order_by(DiningSession.opened_at.desc(), DiningSession.id.desc())
        .first()
    )


def create_session_safely(
    db: Session,
    restaurant: Restaurant,
    table: RestaurantTable,
) -> DiningSession:
    validate_restaurant_table_ownership(restaurant, table)

    for _ in range(3):
        try:
            with db.begin_nested():
                session = DiningSession(
                    restaurant_id=restaurant.id,
                    table_id=table.id,
                    public_token=generate_session_token(),
                    status="open",
                )
                db.add(session)
                db.flush()
            return session
        except IntegrityError:
            existing = find_current_open_session_for_table(db, table.id)
            if existing:
                return existing

    raise RuntimeError("Could not create a unique dining session")


def get_or_create_open_session(
    db: Session,
    restaurant: Restaurant,
    table: RestaurantTable,
) -> DiningSession:
    validate_restaurant_table_ownership(restaurant, table)

    locked_table = (
        db.query(RestaurantTable)
        .filter(
            RestaurantTable.id == table.id,
            RestaurantTable.restaurant_id == restaurant.id,
        )
        .with_for_update()
        .first()
    )
    if not locked_table:
        raise ValueError("Table does not belong to restaurant")

    existing = find_current_open_session_for_table(db, table.id)
    if existing:
        return existing

    return create_session_safely(db, restaurant, table)


def calculate_session_subtotal(db: Session, dining_session_id: int) -> Decimal:
    subtotal = (
        db.query(func.coalesce(func.sum(Order.subtotal), 0))
        .filter(Order.dining_session_id == dining_session_id)
        .scalar()
    )
    return Decimal(subtotal or 0)
