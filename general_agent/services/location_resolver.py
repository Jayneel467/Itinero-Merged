"""
Resolves free-form city names into the identifiers LiteAPI's real search
endpoints actually require:

  - Flights need a 3-letter IATA airport code ("Mumbai" -> "BOM").
  - Hotels need an ISO-2 country code ("Goa" -> "IN").

Neither FlightAgent nor HotelAgent (ITINERARY_AGENT, untouched) resolve
these themselves - they pass whatever string they're given straight to
LiteAPI, which rejects plain city names with a 400. Confirmed live:
  - flights/rates with origin="Mumbai" -> 400 "invalid IATA airport code"
  - hotels/rates with countryCode=""   -> 400 "you must search by either
    country code, latitude and longitude, placeId, ..."
Both succeed immediately once given a real code, which is what this module
produces - using Google Geocoding (already wired up, see
providers/google_maps_provider.py) plus LiteAPI's own airport reference
data (providers/liteapi_provider.py::get_airport_reference_data), so
resolution stays accurate for ANY city, not just a hardcoded list.

Callers: services/quick_search_service.py, itinerary_bridge.py. Every
function here degrades gracefully to None on any failure (network, no
geocoding match, etc.) - callers fall back to passing the original string
through unchanged, so this can never make things worse than before.
"""
from __future__ import annotations

import logging
import math
import re
try:
    from general_agent.exceptions import ProviderRequestError
    from general_agent.providers import google_maps_provider, liteapi_provider
except ImportError:
    from exceptions import ProviderRequestError
    from providers import google_maps_provider, liteapi_provider

logger = logging.getLogger(__name__)

_ISO_COUNTRY_RE = re.compile(r"^[A-Za-z]{2}$")
_IATA_RE = re.compile(r"^[A-Z]{3}$")

# City / alias → primary IATA. Not per-route rules — just names LiteAPI
# cannot search as free text. Title-case "Goa" must not become Genoa (GOA).
_CITY_IATA: dict[str, str] = {
    "mumbai": "BOM",
    "bombay": "BOM",
    "delhi": "DEL",
    "new delhi": "DEL",
    "dubai": "DXB",
    "goa": "GOI",
    "ahmedabad": "AMD",
    "amdavad": "AMD",
    "surat": "STV",
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "hyderabad": "HYD",
    "chennai": "MAA",
    "madras": "MAA",
    "kolkata": "CCU",
    "calcutta": "CCU",
    "pune": "PNQ",
    "london": "LHR",
    "new york": "JFK",
    "nyc": "JFK",
    "paris": "CDG",
    "singapore": "SIN",
    "bangkok": "BKK",
    "doha": "DOH",
    "abu dhabi": "AUH",
    "frankfurt": "FRA",
    "amsterdam": "AMS",
    "tokyo": "NRT",
    "hong kong": "HKG",
    "istanbul": "IST",
    "cairo": "CAI",
}

_HUB_RANK: dict[str, int] = {
    "DXB": 99, "AUH": 90, "DOH": 96, "BOM": 90, "DEL": 92, "BLR": 82,
    "JFK": 94, "EWR": 88, "LHR": 98, "LGW": 84, "CDG": 96, "ORY": 80,
    "SIN": 94, "BKK": 90, "HKG": 93, "FRA": 96, "AMS": 95, "IST": 94,
    "NRT": 90, "HND": 88, "GOI": 70, "GOX": 68, "AMD": 68, "STV": 50,
}

# Module-level cache: ~9000 airports, fetched once per process and reused -
# this reference list doesn't change during a server's lifetime.
_airport_cache: Optional[list[dict]] = None


def _airports() -> list[dict]:
    global _airport_cache
    if _airport_cache is None:
        try:
            body = liteapi_provider.get_airport_reference_data()
            _airport_cache = body.get("data") or []
            logger.info("location_resolver: cached %d airports.", len(_airport_cache))
        except ProviderRequestError as e:
            logger.warning("location_resolver: airport reference fetch failed: %s", e)
            _airport_cache = []
    return _airport_cache


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _geocode_first(place: str) -> Optional[dict]:
    try:
        body = google_maps_provider.geocode(place.strip())
    except ProviderRequestError as e:
        logger.warning("location_resolver: geocoding failed for '%s': %s", place, e)
        return None
    results = body.get("results") or []
    return results[0] if results else None


def _catalog_has(code: str) -> bool:
    c = str(code or "").upper()
    if not _IATA_RE.match(c):
        return False
    return any(str(a.get("code") or "").upper() == c for a in _airports())


def local_airport_key(place: str) -> Optional[str]:
    """Map city/IATA to a comparable key with no network. None if unknown."""
    if not place:
        return None
    t = place.strip()
    alias = _CITY_IATA.get(t.lower())
    if alias:
        return alias.upper()
    if _IATA_RE.match(t.upper()) and t.isalpha():
        return t.upper()
    return None


def resolve_airport_code(place: str) -> Optional[str]:
    """Return a 3-letter IATA airport code for a city/place name.

    Trust ALL-CAPS codes already in the catalog (BOM, DXB). Title-case
    3-letter cities like "Goa" go through aliases / geocode so they never
    become Genoa (GOA). Prefer international / hub airports near the city.
    """
    if not place:
        return None
    candidate = place.strip()
    alias = _CITY_IATA.get(candidate.lower())
    if alias:
        logger.info("location_resolver: '%s' -> %s (alias)", place, alias)
        return alias

    # Already an IATA code (from a previous resolve or the UI).
    if _IATA_RE.match(candidate.upper()) and candidate.isupper() and _catalog_has(candidate.upper()):
        return candidate.upper()

    result = _geocode_first(candidate)
    if not result:
        if _IATA_RE.match(candidate.upper()) and _catalog_has(candidate.upper()):
            return candidate.upper()
        return None
    loc = result.get("geometry", {}).get("location", {})
    lat, lng = loc.get("lat"), loc.get("lng")
    if lat is None or lng is None:
        return None

    country = None
    for component in result.get("address_components", []):
        if "country" in component.get("types", []):
            country = component.get("short_name")
            break

    airports = _airports()
    if not airports:
        return None

    pool = [a for a in airports if a.get("countryCode") == country] if country else airports
    if not pool:
        pool = airports

    def _score(a: dict) -> float:
        dist = _haversine_km(lat, lng, a.get("latitude", 0.0) or 0.0, a.get("longitude", 0.0) or 0.0)
        code = str(a.get("code") or "").upper()
        name = str(a.get("name") or "").lower()
        hub = _HUB_RANK.get(code, 0)
        intl = 25.0 if "international" in name else 0.0
        return dist - hub / 4.0 - intl

    nearest = min(pool, key=_score)
    code = nearest.get("code")
    logger.info("location_resolver: '%s' -> %s (%s)", place, code, nearest.get("name"))
    return code


def resolve_country_code(place: str) -> Optional[str]:
    """Return the ISO-2 country code for a city/place/location string. If
    `place` already looks like an ISO code, returns it unchanged."""
    if not place:
        return None
    candidate = place.strip()
    if _ISO_COUNTRY_RE.match(candidate):
        return candidate.upper()

    result = _geocode_first(candidate)
    if not result:
        return None
    for component in result.get("address_components", []):
        if "country" in component.get("types", []):
            return component.get("short_name")
    return None
