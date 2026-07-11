from datetime import datetime
from typing import List, Optional
from sqlalchemy import DateTime, String, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class Restaurant(Base):
    __tablename__ = "restaurants"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    slug: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Restaurant settings
    timezone: Mapped[str] = mapped_column(String(100), default="Asia/Kolkata", server_default="Asia/Kolkata")
    currency: Mapped[str] = mapped_column(String(10), default="INR", server_default="INR")
    order_prefix: Mapped[str] = mapped_column(String(10), default="NS", server_default="NS")
    service_requests_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
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
    service_requests: Mapped[List["ServiceRequest"]] = relationship(
        "ServiceRequest",
        back_populates="restaurant",
        cascade="all, delete-orphan"
    )

