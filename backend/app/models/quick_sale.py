from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuickSale(Base):
    __tablename__ = "quick_sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False)
    public_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    sale_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    entered_by_staff_id: Mapped[int] = mapped_column(ForeignKey("staff_users.id", ondelete="RESTRICT"), nullable=False, index=True)
    entered_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    entered_by_role: Mapped[str] = mapped_column(String(50), nullable=False)
    paid_by_staff_id: Mapped[Optional[int]] = mapped_column(ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    paid_by_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    paid_by_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    items: Mapped[List["QuickSaleItem"]] = relationship("QuickSaleItem", back_populates="sale", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("restaurant_id", "order_number", name="uq_quick_sale_restaurant_order_number"),
        UniqueConstraint("restaurant_id", "idempotency_key", name="uq_quick_sale_restaurant_idempotency"),
        CheckConstraint("sale_type IN ('takeaway', 'late_entry')", name="chk_quick_sale_type"),
        CheckConstraint("source IN ('takeaway', 'late_entry')", name="chk_quick_sale_source"),
        CheckConstraint("status IN ('pending', 'accepted', 'preparing', 'ready', 'completed')", name="chk_quick_sale_status"),
        CheckConstraint("payment_method IS NULL OR payment_method IN ('cash', 'upi')", name="chk_quick_sale_payment_method"),
        CheckConstraint("subtotal >= 0 AND total_amount >= 0", name="chk_quick_sale_amounts"),
    )


class QuickSaleItem(Base):
    __tablename__ = "quick_sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    quick_sale_id: Mapped[int] = mapped_column(ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    sale: Mapped[QuickSale] = relationship("QuickSale", back_populates="items")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_quick_sale_item_quantity"),
        CheckConstraint("unit_price >= 0 AND total_price >= 0", name="chk_quick_sale_item_amounts"),
    )
