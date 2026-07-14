"""menu_options_and_snapshots

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-14 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "menu_option_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("minimum_selections", sa.Integer(), server_default="0", nullable=False),
        sa.Column("maximum_selections", sa.Integer(), server_default="1", nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("type IN ('variant', 'addon')", name="chk_menu_option_group_type"),
        sa.CheckConstraint("minimum_selections >= 0", name="chk_menu_option_group_min_non_negative"),
        sa.CheckConstraint("maximum_selections >= 0", name="chk_menu_option_group_max_non_negative"),
        sa.CheckConstraint("maximum_selections >= minimum_selections", name="chk_menu_option_group_max_gte_min"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_menu_option_groups_restaurant_id", "menu_option_groups", ["restaurant_id"])
    op.create_index("ix_menu_option_groups_type", "menu_option_groups", ["type"])

    op.create_table(
        "menu_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("price_delta", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column("available", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("price_delta >= 0", name="chk_menu_option_price_delta_non_negative"),
        sa.ForeignKeyConstraint(["group_id"], ["menu_option_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_menu_options_restaurant_id", "menu_options", ["restaurant_id"])
    op.create_index("ix_menu_options_group_id", "menu_options", ["group_id"])

    op.create_table(
        "menu_item_option_groups",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("menu_item_id", sa.Integer(), nullable=False),
        sa.Column("option_group_id", sa.Integer(), nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["menu_item_id"], ["menu_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["option_group_id"], ["menu_option_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("menu_item_id", "option_group_id", name="uq_menu_item_option_group"),
    )
    op.create_index("ix_menu_item_option_groups_restaurant_id", "menu_item_option_groups", ["restaurant_id"])
    op.create_index("ix_menu_item_option_groups_menu_item_id", "menu_item_option_groups", ["menu_item_id"])
    op.create_index("ix_menu_item_option_groups_option_group_id", "menu_item_option_groups", ["option_group_id"])

    op.create_table(
        "order_item_selected_options",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_item_id", sa.Integer(), nullable=False),
        sa.Column("menu_option_id", sa.Integer(), nullable=True),
        sa.Column("menu_option_group_id", sa.Integer(), nullable=True),
        sa.Column("option_name", sa.String(length=255), nullable=False),
        sa.Column("group_name", sa.String(length=255), nullable=False),
        sa.Column("option_type", sa.String(length=50), nullable=False),
        sa.Column("price_delta", sa.Numeric(10, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.CheckConstraint("price_delta >= 0", name="chk_order_item_selected_option_price_delta_non_negative"),
        sa.CheckConstraint("quantity > 0", name="chk_order_item_selected_option_quantity_positive"),
        sa.ForeignKeyConstraint(["menu_option_group_id"], ["menu_option_groups.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["menu_option_id"], ["menu_options.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_item_id"], ["order_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_item_selected_options_order_item_id", "order_item_selected_options", ["order_item_id"])
    op.create_index("ix_order_item_selected_options_menu_option_id", "order_item_selected_options", ["menu_option_id"])
    op.create_index("ix_order_item_selected_options_menu_option_group_id", "order_item_selected_options", ["menu_option_group_id"])


def downgrade() -> None:
    op.drop_index("ix_order_item_selected_options_menu_option_group_id", table_name="order_item_selected_options")
    op.drop_index("ix_order_item_selected_options_menu_option_id", table_name="order_item_selected_options")
    op.drop_index("ix_order_item_selected_options_order_item_id", table_name="order_item_selected_options")
    op.drop_table("order_item_selected_options")
    op.drop_index("ix_menu_item_option_groups_option_group_id", table_name="menu_item_option_groups")
    op.drop_index("ix_menu_item_option_groups_menu_item_id", table_name="menu_item_option_groups")
    op.drop_index("ix_menu_item_option_groups_restaurant_id", table_name="menu_item_option_groups")
    op.drop_table("menu_item_option_groups")
    op.drop_index("ix_menu_options_group_id", table_name="menu_options")
    op.drop_index("ix_menu_options_restaurant_id", table_name="menu_options")
    op.drop_table("menu_options")
    op.drop_index("ix_menu_option_groups_type", table_name="menu_option_groups")
    op.drop_index("ix_menu_option_groups_restaurant_id", table_name="menu_option_groups")
    op.drop_table("menu_option_groups")
