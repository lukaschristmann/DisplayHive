"""Helpers for admin templates page (server-side).

Provides helper to emit the templates list payload to admin clients.
"""

import logging
from typing import Optional

from application.models import Template

logger = logging.getLogger(__name__)


def emit_templates_update(socketio, app, db, room: Optional[str] = None):
    """Build a minimal templates payload and emit to clients.

    Payload shape: {'data': [ {id, name, description, containers_count, isDefault}, ... ]}
    """
    try:
        all_templates = db.session.execute(db.select(Template)).scalars().all()
        templates = [
            {
                'id': t.id,
                'name': t.name,
                'description': t.description or '',
                'containers_count': len(t.contentcontainers) if t.contentcontainers is not None else 0,
                'isDefault': bool(getattr(t, 'isDefault', False)),
            }
            for t in all_templates
        ]

        payload = {'data': templates}
        socketio.emit('displayhive:admin:stc:upd_templates', payload, room=room or 'admins')
    except Exception:
        logger.exception("Error emitting templates update")
