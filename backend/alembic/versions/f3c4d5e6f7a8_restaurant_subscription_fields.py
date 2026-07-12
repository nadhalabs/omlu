"""restaurant_subscription_fields

Revision ID: f3c4d5e6f7a8
Revises: f2b3c4d5e6f7
Create Date: 2026-07-13 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "f2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "restaurants",
        sa.Column("plan", sa.String(length=50), server_default="free_pilot", nullable=False),
    )
    op.add_column(
        "restaurants",
        sa.Column("subscription_status", sa.String(length=50), server_default="active", nullable=False),
    )
    op.add_column(
        "restaurants",
        sa.Column("trial_started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "restaurants",
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("restaurants", "trial_ends_at")
    op.drop_column("restaurants", "trial_started_at")
    op.drop_column("restaurants", "subscription_status")
    op.drop_column("restaurants", "plan")
