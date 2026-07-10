"""Socket handlers for the Im-/Export admin page."""

import json
import logging

logger = logging.getLogger(__name__)


def register_admin_importexport_handlers(socketio, app, db):
    """Register socket.io handlers for database import/export."""
    from flask import request
    from application.socketio_handlers.auth import admin_handler

    @socketio.on('displayhive:importexport:cts:export')
    @admin_handler
    def handle_export(data=None):
        """Export the whole database and send it back to the requesting admin."""
        sid = getattr(request, 'sid', None)
        logger.info('Export requested by %s', sid)
        try:
            from application.admin.importexport.helper import export_database
            export_data = export_database(app, db)
            socketio.emit(
                'displayhive:importexport:stc:export_data',
                {'success': True, 'data': export_data},
                room=sid,
            )
            logger.info('Export sent to %s', sid)
        except Exception as e:
            logger.exception('Export failed')
            socketio.emit(
                'displayhive:importexport:stc:export_data',
                {'success': False, 'error': str(e)},
                room=sid,
            )

    @socketio.on('displayhive:importexport:cts:import')
    @admin_handler
    def handle_import(data=None):
        """Import database from a JSON payload sent by an admin."""
        sid = getattr(request, 'sid', None)
        logger.info('Import requested by %s', sid)
        if not data or 'data' not in data:
            socketio.emit(
                'displayhive:importexport:stc:import_result',
                {'success': False, 'error': 'No data provided'},
                room=sid,
            )
            return

        try:
            import_payload = data['data']
            # Accept either a pre-parsed dict or a JSON string
            if isinstance(import_payload, str):
                import_payload = json.loads(import_payload)

            from application.admin.importexport.helper import import_database
            result = import_database(app, db, import_payload)
            socketio.emit('displayhive:importexport:stc:import_result', result, room=sid)
        except Exception as e:
            logger.exception('Import failed')
            socketio.emit(
                'displayhive:importexport:stc:import_result',
                {'success': False, 'error': str(e)},
                room=sid,
            )
