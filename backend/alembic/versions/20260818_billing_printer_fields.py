"""Add billing printer observability fields to print_bridge_installations."""

from alembic import op
import sqlalchemy as sa

revision = "billingprinter20260818"
down_revision = "aa591f146e91"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "print_bridge_installations",
        sa.Column("billing_printer_configured", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "print_bridge_installations",
        sa.Column("billing_printer_label", sa.String(100), nullable=True),
    )
    op.add_column(
        "print_bridge_installations",
        sa.Column("billing_printer_last_success_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("print_bridge_installations", "billing_printer_last_success_at")
    op.drop_column("print_bridge_installations", "billing_printer_label")
    op.drop_column("print_bridge_installations", "billing_printer_configured")
