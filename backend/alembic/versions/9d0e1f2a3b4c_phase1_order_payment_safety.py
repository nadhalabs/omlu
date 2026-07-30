"""phase 1 order and payment safety

Revision ID: 9d0e1f2a3b4c
Revises: 8c9d0e1f2a3b
"""
from alembic import op
import sqlalchemy as sa


revision = "9d0e1f2a3b4c"
down_revision = "8c9d0e1f2a3b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("idempotency_request_hash", sa.String(64), nullable=True))
    op.add_column("quick_sales", sa.Column("idempotency_request_hash", sa.String(64), nullable=True))
    op.execute("UPDATE quick_sales SET idempotency_request_hash = md5(idempotency_key)")
    op.alter_column("quick_sales", "idempotency_request_hash", nullable=False)
    op.add_column("quick_sales", sa.Column("payment_idempotency_key", sa.String(255), nullable=True))
    op.add_column("quick_sales", sa.Column("payment_request_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_quick_sale_payment_idempotency", "quick_sales", ["restaurant_id", "payment_idempotency_key"])

    op.add_column("bills", sa.Column("issue_idempotency_key", sa.String(255), nullable=True))
    op.add_column("bills", sa.Column("payment_idempotency_key", sa.String(255), nullable=True))
    op.add_column("bills", sa.Column("payment_request_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_bill_issue_idempotency", "bills", ["restaurant_id", "issue_idempotency_key"])
    op.create_unique_constraint("uq_bill_payment_idempotency", "bills", ["restaurant_id", "payment_idempotency_key"])

    op.create_table(
        "payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bill_id", sa.Integer(), sa.ForeignKey("bills.id", ondelete="CASCADE"), nullable=True),
        sa.Column("quick_sale_id", sa.Integer(), sa.ForeignKey("quick_sales.id", ondelete="CASCADE"), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=False),
        sa.Column("method", sa.String(50), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("status", sa.String(20), server_default="succeeded", nullable=False),
        sa.Column("recorded_by_staff_id", sa.Integer(), sa.ForeignKey("staff_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("(bill_id IS NULL) <> (quick_sale_id IS NULL)", name="ck_payment_exactly_one_source"),
        sa.CheckConstraint("status = 'succeeded'", name="ck_payment_phase1_status"),
        sa.CheckConstraint("amount >= 0", name="ck_payment_amount_nonnegative"),
        sa.UniqueConstraint("bill_id", name="uq_payment_bill"),
        sa.UniqueConstraint("quick_sale_id", name="uq_payment_quick_sale"),
        sa.UniqueConstraint("restaurant_id", "idempotency_key", name="uq_payment_restaurant_idempotency"),
    )
    op.create_index("ix_payments_restaurant_id", "payments", ["restaurant_id"])
    op.create_table(
        "revenue_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payment_id", sa.Integer(), sa.ForeignKey("payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount >= 0", name="ck_revenue_entry_amount_nonnegative"),
        sa.UniqueConstraint("payment_id", name="uq_revenue_entry_payment"),
    )
    op.create_index("ix_revenue_entries_restaurant_id", "revenue_entries", ["restaurant_id"])
    op.create_index("ix_revenue_entries_occurred_at", "revenue_entries", ["occurred_at"])


def downgrade() -> None:
    op.drop_table("revenue_entries")
    op.drop_table("payments")
    op.drop_constraint("uq_bill_payment_idempotency", "bills", type_="unique")
    op.drop_constraint("uq_bill_issue_idempotency", "bills", type_="unique")
    op.drop_column("bills", "payment_request_hash")
    op.drop_column("bills", "payment_idempotency_key")
    op.drop_column("bills", "issue_idempotency_key")
    op.drop_constraint("uq_quick_sale_payment_idempotency", "quick_sales", type_="unique")
    op.drop_column("quick_sales", "payment_request_hash")
    op.drop_column("quick_sales", "payment_idempotency_key")
    op.drop_column("quick_sales", "idempotency_request_hash")
    op.drop_column("orders", "idempotency_request_hash")
