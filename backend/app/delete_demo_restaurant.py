"""
Safely delete the local Nadha Demo Cafe restaurant and only its data.

Run from backend/:
    PYTHONPATH=. venv/bin/python -m app.delete_demo_restaurant
"""
from __future__ import annotations

import sys
from collections.abc import Iterable
from urllib.parse import urlparse

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, _normalize_db_url
from app.models.bill import Bill, RestaurantBillDailySequence
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import (
    Order,
    OrderItem,
    OrderStatusHistory,
    RestaurantDailySequence,
)
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import AuditLog, StaffSession, StaffUser


DEMO_SLUG = "nadha-demo-cafe"
CONFIRMATION_TEXT = "DELETE NADHA DEMO CAFE"
LOCAL_HOSTS = {"localhost", "127.0.0.1"}


def _database_host() -> str | None:
    parsed = urlparse(_normalize_db_url(settings.database_url))
    return parsed.hostname


def _refuse_unless_local_database() -> None:
    host = _database_host()
    if host not in LOCAL_HOSTS:
        print(
            "Refusing to run: database host must be localhost or 127.0.0.1. "
            f"Configured host: {host or '<none>'}",
            file=sys.stderr,
        )
        sys.exit(2)


def _count(db: Session, model, restaurant_id: int) -> int:
    return db.query(func.count(model.id)).filter(model.restaurant_id == restaurant_id).scalar() or 0


def _collect_counts(db: Session, restaurant_id: int) -> dict[str, int]:
    order_ids = [
        row[0]
        for row in db.query(Order.id).filter(Order.restaurant_id == restaurant_id).all()
    ]
    counts = {
        "staff_users": _count(db, StaffUser, restaurant_id),
        "staff_sessions": _count(db, StaffSession, restaurant_id),
        "audit_logs": _count(db, AuditLog, restaurant_id),
        "restaurant_tables": _count(db, RestaurantTable, restaurant_id),
        "menu_categories": _count(db, MenuCategory, restaurant_id),
        "menu_items": _count(db, MenuItem, restaurant_id),
        "dining_sessions": _count(db, DiningSession, restaurant_id),
        "orders": _count(db, Order, restaurant_id),
        "order_items": 0,
        "order_status_history": 0,
        "bills": _count(db, Bill, restaurant_id),
        "bill_daily_sequences": _count(db, RestaurantBillDailySequence, restaurant_id),
        "service_requests": _count(db, ServiceRequest, restaurant_id),
        "order_daily_sequences": _count(db, RestaurantDailySequence, restaurant_id),
        "restaurant_settings": 1,
        "restaurants": 1,
    }
    if order_ids:
        counts["order_items"] = (
            db.query(func.count(OrderItem.id))
            .filter(OrderItem.order_id.in_(order_ids))
            .scalar()
            or 0
        )
        counts["order_status_history"] = (
            db.query(func.count(OrderStatusHistory.id))
            .filter(OrderStatusHistory.order_id.in_(order_ids))
            .scalar()
            or 0
        )
    return counts


def _print_counts(title: str, counts: dict[str, int]) -> None:
    print(f"\n{title}")
    for name in sorted(counts):
        print(f"  {name}: {counts[name]}")


def _delete_query(query) -> int:
    return query.delete(synchronize_session=False)


def _delete_order_dependents(db: Session, order_ids: Iterable[int]) -> dict[str, int]:
    ids = list(order_ids)
    if not ids:
        return {"order_status_history": 0, "order_items": 0}
    return {
        "order_status_history": _delete_query(
            db.query(OrderStatusHistory).filter(OrderStatusHistory.order_id.in_(ids))
        ),
        "order_items": _delete_query(
            db.query(OrderItem).filter(OrderItem.order_id.in_(ids))
        ),
    }


def _delete_restaurant_data(db: Session, restaurant_id: int) -> dict[str, int]:
    order_ids = [
        row[0]
        for row in db.query(Order.id).filter(Order.restaurant_id == restaurant_id).all()
    ]
    deleted = _delete_order_dependents(db, order_ids)

    # Rows with nullable FKs are deleted before their targets so no data is left dangling.
    deleted["service_requests"] = _delete_query(
        db.query(ServiceRequest).filter(ServiceRequest.restaurant_id == restaurant_id)
    )
    deleted["bills"] = _delete_query(
        db.query(Bill).filter(Bill.restaurant_id == restaurant_id)
    )
    deleted["orders"] = _delete_query(
        db.query(Order).filter(Order.restaurant_id == restaurant_id)
    )
    deleted["bill_daily_sequences"] = _delete_query(
        db.query(RestaurantBillDailySequence).filter(
            RestaurantBillDailySequence.restaurant_id == restaurant_id
        )
    )
    deleted["order_daily_sequences"] = _delete_query(
        db.query(RestaurantDailySequence).filter(
            RestaurantDailySequence.restaurant_id == restaurant_id
        )
    )
    deleted["staff_sessions"] = _delete_query(
        db.query(StaffSession).filter(StaffSession.restaurant_id == restaurant_id)
    )
    deleted["audit_logs"] = _delete_query(
        db.query(AuditLog).filter(AuditLog.restaurant_id == restaurant_id)
    )
    deleted["staff_users"] = _delete_query(
        db.query(StaffUser).filter(StaffUser.restaurant_id == restaurant_id)
    )
    deleted["dining_sessions"] = _delete_query(
        db.query(DiningSession).filter(DiningSession.restaurant_id == restaurant_id)
    )
    deleted["menu_items"] = _delete_query(
        db.query(MenuItem).filter(MenuItem.restaurant_id == restaurant_id)
    )
    deleted["menu_categories"] = _delete_query(
        db.query(MenuCategory).filter(MenuCategory.restaurant_id == restaurant_id)
    )
    deleted["restaurant_tables"] = _delete_query(
        db.query(RestaurantTable).filter(RestaurantTable.restaurant_id == restaurant_id)
    )
    deleted["restaurants"] = _delete_query(
        db.query(Restaurant).filter(
            Restaurant.id == restaurant_id,
            Restaurant.slug == DEMO_SLUG,
        )
    )
    deleted["restaurant_settings"] = 1 if deleted["restaurants"] == 1 else 0
    return deleted


def main() -> None:
    _refuse_unless_local_database()
    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.slug == DEMO_SLUG).one_or_none()
        if restaurant is None:
            print(f"No restaurant found with slug {DEMO_SLUG!r}. Nothing deleted.")
            return

        restaurant_id = restaurant.id
        print("Target restaurant:")
        print(f"  name: {restaurant.name}")
        print(f"  id: {restaurant_id}")
        print(f"  slug: {restaurant.slug}")

        before_counts = _collect_counts(db, restaurant_id)
        _print_counts("Records that will be deleted:", before_counts)

        print(f"\nType exactly {CONFIRMATION_TEXT!r} to continue.")
        confirmation = input("> ").strip()
        if confirmation != CONFIRMATION_TEXT:
            print("Confirmation did not match. Nothing deleted.")
            return

        db.rollback()
        deleted_counts: dict[str, int]
        with db.begin():
            locked_restaurant = (
                db.query(Restaurant)
                .filter(Restaurant.id == restaurant_id, Restaurant.slug == DEMO_SLUG)
                .with_for_update()
                .one_or_none()
            )
            if locked_restaurant is None:
                raise RuntimeError("Demo restaurant disappeared before deletion.")
            deleted_counts = _delete_restaurant_data(db, restaurant_id)

        _print_counts("Deleted records:", deleted_counts)
        print("\nCompleted deletion of Nadha Demo Cafe local demo data.")
    except Exception as exc:
        db.rollback()
        print(f"Deletion failed. Rolled back all changes. Reason: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
