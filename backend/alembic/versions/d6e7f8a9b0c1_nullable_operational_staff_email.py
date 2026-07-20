"""allow Staff and Kitchen accounts without email

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "staff_users",
        "email",
        existing_type=sa.String(length=255),
        nullable=True,
    )


def downgrade() -> None:
    connection = op.get_bind()
    missing = connection.execute(
        sa.text("SELECT count(*) FROM staff_users WHERE email IS NULL")
    ).scalar_one()
    if missing:
        raise RuntimeError(
            "Cannot restore a NOT NULL email constraint while Staff/Kitchen accounts without email exist."
        )
    op.alter_column(
        "staff_users",
        "email",
        existing_type=sa.String(length=255),
        nullable=False,
    )
