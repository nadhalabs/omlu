"""Add immutable B2B recipient billing address snapshots."""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2brecip20260809"
down_revision: Union[str, Sequence[str], None] = "g1s2t3r4p5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("customer_billing_address_snapshot", sa.String(1024), nullable=True))
    op.add_column("quick_sales", sa.Column("customer_billing_address_snapshot", sa.String(1024), nullable=True))


def downgrade() -> None:
    op.drop_column("quick_sales", "customer_billing_address_snapshot")
    op.drop_column("bills", "customer_billing_address_snapshot")
