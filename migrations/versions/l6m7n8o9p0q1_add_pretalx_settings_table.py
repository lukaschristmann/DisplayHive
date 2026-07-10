"""add pretalx_settings table

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-06-27
"""

from alembic import op
import sqlalchemy as sa

revision = 'l6m7n8o9p0q1'
down_revision = 'k5l6m7n8o9p0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pretalx_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('time_format', sa.String(50), nullable=False, server_default='HH:mm'),
        sa.Column('end_of_day', sa.String(5), nullable=False, server_default='23:59'),
        sa.Column('no_session_text', sa.String(500), nullable=False, server_default='No session running'),
        sa.Column('coming_up_text', sa.String(500), nullable=False, server_default='Coming up next'),
        sa.Column('invalid_data_text', sa.String(500), nullable=False, server_default='Invalid API data'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('pretalx_settings')
