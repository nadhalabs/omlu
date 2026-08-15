import datetime
from decimal import Decimal
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from app.models.bill import Bill
from app.models.dining_session import DiningSession
from app.models.order import Order, OrderItem
from app.models.quick_sale import QuickSale, QuickSaleItem
from app.models.staff_user import StaffUser
from app.utils.business_date import (
    local_date_bounds_utc,
    restaurant_business_date,
)


def resolve_gst_period_bounds(
    restaurant: Any,
    preset: str | None,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
) -> tuple[datetime.date, datetime.date, datetime.datetime, datetime.datetime]:
    local_today = restaurant_business_date(restaurant)
    normalized_preset = (preset or "today").strip().lower()

    if normalized_preset == "today":
        start_local = local_today
        end_local = local_today
    elif normalized_preset == "this_month":
        start_local = local_today.replace(day=1)
        next_month = (start_local.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        end_local = next_month - datetime.timedelta(days=1)
    elif normalized_preset == "last_month":
        this_month_start = local_today.replace(day=1)
        end_local = this_month_start - datetime.timedelta(days=1)
        start_local = end_local.replace(day=1)
    elif normalized_preset in {"quarter", "current_quarter"}:
        m = local_today.month
        y = local_today.year
        if 4 <= m <= 6:
            start_local = datetime.date(y, 4, 1)
            end_local = datetime.date(y, 6, 30)
        elif 7 <= m <= 9:
            start_local = datetime.date(y, 7, 1)
            end_local = datetime.date(y, 9, 30)
        elif 10 <= m <= 12:
            start_local = datetime.date(y, 10, 1)
            end_local = datetime.date(y, 12, 31)
        else:  # Jan - Mar (Q4)
            start_local = datetime.date(y, 1, 1)
            end_local = datetime.date(y, 3, 31)
    elif normalized_preset in {"financial_year", "fy", "current_financial_year"}:
        m = local_today.month
        y = local_today.year
        if m >= 4:
            start_local = datetime.date(y, 4, 1)
            end_local = datetime.date(y + 1, 3, 31)
        else:
            start_local = datetime.date(y - 1, 4, 1)
            end_local = datetime.date(y, 3, 31)
    elif normalized_preset == "custom":
        if not start_date or not end_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Custom date range requires start_date and end_date",
            )
        start_local = start_date
        end_local = end_date
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid date preset",
        )

    if start_local > end_local:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date must be before or equal to end_date",
        )
    if (end_local - start_local).days > 370:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date range cannot exceed 370 days",
        )

    start_utc, end_utc = local_date_bounds_utc(restaurant, start_local, end_local)
    return start_local, end_local, start_utc, end_utc


def _fmt(val: Decimal | None) -> str:
    if val is None:
        return "0.00"
    return f"{Decimal(val):.2f}"


def get_gst_center_summary(
    db: Session,
    staff: StaffUser,
    preset: str | None,
    start_date: datetime.date | None,
    end_date: datetime.date | None,
) -> dict[str, Any]:
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(
        restaurant, preset, start_date, end_date
    )

    is_gst = bool(restaurant.gst_enabled)

    # 1. Query Bills
    # Included final bills: status IN ('issued', 'payment_pending', 'paid')
    # Cancelled bills: status IN ('cancelled', 'void')
    bill_aggregates = (
        db.query(
            func.coalesce(func.sum(case((Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.subtotal), else_=0)), 0).label("subtotal"),
            func.coalesce(func.sum(case((Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.discount_amount), else_=0)), 0).label("discount_amount"),
            func.coalesce(func.sum(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True), Bill.taxable_amount), else_=0)), 0).label("taxable_amount"),
            func.coalesce(func.sum(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True), Bill.cgst_amount), else_=0)), 0).label("cgst_amount"),
            func.coalesce(func.sum(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True), Bill.sgst_amount), else_=0)), 0).label("sgst_amount"),
            func.coalesce(func.sum(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True), Bill.igst_amount), else_=0)), 0).label("igst_amount"),
            func.coalesce(func.sum(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True), Bill.tax_amount), else_=0)), 0).label("tax_amount"),
            func.coalesce(func.sum(case((Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.total_amount), else_=0)), 0).label("total_amount"),
            func.count(case((Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.id))).label("doc_count"),
            func.count(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True, Bill.customer_tax_type == "b2b"), Bill.id))).label("b2b_count"),
            func.count(case((and_(Bill.status.in_(["issued", "payment_pending", "paid"]), Bill.gst_enabled_snapshot == True, Bill.customer_tax_type == "b2c"), Bill.id))).label("b2c_count"),
            func.count(case((Bill.status == "cancelled", Bill.id))).label("cancelled_count"),
        )
        .filter(
            Bill.restaurant_id == restaurant.id,
            Bill.created_at >= start_utc,
            Bill.created_at < end_utc,
        )
        .first()
    )

    # 2. Query Quick Sales
    # Included completed quick sales: status == 'completed'
    qs_aggregates = (
        db.query(
            func.coalesce(func.sum(case((QuickSale.status == "completed", QuickSale.subtotal), else_=0)), 0).label("subtotal"),
            func.coalesce(func.sum(case((QuickSale.status == "completed", QuickSale.discount_amount), else_=0)), 0).label("discount_amount"),
            func.coalesce(func.sum(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True), QuickSale.taxable_amount), else_=0)), 0).label("taxable_amount"),
            func.coalesce(func.sum(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True), QuickSale.cgst_amount), else_=0)), 0).label("cgst_amount"),
            func.coalesce(func.sum(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True), QuickSale.sgst_amount), else_=0)), 0).label("sgst_amount"),
            func.coalesce(func.sum(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True), QuickSale.igst_amount), else_=0)), 0).label("igst_amount"),
            func.coalesce(func.sum(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True), QuickSale.tax_amount), else_=0)), 0).label("tax_amount"),
            func.coalesce(func.sum(case((QuickSale.status == "completed", QuickSale.total_amount), else_=0)), 0).label("total_amount"),
            func.count(case((QuickSale.status == "completed", QuickSale.id))).label("doc_count"),
            func.count(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True, QuickSale.customer_tax_type == "b2b"), QuickSale.id))).label("b2b_count"),
            func.count(case((and_(QuickSale.status == "completed", QuickSale.gst_enabled_snapshot == True, QuickSale.customer_tax_type == "b2c"), QuickSale.id))).label("b2c_count"),
        )
        .filter(
            QuickSale.restaurant_id == restaurant.id,
            QuickSale.created_at >= start_utc,
            QuickSale.created_at < end_utc,
        )
        .first()
    )

    # Sum Bill + QuickSale values
    b_subtotal = Decimal(bill_aggregates.subtotal if bill_aggregates else 0)
    q_subtotal = Decimal(qs_aggregates.subtotal if qs_aggregates else 0)
    gross_sales = b_subtotal + q_subtotal

    b_disc = Decimal(bill_aggregates.discount_amount if bill_aggregates else 0)
    q_disc = Decimal(qs_aggregates.discount_amount if qs_aggregates else 0)
    discount_amount = b_disc + q_disc

    b_tot = Decimal(bill_aggregates.total_amount if bill_aggregates else 0)
    q_tot = Decimal(qs_aggregates.total_amount if qs_aggregates else 0)
    net_sales = b_tot + q_tot

    doc_count = int(bill_aggregates.doc_count if bill_aggregates else 0) + int(qs_aggregates.doc_count if qs_aggregates else 0)
    cancelled_count = int(bill_aggregates.cancelled_count if bill_aggregates else 0)

    if is_gst:
        b_taxable = Decimal(bill_aggregates.taxable_amount if bill_aggregates else 0)
        q_taxable = Decimal(qs_aggregates.taxable_amount if qs_aggregates else 0)
        taxable_sales = b_taxable + q_taxable

        b_cgst = Decimal(bill_aggregates.cgst_amount if bill_aggregates else 0)
        q_cgst = Decimal(qs_aggregates.cgst_amount if qs_aggregates else 0)
        cgst_amount = b_cgst + q_cgst

        b_sgst = Decimal(bill_aggregates.sgst_amount if bill_aggregates else 0)
        q_sgst = Decimal(qs_aggregates.sgst_amount if qs_aggregates else 0)
        sgst_amount = b_sgst + q_sgst

        b_igst = Decimal(bill_aggregates.igst_amount if bill_aggregates else 0)
        q_igst = Decimal(qs_aggregates.igst_amount if qs_aggregates else 0)
        igst_amount = b_igst + q_igst

        total_gst = cgst_amount + sgst_amount + igst_amount

        b2b_count = int(bill_aggregates.b2b_count if bill_aggregates else 0) + int(qs_aggregates.b2b_count if qs_aggregates else 0)
        b2c_count = int(bill_aggregates.b2c_count if bill_aggregates else 0) + int(qs_aggregates.b2c_count if qs_aggregates else 0)
    else:
        taxable_sales = Decimal("0.00")
        cgst_amount = Decimal("0.00")
        sgst_amount = Decimal("0.00")
        igst_amount = Decimal("0.00")
        total_gst = Decimal("0.00")
        b2b_count = 0
        b2c_count = 0

    return {
        "gst_enabled": is_gst,
        "gstin": restaurant.gstin if is_gst else None,
        "legal_business_name": restaurant.legal_business_name if is_gst else None,
        "gst_state_name": restaurant.gst_state_name if is_gst else None,
        "gst_state_code": restaurant.gst_state_code if is_gst else None,
        "period": {
            "preset": preset or "today",
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
        },
        "summary": {
            "gross_sales": _fmt(gross_sales),
            "discount_amount": _fmt(discount_amount),
            "taxable_sales": _fmt(taxable_sales),
            "cgst_amount": _fmt(cgst_amount),
            "sgst_amount": _fmt(sgst_amount),
            "igst_amount": _fmt(igst_amount),
            "total_gst": _fmt(total_gst),
            "net_sales": _fmt(net_sales),
            "document_count": doc_count,
            "b2b_count": b2b_count,
            "b2c_count": b2c_count,
            "cancelled_count": cancelled_count,
        },
    }


def get_gst_sales_register(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    document_type: Optional[str] = None,
    customer_tax_type: Optional[str] = None,
) -> Dict[str, Any]:
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(restaurant, preset, start_date, end_date)
    is_gst = bool(restaurant.gst_enabled)

    limit = max(1, min(limit, 100))
    page = max(1, page)
    fetch_limit = page * limit

    items = []
    total_records = 0

    # Fetch Bills
    if not document_type or document_type == "bill":
        b_query = db.query(Bill).filter(
            Bill.restaurant_id == restaurant.id,
            Bill.status.in_(["issued", "payment_pending", "paid"]),
            Bill.created_at >= start_utc,
            Bill.created_at < end_utc,
        )
        if customer_tax_type:
            b_query = b_query.filter(Bill.customer_tax_type == customer_tax_type)

        total_records += b_query.count()
        for b in b_query.order_by(Bill.created_at.desc()).limit(fetch_limit).all():
            items.append({
                "id": f"bill_{b.id}",
                "document_type": "bill",
                "document_number": b.bill_number,
                "invoice_number": b.invoice_number,
                "invoice_date": b.invoice_date.isoformat() if b.invoice_date else (b.generated_at.isoformat() if b.generated_at else b.created_at.isoformat()),
                "document_date": b.created_at.isoformat(),
                "customer_tax_type": b.customer_tax_type or "b2c",
                "customer_legal_name": b.customer_legal_name_snapshot,
                "customer_gstin": b.customer_gstin_snapshot,
                "subtotal": _fmt(b.subtotal),
                "discount_amount": _fmt(b.discount_amount),
                "taxable_amount": _fmt(b.taxable_amount if is_gst else Decimal("0.00")),
                "gst_rate": _fmt(b.gst_rate) if b.gst_rate is not None else None,
                "cgst_amount": _fmt(b.cgst_amount if is_gst else Decimal("0.00")),
                "sgst_amount": _fmt(b.sgst_amount if is_gst else Decimal("0.00")),
                "igst_amount": _fmt(b.igst_amount if is_gst else Decimal("0.00")),
                "tax_amount": _fmt(b.tax_amount if is_gst else Decimal("0.00")),
                "total_amount": _fmt(b.total_amount),
                "payment_status": b.status,
                "cancellation_status": "active",
            })

    # Fetch Quick Sales
    if not document_type or document_type == "quick_sale":
        q_query = db.query(QuickSale).filter(
            QuickSale.restaurant_id == restaurant.id,
            QuickSale.status == "completed",
            QuickSale.created_at >= start_utc,
            QuickSale.created_at < end_utc,
        )
        if customer_tax_type:
            q_query = q_query.filter(QuickSale.customer_tax_type == customer_tax_type)

        total_records += q_query.count()
        for q in q_query.order_by(QuickSale.created_at.desc()).limit(fetch_limit).all():
            items.append({
                "id": f"qs_{q.id}",
                "document_type": "quick_sale",
                "document_number": q.order_number,
                "invoice_number": q.invoice_number,
                "invoice_date": q.invoice_date.isoformat() if q.invoice_date else q.created_at.isoformat(),
                "document_date": q.created_at.isoformat(),
                "customer_tax_type": q.customer_tax_type or "b2c",
                "customer_legal_name": q.customer_legal_name_snapshot,
                "customer_gstin": q.customer_gstin_snapshot,
                "subtotal": _fmt(q.subtotal),
                "discount_amount": _fmt(q.discount_amount),
                "taxable_amount": _fmt(q.taxable_amount if is_gst else Decimal("0.00")),
                "gst_rate": _fmt(q.gst_rate) if q.gst_rate is not None else None,
                "cgst_amount": _fmt(q.cgst_amount if is_gst else Decimal("0.00")),
                "sgst_amount": _fmt(q.sgst_amount if is_gst else Decimal("0.00")),
                "igst_amount": _fmt(q.igst_amount if is_gst else Decimal("0.00")),
                "tax_amount": _fmt(q.tax_amount if is_gst else Decimal("0.00")),
                "total_amount": _fmt(q.total_amount),
                "payment_status": "completed",
                "cancellation_status": "active",
            })

    # Sort descending by document_date
    items.sort(key=lambda x: x["document_date"], reverse=True)

    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_items = items[start_idx:end_idx]

    return {
        "gst_enabled": is_gst,
        "period": {
            "preset": preset or "today",
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
        },
        "pagination": {
            "total_records": total_records,
            "page": page,
            "limit": limit,
            "total_pages": (total_records + limit - 1) // limit if total_records > 0 else 1,
        },
        "records": paginated_items,
    }


def get_gst_rate_summary(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(restaurant, preset, start_date, end_date)
    is_gst = bool(restaurant.gst_enabled)

    rate_map: Dict[Tuple[str, str], Dict[str, Any]] = {}

    if is_gst:
        # Bills
        bills = db.query(Bill).filter(
            Bill.restaurant_id == restaurant.id,
            Bill.status.in_(["issued", "payment_pending", "paid"]),
            Bill.created_at >= start_utc,
            Bill.created_at < end_utc,
        ).all()
        for b in bills:
            rate_str = _fmt(b.gst_rate) if b.gst_rate is not None else "0.00"
            ttype = b.customer_tax_type or "b2c"
            key = (rate_str, ttype)
            if key not in rate_map:
                rate_map[key] = {
                    "gst_rate": rate_str,
                    "customer_tax_type": ttype,
                    "taxable_amount": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "total_gst": Decimal("0.00"),
                    "document_count": 0,
                }
            rate_map[key]["taxable_amount"] += (b.taxable_amount or Decimal("0.00"))
            rate_map[key]["cgst_amount"] += (b.cgst_amount or Decimal("0.00"))
            rate_map[key]["sgst_amount"] += (b.sgst_amount or Decimal("0.00"))
            rate_map[key]["igst_amount"] += (b.igst_amount or Decimal("0.00"))
            rate_map[key]["total_gst"] += ((b.cgst_amount or Decimal("0.00")) + (b.sgst_amount or Decimal("0.00")) + (b.igst_amount or Decimal("0.00")))
            rate_map[key]["document_count"] += 1

        # Quick Sales
        qsales = db.query(QuickSale).filter(
            QuickSale.restaurant_id == restaurant.id,
            QuickSale.status == "completed",
            QuickSale.created_at >= start_utc,
            QuickSale.created_at < end_utc,
        ).all()
        for q in qsales:
            rate_str = _fmt(q.gst_rate) if q.gst_rate is not None else "0.00"
            ttype = q.customer_tax_type or "b2c"
            key = (rate_str, ttype)
            if key not in rate_map:
                rate_map[key] = {
                    "gst_rate": rate_str,
                    "customer_tax_type": ttype,
                    "taxable_amount": Decimal("0.00"),
                    "cgst_amount": Decimal("0.00"),
                    "sgst_amount": Decimal("0.00"),
                    "igst_amount": Decimal("0.00"),
                    "total_gst": Decimal("0.00"),
                    "document_count": 0,
                }
            rate_map[key]["taxable_amount"] += (q.taxable_amount or Decimal("0.00"))
            rate_map[key]["cgst_amount"] += (q.cgst_amount or Decimal("0.00"))
            rate_map[key]["sgst_amount"] += (q.sgst_amount or Decimal("0.00"))
            rate_map[key]["igst_amount"] += (q.igst_amount or Decimal("0.00"))
            rate_map[key]["total_gst"] += ((q.cgst_amount or Decimal("0.00")) + (q.sgst_amount or Decimal("0.00")) + (q.igst_amount or Decimal("0.00")))
            rate_map[key]["document_count"] += 1

    records = [
        {
            "gst_rate": val["gst_rate"],
            "customer_tax_type": val["customer_tax_type"],
            "taxable_amount": _fmt(val["taxable_amount"]),
            "cgst_amount": _fmt(val["cgst_amount"]),
            "sgst_amount": _fmt(val["sgst_amount"]),
            "igst_amount": _fmt(val["igst_amount"]),
            "total_gst": _fmt(val["total_gst"]),
            "document_count": val["document_count"],
        }
        for val in sorted(rate_map.values(), key=lambda x: (x["customer_tax_type"], Decimal(x["gst_rate"])))
    ]

    return {
        "gst_enabled": is_gst,
        "period": {
            "preset": preset or "today",
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
        },
        "records": records,
    }


def get_hsn_summary(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(restaurant, preset, start_date, end_date)
    is_gst = bool(restaurant.gst_enabled)

    hsn_map: Dict[str, Dict[str, Any]] = {}

    # OrderItems for issued/payment_pending/paid Bills
    order_items = (
        db.query(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .join(DiningSession, Order.dining_session_id == DiningSession.id)
        .join(Bill, Bill.dining_session_id == DiningSession.id)
        .filter(
            Bill.restaurant_id == restaurant.id,
            Bill.status.in_(["issued", "payment_pending", "paid"]),
            Bill.created_at >= start_utc,
            Bill.created_at < end_utc,
        )
        .all()
    )
    for oi in order_items:
        hsn = oi.hsn_sac_code_snapshot or "UNSPECIFIED"
        if hsn not in hsn_map:
            hsn_map[hsn] = {
                "hsn_sac_code": hsn,
                "description": oi.item_name,
                "total_quantity": 0,
                "line_count": 0,
                "gst_rates": set(),
            }
        hsn_map[hsn]["total_quantity"] += oi.quantity
        hsn_map[hsn]["line_count"] += 1
        if oi.gst_rate_snapshot is not None:
            hsn_map[hsn]["gst_rates"].add(_fmt(oi.gst_rate_snapshot))

    # QuickSaleItems for completed QuickSales
    qs_items = (
        db.query(QuickSaleItem)
        .join(QuickSale, QuickSaleItem.quick_sale_id == QuickSale.id)
        .filter(
            QuickSale.restaurant_id == restaurant.id,
            QuickSale.status == "completed",
            QuickSale.created_at >= start_utc,
            QuickSale.created_at < end_utc,
        )
        .all()
    )
    for qi in qs_items:
        hsn = qi.hsn_sac_code_snapshot or "UNSPECIFIED"
        if hsn not in hsn_map:
            hsn_map[hsn] = {
                "hsn_sac_code": hsn,
                "description": qi.item_name,
                "total_quantity": 0,
                "line_count": 0,
                "gst_rates": set(),
            }
        hsn_map[hsn]["total_quantity"] += qi.quantity
        hsn_map[hsn]["line_count"] += 1
        if qi.gst_rate_snapshot is not None:
            hsn_map[hsn]["gst_rates"].add(_fmt(qi.gst_rate_snapshot))

    records = [
        {
            "hsn_sac_code": val["hsn_sac_code"],
            "description": val["description"],
            "total_quantity": val["total_quantity"],
            "line_count": val["line_count"],
            "gst_rates_used": sorted(list(val["gst_rates"])),
            # Explicit tax allocation limitation
            "taxable_amount": None,
            "cgst_amount": None,
            "sgst_amount": None,
            "igst_amount": None,
        }
        for val in sorted(hsn_map.values(), key=lambda x: x["hsn_sac_code"])
    ]

    return {
        "gst_enabled": is_gst,
        "tax_allocation_status": "unallocated_header_discount",
        "tax_allocation_notice": "Line-level tax allocation is omitted because document-level discounts are not allocated across line items in Phase 1/3.",
        "period": {
            "preset": preset or "today",
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
        },
        "records": records,
    }


def get_b2b_register(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    return get_gst_sales_register(
        db, staff, preset, start_date, end_date, page, limit, document_type=None, customer_tax_type="b2b"
    )


def get_b2c_register(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    sales = get_gst_sales_register(
        db, staff, preset, start_date, end_date, page, limit, document_type=None, customer_tax_type="b2c"
    )
    rates = get_gst_rate_summary(db, staff, preset, start_date, end_date)
    b2c_rates = [r for r in rates.get("records", []) if r["customer_tax_type"] == "b2c"]

    sales["rate_summary"] = b2c_rates
    return sales


def get_documents_issued_audit(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Dict[str, Any]:
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(restaurant, preset, start_date, end_date)
    is_gst = bool(restaurant.gst_enabled)

    # Collect official invoice records
    invoices = []

    # Bills with invoice numbers
    bills = db.query(Bill).filter(
        Bill.restaurant_id == restaurant.id,
        Bill.invoice_number.isnot(None),
        Bill.created_at >= start_utc,
        Bill.created_at < end_utc,
    ).all()
    for b in bills:
        invoices.append({
            "invoice_number": b.invoice_number,
            "invoice_date": b.invoice_date.isoformat() if b.invoice_date else b.created_at.isoformat(),
            "document_type": "bill",
            "document_number": b.bill_number,
            "status": b.status,
            "is_cancelled": b.status == "cancelled",
        })

    # Quick Sales with invoice numbers
    qsales = db.query(QuickSale).filter(
        QuickSale.restaurant_id == restaurant.id,
        QuickSale.invoice_number.isnot(None),
        QuickSale.created_at >= start_utc,
        QuickSale.created_at < end_utc,
    ).all()
    for q in qsales:
        invoices.append({
            "invoice_number": q.invoice_number,
            "invoice_date": q.invoice_date.isoformat() if q.invoice_date else q.created_at.isoformat(),
            "document_type": "quick_sale",
            "document_number": q.order_number,
            "status": q.status,
            "is_cancelled": False,
        })

    invoices.sort(key=lambda x: x["invoice_number"])

    total_issued = len(invoices)
    cancelled_count = sum(1 for inv in invoices if inv["is_cancelled"])

    # Parse numeric sequence to detect gaps
    sequence_gaps = []
    first_num = None
    last_num = None

    if invoices:
        # Group invoices by prefix (e.g. "INV/2026-27/", "INV-")
        by_prefix: Dict[str, List[Tuple[int, str]]] = {}
        for inv in invoices:
            num_str = inv["invoice_number"]
            match = re.search(r"^(.*?)(\d+)$", num_str)
            if match:
                prefix_str = match.group(1)
                seq_num = int(match.group(2))
                raw_digits = match.group(2)
                if prefix_str not in by_prefix:
                    by_prefix[prefix_str] = []
                by_prefix[prefix_str].append((seq_num, raw_digits))

        for prefix_str, parsed_nums in by_prefix.items():
            parsed_nums.sort(key=lambda x: x[0])
            for i in range(len(parsed_nums) - 1):
                curr_n, curr_raw = parsed_nums[i]
                next_n, next_raw = parsed_nums[i + 1]
                if next_n > curr_n + 1:
                    pad = len(curr_raw)
                    gap_start = f"{prefix_str}{str(curr_n + 1).zfill(pad)}"
                    gap_end = f"{prefix_str}{str(next_n - 1).zfill(pad)}"
                    sequence_gaps.append({
                        "prefix": prefix_str,
                        "gap_from": gap_start,
                        "gap_to": gap_end,
                        "missing_count": next_n - curr_n - 1,
                        "status": "needs_review",
                        "note": "Unexplained sequence gap. Needs operational review.",
                    })

    return {
        "gst_enabled": is_gst,
        "period": {
            "preset": preset or "today",
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
        },
        "audit": {
            "first_invoice_number": first_num,
            "last_invoice_number": last_num,
            "issued_count": total_issued,
            "cancelled_count": cancelled_count,
            "sequence_gaps": sequence_gaps,
        },
        "records": invoices,
    }


def get_cancelled_documents_register(
    db: Session,
    staff: StaffUser,
    preset: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    restaurant = staff.restaurant
    start_local, end_local, start_utc, end_utc = resolve_gst_period_bounds(restaurant, preset, start_date, end_date)
    is_gst = bool(restaurant.gst_enabled)

    limit = max(1, min(limit, 100))
    page = max(1, page)

    query = db.query(Bill).filter(
        Bill.restaurant_id == restaurant.id,
        Bill.status == "cancelled",
        Bill.created_at >= start_utc,
        Bill.created_at < end_utc,
    )

    total_records = query.count()
    bills = query.order_by(Bill.created_at.desc()).offset((page - 1) * limit).limit(limit).all()

    records = [
        {
            "id": f"bill_{b.id}",
            "document_type": "bill",
            "document_number": b.bill_number,
            "invoice_number": b.invoice_number,
            "invoice_date": b.invoice_date.isoformat() if b.invoice_date else (b.generated_at.isoformat() if b.generated_at else b.created_at.isoformat()),
            "created_at": b.created_at.isoformat(),
            "subtotal": _fmt(b.subtotal),
            "discount_amount": _fmt(b.discount_amount),
            "taxable_amount": _fmt(b.taxable_amount if is_gst else Decimal("0.00")),
            "cgst_amount": _fmt(b.cgst_amount if is_gst else Decimal("0.00")),
            "sgst_amount": _fmt(b.sgst_amount if is_gst else Decimal("0.00")),
            "igst_amount": _fmt(b.igst_amount if is_gst else Decimal("0.00")),
            "total_amount": _fmt(b.total_amount),
            "cancellation_status": "cancelled",
        }
        for b in bills
    ]

    return {
        "gst_enabled": is_gst,
        "note": "Filtered by document creation date (created_at). Schema does not store separate cancellation timestamp, reason, or actor.",
        "period": {
            "preset": preset or "today",
            "start_date": start_local.isoformat(),
            "end_date": end_local.isoformat(),
        },
        "pagination": {
            "total_records": total_records,
            "page": page,
            "limit": limit,
            "total_pages": (total_records + limit - 1) // limit if total_records > 0 else 1,
        },
        "records": records,
    }
