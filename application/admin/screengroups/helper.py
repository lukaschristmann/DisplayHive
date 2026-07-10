"""Helpers for admin screengroups page: building and emitting screengroups lists."""

import logging

logger = logging.getLogger(__name__)


def emit_screengroups_update(socketio, app, db, room=None):
    """Build and emit the namespaced `displayhive:admin:stc:upd_screengroups` payload.

    Each screengroup entry follows a JSON:API-style shape with `attributes` and
    `relationships.screens` so the frontend can populate inverse relations without
    additional round-trips.
    """
    with app.app_context():
        try:
            from application.models import Screengroup

            screengroups = db.session.execute(
                db.select(Screengroup).order_by(Screengroup.name)
            ).scalars().all()

            screengroups_data = [
                {
                    'id': sg.id,
                    'type': 'screengroup',
                    'attributes': {
                        'name': sg.name,
                        'screensCount': len(sg.screens),
                        'contentCount': len(sg.content_elements),
                        'is_one_screen': bool(getattr(sg, 'is_one_screen', False)),
                    },
                    'relationships': {
                        'screens': {
                            'data': [{'id': s.id, 'type': 'screen'} for s in sg.screens],
                        }
                    },
                }
                for sg in screengroups
            ]

            payload = {'data': screengroups_data}
            logger.debug('Emitting %s screengroups to %s', len(screengroups_data), room or 'broadcast')

            if room:
                socketio.emit('displayhive:admin:stc:upd_screengroups', payload, room=room)
            else:
                socketio.emit('displayhive:admin:stc:upd_screengroups', payload)

        except Exception:
            logger.exception('Error emitting screengroups update')
