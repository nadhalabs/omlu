import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal, engine
from app.models.dining_session import DiningSession
from app.models.payment import Payment
from app.models.quick_sale import QuickSale
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.service_request import ServiceRequest
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password


pytestmark = pytest.mark.skipif(
    engine.dialect.name != "postgresql",
    reason="Phase 2 integrity requires PostgreSQL partial indexes and row concurrency.",
)


@pytest.fixture
def integrity_context():
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:12]
    first = Restaurant(name="Integrity A", slug=f"integrity-a-{suffix}", is_active=True)
    second = Restaurant(name="Integrity B", slug=f"integrity-b-{suffix}", is_active=True)
    db.add_all([first, second])
    db.flush()
    table = RestaurantTable(
        restaurant_id=first.id,
        table_number="1",
        table_code=f"INT-{suffix}",
        is_active=True,
    )
    staff = StaffUser(
        restaurant_id=first.id,
        name="Integrity Owner",
        email=f"integrity-{suffix}@example.test",
        password_hash=hash_password("Password123!"),
        role="owner",
        status="active",
        is_active=True,
    )
    db.add_all([table, staff])
    db.commit()
    result = {
        "restaurant_id": first.id,
        "other_restaurant_id": second.id,
        "table_id": table.id,
        "staff_id": staff.id,
        "suffix": suffix,
    }
    db.close()
    yield result
    db = SessionLocal()
    db.query(Restaurant).filter(
        Restaurant.id.in_([result["restaurant_id"], result["other_restaurant_id"]])
    ).delete(synchronize_session=False)
    db.commit()
    db.close()


def _run_simultaneously(*functions):
    barrier = threading.Barrier(len(functions))

    def invoke(function):
        barrier.wait()
        return function()

    with ThreadPoolExecutor(max_workers=len(functions)) as executor:
        return [future.result() for future in [executor.submit(invoke, fn) for fn in functions]]


def test_simultaneous_duplicate_active_table_creation(integrity_context):
    def create(code):
        def operation():
            db = SessionLocal()
            try:
                db.add(RestaurantTable(
                    restaurant_id=integrity_context["restaurant_id"],
                    table_number="2",
                    table_code=code,
                    is_active=True,
                ))
                db.commit()
                return "created"
            except IntegrityError:
                db.rollback()
                return "conflict"
            finally:
                db.close()
        return operation

    outcomes = _run_simultaneously(
        create(f"A-{integrity_context['suffix']}"),
        create(f"B-{integrity_context['suffix']}"),
    )
    assert sorted(outcomes) == ["conflict", "created"]


def test_same_active_table_number_is_allowed_across_restaurants(integrity_context):
    db = SessionLocal()
    db.add(RestaurantTable(
        restaurant_id=integrity_context["other_restaurant_id"],
        table_number="1",
        table_code=f"OTHER-{integrity_context['suffix']}",
        is_active=True,
    ))
    db.commit()
    assert db.query(RestaurantTable).filter(
        RestaurantTable.restaurant_id.in_([
            integrity_context["restaurant_id"],
            integrity_context["other_restaurant_id"],
        ]),
        RestaurantTable.table_number == "1",
    ).count() == 2
    db.close()


def test_simultaneous_active_session_creation(integrity_context):
    def create():
        db = SessionLocal()
        try:
            db.add(DiningSession(
                restaurant_id=integrity_context["restaurant_id"],
                table_id=integrity_context["table_id"],
                public_token=uuid.uuid4().hex,
                status="open",
            ))
            db.commit()
            return "created"
        except IntegrityError:
            db.rollback()
            return "conflict"
        finally:
            db.close()

    assert sorted(_run_simultaneously(create, create)) == ["conflict", "created"]


def test_simultaneous_duplicate_active_service_requests(integrity_context):
    db = SessionLocal()
    session = DiningSession(
        restaurant_id=integrity_context["restaurant_id"],
        table_id=integrity_context["table_id"],
        public_token=uuid.uuid4().hex,
        status="open",
    )
    db.add(session)
    db.commit()
    session_id = session.id
    db.close()

    def create():
        local = SessionLocal()
        try:
            local.add(ServiceRequest(
                restaurant_id=integrity_context["restaurant_id"],
                table_id=integrity_context["table_id"],
                dining_session_id=session_id,
                request_type="water",
                status="pending",
            ))
            local.commit()
            return "created"
        except IntegrityError:
            local.rollback()
            return "conflict"
        finally:
            local.close()

    assert sorted(_run_simultaneously(create, create)) == ["conflict", "created"]


def test_duplicate_final_payment_is_database_protected(integrity_context):
    db = SessionLocal()
    sale = QuickSale(
        restaurant_id=integrity_context["restaurant_id"],
        order_number=f"QS-{integrity_context['suffix']}",
        public_token=f"qs_{uuid.uuid4().hex}",
        idempotency_key=f"sale-{uuid.uuid4().hex}",
        idempotency_request_hash=uuid.uuid4().hex * 2,
        sale_type="late_entry",
        source="late_entry",
        status="completed",
        subtotal=Decimal("10.00"),
        total_amount=Decimal("10.00"),
        payment_method="cash",
        entered_by_staff_id=integrity_context["staff_id"],
        entered_by_name="Integrity Owner",
        entered_by_role="owner",
    )
    db.add(sale)
    db.commit()
    sale_id = sale.id
    db.close()

    def create(key):
        local = SessionLocal()
        try:
            local.add(Payment(
                restaurant_id=integrity_context["restaurant_id"],
                quick_sale_id=sale_id,
                idempotency_key=key,
                method="cash",
                amount=Decimal("10.00"),
                recorded_by_staff_id=integrity_context["staff_id"],
            ))
            local.commit()
            return "created"
        except IntegrityError:
            local.rollback()
            return "conflict"
        finally:
            local.close()

    outcomes = _run_simultaneously(
        lambda: create(f"payment-a-{integrity_context['suffix']}"),
        lambda: create(f"payment-b-{integrity_context['suffix']}"),
    )
    assert sorted(outcomes) == ["conflict", "created"]
