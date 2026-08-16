"""Add kitchen printer heartbeat and durable consumer claims."""

from alembic import op
import sqlalchemy as sa

revision = "kitchenconsumer20260817"
down_revision = "kitchenmode20260817"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("print_bridge_installations", sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("print_bridge_installations", sa.Column("kitchen_printer_configured", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("print_bridge_installations", sa.Column("kitchen_printer_label", sa.String(100), nullable=True))
    op.add_column("print_bridge_installations", sa.Column("kitchen_printer_last_success_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("kitchen_print_jobs", sa.Column("claimed_by_installation_id", sa.String(64), nullable=True))
    op.add_column("kitchen_print_jobs", sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_kitchen_print_jobs_claimed_by_installation_id", "kitchen_print_jobs", ["claimed_by_installation_id"])


def downgrade() -> None:
    op.drop_index("ix_kitchen_print_jobs_claimed_by_installation_id", table_name="kitchen_print_jobs")
    op.drop_column("kitchen_print_jobs", "claimed_at")
    op.drop_column("kitchen_print_jobs", "claimed_by_installation_id")
    op.drop_column("print_bridge_installations", "kitchen_printer_last_success_at")
    op.drop_column("print_bridge_installations", "kitchen_printer_label")
    op.drop_column("print_bridge_installations", "kitchen_printer_configured")
    op.drop_column("print_bridge_installations", "last_seen_at")
