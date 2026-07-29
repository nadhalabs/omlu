"""add bill-scoped receipt authority

Revision ID: 7b8c9d0e1f2a
Revises: 6a7b8c9d0e1f
"""
import secrets

import sqlalchemy as sa
from alembic import op


revision = "7b8c9d0e1f2a"
down_revision = "6a7b8c9d0e1f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("receipt_token", sa.String(128), nullable=True))
    connection = op.get_bind()
    bill_ids = connection.execute(sa.text("SELECT id FROM bills")).scalars().all()
    for bill_id in bill_ids:
        connection.execute(
            sa.text("UPDATE bills SET receipt_token = :token WHERE id = :bill_id"),
            {"token": secrets.token_urlsafe(48), "bill_id": bill_id},
        )
    op.alter_column("bills", "receipt_token", nullable=False)
    op.create_index("ix_bills_receipt_token", "bills", ["receipt_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_bills_receipt_token", table_name="bills")
    op.drop_column("bills", "receipt_token")
