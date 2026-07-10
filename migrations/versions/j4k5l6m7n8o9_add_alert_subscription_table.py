"""add alert_subscription table

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-06-23
"""

from alembic import op
import sqlalchemy as sa

revision = 'j4k5l6m7n8o9'
down_revision = 'i3j4k5l6m7n8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'alert_subscription',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('alert_type', sa.String(64), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['telegram_users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id', 'alert_type', name='uq_alert_subscription_user_type'),
    )


def downgrade():
    op.drop_table('alert_subscription')
