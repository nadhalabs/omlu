"""add quick sales

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table("quick_sales",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_number", sa.String(64), nullable=False), sa.Column("public_token", sa.String(255), nullable=False), sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("sale_type", sa.String(20), nullable=False), sa.Column("source", sa.String(20), nullable=False), sa.Column("status", sa.String(20), nullable=False),
        sa.Column("note", sa.String(1024)), sa.Column("reason", sa.String(1024)), sa.Column("subtotal", sa.Numeric(10, 2), nullable=False), sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("payment_method", sa.String(20)), sa.Column("entered_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("entered_by_name", sa.String(255), nullable=False), sa.Column("entered_by_role", sa.String(50), nullable=False), sa.Column("paid_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id", ondelete="SET NULL")),
        sa.Column("paid_by_name", sa.String(255)), sa.Column("paid_by_role", sa.String(50)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("restaurant_id", "order_number", name="uq_quick_sale_restaurant_order_number"), sa.UniqueConstraint("restaurant_id", "idempotency_key", name="uq_quick_sale_restaurant_idempotency"),
        sa.CheckConstraint("sale_type IN ('takeaway', 'late_entry')", name="chk_quick_sale_type"), sa.CheckConstraint("source IN ('takeaway', 'late_entry')", name="chk_quick_sale_source"),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'preparing', 'ready', 'completed')", name="chk_quick_sale_status"), sa.CheckConstraint("payment_method IS NULL OR payment_method IN ('cash', 'upi')", name="chk_quick_sale_payment_method"),
        sa.CheckConstraint("subtotal >= 0 AND total_amount >= 0", name="chk_quick_sale_amounts"))
    for column in ("restaurant_id", "public_token", "sale_type", "status", "entered_by_staff_id", "created_at", "completed_at"):
        op.create_index(f"ix_quick_sales_{column}", "quick_sales", [column], unique=column == "public_token")
    op.create_table("quick_sale_items",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("quick_sale_id", sa.Integer(), sa.ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=False),
        sa.Column("menu_item_id", sa.Integer(), sa.ForeignKey("menu_items.id", ondelete="SET NULL")), sa.Column("item_name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False), sa.Column("unit_price", sa.Numeric(10, 2), nullable=False), sa.Column("total_price", sa.Numeric(10, 2), nullable=False),
        sa.CheckConstraint("quantity > 0", name="chk_quick_sale_item_quantity"), sa.CheckConstraint("unit_price >= 0 AND total_price >= 0", name="chk_quick_sale_item_amounts"))
    op.create_index("ix_quick_sale_items_quick_sale_id", "quick_sale_items", ["quick_sale_id"])


def downgrade() -> None:
    op.drop_table("quick_sale_items")
    op.drop_table("quick_sales")
