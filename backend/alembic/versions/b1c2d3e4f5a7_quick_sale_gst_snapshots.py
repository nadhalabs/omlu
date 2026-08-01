"""Add immutable GST snapshots to Quick Sales.

Revision ID: b1c2d3e4f5a7
Revises: a0e1f2a3b4c5
"""

from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a7"
down_revision = "a0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quick_sales", sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"))
    op.add_column("quick_sales", sa.Column("tax_amount", sa.Numeric(10, 2), nullable=False, server_default="0.00"))
    op.add_column("quick_sales", sa.Column("gst_enabled_snapshot", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("quick_sales", sa.Column("taxable_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sales", sa.Column("gst_rate", sa.Numeric(5, 2), nullable=True))
    op.add_column("quick_sales", sa.Column("cgst_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sales", sa.Column("sgst_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sales", sa.Column("igst_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sales", sa.Column("tax_mode_snapshot", sa.String(20), nullable=True))
    op.add_column("quick_sales", sa.Column("gstin_snapshot", sa.String(15), nullable=True))
    op.add_column("quick_sales", sa.Column("legal_business_name_snapshot", sa.String(255), nullable=True))
    op.add_column("quick_sales", sa.Column("billing_address_snapshot", sa.String(1024), nullable=True))
    op.add_column("quick_sales", sa.Column("state_name_snapshot", sa.String(100), nullable=True))
    op.add_column("quick_sales", sa.Column("state_code_snapshot", sa.String(2), nullable=True))
    op.create_check_constraint("chk_quick_sale_discount_nonnegative", "quick_sales", "discount_amount >= 0")
    op.create_check_constraint("chk_quick_sale_tax_nonnegative", "quick_sales", "tax_amount >= 0")


def downgrade() -> None:
    op.drop_constraint("chk_quick_sale_tax_nonnegative", "quick_sales", type_="check")
    op.drop_constraint("chk_quick_sale_discount_nonnegative", "quick_sales", type_="check")
    for column in (
        "state_code_snapshot", "state_name_snapshot", "billing_address_snapshot",
        "legal_business_name_snapshot", "gstin_snapshot", "tax_mode_snapshot",
        "igst_amount", "sgst_amount", "cgst_amount", "gst_rate", "taxable_amount",
        "gst_enabled_snapshot", "tax_amount", "discount_amount",
    ):
        op.drop_column("quick_sales", column)
