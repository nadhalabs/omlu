"""secure table session participants

Revision ID: 5f6a7b8c9d0e
Revises: 4e5f6a7b8c9d
"""
from alembic import op
import sqlalchemy as sa

revision = "5f6a7b8c9d0e"
down_revision = "4e5f6a7b8c9d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("dining_sessions", sa.Column("join_code_hash", sa.String(128), nullable=True))
    op.add_column("dining_sessions", sa.Column("join_code_ciphertext", sa.String(255), nullable=True))
    op.add_column("dining_sessions", sa.Column("join_code_created_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dining_sessions", sa.Column("join_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("dining_sessions", sa.Column("join_code_version", sa.Integer(), server_default="0", nullable=False))
    op.create_table(
        "table_session_participants",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(64), nullable=False, unique=True),
        sa.Column("restaurant_id", sa.Integer(), sa.ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("table_id", sa.Integer(), sa.ForeignKey("restaurant_tables.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("label_number", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_staff_id", sa.Integer(), nullable=True),
        sa.Column("revocation_reason", sa.String(300), nullable=True),
        sa.Column("created_ip_hash", sa.String(64), nullable=True),
        sa.Column("device_fingerprint_hash", sa.String(64), nullable=True),
        sa.UniqueConstraint("session_id", "label_number", name="uq_table_participant_session_label"),
    )
    for name, columns in [
        ("ix_table_session_participants_public_id", ["public_id"]),
        ("ix_table_session_participants_restaurant_id", ["restaurant_id"]),
        ("ix_table_session_participants_table_id", ["table_id"]),
        ("ix_table_session_participants_session_id", ["session_id"]),
        ("ix_table_session_participants_token_hash", ["token_hash"]),
        ("ix_table_session_participants_revoked_at", ["revoked_at"]),
        ("ix_table_participant_authority", ["restaurant_id", "table_id", "session_id", "revoked_at"]),
    ]:
        op.create_index(name, "table_session_participants", columns)
    op.create_table(
        "table_session_join_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("dining_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("authority_hash", sa.String(64), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("failed_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("blocked_until", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("session_id", "authority_hash", name="uq_join_attempt_session_authority"),
    )
    op.create_index("ix_table_session_join_attempts_session_id", "table_session_join_attempts", ["session_id"])
    op.add_column("orders", sa.Column("created_by_participant_id", sa.Integer(), nullable=True))
    op.create_foreign_key("fk_orders_created_by_participant", "orders", "table_session_participants", ["created_by_participant_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_orders_created_by_participant_id", "orders", ["created_by_participant_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_created_by_participant_id", table_name="orders")
    op.drop_constraint("fk_orders_created_by_participant", "orders", type_="foreignkey")
    op.drop_column("orders", "created_by_participant_id")
    op.drop_table("table_session_join_attempts")
    op.drop_table("table_session_participants")
    for column in ("join_code_version", "join_code_expires_at", "join_code_created_at", "join_code_ciphertext", "join_code_hash"):
        op.drop_column("dining_sessions", column)
