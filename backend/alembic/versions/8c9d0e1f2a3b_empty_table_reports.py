"""empty table reports

Revision ID: 8c9d0e1f2a3b
Revises: 7b8c9d0e1f2a
"""
from alembic import op
import sqlalchemy as sa

revision = "8c9d0e1f2a3b"
down_revision = "7b8c9d0e1f2a"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("orders", sa.Column("cancellation_reason", sa.String(100), nullable=True))
    op.create_table(
        "empty_table_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_id", sa.Integer(), sa.ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reported_by_user_id", sa.Integer(), sa.ForeignKey("staff_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("status", sa.String(40), server_default="open", nullable=False),
        sa.Column("reported_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.Integer(), sa.ForeignKey("staff_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolution_reason", sa.String(100), nullable=True),
        sa.CheckConstraint(
            "status IN ('open', 'dismissed', 'resolved_by_session_close')",
            name="ck_empty_table_reports_status",
        ),
    )
    for column in ("restaurant_id", "table_id", "session_id"):
        op.create_index(f"ix_empty_table_reports_{column}", "empty_table_reports", [column])
    op.create_index("ix_empty_table_reports_restaurant_status", "empty_table_reports", ["restaurant_id", "status"])
    op.create_index("uq_empty_table_reports_open_session", "empty_table_reports", ["session_id"], unique=True, postgresql_where=sa.text("status = 'open'"))

def downgrade() -> None:
    op.drop_table("empty_table_reports")
    op.drop_column("orders", "cancellation_reason")
