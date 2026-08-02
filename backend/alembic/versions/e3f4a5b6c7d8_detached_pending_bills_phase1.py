"""Add detached pending bill state and secure payment codes.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
"""

from alembic import op
import sqlalchemy as sa


revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_staff_users_restaurant_id_id", "staff_users", ["restaurant_id", "id"]
    )
    op.drop_constraint("chk_dining_session_status_valid", "dining_sessions", type_="check")
    op.create_check_constraint(
        "chk_dining_session_status_valid",
        "dining_sessions",
        "status IN ('open', 'payment_requested', 'payment_pending', "
        "'detached_awaiting_payment', 'paid', 'closed', 'cancelled')",
    )
    op.add_column("dining_sessions", sa.Column("detached_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dining_sessions", sa.Column("detached_by_staff_id", sa.Integer(), nullable=True))
    op.create_index("ix_dining_sessions_detached_by_staff_id", "dining_sessions", ["detached_by_staff_id"])
    op.create_foreign_key(
        "fk_dining_sessions_restaurant_detached_by_staff",
        "dining_sessions",
        "staff_users",
        ["restaurant_id", "detached_by_staff_id"],
        ["restaurant_id", "id"],
    )

    op.add_column("bills", sa.Column("payment_code_hash", sa.String(64), nullable=True))
    op.add_column("bills", sa.Column("payment_code_ciphertext", sa.String(255), nullable=True))
    op.add_column("bills", sa.Column("payment_code_created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bills", sa.Column("payment_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bills", sa.Column("payment_code_version", sa.Integer(), nullable=False, server_default="0"))
    op.create_index(
        "uq_bills_restaurant_unresolved_payment_code",
        "bills",
        ["restaurant_id", "payment_code_hash"],
        unique=True,
        postgresql_where=sa.text(
            "payment_code_hash IS NOT NULL AND status IN ('issued', 'payment_pending')"
        ),
        sqlite_where=sa.text(
            "payment_code_hash IS NOT NULL AND status IN ('issued', 'payment_pending')"
        ),
    )


def downgrade() -> None:
    # The previous schema cannot represent a detached unpaid session. Closing
    # it is the only downgrade mapping that preserves the newer customer's
    # active-table slot without violating the partial unique index.
    op.execute(
        "UPDATE dining_sessions "
        "SET status = 'closed', closed_at = COALESCE(closed_at, detached_at) "
        "WHERE status = 'detached_awaiting_payment'"
    )
    op.drop_index("uq_bills_restaurant_unresolved_payment_code", table_name="bills")
    for column in (
        "payment_code_version",
        "payment_code_expires_at",
        "payment_code_created_at",
        "payment_code_ciphertext",
        "payment_code_hash",
    ):
        op.drop_column("bills", column)
    op.drop_constraint(
        "fk_dining_sessions_restaurant_detached_by_staff", "dining_sessions", type_="foreignkey"
    )
    op.drop_index("ix_dining_sessions_detached_by_staff_id", table_name="dining_sessions")
    op.drop_column("dining_sessions", "detached_by_staff_id")
    op.drop_column("dining_sessions", "detached_at")
    op.drop_constraint("chk_dining_session_status_valid", "dining_sessions", type_="check")
    op.create_check_constraint(
        "chk_dining_session_status_valid",
        "dining_sessions",
        "status IN ('open', 'payment_requested', 'payment_pending', 'paid', 'closed', 'cancelled')",
    )
    op.drop_constraint("uq_staff_users_restaurant_id_id", "staff_users", type_="unique")
