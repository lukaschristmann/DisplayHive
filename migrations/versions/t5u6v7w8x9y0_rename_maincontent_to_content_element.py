"""rename maincontent table and related FKs to content_element

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-07-07
"""

from alembic import op
import sqlalchemy as sa

revision = 't5u6v7w8x9y0'
down_revision = 's4t5u6v7w8x9'
branch_labels = None
depends_on = None


def upgrade():
    op.rename_table('maincontent', 'content_element')

    op.rename_table('maincontent_screengroup', 'content_element_screengroup')
    with op.batch_alter_table('content_element_screengroup', schema=None) as batch_op:
        batch_op.alter_column('maincontent_id', new_column_name='content_element_id', existing_type=sa.Integer())


def downgrade():
    with op.batch_alter_table('content_element_screengroup', schema=None) as batch_op:
        batch_op.alter_column('content_element_id', new_column_name='maincontent_id', existing_type=sa.Integer())
    op.rename_table('content_element_screengroup', 'maincontent_screengroup')

    op.rename_table('content_element', 'maincontent')
