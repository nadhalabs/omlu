from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


DINING_SESSION_STATUSES = (
    "open",
    "payment_requested",
    "payment_pending",
    "paid",
    "closed",
    "cancelled",
)

ACTIVE_DINING_SESSION_STATUSES = (
    "open",
    "payment_requested",
    "payment_pending",
)


class DiningSession(Base):
    __tablename__ = "dining_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    table_id: Mapped[int] = mapped_column(
        ForeignKey("restaurant_tables.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    public_token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(50), default="open", server_default="open", index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    payment_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'payment_requested', 'payment_pending', 'paid', 'closed', 'cancelled')",
            name="chk_dining_session_status_valid",
        ),
        Index("ix_dining_sessions_restaurant_status", "restaurant_id", "status"),
        Index("ix_dining_sessions_table_status", "table_id", "status"),
        Index(
            "uq_dining_sessions_one_active_per_table",
            "table_id",
            unique=True,
            postgresql_where=(
                status.in_(ACTIVE_DINING_SESSION_STATUSES)
            ),
            sqlite_where=(
                status.in_(ACTIVE_DINING_SESSION_STATUSES)
            ),
        ),
    )

    restaurant: Mapped["Restaurant"] = relationship(
        "Restaurant",
        back_populates="dining_sessions",
    )
    table: Mapped["RestaurantTable"] = relationship(
        "RestaurantTable",
        back_populates="dining_sessions",
    )
    orders: Mapped[List["Order"]] = relationship(
        "Order",
        back_populates="dining_session",
    )
    bill: Mapped[Optional["Bill"]] = relationship(
        "Bill",
        back_populates="dining_session",
        uselist=False,
    )

    @property
    def subtotal(self) -> Decimal:
        return sum((order.subtotal for order in self.orders), Decimal("0.00"))
