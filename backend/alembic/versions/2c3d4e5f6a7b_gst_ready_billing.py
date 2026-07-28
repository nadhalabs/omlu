"""Add GST settings, immutable bill tax snapshots, and FY invoice sequences."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2c3d4e5f6a7b"
down_revision: Union[str, Sequence[str], None] = "1b2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("gst_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("restaurants", sa.Column("gstin", sa.String(15), nullable=True))
    op.add_column("restaurants", sa.Column("legal_business_name", sa.String(255), nullable=True))
    op.add_column("restaurants", sa.Column("registered_billing_address", sa.String(1024), nullable=True))
    op.add_column("restaurants", sa.Column("gst_state_name", sa.String(100), nullable=True))
    op.add_column("restaurants", sa.Column("gst_state_code", sa.String(2), nullable=True))
    op.add_column("restaurants", sa.Column("default_gst_rate", sa.Numeric(5, 2), nullable=False, server_default="0.00"))
    op.add_column("restaurants", sa.Column("tax_mode", sa.String(20), nullable=False, server_default="exclusive"))
    op.add_column("restaurants", sa.Column("invoice_prefix", sa.String(10), nullable=False, server_default="INV"))
    op.create_check_constraint("chk_restaurants_tax_mode", "restaurants", "tax_mode IN ('inclusive', 'exclusive')")
    op.create_check_constraint("chk_restaurants_gst_rate", "restaurants", "default_gst_rate >= 0 AND default_gst_rate <= 100")

    op.create_table(
        "restaurant_invoice_sequences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("financial_year", sa.String(7), nullable=False),
        sa.Column("last_value", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("restaurant_id", "financial_year", name="uq_restaurant_invoice_sequence_fy"),
    )
    op.create_index("ix_restaurant_invoice_sequences_restaurant_id", "restaurant_invoice_sequences", ["restaurant_id"])

    op.add_column("bills", sa.Column("invoice_number", sa.String(64), nullable=True))
    op.add_column("bills", sa.Column("invoice_date", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bills", sa.Column("gst_enabled_snapshot", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("bills", sa.Column("taxable_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("bills", sa.Column("gst_rate", sa.Numeric(5, 2), nullable=True))
    op.add_column("bills", sa.Column("cgst_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("bills", sa.Column("sgst_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("bills", sa.Column("igst_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("bills", sa.Column("tax_mode_snapshot", sa.String(20), nullable=True))
    op.add_column("bills", sa.Column("gstin_snapshot", sa.String(15), nullable=True))
    op.add_column("bills", sa.Column("legal_business_name_snapshot", sa.String(255), nullable=True))
    op.add_column("bills", sa.Column("billing_address_snapshot", sa.String(1024), nullable=True))
    op.add_column("bills", sa.Column("state_name_snapshot", sa.String(100), nullable=True))
    op.add_column("bills", sa.Column("state_code_snapshot", sa.String(2), nullable=True))
    op.create_unique_constraint("uq_bills_restaurant_invoice_number", "bills", ["restaurant_id", "invoice_number"])


def downgrade() -> None:
    op.drop_constraint("uq_bills_restaurant_invoice_number", "bills", type_="unique")
    for column in (
        "state_code_snapshot", "state_name_snapshot", "billing_address_snapshot",
        "legal_business_name_snapshot", "gstin_snapshot", "tax_mode_snapshot",
        "igst_amount", "sgst_amount", "cgst_amount", "gst_rate", "taxable_amount",
        "gst_enabled_snapshot", "invoice_date", "invoice_number",
    ):
        op.drop_column("bills", column)
    op.drop_index("ix_restaurant_invoice_sequences_restaurant_id", table_name="restaurant_invoice_sequences")
    op.drop_table("restaurant_invoice_sequences")
    op.drop_constraint("chk_restaurants_gst_rate", "restaurants", type_="check")
    op.drop_constraint("chk_restaurants_tax_mode", "restaurants", type_="check")
    for column in (
        "invoice_prefix", "tax_mode", "default_gst_rate", "gst_state_code",
        "gst_state_name", "registered_billing_address", "legal_business_name",
        "gstin", "gst_enabled",
    ):
        op.drop_column("restaurants", column)
