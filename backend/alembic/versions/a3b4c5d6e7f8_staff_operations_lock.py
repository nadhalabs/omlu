"""staff operations lock and restaurant operating state

Revision ID: a3b4c5d6e7f8
Revises: 0a1b2c3d4e5f
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "0a1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("operating_status", sa.String(20), nullable=False, server_default="open"))
    op.add_column("restaurants", sa.Column("staff_operations_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("restaurants", sa.Column("staff_locked_by_id", sa.Integer(), nullable=True))
    op.add_column("restaurants", sa.Column("staff_locked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("restaurants", sa.Column("staff_lock_reason", sa.String(1024), nullable=True))
    op.add_column("restaurants", sa.Column("staff_unlocked_by_id", sa.Integer(), nullable=True))
    op.add_column("restaurants", sa.Column("staff_unlocked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_check_constraint("chk_restaurant_operating_status", "restaurants", "operating_status IN ('open', 'closing', 'closed')")
    op.add_column("staff_users", sa.Column("operations_locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("staff_users", sa.Column("operations_locked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("staff_users", sa.Column("operations_locked_by_id", sa.Integer(), nullable=True))
    op.add_column("staff_users", sa.Column("operations_lock_reason", sa.String(1024), nullable=True))
    op.add_column("staff_users", sa.Column("operations_unlocked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("staff_users", sa.Column("operations_unlocked_by_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    for column in ("operations_unlocked_by_id", "operations_unlocked_at", "operations_lock_reason", "operations_locked_by_id", "operations_locked_at", "operations_locked"):
        op.drop_column("staff_users", column)
    op.drop_constraint("chk_restaurant_operating_status", "restaurants", type_="check")
    for column in ("staff_unlocked_at", "staff_unlocked_by_id", "staff_lock_reason", "staff_locked_at", "staff_locked_by_id", "staff_operations_locked", "operating_status"):
        op.drop_column("restaurants", column)
