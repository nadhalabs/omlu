"""add_service_request_dining_session

Revision ID: c3d4e5f6a7b8
Revises: b7c8d9e0f1a2
Create Date: 2026-07-12 03:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("service_requests", sa.Column("dining_session_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_service_requests_dining_session_id_dining_sessions",
        "service_requests",
        "dining_sessions",
        ["dining_session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_service_requests_dining_session_id", "service_requests", ["dining_session_id"])


def downgrade() -> None:
    op.drop_index("ix_service_requests_dining_session_id", table_name="service_requests")
    op.drop_constraint(
        "fk_service_requests_dining_session_id_dining_sessions",
        "service_requests",
        type_="foreignkey",
    )
    op.drop_column("service_requests", "dining_session_id")
