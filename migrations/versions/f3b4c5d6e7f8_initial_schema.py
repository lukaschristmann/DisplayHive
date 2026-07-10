"""Initial schema — create all base tables.

This migration creates the full base schema as it existed before any
incremental migrations were applied.  It is the root of the migration chain
and must run before all other migrations.

Revision ID: f3b4c5d6e7f8
Revises:
Create Date: 2026-01-01

"""

from alembic import op
import sqlalchemy as sa

revision = 'f3b4c5d6e7f8'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Tables with no foreign-key dependencies ───────────────────────────
    op.create_table(
        'template',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('html', sa.Text(), nullable=False),
        sa.Column('css', sa.Text(), nullable=True),
        sa.Column('isDefault', sa.Boolean(), nullable=False, server_default='false'),
    )

    op.create_table(
        'contenttype',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('html', sa.Text(), nullable=False),
    )

    # screengroup — without is_one_screen (added by bbf9948c46a3)
    op.create_table(
        'screengroup',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
    )

    op.create_table(
        'media',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('tags', sa.Text(), nullable=True),
        sa.Column('folder_path', sa.String(512), nullable=False, server_default=''),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.String(50), nullable=False),
    )

    # ── Tables that depend on template ────────────────────────────────────
    op.create_table(
        'screen',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('lastseen', sa.DateTime(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('resolution_width', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('resolution_height', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('debug', sa.Boolean(), nullable=True, server_default='false'),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('template.id'), nullable=True),
    )

    op.create_table(
        'contentcontainer',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('template.id'), nullable=False),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('title', sa.String(255), nullable=True),
    )

    # ── Tables that depend on contenttype ─────────────────────────────────
    # maincontent — without start_time / end_time (added by a1b2c3d4e5f6)
    op.create_table(
        'maincontent',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('active', sa.Boolean(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('html', sa.Text(), nullable=False),
        sa.Column('duration', sa.Integer(), nullable=False),
        sa.Column('serialized_input', sa.Text(), nullable=False),
        sa.Column('contenttype_id', sa.Integer(), sa.ForeignKey('contenttype.id'), nullable=True),
        sa.Column('template', sa.String(255), nullable=True),
        sa.Column('contentcontainer', sa.String(255), nullable=True, server_default='maincontent'),
    )

    op.create_table(
        'tagconfig',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('contenttype_id', sa.Integer(), sa.ForeignKey('contenttype.id'), nullable=False),
        sa.Column('field_name', sa.String(255), nullable=False),
        sa.Column('field_type', sa.String(50), nullable=False),
        sa.Column('field_label', sa.String(255), nullable=True),
        sa.Column('required', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('default_value', sa.Text(), nullable=True),
        sa.Column('order', sa.Integer(), nullable=False, server_default='0'),
    )

    # ── Tables that depend on screen ──────────────────────────────────────
    op.create_table(
        'device',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('devicekey', sa.String(36), nullable=False, unique=True),
        sa.Column('name', sa.String(100), nullable=True),
        sa.Column('registration_token', sa.String(36), nullable=True, unique=True),
        sa.Column('find', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_online', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_connected_at', sa.DateTime(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('screen_id', sa.Integer(), sa.ForeignKey('screen.id'), nullable=True),
    )
    op.create_index('ix_device_devicekey', 'device', ['devicekey'])
    op.create_index('ix_device_registration_token', 'device', ['registration_token'])

    # ── Association tables ────────────────────────────────────────────────
    op.create_table(
        'screengroup_screen',
        sa.Column('screen_id', sa.Integer(), sa.ForeignKey('screen.id'), primary_key=True),
        sa.Column('screengroup_id', sa.Integer(), sa.ForeignKey('screengroup.id'), primary_key=True),
    )

    op.create_table(
        'maincontent_screengroup',
        sa.Column('maincontent_id', sa.Integer(), sa.ForeignKey('maincontent.id'), primary_key=True),
        sa.Column('screengroup_id', sa.Integer(), sa.ForeignKey('screengroup.id'), primary_key=True),
    )

    op.create_table(
        'contenttype_container',
        sa.Column('contenttype_id', sa.Integer(), sa.ForeignKey('contenttype.id'), primary_key=True),
        sa.Column('contentcontainer_id', sa.Integer(), sa.ForeignKey('contentcontainer.id'), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table('contenttype_container')
    op.drop_table('maincontent_screengroup')
    op.drop_table('screengroup_screen')
    op.drop_index('ix_device_registration_token', table_name='device')
    op.drop_index('ix_device_devicekey', table_name='device')
    op.drop_table('device')
    op.drop_table('tagconfig')
    op.drop_table('maincontent')
    op.drop_table('contentcontainer')
    op.drop_table('screen')
    op.drop_table('media')
    op.drop_table('screengroup')
    op.drop_table('contenttype')
    op.drop_table('template')
