"""Allow served Quick Sale takeaways.

Revision ID: e7f8a9b0c1d2
Revises: d6e7f8a9b0c1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("chk_quick_sale_status", "quick_sales", type_="check")
    op.create_check_constraint(
        "chk_quick_sale_status",
        "quick_sales",
        "status IN ('pending', 'accepted', 'preparing', 'ready', 'served', 'completed')",
    )


def downgrade() -> None:
    connection = op.get_bind()
    served_count = connection.execute(
        sa.text("SELECT COUNT(*) FROM quick_sales WHERE status = 'served'")
    ).scalar_one()
    if served_count:
        raise RuntimeError(
            "Cannot downgrade while served Quick Sales exist; complete or move them "
            "to a status supported by the previous constraint first."
        )

    op.drop_constraint("chk_quick_sale_status", "quick_sales", type_="check")
    op.create_check_constraint(
        "chk_quick_sale_status",
        "quick_sales",
        "status IN ('pending', 'accepted', 'preparing', 'ready', 'completed')",
    )
