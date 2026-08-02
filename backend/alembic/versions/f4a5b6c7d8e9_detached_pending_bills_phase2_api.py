"""Add detached bill API idempotency and persistent code lookup limits.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
"""

from alembic import op
import sqlalchemy as sa


revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("detachment_idempotency_key", sa.String(255), nullable=True))
    op.add_column("bills", sa.Column("detachment_request_hash", sa.String(64), nullable=True))
    op.create_unique_constraint(
        "uq_bill_detachment_idempotency",
        "bills",
        ["restaurant_id", "detachment_idempotency_key"],
    )
    op.create_table(
        "payment_code_lookup_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=False),
        sa.Column("client_identifier_hash", sa.String(64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("successful_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["restaurant_id", "actor_user_id"],
            ["staff_users.restaurant_id", "staff_users.id"],
            name="fk_payment_code_lookup_restaurant_actor",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "restaurant_id",
            "actor_user_id",
            "client_identifier_hash",
            name="uq_payment_code_lookup_actor_client",
        ),
        sa.CheckConstraint("attempt_count >= 0", name="chk_payment_code_lookup_attempt_count"),
        sa.CheckConstraint("successful_count >= 0", name="chk_payment_code_lookup_success_count"),
        sa.CheckConstraint("failed_count >= 0", name="chk_payment_code_lookup_failed_count"),
    )
    op.create_index("ix_payment_code_lookup_attempts_restaurant_id", "payment_code_lookup_attempts", ["restaurant_id"])
    op.create_index("ix_payment_code_lookup_attempts_actor_user_id", "payment_code_lookup_attempts", ["actor_user_id"])
    op.create_index("ix_payment_code_lookup_window", "payment_code_lookup_attempts", ["window_started_at"])


def downgrade() -> None:
    op.drop_table("payment_code_lookup_attempts")
    op.drop_constraint("uq_bill_detachment_idempotency", "bills", type_="unique")
    op.drop_column("bills", "detachment_request_hash")
    op.drop_column("bills", "detachment_idempotency_key")
