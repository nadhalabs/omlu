import datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from app.models.bill import Bill
from app.models.quick_sale import QuickSale
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
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Custom date range requires start_date and end_date",
            )
        start_local = start_date
        end_local = end_date
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid date preset",
        )

    if start_local > end_local:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="start_date must be before or equal to end_date",
        )
    if (end_local - start_local).days > 370:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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
