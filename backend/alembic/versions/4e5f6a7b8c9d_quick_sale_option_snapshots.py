"""quick sale option snapshots

Revision ID: 4e5f6a7b8c9d
Revises: 3d4e5f6a7b8c
"""

from alembic import op
import sqlalchemy as sa


revision = "4e5f6a7b8c9d"
down_revision = "3d4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quick_sale_items", sa.Column("base_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sale_items", sa.Column("item_note", sa.String(length=300), nullable=True))
    op.execute("UPDATE quick_sale_items SET base_price = unit_price")
    op.alter_column("quick_sale_items", "base_price", nullable=False)
    op.drop_constraint("chk_quick_sale_item_amounts", "quick_sale_items", type_="check")
    op.create_check_constraint(
        "chk_quick_sale_item_amounts",
        "quick_sale_items",
        "base_price >= 0 AND unit_price >= 0 AND total_price >= 0",
    )
    op.create_table(
        "quick_sale_item_selected_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quick_sale_item_id", sa.Integer(), nullable=False),
        sa.Column("menu_option_id", sa.Integer(), nullable=True),
        sa.Column("menu_option_group_id", sa.Integer(), nullable=True),
        sa.Column("option_name", sa.String(length=255), nullable=False),
        sa.Column("kitchen_display_name", sa.String(length=255), nullable=True),
        sa.Column("group_name", sa.String(length=255), nullable=False),
        sa.Column("option_type", sa.String(length=50), nullable=False),
        sa.Column("price_delta", sa.Numeric(10, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("price_delta >= 0", name="chk_quick_sale_option_price_nonnegative"),
        sa.CheckConstraint("quantity > 0", name="chk_quick_sale_option_quantity_positive"),
        sa.ForeignKeyConstraint(["menu_option_group_id"], ["menu_option_groups.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["menu_option_id"], ["menu_options.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["quick_sale_item_id"],
            ["quick_sale_items.id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_quick_sale_item_selected_options_quick_sale_item_id", "quick_sale_item_selected_options", ["quick_sale_item_id"])
    op.create_index("ix_quick_sale_item_selected_options_menu_option_id", "quick_sale_item_selected_options", ["menu_option_id"])
    op.create_index("ix_quick_sale_item_selected_options_menu_option_group_id", "quick_sale_item_selected_options", ["menu_option_group_id"])


def downgrade() -> None:
    op.drop_table("quick_sale_item_selected_options")
    op.drop_constraint("chk_quick_sale_item_amounts", "quick_sale_items", type_="check")
    op.create_check_constraint("chk_quick_sale_item_amounts", "quick_sale_items", "unit_price >= 0 AND total_price >= 0")
    op.drop_column("quick_sale_items", "item_note")
    op.drop_column("quick_sale_items", "base_price")
