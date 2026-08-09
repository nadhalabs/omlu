import datetime
import json
import secrets
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.menu import MenuItem, MenuItemOptionGroup, MenuOptionGroup
from app.models.restaurant import Restaurant
from app.models.quick_sale import QuickSale, QuickSaleItem, QuickSaleItemSelectedOption
from app.models.order import RestaurantDailySequence
from app.models.staff_user import AuditLog, StaffUser
from app.models.payment import Payment, RevenueEntry
from app.schemas.order import PublicOrderCreateRequest
from app.schemas.quick_sale import QuickSaleCreate, QuickSalePayment
from app.schemas.bill import BillResponse, ReceiptPayloadResponse
from app.services.menu_options import serialize_item_option_groups
from app.services.order_pricing import validate_and_price_order_items
from app.services.idempotency import ensure_same_request, request_hash, require_key
from app.services.bills import calculate_gst_totals, generate_invoice_number
from app.services.realtime import EVENT_ORDER_CREATED, EVENT_QUICK_SALE_COMPLETED, publish_event, restaurant_channel
from app.utils.auth import RoleChecker
from app.utils.business_date import current_business_day_bounds_utc, restaurant_business_date
from app.utils.gst import GST_STATE_NAMES

router = APIRouter(prefix="/admin/quick-sales")
_owner_admin = RoleChecker(["owner", "admin"])


def _serialize(sale: QuickSale, *, financial: bool = True) -> dict:
    result = {
        "id": sale.id, "order_number": sale.order_number, "public_token": sale.public_token,
        "sale_type": sale.sale_type, "source": sale.source, "status": sale.status,
        "note": sale.note, "reason": sale.reason, "subtotal": f"{sale.subtotal:.2f}",
        "discount_amount": f"{sale.discount_amount:.2f}",
        "taxable_amount": f"{sale.taxable_amount:.2f}" if sale.taxable_amount is not None else None,
        "gst_enabled": sale.gst_enabled_snapshot,
        "invoice_number": sale.invoice_number,
        "invoice_date": sale.invoice_date.isoformat() if sale.invoice_date else None,
        "gst_rate": f"{sale.gst_rate:.2f}" if sale.gst_rate is not None else None,
        "cgst_amount": f"{sale.cgst_amount:.2f}" if sale.cgst_amount is not None else None,
        "sgst_amount": f"{sale.sgst_amount:.2f}" if sale.sgst_amount is not None else None,
        "igst_amount": f"{sale.igst_amount:.2f}" if sale.igst_amount is not None else None,
        "tax_amount": f"{sale.tax_amount:.2f}", "tax_mode": sale.tax_mode_snapshot,
        "gstin": sale.gstin_snapshot, "legal_business_name": sale.legal_business_name_snapshot,
        "registered_billing_address": sale.billing_address_snapshot,
        "state_name": sale.state_name_snapshot, "state_code": sale.state_code_snapshot,
        "customer_tax_type": sale.customer_tax_type,
        "customer_gstin": sale.customer_gstin_snapshot,
        "customer_legal_name": sale.customer_legal_name_snapshot,
        "customer_billing_address": sale.customer_billing_address_snapshot,
        "customer_state_code": sale.customer_state_code_snapshot,
        "customer_state_name": sale.customer_state_name_snapshot,
        "place_of_supply_code": sale.place_of_supply_code_snapshot,
        "total": f"{sale.total_amount:.2f}", "grand_total": f"{sale.total_amount:.2f}", "entered_by_id": sale.entered_by_staff_id,
        "entered_by_name": sale.entered_by_name, "entered_by_role": sale.entered_by_role,
        "created_at": sale.created_at.isoformat(), "completed_at": sale.completed_at.isoformat() if sale.completed_at else None,
        "items": [{
            "menu_item_id": item.menu_item_id,
            "item_name": item.item_name,
            "quantity": item.quantity,
            "base_price": f"{item.base_price:.2f}",
            "unit_price": f"{item.unit_price:.2f}",
            "total_price": f"{item.total_price:.2f}",
            "item_note": item.item_note,
            "hsn_sac_code": item.hsn_sac_code_snapshot,
            "gst_rate": f"{item.gst_rate_snapshot:.2f}" if item.gst_rate_snapshot is not None else None,
            "selected_options": [{
                "menu_option_id": option.menu_option_id,
                "menu_option_group_id": option.menu_option_group_id,
                "option_name": option.option_name,
                "kitchen_display_name": option.kitchen_display_name,
                "group_name": option.group_name,
                "option_type": option.option_type,
                "price_delta": f"{option.price_delta:.2f}",
                "quantity": option.quantity,
            } for option in item.selected_options],
        } for item in sale.items],
    }
    if financial:
        result.update({"payment_method": sale.payment_method, "paid_by_name": sale.paid_by_name, "paid_by_role": sale.paid_by_role})
    return result


def _completed_takeaway(db: Session, current_user: StaffUser, public_token: str) -> tuple[QuickSale, Restaurant]:
    sale = db.query(QuickSale).options(
        selectinload(QuickSale.items).selectinload(QuickSaleItem.selected_options)
    ).filter(
        QuickSale.restaurant_id == current_user.restaurant_id,
        QuickSale.public_token == public_token,
    ).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Quick Sale not found")
    if sale.sale_type != "takeaway" or sale.status != "completed":
        raise HTTPException(status_code=409, detail="Only completed Takeaway receipts can be printed")
    restaurant = db.query(Restaurant).filter(Restaurant.id == sale.restaurant_id).one()
    return sale, restaurant


def _quick_sale_print_document(sale: QuickSale, restaurant: Restaurant) -> dict:
    items = [{
        "item_name": item.item_name,
        "quantity": item.quantity,
        "unit_price": item.unit_price,
        "line_total": item.total_price,
        "selected_options": [{
            "menu_option_id": option.menu_option_id,
            "menu_option_group_id": option.menu_option_group_id,
            "option_name": option.option_name,
            "kitchen_display_name": option.kitchen_display_name,
            "group_name": option.group_name,
            "option_type": option.option_type,
            "price_delta": option.price_delta,
            "quantity": option.quantity,
        } for option in item.selected_options],
    } for item in sale.items]
    completed_at = sale.completed_at or sale.created_at
    return {
        "bill_number": sale.order_number,
        "receipt_token": sale.public_token,
        "restaurant_name": restaurant.name,
        "restaurant_slug": restaurant.slug,
        "table_number": "Takeaway",
        "table_code": "takeaway",
        "session_token": sale.public_token,
        "status": "paid",
        "orders": [{"order_number": sale.order_number, "status": "served", "subtotal": sale.subtotal, "items": items}],
        "subtotal": sale.subtotal,
        "tax_amount": sale.tax_amount,
        "discount_amount": sale.discount_amount,
        "total_amount": sale.total_amount,
        "currency": restaurant.currency,
        "generated_at": completed_at,
        "paid_at": completed_at,
        "payment_method": f"counter_{sale.payment_method}" if sale.payment_method else None,
        "payment_reference": None,
        "paid_by_staff_id": sale.paid_by_staff_id,
        "generated_by_role": sale.entered_by_role,
        "sent_to_counter_by_role": None,
        "gst_enabled": sale.gst_enabled_snapshot,
        "invoice_number": sale.invoice_number,
        "invoice_date": sale.invoice_date,
        "taxable_amount": sale.taxable_amount,
        "gst_rate": sale.gst_rate,
        "cgst_amount": sale.cgst_amount,
        "sgst_amount": sale.sgst_amount,
        "igst_amount": sale.igst_amount,
        "tax_mode": sale.tax_mode_snapshot,
        "gstin": sale.gstin_snapshot,
        "legal_business_name": sale.legal_business_name_snapshot,
        "registered_billing_address": sale.billing_address_snapshot,
        "state_name": sale.state_name_snapshot,
        "state_code": sale.state_code_snapshot,
        "customer_tax_type": sale.customer_tax_type,
        "customer_gstin_snapshot": sale.customer_gstin_snapshot,
        "customer_legal_name_snapshot": sale.customer_legal_name_snapshot,
        "customer_billing_address_snapshot": sale.customer_billing_address_snapshot,
        "customer_state_code_snapshot": sale.customer_state_code_snapshot,
        "customer_state_name_snapshot": sale.customer_state_name_snapshot,
        "place_of_supply_code_snapshot": sale.place_of_supply_code_snapshot,
        "session_status": "closed",
        "amount_due": sale.total_amount,
        "original_table": "Takeaway",
        "issued_at": completed_at,
        "detached_session_status": "closed",
        "receipt_access": sale.public_token,
    }


def _quick_sale_receipt_payload(sale: QuickSale, restaurant: Restaurant) -> dict:
    document = _quick_sale_print_document(sale, restaurant)
    return {
        "bill_number": sale.order_number,
        "invoice_number": sale.invoice_number,
        "receipt_title": "PAYMENT RECEIPT",
        "status": "paid",
        "restaurant_name": restaurant.name,
        "legal_business_name": sale.legal_business_name_snapshot or restaurant.legal_business_name or restaurant.name,
        "address": sale.billing_address_snapshot or restaurant.registered_billing_address or "",
        "gstin": sale.gstin_snapshot,
        "state_name": sale.state_name_snapshot,
        "state_code": sale.state_code_snapshot,
        "customer_gstin": sale.customer_gstin_snapshot if sale.customer_tax_type == "b2b" else None,
        "customer_legal_name": sale.customer_legal_name_snapshot if sale.customer_tax_type == "b2b" else None,
        "customer_billing_address": sale.customer_billing_address_snapshot if sale.customer_tax_type == "b2b" else None,
        "customer_state_name": sale.customer_state_name_snapshot if sale.customer_tax_type == "b2b" else None,
        "customer_state_code": sale.customer_state_code_snapshot if sale.customer_tax_type == "b2b" else None,
        "table_number": "Takeaway",
        "staff_name": sale.entered_by_name,
        "created_at": sale.invoice_date or sale.completed_at or sale.created_at,
        "paid_at": sale.completed_at,
        "items": [{"name": item["item_name"], "quantity": item["quantity"], "unit_price": item["unit_price"], "line_total": item["line_total"], "options": [f'{option["group_name"]}: {option["option_name"]}' for option in item["selected_options"]]} for item in document["orders"][0]["items"]],
        "subtotal": sale.subtotal,
        "discount_amount": sale.discount_amount,
        "taxable_amount": sale.taxable_amount or Decimal("0.00"),
        "cgst_amount": sale.cgst_amount or Decimal("0.00"),
        "sgst_amount": sale.sgst_amount or Decimal("0.00"),
        "igst_amount": sale.igst_amount or Decimal("0.00"),
        "tax_amount": sale.tax_amount,
        "grand_total": sale.total_amount,
        "currency": restaurant.currency,
        "gst_enabled": sale.gst_enabled_snapshot,
        "tax_mode": sale.tax_mode_snapshot,
        "payment_method": sale.payment_method,
        "payment_status": "PAID",
        "is_official_invoice": True,
    }


def _audit(db: Session, actor: StaffUser, sale: QuickSale, action: str, details: dict) -> None:
    attribution = {
        "actor_id": actor.id,
        "actor_name": actor.name,
        "actor_username": actor.username,
        "actor_role": actor.role,
    }
    db.add(AuditLog(restaurant_id=actor.restaurant_id, actor_user_id=actor.id, actor_role=actor.role, target_type="quick_sale", target_id=str(sale.id), action=action, new_value=json.dumps({**attribution, **details})))


def _validate_workflow(body: QuickSaleCreate) -> None:
    if body.sale_type == "late_entry" and not body.payment_method:
        raise HTTPException(status_code=422, detail="Late Entry requires Cash or UPI payment confirmation")
    if body.sale_type == "takeaway" and body.payment_method:
        raise HTTPException(status_code=422, detail="Takeaway payment is confirmed only after the order is ready")


def _price_quick_sale(body: QuickSaleCreate, current_user: StaffUser, db: Session):
    _validate_workflow(body)
    subtotal, priced_items = validate_and_price_order_items(
        db,
        current_user.restaurant_id,
        PublicOrderCreateRequest(
            items=[item.model_dump() for item in body.items],
            customer_note=body.note,
        ),
    )
    restaurant = current_user.restaurant
    pos_code = body.place_of_supply_code or body.customer_state_code
    rest_state = restaurant.gst_state_code
    interstate = bool(pos_code and rest_state and pos_code.strip() != rest_state.strip())

    totals = calculate_gst_totals(
        subtotal=subtotal,
        discount_amount=Decimal("0.00"),
        gst_rate=restaurant.default_gst_rate if restaurant.gst_enabled else Decimal("0.00"),
        tax_mode=restaurant.tax_mode,
        interstate=interstate,
    )
    return totals, priced_items


def _serialize_preview(totals, current_user: StaffUser) -> dict:
    restaurant = current_user.restaurant
    component_rate = totals.gst_rate / Decimal("2")
    return {
        "subtotal": f"{totals.subtotal:.2f}",
        "discount_amount": f"{totals.discount_amount:.2f}",
        "taxable_amount": f"{totals.taxable_amount:.2f}",
        "gst_enabled": restaurant.gst_enabled,
        "gst_rate": f"{totals.gst_rate:.2f}",
        "cgst_rate": f"{component_rate:.2f}",
        "sgst_rate": f"{component_rate:.2f}",
        "igst_rate": f"{totals.gst_rate:.2f}",
        "cgst_amount": f"{totals.cgst_amount:.2f}",
        "sgst_amount": f"{totals.sgst_amount:.2f}",
        "igst_amount": f"{totals.igst_amount:.2f}",
        "tax_amount": f"{totals.tax_amount:.2f}",
        "tax_mode": restaurant.tax_mode,
        "grand_total": f"{totals.total_amount:.2f}",
    }


@router.get("")
def quick_sale_home(current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    start, end, _ = current_business_day_bounds_utc(current_user.restaurant)
    menu = db.query(MenuItem).options(
        selectinload(MenuItem.option_group_links)
        .selectinload(MenuItemOptionGroup.group)
        .selectinload(MenuOptionGroup.options)
    ).filter(MenuItem.restaurant_id == current_user.restaurant_id, MenuItem.is_available == True).order_by(MenuItem.name_en).all()
    sales = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(QuickSale.restaurant_id == current_user.restaurant_id).order_by(QuickSale.created_at.desc()).limit(100).all()
    return {
        "menu_items": [{
            "id": item.id,
            "name": item.name_en,
            "price": f"{item.price:.2f}",
            "has_options": any(
                link.active and link.group and link.group.active
                for link in item.option_group_links
            ),
            "option_groups": serialize_item_option_groups(item),
        } for item in menu],
        "active_takeaways": [_serialize(s) for s in sales if s.sale_type == "takeaway" and s.status != "completed"],
        "completed_today": [_serialize(s) for s in sales if s.status == "completed" and s.completed_at and start <= s.completed_at < end],
    }


@router.get("/{public_token}/print-document", response_model=BillResponse)
def get_quick_sale_print_document(public_token: str, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    sale, restaurant = _completed_takeaway(db, current_user, public_token)
    return _quick_sale_print_document(sale, restaurant)


@router.get("/{public_token}/receipt-payload", response_model=ReceiptPayloadResponse)
def get_quick_sale_receipt_payload(public_token: str, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    sale, restaurant = _completed_takeaway(db, current_user, public_token)
    return _quick_sale_receipt_payload(sale, restaurant)


@router.post("/preview")
def preview_quick_sale(
    body: QuickSaleCreate,
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    totals, _ = _price_quick_sale(body, current_user, db)
    return _serialize_preview(totals, current_user)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_quick_sale(
    body: QuickSaleCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    key = require_key(idempotency_key)
    payload_hash = request_hash(body.model_dump(mode="json"))
    existing = db.query(QuickSale).options(
        selectinload(QuickSale.items).selectinload(QuickSaleItem.selected_options)
    ).filter(QuickSale.restaurant_id == current_user.restaurant_id, QuickSale.idempotency_key == key).first()
    if existing:
        ensure_same_request(existing.idempotency_request_hash, payload_hash)
        return _serialize(existing)

    restaurant = current_user.restaurant
    customer_tax_type = body.customer_tax_type or "b2c"
    customer_gstin = body.customer_gstin
    customer_legal_name = body.customer_legal_name
    customer_billing_address = body.customer_billing_address
    customer_state_code = body.customer_state_code
    customer_state_name = body.customer_state_name
    place_of_supply_code = body.place_of_supply_code

    if restaurant.gst_enabled and customer_tax_type == "b2b":
        if not customer_gstin:
            raise HTTPException(status_code=422, detail="Customer GSTIN is required for B2B GST quick sales")
        if not customer_legal_name or not customer_legal_name.strip():
            raise HTTPException(status_code=422, detail="Customer Legal Name is required for B2B GST quick sales")
        if not customer_billing_address or not customer_billing_address.strip():
            raise HTTPException(status_code=422, detail="Customer Billing Address is required for B2B GST quick sales")
        if not customer_state_code:
            customer_state_code = customer_gstin[:2]
        if customer_state_code != customer_gstin[:2]:
            raise HTTPException(status_code=422, detail="Customer State Code must match the GSTIN")
        canonical_state_name = GST_STATE_NAMES.get(customer_state_code)
        if not canonical_state_name:
            raise HTTPException(status_code=422, detail="Customer State Code must be a valid Indian GST state code")
        if customer_state_name and customer_state_name.casefold() != canonical_state_name.casefold():
            raise HTTPException(status_code=422, detail="Customer State must match the GSTIN State Code")
        customer_state_name = canonical_state_name
        place_of_supply_code = customer_state_code

    body.customer_state_code = customer_state_code
    body.place_of_supply_code = place_of_supply_code

    totals, priced_items = _price_quick_sale(body, current_user, db)
    now = datetime.datetime.now(datetime.timezone.utc)
    is_completed = (body.sale_type == "late_entry")

    invoice_number = None
    invoice_date = None
    if restaurant.gst_enabled and is_completed:
        invoice_number, invoice_date = generate_invoice_number(db, restaurant, now=now)

    sale = QuickSale(
        restaurant_id=current_user.restaurant_id, order_number="PENDING", public_token=f"qs_{secrets.token_urlsafe(24)}",
        idempotency_key=key, idempotency_request_hash=payload_hash, sale_type=body.sale_type, source=body.sale_type,
        status="completed" if is_completed else "pending", note=body.note,
        reason=(body.reason or "Unrecorded verbal order") if body.sale_type == "late_entry" else None,
        subtotal=totals.subtotal, discount_amount=totals.discount_amount,
        taxable_amount=totals.taxable_amount, tax_amount=totals.tax_amount,
        gst_enabled_snapshot=restaurant.gst_enabled, gst_rate=totals.gst_rate,
        cgst_amount=totals.cgst_amount, sgst_amount=totals.sgst_amount,
        igst_amount=totals.igst_amount, total_amount=totals.total_amount,
        tax_mode_snapshot=restaurant.tax_mode,
        gstin_snapshot=restaurant.gstin if restaurant.gst_enabled else None,
        legal_business_name_snapshot=restaurant.legal_business_name if restaurant.gst_enabled else None,
        billing_address_snapshot=restaurant.registered_billing_address if restaurant.gst_enabled else None,
        state_name_snapshot=restaurant.gst_state_name if restaurant.gst_enabled else None,
        state_code_snapshot=restaurant.gst_state_code if restaurant.gst_enabled else None,
        customer_tax_type=customer_tax_type,
        customer_gstin_snapshot=customer_gstin if (restaurant.gst_enabled and customer_tax_type == "b2b") else None,
        customer_legal_name_snapshot=customer_legal_name if (restaurant.gst_enabled and customer_tax_type == "b2b") else None,
        customer_billing_address_snapshot=customer_billing_address if (restaurant.gst_enabled and customer_tax_type == "b2b") else None,
        customer_state_code_snapshot=customer_state_code if (restaurant.gst_enabled and customer_tax_type == "b2b") else None,
        customer_state_name_snapshot=customer_state_name if (restaurant.gst_enabled and customer_tax_type == "b2b") else None,
        place_of_supply_code_snapshot=place_of_supply_code if restaurant.gst_enabled else None,
        invoice_number=invoice_number,
        invoice_date=invoice_date,
        payment_method=body.payment_method,
        entered_by_staff_id=current_user.id, entered_by_name=current_user.name, entered_by_role=current_user.role,
        paid_by_staff_id=current_user.id if is_completed else None,
        paid_by_name=current_user.name if is_completed else None,
        paid_by_role=current_user.role if is_completed else None,
        completed_at=now if is_completed else None,
    )
    business_date = restaurant_business_date(current_user.restaurant, now=now)
    sequence = db.execute(
        pg_insert(RestaurantDailySequence)
        .values(
            restaurant_id=current_user.restaurant_id,
            sequence_date=business_date,
            last_value=1,
        )
        .on_conflict_do_update(
            constraint="uq_restaurant_daily_sequence_date",
            set_={"last_value": RestaurantDailySequence.last_value + 1},
        )
        .returning(RestaurantDailySequence.last_value)
    ).scalar_one()
    sale.order_number = f"QS-{business_date:%Y%m%d}-{sequence:04d}"
    db.add(sale); db.flush()
    for priced in priced_items:
        sale_item = QuickSaleItem(
            menu_item_id=priced.menu_item_id,
            category_id_snapshot=priced.category_id_snapshot,
            category_name_snapshot=priced.category_name_snapshot,
            item_name=priced.item_name,
            quantity=priced.quantity,
            base_price=priced.base_price,
            unit_price=priced.unit_price,
            total_price=priced.total_price,
            item_note=priced.item_note,
            hsn_sac_code_snapshot=priced.hsn_sac_code_snapshot,
            gst_rate_snapshot=sale.gst_rate if (is_completed and sale.gst_enabled_snapshot) else None,
        )
        for option in priced.selected_options:
            sale_item.selected_options.append(QuickSaleItemSelectedOption(
                menu_option_id=option.menu_option_id,
                menu_option_group_id=option.menu_option_group_id,
                option_name=option.option_name,
                kitchen_display_name=option.kitchen_display_name,
                group_name=option.group_name,
                option_type=option.option_type,
                price_delta=option.price_delta,
                quantity=option.quantity,
                display_order=option.display_order,
            ))
        sale.items.append(sale_item)
    _audit(db, current_user, sale, "quick_sale_created", {"type": sale.sale_type, "total": str(totals.total_amount), "payment_method": body.payment_method})
    if sale.status == "completed":
        payment = Payment(
            restaurant_id=current_user.restaurant_id,
            quick_sale_id=sale.id,
            idempotency_key=key,
            method=body.payment_method,
            amount=sale.total_amount,
            recorded_by_staff_id=current_user.id,
        )
        db.add(payment)
        db.flush()
        db.add(RevenueEntry(
            restaurant_id=current_user.restaurant_id,
            payment_id=payment.id,
            amount=sale.total_amount,
            currency=current_user.restaurant.currency,
            occurred_at=now,
        ))
        _audit(db, current_user, sale, "quick_sale_completed", {"payment_method": body.payment_method})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(QuickSale).options(
            selectinload(QuickSale.items).selectinload(QuickSaleItem.selected_options)
        ).filter(
            QuickSale.restaurant_id == current_user.restaurant_id,
            QuickSale.idempotency_key == key,
        ).first()
        if existing:
            ensure_same_request(existing.idempotency_request_hash, payload_hash)
            return _serialize(existing)
        raise
    db.refresh(sale)
    event = EVENT_QUICK_SALE_COMPLETED if sale.status == "completed" else EVENT_ORDER_CREATED
    channels = [restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), restaurant_channel(current_user.restaurant_id, "admin")]
    if sale.sale_type == "takeaway": channels.append(restaurant_channel(current_user.restaurant_id, "kitchen"))
    publish_event(event, restaurant_id=current_user.restaurant_id, channels=channels, resource_id=sale.id, state={"order_number": sale.order_number, "source": sale.source, "status": sale.status})
    return _serialize(sale)


@router.post("/{public_token}/payment")
def confirm_quick_sale_payment(
    public_token: str,
    body: QuickSalePayment,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: StaffUser = Depends(_owner_admin),
    db: Session = Depends(get_db),
):
    key = require_key(idempotency_key)
    payload_hash = request_hash(body.model_dump(mode="json"))
    sale = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(QuickSale.restaurant_id == current_user.restaurant_id, QuickSale.public_token == public_token).with_for_update().first()
    if not sale: raise HTTPException(status_code=404, detail="Quick Sale not found")
    if sale.payment_idempotency_key == key:
        ensure_same_request(sale.payment_request_hash, payload_hash)
        return _serialize(sale)
    if sale.status == "completed":
        raise HTTPException(status_code=409, detail="Quick Sale has already been paid with a different Idempotency-Key.")
    if sale.sale_type != "takeaway" or sale.status != "served":
        raise HTTPException(status_code=409, detail="Only a served unpaid Takeaway can be completed")
    now = datetime.datetime.now(datetime.timezone.utc)

    if sale.gst_enabled_snapshot:
        if not sale.invoice_number:
            sale.invoice_number, sale.invoice_date = generate_invoice_number(db, current_user.restaurant, now=now)
        for item in sale.items:
            if item.gst_rate_snapshot is None:
                item.gst_rate_snapshot = sale.gst_rate

    sale.status = "completed"; sale.payment_method = body.method; sale.payment_idempotency_key = key; sale.payment_request_hash = payload_hash; sale.paid_by_staff_id = current_user.id; sale.paid_by_name = current_user.name; sale.paid_by_role = current_user.role; sale.completed_at = now
    payment = Payment(restaurant_id=current_user.restaurant_id, quick_sale_id=sale.id, idempotency_key=key, method=body.method, amount=sale.total_amount, recorded_by_staff_id=current_user.id)
    db.add(payment); db.flush()
    db.add(RevenueEntry(restaurant_id=current_user.restaurant_id, payment_id=payment.id, amount=sale.total_amount, currency=current_user.restaurant.currency, occurred_at=now))
    _audit(db, current_user, sale, "quick_sale_payment_confirmed", {"payment_method": body.method}); db.commit(); db.refresh(sale)
    publish_event(EVENT_QUICK_SALE_COMPLETED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), restaurant_channel(current_user.restaurant_id, "admin")], resource_id=sale.id, state={"order_number": sale.order_number, "source": sale.source, "status": sale.status})
    return _serialize(sale)
