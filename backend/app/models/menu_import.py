import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class MenuImportJob(Base):
    __tablename__ = "menu_import_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    restaurant_id: Mapped[int] = mapped_column(ForeignKey("restaurants.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("staff_users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="processing")
    source_type: Mapped[str] = mapped_column(String(30), nullable=False, default="images")
    original_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    draft_items: Mapped[list["MenuImportDraftItem"]] = relationship(cascade="all, delete-orphan")


class MenuImportDraftItem(Base):
    __tablename__ = "menu_import_draft_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    import_job_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("menu_import_jobs.id", ondelete="CASCADE"), index=True
    )
    category_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    item_name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    food_type: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    variants: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    warnings: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    item_confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    category_confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False)
    selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

