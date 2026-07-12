"""restaurant_contact_fields

Revision ID: f4d5e6f7a8b9
Revises: f3c4d5e6f7a8
Create Date: 2026-07-13 11:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "f3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("contact_email", sa.String(length=255), nullable=True))
    op.add_column("restaurants", sa.Column("phone_number", sa.String(length=50), nullable=True))
    op.add_column("restaurants", sa.Column("city", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("restaurants", "city")
    op.drop_column("restaurants", "phone_number")
    op.drop_column("restaurants", "contact_email")
