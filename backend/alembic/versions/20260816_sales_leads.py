"""Add assisted sales lead enquiries."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "saleslead20260816"
down_revision: Union[str, Sequence[str], None] = "itemcancel20260809"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_leads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("restaurant_name", sa.String(100), nullable=False),
        sa.Column("city", sa.String(80), nullable=False),
        sa.Column("number_of_outlets", sa.Integer(), nullable=True),
        sa.Column("selected_plan", sa.String(50), nullable=False),
        sa.Column("request_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), server_default="new", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("number_of_outlets IS NULL OR number_of_outlets BETWEEN 1 AND 1000", name="chk_sales_lead_outlet_count"),
        sa.CheckConstraint("request_type IN ('demo', 'trial')", name="chk_sales_lead_request_type"),
        sa.CheckConstraint("status IN ('new', 'contacted', 'demo_scheduled', 'interested', 'onboarding', 'trial', 'active', 'lost')", name="chk_sales_lead_status"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_leads_phone", "sales_leads", ["phone"])
    op.create_index("ix_sales_leads_selected_plan", "sales_leads", ["selected_plan"])
    op.create_index("ix_sales_leads_request_type", "sales_leads", ["request_type"])
    op.create_index("ix_sales_leads_status", "sales_leads", ["status"])
    op.create_index("ix_sales_leads_created_status", "sales_leads", ["created_at", "status"])


def downgrade() -> None:
    op.drop_index("ix_sales_leads_created_status", table_name="sales_leads")
    op.drop_index("ix_sales_leads_status", table_name="sales_leads")
    op.drop_index("ix_sales_leads_request_type", table_name="sales_leads")
    op.drop_index("ix_sales_leads_selected_plan", table_name="sales_leads")
    op.drop_index("ix_sales_leads_phone", table_name="sales_leads")
    op.drop_table("sales_leads")
