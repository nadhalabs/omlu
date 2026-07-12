"""staff_security_version

Revision ID: f2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-13 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "staff_users",
        sa.Column("security_version", sa.Integer(), server_default="0", nullable=False),
    )
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("CREATE UNIQUE INDEX uq_restaurants_slug_lower ON restaurants (lower(slug))")
        op.execute(
            """
            CREATE UNIQUE INDEX uq_staff_users_restaurant_username_lower
            ON staff_users (restaurant_id, lower(username))
            WHERE username IS NOT NULL
            """
        )
        op.execute(
            """
            CREATE UNIQUE INDEX uq_staff_users_restaurant_email_lower
            ON staff_users (restaurant_id, lower(email))
            """
        )
        op.create_index(
            "uq_staff_users_one_owner_per_restaurant",
            "staff_users",
            ["restaurant_id"],
            unique=True,
            postgresql_where=sa.text("role = 'owner' AND status != 'removed'"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.drop_index("uq_staff_users_one_owner_per_restaurant", table_name="staff_users")
        op.drop_index("uq_staff_users_restaurant_email_lower", table_name="staff_users")
        op.drop_index("uq_staff_users_restaurant_username_lower", table_name="staff_users")
        op.drop_index("uq_restaurants_slug_lower", table_name="restaurants")
    op.drop_column("staff_users", "security_version")
