"""Socket handlers for the admin Users page (account management, no roles)."""

import logging

from flask import request

logger = logging.getLogger(__name__)


def register_admin_user_handlers(socketio, app, db):
    """Register socket handlers for listing/creating/updating/deleting admin users."""
    from application.socketio_handlers.auth import admin_handler
    from application.models import AdminUser
    from application.auth import hash_password

    def _emit_users(sid=None):
        """Build the full user list payload and emit it (never includes password_hash)."""
        users = db.session.execute(
            db.select(AdminUser).order_by(AdminUser.username)
        ).scalars().all()
        payload = {'users': [u.to_dict() for u in users]}
        socketio.emit('displayhive:admin:users:stc:users', payload, room=sid or 'admins')

    @socketio.on('displayhive:admin:users:cts:get_users')
    @admin_handler
    def handle_get_users(data=None):
        _emit_users(getattr(request, 'sid', None))

    @socketio.on('displayhive:admin:users:cts:create_user')
    @admin_handler
    def handle_create_user(data):
        """Create a new admin user. data: {username, password}."""
        username = str((data or {}).get('username', '')).strip()
        password = str((data or {}).get('password', ''))

        if not username:
            return {'success': False, 'error': 'Username is required'}
        if len(password) < 8:
            return {'success': False, 'error': 'Password must be at least 8 characters'}

        existing = db.session.execute(
            db.select(AdminUser).where(AdminUser.username == username)
        ).scalar_one_or_none()
        if existing:
            return {'success': False, 'error': 'Username already exists'}

        user = AdminUser(username=username, password_hash=hash_password(password))
        db.session.add(user)
        db.session.commit()

        _emit_users()
        return {'success': True, 'id': user.id}

    @socketio.on('displayhive:admin:users:cts:update_user')
    @admin_handler
    def handle_update_user(data):
        """Update username and/or reset password. data: {id, username?, password?}."""
        user_id = (data or {}).get('id')
        if not user_id:
            return {'success': False, 'error': 'Missing id'}

        user = db.session.get(AdminUser, user_id)
        if not user:
            return {'success': False, 'error': 'User not found'}

        new_username = (data or {}).get('username')
        if new_username is not None:
            new_username = str(new_username).strip()
            if not new_username:
                return {'success': False, 'error': 'Username is required'}
            if new_username != user.username:
                existing = db.session.execute(
                    db.select(AdminUser).where(AdminUser.username == new_username)
                ).scalar_one_or_none()
                if existing:
                    return {'success': False, 'error': 'Username already exists'}
                user.username = new_username

        new_password = (data or {}).get('password')
        if new_password:
            if len(new_password) < 8:
                return {'success': False, 'error': 'Password must be at least 8 characters'}
            user.password_hash = hash_password(new_password)
            # Invalidate every JWT issued before this password change.
            user.token_version = (user.token_version or 0) + 1

        db.session.commit()
        _emit_users()
        return {'success': True}

    @socketio.on('displayhive:admin:users:cts:set_active')
    @admin_handler
    def handle_set_active(data):
        """Activate/deactivate a user. data: {id, is_active}. Refuses to leave zero active admins."""
        user_id = (data or {}).get('id')
        is_active = bool((data or {}).get('is_active'))
        if not user_id:
            return {'success': False, 'error': 'Missing id'}

        user = db.session.get(AdminUser, user_id)
        if not user:
            return {'success': False, 'error': 'User not found'}

        if not is_active:
            active_count = db.session.execute(
                db.select(db.func.count()).select_from(AdminUser).where(AdminUser.is_active.is_(True))
            ).scalar()
            if user.is_active and active_count <= 1:
                return {'success': False, 'error': 'Cannot deactivate the last remaining active admin user'}

        user.is_active = is_active
        db.session.commit()
        _emit_users()
        return {'success': True}

    @socketio.on('displayhive:admin:users:cts:delete_user')
    @admin_handler
    def handle_delete_user(data):
        """Delete a user. Refuses to delete the last remaining admin account."""
        user_id = (data or {}).get('id')
        if not user_id:
            return {'success': False, 'error': 'Missing id'}

        user = db.session.get(AdminUser, user_id)
        if not user:
            return {'success': False, 'error': 'User not found'}

        total = db.session.execute(
            db.select(db.func.count()).select_from(AdminUser)
        ).scalar()
        if total <= 1:
            return {'success': False, 'error': 'Cannot delete the last remaining admin user'}

        db.session.delete(user)
        db.session.commit()
        _emit_users()
        return {'success': True}
