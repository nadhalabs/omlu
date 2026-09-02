"""add persistent cinema seat ordering domain

Revision ID: cinema_20260902
Revises: google_review_20260824
"""
from alembic import op
import sqlalchemy as sa

revision = "cinema_20260902"
down_revision = "google_review_20260824"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("restaurants", sa.Column("venue_type", sa.String(20), nullable=False, server_default="restaurant"))
    op.create_index("ix_restaurants_venue_type", "restaurants", ["venue_type"])
    op.create_check_constraint("chk_restaurants_venue_type", "restaurants", "venue_type IN ('restaurant', 'cinema')")

    op.create_table("cinema_screens",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("restaurant_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False), sa.Column("code", sa.String(30), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("restaurant_id", "id", name="uq_cinema_screens_tenant_id"),
        sa.CheckConstraint("code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'", name="chk_cinema_screen_code"),
    )
    op.create_index("ix_cinema_screens_restaurant_id", "cinema_screens", ["restaurant_id"])
    op.create_index("uq_cinema_screens_tenant_code_lower", "cinema_screens", ["restaurant_id", sa.text("lower(code)")], unique=True)
    op.create_table("cinema_seats",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("restaurant_id", sa.Integer(), nullable=False), sa.Column("cinema_screen_id", sa.Integer(), nullable=False),
        sa.Column("row_label", sa.String(10), nullable=False), sa.Column("seat_number", sa.Integer(), nullable=False), sa.Column("public_code", sa.String(30), nullable=False),
        sa.Column("position_index", sa.Integer(), nullable=False), sa.Column("aisle_after", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("is_accessible", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["restaurant_id", "cinema_screen_id"], ["cinema_screens.restaurant_id", "cinema_screens.id"], name="fk_cinema_seat_tenant_screen", ondelete="RESTRICT"),
        sa.UniqueConstraint("restaurant_id", "id", name="uq_cinema_seats_tenant_id"), sa.UniqueConstraint("cinema_screen_id", "row_label", "seat_number", name="uq_cinema_seat_position"),
        sa.CheckConstraint("seat_number > 0 AND position_index >= 0", name="chk_cinema_seat_position"), sa.CheckConstraint("public_code ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$'", name="chk_cinema_seat_public_code"),
    )
    op.create_index("ix_cinema_seats_restaurant_id", "cinema_seats", ["restaurant_id"]); op.create_index("ix_cinema_seats_cinema_screen_id", "cinema_seats", ["cinema_screen_id"])
    op.create_index("uq_cinema_seat_public_code_lower", "cinema_seats", ["cinema_screen_id", sa.text("lower(public_code)")], unique=True)
    op.create_table("cinema_seat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True), sa.Column("restaurant_id", sa.Integer(), nullable=False), sa.Column("cinema_screen_id", sa.Integer(), nullable=False), sa.Column("cinema_seat_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["restaurant_id"], ["restaurants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["restaurant_id", "cinema_screen_id"], ["cinema_screens.restaurant_id", "cinema_screens.id"], name="fk_cinema_session_tenant_screen"),
        sa.ForeignKeyConstraint(["restaurant_id", "cinema_seat_id"], ["cinema_seats.restaurant_id", "cinema_seats.id"], name="fk_cinema_session_tenant_seat"),
        sa.UniqueConstraint("token_hash"),
    )
    for column in ("restaurant_id", "cinema_screen_id", "cinema_seat_id", "token_hash", "expires_at"):
        op.create_index(f"ix_cinema_seat_sessions_{column}", "cinema_seat_sessions", [column])

    op.add_column("orders", sa.Column("cinema_seat_id", sa.Integer(), nullable=True)); op.add_column("orders", sa.Column("cinema_seat_session_id", sa.Integer(), nullable=True))
    op.add_column("orders", sa.Column("order_context_type", sa.String(20), nullable=False, server_default="restaurant")); op.alter_column("orders", "table_id", nullable=True)
    op.create_check_constraint("chk_order_status_valid", "orders", "status IN ('pending', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'out_for_delivery', 'delivered')")
    op.create_foreign_key("fk_orders_tenant_cinema_seat", "orders", "cinema_seats", ["restaurant_id", "cinema_seat_id"], ["restaurant_id", "id"])
    op.create_foreign_key("fk_orders_cinema_seat_session", "orders", "cinema_seat_sessions", ["cinema_seat_session_id"], ["id"], ondelete="SET NULL")
    op.create_check_constraint("chk_orders_context_xor", "orders", "(order_context_type = 'restaurant' AND table_id IS NOT NULL AND cinema_seat_id IS NULL AND cinema_seat_session_id IS NULL) OR (order_context_type = 'cinema' AND table_id IS NULL AND dining_session_id IS NULL AND cinema_seat_id IS NOT NULL AND cinema_seat_session_id IS NOT NULL)")
    for column in ("cinema_seat_id", "cinema_seat_session_id", "order_context_type"):
        op.create_index(f"ix_orders_{column}", "orders", [column])


def downgrade():
    for column in ("order_context_type", "cinema_seat_session_id", "cinema_seat_id"): op.drop_index(f"ix_orders_{column}", table_name="orders")
    op.drop_constraint("chk_orders_context_xor", "orders", type_="check"); op.drop_constraint("fk_orders_cinema_seat_session", "orders", type_="foreignkey"); op.drop_constraint("fk_orders_tenant_cinema_seat", "orders", type_="foreignkey")
    op.drop_constraint("chk_order_status_valid", "orders", type_="check")
    op.alter_column("orders", "table_id", nullable=False); op.drop_column("orders", "order_context_type"); op.drop_column("orders", "cinema_seat_session_id"); op.drop_column("orders", "cinema_seat_id")
    op.drop_table("cinema_seat_sessions"); op.drop_table("cinema_seats"); op.drop_table("cinema_screens")
    op.drop_constraint("chk_restaurants_venue_type", "restaurants", type_="check"); op.drop_index("ix_restaurants_venue_type", table_name="restaurants"); op.drop_column("restaurants", "venue_type")
