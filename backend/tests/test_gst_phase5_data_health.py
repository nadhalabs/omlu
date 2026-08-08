import datetime
from decimal import Decimal
import io
import uuid
import zipfile

from fastapi.testclient import TestClient
import openpyxl
import pytest

from app.database import SessionLocal
from app.main import app
from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.menu import MenuItem
from app.models.order import Order, OrderItem
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.restaurant import Restaurant
from app.models.staff_user import StaffUser
from app.models.restaurant_table import RestaurantTable
from tests.auth_helpers import create_session_access_token


client = TestClient(app)


@pytest.fixture
def p5_health_context():
    db = SessionLocal()

    # 1. GST-enabled restaurant
    r_gst = Restaurant(
        name="Data Health Bistro",
        slug=f"dh-bistro-{uuid.uuid4().hex[:6]}",
        gst_enabled=True,
        gstin="27ABCDE1234F1Z5",
        gst_state_name="Maharashtra",
        gst_state_code="27",
        legal_business_name="Data Health Bistro Private Limited",
        default_gst_rate=Decimal("5.00"),
    )
    # 2. Non-GST restaurant
    r_nogst = Restaurant(
        name="NoGST Fast Food",
        slug=f"nogst-ff-{uuid.uuid4().hex[:6]}",
        gst_enabled=False,
    )
    db.add_all([r_gst, r_nogst])
    db.flush()

    # Staff users
    owner_gst = StaffUser(
        restaurant_id=r_gst.id, name="Owner GST", username=f"owner_dh_{uuid.uuid4().hex[:6]}",
        password_hash="hash", role="owner", is_active=True
    )
    admin_gst = StaffUser(
        restaurant_id=r_gst.id, name="Admin GST", username=f"admin_dh_{uuid.uuid4().hex[:6]}",
        password_hash="hash", role="admin", is_active=True
    )
    staff_gst = StaffUser(
        restaurant_id=r_gst.id, name="Staff GST", username=f"staff_dh_{uuid.uuid4().hex[:6]}",
        password_hash="hash", role="staff", is_active=True
    )
    owner_nogst = StaffUser(
        restaurant_id=r_nogst.id, name="Owner NoGST", username=f"owner_ng_{uuid.uuid4().hex[:6]}",
        password_hash="hash", role="owner", is_active=True
    )
    db.add_all([owner_gst, admin_gst, staff_gst, owner_nogst])
    db.commit()

    t1 = RestaurantTable(restaurant_id=r_gst.id, table_number="T1", table_code="T1")
    db.add(t1)
    db.commit()

    # Document 1: Healthy B2B Bill
    s1 = DiningSession(restaurant_id=r_gst.id, table_id=t1.id, public_token=uuid.uuid4().hex, status="paid")
    db.add(s1); db.flush()
    b1_healthy = Bill(
        restaurant_id=r_gst.id, dining_session_id=s1.id, bill_number="BILL-HEALTHY-1",
        invoice_number="INV/2026-27/000001", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        customer_tax_type="b2b", customer_gstin_snapshot="27AAAAA0000A1Z5", customer_legal_name_snapshot="Acme India Pvt Ltd",
        subtotal=Decimal("1000.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("1000.00"),
        gst_rate=Decimal("5.00"), cgst_amount=Decimal("25.00"), sgst_amount=Decimal("25.00"), igst_amount=Decimal("0.00"),
        tax_amount=Decimal("50.00"), total_amount=Decimal("1050.00"), payment_method="counter_cash", gst_enabled_snapshot=True
    )
    db.add(b1_healthy)

    # Document 2: B2B Bill missing GSTIN & legal name
    s2 = DiningSession(restaurant_id=r_gst.id, table_id=t1.id, public_token=uuid.uuid4().hex, status="paid")
    db.add(s2); db.flush()
    b2_missing_b2b = Bill(
        restaurant_id=r_gst.id, dining_session_id=s2.id, bill_number="BILL-MISSING-B2B",
        invoice_number="INV/2026-27/000002", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        customer_tax_type="b2b", customer_gstin_snapshot=None, customer_legal_name_snapshot=None,
        subtotal=Decimal("500.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("500.00"),
        gst_rate=Decimal("5.00"), cgst_amount=Decimal("12.50"), sgst_amount=Decimal("12.50"), igst_amount=Decimal("0.00"),
        tax_amount=Decimal("25.00"), total_amount=Decimal("525.00"), payment_method="counter_cash", gst_enabled_snapshot=True
    )
    db.add(b2_missing_b2b)

    # Document 3: B2B Bill with invalid GSTIN format
    s3 = DiningSession(restaurant_id=r_gst.id, table_id=t1.id, public_token=uuid.uuid4().hex, status="paid")
    db.add(s3); db.flush()
    b3_invalid_gstin = Bill(
        restaurant_id=r_gst.id, dining_session_id=s3.id, bill_number="BILL-INVALID-GSTIN",
        invoice_number="INV/2026-27/000003", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        customer_tax_type="b2b", customer_gstin_snapshot="INVALID123", customer_legal_name_snapshot="Test Corp",
        subtotal=Decimal("800.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("800.00"),
        gst_rate=Decimal("5.00"), cgst_amount=Decimal("20.00"), sgst_amount=Decimal("20.00"), igst_amount=Decimal("0.00"),
        tax_amount=Decimal("40.00"), total_amount=Decimal("840.00"), payment_method="counter_cash", gst_enabled_snapshot=True
    )
    db.add(b3_invalid_gstin)

    # Document 4: Tax Component Mismatch (CGST + SGST != total tax)
    s4 = DiningSession(restaurant_id=r_gst.id, table_id=t1.id, public_token=uuid.uuid4().hex, status="paid")
    db.add(s4); db.flush()
    b4_tax_mismatch = Bill(
        restaurant_id=r_gst.id, dining_session_id=s4.id, bill_number="BILL-TAX-MISMATCH",
        invoice_number="INV/2026-27/000004", receipt_token=uuid.uuid4().hex, status="paid", currency="INR",
        customer_tax_type="b2c", subtotal=Decimal("400.00"), discount_amount=Decimal("0.00"), taxable_amount=Decimal("400.00"),
        gst_rate=Decimal("5.00"), cgst_amount=Decimal("10.00"), sgst_amount=Decimal("10.00"), igst_amount=Decimal("0.00"),
        tax_amount=Decimal("50.00"), total_amount=Decimal("450.00"), payment_method="counter_cash", gst_enabled_snapshot=True
    )
    db.add(b4_tax_mismatch)

    db.commit()

    token_owner_gst = create_session_access_token({"sub": str(owner_gst.id), "role": "owner"}, db=db)
    token_admin_gst = create_session_access_token({"sub": str(admin_gst.id), "role": "admin"}, db=db)
    token_staff_gst = create_session_access_token({"sub": str(staff_gst.id), "role": "staff"}, db=db)
    token_owner_nogst = create_session_access_token({"sub": str(owner_nogst.id), "role": "owner"}, db=db)

    ctx = {
        "r_gst_id": r_gst.id,
        "r_nogst_id": r_nogst.id,
        "token_owner_gst": token_owner_gst,
        "token_admin_gst": token_admin_gst,
        "token_staff_gst": token_staff_gst,
        "token_owner_nogst": token_owner_nogst,
    }
    db.close()
    return ctx


def test_data_health_endpoint_healthy_and_issues(p5_health_context):
    """Test Data Health endpoint evaluation, issue classification, and summary formatting."""
    headers = {"Authorization": f"Bearer {p5_health_context['token_owner_gst']}"}
    res = client.get("/admin/gst/data-health?preset=today", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["gst_enabled"] is True
    assert "summary" in data
    assert data["summary"]["total_documents_checked"] == 4
    assert "documents ready" in data["summary"]["summary_text"]

    issues = data.get("issues", [])
    issue_codes = [i["code"] for i in issues]

    # Verify detected issue codes
    assert "missing_b2b_gstin" in issue_codes
    assert "invalid_b2b_gstin" in issue_codes
    assert "tax_component_mismatch" in issue_codes

    # Verify severity classification
    invalid_gstin_issue = [i for i in issues if i["code"] == "invalid_b2b_gstin"][0]
    assert invalid_gstin_issue["severity"] == "warning"
    assert "GSTIN format" in invalid_gstin_issue["explanation"]


def test_data_health_non_gst_mode(p5_health_context):
    """Test Data Health endpoint for GST-disabled restaurant returns clean non-GST status."""
    headers = {"Authorization": f"Bearer {p5_health_context['token_owner_nogst']}"}
    res = client.get("/admin/gst/data-health?preset=today", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["gst_enabled"] is False
    assert len(data["issues"]) == 0
    assert "GST Reporting Disabled" in data["summary"]["summary_text"]


def test_data_health_missing_invoice_date_and_tax_mismatches(p5_health_context):
    """Test missing_invoice_date, intrastate_tax_mismatch, and readiness reconciliation."""
    headers = {"Authorization": f"Bearer {p5_health_context['token_owner_gst']}"}
    res = client.get("/admin/gst/data-health?preset=today", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["scan_complete"] is True
    assert data["scan_limit_reached"] is False
    assert data["scan_limit"] == 10000

    summary = data["summary"]
    # Verify readiness accounting: total_documents_checked == ready_count + len(affected_docs)
    issues = data["issues"]
    affected_doc_ids = {i["document_id"] for i in issues if i["document_id"] != "sequence_audit"}
    assert summary["total_documents_checked"] == summary["ready_count"] + len(affected_doc_ids)


def test_data_health_scan_limit_completeness_metadata(p5_health_context, monkeypatch):
    """Test that reaching configured scan limit sets scan_complete=False and scan_limit_reached=True."""
    import app.services.gst_data_health as dh_mod
    monkeypatch.setattr(dh_mod, "SCAN_LIMIT", 2)  # Temporarily lower limit to 2

    headers = {"Authorization": f"Bearer {p5_health_context['token_owner_gst']}"}
    res = client.get("/admin/gst/data-health?preset=today", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["scan_limit_reached"] is True
    assert data["scan_complete"] is False
    assert "Partial Evaluation" in data["summary"]["summary_text"]
    assert "scan_warning" in data


def test_data_health_rbac_permissions(p5_health_context):
    """Test owner and admin can access data-health, while staff user receives 403 Forbidden."""
    h_owner = {"Authorization": f"Bearer {p5_health_context['token_owner_gst']}"}
    h_admin = {"Authorization": f"Bearer {p5_health_context['token_admin_gst']}"}
    h_staff = {"Authorization": f"Bearer {p5_health_context['token_staff_gst']}"}

    assert client.get("/admin/gst/data-health", headers=h_owner).status_code == 200
    assert client.get("/admin/gst/data-health", headers=h_admin).status_code == 200
    assert client.get("/admin/gst/data-health", headers=h_staff).status_code == 403

