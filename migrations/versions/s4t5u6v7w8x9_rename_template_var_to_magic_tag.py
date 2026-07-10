"""rename template_var table to magic_tag

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
Create Date: 2026-07-07
"""

from alembic import op

revision = 's4t5u6v7w8x9'
down_revision = 'r3s4t5u6v7w8'
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table('template_var', 'magic_tag')


def downgrade():
    op.rename_table('magic_tag', 'template_var')
