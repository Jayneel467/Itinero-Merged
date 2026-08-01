"""
LiteAPI Hotel Service — shared hotel API helpers.

Single source of truth for the LiteAPI hotel integration used by the
LangGraph hotel workflow. Logic is extracted from `hotel_booking_backend.py`
(occupancies, guest nationality, rates search, real pre-book) so the
itinerary agent reuses the exact same API behaviour instead of duplicating it.

Only PRE-BOOKING is performed here — no final booking, no customer info.
"""

from __future__ import annotations

import math
import os
from typing import Any, Dict, List, Optional

import requests

from backend.config import settings


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RATES_URL    = "https://api.liteapi.travel/v3.0/hotels/rates"
PREBOOK_URL  = "https://book.liteapi.travel/v3.0/rates/prebook"

DEFAULT_CURRENCY = "INR"
DEFAULT_NATIONALITY = "IN"


class HotelPrebookError(RuntimeError):
    """Raised when a LiteAPI hotel pre-booking call fails."""

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        detail: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail


def _api_key() -> str:
    """Return the configured LiteAPI sandbox/production key."""
    key = (settings.liteapi_api_key or os.getenv("LITEAPI_API_KEY", "")).strip()
    if not key:
        raise HotelPrebookError(
            "LITEAPI_API_KEY is not configured. Add it to the .env file."
        )
    return key


def _headers() -> Dict[str, str]:
    return {
        "accept": "application/json",
        "content-type": "application/json",
        "X-API-Key": _api_key(),
    }


# ---------------------------------------------------------------------------
# Occupancy & guest helpers (from hotel_booking_backend.py)
# ---------------------------------------------------------------------------

def create_occupancies(
    adults: int,
    children_ages: Optional[List[int]] = None,
    rooms: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Build the LiteAPI `occupancies` array.

    - adults      : total number of adults across all rooms
    - children_ages : age of every child, e.g. [5, 8]
    - rooms       : number of rooms; defaults to ceil(adults / 2)
    """
    if adults <= 0:
        raise ValueError("At least one adult is required")

    if rooms is None or rooms <= 0:
        rooms = math.ceil(adults / 2)

    occupancies = [
        {"adults": 0, "children": []}
        for _ in range(rooms)
    ]

    remaining_adults = adults
    room_index = 0
    while remaining_adults > 0:
        occupancies[room_index]["adults"] += 1
        remaining_adults -= 1
        room_index = (room_index + 1) % rooms

    room_index = 0
    for age in (children_ages or []):
        occupancies[room_index]["children"].append(age)
        room_index = (room_index + 1) % rooms

    return occupancies


def search_country_code(guest_nationality: str) -> Optional[str]:
    """
    Resolve a guest's country of origin to a 2-letter ISO code via Nominatim.
    Returns None when the lookup fails (callers may fall back to "IN").
    """
    try:
        from geopy.geocoders import Nominatim
    except Exception:
        return None

    if not guest_nationality or not str(guest_nationality).strip():
        return None

    try:
        geolocator = Nominatim(user_agent="liteapi_helper_app")
        location = geolocator.geocode(
            str(guest_nationality).strip(),
            addressdetails=True,
            language="en",
        )
        if location and "address" in location.raw:
            code = location.raw["address"].get("country_code", "").upper()
            if code:
                return code
    except Exception:
        pass
    return None


def guest_nationality_code(guest_nationality: str) -> str:
    """Country code for LiteAPI payloads, falling back to 'IN'."""
    code = search_country_code(guest_nationality)
    return code or DEFAULT_NATIONALITY


# ---------------------------------------------------------------------------
# Rates search (from hotel_booking_backend.py search_availability)
# ---------------------------------------------------------------------------

def search_hotel_rates(
    hotel_ids: List[str],
    check_in: str,
    check_out: str,
    occupancies: List[Dict[str, Any]],
    currency: str = DEFAULT_CURRENCY,
    guest_nationality: str = DEFAULT_NATIONALITY,
    timeout: int = 60,
) -> Dict[str, Any]:
    """
    Query LiteAPI /v3.0/hotels/rates for the given hotel ids.

    Returns the raw JSON body (dict with "data") or {} on failure.
    """
    if not hotel_ids:
        return {}

    payload = {
        "hotelIds": hotel_ids,
        "checkin": check_in,
        "checkout": check_out,
        "occupancies": occupancies,
        "currency": currency,
        "guestNationality": guest_nationality,
    }

    try:
        response = requests.post(
            RATES_URL,
            json=payload,
            headers=_headers(),
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise HotelPrebookError(f"Network error while searching hotel rates: {exc}") from exc

    if response.status_code != 200:
        detail = _extract_error(response)
        raise HotelPrebookError(
            f"LiteAPI rates search failed: {detail}",
            status_code=response.status_code,
            detail=detail,
        )

    return response.json()


def search_hotel_rates_per_hotel(
    hotel_id: str,
    check_in: str,
    check_out: str,
    occupancies: List[Dict[str, Any]],
    currency: str = DEFAULT_CURRENCY,
    guest_nationality: str = DEFAULT_NATIONALITY,
) -> Dict[str, Any]:
    """Rates for a single hotel (used by legacy flows)."""
    return search_hotel_rates(
        [hotel_id], check_in, check_out,
        occupancies, currency, guest_nationality,
    )


# ---------------------------------------------------------------------------
# Pre-book (from hotel_booking_backend.py prebook_room)
# ---------------------------------------------------------------------------

def prebook_hotel_room(offer_id: str) -> str:
    """
    Pre-book a hotel room on LiteAPI.

    POST /v3.0/rates/prebook with {"offerId": ..., "usePaymentSdk": false}.
    Returns the prebookId string. Raises HotelPrebookError on failure.
    """
    if not offer_id or not str(offer_id).strip():
        raise HotelPrebookError("Missing offerId — cannot pre-book.")

    payload = {
        "offerId": str(offer_id).strip(),
        "usePaymentSdk": False,
    }

    try:
        response = requests.post(
            PREBOOK_URL,
            headers=_headers(),
            json=payload,
            timeout=60,
        )
    except requests.RequestException as exc:
        raise HotelPrebookError(
            f"Network error while pre-booking hotel: {exc}"
        ) from exc

    if response.status_code >= 400:
        detail = _extract_error(response)
        raise HotelPrebookError(
            f"LiteAPI pre-booking failed: {detail}",
            status_code=response.status_code,
            detail=detail,
        )

    try:
        body = response.json()
    except ValueError as exc:
        raise HotelPrebookError("LiteAPI returned an invalid pre-book response.") from exc

    data = body.get("data") or {}
    prebook_id = data.get("prebookId") or data.get("id")
    if not prebook_id:
        raise HotelPrebookError(
            "LiteAPI pre-book response did not contain a prebookId."
        )
    return str(prebook_id)


# ---------------------------------------------------------------------------
# Error extraction
# ---------------------------------------------------------------------------

def _extract_error(response: requests.Response) -> str:
    """Best-effort human-readable error from a LiteAPI response."""
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            for key in ("description", "message", "error"):
                if err.get(key):
                    code = err.get("code")
                    detail = str(err[key])
                    return f"{code}: {detail}" if code else detail
        message = (
            body.get("message")
            or body.get("error")
            or body.get("errorMessage")
            or body.get("detail")
        )
        if message:
            return str(message)
        if body.get("errors"):
            import json
            return json.dumps(body["errors"])
    return response.text or f"HTTP {response.status_code}"
