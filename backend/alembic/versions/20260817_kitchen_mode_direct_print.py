"""Add kitchen workflow mode and durable kitchen print jobs."""

from alembic import op
import sqlalchemy as sa

revision = "kitchenmode20260817"
down_revision = "itemcancel20260809"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("kitchen_mode", sa.String(20), server_default="kds", nullable=False))
    op.create_check_constraint("chk_restaurants_kitchen_mode", "restaurants", "kitchen_mode IN ('kds', 'direct_print')")
    op.add_column("orders", sa.Column("kitchen_mode_snapshot", sa.String(20), server_default="kds", nullable=False))
    op.create_check_constraint("chk_orders_kitchen_mode_snapshot", "orders", "kitchen_mode_snapshot IN ('kds', 'direct_print')")
    op.create_table(
        "kitchen_print_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=True),
        sa.Column("quick_sale_id", sa.Integer(), sa.ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=True),
        sa.Column("order_item_id", sa.Integer(), sa.ForeignKey("order_items.id", ondelete="CASCADE"), nullable=True),
        sa.Column("document_type", sa.String(30), nullable=False),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("destination", sa.String(30), server_default="kitchen", nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("failure_message", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("printed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("document_type IN ('initial_kot', 'addition_kot', 'cancellation_kot')", name="chk_kitchen_print_document_type"),
        sa.CheckConstraint("status IN ('pending', 'printing', 'printed', 'failed')", name="chk_kitchen_print_job_status"),
        sa.CheckConstraint("order_id IS NOT NULL OR quick_sale_id IS NOT NULL", name="chk_kitchen_print_job_reference"),
        sa.UniqueConstraint("restaurant_id", "idempotency_key", name="uq_kitchen_print_job_key"),
    )
    op.create_index("ix_kitchen_print_jobs_restaurant_id", "kitchen_print_jobs", ["restaurant_id"])
    op.create_index("ix_kitchen_print_jobs_order_id", "kitchen_print_jobs", ["order_id"])
    op.create_index("ix_kitchen_print_jobs_quick_sale_id", "kitchen_print_jobs", ["quick_sale_id"])
    op.create_index("ix_kitchen_print_jobs_order_item_id", "kitchen_print_jobs", ["order_item_id"])
    op.create_index("ix_kitchen_print_jobs_status", "kitchen_print_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("kitchen_print_jobs")
    op.drop_constraint("chk_orders_kitchen_mode_snapshot", "orders", type_="check")
    op.drop_column("orders", "kitchen_mode_snapshot")
    op.drop_constraint("chk_restaurants_kitchen_mode", "restaurants", type_="check")
    op.drop_column("restaurants", "kitchen_mode")
