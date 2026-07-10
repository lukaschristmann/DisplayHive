"""Shared template/content utility helpers reused across multiple modules."""

import os


def get_default_template(db):
    """Return the active default template using the standard fallback chain.

    Resolution order:
      1. Template with isDefault == True
      2. Template named 'default'
      3. First template by id
    """
    from application.models import Template

    template = db.session.execute(
        db.select(Template).where(Template.isDefault == True)
    ).scalar()
    if not template:
        template = db.session.execute(
            db.select(Template).where(Template.name == 'default')
        ).scalar()
    if not template:
        template = db.session.execute(
            db.select(Template).order_by(Template.id).limit(1)
        ).scalar()
    return template


def build_field_handlers(contenttype_obj) -> dict:
    """Return {field_name: field_handler} from a Contenttype's tagconfigs."""
    if not contenttype_obj:
        return {}
    return {
        tc.field_name: tc.field_handler
        for tc in (getattr(contenttype_obj, 'tagconfigs', None) or [])
        if getattr(tc, 'field_name', None) and getattr(tc, 'field_handler', None)
    }


def media_file_urls(m) -> tuple:
    """Return (url, preview_url) for a Media record."""
    folder = m.folder_path or ''
    file_rel = f'{folder}/{m.filename}' if folder else m.filename
    preview_base = os.path.splitext(m.filename)[0] + '_preview.jpg'
    preview_rel = f'{folder}/{preview_base}' if folder else preview_base
    return f'/static/media/{file_rel}', f'/static/media_previews/{preview_rel}'
