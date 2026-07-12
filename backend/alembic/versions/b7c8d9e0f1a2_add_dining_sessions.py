"""add_dining_sessions

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-12 02:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ACTIVE_SESSION_STATUSES = ("open", "payment_requested", "payment_pending")


def upgrade() -> None:
    op.create_table(
        "dining_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("table_id", sa.Integer(), nullable=False),
        sa.Column("public_token", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="open", nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("payment_requested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "status IN ('open', 'payment_requested', 'payment_pending', 'paid', 'closed', 'cancelled')",
            name="chk_dining_session_status_valid",
        ),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["table_id"], ["restaurant_tables.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_dining_sessions_restaurant_id", "dining_sessions", ["restaurant_id"])
    op.create_index("ix_dining_sessions_table_id", "dining_sessions", ["table_id"])
    op.create_index("ix_dining_sessions_status", "dining_sessions", ["status"])
    op.create_index("ix_dining_sessions_public_token", "dining_sessions", ["public_token"], unique=True)
    op.create_index("ix_dining_sessions_restaurant_status", "dining_sessions", ["restaurant_id", "status"])
    op.create_index("ix_dining_sessions_table_status", "dining_sessions", ["table_id", "status"])

    bind = op.get_bind()
    dialect_name = bind.dialect.name
    if dialect_name == "postgresql":
        op.execute(
            "CREATE UNIQUE INDEX uq_dining_sessions_one_active_per_table "
            "ON dining_sessions (table_id) "
            "WHERE status IN ('open', 'payment_requested', 'payment_pending')"
        )
    elif dialect_name == "sqlite":
        op.execute(
            "CREATE UNIQUE INDEX uq_dining_sessions_one_active_per_table "
            "ON dining_sessions (table_id) "
            "WHERE status IN ('open', 'payment_requested', 'payment_pending')"
        )

    op.add_column("orders", sa.Column("dining_session_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_orders_dining_session_id_dining_sessions",
        "orders",
        "dining_sessions",
        ["dining_session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_orders_dining_session_id", "orders", ["dining_session_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_dining_session_id", table_name="orders")
    op.drop_constraint("fk_orders_dining_session_id_dining_sessions", "orders", type_="foreignkey")
    op.drop_column("orders", "dining_session_id")

    bind = op.get_bind()
    if bind.dialect.name in {"postgresql", "sqlite"}:
        op.drop_index("uq_dining_sessions_one_active_per_table", table_name="dining_sessions")

    op.drop_index("ix_dining_sessions_table_status", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_restaurant_status", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_public_token", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_status", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_table_id", table_name="dining_sessions")
    op.drop_index("ix_dining_sessions_restaurant_id", table_name="dining_sessions")
    op.drop_table("dining_sessions")
