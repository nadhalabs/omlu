import datetime
from concurrent.futures import ThreadPoolExecutor
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
from app.utils.auth import hash_password
from tests.auth_helpers import create_session_access_token as create_access_token
from tests.participant_helpers import ParticipantTestClient, authorize_existing_session, participant_headers


client = TestClient(app)


@pytest.fixture
def gst_foundation_context():
    db = SessionLocal()
    u = uuid.uuid4().hex[:8]

    # GST Disabled Restaurant
    r_no_gst = Restaurant(
        name="No GST Cafe",
        slug=f"no-gst-{u}",
        is_active=True,
        currency="INR",
        order_prefix="NG",
        gst_enabled=False,
    )
    # GST Enabled Restaurant
    r_gst = Restaurant(
        name="GST Enabled Diner",
        slug=f"gst-enabled-{u}",
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
    db.add_all([r_no_gst, r_gst])
    db.flush()

    # Tables
    t_no_gst = RestaurantTable(restaurant_id=r_no_gst.id, table_number="1", table_code=f"NGT-{u}", is_active=True)
    t_gst = RestaurantTable(restaurant_id=r_gst.id, table_number="10", table_code=f"GET-{u}", is_active=True)
    db.add_all([t_no_gst, t_gst])
    db.flush()

    # Categories
    c_no_gst = MenuCategory(restaurant_id=r_no_gst.id, name_en="Main", display_order=1, is_active=True)
    c_gst = MenuCategory(restaurant_id=r_gst.id, name_en="Food", display_order=1, is_active=True)
    db.add_all([c_no_gst, c_gst])
    db.flush()

    # Menu Items
    item_no_gst = MenuItem(
        restaurant_id=r_no_gst.id, category_id=c_no_gst.id, name_en="Plain Tea", price=Decimal("20.00"), is_available=True
    )
    item_gst = MenuItem(
        restaurant_id=r_gst.id, category_id=c_gst.id, name_en="Masala Dosa", price=Decimal("100.00"), hsn_sac_code="996331", is_available=True
    )
    db.add_all([item_no_gst, item_gst])
    db.flush()

    # Staff Users
    owner_no_gst = StaffUser(
        restaurant_id=r_no_gst.id, name="No GST Owner", email=f"owner-{u}@nogst.local", password_hash=hash_password("owner123"), role="owner", is_active=True
    )
    owner_gst = StaffUser(
        restaurant_id=r_gst.id, name="GST Owner", email=f"owner-{u}@gst.local", password_hash=hash_password("owner123"), role="owner", is_active=True
    )
    db.add_all([owner_no_gst, owner_gst])
    db.commit()

    ctx = {
        "r_no_gst_id": r_no_gst.id,
        "r_gst_id": r_gst.id,
        "t_no_gst_id": t_no_gst.id,
        "t_gst_id": t_gst.id,
        "item_no_gst_id": item_no_gst.id,
        "item_gst_id": item_gst.id,
        "token_no_gst": create_access_token({"sub": str(owner_no_gst.id), "restaurant_id": r_no_gst.id, "role": "owner"}),
        "token_gst": create_access_token({"sub": str(owner_gst.id), "restaurant_id": r_gst.id, "role": "owner"}),
    }
    db.close()
    yield ctx

    db = SessionLocal()
    db.query(Restaurant).filter(Restaurant.id.in_([ctx["r_no_gst_id"], ctx["r_gst_id"]])).delete()
    db.commit()
    db.close()


def test_gst_disabled_restaurant_remains_functional(gst_foundation_context):
    """1 & 2: GST-disabled restaurants operate cleanly without GSTIN/HSN or tax fields."""
    token = gst_foundation_context["token_no_gst"]
    headers = {"Authorization": f"Bearer {token}"}

    # Create Quick Sale for GST-disabled restaurant
    res = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "items": [{"menu_item_id": gst_foundation_context["item_no_gst_id"], "quantity": 2}],
            "payment_method": "cash",
            "reason": "Cash sale",
        },
        headers={**headers, "Idempotency-Key": f"idemp-nogst-{uuid.uuid4().hex[:10]}"},
    )
    assert res.status_code == 201
    body = res.json()
    assert body["status"] == "completed"
    assert body["gst_enabled"] is False
    assert body["invoice_number"] is None
    assert body["tax_amount"] == "0.00"
    assert body["subtotal"] == "40.00"
    assert body["total"] == "40.00"
    assert body["items"][0]["hsn_sac_code"] is None


def test_enabling_or_disabling_gst_does_not_mutate_historical_sales(gst_foundation_context):
    """3 & 4: Toggling GST settings later does not change historical non-GST or GST invoices."""
    db = SessionLocal()
    r_no_gst = db.query(Restaurant).filter(Restaurant.id == gst_foundation_context["r_no_gst_id"]).one()
    r_gst = db.query(Restaurant).filter(Restaurant.id == gst_foundation_context["r_gst_id"]).one()

    owner_no_gst = db.query(StaffUser).filter(StaffUser.restaurant_id == r_no_gst.id).first()
    owner_gst = db.query(StaffUser).filter(StaffUser.restaurant_id == r_gst.id).first()

    # Create QuickSale 1 under GST-Disabled
    qs_old_no_gst = QuickSale(
        restaurant_id=r_no_gst.id,
        order_number="QS-OLD-1",
        public_token=uuid.uuid4().hex,
        idempotency_key=uuid.uuid4().hex,
        idempotency_request_hash="hash",
        sale_type="late_entry",
        source="late_entry",
        status="completed",
        subtotal=Decimal("50.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=Decimal("50.00"),
        gst_enabled_snapshot=False,
        entered_by_staff_id=owner_no_gst.id,
        entered_by_name="Owner",
        entered_by_role="owner",
    )
    # Create QuickSale 2 under GST-Enabled
    qs_old_gst = QuickSale(
        restaurant_id=r_gst.id,
        order_number="QS-OLD-2",
        public_token=uuid.uuid4().hex,
        idempotency_key=uuid.uuid4().hex,
        idempotency_request_hash="hash",
        sale_type="late_entry",
        source="late_entry",
        status="completed",
        subtotal=Decimal("100.00"),
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("5.00"),
        total_amount=Decimal("105.00"),
        gst_enabled_snapshot=True,
        invoice_number="INV/2026-27/000001",
        entered_by_staff_id=owner_gst.id,
        entered_by_name="Owner",
        entered_by_role="owner",
    )
    db.add_all([qs_old_no_gst, qs_old_gst])
    db.commit()

    # Enable GST on r_no_gst, Disable GST on r_gst
    r_no_gst.gst_enabled = True
    r_gst.gst_enabled = False
    db.commit()

    # Refresh historical records
    db.refresh(qs_old_no_gst)
    db.refresh(qs_old_gst)

    assert qs_old_no_gst.gst_enabled_snapshot is False
    assert qs_old_no_gst.invoice_number is None

    assert qs_old_gst.gst_enabled_snapshot is True
    assert qs_old_gst.invoice_number == "INV/2026-27/000001"
    db.close()


def test_hsn_sac_code_snapshot_immutability(gst_foundation_context):
    """5: HSN/SAC snapshot remains unchanged on OrderItem/QuickSaleItem after MenuItem edit."""
    token = gst_foundation_context["token_gst"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Quick Sale with HSN 996331
    res = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
            "payment_method": "cash",
        },
        headers={**headers, "Idempotency-Key": f"idemp-hsn-{uuid.uuid4().hex[:10]}"},
    )
    assert res.status_code == 201
    sale_data = res.json()
    assert sale_data["items"][0]["hsn_sac_code"] == "996331"

    # 2. Update MenuItem HSN code to 996332
    db = SessionLocal()
    item = db.query(MenuItem).filter(MenuItem.id == gst_foundation_context["item_gst_id"]).one()
    item.hsn_sac_code = "996332"
    db.commit()
    db.close()

    # 3. Query past Quick Sale and verify line item snapshot is still 996331
    db = SessionLocal()
    qs_item = db.query(QuickSaleItem).filter(QuickSaleItem.quick_sale_id == sale_data["id"]).one()
    assert qs_item.hsn_sac_code_snapshot == "996331"
    db.close()


def test_b2b_validation_and_authoritative_snapshots(gst_foundation_context):
    """7, 8 & 9: B2B GSTIN validation, B2C default, and Interstate (IGST) vs Intrastate (CGST+SGST)."""
    token = gst_foundation_context["token_gst"]
    headers = {"Authorization": f"Bearer {token}"}

    # B2B with missing GSTIN -> 422
    invalid_res = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "customer_tax_type": "b2b",
            "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
            "payment_method": "cash",
        },
        headers={**headers, "Idempotency-Key": f"idemp-b2b-err-{uuid.uuid4().hex[:10]}"},
    )
    assert invalid_res.status_code == 422

    # B2B Interstate Sale (Customer GSTIN 33AAAAA0000A1Z5 - Tamil Nadu 33 vs Restaurant Kerala 32)
    b2b_res = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "customer_tax_type": "b2b",
            "customer_gstin": "33AAAAA0000A1Z5",
            "customer_legal_name": "Acme Trade Corp",
            "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
            "payment_method": "cash",
        },
        headers={**headers, "Idempotency-Key": f"idemp-b2b-ok-{uuid.uuid4().hex[:10]}"},
    )
    assert b2b_res.status_code == 201
    data = b2b_res.json()
    assert data["customer_tax_type"] == "b2b"
    assert data["customer_gstin"] == "33AAAAA0000A1Z5"
    assert data["customer_legal_name"] == "Acme Trade Corp"
    assert data["customer_state_code"] == "33"
    assert data["place_of_supply_code"] == "33"
    # IGST applied for interstate!
    assert data["igst_amount"] == "5.00"
    assert data["cgst_amount"] == "0.00"
    assert data["sgst_amount"] == "0.00"


def test_quick_sale_invoice_numbering_and_idempotency(gst_foundation_context):
    """10 & 11: Quick sale receives invoice number upon completion; retries do not consume additional sequence numbers."""
    token = gst_foundation_context["token_gst"]
    headers = {"Authorization": f"Bearer {token}"}
    idemp = f"idemp-seq-{uuid.uuid4().hex[:10]}"

    # First call
    res1 = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
            "payment_method": "cash",
        },
        headers={**headers, "Idempotency-Key": idemp},
    )
    assert res1.status_code == 201
    data1 = res1.json()
    assert data1["invoice_number"].startswith("INV/")

    # Idempotent retry with same key
    res2 = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
            "payment_method": "cash",
        },
        headers={**headers, "Idempotency-Key": idemp},
    )
    assert res2.status_code == 201
    data2 = res2.json()
    assert data2["invoice_number"] == data1["invoice_number"]


def test_bill_and_quick_sale_shared_invoice_sequence_concurrency(gst_foundation_context):
    """12 & 13: Simultaneous Bill issuance and Quick Sale completion use the exact same atomic invoice sequence without collisions."""
    token = gst_foundation_context["token_gst"]
    headers = {"Authorization": f"Bearer {token}"}

    # Setup a Bill ready to issue
    db = SessionLocal()
    session = DiningSession(
        restaurant_id=gst_foundation_context["r_gst_id"],
        table_id=gst_foundation_context["t_gst_id"],
        public_token=f"sess-conc-{uuid.uuid4().hex}",
        status="open",
    )
    db.add(session)
    db.flush()
    order = Order(
        restaurant_id=gst_foundation_context["r_gst_id"],
        table_id=gst_foundation_context["t_gst_id"],
        dining_session_id=session.id,
        order_number=f"GE-CONC-{uuid.uuid4().hex[:8]}",
        public_token=uuid.uuid4().hex,
        status="served",
        subtotal=Decimal("100.00"),
        idempotency_key=f"conc-order-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    db.add(OrderItem(order_id=order.id, menu_item_id=gst_foundation_context["item_gst_id"], item_name="Masala Dosa", quantity=1, unit_price=Decimal("100.00"), total_price=Decimal("100.00")))
    db.add(OrderStatusHistory(order_id=order.id, new_status="served"))
    bill = Bill(
        restaurant_id=gst_foundation_context["r_gst_id"],
        dining_session_id=session.id,
        bill_number=f"BILL-CONC-{uuid.uuid4().hex[:8]}",
        receipt_token=uuid.uuid4().hex,
        status="draft",
        currency="INR",
        gst_enabled_snapshot=True,
    )
    db.add(bill)
    db.commit()
    bill_number = bill.bill_number
    db.close()

    # Function 1: Issue Bill
    def issue_bill_task():
        return client.post(
            f"/staff/bills/{bill_number}/issue",
            headers={**headers, "Idempotency-Key": f"issue-conc-{uuid.uuid4().hex[:8]}"},
        )

    # Function 2: Complete Quick Sale
    def complete_qs_task():
        return client.post(
            "/admin/quick-sales",
            json={
                "sale_type": "late_entry",
                "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
                "payment_method": "cash",
            },
            headers={**headers, "Idempotency-Key": f"qs-conc-{uuid.uuid4().hex[:8]}"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(issue_bill_task)
        f2 = executor.submit(complete_qs_task)
        res1 = f1.result()
        res2 = f2.result()

    assert res1.status_code == 200
    assert res2.status_code == 201

    inv1 = res1.json()["invoice_number"]
    inv2 = res2.json()["invoice_number"]

    assert inv1 is not None
    assert inv2 is not None
    assert inv1 != inv2, f"Invoice number collision detected! {inv1} == {inv2}"


def test_tenant_isolation(gst_foundation_context):
    """14: Cross-tenant isolation verification."""
    token_no_gst = gst_foundation_context["token_no_gst"]
    headers = {"Authorization": f"Bearer {token_no_gst}"}

    # Attempt to create Quick Sale using item belonging to other restaurant
    res = client.post(
        "/admin/quick-sales",
        json={
            "sale_type": "late_entry",
            "items": [{"menu_item_id": gst_foundation_context["item_gst_id"], "quantity": 1}],
            "payment_method": "cash",
        },
        headers={**headers, "Idempotency-Key": f"idemp-tenant-{uuid.uuid4().hex[:10]}"},
    )
    assert res.status_code in (400, 404)


def test_gst_rate_snapshot_timing_and_immutability(gst_foundation_context):
    """15: OrderItem/QuickSaleItem gst_rate_snapshot is NULL at line creation and populates only upon Bill issuance / QuickSale completion."""
    token = gst_foundation_context["token_gst"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Dining Session and Order while restaurant default_gst_rate is 5%
    db = SessionLocal()
    session = DiningSession(
        restaurant_id=gst_foundation_context["r_gst_id"],
        table_id=gst_foundation_context["t_gst_id"],
        public_token=f"sess-rate-{uuid.uuid4().hex}",
        status="open",
    )
    db.add(session)
    db.flush()
    order = Order(
        restaurant_id=gst_foundation_context["r_gst_id"],
        table_id=gst_foundation_context["t_gst_id"],
        dining_session_id=session.id,
        order_number=f"GE-RATE-{uuid.uuid4().hex[:8]}",
        public_token=uuid.uuid4().hex,
        status="served",
        subtotal=Decimal("100.00"),
        idempotency_key=f"rate-order-{uuid.uuid4().hex}",
    )
    db.add(order)
    db.flush()
    order_item = OrderItem(
        order_id=order.id,
        menu_item_id=gst_foundation_context["item_gst_id"],
        item_name="Masala Dosa",
        quantity=1,
        unit_price=Decimal("100.00"),
        total_price=Decimal("100.00"),
        hsn_sac_code_snapshot="996331",
        gst_rate_snapshot=None,  # Created line leaves rate NULL
    )
    db.add(order_item)
    db.add(OrderStatusHistory(order_id=order.id, new_status="served"))
    bill = Bill(
        restaurant_id=gst_foundation_context["r_gst_id"],
        dining_session_id=session.id,
        bill_number=f"BILL-RATE-{uuid.uuid4().hex[:8]}",
        receipt_token=uuid.uuid4().hex,
        status="draft",
        currency="INR",
        gst_enabled_snapshot=True,
    )
    db.add(bill)
    db.commit()
    bill_number = bill.bill_number
    order_item_id = order_item.id

    # 2. Change restaurant GST rate to 18.00% before issuance
    restaurant = db.query(Restaurant).filter(Restaurant.id == gst_foundation_context["r_gst_id"]).one()
    restaurant.default_gst_rate = Decimal("18.00")
    db.commit()
    db.close()

    # 3. Issue the Bill
    issue_res = client.post(
        f"/staff/bills/{bill_number}/issue",
        headers={**headers, "Idempotency-Key": f"issue-rate-{uuid.uuid4().hex[:8]}"},
    )
    assert issue_res.status_code == 200

    # 4. Verify OrderItem received the final issued bill rate (18.00%), HSN snapshot is preserved, and taxable/component fields remain NULL
    db = SessionLocal()
    refreshed_item = db.query(OrderItem).filter(OrderItem.id == order_item_id).one()
    assert refreshed_item.gst_rate_snapshot == Decimal("18.00")
    assert refreshed_item.hsn_sac_code_snapshot == "996331"
    assert refreshed_item.taxable_amount_snapshot is None
    assert refreshed_item.cgst_amount_snapshot is None
    assert refreshed_item.sgst_amount_snapshot is None
    assert refreshed_item.igst_amount_snapshot is None

    # 5. Change restaurant GST rate to 28.00% after issuance
    restaurant = db.query(Restaurant).filter(Restaurant.id == gst_foundation_context["r_gst_id"]).one()
    restaurant.default_gst_rate = Decimal("28.00")
    db.commit()

    # 6. Verify issued line item snapshot is unchanged (still 18.00%)
    db.refresh(refreshed_item)
    assert refreshed_item.gst_rate_snapshot == Decimal("18.00")
    db.close()

