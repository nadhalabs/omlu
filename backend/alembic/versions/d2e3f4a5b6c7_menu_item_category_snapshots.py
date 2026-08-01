"""Add immutable category snapshots to transactional line items.

Revision ID: d2e3f4a5b6c7
Revises: b1c2d3e4f5a7
"""

from alembic import op
import sqlalchemy as sa


revision = "d2e3f4a5b6c7"
down_revision = "b1c2d3e4f5a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("category_id_snapshot", sa.Integer(), nullable=True))
    op.add_column("order_items", sa.Column("category_name_snapshot", sa.String(length=255), nullable=True))
    op.add_column("quick_sale_items", sa.Column("category_id_snapshot", sa.Integer(), nullable=True))
    op.add_column("quick_sale_items", sa.Column("category_name_snapshot", sa.String(length=255), nullable=True))

    op.execute("""
        UPDATE order_items AS line
        SET category_id_snapshot = item.category_id,
            category_name_snapshot = category.name_en
        FROM menu_items AS item
        JOIN menu_categories AS category ON category.id = item.category_id
        WHERE line.menu_item_id = item.id
          AND line.category_id_snapshot IS NULL
          AND line.category_name_snapshot IS NULL
    """)
    op.execute("""
        UPDATE quick_sale_items AS line
        SET category_id_snapshot = item.category_id,
            category_name_snapshot = category.name_en
        FROM menu_items AS item
        JOIN menu_categories AS category ON category.id = item.category_id
        WHERE line.menu_item_id = item.id
          AND line.category_id_snapshot IS NULL
          AND line.category_name_snapshot IS NULL
    """)


def downgrade() -> None:
    op.drop_column("quick_sale_items", "category_name_snapshot")
    op.drop_column("quick_sale_items", "category_id_snapshot")
    op.drop_column("order_items", "category_name_snapshot")
    op.drop_column("order_items", "category_id_snapshot")
