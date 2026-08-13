"""
Raw HTTP clients for the three Google Maps Platform APIs Itinero uses:
Routes, Places (New), Geocoding, and Time Zone. No formatting here - see
services/travel_service.py.
"""
from __future__ import annotations

import logging
import time
from typing import Any

import requests

from general_agent.config import GOOGLE_MAPS_API_KEY
from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
TIMEZONE_URL = "https://maps.googleapis.com/maps/api/timezone/json"

_DRIVE_FIELD_MASK = ",".join(
    [
        "routes.duration",
        "routes.staticDuration",
        "routes.distanceMeters",
        "routes.localizedValues",
        "routes.description",
        "routes.warnings",
        "routes.travelAdvisory.tollInfo",
    ]
)

# Step duration/distanceMeters are invalid on TRANSIT requests (400).
_TRANSIT_FIELD_MASK = ",".join(
    [
        "routes.duration",
        "routes.distanceMeters",
        "routes.localizedValues",
        "routes.warnings",
        "routes.description",
        "routes.travelAdvisory.transitFare",
        "routes.legs.duration",
        "routes.legs.distanceMeters",
        "routes.legs.localizedValues",
        "routes.legs.stepsOverview",
        "routes.legs.steps.travelMode",
        "routes.legs.steps.navigationInstruction",
        "routes.legs.steps.localizedValues",
        "routes.legs.steps.startLocation",
        "routes.legs.steps.endLocation",
        "routes.legs.steps.transitDetails",
    ]
)

_ALLOWED_TRANSIT = {"BUS", "SUBWAY", "TRAIN", "LIGHT_RAIL", "RAIL", "FERRY"}
_ROUTING_PREF = {"LESS_WALKING", "FEWER_TRANSFERS"}
_TRAVEL_MODES = {"DRIVE", "WALK", "BICYCLE", "TWO_WHEELER", "TRANSIT"}


def _waypoint(
    address: str,
    latlng: tuple[float, float] | None = None,
) -> dict[str, Any]:
    if latlng and len(latlng) == 2 and latlng[0] is not None and latlng[1] is not None:
        return {
            "location": {
                "latLng": {"latitude": float(latlng[0]), "longitude": float(latlng[1])}
            }
        }
    return {"address": address or ""}


def compute_route(
    origin: str,
    destination: str,
    mode: str = "DRIVE",
    *,
    departure_time: str | None = None,
    arrival_time: str | None = None,
    transit_routing: str | None = None,
    allowed_transit_modes: list[str] | None = None,
    alternatives: bool | None = None,
    language_code: str = "en",
    region_code: str | None = None,
    origin_latlng: tuple[float, float] | None = None,
    dest_latlng: tuple[float, float] | None = None,
    tolls: bool = False,
) -> dict[str, Any]:
    """POST computeRoutes. `departure_time`/`arrival_time` must be RFC3339 if set."""
    mode = (mode or "DRIVE").upper().strip()
    if mode not in _TRAVEL_MODES:
        mode = "DRIVE"

    transit = mode == "TRANSIT"
    field_mask = _TRANSIT_FIELD_MASK if transit else _DRIVE_FIELD_MASK
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": field_mask,
    }
    payload: dict[str, Any] = {
        "origin": _waypoint(origin, origin_latlng),
        "destination": _waypoint(destination, dest_latlng),
        "travelMode": mode,
        "languageCode": language_code or "en",
        "units": "METRIC",
    }
    if region_code:
        payload["regionCode"] = region_code[:2].upper()

    if mode == "DRIVE":
        payload["routingPreference"] = "TRAFFIC_AWARE"
        if tolls:
            payload["extraComputations"] = ["TOLLS"]

    if transit:
        prefs: dict[str, Any] = {}
        pref = (transit_routing or "").upper().replace(" ", "_")
        if pref in _ROUTING_PREF:
            prefs["routingPreference"] = pref
        modes = [
            m.upper().replace(" ", "_").replace("-", "_")
            for m in (allowed_transit_modes or [])
            if str(m).strip()
        ]
        modes = [m if m != "METRO" else "SUBWAY" for m in modes]
        modes = [m for m in modes if m in _ALLOWED_TRANSIT]
        if modes:
            prefs["allowedTravelModes"] = modes
        if prefs:
            payload["transitPreferences"] = prefs
        payload["computeAlternativeRoutes"] = True if alternatives is None else bool(alternatives)
        if departure_time and arrival_time:
            arrival_time = None  # API: mutually exclusive; prefer leave-at
        if departure_time:
            payload["departureTime"] = departure_time
        elif arrival_time:
            payload["arrivalTime"] = arrival_time
    elif alternatives:
        payload["computeAlternativeRoutes"] = True

    try:
        response = requests.post(ROUTES_URL, headers=headers, json=payload, timeout=20)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Google Routes request failed (%s -> %s %s): %s", origin, destination, mode, e)
        detail = ""
        if getattr(e, "response", None) is not None:
            try:
                detail = (e.response.text or "")[:400]
            except Exception:
                detail = str(e.response.status_code)
        raise ProviderRequestError("Google Routes", detail or str(e)) from e


def autocomplete_places(query: str, limit: int = 8) -> list[dict[str, Any]]:
    """Places Autocomplete (New) → name + address strings for typeahead."""
    q = (query or "").strip()
    if len(q) < 2:
        return []
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "suggestions.placePrediction.placeId,"
            "suggestions.placePrediction.text,"
            "suggestions.placePrediction.structuredFormat"
        ),
    }
    payload = {"input": q[:80], "languageCode": "en"}
    try:
        response = requests.post(
            PLACES_AUTOCOMPLETE_URL, headers=headers, json=payload, timeout=10
        )
        response.raise_for_status()
        body = response.json() or {}
    except requests.exceptions.RequestException as e:
        logger.info("Places autocomplete failed for %r: %s — falling back to searchText", q, e)
        return _places_from_text_search(q, limit)
    out: list[dict[str, Any]] = []
    for row in body.get("suggestions") or []:
        pred = row.get("placePrediction") if isinstance(row, dict) else None
        if not isinstance(pred, dict):
            continue
        text = pred.get("text") if isinstance(pred.get("text"), dict) else {}
        full = str(text.get("text") or "").strip()
        struct = pred.get("structuredFormat") if isinstance(pred.get("structuredFormat"), dict) else {}
        main = struct.get("mainText") if isinstance(struct.get("mainText"), dict) else {}
        secondary = struct.get("secondaryText") if isinstance(struct.get("secondaryText"), dict) else {}
        name = str(main.get("text") or "").strip() or full.split(",")[0].strip()
        subtitle = str(secondary.get("text") or "").strip()
        if not name and not full:
            continue
        out.append(
            {
                "id": str(pred.get("placeId") or name).strip(),
                "name": name or full,
                "address": full or name,
                "subtitle": subtitle,
            }
        )
        if len(out) >= max(1, min(int(limit or 8), 12)):
            break
    return out or _places_from_text_search(q, limit)


def _places_from_text_search(query: str, limit: int = 8) -> list[dict[str, Any]]:
    try:
        body = search_places_text(query, max(1, min(int(limit or 8), 12)))
    except ProviderRequestError:
        return []
    out: list[dict[str, Any]] = []
    for place in body.get("places") or []:
        if not isinstance(place, dict):
            continue
        disp = place.get("displayName") if isinstance(place.get("displayName"), dict) else {}
        name = str(disp.get("text") or "").strip()
        addr = str(place.get("formattedAddress") or "").strip()
        if not name and not addr:
            continue
        out.append(
            {
                "id": str(place.get("id") or name or addr),
                "name": name or addr.split(",")[0].strip(),
                "address": addr or name,
                "subtitle": addr,
            }
        )
    return out[: max(1, min(int(limit or 8), 12))]


def search_places_text(query: str, page_size: int) -> dict:
    """POST places:searchText - returns the raw response body."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,places.rating,"
            "places.userRatingCount,places.priceLevel,places.primaryType,"
            "places.currentOpeningHours.openNow,places.googleMapsUri,"
            "places.websiteUri,places.editorialSummary,places.photos"
        ),
    }
    payload = {"textQuery": query, "pageSize": page_size}

    try:
        response = requests.post(
            PLACES_TEXT_SEARCH_URL, headers=headers, json=payload, timeout=15
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Google Places search failed for query=%s: %s", query, e)
        raise ProviderRequestError("Google Places", str(e)) from e


def place_photo_url(photo_name: str, *, max_px: int = 480) -> str | None:
    """Resolve a Places photo resource to a browser-loadable Google CDN URL.

    Uses ``skipHttpRedirect=true`` so the client gets ``lh3.googleusercontent.com``
    (no API key in ``<img src>`` — works with referrer-restricted keys).
    """
    name = str(photo_name or "").strip().lstrip("/")
    if not name or not GOOGLE_MAPS_API_KEY:
        return None
    if not name.startswith("places/"):
        return None
    size = max(64, min(int(max_px or 480), 1600))
    media = (
        f"https://places.googleapis.com/v1/{name}/media"
        f"?maxHeightPx={size}&maxWidthPx={size}"
        f"&skipHttpRedirect=true&key={GOOGLE_MAPS_API_KEY}"
    )
    try:
        response = requests.get(media, timeout=10)
        response.raise_for_status()
        body = response.json() if response.content else {}
        uri = str((body or {}).get("photoUri") or "").strip()
        if uri.startswith("http"):
            return uri
    except requests.exceptions.RequestException as e:
        logger.info("Places photo resolve failed for %s: %s", name[:60], e)
    except ValueError:
        pass
    # Last resort — browser may still load if key allows referrer access
    return (
        f"https://places.googleapis.com/v1/{name}/media"
        f"?maxHeightPx={size}&maxWidthPx={size}&key={GOOGLE_MAPS_API_KEY}"
    )


def place_photo_urls(place: dict[str, Any], *, limit: int = 1, max_px: int = 480) -> list[str]:
    """Extract up to ``limit`` photo media URLs from a Places search hit."""
    photos = place.get("photos") if isinstance(place, dict) else None
    if not isinstance(photos, list):
        return []
    out: list[str] = []
    for photo in photos:
        if not isinstance(photo, dict):
            continue
        url = place_photo_url(photo.get("name") or "", max_px=max_px)
        if url and url not in out:
            out.append(url)
        if len(out) >= max(1, min(int(limit or 1), 4)):
            break
    return out


def geocode(address: str) -> dict:
    """GET geocode/json - returns the raw response body."""
    params = {"address": address, "key": GOOGLE_MAPS_API_KEY}
    try:
        response = requests.get(GEOCODE_URL, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Google Geocoding failed for address=%s: %s", address, e)
        raise ProviderRequestError("Google Geocoding", str(e)) from e


def _component(comps: list[dict[str, Any]], *types: str) -> tuple[str, str]:
    wanted = set(types)
    for c in comps:
        if wanted & set(c.get("types") or []):
            return str(c.get("short_name") or "").strip(), str(c.get("long_name") or "").strip()
    return "", ""


def geocode_place(address: str) -> dict[str, Any]:
    """First geocode hit: formatted address, country ISO, locality, lat/lng."""
    body = geocode(address)
    results = body.get("results") if isinstance(body, dict) else None
    if not results:
        raise ProviderRequestError("Google Geocoding", f"No place for {address!r}")
    hit = results[0] if isinstance(results[0], dict) else {}
    comps = hit.get("address_components") or []
    country_s, country_l = _component(comps, "country")
    loc_s, loc_l = _component(comps, "locality", "postal_town")
    admin_s, admin_l = _component(comps, "administrative_area_level_1")
    loc = (hit.get("geometry") or {}).get("location") or {}
    lat, lng = loc.get("lat"), loc.get("lng")
    if lat is None or lng is None:
        raise ProviderRequestError("Google Geocoding", f"No lat/lng for {address!r}")
    return {
        "formatted": str(hit.get("formatted_address") or address).strip(),
        "country": (country_s or "").upper(),
        "country_name": country_l,
        "locality": loc_l or loc_s,
        "admin": admin_l or admin_s,
        "lat": float(lat),
        "lng": float(lng),
    }


def timezone_id(lat: float, lng: float, timestamp: int | None = None) -> str:
    """IANA tz from Google Time Zone API (same key as Routes)."""
    params = {
        "location": f"{lat},{lng}",
        "timestamp": int(timestamp if timestamp is not None else time.time()),
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        response = requests.get(TIMEZONE_URL, params=params, timeout=10)
        response.raise_for_status()
        data = response.json() or {}
    except requests.exceptions.RequestException as e:
        logger.warning("Google Time Zone failed for %s,%s: %s", lat, lng, e)
        raise ProviderRequestError("Google Time Zone", str(e)) from e
    tz = str(data.get("timeZoneId") or "").strip()
    if not tz:
        raise ProviderRequestError("Google Time Zone", str(data.get("status") or "unknown"))
    return tz
