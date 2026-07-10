"""add css to contenttype

Revision ID: d1e2f3a4b5c6
Revises: c7d8e9f0a1b2
Create Date: 2026-06-05

"""
from alembic import op
import sqlalchemy as sa

revision = 'd1e2f3a4b5c6'
down_revision = 'c7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contenttype', sa.Column('css', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('contenttype', 'css')
