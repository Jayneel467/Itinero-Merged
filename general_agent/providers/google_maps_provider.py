"""
Raw HTTP clients for the three Google Maps Platform APIs Itinero uses:
Routes, Places (New), and Geocoding. No formatting here - see
services/travel_service.py.
"""
import logging

import requests

from general_agent.config import GOOGLE_MAPS_API_KEY
from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"
PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"


def compute_route(origin: str, destination: str, mode: str = "DRIVE") -> dict:
    """POST computeRoutes - returns the raw response body."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    }
    payload = {
        "origin": {"address": origin},
        "destination": {"address": destination},
        "travelMode": mode,
    }
    if mode == "DRIVE":
        payload["routingPreference"] = "TRAFFIC_AWARE"

    try:
        response = requests.post(ROUTES_URL, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Google Routes request failed (%s -> %s): %s", origin, destination, e)
        raise ProviderRequestError("Google Routes", str(e)) from e


def search_places_text(query: str, page_size: int) -> dict:
    """POST places:searchText - returns the raw response body."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,places.rating,"
            "places.userRatingCount,places.priceLevel,"
            "places.currentOpeningHours.openNow,places.googleMapsUri"
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
