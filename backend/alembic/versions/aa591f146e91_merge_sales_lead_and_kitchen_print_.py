"""merge sales lead and kitchen print migration heads

Revision ID: aa591f146e91
Revises: saleslead20260816, kitchenconsumer20260817
Create Date: 2026-08-17 04:06:02.638284

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa591f146e91'
down_revision: Union[str, Sequence[str], None] = ('saleslead20260816', 'kitchenconsumer20260817')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
