"""menu import option groups

Revision ID: c4d5e6f7a8b9
Revises: f4a5b6c7d8e9
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu_import_draft_items", sa.Column("option_groups", sa.JSON(), server_default="[]", nullable=False))


def downgrade() -> None:
    op.drop_column("menu_import_draft_items", "option_groups")
