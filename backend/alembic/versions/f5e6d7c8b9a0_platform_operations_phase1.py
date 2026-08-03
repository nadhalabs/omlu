"""platform_operations_phase1

Revision ID: f5e6d7c8b9a0
Revises: f4d5e6f7a8b9
Create Date: 2026-08-03 23:42:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f5e6d7c8b9a0'
down_revision = ('f4d5e6f7a8b9', 'c4d5e6f7a8b9')
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'platform_users',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('username', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=1024), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), server_default='platform_support', nullable=False),
        sa.Column('status', sa.String(length=50), server_default='active', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('security_version', sa.Integer(), server_default='0', nullable=False),
        sa.Column('must_change_password', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('platform_owner', 'platform_admin', 'platform_support', 'platform_readonly')", name='chk_platform_user_role'),
        sa.CheckConstraint("status IN ('active', 'suspended', 'removed')", name='chk_platform_user_status'),
    )
    op.create_index('ix_platform_users_email', 'platform_users', ['email'], unique=True)
    op.create_index('ix_platform_users_username', 'platform_users', ['username'], unique=True)
    op.create_index('ix_platform_users_role', 'platform_users', ['role'])
    op.create_index('ix_platform_users_status', 'platform_users', ['status'])
    op.create_index('ix_platform_users_is_active', 'platform_users', ['is_active'])

    op.create_table(
        'platform_sessions',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('platform_user_id', sa.Integer(), nullable=False),
        sa.Column('token_jti', sa.String(length=128), nullable=False),
        sa.Column('device', sa.String(length=512), nullable=True),
        sa.Column('ip_address', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='active', nullable=False),
        sa.Column('login_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('last_active_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['platform_user_id'], ['platform_users.id'], ondelete='CASCADE'),
        sa.CheckConstraint("status IN ('active', 'revoked')", name='chk_platform_session_status'),
    )
    op.create_index('ix_platform_sessions_platform_user_id', 'platform_sessions', ['platform_user_id'])
    op.create_index('ix_platform_sessions_token_jti', 'platform_sessions', ['token_jti'], unique=True)
    op.create_index('ix_platform_sessions_status', 'platform_sessions', ['status'])

    op.create_table(
        'platform_audit_logs',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True),
        sa.Column('actor_user_id', sa.Integer(), nullable=True),
        sa.Column('actor_role', sa.String(length=50), nullable=True),
        sa.Column('target_type', sa.String(length=100), nullable=False),
        sa.Column('target_id', sa.String(length=100), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('restaurant_id', sa.Integer(), nullable=True),
        sa.Column('previous_value', sa.String(length=2048), nullable=True),
        sa.Column('new_value', sa.String(length=2048), nullable=True),
        sa.Column('ip_address', sa.String(length=64), nullable=True),
        sa.Column('request_id', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.ForeignKeyConstraint(['actor_user_id'], ['platform_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['restaurant_id'], ['restaurants.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_platform_audit_logs_actor_user_id', 'platform_audit_logs', ['actor_user_id'])
    op.create_index('ix_platform_audit_logs_action', 'platform_audit_logs', ['action'])
    op.create_index('ix_platform_audit_logs_restaurant_id', 'platform_audit_logs', ['restaurant_id'])


def downgrade():
    op.drop_table('platform_audit_logs')
    op.drop_table('platform_sessions')
    op.drop_table('platform_users')
