"""Admin socket handlers for Content (content element) management.

The handlers are split by concern across sibling modules:

- ``queries``     – read-only listings, pickers and detail lookups
- ``mutations``   – create / update / delete / move / preview
- ``serializers`` – shared dict-building and container helpers

``register_admin_content_handlers`` remains the single public entry point
(registered from ``application.socketio_handlers``) and simply wires up both
handler groups.
"""

from application.admin.content.queries import register_content_query_handlers
from application.admin.content.mutations import register_content_mutation_handlers


def register_admin_content_handlers(socketio, app, db):
    """Register all admin Content socket handlers (queries + mutations)."""
    register_content_query_handlers(socketio, app, db)
    register_content_mutation_handlers(socketio, app, db)
