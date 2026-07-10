"""convert screen_log.timestamp and media.created_at to real DateTime, add screen_log.timestamp index

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-07-05
"""

from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = 'n8o9p0q1r2s3'
down_revision = 'm7n8o9p0q1r2'
branch_labels = None
depends_on = None


def _to_naive_utc_str(value):
    """Parse an ISO-8601 string (with or without a timezone offset) into the
    naive 'YYYY-MM-DD HH:MM:SS.ffffff' format SQLAlchemy's DateTime type
    writes/reads on SQLite."""
    try:
        dt = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        dt = datetime.now(timezone.utc)
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat(sep=' ')


def upgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    # --- media.created_at: String -> DateTime ---------------------------
    if dialect == 'postgresql':
        # Existing rows store ISO-8601 strings (some with a timezone offset);
        # normalize them to a naive-UTC format the new column can parse.
        rows = conn.execute(sa.text('SELECT id, created_at FROM media')).fetchall()
        for row in rows:
            conn.execute(
                sa.text('UPDATE media SET created_at = :dt WHERE id = :id'),
                {'dt': _to_naive_utc_str(row.created_at), 'id': row.id},
            )
        op.execute(
            'ALTER TABLE media ALTER COLUMN created_at TYPE TIMESTAMP '
            "USING created_at::timestamp"
        )
    else:
        # NOTE: on SQLite, changing a column's declared type via
        # batch_alter_table's alter_column recreates the table with an
        # INSERT...SELECT that lets SQLite CAST the old text values into the
        # new column's storage affinity. DATETIME has NUMERIC affinity, and
        # SQLite's CAST-to-numeric truncates a string at its first
        # non-numeric character — "2026-07-05 10:20:48" silently becomes just
        # "2026". Avoid that entirely: add a new DateTime column, populate it
        # via parameterized UPDATEs (binds a real Python datetime, no
        # SQL-level CAST involved), then drop the old column and rename.
        with op.batch_alter_table('media') as batch_op:
            batch_op.add_column(sa.Column('created_at_new', sa.DateTime(), nullable=True))

        rows = conn.execute(sa.text('SELECT id, created_at FROM media')).fetchall()
        for row in rows:
            try:
                dt = datetime.fromisoformat(row.created_at)
            except (TypeError, ValueError):
                dt = datetime.now(timezone.utc)
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            conn.execute(
                sa.text('UPDATE media SET created_at_new = :dt WHERE id = :id'),
                {'dt': dt, 'id': row.id},
            )

        with op.batch_alter_table('media') as batch_op:
            batch_op.drop_column('created_at')
        with op.batch_alter_table('media') as batch_op:
            batch_op.alter_column(
                'created_at_new',
                new_column_name='created_at',
                existing_type=sa.DateTime(),
                nullable=False,
            )

    # --- screen_log.timestamp: String -> DateTime, plus missing index ---
    # No writer persists to screen_log yet, so there is no existing data to
    # normalize here.
    if dialect == 'postgresql':
        op.execute(
            'ALTER TABLE screen_log ALTER COLUMN "timestamp" TYPE TIMESTAMP '
            'USING "timestamp"::timestamp'
        )
        op.create_index('ix_screen_log_timestamp', 'screen_log', ['timestamp'])
    else:
        with op.batch_alter_table('screen_log') as batch_op:
            batch_op.alter_column(
                'timestamp',
                existing_type=sa.String(50),
                type_=sa.DateTime(),
                existing_nullable=False,
            )
            batch_op.create_index('ix_screen_log_timestamp', ['timestamp'])


def downgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name

    if dialect == 'postgresql':
        op.drop_index('ix_screen_log_timestamp', table_name='screen_log')
        op.execute('ALTER TABLE screen_log ALTER COLUMN "timestamp" TYPE VARCHAR(50) USING "timestamp"::varchar')
        op.execute('ALTER TABLE media ALTER COLUMN created_at TYPE VARCHAR(50) USING created_at::varchar')
    else:
        with op.batch_alter_table('screen_log') as batch_op:
            batch_op.drop_index('ix_screen_log_timestamp')
            batch_op.alter_column(
                'timestamp',
                existing_type=sa.DateTime(),
                type_=sa.String(50),
                existing_nullable=False,
            )
        with op.batch_alter_table('media') as batch_op:
            batch_op.alter_column(
                'created_at',
                existing_type=sa.DateTime(),
                type_=sa.String(50),
                existing_nullable=False,
            )
