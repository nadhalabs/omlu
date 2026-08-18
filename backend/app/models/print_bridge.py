import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from app.database import Base

class PrintBridgeInstallation(Base):
    __tablename__ = "print_bridge_installations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    installation_id = Column(String(64), unique=True, nullable=False, index=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    hashed_credential = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="paired")  # paired, revoked
    paired_by_user_id = Column(String(36), nullable=False)
    credential_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    kitchen_printer_configured = Column(Boolean, nullable=False, default=False, server_default="false")
    kitchen_printer_label = Column(String(100), nullable=True)
    kitchen_printer_last_success_at = Column(DateTime(timezone=True), nullable=True)
    billing_printer_configured = Column(Boolean, nullable=False, default=False, server_default="false")
    billing_printer_label = Column(String(100), nullable=True)
    billing_printer_last_success_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "installation_id": self.installation_id,
            "tenant_id": self.tenant_id,
            "status": self.status,
            "paired_by_user_id": self.paired_by_user_id,
            "credential_version": self.credential_version,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "last_seen_at": self.last_seen_at.isoformat() if self.last_seen_at else None,
            "kitchen_printer_configured": self.kitchen_printer_configured,
            "kitchen_printer_label": self.kitchen_printer_label,
            "kitchen_printer_last_success_at": self.kitchen_printer_last_success_at.isoformat() if self.kitchen_printer_last_success_at else None,
            "billing_printer_configured": self.billing_printer_configured,
            "billing_printer_label": self.billing_printer_label,
            "billing_printer_last_success_at": self.billing_printer_last_success_at.isoformat() if self.billing_printer_last_success_at else None,
            "revoked_at": self.revoked_at.isoformat() if self.revoked_at else None,
        }

class PrintBridgePairingChallenge(Base):
    __tablename__ = "print_bridge_pairing_challenges"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    installation_id = Column(String(64), nullable=False, index=True)
    tenant_id = Column(String(36), nullable=False, index=True)
    creator_user_id = Column(String(36), nullable=False)
    hashed_pairing_code = Column(String(64), nullable=False)
    attempt_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=False)
    consumed_at = Column(DateTime(timezone=True), nullable=True)

    def is_valid(self) -> bool:
        now = datetime.now(timezone.utc)
        if self.consumed_at is not None:
            return False
        if self.attempt_count >= 3:
            return False
        if self.expires_at.tzinfo is None:
            exp = self.expires_at.replace(tzinfo=timezone.utc)
        else:
            exp = self.expires_at
        return now < exp


class KitchenPrintJob(Base):
    __tablename__ = "kitchen_print_jobs"
    __table_args__ = (UniqueConstraint("restaurant_id", "idempotency_key", name="uq_kitchen_print_job_key"),)

    id = Column(Integer, primary_key=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=True, index=True)
    quick_sale_id = Column(Integer, ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=True, index=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id", ondelete="CASCADE"), nullable=True, index=True)
    document_type = Column(String(30), nullable=False)
    idempotency_key = Column(String(255), nullable=False)
    destination = Column(String(30), nullable=False, default="kitchen")
    payload = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending", server_default="pending", index=True)
    retry_count = Column(Integer, nullable=False, default=0, server_default="0")
    failure_message = Column(String(500), nullable=True)
    claimed_by_installation_id = Column(String(64), nullable=True, index=True)
    claimed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    printed_at = Column(DateTime(timezone=True), nullable=True)
