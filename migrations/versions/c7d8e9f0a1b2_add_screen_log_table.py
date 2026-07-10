"""add screen_log table

Revision ID: c7d8e9f0a1b2
Revises: a1b2c3d4e5f6
Create Date: 2026-03-27
"""

from alembic import op
import sqlalchemy as sa

revision = 'c7d8e9f0a1b2'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'screen_log',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True, nullable=False),
        sa.Column('screen_id', sa.Integer(), sa.ForeignKey('screen.id', ondelete='CASCADE'), nullable=False),
        sa.Column('timestamp', sa.String(50), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='info'),
        sa.Column('message', sa.String(2000), nullable=False, server_default=''),
        sa.Column('function', sa.String(255), nullable=False, server_default=''),
    )
    op.create_index('ix_screen_log_screen_id', 'screen_log', ['screen_id'])


def downgrade():
    op.drop_index('ix_screen_log_screen_id', table_name='screen_log')
    op.drop_table('screen_log')
