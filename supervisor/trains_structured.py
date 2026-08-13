"""Indian Rail / eRail timetable for the left-page Trains UI."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
_GA = _ROOT / "general_agent"
for p in (str(_ROOT), str(_GA)):
    if p not in sys.path:
        sys.path.append(p)


def search_trains(
    origin: str = "",
    destination: str = "",
    when: str = "",
    window: str = "",
    date: str = "",
    limit: int = 120,
) -> dict[str, Any]:
    from general_agent.services.travel_service import search_india_trains_structured

    o = (origin or "").strip()
    d = (destination or "").strip()
    if not o or not d:
        return {
            "trains": [],
            "total": 0,
            "mode": "empty",
            "message": "Enter origin and destination (e.g. Surat → Vadodara).",
            "title": "",
            "subtitle": "",
            "from_code": "",
            "to_code": "",
            "from_name": "",
            "to_name": "",
            "date": "",
            "total_found": 0,
        }
    cap = 120 if limit is None else int(limit)
    res = search_india_trains_structured(o, d, when or date or "", window or "", limit=cap)
    trains = res.get("trains") or []
    cards = res.get("cards") or {}
    return {
        "trains": trains,
        "total": len(trains),
        "mode": "ok" if trains else "empty",
        "message": res.get("text") or "",
        "title": cards.get("title") or f"{o} → {d}",
        "subtitle": cards.get("subtitle") or "",
        "from_code": res.get("from_code") or "",
        "to_code": res.get("to_code") or "",
        "from_name": res.get("from_name") or o,
        "to_name": res.get("to_name") or d,
        "date": res.get("date") or date or "",
        "total_found": res.get("total_found") or len(trains),
    }


def track_train(number: str = "", start_day: int = 0) -> dict[str, Any]:
    from general_agent.services.travel_service import track_india_train_structured

    res = track_india_train_structured(number, start_day=start_day or 0)
    track = res.get("track") or {}
    ok = bool(track.get("ok") or track.get("train_number"))
    return {
        "ok": ok,
        "mode": "ok" if ok else "empty",
        "message": res.get("text") or "",
        "track": track or None,
        "stations": track.get("stations") or [],
        "source_url": track.get("source_url") or "",
        "gps_unable": bool(track.get("gps_unable", True)),
        "is_gps": False,
    }


def suggest_stations(q: str = "", limit: int = 8) -> dict[str, Any]:
    from general_agent.services.india_ground import resolve_rail_station
    from general_agent.services.ir_stations import suggest_stations as catalog_suggest

    query = (q or "").strip()
    stations = catalog_suggest(query, limit=limit or 8)
    if not stations and query:
        hit = resolve_rail_station(query)
        if hit:
            stations = [{"code": hit[0], "name": hit[1], "state": "", "label": f"{hit[1]} ({hit[0]})"}]
    return {"stations": stations, "q": query}


def train_fares(
    number: str = "",
    origin: str = "",
    destination: str = "",
    date: str = "",
    quota: str = "GN",
) -> dict[str, Any]:
    from general_agent.exceptions import ProviderRequestError
    from general_agent.providers.train_fares import coach_fares
    from services.india_ground import resolve_rail_station

    src = resolve_rail_station(origin or "")
    dst = resolve_rail_station(destination or "")
    from_code = (src[0] if src else (origin or "")).upper()
    to_code = (dst[0] if dst else (destination or "")).upper()
    try:
        return coach_fares(number, from_code, to_code, date=date or "", quota=quota or "GN")
    except ProviderRequestError as exc:
        return {
            "ok": False,
            "train_number": number,
            "from_code": from_code,
            "to_code": to_code,
            "date": date or "",
            "quota": quota or "GN",
            "classes": [],
            "message": str(exc),
        }


def check_pnr(pnr: str = "") -> dict[str, Any]:
    from general_agent.services.travel_service import check_india_pnr_structured

    res = check_india_pnr_structured(pnr)
    data = res.get("pnr") or {}
    ok = bool(data.get("ok"))
    return {
        "ok": ok,
        "mode": "ok" if ok else "empty",
        "message": res.get("user_message") or ("" if ok else res.get("text") or ""),
        "pnr": data or None,
    }
