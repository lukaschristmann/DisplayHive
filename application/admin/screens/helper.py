"""Helpers for admin screens page: building and emitting admin screen lists."""
import logging
from datetime import datetime as _dt, timezone as _tz

logger = logging.getLogger(__name__)

def emit_admin_screen(socketio, app, db, room=None):
    """Build and emit the `upd_admin_screen` payload."""
    # Use the Device DB `is_online` flag as the single source of truth for
    # whether a screen is considered online. Avoid relying on in-memory
    # connection state so the admin UI is authoritative and consistent.
    with app.app_context():
        from application.models import Screen, Device

        screens = db.session.execute(db.select(Screen).where(Screen.name != 'preview_admin')).scalars().all()
        screens_data = []

        for entry in screens:
            # Determine attached device (if any)
            device_info = None
            try:
                device_obj = db.session.execute(db.select(Device).where(Device.screen_id == entry.id)).scalars().first()
                if device_obj:
                    device_info = {
                        'id': device_obj.id,
                        'devicekey': getattr(device_obj, 'devicekey', None),
                        'find': bool(getattr(device_obj, 'find', False)),
                        'is_online': bool(getattr(device_obj, 'is_online', False)),
                        'max_resolution_width': getattr(device_obj, 'max_resolution_width', None),
                        'max_resolution_height': getattr(device_obj, 'max_resolution_height', None),
                    }
                else:
                    device_obj = None
            except Exception:
                device_obj = None
                device_info = None

            # is_online is derived from the authoritative DB flag on the device
            is_online = bool(device_obj and getattr(device_obj, 'is_online', False))

            if is_online:
                timestr = 'online'
            else:
                if entry.lastseen:
                    lastseen = entry.lastseen.replace(tzinfo=_tz.utc) if entry.lastseen.tzinfo is None else entry.lastseen
                    td = _dt.now(_tz.utc) - lastseen
                    total = int(td.total_seconds())
                    days, rem = divmod(total, 86400)
                    hours, rem = divmod(rem, 3600)
                    minutes, seconds = divmod(rem, 60)
                    if days:
                        timestr = f"{days}d {hours:02}:{minutes:02}:{seconds:02}"
                    else:
                        timestr = f"{hours:02}:{minutes:02}:{seconds:02}"
                else:
                    timestr = 'n/a'

            # Use persisted screen resolution; runtime resolution (connected client)
            # is no longer sourced from in-memory stores.
            resolution_str = f"{entry.resolution_width}x{entry.resolution_height}" if entry.resolution_width and entry.resolution_height else 'n/a'

            screens_data.append({
                'id': entry.id,
                'name': entry.name,
                'resolution': resolution_str,
                'timestr': timestr,
                'debug': bool(entry.debug) if entry.debug is not None else False,
                'monitoring_enabled': bool(entry.monitoring_enabled) if entry.monitoring_enabled is not None else True,
                'attached_device': device_info,
                'template_id': entry.template_id,
            })

        # Emit both legacy and namespaced events for compatibility
        logger.debug("Emitting upd_admin_screen with %s screens to %s", len(screens_data), 'room ' + room if room else 'all clients')
        if room:
            socketio.emit('displayhive:admin:stc:upd_admin_screen', {'data': screens_data}, room=room)
        else:
            socketio.emit('displayhive:admin:stc:upd_admin_screen', {'data': screens_data})
