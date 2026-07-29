from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TableSessionParticipant(Base):
    __tablename__ = "table_session_participants"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    label_number: Mapped[int] = mapped_column(Integer, nullable=False)
    display_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    revoked_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    revocation_reason: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_ip_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    device_fingerprint_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    session: Mapped["DiningSession"] = relationship("DiningSession", back_populates="participants")

    __table_args__ = (
        UniqueConstraint("session_id", "label_number", name="uq_table_participant_session_label"),
        Index("ix_table_participant_authority", "restaurant_id", "table_id", "session_id", "revoked_at"),
    )


class TableSessionJoinAttempt(Base):
    __tablename__ = "table_session_join_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    authority_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    failed_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    blocked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("session_id", "authority_hash", name="uq_join_attempt_session_authority"),)


class TableSessionCreationAttempt(Base):
    __tablename__ = "table_session_creation_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    authority_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    blocked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("table_id", "authority_hash", name="uq_creation_attempt_table_authority"),)
