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
from typing import Optional

from exceptions import ProviderRequestError
from providers import google_maps_provider, liteapi_provider

logger = logging.getLogger(__name__)

_ISO_COUNTRY_RE = re.compile(r"^[A-Za-z]{2}$")

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


def resolve_airport_code(place: str) -> Optional[str]:
    """Return a 3-letter IATA airport code for a city/place name — the
    nearest same-country airport to its geocoded location.

    NOTE: deliberately does NOT short-circuit on "already looks like 3
    letters" — a handful of city names are themselves 3 letters (e.g.
    "Goa"), and treating those as pre-resolved codes silently picks the
    wrong, coincidentally-matching airport elsewhere in the world (verified
    live: "Goa" -> "GOA", Genoa, Italy). Always resolve through geocoding.

    Restricts candidates to the geocoded country: LiteAPI's own reference
    dataset has data-quality issues (verified live: the nearest airport by
    raw coordinates to Mumbai is "BRJ", tagged countryCode "AU", sitting
    almost exactly on Mumbai's coordinates — clearly mislabeled/dirty data,
    not a real option). Requiring a country match avoids that class of
    error; falls back to the unrestricted nearest match only if no
    same-country airport exists at all.
    """
    if not place:
        return None
    candidate = place.strip()

    result = _geocode_first(candidate)
    if not result:
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

    nearest = min(
        pool,
        key=lambda a: _haversine_km(lat, lng, a.get("latitude", 0.0), a.get("longitude", 0.0)),
    )
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
