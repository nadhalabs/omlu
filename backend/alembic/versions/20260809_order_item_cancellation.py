"""add order item cancellation metadata

Revision ID: itemcancel20260809
Revises: b2brecip20260809
"""
from alembic import op
import sqlalchemy as sa


revision = "itemcancel20260809"
down_revision = "b2brecip20260809"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("cancellation_status", sa.String(length=20), server_default="active", nullable=False))
    op.add_column("order_items", sa.Column("cancellation_reason", sa.String(length=300), nullable=True))
    op.add_column("order_items", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("order_items", sa.Column("cancellation_actor_type", sa.String(length=30), nullable=True))
    op.add_column("order_items", sa.Column("cancelled_by_staff_id", sa.Integer(), nullable=True))
    op.add_column("order_items", sa.Column("cancelled_by_participant_id", sa.Integer(), nullable=True))
    op.create_check_constraint("chk_order_item_cancellation_status", "order_items", "cancellation_status IN ('active', 'cancelled')")
    op.create_index("ix_order_items_cancellation_status", "order_items", ["cancellation_status"])
    op.create_index("ix_order_items_cancelled_by_staff_id", "order_items", ["cancelled_by_staff_id"])
    op.create_index("ix_order_items_cancelled_by_participant_id", "order_items", ["cancelled_by_participant_id"])
    op.create_foreign_key("fk_order_items_cancelled_by_participant", "order_items", "table_session_participants", ["cancelled_by_participant_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_order_items_cancelled_by_participant", "order_items", type_="foreignkey")
    op.drop_index("ix_order_items_cancelled_by_participant_id", table_name="order_items")
    op.drop_index("ix_order_items_cancelled_by_staff_id", table_name="order_items")
    op.drop_index("ix_order_items_cancellation_status", table_name="order_items")
    op.drop_constraint("chk_order_item_cancellation_status", "order_items", type_="check")
    for column in ("cancelled_by_participant_id", "cancelled_by_staff_id", "cancellation_actor_type", "cancelled_at", "cancellation_reason", "cancellation_status"):
        op.drop_column("order_items", column)
