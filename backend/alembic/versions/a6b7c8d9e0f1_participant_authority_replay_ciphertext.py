"""participant authority replay ciphertext

Revision ID: a6b7c8d9e0f1
Revises: f5e6d7c8b9a0
"""

from alembic import op
import sqlalchemy as sa


revision = "a6b7c8d9e0f1"
down_revision = "f5e6d7c8b9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "table_session_participants",
        sa.Column("authority_ciphertext", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("table_session_participants", "authority_ciphertext")
