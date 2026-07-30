from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_id: Mapped[int | None] = mapped_column(ForeignKey("bills.id", ondelete="CASCADE"), nullable=True)
    quick_sale_id: Mapped[int | None] = mapped_column(ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    method: Mapped[str] = mapped_column(String(50), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="succeeded")
    recorded_by_staff_id: Mapped[int] = mapped_column(ForeignKey("staff_users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("(bill_id IS NULL) <> (quick_sale_id IS NULL)", name="ck_payment_exactly_one_source"),
        CheckConstraint("status = 'succeeded'", name="ck_payment_phase1_status"),
        CheckConstraint("amount >= 0", name="ck_payment_amount_nonnegative"),
        UniqueConstraint("bill_id", name="uq_payment_bill"),
        UniqueConstraint("quick_sale_id", name="uq_payment_quick_sale"),
        UniqueConstraint("restaurant_id", "idempotency_key", name="uq_payment_restaurant_idempotency"),
    )


class RevenueEntry(Base):
    __tablename__ = "revenue_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_revenue_entry_amount_nonnegative"),
        UniqueConstraint("payment_id", name="uq_revenue_entry_payment"),
    )
