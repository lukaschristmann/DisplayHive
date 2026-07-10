"""Retention enforcement for the screen_log table.

Keeps at most MAX_AGE_HOURS worth of history and at most MAX_ROWS total rows,
whichever limit is hit first.
"""

from datetime import datetime, timedelta

MAX_AGE_HOURS = 72
MAX_ROWS = 250_000


def prune_screen_logs(db):
    """Delete screen_log rows older than MAX_AGE_HOURS, then trim to MAX_ROWS
    by deleting the oldest rows (by id) if the table still exceeds the cap.

    Returns (deleted_by_age, deleted_by_cap).
    """
    from application.models import ScreenLog

    cutoff = datetime.now() - timedelta(hours=MAX_AGE_HOURS)
    deleted_by_age = db.session.execute(
        db.delete(ScreenLog).where(ScreenLog.timestamp < cutoff)
    ).rowcount
    db.session.commit()

    total = db.session.execute(
        db.select(db.func.count()).select_from(ScreenLog)
    ).scalar()

    deleted_by_cap = 0
    if total > MAX_ROWS:
        excess = total - MAX_ROWS
        oldest_ids = db.session.execute(
            db.select(ScreenLog.id).order_by(ScreenLog.id.asc()).limit(excess)
        ).scalars().all()
        if oldest_ids:
            deleted_by_cap = db.session.execute(
                db.delete(ScreenLog).where(ScreenLog.id.in_(oldest_ids))
            ).rowcount
            db.session.commit()

    return deleted_by_age, deleted_by_cap
