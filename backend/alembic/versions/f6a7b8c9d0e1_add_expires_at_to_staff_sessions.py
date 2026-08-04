"""add expires_at to staff_sessions

Revision ID: f6a7b8c9d0e1
Revises: f5e6d7c8b9a0
Create Date: 2026-08-04 23:55:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "a6b7c8d9e0f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staff_sessions",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        op.f("ix_staff_sessions_expires_at"),
        "staff_sessions",
        ["expires_at"],
        unique=False,
    )
    op.execute(
        "UPDATE staff_sessions SET status = 'revoked', revoked_at = NOW() WHERE status = 'active' AND expires_at IS NULL"
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_staff_sessions_expires_at"), table_name="staff_sessions")
    op.drop_column("staff_sessions", "expires_at")
