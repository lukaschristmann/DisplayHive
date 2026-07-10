"""Utilities for content operations."""

import re
import logging

logger = logging.getLogger(__name__)


def push_content_to_screen(socketio, app, db, screen):
    """Push an upd_content update to a single screen.

    Issues a fresh DB query (with joinedload) so that screengroup relationships
    reflect the committed state, not any stale in-memory ORM cache.
    """
    try:
        from sqlalchemy.orm import joinedload
        from application.socketio_handlers.upd_content import send_upd_content
        from application.models import Screen

        screen_id = screen.id
        fresh_screen = db.session.execute(
            db.select(Screen)
            .options(joinedload(Screen.screengroups))
            .where(Screen.id == screen_id)
        ).unique().scalar_one_or_none()

        if fresh_screen is None:
            logger.debug("[push_content_to_screen] Screen id=%s not found", screen_id)
            return

        send_upd_content(socketio, db, screens=[fresh_screen])
    except Exception:
        logger.exception("[push_content_to_screen] Error")


def push_content_list_to_all_screens(socketio, app, db):
    """Push content list updates to all screens based on their screengroup assignments."""
    try:
        from sqlalchemy.orm import joinedload
        from application.socketio_handlers.upd_content import send_upd_content
        from application.models import Screen

        screens = db.session.execute(
            db.select(Screen).options(joinedload(Screen.screengroups))
        ).unique().scalars().all()

        send_upd_content(socketio, db, screens=list(screens))
    except Exception:
        logger.exception("[push_content_list_to_all_screens] Error")

