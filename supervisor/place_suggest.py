"""Any-place autocomplete for transit / bus search bars (Google Places)."""
from __future__ import annotations

import logging
import time
from typing import Any

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_TTL = 8 * 60


def suggest_places(q: str, limit: int = 8) -> dict[str, Any]:
    query = (q or "").strip()
    lim = max(1, min(int(limit or 8), 12))
    if len(query) < 2:
        return {"places": []}
    key = f"{query.lower()}|{lim}"
    hit = _CACHE.get(key)
    if hit and time.time() - hit[0] < _TTL:
        return {"places": hit[1]}
    try:
        from providers import google_maps_provider

        places = google_maps_provider.autocomplete_places(query, lim)
    except Exception as exc:
        logger.warning("place suggest failed for %r: %s", query, exc)
        places = []
    rows = [p for p in (places or []) if isinstance(p, dict) and (p.get("name") or p.get("address"))]
    _CACHE[key] = (time.time(), rows)
    return {"places": rows}
