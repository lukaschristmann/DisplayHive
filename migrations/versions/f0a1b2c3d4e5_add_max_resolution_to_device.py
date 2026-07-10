"""add max_resolution to device

Revision ID: f0a1b2c3d4e5
Revises: e2f3a4b5c6d7
Create Date: 2026-06-20
"""

from alembic import op
import sqlalchemy as sa

revision = 'f0a1b2c3d4e5'
down_revision = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('device') as batch_op:
        batch_op.add_column(sa.Column('max_resolution_width', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('max_resolution_height', sa.Integer(), nullable=True))


def downgrade():
    with op.batch_alter_table('device') as batch_op:
        batch_op.drop_column('max_resolution_height')
        batch_op.drop_column('max_resolution_width')
