"""add_counter_payment_fields

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-12 20:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("payment_method", sa.String(length=50), nullable=True))
    op.add_column("bills", sa.Column("payment_reference", sa.String(length=255), nullable=True))
    op.add_column("bills", sa.Column("paid_by_staff_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_bills_paid_by_staff_id_staff_users",
        "bills",
        "staff_users",
        ["paid_by_staff_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bills_paid_by_staff_id", "bills", ["paid_by_staff_id"])
    op.create_check_constraint(
        "chk_bill_payment_method_valid",
        "bills",
        "payment_method IS NULL OR payment_method IN ('counter_cash', 'counter_upi', 'online')",
    )


def downgrade() -> None:
    op.drop_constraint("chk_bill_payment_method_valid", "bills", type_="check")
    op.drop_index("ix_bills_paid_by_staff_id", table_name="bills")
    op.drop_constraint("fk_bills_paid_by_staff_id_staff_users", "bills", type_="foreignkey")
    op.drop_column("bills", "paid_by_staff_id")
    op.drop_column("bills", "payment_reference")
    op.drop_column("bills", "payment_method")
