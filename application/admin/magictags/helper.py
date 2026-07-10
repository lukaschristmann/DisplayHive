"""Helper utilities for magic tag substitution."""

import re as _re


def load_magic_tags(db) -> dict:
    """Return all MagicTag records as {lowercase_name: value}."""
    try:
        from application.models import MagicTag
        rows = db.session.execute(db.select(MagicTag)).scalars().all()
        return {v.name.lower(): v.value for v in rows}
    except Exception:
        return {}


def substitute_magic_tags(html: str, vars_dict: dict) -> str:
    """Replace {{var_<name>}} placeholders in *html* with values from *vars_dict*.

    Matching is case-insensitive. Must be called before the container-tag regex
    so that var_ tags are not converted into data-container divs.
    """
    if not html or not vars_dict:
        return html

    def _replace(m):
        return vars_dict.get(m.group(1).lower(), '')

    return _re.sub(r'\{\{\s*var_([a-zA-Z0-9_]+)\s*\}\}', _replace, html)
