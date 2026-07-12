"""restaurant_scoped_staff_accounts

Revision ID: f1a2b3c4d5e6
Revises: e5f6a7b8c9d0
Create Date: 2026-07-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("staff_users", sa.Column("username", sa.String(length=255), nullable=True))
    op.add_column("staff_users", sa.Column("status", sa.String(length=50), server_default="active", nullable=False))
    op.add_column("staff_users", sa.Column("must_change_password", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("staff_users", sa.Column("added_by_staff_id", sa.Integer(), nullable=True))
    op.add_column("staff_users", sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("staff_users", sa.Column("disabled_by_staff_id", sa.Integer(), nullable=True))
    op.add_column("staff_users", sa.Column("disabled_reason", sa.String(length=1024), nullable=True))
    op.create_index(op.f("ix_staff_users_username"), "staff_users", ["username"], unique=False)
    op.create_index(op.f("ix_staff_users_status"), "staff_users", ["status"], unique=False)
    op.create_unique_constraint("uq_staff_user_restaurant_username", "staff_users", ["restaurant_id", "username"])

    bind = op.get_bind()
    dialect = bind.dialect.name
    if dialect == "postgresql":
        op.drop_constraint("chk_staff_user_role", "staff_users", type_="check")
        op.execute(
            """
            WITH ranked_managers AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY restaurant_id
                        ORDER BY
                            CASE WHEN last_login_at IS NULL THEN 1 ELSE 0 END,
                            last_login_at DESC NULLS LAST,
                            created_at ASC,
                            id ASC
                    ) AS rn
                FROM staff_users
                WHERE role = 'manager'
            )
            UPDATE staff_users
            SET role = CASE WHEN ranked_managers.rn = 1 THEN 'owner' ELSE 'admin' END
            FROM ranked_managers
            WHERE staff_users.id = ranked_managers.id
            """
        )
        op.execute("UPDATE staff_users SET role = 'staff' WHERE role = 'waiter'")
        ownerless = bind.execute(sa.text("""
            SELECT r.id, r.slug
            FROM restaurants r
            LEFT JOIN staff_users su
              ON su.restaurant_id = r.id AND su.role = 'owner'
            GROUP BY r.id, r.slug
            HAVING COUNT(su.id) = 0
        """)).fetchall()
        if ownerless:
            details = ", ".join(f"{row.slug}({row.id})" for row in ownerless)
            raise RuntimeError(
                "Cannot migrate staff roles safely: no owner or manager account exists for "
                f"restaurant(s): {details}. Create one owner per restaurant before upgrading."
            )
        duplicate_owners = bind.execute(sa.text("""
            SELECT restaurant_id, COUNT(*) AS owner_count
            FROM staff_users
            WHERE role = 'owner'
            GROUP BY restaurant_id
            HAVING COUNT(*) > 1
        """)).fetchall()
        if duplicate_owners:
            details = ", ".join(f"{row.restaurant_id}:{row.owner_count}" for row in duplicate_owners)
            raise RuntimeError(
                "Cannot migrate staff roles safely: multiple owners found for restaurant(s): "
                f"{details}. Resolve ownership before upgrading."
            )
        op.create_check_constraint(
            "chk_staff_user_role",
            "staff_users",
            "role IN ('owner', 'admin', 'staff', 'kitchen')",
        )
        op.create_check_constraint(
            "chk_staff_user_status",
            "staff_users",
            "status IN ('invited', 'pending', 'active', 'suspended', 'removed')",
        )
    else:
        op.execute("UPDATE staff_users SET role = 'admin' WHERE role = 'manager'")
        op.execute("UPDATE staff_users SET role = 'staff' WHERE role = 'waiter'")

    op.create_table(
        "staff_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("staff_user_id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("token_jti", sa.String(length=128), nullable=False),
        sa.Column("device", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=50), server_default="active", nullable=False),
        sa.Column("login_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by_staff_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("status IN ('active', 'revoked')", name="chk_staff_session_status"),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["staff_user_id"], ["staff_users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_jti"),
    )
    op.create_index(op.f("ix_staff_sessions_restaurant_id"), "staff_sessions", ["restaurant_id"], unique=False)
    op.create_index(op.f("ix_staff_sessions_staff_user_id"), "staff_sessions", ["staff_user_id"], unique=False)
    op.create_index(op.f("ix_staff_sessions_status"), "staff_sessions", ["status"], unique=False)
    op.create_index(op.f("ix_staff_sessions_token_jti"), "staff_sessions", ["token_jti"], unique=True)

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_role", sa.String(length=50), nullable=True),
        sa.Column("target_type", sa.String(length=100), nullable=False),
        sa.Column("target_id", sa.String(length=100), nullable=True),
        sa.Column("action", sa.String(length=100), nullable=False),
        sa.Column("previous_value", sa.String(length=2048), nullable=True),
        sa.Column("new_value", sa.String(length=2048), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)
    op.create_index(op.f("ix_audit_logs_actor_user_id"), "audit_logs", ["actor_user_id"], unique=False)
    op.create_index(op.f("ix_audit_logs_restaurant_id"), "audit_logs", ["restaurant_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_audit_logs_restaurant_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_actor_user_id"), table_name="audit_logs")
    op.drop_index(op.f("ix_audit_logs_action"), table_name="audit_logs")
    op.drop_table("audit_logs")
    op.drop_index(op.f("ix_staff_sessions_token_jti"), table_name="staff_sessions")
    op.drop_index(op.f("ix_staff_sessions_status"), table_name="staff_sessions")
    op.drop_index(op.f("ix_staff_sessions_staff_user_id"), table_name="staff_sessions")
    op.drop_index(op.f("ix_staff_sessions_restaurant_id"), table_name="staff_sessions")
    op.drop_table("staff_sessions")
    op.drop_constraint("uq_staff_user_restaurant_username", "staff_users", type_="unique")
    op.drop_index(op.f("ix_staff_users_status"), table_name="staff_users")
    op.drop_index(op.f("ix_staff_users_username"), table_name="staff_users")
    op.drop_column("staff_users", "disabled_reason")
    op.drop_column("staff_users", "disabled_by_staff_id")
    op.drop_column("staff_users", "disabled_at")
    op.drop_column("staff_users", "added_by_staff_id")
    op.drop_column("staff_users", "must_change_password")
    op.drop_column("staff_users", "status")
    op.drop_column("staff_users", "username")
