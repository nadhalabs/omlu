from datetime import datetime
from typing import Optional
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class EmptyTableReport(Base):
    __tablename__ = "empty_table_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_by_user_id: Mapped[int] = mapped_column(ForeignKey("staff_users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="open", server_default="open")
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True)
    resolution_reason: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'dismissed', 'resolved_by_session_close')",
            name="ck_empty_table_reports_status",
        ),
        Index("uq_empty_table_reports_open_session", "session_id", unique=True, postgresql_where=text("status = 'open'"), sqlite_where=text("status = 'open'")),
        Index("ix_empty_table_reports_restaurant_status", "restaurant_id", "status"),
    )
