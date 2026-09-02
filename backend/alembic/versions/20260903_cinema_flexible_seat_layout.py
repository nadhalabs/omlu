"""add flexible cinema seat coordinates

Revision ID: cinema_layout_20260903
Revises: cinema_binding_20260902
"""
from alembic import op
import sqlalchemy as sa

revision = "cinema_layout_20260903"
down_revision = "cinema_binding_20260902"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("cinema_seats", sa.Column("layout_x", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("cinema_seats", sa.Column("layout_y", sa.Integer(), nullable=False, server_default="0"))
    op.execute("""
        WITH positioned AS (
            SELECT id, position_index * 64 AS x,
                   (dense_rank() OVER (PARTITION BY cinema_screen_id ORDER BY row_label) - 1) * 56 AS y
            FROM cinema_seats
        )
        UPDATE cinema_seats AS seats
        SET layout_x = positioned.x, layout_y = positioned.y
        FROM positioned WHERE seats.id = positioned.id
    """)
    op.drop_constraint("chk_cinema_seat_position", "cinema_seats", type_="check")
    op.create_check_constraint("chk_cinema_seat_position", "cinema_seats", "seat_number > 0 AND position_index >= 0 AND layout_x >= 0 AND layout_y >= 0")


def downgrade():
    op.drop_constraint("chk_cinema_seat_position", "cinema_seats", type_="check")
    op.create_check_constraint("chk_cinema_seat_position", "cinema_seats", "seat_number > 0 AND position_index >= 0")
    op.drop_column("cinema_seats", "layout_y")
    op.drop_column("cinema_seats", "layout_x")
