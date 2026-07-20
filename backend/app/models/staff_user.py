from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, String, Boolean, ForeignKey, UniqueConstraint, CheckConstraint, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class StaffUser(Base):
    __tablename__ = "staff_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(1024), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(50), default="active", server_default="active", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    security_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    added_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    disabled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    disabled_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    disabled_reason: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    operations_locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    operations_locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    operations_locked_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    operations_lock_reason: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    operations_unlocked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    operations_unlocked_by_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    # Relationships
    restaurant: Mapped["Restaurant"] = relationship("Restaurant")

    # Table constraints and composite indexes
    __table_args__ = (
        UniqueConstraint("restaurant_id", "email", name="uq_staff_user_restaurant_email"),
        UniqueConstraint("restaurant_id", "username", name="uq_staff_user_restaurant_username"),
        CheckConstraint("role IN ('owner', 'admin', 'staff', 'kitchen')", name="chk_staff_user_role"),
        CheckConstraint("status IN ('invited', 'pending', 'active', 'suspended', 'removed')", name="chk_staff_user_status"),
    )


class StaffSession(Base):
    __tablename__ = "staff_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    staff_user_id: Mapped[int] = mapped_column(
        ForeignKey("staff_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    restaurant_id: Mapped[int] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_jti: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    device: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="active", server_default="active", index=True)
    login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_staff_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    staff_user: Mapped["StaffUser"] = relationship("StaffUser")

    __table_args__ = (
        CheckConstraint("status IN ('active', 'revoked')", name="chk_staff_session_status"),
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    previous_value: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
