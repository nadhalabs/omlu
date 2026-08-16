from datetime import datetime
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SalesLead(Base):
    __tablename__ = "sales_leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    restaurant_name: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(80), nullable=False)
    number_of_outlets: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    selected_plan: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    request_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="new", server_default="new", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        CheckConstraint("number_of_outlets IS NULL OR number_of_outlets BETWEEN 1 AND 1000", name="chk_sales_lead_outlet_count"),
        CheckConstraint("request_type IN ('demo', 'trial')", name="chk_sales_lead_request_type"),
        CheckConstraint(
            "status IN ('new', 'contacted', 'demo_scheduled', 'interested', 'onboarding', 'trial', 'active', 'lost')",
            name="chk_sales_lead_status",
        ),
        Index("ix_sales_leads_created_status", "created_at", "status"),
    )
