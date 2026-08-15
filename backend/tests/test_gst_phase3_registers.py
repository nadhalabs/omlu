import datetime
from decimal import Decimal
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.main import app
from app.database import SessionLocal, engine
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuCategory, MenuItem
from app.models.order import Order, OrderItem
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.restaurant import Restaurant
from app.models.restaurant_table import RestaurantTable
from app.models.staff_user import StaffUser
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token


client = TestClient(app)


@pytest.fixture
def p3_gst_context():
    db = SessionLocal()
    u = uuid.uuid4().hex[:8]

    # 1. GST-Enabled Restaurant
    r_gst = Restaurant(
        name="P3 GST Diner",
        slug=f"p3-gst-{u}",
        is_active=True,
        currency="INR",
        order_prefix="P3",
        gst_enabled=True,
        gstin="32AAAAA0000A1Z5",
        legal_business_name="P3 Diner Pvt Ltd",
        registered_billing_address="456 MG Road, Kochi",
        gst_state_name="Kerala",
        gst_state_code="32",
        default_gst_rate=Decimal("5.00"),
        tax_mode="exclusive",
        invoice_prefix="INV",
    )
    # 2. GST-Disabled Restaurant
    r_no_gst = Restaurant(
        name="P3 No GST Cafe",
        slug=f"p3-nogst-{u}",
        is_active=True,
        currency="INR",
        order_prefix="NG",
        gst_enabled=False,
    )
    db.add_all([r_gst, r_no_gst])
    db.flush()

    tables = [
        RestaurantTable(restaurant_id=r_gst.id, table_number=str(i), table_code=f"P3T-{i}-{u}", is_active=True)
        for i in range(1, 10)
    ]
    t_no_gst = RestaurantTable(restaurant_id=r_no_gst.id, table_number="1", table_code=f"P3NT-{u}", is_active=True)
    db.add_all(tables + [t_no_gst])
    db.flush()

    owner_gst = StaffUser(
        restaurant_id=r_gst.id, name="Owner P3", email=f"owner-{u}@p3gst.local", password_hash=hash_password("password123"), role="owner", is_active=True
    )
    admin_gst = StaffUser(
        restaurant_id=r_gst.id, name="Admin P3", email=f"admin-{u}@p3gst.local", password_hash=hash_password("password123"), role="admin", is_active=True
    )
    staff_gst = StaffUser(
        restaurant_id=r_gst.id, name="Staff P3", email=f"staff-{u}@p3gst.local", password_hash=hash_password("password123"), role="staff", is_active=True
    )
    owner_no_gst = StaffUser(
        restaurant_id=r_no_gst.id, name="Owner NoGST P3", email=f"owner-{u}@p3nogst.local", password_hash=hash_password("password123"), role="owner", is_active=True
    )
    db.add_all([owner_gst, admin_gst, staff_gst, owner_no_gst])
    db.commit()

    ctx = {
        "r_gst_id": r_gst.id,
        "r_no_gst_id": r_no_gst.id,
        "owner_gst_id": owner_gst.id,
        "t_ids": [t.id for t in tables],
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


def test_sales_register_and_b2b_b2c(p3_gst_context):
    """Test Sales Register, B2B Register, and B2C Register endpoints."""
    db = SessionLocal()
    r_id = p3_gst_context["r_gst_id"]
    t_ids = p3_gst_context["t_ids"]

    # 1. B2C Bill
    s1 = DiningSession(restaurant_id=r_id, table_id=t_ids[0], public_token=uuid.uuid4().hex, status="paid")
    db.add(s1); db.flush()
    b1 = Bill(
        restaurant_id=r_id, dining_session_id=s1.id, bill_number=f"BILL-B2C-{uuid.uuid4().hex[:4]}",
        invoice_number="INV-0001", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("100.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("100.00"),
        gst_rate=Decimal("5.00"), tax_amount=Decimal("5.00"), cgst_amount=Decimal("2.50"), sgst_amount=Decimal("2.50"), igst_amount=Decimal("0.00"),
        total_amount=Decimal("105.00"), gst_enabled_snapshot=True, customer_tax_type="b2c"
    )
    # 2. B2B Bill
    s2 = DiningSession(restaurant_id=r_id, table_id=t_ids[1], public_token=uuid.uuid4().hex, status="paid")
    db.add(s2); db.flush()
    b2 = Bill(
        restaurant_id=r_id, dining_session_id=s2.id, bill_number=f"BILL-B2B-{uuid.uuid4().hex[:4]}",
        invoice_number="INV-0002", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("500.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("500.00"),
        gst_rate=Decimal("18.00"), tax_amount=Decimal("90.00"), cgst_amount=Decimal("0.00"), sgst_amount=Decimal("0.00"), igst_amount=Decimal("90.00"),
        total_amount=Decimal("590.00"), gst_enabled_snapshot=True, customer_tax_type="b2b", customer_gstin_snapshot="33AAAAA0000A1Z5", customer_legal_name_snapshot="Corp Inc"
    )
    # 3. Completed Quick Sale (B2C)
    qs = QuickSale(
        restaurant_id=r_id, order_number="QS-100", invoice_number="INV-0003", public_token=uuid.uuid4().hex, idempotency_key=uuid.uuid4().hex,
        idempotency_request_hash="hash", sale_type="takeaway", source="takeaway", status="completed",
        subtotal=Decimal("200.00"), discount_amount=Decimal("10.00"), taxable_amount=Decimal("190.00"),
        gst_rate=Decimal("5.00"), tax_amount=Decimal("9.50"), cgst_amount=Decimal("4.75"), sgst_amount=Decimal("4.75"), igst_amount=Decimal("0.00"),
        total_amount=Decimal("199.50"), gst_enabled_snapshot=True, customer_tax_type="b2c",
        entered_by_staff_id=p3_gst_context["owner_gst_id"], entered_by_name="Owner", entered_by_role="owner"
    )
    db.add_all([b1, b2, qs])
    db.commit()
    db.close()

    headers = {"Authorization": f"Bearer {p3_gst_context['token_owner_gst']}"}

    # Query Sales Register
    res_sales = client.get("/admin/gst/sales-register?preset=today", headers=headers)
    assert res_sales.status_code == 200
    b_sales = res_sales.json()
    assert b_sales["pagination"]["total_records"] == 3

    # Query B2B Register
    res_b2b = client.get("/admin/gst/b2b-register?preset=today", headers=headers)
    assert res_b2b.status_code == 200
    b_b2b = res_b2b.json()
    assert b_b2b["pagination"]["total_records"] == 1
    assert b_b2b["records"][0]["customer_gstin"] == "33AAAAA0000A1Z5"

    # Query B2C Register
    res_b2c = client.get("/admin/gst/b2c-register?preset=today", headers=headers)
    assert res_b2c.status_code == 200
    b_b2c = res_b2c.json()
    assert b_b2c["pagination"]["total_records"] == 2


def test_sales_register_page_queries_are_bounded(p3_gst_context):
    statements = []

    def capture_statement(_connection, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture_statement)
    try:
        response = client.get(
            "/admin/gst/sales-register?preset=today&page=2&limit=2",
            headers={"Authorization": f"Bearer {p3_gst_context['token_owner_gst']}"},
        )
    finally:
        event.remove(engine, "before_cursor_execute", capture_statement)

    assert response.status_code == 200
    assert len(response.json()["records"]) <= 2
    record_queries = [
        statement.upper()
        for statement in statements
        if ("FROM BILLS" in statement.upper() or "FROM QUICK_SALES" in statement.upper())
        and "COUNT(" not in statement.upper()
    ]
    assert record_queries
    assert all(" LIMIT " in statement for statement in record_queries)


def test_hsn_summary_limitation(p3_gst_context):
    """Test HSN Summary output and explicit line-level tax allocation limitation metadata."""
    db = SessionLocal()
    r_id = p3_gst_context["r_gst_id"]
    t_id = p3_gst_context["t_ids"][0]

    s1 = DiningSession(restaurant_id=r_id, table_id=t_id, public_token=uuid.uuid4().hex, status="paid")
    db.add(s1); db.flush()
    b1 = Bill(
        restaurant_id=r_id, dining_session_id=s1.id, bill_number=f"HSN-BILL-{uuid.uuid4().hex[:4]}",
        receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("150.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("150.00"),
        gst_rate=Decimal("5.00"), tax_amount=Decimal("7.50"), total_amount=Decimal("157.50"), gst_enabled_snapshot=True
    )
    db.add(b1); db.flush()

    o1 = Order(restaurant_id=r_id, table_id=t_id, dining_session_id=s1.id, order_number="P3-1", subtotal=Decimal("150.00"), status="delivered", public_token=uuid.uuid4().hex)
    db.add(o1); db.flush()
    oi1 = OrderItem(
        order_id=o1.id, item_name="Biryani", quantity=2, unit_price=Decimal("75.00"), total_price=Decimal("150.00"),
        hsn_sac_code_snapshot="996331", gst_rate_snapshot=Decimal("5.00"),
        taxable_amount_snapshot=None, cgst_amount_snapshot=None, sgst_amount_snapshot=None, igst_amount_snapshot=None
    )
    db.add(oi1)
    db.commit()
    db.close()

    headers = {"Authorization": f"Bearer {p3_gst_context['token_owner_gst']}"}
    res_hsn = client.get("/admin/gst/hsn-summary?preset=today", headers=headers)
    assert res_hsn.status_code == 200
    b_hsn = res_hsn.json()

    assert b_hsn["tax_allocation_status"] == "unallocated_header_discount"
    assert "Line-level tax allocation is omitted" in b_hsn["tax_allocation_notice"]
    rec = b_hsn["records"][0]
    assert rec["hsn_sac_code"] == "996331"
    assert rec["total_quantity"] == 2
    assert rec["taxable_amount"] is None
    assert rec["cgst_amount"] is None


def test_documents_issued_real_omlu_invoice_format_and_cancellation_continuity(p3_gst_context):
    """Proves:
    1. Real OMLU format (INV/2026-27/000001) parses correctly.
    2. Cancelled 000002 consumed number -> 000001, cancelled 000002, 000003 produces NO gap.
    3. Shared Bill and QuickSale sequence participate in same sequence.
    4. Non-GST documents without invoice numbers are excluded.
    """
    db = SessionLocal()
    r_id = p3_gst_context["r_gst_id"]
    t_ids = p3_gst_context["t_ids"]

    # Bill 1: INV/2026-27/000001 (paid)
    s1 = DiningSession(restaurant_id=r_id, table_id=t_ids[0], public_token=uuid.uuid4().hex, status="paid")
    db.add(s1); db.flush()
    b1 = Bill(
        restaurant_id=r_id, dining_session_id=s1.id, bill_number=f"BILL-1-{uuid.uuid4().hex[:4]}",
        invoice_number="INV/2026-27/000001", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("100.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("105.00"), gst_enabled_snapshot=True
    )
    # Bill 2: INV/2026-27/000002 (CANCELLED - consumes sequence number)
    s2 = DiningSession(restaurant_id=r_id, table_id=t_ids[1], public_token=uuid.uuid4().hex, status="cancelled")
    db.add(s2); db.flush()
    b2_cancelled = Bill(
        restaurant_id=r_id, dining_session_id=s2.id, bill_number=f"BILL-2-{uuid.uuid4().hex[:4]}",
        invoice_number="INV/2026-27/000002", receipt_token=uuid.uuid4().hex, status="cancelled", currency="INR",
        subtotal=Decimal("200.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("210.00"), gst_enabled_snapshot=True
    )
    # Quick Sale 1: INV/2026-27/000003 (completed - shared sequence)
    qs3 = QuickSale(
        restaurant_id=r_id, order_number="QS-300", invoice_number="INV/2026-27/000003", public_token=uuid.uuid4().hex, idempotency_key=uuid.uuid4().hex,
        idempotency_request_hash="hash", sale_type="takeaway", source="takeaway", status="completed",
        subtotal=Decimal("150.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("157.50"), gst_enabled_snapshot=True,
        entered_by_staff_id=p3_gst_context["owner_gst_id"], entered_by_name="Owner", entered_by_role="owner"
    )
    # Bill 4: Non-GST Bill WITHOUT invoice_number (must be excluded from audit)
    s4 = DiningSession(restaurant_id=r_id, table_id=t_ids[2], public_token=uuid.uuid4().hex, status="paid")
    db.add(s4); db.flush()
    b4_no_inv = Bill(
        restaurant_id=r_id, dining_session_id=s4.id, bill_number=f"NGBILL-{uuid.uuid4().hex[:4]}",
        invoice_number=None, receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("50.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("50.00"), gst_enabled_snapshot=False
    )
    db.add_all([b1, b2_cancelled, qs3, b4_no_inv])
    db.commit()
    db.close()

    headers = {"Authorization": f"Bearer {p3_gst_context['token_owner_gst']}"}
    res_audit = client.get("/admin/gst/documents-issued?preset=today", headers=headers)
    assert res_audit.status_code == 200
    body = res_audit.json()
    audit = body["audit"]

    # 1. 000001, cancelled 000002, 000003 -> NO gap
    assert audit["issued_count"] == 3
    assert audit["cancelled_count"] == 1
    assert len(audit["sequence_gaps"]) == 0
    # 2. Non-GST bill without invoice_number excluded from audit records
    assert len(body["records"]) == 3


def test_documents_issued_multi_financial_year_no_false_gap(p3_gst_context):
    """Proves:
    1. Different financial year namespaces (INV/2025-26/ vs INV/2026-27/) are not compared as one sequence.
    2. Missing invoice 000002 in FY 2026-27 produces one needs_review gap.
    """
    db = SessionLocal()
    r_id = p3_gst_context["r_gst_id"]
    t_ids = p3_gst_context["t_ids"]

    # FY 2025-26 Invoice: INV/2025-26/000050
    s1 = DiningSession(restaurant_id=r_id, table_id=t_ids[0], public_token=uuid.uuid4().hex, status="paid")
    db.add(s1); db.flush()
    b_fy25 = Bill(
        restaurant_id=r_id, dining_session_id=s1.id, bill_number=f"BILL-OLD-{uuid.uuid4().hex[:4]}",
        invoice_number="INV/2025-26/000050", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("100.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("105.00"), gst_enabled_snapshot=True
    )
    # FY 2026-27 Invoices: INV/2026-27/000001 and INV/2026-27/000003 (Gap: 000002)
    s2 = DiningSession(restaurant_id=r_id, table_id=t_ids[1], public_token=uuid.uuid4().hex, status="paid")
    db.add(s2); db.flush()
    b_fy26_1 = Bill(
        restaurant_id=r_id, dining_session_id=s2.id, bill_number=f"BILL-NEW1-{uuid.uuid4().hex[:4]}",
        invoice_number="INV/2026-27/000001", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("200.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("210.00"), gst_enabled_snapshot=True
    )
    s3 = DiningSession(restaurant_id=r_id, table_id=t_ids[2], public_token=uuid.uuid4().hex, status="paid")
    db.add(s3); db.flush()
    b_fy26_3 = Bill(
        restaurant_id=r_id, dining_session_id=s3.id, bill_number=f"BILL-NEW3-{uuid.uuid4().hex[:4]}",
        invoice_number="INV/2026-27/000003", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        subtotal=Decimal("300.00"), discount_amount=Decimal("0.00"), total_amount=Decimal("315.00"), gst_enabled_snapshot=True
    )
    db.add_all([b_fy25, b_fy26_1, b_fy26_3])
    db.commit()
    db.close()

    headers = {"Authorization": f"Bearer {p3_gst_context['token_owner_gst']}"}
    res_audit = client.get("/admin/gst/documents-issued?preset=today", headers=headers)
    assert res_audit.status_code == 200
    audit = res_audit.json()["audit"]

    # 1. Total issued = 3
    assert audit["issued_count"] == 3
    # 2. Only 1 gap detected (for INV/2026-27/000002). INV/2025-26/000050 is not compared with INV/2026-27/000001 as a gap.
    assert len(audit["sequence_gaps"]) == 1
    gap = audit["sequence_gaps"][0]
    assert gap["gap_from"] == "INV/2026-27/000002"
    assert gap["gap_to"] == "INV/2026-27/000002"
    assert gap["status"] == "needs_review"


def test_cancelled_documents_register(p3_gst_context):
    """Test Cancelled Documents Register (Bill.status == 'cancelled')."""
    db = SessionLocal()
    r_id = p3_gst_context["r_gst_id"]
    t_id = p3_gst_context["t_ids"][0]

    s = DiningSession(restaurant_id=r_id, table_id=t_id, public_token=uuid.uuid4().hex, status="cancelled")
    db.add(s); db.flush()
    b_cancel = Bill(
        restaurant_id=r_id, dining_session_id=s.id, bill_number=f"CAN-BILL-{uuid.uuid4().hex[:4]}",
        invoice_number="INV-0099", receipt_token=uuid.uuid4().hex, status="cancelled", currency="INR",
        subtotal=Decimal("300.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("300.00"),
        tax_amount=Decimal("15.00"), cgst_amount=Decimal("7.50"), sgst_amount=Decimal("7.50"), igst_amount=Decimal("0.00"),
        total_amount=Decimal("315.00"), gst_enabled_snapshot=True
    )
    db.add(b_cancel)
    db.commit()
    db.close()

    headers = {"Authorization": f"Bearer {p3_gst_context['token_owner_gst']}"}
    res_can = client.get("/admin/gst/cancelled-documents?preset=today", headers=headers)
    assert res_can.status_code == 200
    b_can = res_can.json()
    assert b_can["pagination"]["total_records"] == 1
    assert b_can["records"][0]["cancellation_status"] == "cancelled"


def test_gst_disabled_behavior_and_permissions(p3_gst_context):
    """Test Phase 3 register endpoints for GST-disabled restaurant and RBAC permissions."""
    # 1. GST-disabled restaurant returns clean disabled response
    headers_no_gst = {"Authorization": f"Bearer {p3_gst_context['token_owner_no_gst']}"}
    res_no_gst = client.get("/admin/gst/sales-register?preset=today", headers=headers_no_gst)
    assert res_no_gst.status_code == 200
    assert res_no_gst.json()["gst_enabled"] is False

    # 2. Staff role denied 403
    headers_staff = {"Authorization": f"Bearer {p3_gst_context['token_staff_gst']}"}
    res_staff = client.get("/admin/gst/sales-register?preset=today", headers=headers_staff)
    assert res_staff.status_code == 403

    # 3. Admin role allowed 200 OK
    headers_admin = {"Authorization": f"Bearer {p3_gst_context['token_admin_gst']}"}
    res_admin = client.get("/admin/gst/sales-register?preset=today", headers=headers_admin)
    assert res_admin.status_code == 200
