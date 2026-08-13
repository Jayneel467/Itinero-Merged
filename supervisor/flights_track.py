"""Live flight status for /flights/track (left-nav only)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
_GA = _ROOT / "general_agent"
for p in (str(_ROOT), str(_GA)):
    if p not in sys.path:
        sys.path.append(p)


def track_flight(flight: str = "", date: str = "") -> dict[str, Any]:
    from general_agent.providers.flight_track_provider import track_flight as _track

    res = _track(flight or "", date=date or "")
    track = res.get("track") if isinstance(res, dict) else None
    ok = bool(res.get("ok") and track)
    return {
        "ok": ok,
        "mode": res.get("mode") or ("ok" if ok else "empty"),
        "message": res.get("message") or "",
        "track": track,
        "gps_unable": bool(res.get("gps_unable", True) if res else True),
        "flight_iata": res.get("flight_iata") or "",
        "date": res.get("date") or date or "",
    }


def track_airport(airport: str = "") -> dict[str, Any]:
    from general_agent.providers.flight_track_provider import track_airport as _board

    res = _board(airport or "")
    board = res.get("airport") if isinstance(res, dict) else None
    ok = bool(res.get("ok") and board)
    return {
        "ok": ok,
        "mode": res.get("mode") or ("ok" if ok else "empty"),
        "message": res.get("message") or "",
        "airport": board,
        "iata": (board or {}).get("iata") or "",
        "icao": (board or {}).get("icao") or "",
    }
