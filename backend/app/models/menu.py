from datetime import datetime
from typing import List, Optional
from decimal import Decimal
from sqlalchemy import DateTime, ForeignKey, String, Boolean, Numeric, CheckConstraint, UniqueConstraint, func
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
    option_group_links: Mapped[List["MenuItemOptionGroup"]] = relationship(
        "MenuItemOptionGroup",
        back_populates="menu_item",
        cascade="all, delete-orphan",
    )


class MenuOptionGroup(Base):
    __tablename__ = "menu_option_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(
        String(50),
        CheckConstraint("type IN ('variant', 'addon')", name="chk_menu_option_group_type"),
        nullable=False,
        index=True,
    )
    required: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    minimum_selections: Mapped[int] = mapped_column(default=0, server_default="0", nullable=False)
    maximum_selections: Mapped[int] = mapped_column(default=1, server_default="1", nullable=False)
    display_order: Mapped[int] = mapped_column(default=0, server_default="0", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("minimum_selections >= 0", name="chk_menu_option_group_min_non_negative"),
        CheckConstraint("maximum_selections >= 0", name="chk_menu_option_group_max_non_negative"),
        CheckConstraint("maximum_selections >= minimum_selections", name="chk_menu_option_group_max_gte_min"),
    )

    options: Mapped[List["MenuOption"]] = relationship(
        "MenuOption",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    item_links: Mapped[List["MenuItemOptionGroup"]] = relationship(
        "MenuItemOptionGroup",
        back_populates="group",
        cascade="all, delete-orphan",
    )


class MenuOption(Base):
    __tablename__ = "menu_options"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    group_id: Mapped[int] = mapped_column(
        ForeignKey("menu_option_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price_delta: Mapped[Decimal] = mapped_column(
        Numeric(10, 2),
        CheckConstraint("price_delta >= 0", name="chk_menu_option_price_delta_non_negative"),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0",
    )
    available: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    display_order: Mapped[int] = mapped_column(default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    group: Mapped["MenuOptionGroup"] = relationship("MenuOptionGroup", back_populates="options")


class MenuItemOptionGroup(Base):
    __tablename__ = "menu_item_option_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    menu_item_id: Mapped[int] = mapped_column(
        ForeignKey("menu_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    option_group_id: Mapped[int] = mapped_column(
        ForeignKey("menu_option_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    display_order: Mapped[int] = mapped_column(default=0, server_default="0", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("menu_item_id", "option_group_id", name="uq_menu_item_option_group"),
    )

    menu_item: Mapped["MenuItem"] = relationship("MenuItem", back_populates="option_group_links")
    group: Mapped["MenuOptionGroup"] = relationship("MenuOptionGroup", back_populates="item_links")
