"""customer push subscriptions

Revision ID: 0a1b2c3d4e5f
Revises: c2d3e4f5a6b7
Create Date: 2026-07-14 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0a1b2c3d4e5f"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customer_push_subscriptions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("dining_session_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.Text(), nullable=False),
        sa.Column("auth", sa.Text(), nullable=False),
        sa.Column("user_agent", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_failure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failure_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["dining_session_id"], ["dining_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dining_session_id", "endpoint", name="uq_customer_push_session_endpoint"),
    )
    op.create_index("ix_customer_push_active_session", "customer_push_subscriptions", ["dining_session_id", "status"])
    op.create_index("ix_customer_push_restaurant_status", "customer_push_subscriptions", ["restaurant_id", "status"])
    op.create_index(op.f("ix_customer_push_subscriptions_dining_session_id"), "customer_push_subscriptions", ["dining_session_id"])
    op.create_index(op.f("ix_customer_push_subscriptions_expires_at"), "customer_push_subscriptions", ["expires_at"])
    op.create_index(op.f("ix_customer_push_subscriptions_restaurant_id"), "customer_push_subscriptions", ["restaurant_id"])
    op.create_index(op.f("ix_customer_push_subscriptions_status"), "customer_push_subscriptions", ["status"])


def downgrade() -> None:
    op.drop_index(op.f("ix_customer_push_subscriptions_status"), table_name="customer_push_subscriptions")
    op.drop_index(op.f("ix_customer_push_subscriptions_restaurant_id"), table_name="customer_push_subscriptions")
    op.drop_index(op.f("ix_customer_push_subscriptions_expires_at"), table_name="customer_push_subscriptions")
    op.drop_index(op.f("ix_customer_push_subscriptions_dining_session_id"), table_name="customer_push_subscriptions")
    op.drop_index("ix_customer_push_restaurant_status", table_name="customer_push_subscriptions")
    op.drop_index("ix_customer_push_active_session", table_name="customer_push_subscriptions")
    op.drop_table("customer_push_subscriptions")
