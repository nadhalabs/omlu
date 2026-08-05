"""create print bridge installations table

Revision ID: p1r2i3n4t5b6
Revises: 0a1b2c3d4e5f
Create Date: 2026-08-05 22:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "p1r2i3n4t5b6"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "print_bridge_installations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("installation_id", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("hashed_credential", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="paired", nullable=False),
        sa.Column("paired_by_user_id", sa.String(length=36), nullable=False),
        sa.Column("credential_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("installation_id", name="uq_print_bridge_installation_id"),
    )
    op.create_index(op.f("ix_print_bridge_installations_installation_id"), "print_bridge_installations", ["installation_id"])
    op.create_index(op.f("ix_print_bridge_installations_tenant_id"), "print_bridge_installations", ["tenant_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_print_bridge_installations_tenant_id"), table_name="print_bridge_installations")
    op.drop_index(op.f("ix_print_bridge_installations_installation_id"), table_name="print_bridge_installations")
    op.drop_table("print_bridge_installations")
