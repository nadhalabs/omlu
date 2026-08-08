"""GST Reporting Foundation: Menu HSN/SAC, line snapshots, B2B customer tax snapshots, and Quick Sale invoice identity."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g1s2t3r4p5f6"
down_revision: Union[str, Sequence[str], None] = "s1h2p3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. MenuItem
    op.add_column("menu_items", sa.Column("hsn_sac_code", sa.String(20), nullable=True))

    # 2. OrderItem snapshots
    op.add_column("order_items", sa.Column("hsn_sac_code_snapshot", sa.String(20), nullable=True))
    op.add_column("order_items", sa.Column("gst_rate_snapshot", sa.Numeric(5, 2), nullable=True))
    op.add_column("order_items", sa.Column("taxable_amount_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("order_items", sa.Column("cgst_amount_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("order_items", sa.Column("sgst_amount_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("order_items", sa.Column("igst_amount_snapshot", sa.Numeric(10, 2), nullable=True))

    # 3. QuickSaleItem snapshots
    op.add_column("quick_sale_items", sa.Column("hsn_sac_code_snapshot", sa.String(20), nullable=True))
    op.add_column("quick_sale_items", sa.Column("gst_rate_snapshot", sa.Numeric(5, 2), nullable=True))
    op.add_column("quick_sale_items", sa.Column("taxable_amount_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sale_items", sa.Column("cgst_amount_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sale_items", sa.Column("sgst_amount_snapshot", sa.Numeric(10, 2), nullable=True))
    op.add_column("quick_sale_items", sa.Column("igst_amount_snapshot", sa.Numeric(10, 2), nullable=True))

    # 4. Bill customer tax foundation
    op.add_column("bills", sa.Column("customer_tax_type", sa.String(10), nullable=False, server_default="b2c"))
    op.add_column("bills", sa.Column("customer_gstin_snapshot", sa.String(15), nullable=True))
    op.add_column("bills", sa.Column("customer_legal_name_snapshot", sa.String(255), nullable=True))
    op.add_column("bills", sa.Column("customer_state_code_snapshot", sa.String(2), nullable=True))
    op.add_column("bills", sa.Column("customer_state_name_snapshot", sa.String(100), nullable=True))
    op.add_column("bills", sa.Column("place_of_supply_code_snapshot", sa.String(2), nullable=True))
    op.create_check_constraint("chk_bill_customer_tax_type", "bills", "customer_tax_type IN ('b2c', 'b2b')")

    # 5. QuickSale customer tax & invoice foundation
    op.add_column("quick_sales", sa.Column("customer_tax_type", sa.String(10), nullable=False, server_default="b2c"))
    op.add_column("quick_sales", sa.Column("customer_gstin_snapshot", sa.String(15), nullable=True))
    op.add_column("quick_sales", sa.Column("customer_legal_name_snapshot", sa.String(255), nullable=True))
    op.add_column("quick_sales", sa.Column("customer_state_code_snapshot", sa.String(2), nullable=True))
    op.add_column("quick_sales", sa.Column("customer_state_name_snapshot", sa.String(100), nullable=True))
    op.add_column("quick_sales", sa.Column("place_of_supply_code_snapshot", sa.String(2), nullable=True))
    op.add_column("quick_sales", sa.Column("invoice_number", sa.String(64), nullable=True))
    op.add_column("quick_sales", sa.Column("invoice_date", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_quick_sales_restaurant_invoice_number", "quick_sales", ["restaurant_id", "invoice_number"])
    op.create_check_constraint("chk_quick_sale_customer_tax_type", "quick_sales", "customer_tax_type IN ('b2c', 'b2b')")


def downgrade() -> None:
    op.drop_constraint("chk_quick_sale_customer_tax_type", "quick_sales", type_="check")
    op.drop_constraint("uq_quick_sales_restaurant_invoice_number", "quick_sales", type_="unique")
    for column in (
        "invoice_date", "invoice_number", "place_of_supply_code_snapshot",
        "customer_state_name_snapshot", "customer_state_code_snapshot",
        "customer_legal_name_snapshot", "customer_gstin_snapshot", "customer_tax_type",
    ):
        op.drop_column("quick_sales", column)

    op.drop_constraint("chk_bill_customer_tax_type", "bills", type_="check")
    for column in (
        "place_of_supply_code_snapshot", "customer_state_name_snapshot",
        "customer_state_code_snapshot", "customer_legal_name_snapshot",
        "customer_gstin_snapshot", "customer_tax_type",
    ):
        op.drop_column("bills", column)

    for column in (
        "igst_amount_snapshot", "sgst_amount_snapshot", "cgst_amount_snapshot",
        "taxable_amount_snapshot", "gst_rate_snapshot", "hsn_sac_code_snapshot",
    ):
        op.drop_column("quick_sale_items", column)
        op.drop_column("order_items", column)

    op.drop_column("menu_items", "hsn_sac_code")
