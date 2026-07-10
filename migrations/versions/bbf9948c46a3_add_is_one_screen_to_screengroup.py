"""add is_one_screen to screengroup

Revision ID: bbf9948c46a3
Revises:
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa

revision = 'bbf9948c46a3'
down_revision = 'f3b4c5d6e7f8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('screengroup') as batch_op:
        batch_op.add_column(
            sa.Column('is_one_screen', sa.Boolean(), nullable=False, server_default='0')
        )


def downgrade():
    with op.batch_alter_table('screengroup') as batch_op:
        batch_op.drop_column('is_one_screen')
