import datetime
import json
import secrets
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.menu import MenuItem
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.staff_user import AuditLog, StaffUser
from app.schemas.quick_sale import QuickSaleCreate, QuickSalePayment
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
        "items": [{"menu_item_id": item.menu_item_id, "item_name": item.item_name, "quantity": item.quantity, "unit_price": f"{item.unit_price:.2f}", "total_price": f"{item.total_price:.2f}"} for item in sale.items],
    }
    if financial:
        result.update({"payment_method": sale.payment_method, "paid_by_name": sale.paid_by_name, "paid_by_role": sale.paid_by_role})
    return result


def _audit(db: Session, actor: StaffUser, sale: QuickSale, action: str, details: dict) -> None:
    db.add(AuditLog(restaurant_id=actor.restaurant_id, actor_user_id=actor.id, actor_role=actor.role, target_type="quick_sale", target_id=str(sale.id), action=action, new_value=json.dumps(details)))


@router.get("")
def quick_sale_home(current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    tz = ZoneInfo(current_user.restaurant.timezone or "Asia/Kolkata")
    now = datetime.datetime.now(tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(datetime.timezone.utc)
    end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=1)).astimezone(datetime.timezone.utc)
    menu = db.query(MenuItem).filter(MenuItem.restaurant_id == current_user.restaurant_id, MenuItem.is_available == True).order_by(MenuItem.name_en).all()
    sales = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(QuickSale.restaurant_id == current_user.restaurant_id).order_by(QuickSale.created_at.desc()).limit(100).all()
    return {
        "menu_items": [{"id": item.id, "name": item.name_en, "price": f"{item.price:.2f}"} for item in menu],
        "active_takeaways": [_serialize(s) for s in sales if s.sale_type == "takeaway" and s.status != "completed"],
        "completed_today": [_serialize(s) for s in sales if s.status == "completed" and s.completed_at and start <= s.completed_at < end],
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def create_quick_sale(body: QuickSaleCreate, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    existing = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(QuickSale.restaurant_id == current_user.restaurant_id, QuickSale.idempotency_key == body.idempotency_key).first()
    if existing:
        return _serialize(existing)
    if body.sale_type == "late_entry" and not body.payment_method:
        raise HTTPException(status_code=422, detail="Late Entry requires Cash or UPI payment confirmation")
    if body.sale_type == "takeaway" and body.payment_method:
        raise HTTPException(status_code=422, detail="Takeaway payment is confirmed only after the order is ready")
    requested = {item.menu_item_id: item.quantity for item in body.items}
    menu_items = db.query(MenuItem).filter(MenuItem.restaurant_id == current_user.restaurant_id, MenuItem.id.in_(requested), MenuItem.is_available == True).all()
    if len(menu_items) != len(requested):
        raise HTTPException(status_code=422, detail="One or more menu items are unavailable")
    subtotal = sum((item.price * requested[item.id] for item in menu_items), Decimal("0.00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    sale = QuickSale(
        restaurant_id=current_user.restaurant_id, order_number="PENDING", public_token=f"qs_{secrets.token_urlsafe(24)}",
        idempotency_key=body.idempotency_key, sale_type=body.sale_type, source=body.sale_type,
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
    for item in menu_items:
        quantity = requested[item.id]
        sale.items.append(QuickSaleItem(menu_item_id=item.id, item_name=item.name_en, quantity=quantity, unit_price=item.price, total_price=item.price * quantity))
    _audit(db, current_user, sale, "quick_sale_created", {"type": sale.sale_type, "total": str(subtotal), "payment_method": body.payment_method})
    if sale.status == "completed": _audit(db, current_user, sale, "quick_sale_completed", {"payment_method": body.payment_method})
    db.commit(); db.refresh(sale)
    event = EVENT_QUICK_SALE_COMPLETED if sale.status == "completed" else EVENT_ORDER_CREATED
    channels = [restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff")]
    if sale.sale_type == "takeaway": channels.append(restaurant_channel(current_user.restaurant_id, "kitchen"))
    publish_event(event, restaurant_id=current_user.restaurant_id, channels=channels, resource_id=sale.id, state={"order_number": sale.order_number, "source": sale.source, "status": sale.status})
    return _serialize(sale)


@router.post("/{public_token}/payment")
def confirm_quick_sale_payment(public_token: str, body: QuickSalePayment, current_user: StaffUser = Depends(_owner_admin), db: Session = Depends(get_db)):
    sale = db.query(QuickSale).options(selectinload(QuickSale.items)).filter(QuickSale.restaurant_id == current_user.restaurant_id, QuickSale.public_token == public_token).with_for_update().first()
    if not sale: raise HTTPException(status_code=404, detail="Quick Sale not found")
    if sale.sale_type != "takeaway" or sale.status != "ready":
        raise HTTPException(status_code=409, detail="Only a ready unpaid Takeaway can be completed")
    now = datetime.datetime.now(datetime.timezone.utc)
    sale.status = "completed"; sale.payment_method = body.method; sale.paid_by_staff_id = current_user.id; sale.paid_by_name = current_user.name; sale.paid_by_role = current_user.role; sale.completed_at = now
    _audit(db, current_user, sale, "quick_sale_payment_confirmed", {"payment_method": body.method}); db.commit(); db.refresh(sale)
    publish_event(EVENT_QUICK_SALE_COMPLETED, restaurant_id=current_user.restaurant_id, channels=[restaurant_channel(current_user.restaurant_id, "operations"), restaurant_channel(current_user.restaurant_id, "staff")], resource_id=sale.id, state={"order_number": sale.order_number, "source": sale.source, "status": sale.status})
    return _serialize(sale)
