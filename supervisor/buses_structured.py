"""Intercity buses for the left-page Buses UI (India + US/EU)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
_GA = _ROOT / "general_agent"
for p in (str(_ROOT), str(_GA)):
    if p not in sys.path:
        sys.path.append(p)


def search_buses(
    origin: str = "",
    destination: str = "",
    when: str = "",
    window: str = "",
    date: str = "",
    limit: int = 80,
) -> dict[str, Any]:
    from general_agent.services.travel_service import search_india_buses_structured

    o = (origin or "").strip()
    d = (destination or "").strip()
    if d and not o:
        try:
            from providers import bus_provider
            o = bus_provider.default_local_origin(d)
        except Exception:
            o = ""
    if not o or not d:
        return {
            "buses": [],
            "total": 0,
            "mode": "empty",
            "message": "Enter origin and destination (e.g. Surat → Vadodara, HUB → Pollock Commons, or New York → State College).",
            "user_message": "Enter origin and destination.",
            "region": "",
            "title": "",
            "subtitle": "",
            "from_name": "",
            "to_name": "",
            "date": "",
            "total_found": 0,
        }
    cap = 80 if limit is None else int(limit)
    res = search_india_buses_structured(o, d, when or date or "", window or "", limit=cap)
    buses = res.get("buses") or []
    cards = res.get("cards") or {}
    return {
        "buses": buses,
        "total": len(buses),
        "mode": "ok" if buses else "empty",
        "message": res.get("text") or "",
        "user_message": res.get("user_message") or "",
        "region": res.get("region") or (buses[0].get("region") if buses else ""),
        "title": cards.get("title") or f"{o} → {d}",
        "subtitle": cards.get("subtitle") or "",
        "from_name": res.get("from_name") or o,
        "to_name": res.get("to_name") or d,
        "date": res.get("date") or date or "",
        "total_found": res.get("total_found") or len(buses),
        "local": bool(res.get("local")),
    }
