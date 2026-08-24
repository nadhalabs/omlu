"""add tenant-scoped Google Review URL

Revision ID: google_review_20260824
Revises: billingprinter20260818
"""

from alembic import op
import sqlalchemy as sa


revision = "google_review_20260824"
down_revision = "billingprinter20260818"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("restaurants", sa.Column("google_review_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("restaurants", "google_review_url")
