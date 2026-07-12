"""add_bills

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-12 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "restaurant_bill_daily_sequences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("sequence_date", sa.Date(), nullable=False),
        sa.Column("last_value", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("restaurant_id", "sequence_date", name="uq_restaurant_bill_daily_sequence_date"),
    )
    op.create_index("ix_restaurant_bill_daily_sequences_restaurant_id", "restaurant_bill_daily_sequences", ["restaurant_id"])
    op.create_index("ix_restaurant_bill_daily_sequences_sequence_date", "restaurant_bill_daily_sequences", ["sequence_date"])

    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("dining_session_id", sa.Integer(), nullable=False),
        sa.Column("bill_number", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="draft", nullable=False),
        sa.Column("subtotal", sa.Numeric(precision=10, scale=2), server_default="0", nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=10, scale=2), server_default="0", nullable=False),
        sa.Column("discount_amount", sa.Numeric(precision=10, scale=2), server_default="0", nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=10, scale=2), server_default="0", nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'issued', 'payment_pending', 'paid', 'cancelled')",
            name="chk_bill_status_valid",
        ),
        sa.CheckConstraint("subtotal >= 0", name="chk_bill_subtotal_non_negative"),
        sa.CheckConstraint("tax_amount >= 0", name="chk_bill_tax_amount_non_negative"),
        sa.CheckConstraint("discount_amount >= 0", name="chk_bill_discount_amount_non_negative"),
        sa.CheckConstraint("total_amount >= 0", name="chk_bill_total_amount_non_negative"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["dining_session_id"], ["dining_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dining_session_id", name="uq_bills_dining_session_id"),
        sa.UniqueConstraint("restaurant_id", "bill_number", name="uq_restaurant_bill_number"),
    )
    op.create_index("ix_bills_restaurant_id", "bills", ["restaurant_id"])
    op.create_index("ix_bills_dining_session_id", "bills", ["dining_session_id"])
    op.create_index("ix_bills_status", "bills", ["status"])
    op.create_index("ix_bills_bill_number", "bills", ["bill_number"])
    op.create_index("ix_bills_restaurant_status", "bills", ["restaurant_id", "status"])
    op.create_index("ix_bills_restaurant_bill_number", "bills", ["restaurant_id", "bill_number"])


def downgrade() -> None:
    op.drop_index("ix_bills_restaurant_bill_number", table_name="bills")
    op.drop_index("ix_bills_restaurant_status", table_name="bills")
    op.drop_index("ix_bills_bill_number", table_name="bills")
    op.drop_index("ix_bills_status", table_name="bills")
    op.drop_index("ix_bills_dining_session_id", table_name="bills")
    op.drop_index("ix_bills_restaurant_id", table_name="bills")
    op.drop_table("bills")
    op.drop_index("ix_restaurant_bill_daily_sequences_sequence_date", table_name="restaurant_bill_daily_sequences")
    op.drop_index("ix_restaurant_bill_daily_sequences_restaurant_id", table_name="restaurant_bill_daily_sequences")
    op.drop_table("restaurant_bill_daily_sequences")
