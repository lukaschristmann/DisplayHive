"""Socket.IO handlers for logger-related events."""

import datetime
import logging
from collections import deque

from flask import request
from flask_socketio import join_room, leave_room, emit

log = logging.getLogger(__name__)


# Track logger connection status globally
is_logger_connected = False
# Store recent log history (max 100 entries)
log_history = deque(maxlen=100)


def register_logger_handlers(socketio, app, db):
    """Register all logger-related socket.io event handlers."""
    from application.socketio_handlers.auth import admin_handler

    global is_logger_connected
    logger_room = app.config.get('LOGGER_ROOM', 'logger_room')

    @socketio.event
    def logger_connected(message):
        """Handle logger client connection"""
        global is_logger_connected
        is_logger_connected = True
        join_room(logger_room)
        # Broadcast to all screens that logger is active
        emit('logger_active', {}, broadcast=True)
        log.info("Logger connected to room '%s'", logger_room)

    @socketio.event
    def logger_disconnected(message):
        """Handle logger client disconnection"""
        global is_logger_connected
        is_logger_connected = False
        leave_room(logger_room)
        emit('logger_inactive', {}, broadcast=True)
        log.info("Logger disconnected from room '%s'", logger_room)

    @socketio.event
    def screen_log(message):
        """Forward log message to logger room (converts old format to new)"""
        try:
            # Convert old format to new format
            log_entry = {
                'timestamp': message.get('timestamp') or datetime.datetime.now().isoformat(),
                'severity': message.get('severity', 'info'),
                'message': message.get('message') or message.get('data', ''),
                'screen': message.get('screen', 'unknown'),
                'function': message.get('function', '')
            }

            # Store in history
            log_history.append(log_entry)

            # Forward to logger room with old event name (for legacy compatibility)
            emit('screen_log', message, room=logger_room)

            # Also emit in new format for admin logger view
            emit('displayhive:logger:stc:log_entry', log_entry, room=logger_room)
            log.debug("Broadcast log to logger room: %s", log_entry['message'][:50])
        except Exception:
            log.exception("Error forwarding screen log")

    # New namespaced handlers for admin logger view
    @socketio.on('displayhive:logger:cts:subscribe')
    @admin_handler
    def handle_logger_subscribe(data=None):
        """Subscribe client to logger room and send log history (admin only)."""
        global is_logger_connected
        sid = request.sid
        join_room(logger_room, sid=sid)

        # Mark logger as connected and notify all screens
        if not is_logger_connected:
            is_logger_connected = True
            emit('logger_active', {}, broadcast=True)
            log.info('Logger now active, notified screens')

        log.debug('Client %s subscribed to logger room', sid)

        # Send log history to this client
        emit('displayhive:logger:stc:log_history', {'logs': list(log_history)}, room=sid)

    @socketio.on('displayhive:logger:cts:unsubscribe')
    @admin_handler
    def handle_logger_unsubscribe(data=None):
        """Unsubscribe client from logger room (admin only)."""
        sid = request.sid
        leave_room(logger_room, sid=sid)
        log.debug('Client %s unsubscribed from logger room', sid)

    @socketio.on('displayhive:logger:cts:get_history')
    @admin_handler
    def handle_get_log_history(data=None):
        """Send log history to requesting client (admin only)."""
        sid = request.sid
        emit('displayhive:logger:stc:log_history', {'logs': list(log_history)}, room=sid)
        log.debug('Sent %s log entries to %s', len(log_history), sid)

    @socketio.on('displayhive:logger:cts:log_entry')
    def handle_log_entry_from_screen(data):
        """Receive log entry from screen and broadcast to logger room"""
        try:
            log_entry = {
                'timestamp': data.get('timestamp') or datetime.datetime.now().isoformat(),
                'severity': data.get('severity', 'info'),
                'message': data.get('message', ''),
                'screen': data.get('screen', 'unknown'),
                'function': data.get('function', '')
            }

            # Store in history
            log_history.append(log_entry)

            # Broadcast to all logger subscribers
            emit('displayhive:logger:stc:log_entry', log_entry, room=logger_room)
            log.debug("Broadcast log to room %s: %s", logger_room, log_entry['message'][:50])
        except Exception:
            log.exception("Error handling log entry")

    # No return value needed; status is accessible via get_logger_status()


def get_logger_status():
    """Return whether the logger client is currently connected."""
    return is_logger_connected
