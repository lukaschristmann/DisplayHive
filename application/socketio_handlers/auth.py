"""Shared authorization helpers for Socket.IO handlers."""

import logging
from functools import wraps

logger = logging.getLogger(__name__)


# Per-connection registry of the JWT each admin socket authenticated with,
# keyed by session id (sid). Populated by the connect handler when an admin
# token is accepted and cleared on disconnect. This lets require_admin()
# re-validate the token on every event instead of trusting 'admins' room
# membership for the whole life of the socket — so an admin who is deleted,
# deactivated, or whose password changed (token_version bump) loses access on
# their *next* action rather than lingering until the socket happens to drop.
_admin_sessions: dict[str, str] = {}


def register_admin_session(sid: str, token: str) -> None:
    """Record the JWT an admin socket authenticated with, keyed by session id."""
    if sid and token:
        _admin_sessions[sid] = token


def clear_admin_session(sid: str) -> None:
    """Forget an admin socket's token. Called from the disconnect handler."""
    if sid:
        _admin_sessions.pop(sid, None)


def require_admin() -> bool:
    """Return True only if the current socket is a still-valid authenticated admin.

    Two conditions must hold:
      1. the socket joined the 'admins' room at connect (server-side state a
         client cannot forge), and
      2. the token it presented at connect is *still* valid right now — the
         account has not since been deleted, deactivated, or had its password
         changed (see application.auth.user_from_token).

    Fails closed: any error resolving the token denies the action.

    Prefer the @admin_handler decorator over calling this directly.
    """
    try:
        from flask import request, current_app
        from flask_socketio import rooms

        if 'admins' not in rooms():
            return False

        sid = getattr(request, 'sid', None)
        token = _admin_sessions.get(sid)
        if not token:
            return False

        from application.models import db
        from application.auth import user_from_token
        return user_from_token(current_app._get_current_object(), db, token) is not None
    except Exception:
        return False


def admin_handler(fn):
    """Decorator for admin-only Socket.IO handlers.

    Wraps a handler so it:
      1. runs only for a still-valid authenticated admin (see require_admin),
         silently ignoring the event otherwise, and
      2. never lets an unhandled exception escape into the Socket.IO server —
         it is logged (with traceback) and the DB session is rolled back so a
         failed transaction cannot poison the next event on the shared session.

    Replaces the `if not require_admin(): return` + broad `try/except:
    traceback.print_exc()` boilerplate that every admin handler used to repeat.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not require_admin():
            return None
        try:
            return fn(*args, **kwargs)
        except Exception:
            logger.exception("Unhandled error in admin handler %s", fn.__name__)
            try:
                from application.models import db
                db.session.rollback()
            except Exception:
                pass
            return None
    return wrapper


def fields(message, *names):
    """Extract named fields from a Socket.IO message payload.

    Returns a tuple of `message[name]` for each name (or None when the payload
    is not a dict / a key is missing). Collapses the repeated
    `x = message.get('x') if isinstance(message, dict) else None` idiom:

        screengroup_id, screen_id = fields(message, 'screengroup_id', 'screen_id')

    A single requested field still returns a 1-tuple, so unpack accordingly:
        (name,) = fields(message, 'name')
    """
    data = message if isinstance(message, dict) else {}
    return tuple(data.get(name) for name in names)
