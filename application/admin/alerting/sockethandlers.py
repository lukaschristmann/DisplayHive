import logging

import requests
from flask import request

from .sender import ALERT_TYPES

logger = logging.getLogger(__name__)


def register_admin_alerting_handlers(socketio, app, db):
    """Register socket handlers for the admin Alerting page."""
    from application.socketio_handlers.auth import admin_handler
    from application.models import SystemSetting, TelegramUser, AlertSubscription

    def _get_setting(key):
        row = db.session.execute(
            db.select(SystemSetting).where(SystemSetting.key == key)
        ).scalar_one_or_none()
        return row.value if row else None

    def _set_setting(key, value):
        row = db.session.execute(
            db.select(SystemSetting).where(SystemSetting.key == key)
        ).scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.session.add(SystemSetting(key=key, value=value))
        db.session.commit()

    def _get_token():
        return _get_setting('telegram_token') or ''

    def _telegram_users():
        rows = db.session.execute(db.select(TelegramUser)).scalars().all()
        return [{'id': r.id, 'name': r.name, 'chat_id': r.chat_id} for r in rows]

    def _emit_telegram_users(room):
        socketio.emit(
            'displayhive:admin:alerting:stc:telegram_users',
            {'users': _telegram_users()},
            room=room,
        )

    def _emit_subscriptions(room):
        rows = db.session.execute(db.select(AlertSubscription)).scalars().all()
        socketio.emit(
            'displayhive:admin:alerting:stc:alert_subscriptions',
            {'subscriptions': [{'user_id': r.user_id, 'alert_type': r.alert_type} for r in rows]},
            room=room,
        )

    # ── Settings ────────────────────────────────────────────────────────────

    @socketio.on('displayhive:admin:alerting:cts:get_settings')
    @admin_handler
    def handle_get_alerting_settings(data=None):
        socketio.emit(
            'displayhive:admin:alerting:stc:settings',
            {'has_telegram_token': bool(_get_token())},
            room=request.sid,
        )

    @socketio.on('displayhive:admin:alerting:cts:save_telegram_token')
    @admin_handler
    def handle_save_telegram_token(data=None):
        if not data or not isinstance(data, dict):
            return {'ok': False, 'error': 'Invalid payload'}
        token = (data.get('token') or '').strip()
        _set_setting('telegram_token', token)
        socketio.emit(
            'displayhive:admin:alerting:stc:settings',
            {'has_telegram_token': bool(token)},
            room=request.sid,
        )
        return {'ok': True}

    # ── Bot user discovery ───────────────────────────────────────────────────

    @socketio.on('displayhive:admin:alerting:cts:get_telegram_users_from_bot')
    @admin_handler
    def handle_get_telegram_users_from_bot(data=None):
        token = _get_token()
        if not token:
            return {'ok': False, 'error': 'No token configured'}

        try:
            resp = requests.get(
                f'https://api.telegram.org/bot{token}/getUpdates',
                timeout=10,
            )
            resp.raise_for_status()
            result = resp.json()
        except requests.exceptions.RequestException as e:
            return {'ok': False, 'error': f'Request failed: {e}'}

        if not result.get('ok'):
            return {'ok': False, 'error': result.get('description', 'Telegram API error')}

        seen = {}
        for update in result.get('result', []):
            for key in ('message', 'channel_post', 'my_chat_member', 'chat_member'):
                msg = update.get(key)
                if not msg:
                    continue
                chat = msg.get('chat') or msg.get('new_chat_member', {}).get('chat')
                if not chat:
                    continue
                if chat.get('type') != 'private':
                    continue
                cid = chat.get('id')
                if cid and cid not in seen:
                    seen[cid] = {
                        'id': cid,
                        'title': chat.get('first_name') or chat.get('username') or str(cid),
                    }

        return {'ok': True, 'users': list(seen.values())}

    # ── Saved telegram users ─────────────────────────────────────────────────

    @socketio.on('displayhive:admin:alerting:cts:get_telegram_users')
    @admin_handler
    def handle_get_telegram_users(data=None):
        _emit_telegram_users(request.sid)

    @socketio.on('displayhive:admin:alerting:cts:add_telegram_user')
    @admin_handler
    def handle_add_telegram_user(data=None):
        if not data or not isinstance(data, dict):
            return {'ok': False, 'error': 'Invalid payload'}
        name = (data.get('name') or '').strip()
        chat_id = str(data.get('chat_id') or '').strip()
        if not name or not chat_id:
            return {'ok': False, 'error': 'name and chat_id are required'}

        existing = db.session.execute(
            db.select(TelegramUser).where(TelegramUser.chat_id == chat_id)
        ).scalar_one_or_none()
        if existing:
            existing.name = name
        else:
            db.session.add(TelegramUser(name=name, chat_id=chat_id))
        db.session.commit()

        _emit_telegram_users(request.sid)
        return {'ok': True}

    @socketio.on('displayhive:admin:alerting:cts:remove_telegram_user')
    @admin_handler
    def handle_remove_telegram_user(data=None):
        if not data or not isinstance(data, dict):
            return {'ok': False, 'error': 'Invalid payload'}
        user_id = data.get('id')
        if user_id is None:
            return {'ok': False, 'error': 'id is required'}

        row = db.session.get(TelegramUser, user_id)
        if row:
            db.session.delete(row)
            db.session.commit()

        _emit_telegram_users(request.sid)
        # Also push updated subscriptions (deleted user's rows cascade-deleted)
        _emit_subscriptions(request.sid)
        return {'ok': True}

    @socketio.on('displayhive:admin:alerting:cts:send_telegram_test')
    @admin_handler
    def handle_send_telegram_test(data=None):
        if not data or not isinstance(data, dict):
            return {'ok': False, 'error': 'Invalid payload'}
        chat_id = str(data.get('chat_id') or '').strip()
        if not chat_id:
            return {'ok': False, 'error': 'chat_id is required'}

        token = _get_token()
        if not token:
            return {'ok': False, 'error': 'No token configured'}

        try:
            resp = requests.post(
                f'https://api.telegram.org/bot{token}/sendMessage',
                json={'chat_id': chat_id, 'text': 'This is a test message from DisplayHive.'},
                timeout=10,
            )
            resp.raise_for_status()
            result = resp.json()
        except requests.exceptions.RequestException as e:
            return {'ok': False, 'error': f'Request failed: {e}'}

        if not result.get('ok'):
            return {'ok': False, 'error': result.get('description', 'Telegram API error')}
        return {'ok': True}

    # ── Alert types & subscriptions ──────────────────────────────────────────

    @socketio.on('displayhive:admin:alerting:cts:get_alert_types')
    @admin_handler
    def handle_get_alert_types(data=None):
        socketio.emit(
            'displayhive:admin:alerting:stc:alert_types',
            {'alert_types': [{'key': k, 'label': l} for k, l in ALERT_TYPES]},
            room=request.sid,
        )

    @socketio.on('displayhive:admin:alerting:cts:get_alert_subscriptions')
    @admin_handler
    def handle_get_alert_subscriptions(data=None):
        _emit_subscriptions(request.sid)

    @socketio.on('displayhive:admin:alerting:cts:toggle_alert_subscription')
    @admin_handler
    def handle_toggle_alert_subscription(data=None):
        if not data or not isinstance(data, dict):
            return {'ok': False, 'error': 'Invalid payload'}
        user_id = data.get('user_id')
        alert_type = (data.get('alert_type') or '').strip()
        enabled = bool(data.get('enabled'))

        if not user_id or not alert_type:
            return {'ok': False, 'error': 'user_id and alert_type are required'}

        existing = db.session.execute(
            db.select(AlertSubscription)
            .where(AlertSubscription.user_id == user_id)
            .where(AlertSubscription.alert_type == alert_type)
        ).scalar_one_or_none()

        if enabled and not existing:
            db.session.add(AlertSubscription(user_id=user_id, alert_type=alert_type))
            db.session.commit()
        elif not enabled and existing:
            db.session.delete(existing)
            db.session.commit()

        _emit_subscriptions(request.sid)
        return {'ok': True}
