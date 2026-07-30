from datetime import date, datetime
from decimal import Decimal
import secrets
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


BILL_STATUSES = (
    "draft",
    "issued",
    "payment_pending",
    "paid",
    "cancelled",
)

BILL_PAYMENT_METHODS = (
    "counter_cash",
    "counter_upi",
    "counter_card",
    "online",
)


class RestaurantBillDailySequence(Base):
    __tablename__ = "restaurant_bill_daily_sequences"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("restaurant_id", "sequence_date", name="uq_restaurant_bill_daily_sequence_date"),
    )


class RestaurantInvoiceSequence(Base):
    __tablename__ = "restaurant_invoice_sequences"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    financial_year: Mapped[str] = mapped_column(String(7), nullable=False)
    last_value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    __table_args__ = (
        UniqueConstraint("restaurant_id", "financial_year", name="uq_restaurant_invoice_sequence_fy"),
    )


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dining_session_id: Mapped[int] = mapped_column(
        ForeignKey("dining_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bill_number: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    receipt_token: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True, index=True, default=lambda: secrets.token_urlsafe(48)
    )
    invoice_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    invoice_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft", server_default="draft", nullable=False, index=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    gst_enabled_snapshot: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    taxable_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    gst_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    cgst_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    sgst_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    igst_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    tax_mode_snapshot: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    gstin_snapshot: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    legal_business_name_snapshot: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    billing_address_snapshot: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    state_name_snapshot: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state_code_snapshot: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR", server_default="INR")
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payment_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    issue_idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_request_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    paid_by_staff_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("staff_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    generated_by_staff_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("staff_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("restaurant_id", "issue_idempotency_key", name="uq_bill_issue_idempotency"),
        UniqueConstraint("restaurant_id", "payment_idempotency_key", name="uq_bill_payment_idempotency"),
        UniqueConstraint("dining_session_id", name="uq_bills_dining_session_id"),
        UniqueConstraint("restaurant_id", "bill_number", name="uq_restaurant_bill_number"),
        UniqueConstraint("restaurant_id", "invoice_number", name="uq_bills_restaurant_invoice_number"),
        UniqueConstraint("restaurant_id", "id", name="uq_bills_restaurant_id_id"),
        ForeignKeyConstraint(
            ["restaurant_id", "dining_session_id"],
            ["dining_sessions.restaurant_id", "dining_sessions.id"],
            name="fk_bills_restaurant_session",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "status IN ('draft', 'issued', 'payment_pending', 'paid', 'cancelled')",
            name="chk_bill_status_valid",
        ),
        CheckConstraint(
            "payment_method IS NULL OR payment_method IN ('counter_cash', 'counter_upi', 'counter_card', 'online')",
            name="chk_bill_payment_method_valid",
        ),
        CheckConstraint("subtotal >= 0", name="chk_bill_subtotal_non_negative"),
        CheckConstraint("tax_amount >= 0", name="chk_bill_tax_amount_non_negative"),
        CheckConstraint("discount_amount >= 0", name="chk_bill_discount_amount_non_negative"),
        CheckConstraint("total_amount >= 0", name="chk_bill_total_amount_non_negative"),
        Index("ix_bills_restaurant_status", "restaurant_id", "status"),
        Index("ix_bills_restaurant_bill_number", "restaurant_id", "bill_number"),
        Index("ix_bills_restaurant_generated_at", "restaurant_id", "generated_at"),
        Index("ix_bills_restaurant_status_generated_at", "restaurant_id", "status", "generated_at"),
    )

    restaurant: Mapped["Restaurant"] = relationship("Restaurant", back_populates="bills", overlaps="bill")
    dining_session: Mapped["DiningSession"] = relationship(
        "DiningSession",
        back_populates="bill",
        foreign_keys=[dining_session_id],
        overlaps="bills,restaurant",
    )
    paid_by_staff: Mapped[Optional["StaffUser"]] = relationship(
        "StaffUser",
        foreign_keys=[paid_by_staff_id],
    )
    generated_by_staff: Mapped[Optional["StaffUser"]] = relationship(
        "StaffUser",
        foreign_keys=[generated_by_staff_id],
    )
