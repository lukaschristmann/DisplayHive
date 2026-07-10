"""add monitoring_enabled to screen

Revision ID: g1h2i3j4k5l6
Revises: f0a1b2c3d4e5
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = 'g1h2i3j4k5l6'
down_revision = 'f0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('screen') as batch_op:
        batch_op.add_column(
            sa.Column('monitoring_enabled', sa.Boolean(), nullable=False, server_default='1')
        )


def downgrade():
    with op.batch_alter_table('screen') as batch_op:
        batch_op.drop_column('monitoring_enabled')
