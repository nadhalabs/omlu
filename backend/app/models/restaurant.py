from datetime import datetime
from typing import List, Optional
from decimal import Decimal
from sqlalchemy import DateTime, String, Boolean, Integer, Numeric, CheckConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    contact_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Restaurant settings
    timezone: Mapped[str] = mapped_column(String(100), default="Asia/Kolkata", server_default="Asia/Kolkata")
    currency: Mapped[str] = mapped_column(String(10), default="INR", server_default="INR")
    order_prefix: Mapped[str] = mapped_column(String(10), default="NS", server_default="NS")
    service_requests_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    gst_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    gstin: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    legal_business_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    registered_billing_address: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    gst_state_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gst_state_code: Mapped[Optional[str]] = mapped_column(String(2), nullable=True)
    default_gst_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=Decimal("0.00"), server_default="0.00", nullable=False)
    tax_mode: Mapped[str] = mapped_column(String(20), default="exclusive", server_default="exclusive", nullable=False)
    invoice_prefix: Mapped[str] = mapped_column(String(10), default="INV", server_default="INV", nullable=False)
    operating_status: Mapped[str] = mapped_column(String(20), default="open", server_default="open", nullable=False)
    staff_operations_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    staff_locked_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    staff_locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    staff_lock_reason: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    staff_unlocked_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    staff_unlocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    plan: Mapped[str] = mapped_column(String(50), default="free_pilot", server_default="free_pilot", nullable=False)
    subscription_status: Mapped[str] = mapped_column(String(50), default="active", server_default="active", nullable=False)
    trial_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        index=True
    )

    # Relationships
    tables: Mapped[List["RestaurantTable"]] = relationship(
        "RestaurantTable",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )
    menu_categories: Mapped[List["MenuCategory"]] = relationship(
        "MenuCategory",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )
    menu_items: Mapped[List["MenuItem"]] = relationship(
        "MenuItem",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )
    orders: Mapped[List["Order"]] = relationship(
        "Order",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )
    dining_sessions: Mapped[List["DiningSession"]] = relationship(
        "DiningSession",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )
    bills: Mapped[List["Bill"]] = relationship(
        "Bill",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )
    service_requests: Mapped[List["ServiceRequest"]] = relationship(
        "ServiceRequest",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("uq_restaurants_slug_lower", func.lower(slug), unique=True),
        CheckConstraint("operating_status IN ('open', 'closing', 'closed')", name="chk_restaurant_operating_status"),
        CheckConstraint("tax_mode IN ('inclusive', 'exclusive')", name="chk_restaurants_tax_mode"),
        CheckConstraint("default_gst_rate >= 0 AND default_gst_rate <= 100", name="chk_restaurants_gst_rate"),
    )
