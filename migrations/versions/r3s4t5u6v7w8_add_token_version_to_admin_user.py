"""add token_version to admin_user

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-07-05
"""

from alembic import op
import sqlalchemy as sa

revision = 'r3s4t5u6v7w8'
down_revision = 'q2r3s4t5u6v7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'admin_user',
        sa.Column('token_version', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade():
    op.drop_column('admin_user', 'token_version')
