from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuickSale(Base):
    __tablename__ = "quick_sales"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(64), nullable=False)
    public_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    payment_idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    payment_request_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    sale_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    note: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    discount_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    tax_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
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
    customer_tax_type: Mapped[str] = mapped_column(String(10), default="b2c", server_default="b2c", nullable=False)
    customer_gstin_snapshot: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    customer_legal_name_snapshot: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    customer_state_code_snapshot: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    customer_state_name_snapshot: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    place_of_supply_code_snapshot: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    invoice_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
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
        UniqueConstraint("restaurant_id", "payment_idempotency_key", name="uq_quick_sale_payment_idempotency"),
        UniqueConstraint("restaurant_id", "invoice_number", name="uq_quick_sales_restaurant_invoice_number"),
        UniqueConstraint("restaurant_id", "id", name="uq_quick_sales_restaurant_id_id"),
        CheckConstraint("sale_type IN ('takeaway', 'late_entry')", name="chk_quick_sale_type"),
        CheckConstraint("source IN ('takeaway', 'late_entry')", name="chk_quick_sale_source"),
        CheckConstraint("status IN ('pending', 'accepted', 'preparing', 'ready', 'served', 'completed')", name="chk_quick_sale_status"),
        CheckConstraint("payment_method IS NULL OR payment_method IN ('cash', 'upi')", name="chk_quick_sale_payment_method"),
        CheckConstraint("subtotal >= 0 AND total_amount >= 0", name="chk_quick_sale_amounts"),
        CheckConstraint("discount_amount >= 0", name="chk_quick_sale_discount_nonnegative"),
        CheckConstraint("tax_amount >= 0", name="chk_quick_sale_tax_nonnegative"),
        CheckConstraint("customer_tax_type IN ('b2c', 'b2b')", name="chk_quick_sale_customer_tax_type"),
    )


class QuickSaleItem(Base):
    __tablename__ = "quick_sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    quick_sale_id: Mapped[int] = mapped_column(ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[Optional[int]] = mapped_column(ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True)
    category_id_snapshot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    category_name_snapshot: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    item_note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    hsn_sac_code_snapshot: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    gst_rate_snapshot: Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 2), nullable=True)
    taxable_amount_snapshot: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    cgst_amount_snapshot: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    sgst_amount_snapshot: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    igst_amount_snapshot: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)

    sale: Mapped[QuickSale] = relationship("QuickSale", back_populates="items")
    selected_options: Mapped[List["QuickSaleItemSelectedOption"]] = relationship(
        "QuickSaleItemSelectedOption",
        back_populates="quick_sale_item",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("quantity > 0", name="chk_quick_sale_item_quantity"),
        CheckConstraint("base_price >= 0 AND unit_price >= 0 AND total_price >= 0", name="chk_quick_sale_item_amounts"),
    )


class QuickSaleItemSelectedOption(Base):
    __tablename__ = "quick_sale_item_selected_options"

    id: Mapped[int] = mapped_column(primary_key=True)
    quick_sale_item_id: Mapped[int] = mapped_column(
        ForeignKey("quick_sale_items.id", ondelete="CASCADE", deferrable=True, initially="DEFERRED"),
        nullable=False,
        index=True,
    )
    menu_option_id: Mapped[Optional[int]] = mapped_column(ForeignKey("menu_options.id", ondelete="SET NULL"), nullable=True, index=True)
    menu_option_group_id: Mapped[Optional[int]] = mapped_column(ForeignKey("menu_option_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    option_name: Mapped[str] = mapped_column(String(255), nullable=False)
    kitchen_display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    group_name: Mapped[str] = mapped_column(String(255), nullable=False)
    option_type: Mapped[str] = mapped_column(String(50), nullable=False)
    price_delta: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    quick_sale_item: Mapped[QuickSaleItem] = relationship("QuickSaleItem", back_populates="selected_options")

    __table_args__ = (
        CheckConstraint("price_delta >= 0", name="chk_quick_sale_option_price_nonnegative"),
        CheckConstraint("quantity > 0", name="chk_quick_sale_option_quantity_positive"),
    )
