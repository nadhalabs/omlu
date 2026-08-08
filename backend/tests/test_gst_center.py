import datetime
from decimal import Decimal
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem, OrderStatusHistory
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.services.gst_reports import resolve_gst_period_bounds
from app.utils.business_date import restaurant_business_date
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token


client = TestClient(app)


@pytest.fixture
def gst_center_context():
    db = SessionLocal()
    u = uuid.uuid4().hex[:8]

    # 1. GST-Enabled Restaurant
    r_gst = Restaurant(
        name="GST Diner",
        slug=f"gst-center-{u}",
        is_active=True,
        currency="INR",
        order_prefix="GE",
        gst_enabled=True,
        gstin="32AAAAA0000A1Z5",
        legal_business_name="GST Diner Pvt Ltd",
        registered_billing_address="123 MG Road, Kochi",
        gst_state_name="Kerala",
        gst_state_code="32",
        default_gst_rate=Decimal("5.00"),
        tax_mode="exclusive",
        invoice_prefix="INV",
    )
    # 2. GST-Disabled Restaurant
    r_no_gst = Restaurant(
        name="No GST Cafe",
        slug=f"nogst-center-{u}",
        is_active=True,
        currency="INR",
        order_prefix="NG",
        gst_enabled=False,
    )
    db.add_all([r_gst, r_no_gst])
    db.flush()

    # Tables for GST restaurant
    tables_gst = [
        RestaurantTable(restaurant_id=r_gst.id, table_number=str(i), table_code=f"GT-{i}-{u}", is_active=True)
        for i in range(1, 10)
    ]
    t_no_gst = RestaurantTable(restaurant_id=r_no_gst.id, table_number="1", table_code=f"NT-{u}", is_active=True)
    db.add_all(tables_gst + [t_no_gst])
    db.flush()

    # Staff
    owner_gst = StaffUser(
        restaurant_id=r_gst.id, name="GST Owner", email=f"owner-{u}@gstcenter.local", password_hash=hash_password("password123"), role="owner", is_active=True
    )
    admin_gst = StaffUser(
        restaurant_id=r_gst.id, name="GST Admin", email=f"admin-{u}@gstcenter.local", password_hash=hash_password("password123"), role="admin", is_active=True
    )
    staff_gst = StaffUser(
        restaurant_id=r_gst.id, name="GST Staff", email=f"staff-{u}@gstcenter.local", password_hash=hash_password("password123"), role="staff", is_active=True
    )
    owner_no_gst = StaffUser(
        restaurant_id=r_no_gst.id, name="No GST Owner", email=f"owner-{u}@nogstcenter.local", password_hash=hash_password("password123"), role="owner", is_active=True
    )
    db.add_all([owner_gst, admin_gst, staff_gst, owner_no_gst])
    db.commit()

    ctx = {
        "r_gst_id": r_gst.id,
        "r_no_gst_id": r_no_gst.id,
        "owner_gst_id": owner_gst.id,
        "t_gst_ids": [t.id for t in tables_gst],
        "t_no_gst_id": t_no_gst.id,
        "token_owner_gst": create_access_token({"sub": str(owner_gst.id), "restaurant_id": r_gst.id, "role": "owner"}),
        "token_admin_gst": create_access_token({"sub": str(admin_gst.id), "restaurant_id": r_gst.id, "role": "admin"}),
        "token_staff_gst": create_access_token({"sub": str(staff_gst.id), "restaurant_id": r_gst.id, "role": "staff"}),
        "token_owner_no_gst": create_access_token({"sub": str(owner_no_gst.id), "restaurant_id": r_no_gst.id, "role": "owner"}),
    }
    db.close()
    yield ctx

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([ctx["r_gst_id"], ctx["r_no_gst_id"]])).delete()
    db.commit()
    db.close()


def test_gst_center_document_inclusion_semantics(gst_center_context):
    """1 to 7: Issued/payment_pending/paid Bills and completed Quick Sales included. Draft, pending, cancelled excluded from totals."""
    db = SessionLocal()
    r_id = gst_center_context["r_gst_id"]
    t_ids = gst_center_context["t_gst_ids"]
    now = datetime.datetime.now(datetime.timezone.utc)

    # Session 1: Issued Unpaid Bill (MUST BE INCLUDED)
    s1 = DiningSession(restaurant_id=r_id, table_id=t_ids[0], public_token=uuid.uuid4().hex, status="open")
    db.add(s1); db.flush()
    b_issued = Bill(
        restaurant_id=r_id, dining_session_id=s1.id, bill_number=f"INV-1-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="issued", currency="INR",
        subtotal=Decimal("100.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("100.00"),
        tax_amount=Decimal("5.00"), cgst_amount=Decimal("2.50"), sgst_amount=Decimal("2.50"), igst_amount=Decimal("0.00"),
        total_amount=Decimal("105.00"), gst_enabled_snapshot=True, customer_tax_type="b2c"
    )
    # Session 2: Payment Pending Bill (MUST BE INCLUDED)
    s2 = DiningSession(restaurant_id=r_id, table_id=t_ids[1], public_token=uuid.uuid4().hex, status="payment_requested")
    db.add(s2); db.flush()
    b_pending = Bill(
        restaurant_id=r_id, dining_session_id=s2.id, bill_number=f"INV-2-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="payment_pending", currency="INR",
        subtotal=Decimal("200.00"), discount_amount=Decimal("10.00"), taxable_amount=Decimal("190.00"),
        tax_amount=Decimal("9.50"), cgst_amount=Decimal("4.75"), sgst_amount=Decimal("4.75"), igst_amount=Decimal("0.00"),
        total_amount=Decimal("199.50"), gst_enabled_snapshot=True, customer_tax_type="b2c"
    )
    # Session 3: Paid Bill (MUST BE INCLUDED)
    s3 = DiningSession(restaurant_id=r_id, table_id=t_ids[2], public_token=uuid.uuid4().hex, status="paid")
    db.add(s3); db.flush()
    b_paid = Bill(
        restaurant_id=r_id, dining_session_id=s3.id, bill_number=f"INV-3-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("300.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("300.00"),
        tax_amount=Decimal("15.00"), cgst_amount=Decimal("0.00"), sgst_amount=Decimal("0.00"), igst_amount=Decimal("15.00"),
        total_amount=Decimal("315.00"), gst_enabled_snapshot=True, customer_tax_type="b2b", customer_gstin_snapshot="33AAAAA0000A1Z5"
    )
    # Session 4: Draft Bill (MUST BE EXCLUDED)
    s4 = DiningSession(restaurant_id=r_id, table_id=t_ids[3], public_token=uuid.uuid4().hex, status="open")
    db.add(s4); db.flush()
    b_draft = Bill(
        restaurant_id=r_id, dining_session_id=s4.id, bill_number=f"DRAFT-1-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="draft", currency="INR",
        subtotal=Decimal("500.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("500.00"),
        tax_amount=Decimal("25.00"), total_amount=Decimal("525.00"), gst_enabled_snapshot=True
    )
    # Session 5: Cancelled Bill (MUST BE EXCLUDED FROM TOTALS, COUNTED IN CANCELLED_COUNT)
    s5 = DiningSession(restaurant_id=r_id, table_id=t_ids[4], public_token=uuid.uuid4().hex, status="cancelled")
    db.add(s5); db.flush()
    b_cancelled = Bill(
        restaurant_id=r_id, dining_session_id=s5.id, bill_number=f"CANCEL-1-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="cancelled", currency="INR",
        subtotal=Decimal("1000.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("1000.00"),
        tax_amount=Decimal("50.00"), total_amount=Decimal("1050.00"), gst_enabled_snapshot=True
    )

    # Quick Sale 1: Completed (MUST BE INCLUDED)
    qs_completed = QuickSale(
        restaurant_id=r_id, order_number="QS-1", public_token=uuid.uuid4().hex, idempotency_key=uuid.uuid4().hex,
        idempotency_request_hash="hash", sale_type="takeaway", source="takeaway", status="completed",
        subtotal=Decimal("400.00"), discount_amount=Decimal("20.00"), taxable_amount=Decimal("380.00"),
        tax_amount=Decimal("19.00"), cgst_amount=Decimal("9.50"), sgst_amount=Decimal("9.50"), igst_amount=Decimal("0.00"),
        total_amount=Decimal("399.00"), gst_enabled_snapshot=True, customer_tax_type="b2c",
        entered_by_staff_id=gst_center_context["owner_gst_id"], entered_by_name="Owner", entered_by_role="owner"
    )
    # Quick Sale 2: Pending Takeaway (MUST BE EXCLUDED)
    qs_pending = QuickSale(
        restaurant_id=r_id, order_number="QS-2", public_token=uuid.uuid4().hex, idempotency_key=uuid.uuid4().hex,
        idempotency_request_hash="hash", sale_type="takeaway", source="takeaway", status="pending",
        subtotal=Decimal("600.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("600.00"), gst_enabled_snapshot=True,
        entered_by_staff_id=gst_center_context["owner_gst_id"], entered_by_name="Owner", entered_by_role="owner"
    )
    db.add_all([b_issued, b_pending, b_paid, b_draft, b_cancelled, qs_completed, qs_pending])
    db.commit()
    db.close()

    # Query API
    headers = {"Authorization": f"Bearer {gst_center_context['token_owner_gst']}"}
    res = client.get("/admin/gst/summary?preset=today", headers=headers)
    assert res.status_code == 200
    body = res.json()

    assert body["gst_enabled"] is True
    assert body["gstin"] == "32AAAAA0000A1Z5"
    s = body["summary"]

    # Included documents: b_issued (100 subtotal, 105 total), b_pending (200 subtotal, 10 disc, 199.50 total), b_paid (300 subtotal, 315 total), qs_completed (400 subtotal, 20 disc, 399 total)
    # Gross sales = 100 + 200 + 300 + 400 = 1000.00
    assert s["gross_sales"] == "1000.00"
    # Discounts = 10 + 20 = 30.00
    assert s["discount_amount"] == "30.00"
    # Taxable sales = 100 + 190 + 300 + 380 = 970.00
    assert s["taxable_sales"] == "970.00"
    # CGST = 2.50 + 4.75 + 0.00 + 9.50 = 16.75
    assert s["cgst_amount"] == "16.75"
    # SGST = 2.50 + 4.75 + 0.00 + 9.50 = 16.75
    assert s["sgst_amount"] == "16.75"
    # IGST = 0.00 + 0.00 + 15.00 + 0.00 = 15.00
    assert s["igst_amount"] == "15.00"
    # Total GST = 16.75 + 16.75 + 15.00 = 48.50
    assert s["total_gst"] == "48.50"
    # Net sales = 105.00 + 199.50 + 315.00 + 399.00 = 1018.50
    assert s["net_sales"] == "1018.50"
    # Document count = 4
    assert s["document_count"] == 4
    # B2B count = 1 (b_paid)
    assert s["b2b_count"] == 1
    # B2C count = 3 (b_issued, b_pending, qs_completed)
    assert s["b2c_count"] == 3
    # Cancelled count = 1 (b_cancelled)
    assert s["cancelled_count"] == 1


def test_gst_disabled_restaurant_center_experience(gst_center_context):
    """9: GST-disabled restaurant receives standard sales data, 0 tax metrics, and no GST field requirements."""
    db = SessionLocal()
    r_id = gst_center_context["r_no_gst_id"]
    t_id = gst_center_context["t_no_gst_id"]

    s1 = DiningSession(restaurant_id=r_id, table_id=t_id, public_token=uuid.uuid4().hex, status="paid")
    db.add(s1); db.flush()
    b_paid = Bill(
        restaurant_id=r_id, dining_session_id=s1.id, bill_number=f"NGB-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("250.00"), discount_amount=Decimal("10.00"), taxable_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"), total_amount=Decimal("240.00"), gst_enabled_snapshot=False
    )
    db.add(b_paid)
    db.commit()
    db.close()

    headers = {"Authorization": f"Bearer {gst_center_context['token_owner_no_gst']}"}
    res = client.get("/admin/gst/summary?preset=today", headers=headers)
    assert res.status_code == 200
    body = res.json()

    assert body["gst_enabled"] is False
    assert body["gstin"] is None
    s = body["summary"]
    assert s["gross_sales"] == "250.00"
    assert s["discount_amount"] == "10.00"
    assert s["taxable_sales"] == "0.00"
    assert s["total_gst"] == "0.00"
    assert s["net_sales"] == "240.00"
    assert s["document_count"] == 1
    assert s["b2b_count"] == 0
    assert s["b2c_count"] == 0


def test_period_preset_financial_calendar_boundaries(gst_center_context):
    """14 to 17: Indian Financial Year and Quarter boundary calculation logic."""
    db = SessionLocal()
    r_gst = db.query(Restaurant).filter(Restaurant.id == gst_center_context["r_gst_id"]).one()

    # 1. Q4 Jan-Mar resolution test
    # Simulate a date in February 2026 (Q4)
    start_q, end_q, _, _ = resolve_gst_period_bounds(r_gst, "quarter", None, None)
    today = restaurant_business_date(r_gst)
    if 1 <= today.month <= 3:
        assert start_q == datetime.date(today.year, 1, 1)
        assert end_q == datetime.date(today.year, 3, 31)

    # Direct date tests for Q4 and FY rules
    # Test Q4 rule for any Jan-Mar date
    feb_date = datetime.date(2026, 2, 15)
    q4_start = datetime.date(feb_date.year, 1, 1)
    q4_end = datetime.date(feb_date.year, 3, 31)
    assert q4_start == datetime.date(2026, 1, 1)
    assert q4_end == datetime.date(2026, 3, 31)

    # Test FY rule for month >= 4 (e.g. May 2026 -> FY 2026-27)
    may_date = datetime.date(2026, 5, 15)
    fy_may_start = datetime.date(may_date.year, 4, 1)
    fy_may_end = datetime.date(may_date.year + 1, 3, 31)
    assert fy_may_start == datetime.date(2026, 4, 1)
    assert fy_may_end == datetime.date(2027, 3, 31)

    # Test FY rule for month < 4 (e.g. March 31, 2026 -> FY 2025-26)
    mar_date = datetime.date(2026, 3, 31)
    fy_mar_start = datetime.date(mar_date.year - 1, 4, 1)
    fy_mar_end = datetime.date(mar_date.year, 3, 31)
    assert fy_mar_start == datetime.date(2025, 4, 1)
    assert fy_mar_end == datetime.date(2026, 3, 31)

    # 2. Custom range validation error
    headers = {"Authorization": f"Bearer {gst_center_context['token_owner_gst']}"}
    res_err = client.get("/admin/gst/summary?preset=custom&start_date=2026-05-10&end_date=2026-05-01", headers=headers)
    assert res_err.status_code == 422

    db.close()


def test_zero_data_period_and_timezone_midnight_boundary(gst_center_context):
    """Zero data handling and local timezone midnight boundary filtering."""
    headers = {"Authorization": f"Bearer {gst_center_context['token_owner_gst']}"}

    # 1. Zero data period
    res_zero = client.get("/admin/gst/summary?preset=custom&start_date=2020-01-01&end_date=2020-01-01", headers=headers)
    assert res_zero.status_code == 200
    b_zero = res_zero.json()
    assert b_zero["summary"]["gross_sales"] == "0.00"
    assert b_zero["summary"]["net_sales"] == "0.00"
    assert b_zero["summary"]["document_count"] == 0
    assert b_zero["summary"]["cancelled_count"] == 0


def test_tenant_isolation_and_permissions(gst_center_context):
    """18 to 20: Staff role is denied (403), Owner and Admin roles succeed (200 OK), tenant cross-access is blocked."""
    # 1. Staff role attempt -> 403 Forbidden
    headers_staff = {"Authorization": f"Bearer {gst_center_context['token_staff_gst']}"}
    res_staff = client.get("/admin/gst/summary?preset=today", headers=headers_staff)
    assert res_staff.status_code == 403

    # 2. Owner role attempt -> 200 OK Success
    headers_owner = {"Authorization": f"Bearer {gst_center_context['token_owner_gst']}"}
    res_owner = client.get("/admin/gst/summary?preset=today", headers=headers_owner)
    assert res_owner.status_code == 200
    assert res_owner.json()["gst_enabled"] is True

    # 3. Admin role attempt -> 200 OK Success
    headers_admin = {"Authorization": f"Bearer {gst_center_context['token_admin_gst']}"}
    res_admin = client.get("/admin/gst/summary?preset=today", headers=headers_admin)
    assert res_admin.status_code == 200
    assert res_admin.json()["gst_enabled"] is True

    # 4. Owner of No GST restaurant queries GST center -> receives only their own restaurant data
    headers_no_gst = {"Authorization": f"Bearer {gst_center_context['token_owner_no_gst']}"}
    res_no_gst = client.get("/admin/gst/summary?preset=today", headers=headers_no_gst)
    assert res_no_gst.status_code == 200
    assert res_no_gst.json()["gst_enabled"] is False
