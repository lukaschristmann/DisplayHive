"""add user rights system (groups, rights, overrides)

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-07-14
"""

from alembic import op
import sqlalchemy as sa

revision = 'v7w8x9y0z1a2'
down_revision = 'u6v7w8x9y0z1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'right_definition',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('key', sa.String(100), nullable=False),
        sa.Column('category', sa.String(50), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.UniqueConstraint('key', name='uq_right_definition_key'),
    )
    op.create_index('ix_right_definition_key', 'right_definition', ['key'])

    op.create_table(
        'group',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('parent_group_id', sa.Integer(), sa.ForeignKey('group.id'), nullable=True),
        sa.Column('is_superadmin', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('name', name='uq_group_name'),
    )
    op.create_index('ix_group_name', 'group', ['name'])

    op.create_table(
        'group_right',
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('group.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('right_id', sa.Integer(), sa.ForeignKey('right_definition.id', ondelete='CASCADE'), primary_key=True),
    )

    op.create_table(
        'user_group',
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('admin_user.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('group.id', ondelete='CASCADE'), primary_key=True),
    )

    op.create_table(
        'user_right',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('admin_user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('right_id', sa.Integer(), sa.ForeignKey('right_definition.id', ondelete='CASCADE'), nullable=False),
        sa.Column('value', sa.String(10), nullable=False),
        sa.UniqueConstraint('user_id', 'right_id', name='uq_user_right_user_id_right_id'),
    )
    op.create_index('ix_user_right_user_id', 'user_right', ['user_id'])


def downgrade():
    op.drop_index('ix_user_right_user_id', table_name='user_right')
    op.drop_table('user_right')
    op.drop_table('user_group')
    op.drop_table('group_right')
    op.drop_index('ix_group_name', table_name='group')
    op.drop_table('group')
    op.drop_index('ix_right_definition_key', table_name='right_definition')
    op.drop_table('right_definition')
