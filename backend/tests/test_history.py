import datetime
import io
import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.database import SessionLocal
from app.main import app
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.utils.auth import create_access_token, hash_password


client = TestClient(app)


@pytest.fixture(scope="module")
def history_data():
    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.slug.in_(["history-test", "history-other"])).delete()
    db.commit()

    restaurant = Restaurant(name="History Test", slug="history-test", is_active=True, timezone="Asia/Kolkata", logo_url="/missing/history-logo.png")
    other = Restaurant(name="History Other", slug="history-other", is_active=True, timezone="Asia/Kolkata")
    db.add_all([restaurant, other])
    db.flush()

    owner = StaffUser(restaurant_id=restaurant.id, name="Owner", email="owner@history.test", password_hash=hash_password("Owner123!"), role="owner", is_active=True)
    admin = StaffUser(restaurant_id=restaurant.id, name="Admin", email="admin@history.test", password_hash=hash_password("Admin123!"), role="admin", is_active=True)
    staff = StaffUser(restaurant_id=restaurant.id, name="Server", email="server@history.test", password_hash=hash_password("Server123!"), role="staff", is_active=True)
    kitchen = StaffUser(restaurant_id=restaurant.id, name="Kitchen", email="kitchen@history.test", password_hash=hash_password("Kitchen123!"), role="kitchen", is_active=True)
    other_owner = StaffUser(restaurant_id=other.id, name="Other", email="other@history.test", password_hash=hash_password("Other123!"), role="owner", is_active=True)
    db.add_all([owner, admin, staff, kitchen, other_owner])
    db.flush()

    table = RestaurantTable(restaurant_id=restaurant.id, table_number="1", table_code="H1", is_active=True)
    other_table = RestaurantTable(restaurant_id=other.id, table_number="9", table_code="H9", is_active=True)
    db.add_all([table, other_table])
    db.flush()

    category = MenuCategory(restaurant_id=restaurant.id, name_en="Main", display_order=1, is_active=True)
    item = MenuItem(restaurant_id=restaurant.id, category=category, name_en="Dosa", price=Decimal("100.00"), is_available=True)
    db.add_all([category, item])
    db.flush()

    today = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)
    yesterday = today - datetime.timedelta(days=1)

    session = DiningSession(restaurant_id=restaurant.id, table_id=table.id, public_token=uuid.uuid4().hex, status="paid", opened_at=today - datetime.timedelta(hours=1), closed_at=today)
    db.add(session)
    db.flush()

    orders = []
    for index, created_at in enumerate([today, today - datetime.timedelta(minutes=10), yesterday], start=1):
        order = Order(
            restaurant_id=restaurant.id,
            table_id=table.id,
            dining_session_id=session.id,
            order_number=f"H-{index}",
            public_token=uuid.uuid4().hex,
            status="served" if index != 3 else "rejected",
            subtotal=Decimal("100.00") * index,
            created_at=created_at,
        )
        db.add(order)
        db.flush()
        db.add(OrderItem(order_id=order.id, menu_item_id=item.id, item_name="Dosa", quantity=index, unit_price=Decimal("100.00"), total_price=Decimal("100.00") * index))
        db.add(OrderStatusHistory(order_id=order.id, old_status="pending", new_status="accepted", changed_at=created_at + datetime.timedelta(minutes=1), changed_by_staff_id=staff.id))
        db.add(OrderStatusHistory(order_id=order.id, old_status="ready", new_status=order.status, changed_at=created_at + datetime.timedelta(minutes=5), changed_by_staff_id=staff.id))
        orders.append(order)

    bill = Bill(
        restaurant_id=restaurant.id,
        dining_session_id=session.id,
        bill_number="B-H-1",
        status="paid",
        subtotal=Decimal("300.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total_amount=Decimal("300.00"),
        generated_at=today,
        paid_at=today,
        payment_method="counter_cash",
    )
    db.add(bill)

    other_session = DiningSession(restaurant_id=other.id, table_id=other_table.id, public_token=uuid.uuid4().hex, status="paid", opened_at=today, closed_at=today)
    db.add(other_session)
    db.flush()
    db.add(Order(restaurant_id=other.id, table_id=other_table.id, dining_session_id=other_session.id, order_number="OTHER-1", public_token=uuid.uuid4().hex, status="served", subtotal=Decimal("999.00"), created_at=today))
    db.commit()

    data = {
        "owner_token": create_access_token({"sub": str(owner.id), "restaurant_id": restaurant.id, "role": "owner"}),
        "admin_token": create_access_token({"sub": str(admin.id), "restaurant_id": restaurant.id, "role": "admin"}),
        "staff_token": create_access_token({"sub": str(staff.id), "restaurant_id": restaurant.id, "role": "staff"}),
        "kitchen_token": create_access_token({"sub": str(kitchen.id), "restaurant_id": restaurant.id, "role": "kitchen"}),
        "other_token": create_access_token({"sub": str(other_owner.id), "restaurant_id": other.id, "role": "owner"}),
        "staff_id": staff.id,
        "table_id": table.id,
    }
    yield data

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.slug.in_(["history-test", "history-other"])).delete()
    db.commit()
    db.close()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _pdf_text(response) -> str:
    reader = PdfReader(io.BytesIO(response.content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def test_history_owner_admin_only(history_data):
    assert client.get("/admin/history/orders", headers=_auth(history_data["owner_token"])).status_code == 200
    assert client.get("/admin/history/orders", headers=_auth(history_data["admin_token"])).status_code == 200
    assert client.get("/admin/history/orders", headers=_auth(history_data["staff_token"])).status_code == 403


def test_today_yesterday_and_pagination(history_data):
    today = client.get("/admin/history/orders?preset=today&page=1&page_size=1", headers=_auth(history_data["owner_token"]))
    assert today.status_code == 200
    body = today.json()
    assert body["total"] == 2
    assert len(body["items"]) == 1

    yesterday = client.get("/admin/history/orders?preset=yesterday", headers=_auth(history_data["owner_token"]))
    assert yesterday.status_code == 200
    assert yesterday.json()["total"] == 1


def test_cross_restaurant_isolation(history_data):
    response = client.get("/admin/history/orders?preset=last_7_days", headers=_auth(history_data["owner_token"]))
    assert response.status_code == 200
    order_numbers = {item["order_number"] for item in response.json()["items"]}
    assert "OTHER-1" not in order_numbers


def test_performance_revenue_and_top_selling(history_data):
    response = client.get("/admin/history/performance?preset=today", headers=_auth(history_data["owner_token"]))
    assert response.status_code == 200
    body = response.json()
    assert body["metrics"]["total_revenue"] == "300.00"
    assert body["metrics"]["total_orders"] == 2
    assert body["metrics"]["average_order_value"] == "150.00"
    assert body["top_selling_items"][0]["item_name"] == "Dosa"


def test_custom_range_empty_and_csv_export(history_data):
    response = client.get(
        "/admin/history/orders?preset=custom&start_date=2000-01-01&end_date=2000-01-02",
        headers=_auth(history_data["owner_token"]),
    )
    assert response.status_code == 200
    assert response.json()["total"] == 0

    csv_response = client.get("/admin/history/orders/export?preset=today", headers=_auth(history_data["owner_token"]))
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "order_number" in csv_response.text


def test_performance_pdf_owner_admin_access_and_rejections(history_data):
    owner = client.get("/admin/history/performance/export.pdf?preset=today", headers=_auth(history_data["owner_token"]))
    admin = client.get("/admin/history/performance/export.pdf?preset=today", headers=_auth(history_data["admin_token"]))
    staff = client.get("/admin/history/performance/export.pdf?preset=today", headers=_auth(history_data["staff_token"]))
    kitchen = client.get("/admin/history/performance/export.pdf?preset=today", headers=_auth(history_data["kitchen_token"]))
    public = client.get("/admin/history/performance/export.pdf?preset=today")

    assert owner.status_code == 200
    assert admin.status_code == 200
    assert staff.status_code == 403
    assert kitchen.status_code == 403
    assert public.status_code in {401, 403}


def test_performance_pdf_daily_content_type_filename_and_totals(history_data):
    summary = client.get("/admin/history/performance?preset=today", headers=_auth(history_data["owner_token"])).json()
    response = client.get("/admin/history/performance/export.pdf?preset=today", headers=_auth(history_data["owner_token"]))

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"].startswith("attachment; filename=\"omlu-daily-report-")
    text = _pdf_text(response)
    assert "OMLU" in text
    assert "History Test" in text
    assert "Daily report" in text
    assert "Asia/Kolkata" in text
    assert f"INR {summary['metrics']['total_revenue']}" in text
    assert "Total orders" in text
    assert str(summary["metrics"]["total_orders"]) in text
    assert "Cash" in text
    assert "100.00%" in text


def test_performance_pdf_monthly_and_custom_date_ranges(history_data):
    monthly = client.get("/admin/history/performance/export.pdf?preset=month", headers=_auth(history_data["owner_token"]))
    custom = client.get(
        "/admin/history/performance/export.pdf?preset=custom&start_date=2000-01-01&end_date=2000-01-02",
        headers=_auth(history_data["owner_token"]),
    )

    assert monthly.status_code == 200
    assert "omlu-monthly-report-" in monthly.headers["content-disposition"]
    assert "Monthly report" in _pdf_text(monthly)
    assert custom.status_code == 200
    assert "omlu-report-2000-01-01-to-2000-01-02.pdf" in custom.headers["content-disposition"]
    custom_text = _pdf_text(custom)
    assert "Custom date range report" in custom_text
    assert "No data available" in custom_text


def test_performance_pdf_restaurant_isolation_and_logo_fallback(history_data):
    response = client.get("/admin/history/performance/export.pdf?preset=today", headers=_auth(history_data["other_token"]))

    assert response.status_code == 200
    text = _pdf_text(response)
    assert "History Other" in text
    assert "History Test" not in text
    assert "INR 300.00" not in text


def test_performance_csv_export_still_unchanged(history_data):
    response = client.get("/admin/history/performance/export?preset=today", headers=_auth(history_data["owner_token"]))

    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert response.headers["content-disposition"] == 'attachment; filename="performance-summary.csv"'
    assert "total_revenue,300.00" in response.text
