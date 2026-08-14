"""Resolve destination / landmark photos via Google Places (cached)."""
from __future__ import annotations

import logging
import re
import time
from typing import Any
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_BYTES_CACHE: dict[str, tuple[float, bytes, str]] = {}
_TTL = 7 * 24 * 3600  # Places landmark photos are stable
_CACHE_VER = "v5"  # bump: word-boundary city match; never ignore city last-resort

# Prefer scenic / cultural hits — not car rentals or tour-operator ads.
_GOOD_TYPES = {
    "tourist_attraction",
    "historical_landmark",
    "monument",
    "museum",
    "park",
    "national_park",
    "hindu_temple",
    "church",
    "mosque",
    "synagogue",
    "place_of_worship",
    "palace",
    "castle",
    "fortress",
    "viewpoint",
    "natural_feature",
    "beach",
    "marina",
    "zoo",
    "aquarium",
    "art_gallery",
    "performing_arts_theater",
    "stadium",
    "observation_deck",
}
_BAD_TYPES = {
    "car_rental",
    "travel_agency",
    "taxi_stand",
    "bus_station",
    "transit_station",
    "parking",
    "gas_station",
    "atm",
    "bank",
    "insurance_agency",
    "real_estate_agency",
    "moving_company",
    "storage",
    "courier_service",
    "electrician",
    "plumber",
    "car_dealer",
    "car_repair",
    "store",
    "shopping_mall",
    "supermarket",
    "convenience_store",
}
_BAD_NAME_RE = re.compile(
    r"\b("
    r"tempo\s*travell?er|travels?\s*&\s*tours|tours?\s*&\s*travels|"
    r"cab\s*service|taxi\s*service|car\s*rental|bike\s*rental|"
    r"airport\s*transfer|group\s*travel\s*expert|call\s*now|whatsapp|"
    r"package\s*tour|honeymoon\s*package|wedding\s*planner|"
    r"rent\s*a\s*car|self\s*drive|tempo|urbaniya"
    r")\b",
    re.I,
)

# Anchor popular destinations so Places does not drift to a lookalike city.
_CITY_LANDMARK_HINTS: dict[str, str] = {
    "udaipur": "City Palace Lake Pichola",
    "jaipur": "Hawa Mahal Amber Fort",
    "manali": "Rohtang Pass Himachal mountains",
    "kochi": "Chinese fishing nets Fort Kochi",
    "darjeeling": "Tiger Hill tea estate Himalaya",
    "rishikesh": "Laxman Jhula Ganga",
    "andaman": "Havelock Radhanagar Beach",
    "port blair": "Cellular Jail Andaman",
    "santorini": "Oia white houses caldera",
    "maldives": "overwater villa turquoise lagoon",
    "zanzibar": "Stone Town Nungwi beach",
    "cape town": "Table Mountain waterfront",
    "queenstown": "Remarkables Lake Wakatipu",
    "varanasi": "Dashashwamedh Ghat Ganga",
    "srinagar": "Dal Lake houseboat",
    "leh": "Leh Palace Thiksey Monastery",
    "goa": "Baga Beach Fort Aguada",
    "bali": "Ubud rice terrace temple",
    "ubud": "Tegallalang rice terrace Sacred Monkey Forest",
    "mumbai": "Gateway of India Marine Drive",
    "paris": "Eiffel Tower Seine",
    "tokyo": "Shibuya crossing Tokyo Tower",
    "kyoto": "Fushimi Inari Kiyomizu",
    "dubai": "Burj Khalifa downtown skyline",
    "amsterdam": "canal houses Damrak",
    "london": "Big Ben Tower Bridge",
    "rome": "Colosseum Vatican",
    "barcelona": "Sagrada Familia Park Guell",
    "new york": "Empire State Manhattan skyline",
    "singapore": "Marina Bay Sands",
    "sydney": "Opera House harbour",
    "bangkok": "Wat Arun Grand Palace",
    "istanbul": "Hagia Sophia Blue Mosque",
}


def _build_query(q: str = "", *, city: str = "", country: str = "") -> str:
    city = (city or "").strip()
    country = (country or "").strip()
    q = (q or "").strip()
    # Soften theme words that pull wedding/tour operators instead of landmarks.
    q = re.sub(
        r"\b(honeymoon|wedding|package|travel\s+destination|tours?)\b",
        "landmark",
        q,
        flags=re.I,
    )
    hint = _CITY_LANDMARK_HINTS.get(city.lower())
    if not q:
        if hint:
            q = f"{city} {hint}" + (f" {country}" if country else "")
        elif city and country:
            q = f"{city} {country} famous landmark scenic view"
        elif city:
            q = f"{city} famous landmark scenic view"
        elif country:
            q = f"{country} famous landmark"
    elif hint and city and city.lower() not in q.lower():
        q = f"{city} {q}"
    elif hint and city and hint.split()[0].lower() not in q.lower():
        # Keep user query but bias toward the city's landmark vocabulary.
        q = f"{q} {hint}"
    return q


def _proxy_path(
    *,
    q: str = "",
    city: str = "",
    country: str = "",
    max_px: int = 900,
    index: int = 0,
) -> str:
    params: dict[str, str] = {"max_px": str(int(max_px or 900))}
    if q:
        params["q"] = q
    if city:
        params["city"] = city
    if country:
        params["country"] = country
    idx = max(0, min(int(index or 0), 7))
    if idx:
        params["i"] = str(idx)
    return f"/api/places/photo/img?{urlencode(params)}"


def _place_name(place: dict[str, Any]) -> str:
    disp = place.get("displayName") if isinstance(place.get("displayName"), dict) else {}
    return str(disp.get("text") or "").strip()


def _place_address(place: dict[str, Any]) -> str:
    return str(
        place.get("formattedAddress")
        or place.get("shortFormattedAddress")
        or ""
    ).strip()


def _place_type(place: dict[str, Any]) -> str:
    return str(place.get("primaryType") or "").strip().lower()


def _city_tokens(city: str) -> list[str]:
    raw = re.sub(r"[^a-zA-Z\s]", " ", (city or "").strip().lower())
    parts = [p for p in raw.split() if len(p) > 2]
    # Keep full city string too (e.g. "hong kong")
    full = " ".join(parts)
    out = []
    if full:
        out.append(full)
    for p in parts:
        if p not in out:
            out.append(p)
    return out


def _token_in_blob(token: str, blob: str) -> bool:
    """Word-boundary match so 'leh' ≠ leisure and 'rome' ≠ romantic."""
    t = (token or "").strip().lower()
    if not t:
        return False
    if len(t) <= 4 or " " in t:
        return bool(re.search(rf"(?<![a-z]){re.escape(t)}(?![a-z])", blob))
    return t in blob


def _city_match_score(place: dict[str, Any], city: str) -> float:
    """Boost places that mention the requested city; penalize clear mismatches."""
    tokens = _city_tokens(city)
    if not tokens:
        return 0.0
    blob = f"{_place_name(place)} {_place_address(place)}".lower()
    if not blob.strip():
        return 0.0
    if any(_token_in_blob(t, blob) for t in tokens):
        return 45.0
    # Soft penalty — still allow Ubud for Bali-style queries, but rank lower.
    return -25.0


def _place_score(place: dict[str, Any], city: str = "") -> float:
    """Higher = better destination photo source."""
    name = _place_name(place)
    ptype = _place_type(place)
    if _BAD_NAME_RE.search(name):
        return -1000.0
    if ptype in _BAD_TYPES:
        return -500.0
    score = 0.0
    if ptype in _GOOD_TYPES:
        score += 40.0
    score += _city_match_score(place, city)
    rating = place.get("rating")
    try:
        score += float(rating or 0) * 4.0
    except (TypeError, ValueError):
        pass
    try:
        reviews = int(place.get("userRatingCount") or 0)
        score += min(25.0, reviews / 200.0)
    except (TypeError, ValueError):
        pass
    # Prefer well-known named landmarks over generic businesses
    if any(
        w in name.lower()
        for w in (
            "palace",
            "fort",
            "temple",
            "mosque",
            "church",
            "museum",
            "park",
            "lake",
            "beach",
            "tower",
            "bridge",
            "garden",
            "falls",
            "mountain",
            "island",
            "bay",
            "square",
            "cathedral",
        )
    ):
        score += 20.0
    return score


def resolve_place_photo(
    q: str = "",
    *,
    city: str = "",
    country: str = "",
    max_px: int = 900,
    index: int = 0,
) -> dict[str, Any]:
    """Return a Places landmark photo for Explore / packages / itinerary.

    ``photo_url`` is a same-origin proxy path so the browser never hits
    Google CDN directly (Opera VPN / referrer blocks).

    ``index`` picks the Nth photo across the top Places hits (carousel slides).
    """
    city = (city or "").strip()
    country = (country or "").strip()
    q = _build_query(q, city=city, country=country)
    if len(q) < 2:
        return {"ok": False, "photo_url": None, "query": q, "error": "missing_query"}

    max_px = int(max_px or 900)
    index = max(0, min(int(index or 0), 7))
    cache_key = f"{_CACHE_VER}|{q.lower()}|{max_px}|i{index}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return {**hit[1], "cached": True}

    try:
        from providers import google_maps_provider
    except Exception as exc:
        logger.warning("places photo import failed: %s", exc)
        return {"ok": False, "photo_url": None, "query": q, "error": "maps_unavailable"}

    try:
        body = google_maps_provider.search_places_text(q, 10)
    except Exception as exc:
        logger.info("places photo search failed for %r: %s", q, exc)
        return {"ok": False, "photo_url": None, "query": q, "error": str(exc)[:160]}

    places = [p for p in (body.get("places") or []) if isinstance(p, dict)]
    ranked = sorted(places, key=lambda p: _place_score(p, city), reverse=True)

    candidates: list[tuple[str, str | None]] = []
    for place in ranked:
        if _place_score(place, city) < 0:
            continue
        urls = google_maps_provider.place_photo_urls(place, limit=2, max_px=max_px)
        if not urls:
            continue
        place_name = _place_name(place) or None
        for url in urls:
            if url and url not in {c[0] for c in candidates}:
                candidates.append((url, place_name))
        if len(candidates) >= 8:
            break

    # Fallback: if filters wiped everything, take top-ranked non-blacklist names only
    if not candidates:
        for place in ranked:
            if _BAD_NAME_RE.search(_place_name(place)):
                continue
            if _place_type(place) in _BAD_TYPES:
                continue
            # Prefer city-matching places even in the soft fallback.
            if city and _city_match_score(place, city) < 0:
                continue
            urls = google_maps_provider.place_photo_urls(place, limit=1, max_px=max_px)
            if not urls:
                continue
            candidates.append((urls[0], _place_name(place) or None))
            if len(candidates) >= 4:
                break

    # Last resort: only when the caller did not name a city. Wrong-city photos
    # are worse than an empty slot (frontend falls back to destination cover).
    if not candidates and not city:
        for place in ranked:
            if _BAD_NAME_RE.search(_place_name(place)):
                continue
            if _place_type(place) in _BAD_TYPES:
                continue
            urls = google_maps_provider.place_photo_urls(place, limit=1, max_px=max_px)
            if not urls:
                continue
            candidates.append((urls[0], _place_name(place) or None))
            if len(candidates) >= 4:
                break

    if not candidates:
        out = {"ok": False, "photo_url": None, "query": q, "error": "no_photo"}
        _CACHE[cache_key] = (time.time(), out)
        return out

    pick = candidates[min(index, len(candidates) - 1)]
    upstream, place_name = pick
    proxy = _proxy_path(q=q, city=city, country=country, max_px=max_px, index=index)
    out = {
        "ok": True,
        "photo_url": proxy,
        "image": proxy,
        "upstream": upstream,
        "place_name": place_name,
        "query": q,
        "index": index,
        "total": len(candidates),
    }
    _CACHE[cache_key] = (time.time(), out)
    return {**out, "cached": False}


def fetch_place_photo_bytes(
    q: str = "",
    *,
    city: str = "",
    country: str = "",
    max_px: int = 900,
    index: int = 0,
) -> tuple[bytes, str] | None:
    """Download landmark photo bytes (cached) for the same-origin ``/img`` proxy."""
    meta = resolve_place_photo(
        q or "",
        city=city or "",
        country=country or "",
        max_px=max_px,
        index=index,
    )
    upstream = str(meta.get("upstream") or "").strip()
    if not meta.get("ok") or not upstream:
        return None

    cache_key = f"{_CACHE_VER}|{upstream}"
    hit = _BYTES_CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1], hit[2]

    try:
        resp = requests.get(
            upstream,
            timeout=20,
            headers={
                "User-Agent": "ItineroPlacesPhoto/1.0",
                "Accept": "image/*,*/*;q=0.8",
            },
        )
        resp.raise_for_status()
    except requests.exceptions.RequestException as exc:
        logger.info("places photo bytes failed: %s", exc)
        return None

    content_type = (resp.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
    if not content_type.startswith("image/"):
        content_type = "image/jpeg"
    data = resp.content or b""
    if len(data) < 64:
        return None
    _BYTES_CACHE[cache_key] = (time.time(), data, content_type)
    return data, content_type
