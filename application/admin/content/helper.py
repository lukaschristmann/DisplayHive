"""Helpers for the admin Content page."""

import json
import logging
import random as _random
import urllib.parse
from html import escape as _html_escape
from jinja2.sandbox import SandboxedEnvironment
from markupsafe import Markup

from application.admin.content.pretalx_render import (
    _get_pretalx_data,
    _render_pretalx_table,
    _render_table,
)

logger = logging.getLogger(__name__)


def render_content_element_html(contenttype_html: str, serialized_input: str, field_handlers: dict | None = None, db=None) -> str:
    """Render a ContentElement HTML string from a Contenttype template and stored field values.

    Args:
        contenttype_html:  The Jinja2 template string from ``Contenttype.html``.
        serialized_input:  JSON string previously saved in ``ContentElement.serialized_input``.
        field_handlers:       Optional mapping of field_name -> field_handler (e.g. {'hero': 'image'}).
                           When provided, image-type fields are wrapped in ``<img>`` tags so the
                           template author can simply write ``{{ hero }}`` and get a rendered image.
        db:                Optional SQLAlchemy db instance. When provided, image fields whose mode
                           is ``random_tags`` will have a random matching media item resolved and
                           saved as the concrete URL at render time.

    Returns:
        Rendered HTML string. Falls back to the raw template on render error.
    """
    ctx: dict = {}
    try:
        if serialized_input:
            ctx = json.loads(serialized_input)
    except Exception:
        ctx = {}

    # Resolve random_tags image fields to a concrete URL before rendering
    if db is not None and field_handlers:
        from application.models.content import Media
        image_mode_keys = [k for k in ctx if k.endswith('__image_mode') and ctx[k] == 'random_tags']
        for mode_key in image_mode_keys:
            field_name = mode_key[: -len('__image_mode')]
            if field_handlers.get(field_name) != 'image':
                continue
            tags_key = f'{field_name}__image_tags'
            selected_tags = [t for t in ctx.get(tags_key, []) if t]
            if not selected_tags:
                continue
            all_media = db.session.execute(db.select(Media)).scalars().all()
            candidates = []
            for m in all_media:
                media_tags = {t.strip() for t in (m.tags or '').split(',') if t.strip()}
                if any(t in media_tags for t in selected_tags):
                    folder = m.folder_path or ''
                    file_rel = (folder + '/' + m.filename) if folder else m.filename
                    candidates.append(f'/static/media/{file_rel}')
            if candidates:
                ctx[field_name] = _random.choice(candidates)

    # Wrap image-type field values in <img> tags so {{ field }} renders the image.
    # Wrap arrows-type field values in a sized <span>.
    # Convert newlines in plain-text fields to <br> so line breaks are visible on screen.
    # Values are HTML-escaped to prevent XSS from stored field data.
    if field_handlers:
        for field_name, ftype in field_handlers.items():
            if ftype == 'image' and field_name in ctx and ctx[field_name]:
                url = str(ctx[field_name]).strip()
                parsed_scheme = urllib.parse.urlparse(url).scheme.lower()
                if parsed_scheme not in ('', 'http', 'https', 'data'):
                    ctx[field_name] = ''
                elif url:
                    ctx[field_name] = Markup(f'<img src="{_html_escape(url)}" style="max-width:100%;height:auto;" />')
            elif ftype == 'arrows' and field_name in ctx and ctx[field_name]:
                char = _html_escape(str(ctx[field_name]).strip())
                size_key = f'{field_name}_size'
                size = ctx.get(size_key, 48)
                try:
                    size = int(size)
                except Exception:
                    size = 48
                if char:
                    ctx[field_name] = Markup(f'<span style="font-size:{size}px;line-height:1;">{char}</span>')
            elif ftype == 'datetime_format':
                fmt_str = str(ctx.get(field_name, 'HH:mm:ss')).strip()
                tz_name = 'UTC'
                if db is not None:
                    try:
                        from application.models import SystemSetting
                        tz_row = db.session.execute(
                            db.select(SystemSetting).where(SystemSetting.key == 'timezone')
                        ).scalar_one_or_none()
                        if tz_row and tz_row.value:
                            tz_name = tz_row.value
                    except Exception:
                        pass
                ctx[field_name] = Markup(
                    f'<div class="dh-clock"'
                    f' data-dh-clock="{_html_escape(fmt_str)}"'
                    f' data-dh-timezone="{_html_escape(tz_name)}"></div>'
                )
            elif ftype == 'pretalx_table':
                pretalx_data = _get_pretalx_data(str(ctx.get(field_name, '')).strip(), db)
                _ps_no_session  = 'No session running'
                _ps_coming_up   = 'Coming up next'
                _ps_invalid     = 'Invalid API data'
                _ps_time_format = 'HH:mm'
                _ps_end_of_day  = '23:59'
                _ps_sim_dt      = ''
                try:
                    if db is not None:
                        from application.models import PretalxSettings
                        _ps = db.session.execute(db.select(PretalxSettings)).scalar_one_or_none()
                        if _ps:
                            _ps_no_session  = _ps.no_session_text or _ps_no_session
                            _ps_coming_up   = _ps.coming_up_text  or _ps_coming_up
                            _ps_invalid     = _ps.invalid_data_text or _ps_invalid
                            _ps_time_format = _ps.time_format or _ps_time_format
                            _ps_end_of_day  = _ps.end_of_day  or _ps_end_of_day
                            _ps_sim_dt      = _ps.sim_datetime or ''
                except Exception:
                    pass
                _el_invalid = str(ctx.get(f'{field_name}__invalid_data_text', '')).strip()
                if _el_invalid:
                    _ps_invalid = _el_invalid
                ctx[field_name] = Markup(_render_pretalx_table(
                    data=pretalx_data,
                    roomname=str(ctx.get(f'{field_name}__roomname', '')).strip(),
                    linecount=ctx.get(f'{field_name}__linecount', 10),
                    fields_config=str(ctx.get(f'{field_name}__fields', '')).strip(),
                    display_author=bool(ctx.get(f'{field_name}__author_under_title', False)),
                    display_type=str(ctx.get(f'{field_name}__type', 'list')).strip() or 'list',
                    empty_text=str(ctx.get(f'{field_name}__empty_text', '')).strip(),
                    tracklist_columns=str(ctx.get(f'{field_name}__tracklist_columns', 'name|Name,color|Color')).strip(),
                    tracklist_layout=str(ctx.get(f'{field_name}__tracklist_layout', 'list')).strip() or 'list',
                    tracklist_exclude=str(ctx.get(f'{field_name}__tracklist_exclude', '')).strip(),
                    invalid_data_text=_ps_invalid,
                    no_session_text=_ps_no_session,
                    coming_up_text=_ps_coming_up,
                    time_format=_ps_time_format,
                    end_of_day=_ps_end_of_day,
                    sim_datetime=_ps_sim_dt,
                    today_only=bool(ctx.get(f'{field_name}__today_only', False)),
                    separate_days=bool(ctx.get(f'{field_name}__separate_days', False)),
                    day_prefix=str(ctx.get(f'{field_name}__day_prefix', '')).strip(),
                    tracks_by_color=bool(ctx.get(f'{field_name}__tracks_by_color', False)),
                ))
            elif ftype in ('textklein', 'textbig', 'link') and field_name in ctx:
                escaped = _html_escape(str(ctx[field_name]))
                ctx[field_name] = Markup(escaped.replace('\n', '<br>'))
            elif ftype == 'table':
                ctx[field_name] = Markup(_render_table(ctx.get(field_name, '')))

    # Inject magic tags into the Jinja2 context as var_<name> so content
    # type templates can use {{ var_<name> }} alongside their own fields.
    if db is not None:
        try:
            from application.admin.magictags.helper import load_magic_tags
            for name, value in load_magic_tags(db).items():
                ctx.setdefault(f'var_{name}', value)
        except Exception:
            pass

    try:
        # SandboxedEnvironment blocks access to unsafe attributes/callables so an
        # admin-authored content-type template cannot escalate to arbitrary code
        # execution (SSTI) via {{ ''.__class__... }} and similar payloads.
        env = SandboxedEnvironment(autoescape=True)
        tmpl = env.from_string(contenttype_html)
        return tmpl.render(**ctx)
    except Exception:
        logger.exception('render_content_element_html failed')
        return contenttype_html


def rerender_content_element_for_contenttype(db, contenttype_id: int) -> list[int]:
    """Re-render all ContentElement rows that use a given Contenttype.

    Loads the current ``Contenttype.html`` template, iterates every
    ``ContentElement`` with ``contenttype_id`` matching, re-renders the HTML
    from the stored ``serialized_input``, and persists the update.

    Args:
        db:              SQLAlchemy db instance (Flask-SQLAlchemy).
        contenttype_id:  Primary key of the Contenttype whose template changed.

    Returns:
        List of ContentElement IDs that were updated.
    """
    from application.models import ContentElement, Contenttype
    from application.utils.template import build_field_handlers

    try:
        ct = db.session.get(Contenttype, int(contenttype_id))
        if not ct:
            logger.warning('Contenttype %s not found – skipping re-render', contenttype_id)
            return []

        items = db.session.execute(
            db.select(ContentElement).where(ContentElement.contenttype_id == ct.id)
        ).scalars().all()

        field_handlers = build_field_handlers(ct)

        updated_ids: list[int] = []
        for mc in items:
            new_html = render_content_element_html(ct.html or '', mc.serialized_input or '', field_handlers or None, db=db)
            mc.html = new_html
            db.session.add(mc)
            updated_ids.append(mc.id)

        if updated_ids:
            db.session.commit()
            logger.info('Re-rendered %s content_element item(s) for contenttype %s', len(updated_ids), contenttype_id)
        else:
            logger.debug('No content_element items for contenttype %s – nothing to re-render', contenttype_id)

        return updated_ids
    except Exception:
        db.session.rollback()
        logger.exception('rerender_content_element_for_contenttype failed')
        return []
