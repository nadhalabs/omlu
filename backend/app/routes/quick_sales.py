import datetime
import json
import secrets
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.menu import MenuItem, MenuItemOptionGroup, MenuOptionGroup
from app.models.quick_sale import QuickSale, QuickSaleItem, QuickSaleItemSelectedOption
from app.models.staff_user import AuditLog, StaffUser
from app.models.payment import Payment, RevenueEntry
from app.schemas.order import PublicOrderCreateRequest
from app.schemas.quick_sale import QuickSaleCreate, QuickSalePayment
from app.services.menu_options import serialize_item_option_groups
from app.services.order_pricing import validate_and_price_order_items
from app.services.idempotency import ensure_same_request, request_hash, require_key
from app.services.realtime import EVENT_ORDER_CREATED, EVENT_QUICK_SALE_COMPLETED, publish_event, restaurant_channel
from app.utils.auth import RoleChecker

router = APIRouter(prefix="/admin/quick-sales")
_owner_admin = RoleChecker(["owner", "admin"])


def _serialize(sale: QuickSale, *, financial: bool = True) -> dict:
    result = {
        "id": sale.id, "order_number": sale.order_number, "public_token": sale.public_token,
        "sale_type": sale.sale_type, "source": sale.source, "status": sale.status,
        "note": sale.note, "reason": sale.reason, "subtotal": f"{sale.subtotal:.2f}",
        "total": f"{sale.total_amount:.2f}", "entered_by_id": sale.entered_by_staff_id,
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


def _audit(db: Session, actor: StaffUser, sale: QuickSale, action: str, details: dict) -> None:
    attribution = {
        "actor_id": actor.id,
        "actor_name": actor.name,
        "actor_username": actor.username,
        "actor_role": actor.role,
    }
    db.add(AuditLog(restaurant_id=actor.restaurant_id, actor_user_id=actor.id, actor_role=actor.role, target_type="quick_sale", target_id=str(sale.id), action=action, new_value=json.dumps({**attribution, **details})))


@router.get("")
def quick_sale_home(current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    tz = ZoneInfo(current_user.restaurant.timezone or "Asia/Kolkata")
    now = datetime.datetime.now(tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(datetime.timezone.utc)
    end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)).astimezone(datetime.timezone.utc)
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
    if body.sale_type == "late_entry" and not body.payment_method:
        raise HTTPException(status_code=422, detail="Late Entry requires Cash or UPI payment confirmation")
    if body.sale_type == "takeaway" and body.payment_method:
        raise HTTPException(status_code=422, detail="Takeaway payment is confirmed only after the order is ready")
    subtotal, priced_items = validate_and_price_order_items(
        db,
        current_user.restaurant_id,
        PublicOrderCreateRequest(
            items=[item.model_dump() for item in body.items],
            customer_note=body.note,
        ),
    )
    now = datetime.datetime.now(datetime.timezone.utc)
    sale = QuickSale(
        restaurant_id=current_user.restaurant_id, order_number="PENDING", public_token=f"qs_{secrets.token_urlsafe(24)}",
        idempotency_key=key, idempotency_request_hash=payload_hash, sale_type=body.sale_type, source=body.sale_type,
        status="completed" if body.sale_type == "late_entry" else "pending", note=body.note,
        reason=(body.reason or "Unrecorded verbal order") if body.sale_type == "late_entry" else None,
        subtotal=subtotal, total_amount=subtotal, payment_method=body.payment_method,
        entered_by_staff_id=current_user.id, entered_by_name=current_user.name, entered_by_role=current_user.role,
        paid_by_staff_id=current_user.id if body.sale_type == "late_entry" else None,
        paid_by_name=current_user.name if body.sale_type == "late_entry" else None,
        paid_by_role=current_user.role if body.sale_type == "late_entry" else None,
        completed_at=now if body.sale_type == "late_entry" else None,
    )
    db.add(sale); db.flush(); sale.order_number = f"QS-{sale.id:06d}"
    for priced in priced_items:
        sale_item = QuickSaleItem(
            menu_item_id=priced.menu_item_id,
            item_name=priced.item_name,
            quantity=priced.quantity,
            base_price=priced.base_price,
            unit_price=priced.unit_price,
            total_price=priced.total_price,
            item_note=priced.item_note,
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
    _audit(db, current_user, sale, "quick_sale_created", {"type": sale.sale_type, "total": str(subtotal), "payment_method": body.payment_method})
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
    sale.status = "completed"; sale.payment_method = body.method; sale.payment_idempotency_key = key; sale.payment_request_hash = payload_hash; sale.paid_by_staff_id = current_user.id; sale.paid_by_name = current_user.name; sale.paid_by_role = current_user.role; sale.completed_at = now
    payment = Payment(restaurant_id=current_user.restaurant_id, quick_sale_id=sale.id, idempotency_key=key, method=body.method, amount=sale.total_amount, recorded_by_staff_id=current_user.id)
    db.add(payment); db.flush()
    db.add(RevenueEntry(restaurant_id=current_user.restaurant_id, payment_id=payment.id, amount=sale.total_amount, currency=current_user.restaurant.currency, occurred_at=now))
    _audit(db, current_user, sale, "quick_sale_payment_confirmed", {"payment_method": body.method}); db.commit(); db.refresh(sale)
    publish_event(EVENT_QUICK_SALE_COMPLETED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff"), restaurant_channel(current_user.restaurant_id, "admin")], resource_id=sale.id, state={"order_number": sale.order_number, "source": sale.source, "status": sale.status})
    return _serialize(sale)
