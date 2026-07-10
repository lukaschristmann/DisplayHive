import logging

logger = logging.getLogger(__name__)


def get_registered_devices_handler(app, socketio, db):
    """Return a list of all registered devices as serializable dicts.

    Each entry is produced by ``Device.to_dict()`` with an additional
    ``screen_name`` key resolved from the device's ``screen_id``.
    Falls back to manual attribute extraction if ``to_dict()`` raises.
    """
    from application.models import Device, Screen
    with app.app_context():
        screens = db.session.execute(db.select(Screen)).scalars().all()
        screen_map = {s.id: s.name for s in screens}
        devices = db.session.execute(db.select(Device)).scalars().all()
        devices_data = []
        for dev in devices:
            try:
                # Prefer model-provided serialization which formats datetimes
                entry = dev.to_dict()
            except Exception:
                # Fallback: manual extraction with ISO-formatted datetimes
                from datetime import datetime  # noqa: PLC0415
                entry = {
                    'id': getattr(dev, 'id', None),
                    'devicekey': getattr(dev, 'devicekey', None),
                    'name': getattr(dev, 'name', None),
                    'created_at': getattr(dev, 'created_at').isoformat() if getattr(dev, 'created_at', None) else None,
                    'last_connected_at': getattr(dev, 'last_connected_at').isoformat() if getattr(dev, 'last_connected_at', None) else None,
                    'is_active': getattr(dev, 'is_active', None),
                    'screen_id': getattr(dev, 'screen_id', None),
                    'find': bool(getattr(dev, 'find', False)),
                    'is_online': bool(getattr(dev, 'is_online', False))
                }
            entry['screen_name'] = screen_map.get(getattr(dev, 'screen_id'))
            
            devices_data.append(entry)
    return devices_data


def emit_devices_update(socketio, db, room=None):
    """Emit devices list update to clients."""
    try:
        from flask import current_app
        devices_data = get_registered_devices_handler(current_app, socketio, db)
        payload = {'devices': devices_data}
        if room:
            socketio.emit('displayhive:devices:stc:devices_upd_devicelist', payload, room=room)
        else:
            socketio.emit('displayhive:devices:stc:devices_upd_devicelist', payload, room='admins')
    except Exception:
        logger.exception('emit_devices_update failed')
                 