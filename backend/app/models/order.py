from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import ForeignKey, String, Numeric, CheckConstraint, UniqueConstraint, DateTime, Integer, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class RestaurantDailySequence(Base):
    __tablename__ = "restaurant_daily_sequences"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        index=True
    )
    sequence_date: Mapped[date] = mapped_column(Date, index=True)
    last_value: Mapped[int] = mapped_column(Integer, default=0)

    # Composite Unique Constraint
    __table_args__ = (
        UniqueConstraint("restaurant_id", "sequence_date", name="uq_restaurant_daily_sequence_date"),
    )

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        index=True
    )
    table_id: Mapped[int] = mapped_column(
        ForeignKey("restaurant_tables.id", ondelete="CASCADE"),
        index=True
    )
    dining_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("dining_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    order_number: Mapped[str] = mapped_column(String(50))
    public_token: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    status: Mapped[str] = mapped_column(
        String(50),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'preparing', 'ready', 'served', 'rejected')",
            name="chk_order_status_valid"
        ),
        index=True
    )
    subtotal: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        CheckConstraint("subtotal >= 0", name="chk_order_subtotal_positive")
    )
    customer_note: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="customer_qr", server_default="customer_qr")
    created_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )

    # Composite Unique Constraints
    __table_args__ = (
        UniqueConstraint("restaurant_id", "order_number", name="uq_restaurant_order_number"),
        UniqueConstraint("restaurant_id", "idempotency_key", name="uq_restaurant_id_idempotency_key"),
    )

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship(
        "Restaurant",
        back_populates="orders"
    )
    table: Mapped["RestaurantTable"] = relationship(
        "RestaurantTable",
        back_populates="orders"
    )
    dining_session: Mapped[Optional["DiningSession"]] = relationship(
        "DiningSession",
        back_populates="orders"
    )
    items: Mapped[List["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="order",
        cascade="all, delete-orphan"
    )
    status_history: Mapped[List["OrderStatusHistory"]] = relationship(
        "OrderStatusHistory",
        back_populates="order",
        cascade="all, delete-orphan"
    )

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        index=True
    )
    menu_item_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("menu_items.id", ondelete="SET NULL"),
        nullable=True
    )
    item_name: Mapped[str] = mapped_column(String(255))
    quantity: Mapped[int] = mapped_column(
        CheckConstraint("quantity > 0", name="chk_order_item_quantity_positive")
    )
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        CheckConstraint("unit_price >= 0", name="chk_order_item_unit_price_positive")
    )
    total_price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        CheckConstraint("total_price >= 0", name="chk_order_item_total_price_positive")
    )
    item_note: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # Relationships
    order: Mapped["Order"] = relationship(
        "Order",
        back_populates="items"
    )
    menu_item: Mapped[Optional["MenuItem"]] = relationship(
        "MenuItem",
        back_populates="order_items"
    )
    selected_options: Mapped[List["OrderItemSelectedOption"]] = relationship(
        "OrderItemSelectedOption",
        back_populates="order_item",
        cascade="all, delete-orphan",
    )


class OrderItemSelectedOption(Base):
    __tablename__ = "order_item_selected_options"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_item_id: Mapped[int] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    menu_option_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("menu_options.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    menu_option_group_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("menu_option_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    option_name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_name: Mapped[str] = mapped_column(String(255), nullable=False)
    option_type: Mapped[str] = mapped_column(String(50), nullable=False)
    price_delta: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        CheckConstraint("price_delta >= 0", name="chk_order_item_selected_option_price_delta_non_negative"),
        nullable=False,
    )
    quantity: Mapped[int] = mapped_column(
        Integer,
        CheckConstraint("quantity > 0", name="chk_order_item_selected_option_quantity_positive"),
        default=1,
        server_default="1",
        nullable=False,
    )
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    order_item: Mapped["OrderItem"] = relationship("OrderItem", back_populates="selected_options")

class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(
        ForeignKey("orders.id", ondelete="CASCADE"),
        index=True
    )
    old_status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    new_status: Mapped[str] = mapped_column(String(50))
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )
    changed_by_staff_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True
    )

    # Relationships
    order: Mapped["Order"] = relationship(
        "Order",
        back_populates="status_history"
    )
