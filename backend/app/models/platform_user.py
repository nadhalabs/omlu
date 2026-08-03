from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, String, Boolean, ForeignKey, UniqueConstraint, CheckConstraint, Index, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class PlatformUser(Base):
    __tablename__ = "platform_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(1024), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="platform_support", server_default="platform_support", index=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active", server_default="active", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False, index=True)
    security_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

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

    __table_args__ = (
        Index("uq_platform_users_email_lower", func.lower(email), unique=True),
        Index("uq_platform_users_username_lower", func.lower(username), unique=True),
        CheckConstraint("role IN ('platform_owner', 'platform_admin', 'platform_support', 'platform_readonly')", name="chk_platform_user_role"),
        CheckConstraint("status IN ('active', 'suspended', 'removed')", name="chk_platform_user_status"),
    )


class PlatformSession(Base):
    __tablename__ = "platform_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    platform_user_id: Mapped[int] = mapped_column(
        ForeignKey("platform_users.id", ondelete="CASCADE"),
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

    platform_user: Mapped["PlatformUser"] = relationship("PlatformUser")

    __table_args__ = (
        CheckConstraint("status IN ('active', 'revoked')", name="chk_platform_session_status"),
    )


class PlatformAuditLog(Base):
    __tablename__ = "platform_audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int] = mapped_column(ForeignKey("platform_users.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_type: Mapped[str] = mapped_column(String(100), nullable=False)
    target_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    restaurant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True, index=True)
    previous_value: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    new_value: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    actor_user: Mapped[Optional["PlatformUser"]] = relationship("PlatformUser")
