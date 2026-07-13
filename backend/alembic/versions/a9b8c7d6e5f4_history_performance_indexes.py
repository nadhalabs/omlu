"""history_performance_indexes

Revision ID: a9b8c7d6e5f4
Revises: f4d5e6f7a8b9
Create Date: 2026-07-13 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op


revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, None] = "f4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_restaurant_created_at ON orders (restaurant_id, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_restaurant_status_created_at ON orders (restaurant_id, status, created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bills_restaurant_generated_at ON bills (restaurant_id, generated_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bills_restaurant_status_generated_at ON bills (restaurant_id, status, generated_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_dining_sessions_restaurant_opened_at ON dining_sessions (restaurant_id, opened_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_dining_sessions_restaurant_status_opened_at ON dining_sessions (restaurant_id, status, opened_at)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_status_history_changed_by ON order_status_history (changed_by_staff_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_order_status_history_changed_by")
    op.execute("DROP INDEX IF EXISTS ix_dining_sessions_restaurant_status_opened_at")
    op.execute("DROP INDEX IF EXISTS ix_dining_sessions_restaurant_opened_at")
    op.execute("DROP INDEX IF EXISTS ix_bills_restaurant_status_generated_at")
    op.execute("DROP INDEX IF EXISTS ix_bills_restaurant_generated_at")
    op.execute("DROP INDEX IF EXISTS ix_orders_restaurant_status_created_at")
    op.execute("DROP INDEX IF EXISTS ix_orders_restaurant_created_at")
