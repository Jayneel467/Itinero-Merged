"""
Raw HTTP client for LiteAPI hotel/flight search plus hold (prebook/verify).

Full passenger booking (/flights/bookings, /rates/book) stays on the site
checkout (supervisor) — this module only searches and holds live rates.
"""
import logging

import requests

from general_agent.config import LITEAPI_KEY
from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

BASE_URL = "https://api.liteapi.travel/v3.0"


def _headers() -> dict:
    return {
        "accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": LITEAPI_KEY,
    }


def search_hotel_rates(payload: dict) -> dict:
    """POST /hotels/rates - returns the raw response body."""
    try:
        response = requests.post(
            f"{BASE_URL}/hotels/rates", headers=_headers(), json=payload, timeout=15
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("LiteAPI hotel search failed: %s", e)
        raise ProviderRequestError("LiteAPI hotels", str(e)) from e


def search_flight_rates(payload: dict) -> dict:
    """POST /flights/rates - returns the raw response body."""
    try:
        response = requests.post(
            f"{BASE_URL}/flights/rates", headers=_headers(), json=payload, timeout=20
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("LiteAPI flight search failed: %s", e)
        raise ProviderRequestError("LiteAPI flights", str(e)) from e


def verify_flight_offer(payload: dict) -> dict:
    """POST /flights/verify — confirm a live offerId is still bookable."""
    try:
        response = requests.post(
            f"{BASE_URL}/flights/verify", headers=_headers(), json=payload, timeout=20
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("LiteAPI flight verify failed: %s", e)
        raise ProviderRequestError("LiteAPI flight verify", str(e)) from e


def prebook_hotel_rate(payload: dict) -> dict:
    """POST /rates/prebook — hold a hotel offerId (prefer usePaymentSdk in prod)."""
    try:
        response = requests.post(
            f"{BASE_URL}/rates/prebook", headers=_headers(), json=payload, timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("LiteAPI hotel prebook failed: %s", e)
        raise ProviderRequestError("LiteAPI hotel prebook", str(e)) from e


def get_airport_reference_data() -> dict:
    """GET /data/iataCodes - full IATA airport reference list (~9000 entries:
    code, name, latitude, longitude, countryCode). Used to resolve a plain
    city name to the airport code LiteAPI's flight search actually requires
    - see services/location_resolver.py."""
    try:
        response = requests.get(
            f"{BASE_URL}/data/iataCodes", headers=_headers(), timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("LiteAPI airport reference data fetch failed: %s", e)
        raise ProviderRequestError("LiteAPI airports", str(e)) from e
