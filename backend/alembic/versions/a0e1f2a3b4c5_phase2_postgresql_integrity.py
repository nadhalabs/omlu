"""phase 2 PostgreSQL integrity and migration parity

Revision ID: a0e1f2a3b4c5
Revises: 9d0e1f2a3b4c
"""
from alembic import op
import sqlalchemy as sa


revision = "a0e1f2a3b4c5"
down_revision = "9d0e1f2a3b4c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing behavior archives tables with is_active=false and permits their
    # number to be reused. Only active table numbers are restaurant-unique.
    op.create_index(
        "uq_restaurant_tables_active_number",
        "restaurant_tables",
        ["restaurant_id", "table_number"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )
    op.create_index(
        "uq_service_requests_pending_session_table_type",
        "service_requests",
        [
            "restaurant_id",
            "table_id",
            "request_type",
            sa.text("COALESCE(dining_session_id, 0)"),
        ],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )

    # Composite parent keys support tenant-bound foreign keys without changing
    # the existing primary keys or API identifiers.
    for table, name in (
        ("restaurant_tables", "uq_restaurant_tables_restaurant_id_id"),
        ("dining_sessions", "uq_dining_sessions_restaurant_id_id"),
        ("orders", "uq_orders_restaurant_id_id"),
        ("bills", "uq_bills_restaurant_id_id"),
        ("quick_sales", "uq_quick_sales_restaurant_id_id"),
        ("payments", "uq_payments_restaurant_id_id"),
    ):
        op.create_unique_constraint(name, table, ["restaurant_id", "id"])

    op.create_foreign_key(
        "fk_dining_sessions_restaurant_table",
        "dining_sessions",
        "restaurant_tables",
        ["restaurant_id", "table_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_orders_restaurant_table",
        "orders",
        "restaurant_tables",
        ["restaurant_id", "table_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_orders_restaurant_session",
        "orders",
        "dining_sessions",
        ["restaurant_id", "dining_session_id"],
        ["restaurant_id", "id"],
    )
    op.create_foreign_key(
        "fk_bills_restaurant_session",
        "bills",
        "dining_sessions",
        ["restaurant_id", "dining_session_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_service_requests_restaurant_table",
        "service_requests",
        "restaurant_tables",
        ["restaurant_id", "table_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_service_requests_restaurant_session",
        "service_requests",
        "dining_sessions",
        ["restaurant_id", "dining_session_id"],
        ["restaurant_id", "id"],
    )
    op.create_foreign_key(
        "fk_payments_restaurant_bill",
        "payments",
        "bills",
        ["restaurant_id", "bill_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_payments_restaurant_quick_sale",
        "payments",
        "quick_sales",
        ["restaurant_id", "quick_sale_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_revenue_entries_restaurant_payment",
        "revenue_entries",
        "payments",
        ["restaurant_id", "payment_id"],
        ["restaurant_id", "id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_bills_generated_by_staff_id",
        "bills",
        "staff_users",
        ["generated_by_staff_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    for table, name in (
        ("bills", "fk_bills_generated_by_staff_id"),
        ("revenue_entries", "fk_revenue_entries_restaurant_payment"),
        ("payments", "fk_payments_restaurant_quick_sale"),
        ("payments", "fk_payments_restaurant_bill"),
        ("service_requests", "fk_service_requests_restaurant_session"),
        ("service_requests", "fk_service_requests_restaurant_table"),
        ("bills", "fk_bills_restaurant_session"),
        ("orders", "fk_orders_restaurant_session"),
        ("orders", "fk_orders_restaurant_table"),
        ("dining_sessions", "fk_dining_sessions_restaurant_table"),
    ):
        op.drop_constraint(name, table, type_="foreignkey")
    for table, name in (
        ("payments", "uq_payments_restaurant_id_id"),
        ("quick_sales", "uq_quick_sales_restaurant_id_id"),
        ("bills", "uq_bills_restaurant_id_id"),
        ("orders", "uq_orders_restaurant_id_id"),
        ("dining_sessions", "uq_dining_sessions_restaurant_id_id"),
        ("restaurant_tables", "uq_restaurant_tables_restaurant_id_id"),
    ):
        op.drop_constraint(name, table, type_="unique")
    op.drop_index("uq_service_requests_pending_session_table_type", table_name="service_requests")
    op.drop_index("uq_restaurant_tables_active_number", table_name="restaurant_tables")
