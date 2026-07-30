from sqlalchemy import ForeignKey, String, Boolean, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        index=True
    )
    table_number: Mapped[str] = mapped_column(String(50))
    table_code: Mapped[str] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Composite Unique Constraint
    __table_args__ = (
        UniqueConstraint("restaurant_id", "table_code", name="uq_restaurant_table_code"),
        UniqueConstraint("restaurant_id", "id", name="uq_restaurant_tables_restaurant_id_id"),
        Index(
            "uq_restaurant_tables_active_number",
            "restaurant_id",
            "table_number",
            unique=True,
            postgresql_where=(is_active.is_(True)),
            sqlite_where=(is_active.is_(True)),
        ),
    )

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship(
        "Restaurant",
        back_populates="tables"
    )
    orders: Mapped[list["Order"]] = relationship(
        "Order",
        back_populates="table",
        foreign_keys="Order.table_id",
        cascade="all, delete-orphan",
        overlaps="orders",
    )
    dining_sessions: Mapped[list["DiningSession"]] = relationship(
        "DiningSession",
        back_populates="table",
        foreign_keys="DiningSession.table_id",
        cascade="all, delete-orphan",
        overlaps="dining_sessions",
    )
