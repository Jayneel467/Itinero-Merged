"""Airport autocomplete for the flights search bar.

LiteAPI's `/data/flights/airports?q=` returns 403 on our key, so we search the
full IATA reference list (`/data/iataCodes`, ~9k) plus place aliases, and fall
back to Nominatim geocode → nearest airports when the typed place isn't in the
airport name (e.g. "State College" → University Park / SCE).
"""
from __future__ import annotations

import logging
import math
import os
import re
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_LITEAPI_BASE = (os.getenv("LITEAPI_BASE_URL") or "https://api.liteapi.travel/v3.0").rstrip("/")
_CACHE: list[dict[str, Any]] | None = None
_CACHE_AT = 0.0
_CACHE_TTL_SEC = 6 * 60 * 60

# Place / city nicknames that don't appear in LiteAPI airport names.
_PLACE_ALIASES: dict[str, list[str]] = {
    "state college": ["SCE"],
    "state college pa": ["SCE"],
    "state college pennsylvania": ["SCE"],
    "penn state": ["SCE"],
    "university park": ["SCE"],
    "university park pa": ["SCE"],
    "mumbai": ["BOM"],
    "bombay": ["BOM"],
    "delhi": ["DEL"],
    "new delhi": ["DEL"],
    "bangalore": ["BLR"],
    "bengaluru": ["BLR"],
    "goa": ["GOI", "GOX"],
    "dubai": ["DXB"],
    "new york": ["JFK", "EWR", "LGA"],
    "nyc": ["JFK", "EWR", "LGA"],
    "london": ["LHR", "LGW", "STN", "LCY"],
    "paris": ["CDG", "ORY"],
    "tokyo": ["NRT", "HND"],
    "bali": ["DPS"],
    "bangkok": ["BKK", "DMK"],
    "singapore": ["SIN"],
    "hong kong": ["HKG"],
    "los angeles": ["LAX"],
    "san francisco": ["SFO"],
    "chicago": ["ORD", "MDW"],
    "washington": ["IAD", "DCA", "BWI"],
    "dc": ["IAD", "DCA"],
}


def _api_key() -> str:
    return (
        os.getenv("LITEAPI_KEY")
        or os.getenv("LITEAPI_API_KEY")
        or os.getenv("X_API_KEY")
        or ""
    ).strip()


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _normalize_query(q: str) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())


def _to_ui(row: dict[str, Any], *, city: str | None = None, state: str | None = None) -> dict[str, Any]:
    code = str(row.get("code") or row.get("iata") or row.get("iataCode") or "").upper()
    name = str(row.get("name") or f"{code} Airport")
    country = str(row.get("countryCode") or row.get("country") or "").upper()
    city_name = (city or "").strip() or _city_from_name(name) or code
    state_name = (state or "").strip() or country
    return {
        "id": code.lower(),
        "code": code,
        "name": name,
        "city": city_name,
        "state": state_name,
        "countryCode": country or None,
        "latitude": row.get("latitude"),
        "longitude": row.get("longitude"),
    }


def _city_from_name(name: str) -> str:
    """Best-effort city label from airport name."""
    n = re.sub(r"\s+", " ", (name or "").strip())
    n = re.sub(
        r"\s+(International|Intl\.?|Airport|Airfield|Municipal|Regional).*$",
        "",
        n,
        flags=re.I,
    ).strip()
    return n or name


async def _load_airports() -> list[dict[str, Any]]:
    global _CACHE, _CACHE_AT
    now = time.monotonic()
    if _CACHE is not None and (now - _CACHE_AT) < _CACHE_TTL_SEC:
        return _CACHE

    key = _api_key()
    if not key:
        logger.warning("airport_suggest: missing LiteAPI key")
        _CACHE = []
        _CACHE_AT = now
        return _CACHE

    url = f"{_LITEAPI_BASE}/data/iataCodes"
    headers = {"Accept": "application/json", "X-API-Key": key}
    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.get(url, headers=headers)
        r.raise_for_status()
        payload = r.json()
    data = list(payload.get("data") or [])
    _CACHE = data
    _CACHE_AT = now
    logger.info("airport_suggest: cached %d airports", len(data))
    return data


def _by_codes(airports: list[dict[str, Any]], codes: list[str]) -> list[dict[str, Any]]:
    want = {c.upper() for c in codes if c}
    out = []
    seen = set()
    for a in airports:
        code = str(a.get("code") or "").upper()
        if code in want and code not in seen:
            seen.add(code)
            out.append(a)
    return out


def _text_matches(airports: list[dict[str, Any]], q: str, *, limit: int = 12) -> list[dict[str, Any]]:
    if not q:
        return []
    tokens = [t for t in re.split(r"[^a-z0-9]+", q) if t]
    scored: list[tuple[int, dict[str, Any]]] = []
    for a in airports:
        code = str(a.get("code") or "").upper()
        name = str(a.get("name") or "").lower()
        hay = f"{code.lower()} {name}"
        if q == code.lower():
            score = 100
        elif code.lower().startswith(q) and len(q) >= 2:
            score = 90
        elif q in hay:
            score = 70
        elif tokens and all(t in hay for t in tokens):
            score = 60
        else:
            continue
        scored.append((score, a))
    scored.sort(key=lambda x: (-x[0], str(x[1].get("name") or "")))
    out = []
    seen = set()
    for _, a in scored:
        code = str(a.get("code") or "").upper()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(a)
        if len(out) >= limit:
            break
    return out


async def _geocode(place: str) -> dict[str, Any] | None:
    query = (place or "").strip()
    if not query:
        return None
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "limit": 1}
    headers = {"User-Agent": "ItineroAirportSuggest/1.0"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        logger.warning("airport_suggest geocode failed for %r: %s", query, exc)
        return None
    if not data:
        return None
    return {
        "latitude": float(data[0]["lat"]),
        "longitude": float(data[0]["lon"]),
        "display_name": data[0].get("display_name") or query,
        "country_code": str((data[0].get("address") or {}).get("country_code") or "").upper()
        if isinstance(data[0].get("address"), dict)
        else "",
    }


def _nearest(
    airports: list[dict[str, Any]],
    *,
    lat: float,
    lon: float,
    country: str | None = None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    scored: list[tuple[float, dict[str, Any]]] = []
    for a in airports:
        try:
            alat = float(a.get("latitude"))
            alon = float(a.get("longitude"))
        except (TypeError, ValueError):
            continue
        cc = str(a.get("countryCode") or "").upper()
        if country and cc and cc != country.upper():
            continue
        dist = _haversine_km(lat, lon, alat, alon)
        # Skip absurdly far matches when we have a country filter
        if dist > 400:
            continue
        scored.append((dist, a))
    if not scored and country:
        # Fall back unrestricted if same-country pool was empty/dirty
        return _nearest(airports, lat=lat, lon=lon, country=None, limit=limit)
    scored.sort(key=lambda x: x[0])
    out = []
    seen = set()
    for _, a in scored:
        code = str(a.get("code") or "").upper()
        if not code or code in seen:
            continue
        seen.add(code)
        out.append(a)
        if len(out) >= limit:
            break
    return out


def _guess_city_state(display_name: str | None, q: str) -> tuple[str, str]:
    if display_name:
        parts = [p.strip() for p in display_name.split(",") if p.strip()]
        city = parts[0] if parts else q.title()
        state = ", ".join(parts[1:3]) if len(parts) > 1 else (parts[-1] if parts else "")
        return city, state
    return q.title(), ""


async def suggest_airports(query: str, *, limit: int = 10) -> dict[str, Any]:
    q = _normalize_query(query)
    if len(q) < 2:
        return {"ok": True, "query": query, "airports": [], "source": "short_query"}

    try:
        airports = await _load_airports()
    except Exception as exc:
        logger.exception("airport_suggest: failed to load reference data: %s", exc)
        return {
            "ok": False,
            "query": query,
            "airports": [],
            "error": "airport_reference_unavailable",
            "message": str(exc),
        }

    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    sources: list[str] = []

    def add_rows(rows: list[dict[str, Any]], *, city: str | None = None, state: str | None = None):
        for row in rows:
            ui = _to_ui(row, city=city, state=state)
            code = ui["code"]
            if not code or code in seen:
                continue
            seen.add(code)
            merged.append(ui)

    # 1) Explicit place aliases (State College → SCE, etc.)
    alias_codes = _PLACE_ALIASES.get(q)
    if not alias_codes:
        for key, codes in _PLACE_ALIASES.items():
            if q in key or key in q:
                alias_codes = codes
                break
    if alias_codes:
        add_rows(_by_codes(airports, alias_codes))
        sources.append("alias")
        # Prefer human city label from the query for alias hits
        for item in merged:
            if item["code"] in {c.upper() for c in alias_codes}:
                item["city"] = query.strip().title() if query.strip() else item["city"]

    # 2) Direct text match on IATA code / airport name
    text_hits = _text_matches(airports, q, limit=limit)
    if text_hits:
        add_rows(text_hits)
        sources.append("text")

    # 3) If still thin, geocode the place and take nearest airports
    if len(merged) < 3:
        geo = await _geocode(query)
        if geo:
            country = ""
            # Nominatim free-form often omits address; infer from display if possible
            display = geo.get("display_name") or ""
            city, state = _guess_city_state(display, q)
            # crude country from last comma segment length-2 ISO if present in data
            near = _nearest(
                airports,
                lat=geo["latitude"],
                lon=geo["longitude"],
                country=None,
                limit=limit,
            )
            # Prefer same-country when we can match countryCode from nearest cluster
            if near:
                top_cc = str(near[0].get("countryCode") or "").upper()
                same = _nearest(
                    airports,
                    lat=geo["latitude"],
                    lon=geo["longitude"],
                    country=top_cc or None,
                    limit=limit,
                )
                near = same or near
            add_rows(near, city=city, state=state)
            sources.append("geocode")

    return {
        "ok": True,
        "query": query,
        "airports": merged[:limit],
        "source": "+".join(sources) if sources else "none",
    }


# Worldwide connecting airports by relative long-haul feed — not per-route rules.
_HUB_RANK: dict[str, int] = {
    "ATL": 100, "DFW": 95, "ORD": 95, "DEN": 90, "LAX": 92, "JFK": 94, "EWR": 88,
    "LGA": 72, "SFO": 86, "MIA": 85, "CLT": 80, "IAH": 82, "SEA": 80, "BOS": 80, "MSP": 78,
    "YYZ": 84, "YVR": 70, "MEX": 78, "GRU": 80,
    "LHR": 98, "LGW": 84, "STN": 70, "LCY": 60, "CDG": 96, "ORY": 80, "AMS": 95,
    "FRA": 96, "MAD": 88, "BCN": 82, "FCO": 84, "MUC": 90, "ZRH": 86, "IST": 94,
    "DUB": 80, "LIS": 75,
    "DXB": 99, "AUH": 90, "DOH": 96, "RUH": 80, "JED": 78, "CAI": 82,
    "ADD": 88, "JNB": 86, "NBO": 75, "CMN": 72,
    "DEL": 92, "BOM": 90, "BLR": 82, "MAA": 78, "HYD": 74, "CCU": 70, "AMD": 68,
    "SIN": 94, "BKK": 90, "HKG": 93, "KUL": 82, "CGK": 80, "MNL": 78,
    "TPE": 86, "ICN": 93, "NRT": 90, "HND": 88, "PEK": 88, "PVG": 90,
    "SYD": 86, "MEL": 80, "AKL": 72,
}

_METRO_KM = 60.0
_NEARBY_MAJOR_KM = 120.0
_FEEDER_HUB_KM = 2200.0
_LONGHAUL_KM = 2800.0


def _iata_code(row: dict[str, Any]) -> str:
    return str(row.get("code") or row.get("iata") or row.get("iataCode") or "").upper()


def _latlng(row: dict[str, Any]) -> tuple[float, float] | None:
    try:
        return float(row["latitude"]), float(row["longitude"])
    except (TypeError, ValueError, KeyError):
        return None


def _airport_index(airports: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in airports:
        code = _iata_code(row)
        if code and _latlng(row) and code not in out:
            out[code] = row
    return out


def _is_city_code(row: dict[str, Any]) -> bool:
    name = str(row.get("name") or "").lower()
    return "metropolitan" in name or "metro area" in name or "city code" in name


def _usable_metro_alt(code: str, data: dict[str, Any], *, role: str) -> bool:
    if _is_city_code(data):
        return False
    rank = _HUB_RANK.get(code, 0)
    name = str(data.get("name") or "").lower()
    if role == "origin":
        return rank >= 50
    return rank >= 50 or "international" in name


def _metro_airports(
    index: dict[str, dict[str, Any]],
    code: str,
    *,
    limit: int = 3,
    role: str = "dest",
) -> list[dict[str, Any]]:
    row = index.get(code)
    if not row:
        return [{"code": code, "reason": "requested", "km": 0.0}]
    origin_ll = _latlng(row)
    if not origin_ll:
        return [{"code": code, "reason": "requested", "km": 0.0, "name": row.get("name")}]
    scored: list[tuple[float, str]] = []
    for other, data in index.items():
        if other == code:
            continue
        if not _usable_metro_alt(other, data, role=role):
            continue
        ll = _latlng(data)
        if not ll:
            continue
        dist = _haversine_km(origin_ll[0], origin_ll[1], ll[0], ll[1])
        if dist <= _METRO_KM:
            scored.append((dist, other))
    scored.sort()
    out = [{"code": code, "reason": "requested", "km": 0.0, "name": row.get("name")}]
    for dist, other in scored:
        out.append(
            {
                "code": other,
                "reason": "metro",
                "km": round(dist, 1),
                "name": index[other].get("name"),
            }
        )
        if len(out) >= limit:
            break
    return out


def _nearby_majors(
    index: dict[str, dict[str, Any]],
    origin: str,
    exclude: set[str],
    *,
    limit: int = 1,
) -> list[dict[str, Any]]:
    row = index.get(origin)
    if not row:
        return []
    origin_ll = _latlng(row)
    if not origin_ll:
        return []
    origin_cc = str(row.get("countryCode") or "").upper()
    scored: list[tuple[float, float, str]] = []
    for code, data in index.items():
        if code == origin or code in exclude:
            continue
        rank = _HUB_RANK.get(code, 0)
        if rank < 60:
            continue
        ll = _latlng(data)
        if not ll:
            continue
        dist = _haversine_km(origin_ll[0], origin_ll[1], ll[0], ll[1])
        if dist < 20 or dist > _NEARBY_MAJOR_KM:
            continue
        same = 18 if origin_cc and str(data.get("countryCode") or "").upper() == origin_cc else 0
        scored.append((rank + same - dist / 8.0, dist, code))
    scored.sort(reverse=True)
    out = []
    for _, dist, code in scored[:limit]:
        out.append(
            {
                "code": code,
                "reason": "nearby",
                "km": round(dist, 1),
                "name": index[code].get("name"),
            }
        )
    return out


def _feeder_hubs(
    index: dict[str, dict[str, Any]],
    origin: str,
    dest: str,
    exclude: set[str],
    *,
    limit: int = 2,
) -> list[dict[str, Any]]:
    """Same-country (or nearby) hubs the origin can feed into before a long-haul."""
    origin_row = index.get(origin)
    dest_row = index.get(dest)
    if not origin_row:
        return []
    origin_ll = _latlng(origin_row)
    dest_ll = _latlng(dest_row) if dest_row else None
    if not origin_ll:
        return []
    origin_cc = str(origin_row.get("countryCode") or "").upper()
    od = (
        _haversine_km(origin_ll[0], origin_ll[1], dest_ll[0], dest_ll[1])
        if dest_ll
        else None
    )
    scored: list[tuple[float, dict[str, Any]]] = []
    for hub, rank in _HUB_RANK.items():
        # Long-haul pairing needs a real gateway, not a thin domestic field.
        if hub == origin or hub == dest or hub in exclude or rank < 80:
            continue
        hub_row = index.get(hub)
        if not hub_row:
            continue
        hub_ll = _latlng(hub_row)
        if not hub_ll:
            continue
        oh = _haversine_km(origin_ll[0], origin_ll[1], hub_ll[0], hub_ll[1])
        if oh < 80 or oh > _FEEDER_HUB_KM:
            continue
        hub_cc = str(hub_row.get("countryCode") or "").upper()
        same_country = bool(origin_cc and hub_cc == origin_cc)
        if not same_country and oh > 900:
            continue
        detour = None
        if od and dest_ll:
            hd = _haversine_km(hub_ll[0], hub_ll[1], dest_ll[0], dest_ll[1])
            if hd < 80:
                continue
            detour = (oh + hd) / od if od else None
            if detour and detour > 1.6:
                continue
        # Prefer real gateways + low detour. Don't punish a 900km domestic
        # feeder (STV→DEL) versus a closer but weaker field.
        score = rank * 1.6 + (55 if same_country else 0) - oh / 80.0
        if detour:
            score += 40 / (detour**2)
        scored.append(
            (
                score,
                {
                    "code": hub,
                    "reason": "feeder_hub",
                    "km": round(oh, 1),
                    "detour": round(detour, 3) if detour else None,
                    "same_country": same_country,
                    "name": hub_row.get("name"),
                },
            )
        )
    scored.sort(key=lambda x: x[0], reverse=True)
    return [row for _, row in scored[:limit]]


async def expand_route_airports(origin: str, destination: str) -> dict[str, Any]:
    """Nearby metros + feeder hubs for Google-style O → hub → D pairing.

    No per-city hardcoding: hubs are chosen from coordinates + worldwide hub rank.
    """
    origin_code = str(origin or "").strip().upper()[:3]
    dest_code = str(destination or "").strip().upper()[:3]
    if not re.match(r"^[A-Z]{3}$", origin_code) or not re.match(r"^[A-Z]{3}$", dest_code):
        return {
            "ok": False,
            "error": "invalid_iata",
            "origin": origin_code,
            "destination": dest_code,
            "origins": [],
            "destinations": [],
            "hubs": [],
        }

    try:
        airports = await _load_airports()
    except Exception as exc:
        logger.exception("expand_route_airports: failed to load IATA catalog: %s", exc)
        return {
            "ok": False,
            "error": "airport_reference_unavailable",
            "origin": origin_code,
            "destination": dest_code,
            "origins": [{"code": origin_code, "reason": "requested", "km": 0}],
            "destinations": [{"code": dest_code, "reason": "requested", "km": 0}],
            "hubs": [],
        }

    index = _airport_index(airports)
    destinations = _metro_airports(index, dest_code, limit=3, role="dest")
    origins = _metro_airports(index, origin_code, limit=3, role="origin")
    dest_codes = {row["code"] for row in destinations}
    origin_codes = {row["code"] for row in origins}
    exclude = origin_codes | dest_codes

    origin_ll = _latlng(index[origin_code]) if origin_code in index else None
    dest_ll = _latlng(index[dest_code]) if dest_code in index else None
    distance_km = None
    if origin_ll and dest_ll:
        distance_km = round(_haversine_km(origin_ll[0], origin_ll[1], dest_ll[0], dest_ll[1]), 1)

    hubs: list[dict[str, Any]] = []
    origin_rank = _HUB_RANK.get(origin_code, 0)
    origin_cc = str((index.get(origin_code) or {}).get("countryCode") or "").upper()
    dest_cc = str((index.get(dest_code) or {}).get("countryCode") or "").upper()
    international = bool(origin_cc and dest_cc and origin_cc != dest_cc)
    # Thin origins (not themselves major hubs) + international dest → pair
    # domestic feeders with hub long-haul. Nearby airports stay origins, not hubs.
    if origin_rank < 85 and (international or distance_km is None or distance_km >= _LONGHAUL_KM):
        hubs = _feeder_hubs(
            index,
            origin_code,
            dest_code,
            dest_codes | {origin_code},
            limit=2,
        )

    return {
        "ok": True,
        "origin": origin_code,
        "destination": dest_code,
        "distance_km": distance_km,
        "origins": origins[:3],
        "destinations": destinations[:3],
        "hubs": hubs,
    }
