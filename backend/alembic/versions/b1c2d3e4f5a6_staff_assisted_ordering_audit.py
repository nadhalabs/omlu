"""staff_assisted_ordering_audit

Revision ID: b1c2d3e4f5a6
Revises: a9b8c7d6e5f4
Create Date: 2026-07-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("source", sa.String(length=50), server_default="qr", nullable=False))
    op.add_column("orders", sa.Column("created_by_staff_id", sa.Integer(), nullable=True))
    op.create_index("ix_orders_created_by_staff_id", "orders", ["created_by_staff_id"])
    op.add_column("dining_sessions", sa.Column("opened_by_staff_id", sa.Integer(), nullable=True))
    op.add_column("dining_sessions", sa.Column("closed_by_staff_id", sa.Integer(), nullable=True))
    op.create_index("ix_dining_sessions_opened_by_staff_id", "dining_sessions", ["opened_by_staff_id"])
    op.create_index("ix_dining_sessions_closed_by_staff_id", "dining_sessions", ["closed_by_staff_id"])
    op.add_column("bills", sa.Column("generated_by_staff_id", sa.Integer(), nullable=True))
    op.create_index("ix_bills_generated_by_staff_id", "bills", ["generated_by_staff_id"])
    op.drop_constraint("chk_bill_payment_method_valid", "bills", type_="check")
    op.create_check_constraint(
        "chk_bill_payment_method_valid",
        "bills",
        "payment_method IS NULL OR payment_method IN ('counter_cash', 'counter_upi', 'counter_card', 'online')",
    )


def downgrade() -> None:
    op.drop_constraint("chk_bill_payment_method_valid", "bills", type_="check")
    op.create_check_constraint(
        "chk_bill_payment_method_valid",
        "bills",
        "payment_method IS NULL OR payment_method IN ('counter_cash', 'counter_upi', 'online')",
    )
    op.drop_index("ix_bills_generated_by_staff_id", table_name="bills")
    op.drop_column("bills", "generated_by_staff_id")
    op.drop_index("ix_dining_sessions_closed_by_staff_id", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_opened_by_staff_id", table_name="dining_sessions")
    op.drop_column("dining_sessions", "closed_by_staff_id")
    op.drop_column("dining_sessions", "opened_by_staff_id")
    op.drop_index("ix_orders_created_by_staff_id", table_name="orders")
    op.drop_column("orders", "created_by_staff_id")
    op.drop_column("orders", "source")
