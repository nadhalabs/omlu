from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


DINING_SESSION_STATUSES = (
    "open",
    "payment_requested",
    "payment_pending",
    "detached_awaiting_payment",
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
    opened_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    closed_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    detached_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    detached_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    join_code_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    join_code_ciphertext: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    join_code_created_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    join_code_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    join_code_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)

    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'payment_requested', 'payment_pending', 'detached_awaiting_payment', 'paid', 'closed', 'cancelled')",
            name="chk_dining_session_status_valid",
        ),
        UniqueConstraint("restaurant_id", "id", name="uq_dining_sessions_restaurant_id_id"),
        ForeignKeyConstraint(
            ["restaurant_id", "table_id"],
            ["restaurant_tables.restaurant_id", "restaurant_tables.id"],
            name="fk_dining_sessions_restaurant_table",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["restaurant_id", "detached_by_staff_id"],
            ["staff_users.restaurant_id", "staff_users.id"],
            name="fk_dining_sessions_restaurant_detached_by_staff",
        ),
        Index("ix_dining_sessions_restaurant_status", "restaurant_id", "status"),
        Index("ix_dining_sessions_table_status", "table_id", "status"),
        Index("ix_dining_sessions_restaurant_opened_at", "restaurant_id", "opened_at"),
        Index("ix_dining_sessions_restaurant_status_opened_at", "restaurant_id", "status", "opened_at"),
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
        overlaps="dining_sessions",
    )
    table: Mapped["RestaurantTable"] = relationship(
        "RestaurantTable",
        back_populates="dining_sessions",
        foreign_keys=[table_id],
        overlaps="dining_sessions,restaurant",
    )
    orders: Mapped[List["Order"]] = relationship(
        "Order",
        back_populates="dining_session",
        foreign_keys="Order.dining_session_id",
        overlaps="orders,restaurant,table",
    )
    bill: Mapped[Optional["Bill"]] = relationship(
        "Bill",
        back_populates="dining_session",
        foreign_keys="Bill.dining_session_id",
        uselist=False,
        overlaps="bills",
    )
    participants: Mapped[List["TableSessionParticipant"]] = relationship(
        "TableSessionParticipant",
        back_populates="session",
        cascade="all, delete-orphan",
    )

    @property
    def subtotal(self) -> Decimal:
        return sum((order.subtotal for order in self.orders), Decimal("0.00"))
