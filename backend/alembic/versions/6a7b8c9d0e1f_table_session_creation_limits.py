"""distributed table session creation limits

Revision ID: 6a7b8c9d0e1f
Revises: 5f6a7b8c9d0e
"""
from alembic import op
import sqlalchemy as sa

revision = "6a7b8c9d0e1f"
down_revision = "5f6a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "table_session_creation_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("table_id", sa.Integer(), sa.ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False),
        sa.Column("authority_hash", sa.String(64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("table_id", "authority_hash", name="uq_creation_attempt_table_authority"),
    )
    op.create_index("ix_table_session_creation_attempts_table_id", "table_session_creation_attempts", ["table_id"])


def downgrade() -> None:
    op.drop_table("table_session_creation_attempts")
