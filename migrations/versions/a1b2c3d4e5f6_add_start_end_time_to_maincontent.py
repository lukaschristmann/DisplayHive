"""add start_time and end_time to maincontent

Revision ID: a1b2c3d4e5f6
Revises: bbf9948c46a3
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'bbf9948c46a3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('maincontent') as batch_op:
        batch_op.add_column(
            sa.Column('start_time', sa.DateTime(), nullable=True)
        )
        batch_op.add_column(
            sa.Column('end_time', sa.DateTime(), nullable=True)
        )


def downgrade():
    with op.batch_alter_table('maincontent') as batch_op:
        batch_op.drop_column('end_time')
        batch_op.drop_column('start_time')
