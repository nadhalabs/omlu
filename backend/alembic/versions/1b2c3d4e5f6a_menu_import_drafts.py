"""menu import drafts

Revision ID: 1b2c3d4e5f6a
Revises: e7f8a9b0c1d2
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "1b2c3d4e5f6a"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("menu_items", sa.Column("food_type", sa.String(20), nullable=True))
    op.create_table(
        "menu_import_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("source_type", sa.String(30), server_default="images", nullable=False),
        sa.Column("original_result", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["staff_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_menu_import_jobs_restaurant_id", "menu_import_jobs", ["restaurant_id"])
    op.create_table(
        "menu_import_draft_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("import_job_id", sa.Uuid(), nullable=False),
        sa.Column("category_name", sa.Text(), nullable=True),
        sa.Column("item_name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
        sa.Column("food_type", sa.String(20), nullable=False),
        sa.Column("variants", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("warnings", sa.JSON(), server_default="[]", nullable=False),
        sa.Column("item_confidence", sa.Numeric(4, 3), nullable=False),
        sa.Column("category_confidence", sa.Numeric(4, 3), nullable=False),
        sa.Column("selected", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["import_job_id"], ["menu_import_jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_menu_import_draft_items_import_job_id", "menu_import_draft_items", ["import_job_id"])


def downgrade() -> None:
    op.drop_table("menu_import_draft_items")
    op.drop_table("menu_import_jobs")
    op.drop_column("menu_items", "food_type")
