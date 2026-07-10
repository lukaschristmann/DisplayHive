"""add pretalx_api_url and pretalx_api_cache tables

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-06-26
"""

from alembic import op
import sqlalchemy as sa

revision = 'k5l6m7n8o9p0'
down_revision = 'j4k5l6m7n8o9'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pretalx_api_url',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('polling_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('polling_interval', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('last_success', sa.DateTime(), nullable=True),
        sa.Column('last_failure', sa.DateTime(), nullable=True),
        sa.Column('is_valid', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'pretalx_api_cache',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('api_url_id', sa.Integer(), nullable=False),
        sa.Column('cached_json', sa.Text(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['api_url_id'], ['pretalx_api_url.id'], ondelete='CASCADE'),
    )


def downgrade():
    op.drop_table('pretalx_api_cache')
    op.drop_table('pretalx_api_url')
