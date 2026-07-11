from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, Integer, DateTime, CheckConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False
    )
    table_id: Mapped[int] = mapped_column(
        ForeignKey("restaurant_tables.id", ondelete="CASCADE"),
        nullable=False
    )
    order_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"),
        nullable=True
    )
    request_type: Mapped[str] = mapped_column(
        String(50),
        CheckConstraint(
            "request_type IN ('waiter', 'water', 'bill')",
            name="chk_service_request_type_valid"
        )
    )
    status: Mapped[str] = mapped_column(
        String(50),
        CheckConstraint(
            "status IN ('pending', 'resolved', 'cancelled')",
            name="chk_service_request_status_valid"
        ),
        default="pending",
        server_default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
    resolved_by_staff_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("staff_users.id", ondelete="SET NULL"),
        nullable=True
    )

    __table_args__ = (
        Index("ix_service_requests_restaurant_status", "restaurant_id", "status"),
        Index("ix_service_requests_table_type_status", "table_id", "request_type", "status"),
        Index("ix_service_requests_restaurant_created", "restaurant_id", "status", "created_at"),
    )

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship(
        "Restaurant",
        back_populates="service_requests"
    )
    table: Mapped["RestaurantTable"] = relationship("RestaurantTable")
    order: Mapped[Optional["Order"]] = relationship("Order")
    resolver: Mapped[Optional["StaffUser"]] = relationship(
        "StaffUser",
        foreign_keys=[resolved_by_staff_id]
    )
