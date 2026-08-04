"""
Distance Service — geocoding + straight-line distance between hotels and
day activities.

Used by the hotel-reuse flow to decide whether a hotel selected for one
night is close enough to the NEXT day's activities to be reused instead of
searching a fresh hotel.

Geocoding is done with Nominatim (geopy) and cached in-memory so the
per-night reuse checks do not hammer the service with repeat lookups.
"""

from __future__ import annotations

import math
import time
from typing import Any, Dict, List, Optional, Tuple

from backend.models.state import DayActivity, Hotel

# ---------------------------------------------------------------------------
# Geocoding cache / rate limiting
# ---------------------------------------------------------------------------

_GEOCODE_CACHE: Dict[str, Optional[Tuple[float, float]]] = {}
_MIN_REQUEST_INTERVAL = 1.1  # Nominatim asks for max ~1 request/second
_last_request_at = 0.0


def _throttle() -> None:
    """Wait so we respect Nominatim's request-rate policy."""
    global _last_request_at
    elapsed = time.time() - _last_request_at
    if elapsed < _MIN_REQUEST_INTERVAL:
        time.sleep(_MIN_REQUEST_INTERVAL - elapsed)
    _last_request_at = time.time()


def geocode(query: str) -> Optional[Tuple[float, float]]:
    """
    Resolve a free-text query to (lat, lon).

    Returns None when geocoding is unavailable (no geopy, network error,
    no match). Results are cached in memory.
    """
    key = (query or "").strip().lower()
    if not key:
        return None
    if key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[key]

    try:
        from geopy.geocoders import Nominatim
    except Exception:
        _GEOCODE_CACHE[key] = None
        return None

    result = None
    try:
        _throttle()
        geolocator = Nominatim(user_agent="itinero_hotel_reuse")
        location = geolocator.geocode(query, timeout=10)
        if location is not None:
            result = (location.latitude, location.longitude)
    except Exception:
        result = None

    _GEOCODE_CACHE[key] = result
    return result


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two coordinates, in kilometres."""
    earth_radius = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)

    a = (
        math.sin(dp / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    )
    return earth_radius * 2 * math.asin(math.sqrt(a))


# ---------------------------------------------------------------------------
# Activity place extraction
# ---------------------------------------------------------------------------

_SKIP_PLACES = {"accommodation", "hotel", "hotel stay", "stay"}


def activity_place_candidates(day: Optional[DayActivity]) -> List[str]:
    """
    Extract candidate place names from a day's schedule, most reliable first.

    Order: travel_details destinations → sightseeing → afternoon →
    evening → morning narrative. Every candidate is later geocoded with the
    destination city appended.
    """
    if day is None:
        return []

    candidates: List[str] = []
    seen: set = set()

    def _add(text: str) -> None:
        text = (text or "").strip()
        if not text or text.lower() in _SKIP_PLACES:
            return
        if text not in seen:
            seen.add(text)
            candidates.append(text)

    for detail in day.travel_details or []:
        _add(getattr(detail, "to_place", "") or "")

    _add(day.sightseeing)
    _add(day.afternoon_activities)
    _add(day.evening_activities)
    _add(day.morning)
    return candidates


# ---------------------------------------------------------------------------
# Hotel ↔ activities distance
# ---------------------------------------------------------------------------

def max_activity_distance_km(
    hotel: Optional[Hotel],
    day: Optional[DayActivity],
    destination: str,
) -> Optional[float]:
    """
    Max straight-line distance (km) from the hotel to any geocodable
    activity of the given day.

    Returns None when the hotel cannot be geocoded OR no activity place
    resolves to coordinates (callers should ask the user instead of
    guessing).
    """
    if hotel is None:
        return None

    hotel_pos = _geocode_hotel(hotel, destination)
    if hotel_pos is None:
        return None

    distances: List[float] = []
    for candidate in activity_place_candidates(day):
        place_pos = geocode(f"{candidate}, {destination}")
        if place_pos is None:
            continue
        distances.append(haversine_km(*hotel_pos, *place_pos))

    if not distances:
        return None
    return max(distances)


def _geocode_hotel(hotel: Hotel, destination: str) -> Optional[Tuple[float, float]]:
    """Geocode a hotel using its name + address, falling back to the city."""
    queries = []
    if hotel.address:
        queries.append(f"{hotel.name}, {hotel.address}")
        queries.append(hotel.address)
    queries.append(f"{hotel.name}, {destination}")
    queries.append(destination)

    for query in queries:
        pos = geocode(query)
        if pos is not None:
            return pos
    return None


# ---------------------------------------------------------------------------
# Helpers for building interrupt payloads
# ---------------------------------------------------------------------------

def build_reuse_payload(
    night: int,
    hotel_name: str,
    distance_km: Optional[float],
    message: str,
) -> Dict[str, Any]:
    """Structured payload for the hotel-reuse decision interrupt."""
    return {
        "type": "hotel_reuse_decision",
        "night": night,
        "hotel_name": hotel_name,
        "distance_km": round(distance_km, 1) if distance_km is not None else None,
        "message": message,
    }
