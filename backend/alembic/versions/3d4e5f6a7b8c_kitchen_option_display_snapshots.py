"""add concise kitchen option display snapshots

Revision ID: 3d4e5f6a7b8c
Revises: 2c3d4e5f6a7b
"""

from alembic import op
import sqlalchemy as sa


revision = "3d4e5f6a7b8c"
down_revision = "2c3d4e5f6a7b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu_options", sa.Column("kitchen_display_name", sa.String(length=255), nullable=True))
    op.add_column(
        "order_item_selected_options",
        sa.Column("kitchen_display_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("order_item_selected_options", "kitchen_display_name")
    op.drop_column("menu_options", "kitchen_display_name")
