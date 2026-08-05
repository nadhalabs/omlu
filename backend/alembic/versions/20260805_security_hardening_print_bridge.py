"""security hardening print bridge pairing challenges

Revision ID: s1h2p3b4c5d6
Revises: p1r2i3n4t5b6
Create Date: 2026-08-05 23:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "s1h2p3b4c5d6"
down_revision: Union[str, None] = "p1r2i3n4t5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "print_bridge_pairing_challenges",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("installation_id", sa.String(length=64), nullable=False),
        sa.Column("tenant_id", sa.String(length=36), nullable=False),
        sa.Column("creator_user_id", sa.String(length=36), nullable=False),
        sa.Column("hashed_pairing_code", sa.String(length=64), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_print_bridge_pairing_challenges_installation_id",
        "print_bridge_pairing_challenges",
        ["installation_id"],
        unique=False,
    )
    op.create_index(
        "ix_print_bridge_pairing_challenges_tenant_id",
        "print_bridge_pairing_challenges",
        ["tenant_id"],
        unique=False,
    )

def downgrade() -> None:
    op.drop_index(
        "ix_print_bridge_pairing_challenges_tenant_id",
        table_name="print_bridge_pairing_challenges",
    )
    op.drop_index(
        "ix_print_bridge_pairing_challenges_installation_id",
        table_name="print_bridge_pairing_challenges",
    )
    op.drop_table("print_bridge_pairing_challenges")
