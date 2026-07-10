"""rename tagconfig.field_type to field_handler

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-07-10
"""

from alembic import op
import sqlalchemy as sa

revision = 'u6v7w8x9y0z1'
down_revision = 't5u6v7w8x9y0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tagconfig', schema=None) as batch_op:
        batch_op.alter_column('field_type', new_column_name='field_handler', existing_type=sa.String(50))


def downgrade():
    with op.batch_alter_table('tagconfig', schema=None) as batch_op:
        batch_op.alter_column('field_handler', new_column_name='field_type', existing_type=sa.String(50))
