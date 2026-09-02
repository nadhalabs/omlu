"""bind cinema authorities to their exact screen and seat

Revision ID: cinema_binding_20260902
Revises: cinema_20260902
"""
from alembic import op

revision = "cinema_binding_20260902"
down_revision = "cinema_20260902"
branch_labels = None
depends_on = None


def upgrade():
    op.create_unique_constraint("uq_cinema_seats_screen_id", "cinema_seats", ["cinema_screen_id", "id"])
    op.create_unique_constraint("uq_cinema_sessions_tenant_seat_id", "cinema_seat_sessions", ["restaurant_id", "cinema_seat_id", "id"])
    op.create_foreign_key("fk_cinema_session_screen_seat", "cinema_seat_sessions", "cinema_seats", ["cinema_screen_id", "cinema_seat_id"], ["cinema_screen_id", "id"])
    op.create_foreign_key("fk_orders_cinema_authority_binding", "orders", "cinema_seat_sessions", ["restaurant_id", "cinema_seat_id", "cinema_seat_session_id"], ["restaurant_id", "cinema_seat_id", "id"])


def downgrade():
    op.drop_constraint("fk_orders_cinema_authority_binding", "orders", type_="foreignkey")
    op.drop_constraint("fk_cinema_session_screen_seat", "cinema_seat_sessions", type_="foreignkey")
    op.drop_constraint("uq_cinema_sessions_tenant_seat_id", "cinema_seat_sessions", type_="unique")
    op.drop_constraint("uq_cinema_seats_screen_id", "cinema_seats", type_="unique")
