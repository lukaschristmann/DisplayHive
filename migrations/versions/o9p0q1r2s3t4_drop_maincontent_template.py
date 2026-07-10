"""drop deprecated maincontent.template column

Revision ID: o9p0q1r2s3t4
Revises: n8o9p0q1r2s3
Create Date: 2026-07-05
"""

from alembic import op
import sqlalchemy as sa

revision = 'o9p0q1r2s3t4'
down_revision = 'n8o9p0q1r2s3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('maincontent') as batch_op:
        batch_op.drop_column('template')


def downgrade():
    with op.batch_alter_table('maincontent') as batch_op:
        batch_op.add_column(sa.Column('template', sa.String(255), nullable=True))
