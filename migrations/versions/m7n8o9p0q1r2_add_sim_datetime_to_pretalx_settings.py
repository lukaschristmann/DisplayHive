"""add sim_datetime to pretalx_settings

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-06-27
"""

from alembic import op
import sqlalchemy as sa

revision = 'm7n8o9p0q1r2'
down_revision = 'l6m7n8o9p0q1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('pretalx_settings', sa.Column('sim_datetime', sa.String(20), nullable=True))


def downgrade():
    op.drop_column('pretalx_settings', 'sim_datetime')
