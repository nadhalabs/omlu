"""normalize customer QR order source

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
"""
from typing import Sequence, Union
from alembic import op

revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("orders", "source", server_default="customer_qr")
    op.execute("UPDATE orders SET source = 'customer_qr' WHERE source = 'qr'")


def downgrade() -> None:
    op.execute("UPDATE orders SET source = 'qr' WHERE source = 'customer_qr'")
    op.alter_column("orders", "source", server_default="qr")
