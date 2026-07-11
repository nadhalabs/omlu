from typing import List, Optional
from decimal import Decimal
from sqlalchemy import ForeignKey, String, Boolean, Numeric, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class MenuCategory(Base):
    __tablename__ = "menu_categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        index=True
    )
    name_en: Mapped[str] = mapped_column(String(255))
    name_ml: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    display_order: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship(
        "Restaurant",
        back_populates="menu_categories"
    )
    items: Mapped[List["MenuItem"]] = relationship(
        "MenuItem",
        back_populates="category",
        cascade="all, delete-orphan"
    )

class MenuItem(Base):
    __tablename__ = "menu_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("menu_categories.id", ondelete="CASCADE"),
        index=True
    )
    name_en: Mapped[str] = mapped_column(String(255))
    name_ml: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description_en: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    description_ml: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    price: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        CheckConstraint("price >= 0", name="chk_menu_item_price_positive")
    )
    image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(default=0)

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship(
        "Restaurant",
        back_populates="menu_items"
    )
    category: Mapped["MenuCategory"] = relationship(
        "MenuCategory",
        back_populates="items"
    )
    order_items: Mapped[List["OrderItem"]] = relationship(
        "OrderItem",
        back_populates="menu_item"
    )
