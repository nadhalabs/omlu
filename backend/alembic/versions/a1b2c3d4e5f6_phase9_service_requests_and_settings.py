"""phase9_service_requests_and_settings

Revision ID: a1b2c3d4e5f6
Revises: 57d7e2165328
Create Date: 2026-07-12 01:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '57d7e2165328'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add settings columns to restaurants table
    op.add_column('restaurants', sa.Column('timezone', sa.String(length=100), nullable=False, server_default='Asia/Kolkata'))
    op.add_column('restaurants', sa.Column('currency', sa.String(length=10), nullable=False, server_default='INR'))
    op.add_column('restaurants', sa.Column('order_prefix', sa.String(length=10), nullable=False, server_default='NS'))
    op.add_column('restaurants', sa.Column('service_requests_enabled', sa.Boolean(), nullable=False, server_default='true'))

    # Add performance indexes on orders table for dashboard queries
    op.create_index('ix_orders_restaurant_created_at', 'orders', ['restaurant_id', 'created_at'])
    op.create_index('ix_orders_restaurant_status', 'orders', ['restaurant_id', 'status'])
    # Index for status-history lookups used in dashboard revenue calculations
    op.create_index('ix_order_status_history_order_status_time', 'order_status_history', ['order_id', 'new_status', 'changed_at'])

    # Create service_requests table
    op.create_table('service_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), nullable=False),
        sa.Column('table_id', sa.Integer(), nullable=False),
        sa.Column('order_id', sa.Integer(), nullable=True),
        sa.Column('request_type', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('resolved_by_staff_id', sa.Integer(), nullable=True),
        sa.CheckConstraint("request_type IN ('waiter', 'water', 'bill')", name='chk_service_request_type_valid'),
        sa.CheckConstraint("status IN ('pending', 'resolved', 'cancelled')", name='chk_service_request_status_valid'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['resolved_by_staff_id'], ['staff_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['table_id'], ['restaurant_tables.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_service_requests_restaurant_status', 'service_requests', ['restaurant_id', 'status'])
    op.create_index('ix_service_requests_table_type_status', 'service_requests', ['table_id', 'request_type', 'status'])
    op.create_index('ix_service_requests_restaurant_created', 'service_requests', ['restaurant_id', 'status', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_service_requests_restaurant_created', table_name='service_requests')
    op.drop_index('ix_service_requests_table_type_status', table_name='service_requests')
    op.drop_index('ix_service_requests_restaurant_status', table_name='service_requests')
    op.drop_table('service_requests')
    op.drop_index('ix_order_status_history_order_status_time', table_name='order_status_history')
    op.drop_index('ix_orders_restaurant_status', table_name='orders')
    op.drop_index('ix_orders_restaurant_created_at', table_name='orders')
    op.drop_column('restaurants', 'service_requests_enabled')
    op.drop_column('restaurants', 'order_prefix')
    op.drop_column('restaurants', 'currency')
    op.drop_column('restaurants', 'timezone')
