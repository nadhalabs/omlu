from datetime import datetime
from typing import List, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CinemaScreen(Base):
    __tablename__ = "cinema_screens"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    code: Mapped[str] = mapped_column(String(30))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    seats: Mapped[List["CinemaSeat"]] = relationship("CinemaSeat", back_populates="screen", cascade="all, delete-orphan", foreign_keys="CinemaSeat.cinema_screen_id")
    __table_args__ = (
        UniqueConstraint("restaurant_id", "id", name="uq_cinema_screens_tenant_id"),
        Index("uq_cinema_screens_tenant_code_lower", "restaurant_id", func.lower(code), unique=True),
    )


class CinemaSeat(Base):
    __tablename__ = "cinema_seats"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    cinema_screen_id: Mapped[int] = mapped_column(ForeignKey("cinema_screens.id", ondelete="RESTRICT"), index=True)
    row_label: Mapped[str] = mapped_column(String(10))
    seat_number: Mapped[int] = mapped_column(Integer)
    public_code: Mapped[str] = mapped_column(String(30))
    position_index: Mapped[int] = mapped_column(Integer)
    layout_x: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    layout_y: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    aisle_after: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_accessible: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    screen: Mapped[CinemaScreen] = relationship("CinemaScreen", back_populates="seats", foreign_keys=[cinema_screen_id])
    __table_args__ = (
        UniqueConstraint("restaurant_id", "id", name="uq_cinema_seats_tenant_id"),
        UniqueConstraint("cinema_screen_id", "id", name="uq_cinema_seats_screen_id"),
        UniqueConstraint("cinema_screen_id", "row_label", "seat_number", name="uq_cinema_seat_position"),
        Index("uq_cinema_seat_public_code_lower", "cinema_screen_id", func.lower(public_code), unique=True),
        ForeignKeyConstraint(["restaurant_id", "cinema_screen_id"], ["cinema_screens.restaurant_id", "cinema_screens.id"], name="fk_cinema_seat_tenant_screen", ondelete="RESTRICT"),
        CheckConstraint("seat_number > 0 AND position_index >= 0 AND layout_x >= 0 AND layout_y >= 0", name="chk_cinema_seat_position"),
    )


class CinemaSeatSession(Base):
    __tablename__ = "cinema_seat_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    cinema_screen_id: Mapped[int] = mapped_column(ForeignKey("cinema_screens.id", ondelete="RESTRICT"), index=True)
    cinema_seat_id: Mapped[int] = mapped_column(ForeignKey("cinema_seats.id", ondelete="RESTRICT"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    seat: Mapped[CinemaSeat] = relationship("CinemaSeat", foreign_keys=[cinema_seat_id])
    screen: Mapped[CinemaScreen] = relationship("CinemaScreen", foreign_keys=[cinema_screen_id])
    __table_args__ = (
        ForeignKeyConstraint(["restaurant_id", "cinema_screen_id"], ["cinema_screens.restaurant_id", "cinema_screens.id"], name="fk_cinema_session_tenant_screen"),
        ForeignKeyConstraint(["restaurant_id", "cinema_seat_id"], ["cinema_seats.restaurant_id", "cinema_seats.id"], name="fk_cinema_session_tenant_seat"),
        ForeignKeyConstraint(["cinema_screen_id", "cinema_seat_id"], ["cinema_seats.cinema_screen_id", "cinema_seats.id"], name="fk_cinema_session_screen_seat"),
        UniqueConstraint("restaurant_id", "cinema_seat_id", "id", name="uq_cinema_sessions_tenant_seat_id"),
    )
