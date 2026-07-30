from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.bill import Bill
from app.models.quick_sale import QuickSale


@dataclass(frozen=True)
class CollectedRevenue:
    paid_bill_revenue: Decimal
    paid_bill_count: int
    quick_sale_revenue: Decimal
    quick_sale_count: int
    pending_collection: Decimal
    pending_bill_count: int

    @property
    def total(self) -> Decimal:
        return self.paid_bill_revenue + self.quick_sale_revenue

    @property
    def transaction_count(self) -> int:
        return self.paid_bill_count + self.quick_sale_count

    @property
    def collected_revenue(self) -> Decimal:
        return self.total

    @property
    def completed_quick_sale_revenue(self) -> Decimal:
        return self.quick_sale_revenue


def collected_revenue(
    db: Session,
    *,
    restaurant_id: int,
    start_utc: datetime,
    end_utc: datetime,
) -> CollectedRevenue:
    """Return collected revenue once per paid bill or completed Quick Sale."""
    paid_bill_count, paid_bill_total = db.query(
        func.count(Bill.id),
        func.coalesce(func.sum(Bill.total_amount), 0),
    ).filter(
        Bill.restaurant_id == restaurant_id,
        Bill.status == "paid",
        Bill.paid_at.isnot(None),
        Bill.paid_at >= start_utc,
        Bill.paid_at < end_utc,
    ).one()

    quick_sale_count, quick_sale_total = db.query(
        func.count(QuickSale.id),
        func.coalesce(func.sum(QuickSale.total_amount), 0),
    ).filter(
        QuickSale.restaurant_id == restaurant_id,
        QuickSale.status == "completed",
        QuickSale.completed_at.isnot(None),
        QuickSale.completed_at >= start_utc,
        QuickSale.completed_at < end_utc,
    ).one()

    pending_bill_count, pending_bill_total = db.query(
        func.count(Bill.id),
        func.coalesce(func.sum(Bill.total_amount), 0),
    ).filter(
        Bill.restaurant_id == restaurant_id,
        Bill.status.in_(["issued", "payment_pending", "unpaid"]),
        Bill.generated_at >= start_utc,
        Bill.generated_at < end_utc,
    ).one()

    return CollectedRevenue(
        paid_bill_revenue=Decimal(str(paid_bill_total or 0)),
        paid_bill_count=int(paid_bill_count or 0),
        quick_sale_revenue=Decimal(str(quick_sale_total or 0)),
        quick_sale_count=int(quick_sale_count or 0),
        pending_collection=Decimal(str(pending_bill_total or 0)),
        pending_bill_count=int(pending_bill_count or 0),
    )
