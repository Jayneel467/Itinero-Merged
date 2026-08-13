"""Ticketmaster Discovery — live events for the manual Itinero Events tab.

Search only. Purchase happens on Ticketmaster (official event URL).
Never invent inventory or prices.
"""
from __future__ import annotations

import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / "general_agent" / ".env", override=False)
load_dotenv(_ROOT / "supervisor" / ".env", override=False)

_TM_EVENTS = "https://app.ticketmaster.com/discovery/v2/events.json"
_TM_EVENT = "https://app.ticketmaster.com/discovery/v2/events/{id}.json"

_CLASS_MAP = {
    "music": "Music",
    "concert": "Music",
    "concerts": "Music",
    "sports": "Sports",
    "sport": "Sports",
    "theatre": "Arts & Theatre",
    "theater": "Arts & Theatre",
    "arts": "Arts & Theatre",
    "broadway": "Arts & Theatre",
    "comedy": "Arts & Theatre",
    "family": "Family",
    "film": "Film",
    "movie": "Film",
}

_CITY_COUNTRY = {
    "new york": "US", "nyc": "US", "los angeles": "US", "la": "US",
    "chicago": "US", "miami": "US", "orlando": "US", "philadelphia": "US",
    "philly": "US", "boston": "US", "seattle": "US", "austin": "US",
    "houston": "US", "dallas": "US", "atlanta": "US", "denver": "US",
    "las vegas": "US", "vegas": "US", "san francisco": "US", "sf": "US",
    "washington": "US", "dc": "US", "nashville": "US",
    "toronto": "CA", "vancouver": "CA", "montreal": "CA",
    "london": "GB", "manchester": "GB", "edinburgh": "GB",
    "dublin": "IE",
    "sydney": "AU", "melbourne": "AU", "brisbane": "AU",
    "auckland": "NZ",
    "paris": "FR", "berlin": "DE", "munich": "DE", "amsterdam": "NL",
    "madrid": "ES", "barcelona": "ES", "rome": "IT", "milan": "IT",
    "mumbai": "IN", "delhi": "IN", "new delhi": "IN", "bangalore": "IN",
    "bengaluru": "IN", "hyderabad": "IN", "chennai": "IN", "pune": "IN",
    "surat": "IN", "goa": "IN",
}


def _api_key() -> str:
    return (
        os.getenv("TICKETMASTER_API_KEY")
        or os.getenv("TICKETMASTER_CONSUMER_KEY")
        or os.getenv("TM_API_KEY")
        or ""
    ).strip()


def _infer_country(city: str, explicit: str = "") -> str:
    if (explicit or "").strip():
        return explicit.strip().upper()[:2]
    return _CITY_COUNTRY.get((city or "").strip().lower(), "")


def _tm_dt(day: str, end: bool = False) -> str:
    d = (day or "").strip()
    if not d:
        return ""
    if "T" in d:
        return d if d.endswith("Z") else f"{d}Z"
    return f"{d}T23:59:59Z" if end else f"{d}T00:00:00Z"


def _best_image(images: list | None) -> str:
    if not isinstance(images, list) or not images:
        return ""
    scored = []
    for im in images:
        if not isinstance(im, dict) or not im.get("url"):
            continue
        ratio = str(im.get("ratio") or "")
        w = int(im.get("width") or 0)
        fallback = bool(im.get("fallback"))
        score = w
        if ratio == "16_9":
            score += 4000
        if not fallback:
            score += 2000
        scored.append((score, im["url"]))
    scored.sort(reverse=True)
    return scored[0][1] if scored else ""


def _price(raw: dict) -> tuple[str, float | None, float | None, str]:
    ranges = raw.get("priceRanges") or []
    if not ranges or not isinstance(ranges[0], dict):
        return "", None, None, ""
    r0 = ranges[0]
    cur = str(r0.get("currency") or "").upper()
    try:
        lo = float(r0["min"]) if r0.get("min") is not None else None
        hi = float(r0["max"]) if r0.get("max") is not None else None
    except (TypeError, ValueError):
        return "", None, None, cur
    if lo is None and hi is None:
        return "", None, None, cur
    if (lo or 0) <= 0 and (hi or 0) <= 0:
        return "", None, None, cur
    if lo is not None and hi is not None and abs(hi - lo) > 0.5:
        label = f"{cur} {lo:,.0f}–{hi:,.0f}".strip()
    else:
        amt = hi if hi is not None else lo
        label = f"{cur} {amt:,.0f}".strip()
    return label, lo, hi, cur


def normalize_event(raw: dict) -> dict[str, Any]:
    venues = (raw.get("_embedded") or {}).get("venues") or []
    venue = venues[0] if venues and isinstance(venues[0], dict) else {}
    start = (raw.get("dates") or {}).get("start") or {}
    status = ((raw.get("dates") or {}).get("status") or {}).get("code") or ""
    classes = raw.get("classifications") or []
    c0 = classes[0] if classes and isinstance(classes[0], dict) else {}
    segment = ((c0.get("segment") or {}) or {}).get("name") or ""
    genre = ((c0.get("genre") or {}) or {}).get("name") or ""
    venue_name = venue.get("name") or ""
    city = ((venue.get("city") or {}) or {}).get("name") or ""
    state = ((venue.get("state") or {}) or {}).get("stateCode") or ""
    country = ((venue.get("country") or {}) or {}).get("countryCode") or ""
    address_line = ((venue.get("address") or {}) or {}).get("line1") or ""
    loc = ", ".join(p for p in (city, state, country) if p)
    when = " ".join(p for p in (start.get("localDate"), start.get("localTime")) if p)
    price, lo, hi, cur = _price(raw)
    info = (raw.get("info") or raw.get("pleaseNote") or "")[:400]
    return {
        "id": raw.get("id") or "",
        "name": raw.get("name") or "Event",
        "url": raw.get("url") or "",
        "image": _best_image(raw.get("images")),
        "localDate": start.get("localDate") or "",
        "localTime": start.get("localTime") or "",
        "when": when,
        "venue": venue_name,
        "city": city,
        "state": state,
        "country": country,
        "address": ", ".join(p for p in (venue_name, address_line, loc) if p),
        "segment": segment,
        "genre": genre,
        "classification": " · ".join(p for p in (segment, genre) if p) or "Event",
        "price": price,
        "priceMin": lo,
        "priceMax": hi,
        "currency": cur,
        "status": status,
        "info": info,
        "seatmap": ((raw.get("seatmap") or {}) or {}).get("staticUrl") or "",
    }


def search_events(
    *,
    city: str = "",
    keyword: str = "",
    classification: str = "",
    start: str = "",
    end: str = "",
    country: str = "",
    size: int = 24,
) -> dict[str, Any]:
    key = _api_key()
    if not key:
        return {
            "events": [],
            "total": 0,
            "mode": "degraded",
            "message": "Ticketmaster is not configured on the server.",
        }

    city = (city or "").strip()
    keyword = (keyword or "").strip()
    if not city and not keyword:
        return {
            "events": [],
            "total": 0,
            "mode": "ok",
            "message": "Enter a city or artist to search live Ticketmaster events.",
        }

    today = date.today()
    start = (start or "").strip() or today.isoformat()
    end = (end or "").strip() or (today + timedelta(days=21)).isoformat()
    klass = _CLASS_MAP.get((classification or "").strip().lower(), (classification or "").strip())
    cc = _infer_country(city, country)

    params: dict[str, Any] = {
        "apikey": key,
        "size": max(1, min(int(size or 24), 50)),
        "sort": "date,asc",
        "includeTBA": "no",
        "includeTBD": "no",
        "startDateTime": _tm_dt(start, False),
        "endDateTime": _tm_dt(end, True),
    }
    if city:
        params["city"] = city
    if cc:
        params["countryCode"] = cc
    if keyword:
        params["keyword"] = keyword
    if klass:
        params["classificationName"] = klass

    try:
        r = requests.get(_TM_EVENTS, params=params, timeout=20)
        r.raise_for_status()
        body = r.json()
    except requests.exceptions.RequestException as exc:
        return {
            "events": [],
            "total": 0,
            "mode": "degraded",
            "message": f"Ticketmaster request failed: {exc}",
        }

    raw_events = ((body.get("_embedded") or {}).get("events")) or []
    events = [normalize_event(e) for e in raw_events if isinstance(e, dict)]
    page = body.get("page") or {}
    total = int(page.get("totalElements") or len(events))
    thin_in = cc == "IN"
    message = ""
    if not events:
        message = (
            "Ticketmaster has little or no inventory in India. Try New York, London, Orlando, or another US/UK/AU city."
            if thin_in
            else "No Ticketmaster events found for that search. Try another city, date, or type."
        )
    return {
        "events": events,
        "total": total,
        "city": city,
        "country": cc,
        "start": start,
        "end": end,
        "classification": klass,
        "keyword": keyword,
        "mode": "ok",
        "message": message,
        "checkout": "ticketmaster",
    }


def get_event(event_id: str) -> dict[str, Any]:
    key = _api_key()
    eid = (event_id or "").strip()
    if not key:
        return {"event": None, "mode": "degraded", "message": "Ticketmaster is not configured."}
    if not eid:
        return {"event": None, "mode": "error", "message": "Missing event id."}
    try:
        r = requests.get(
            _TM_EVENT.format(id=eid),
            params={"apikey": key},
            timeout=15,
        )
        r.raise_for_status()
        raw = r.json()
    except requests.exceptions.RequestException as exc:
        return {"event": None, "mode": "degraded", "message": f"Ticketmaster request failed: {exc}"}
    return {"event": normalize_event(raw), "mode": "ok", "checkout": "ticketmaster"}
