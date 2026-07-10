"""Admin socket handlers for Devices.

The handlers are split by concern across sibling modules:

- ``connection`` – the socket connect / adoption / authentication handshake
- ``management`` – admin device operations (list, ping, update, assign,
  find, delete, approve registration, viewport, available screens)

``register_admin_device_handlers`` remains the single public entry point
(registered from ``application.socketio_handlers``) and wires up both groups.
"""

from application.admin.devices.connection import register_device_connection_handlers
from application.admin.devices.management import register_device_management_handlers


def register_admin_device_handlers(socketio, app, db):
    """Register all admin Device socket handlers (connection + management)."""
    register_device_connection_handlers(socketio, app, db)
    register_device_management_handlers(socketio, app, db)
