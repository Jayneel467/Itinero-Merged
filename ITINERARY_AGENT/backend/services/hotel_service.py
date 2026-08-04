"""
Hotel Service — LiteAPI integration (single source of truth).

Consolidated module for the LiteAPI hotel integration, merging code that
previously lived in three places:

  * `realtime_hotel_search.py`  — city-based rates search
  * `backend/agents/hotel_agent.py` — HotelAgent (typed search / rank / pre-book)
  * `backend/services/liteapi_hotel.py` — pre-booking + shared LiteAPI helpers

Public API is preserved so callers only need import changes:
    HotelAgent                 — typed search / rank / pre-book agent
    search_hotels              — flat hotel search (cheapest rate per hotel)
    search_hotels_with_offers  — grouped search with every room offer
    prebook_hotel_room         — LiteAPI pre-booking
"""

from __future__ import annotations

import json
import math
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Dict, List, Optional

import requests

from backend.config import settings
from backend.models.state import (
    Hotel,
    HotelPrebook,
    HotelSearchParams,
    HotelWithOffers,
    RankingCriteria,
    RoomOffer,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RATES_URL   = "https://api.liteapi.travel/v3.0/hotels/rates"
PREBOOK_URL = "https://book.liteapi.travel/v3.0/rates/prebook"
HOTEL_DATA_URL = "https://api.liteapi.travel/v3.0/data/hotel"

DEFAULT_CURRENCY    = "INR"
DEFAULT_NATIONALITY = "IN"


class HotelPrebookError(RuntimeError):
    """Raised when a LiteAPI hotel call fails."""

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
    """Return the configured LiteAPI key (settings first, env fallback)."""
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
            return json.dumps(body["errors"])
    return response.text or f"HTTP {response.status_code}"


def _post_json(
    url: str,
    payload: Dict[str, Any],
    timeout: int = 60,
) -> Dict[str, Any]:
    """
    POST a JSON payload to LiteAPI and return the decoded response body.

    Raises HotelPrebookError on network errors, non-200 responses, or
    invalid JSON.
    """
    try:
        response = requests.post(
            url,
            json=payload,
            headers=_headers(),
            timeout=timeout,
        )
    except requests.RequestException as exc:
        raise HotelPrebookError(
            f"Network error while calling LiteAPI: {exc}"
        ) from exc

    if response.status_code != 200:
        detail = _extract_error(response)
        raise HotelPrebookError(
            f"LiteAPI request failed: {detail}",
            status_code=response.status_code,
            detail=detail,
        )

    try:
        return response.json()
    except ValueError as exc:
        raise HotelPrebookError(
            "LiteAPI returned an invalid JSON response."
        ) from exc


def _get_json(
    url: str,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = 15,
) -> Dict[str, Any]:
    """
    GET a URL from LiteAPI and return the decoded JSON body.

    Unlike `_post_json`, this is best-effort: network failures, non-200
    responses and invalid JSON all return an empty dict (used for optional
    enrichment data such as hotel images).
    """
    try:
        response = requests.get(
            url,
            params=params,
            headers=_headers(),
            timeout=timeout,
        )
    except requests.RequestException:
        return {}
    if response.status_code != 200:
        return {}
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


# ---------------------------------------------------------------------------
# Hotel details (images + "Details More" data)
# ---------------------------------------------------------------------------

def fetch_hotel_details(
    hotel_id: str,
    timeout: int = 15,
) -> Dict[str, Any]:
    """
    Fetch the full hotel detail payload from LiteAPI `/v3.0/data/hotel`.

    Returns a normalized dict (hotelImages, hotelDescription,
    hotelFacilities, hotelImportantInformation, checkinCheckoutTimes,
    main_photo, rooms[]) or {} when the hotel data cannot be retrieved.
    """
    if not hotel_id:
        return {}
    body = _get_json(HOTEL_DATA_URL, params={"hotelId": hotel_id}, timeout=timeout)
    if not body:
        return {}
    data = body.get("data")
    if not isinstance(data, dict):
        return {}
    return {
        "hotelImages":           data.get("hotelImages") or [],
        "hotelDescription":      data.get("hotelDescription") or "",
        "hotelFacilities":       data.get("hotelFacilities") or [],
        "hotelImportantInformation": data.get("hotelImportantInformation") or "",
        "checkinCheckoutTimes":  data.get("checkinCheckoutTimes"),
        "main_photo":            data.get("main_photo") or "",
        "rooms":                 data.get("rooms") or [],
    }


def _fetch_all_hotel_details(hotel_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Best-effort parallel fetch of hotel details for a list of hotel ids.

    Returns {hotel_id: detail}. Hotels whose detail call fails are simply
    omitted — callers keep whatever data they already have.
    """
    out: Dict[str, Dict[str, Any]] = {}
    if not hotel_ids:
        return out
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = pool.map(lambda hid: (hid, fetch_hotel_details(hid)), hotel_ids)
    for hid, detail in results:
        if detail:
            out[hid] = detail
    return out


def _hotel_detail_fields(detail: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize hotel-level detail data into Hotel model field names."""
    images = [
        img.get("url") or img.get("urlHd")
        for img in detail.get("hotelImages", [])
        if img.get("url") or img.get("urlHd")
    ]
    if not images and detail.get("main_photo"):
        images = [detail["main_photo"]]
    return {
        "hotel_images":            images,
        "hotel_description":       detail.get("hotelDescription") or "",
        "hotel_facilities":        detail.get("hotelFacilities") or [],
        "important_information":   detail.get("hotelImportantInformation") or "",
        "checkin_checkout_times":  detail.get("checkinCheckoutTimes"),
    }


def _room_detail_fields(room: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a room-detail entry into RoomOffer model field names."""
    photos = room.get("photos") or []
    images = [
        p.get("url") or p.get("hd_url")
        for p in photos
        if p.get("url") or p.get("hd_url")
    ]
    bed_types = []
    for b in (room.get("bedTypes") or []):
        qty = int(b.get("quantity") or 1)
        name = (b.get("bedType") or "").strip()
        if not name:
            continue
        bed_types.append(f"{qty} x {name}" if qty > 1 else name)

    size = room.get("roomSizeSquare")
    unit = room.get("roomSizeUnit") or ""
    return {
        "room_images":      images,
        "room_description": room.get("description") or "",
        "room_size":        f"{size}{unit}".strip() if size else "",
        "bed_types":        bed_types,
        "room_amenities":   [
            a.get("name") for a in (room.get("roomAmenities") or [])
            if a.get("name")
        ],
        "room_views":       [
            v.get("view") for v in (room.get("views") or [])
            if v.get("view")
        ],
        "max_occupancy":    int(room.get("maxOccupancy") or 0),
    }


def enrich_hotel_with_details(
    hotel: "Hotel",
    detail: Dict[str, Any],
) -> "Hotel":
    """Copy hotel-level image/detail fields onto a Hotel model (best-effort)."""
    if not detail:
        return hotel
    update = {
        key: val
        for key, val in _hotel_detail_fields(detail).items()
        if val not in (None, [], "")
    }
    if not update:
        return hotel
    return hotel.model_copy(update=update)


def enrich_room_offers_with_details(
    offers: List["RoomOffer"],
    detail: Dict[str, Any],
) -> List["RoomOffer"]:
    """Copy per-room images/details onto room offers (matched by mappedRoomId)."""
    if not offers or not detail:
        return offers
    rooms_by_id: Dict[int, Dict[str, Any]] = {}
    for room in detail.get("rooms", []):
        rid = room.get("id")
        if rid is not None:
            rooms_by_id[int(rid)] = room
    if not rooms_by_id:
        return offers

    enriched: List["RoomOffer"] = []
    for offer in offers:
        room = rooms_by_id.get(int(offer.room_id)) if offer.room_id is not None else None
        if not room:
            enriched.append(offer)
            continue
        update = {
            key: val
            for key, val in _room_detail_fields(room).items()
            if val not in (None, [], "")
        }
        enriched.append(offer.model_copy(update=update) if update else offer)
    return enriched


# ---------------------------------------------------------------------------
# Occupancy & guest helpers
# ---------------------------------------------------------------------------

def create_occupancies(
    adults: int,
    children_ages: Optional[List[int]] = None,
    rooms: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Build the LiteAPI `occupancies` array.

    - adults        : total number of adults across all rooms
    - children_ages : age of every child, e.g. [5, 8]
    - rooms         : number of rooms; defaults to ceil(adults / 2)
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
# City-based rates search (shared request + parsing helpers)
# ---------------------------------------------------------------------------

def _search_city_rates(
    city_name: str,
    country_code: str,
    checkin: str,
    checkout: str,
    adults: int,
    children_ages: Optional[List[int]],
    currency: str,
    guest_nationality: str,
    max_rates_per_hotel: int,
    timeout: int,
) -> Dict[str, Any]:
    """POST a city-based rates search to LiteAPI and return the body."""
    payload = {
        "cityName": city_name,
        "countryCode": country_code,
        "checkin": checkin,
        "checkout": checkout,
        "currency": currency,
        "guestNationality": guest_nationality,
        "occupancies": [
            {"adults": adults, "children": children_ages or []}
        ],
        "includeHotelData": True,
        "roomMapping": True,
        "maxRatesPerHotel": max_rates_per_hotel,
        "timeout": timeout,
    }
    return _post_json(RATES_URL, payload, timeout=60)


def _parse_offer(room: Dict[str, Any], rate: Dict[str, Any]) -> Dict[str, Any]:
    """Extract a single room offer from a LiteAPI rate entry."""
    retail = rate.get("retailRate", {})
    total = {}
    if retail.get("total"):
        total = retail["total"][0]

    cancellation = rate.get("cancellationPolicies", {})

    return {
        "offer_id": room.get("offerId"),
        "room_name": rate.get("name"),
        "room_id": rate.get("mappedRoomId"),
        "board_name": rate.get("boardName"),
        "price": total.get("amount"),
        "currency": total.get("currency"),
        "refundable": cancellation.get("refundableTag"),
        "cancel_policy": cancellation.get("cancelPolicyInfos", []),
    }


def search_hotels(
    city_name: str,
    country_code: str,
    checkin: str,
    checkout: str,
    adults: int = 2,
    children_ages: List[int] | None = None,
    currency: str = "INR",
    guest_nationality: str = "IN",
    max_rates_per_hotel: int = 1,
    timeout: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search hotels via LiteAPI, keeping only the cheapest single rate per hotel.
    """
    result = _search_city_rates(
        city_name=city_name,
        country_code=country_code,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        children_ages=children_ages,
        currency=currency,
        guest_nationality=guest_nationality,
        max_rates_per_hotel=max_rates_per_hotel,
        timeout=timeout,
    )

    hotel_lookup = {
        h["id"]: h
        for h in result.get("hotels", [])
    }

    hotels = []

    for item in result.get("data", []):
        hotel = hotel_lookup.get(item["hotelId"], {})

        room_types = item.get("roomTypes", [])
        if not room_types:
            continue

        room = room_types[0]
        rates = room.get("rates", [])
        if not rates:
            continue

        offer = _parse_offer(room, rates[0])
        hotels.append({
            "hotel_id": item.get("hotelId"),
            "offer_id": offer["offer_id"],
            "hotel_name": hotel.get("name"),
            "rating": hotel.get("rating"),
            "address": hotel.get("address"),
            "main_photo": hotel.get("main_photo"),
            "room_name": offer["room_name"],
            "board_name": offer["board_name"],
            "price": offer["price"],
            "currency": offer["currency"],
            "refundable": offer["refundable"],
            "cancel_policy": offer["cancel_policy"],
        })

    return hotels


def search_hotels_with_offers(
    city_name: str,
    country_code: str,
    checkin: str,
    checkout: str,
    adults: int = 2,
    children_ages: List[int] | None = None,
    currency: str = "INR",
    guest_nationality: str = "IN",
    max_rates_per_hotel: int = 10,
    timeout: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search hotels via LiteAPI and return EVERY bookable room offer per hotel.

    Returns one entry per hotel:

        [{
          "hotel_id": ..., "hotel_name": ..., "rating": ..., "address": ...,
          "main_photo": ...,
          "offers": [
            {"offer_id", "room_name", "board_name", "price", "currency",
             "refundable", "cancel_policy"}
          ]
        }, ...]

    Each offer carries the LiteAPI `offerId` required for pre-booking.
    """
    result = _search_city_rates(
        city_name=city_name,
        country_code=country_code,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        children_ages=children_ages,
        currency=currency,
        guest_nationality=guest_nationality,
        max_rates_per_hotel=max_rates_per_hotel,
        timeout=timeout,
    )

    hotel_lookup = {
        h["id"]: h
        for h in result.get("hotels", [])
    }

    grouped: Dict[str, Dict[str, Any]] = {}

    for item in result.get("data", []):
        hotel_id = item.get("hotelId")
        if not hotel_id:
            continue

        hotel = hotel_lookup.get(hotel_id, {})

        entry = grouped.setdefault(
            hotel_id,
            {
                "hotel_id": hotel_id,
                "hotel_name": hotel.get("name"),
                "rating": hotel.get("rating"),
                "address": hotel.get("address"),
                "main_photo": hotel.get("main_photo"),
                "offers": [],
            },
        )

        for room in item.get("roomTypes", []):
            offer_id = room.get("offerId")
            rates = room.get("rates", [])

            if not offer_id or not rates:
                continue

            entry["offers"].append(_parse_offer(room, rates[0]))

    # ── Enrich hotels & rooms with images / details (best-effort, parallel) ──
    entries = list(grouped.values())
    details = _fetch_all_hotel_details([
        e["hotel_id"] for e in entries if e["offers"]
    ])
    for entry in entries:
        detail = details.get(entry["hotel_id"])
        if not detail:
            continue
        entry.update(_hotel_detail_fields(detail))
        room_by_id = {
            int(r["id"]): r for r in detail.get("rooms", [])
            if r.get("id") is not None
        }
        for offer in entry["offers"]:
            room = room_by_id.get(int(offer.get("room_id"))) \
                if offer.get("room_id") is not None else None
            if room:
                offer.update(_room_detail_fields(room))

    return entries


# ---------------------------------------------------------------------------
# Rates search for specific hotels
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
        "roomMapping": True,
    }

    return _post_json(RATES_URL, payload, timeout=timeout)


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


def search_hotel_offers_for_hotel(
    hotel_id: str,
    check_in: str,
    check_out: str,
    adults: int,
    children_ages: Optional[List[int]] = None,
    currency: str = DEFAULT_CURRENCY,
    guest_nationality: str = DEFAULT_NATIONALITY,
) -> List[RoomOffer]:
    """
    Re-query LiteAPI for a single hotel on the given dates and return every
    bookable room offer as a typed RoomOffer list.

    Used by the hotel-reuse flow: when a hotel is reused for the NEXT night
    the previous night's offer may be date-specific, so we fetch fresh rates.

    Returns [] on failure or when the hotel has no bookable rooms.
    """
    if not hotel_id:
        return []

    try:
        body = search_hotel_rates(
            [hotel_id], check_in, check_out,
            create_occupancies(adults, children_ages),
            currency=currency,
            guest_nationality=guest_nationality,
        )
    except Exception:
        return []

    offers: List[RoomOffer] = []
    for item in body.get("data", []):
        for room in item.get("roomTypes", []):
            offer_id = room.get("offerId")
            rates = room.get("rates", [])
            if not offer_id or not rates:
                continue
            parsed = _parse_offer(room, rates[0])
            offers.append(RoomOffer(
                offer_id        = str(parsed.get("offer_id") or ""),
                room_type       = parsed.get("room_name") or "",
                board_name      = parsed.get("board_name") or "",
                price_per_night = float(parsed.get("price") or 0.0),
                total_price     = float(parsed.get("price") or 0.0),
                currency        = parsed.get("currency") or currency,
                refundable      = parsed.get("refundable"),
                cancel_policy   = parsed.get("cancel_policy"),
                room_id         = parsed.get("room_id"),
            ))
    return offers


# ---------------------------------------------------------------------------
# Pre-book
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

    body = _post_json(PREBOOK_URL, payload, timeout=60)

    data = body.get("data") or {}
    prebook_id = data.get("prebookId") or data.get("id")
    if not prebook_id:
        raise HotelPrebookError(
            "LiteAPI pre-book response did not contain a prebookId."
        )
    return str(prebook_id)


# ---------------------------------------------------------------------------
# HotelAgent class
# ---------------------------------------------------------------------------

class HotelAgent:
    """
    Hotel Agent backed by LiteAPI.

    All public methods return typed Pydantic objects.
    """

    def __init__(self) -> None:
        pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def search_hotels(self, params: HotelSearchParams) -> List[Hotel]:
        """Return available hotels matching *params*, unranked."""
        raw = self._fetch_raw_hotels(params)
        return self._apply_filters(raw, params)

    def search_hotels_with_offers(self, params: HotelSearchParams) -> List[HotelWithOffers]:
        """
        Return hotels matching *params* together with every bookable room
        offer (offerId, room type, price) for the given stay dates.
        """
        nights = self._calc_nights(params.check_in, params.check_out)
        raw = search_hotels_with_offers(
            city_name=params.destination,
            country_code="IN",
            checkin=params.check_in,
            checkout=params.check_out,
            adults=params.num_guests,
        )

        results: List[HotelWithOffers] = []
        for entry in raw:
            offers: List[RoomOffer] = []
            for off in entry.get("offers", []):
                price = float(off.get("price") or 0.0)
                offers.append(RoomOffer(
                    offer_id        = str(off.get("offer_id") or ""),
                    room_type       = off.get("room_name") or "",
                    board_name      = off.get("board_name") or "",
                    price_per_night = round(price / nights, 2) if nights else price,
                    total_price     = round(price, 2),
                    currency        = off.get("currency") or "INR",
                    refundable      = off.get("refundable"),
                    cancel_policy   = off.get("cancel_policy"),
                    room_id         = off.get("room_id"),
                    room_images     = off.get("room_images") or [],
                    room_description= off.get("room_description") or "",
                    room_size       = off.get("room_size") or "",
                    bed_types       = off.get("bed_types") or [],
                    room_amenities  = off.get("room_amenities") or [],
                    room_views      = off.get("room_views") or [],
                    max_occupancy   = int(off.get("max_occupancy") or 0),
                ))

            best = offers[0] if offers else None
            hotel = Hotel(
                hotel_id                = str(entry.get("hotel_id") or ""),
                name                    = entry.get("hotel_name") or "Hotel",
                rating                  = round(min(float(entry.get("rating") or 0) / 2.0, 5.0), 1),
                address                 = entry.get("address") or "",
                distance_from_center_km = 0.0,
                price_per_night         = best.price_per_night if best else 0.0,
                amenities               = [best.board_name] if best and best.board_name else [],
                room_type               = best.room_type if best else "",
                check_in                = params.check_in,
                check_out               = params.check_out,
                total_price             = best.total_price if best else 0.0,
                image_placeholder       = entry.get("main_photo") or "🏨",
                offer_id                = best.offer_id if best else None,
                board_name              = best.board_name if best else None,
                currency                = best.currency if best else None,
                refundable              = best.refundable if best else None,
                cancel_policy           = best.cancel_policy if best else None,
                hotel_images            = entry.get("hotel_images") or [],
                hotel_description       = entry.get("hotel_description") or "",
                hotel_facilities        = entry.get("hotel_facilities") or [],
                important_information   = entry.get("important_information") or "",
                checkin_checkout_times  = entry.get("checkin_checkout_times"),
            )
            results.append(HotelWithOffers(hotel=hotel, offers=offers))

        if params.max_price_per_night is not None:
            results = [r for r in results if r.hotel.price_per_night <= params.max_price_per_night]
        if params.min_rating is not None:
            results = [r for r in results if r.hotel.rating >= params.min_rating]

        return results

    def search_and_rank(
        self,
        params: HotelSearchParams,
        criteria: RankingCriteria = RankingCriteria.RATING,
    ) -> List[Hotel]:
        """Search, filter, and rank in one call."""
        hotels = self.search_hotels(params)
        return self.rank_hotels(hotels, criteria)

    def rank_hotels(
        self,
        hotels: List[Hotel],
        criteria: RankingCriteria = RankingCriteria.RATING,
    ) -> List[Hotel]:
        """
        Rank hotels by the given criteria.

        ranking_score is normalised to 0-100 (higher = better).
        """
        if not hotels:
            return []

        scored = []

        if criteria == RankingCriteria.PRICE:
            prices = [h.total_price for h in hotels]
            min_p, max_p = min(prices), max(prices)
            span = max_p - min_p or 1
            for h in hotels:
                score = 100 - ((h.total_price - min_p) / span * 100)
                scored.append(h.model_copy(update={"ranking_score": round(score, 1)}))

        elif criteria == RankingCriteria.DISTANCE:
            dists = [h.distance_from_center_km for h in hotels]
            min_d, max_d = min(dists), max(dists)
            span = max_d - min_d or 1
            for h in hotels:
                score = 100 - ((h.distance_from_center_km - min_d) / span * 100)
                scored.append(h.model_copy(update={"ranking_score": round(score, 1)}))

        elif criteria == RankingCriteria.RATING:
            for h in hotels:
                score = (h.rating / 5.0) * 100
                scored.append(h.model_copy(update={"ranking_score": round(score, 1)}))

        else:  # BEST_VALUE composite
            prices    = [h.total_price                for h in hotels]
            dists     = [h.distance_from_center_km   for h in hotels]
            min_p, max_p = min(prices), max(prices)
            min_d, max_d = min(dists), max(dists)
            p_span = max_p - min_p or 1
            d_span = max_d - min_d or 1
            for h in hotels:
                rating_score    = (h.rating / 5.0) * 100
                price_score     = 100 - ((h.total_price - min_p) / p_span * 100)
                distance_score  = 100 - ((h.distance_from_center_km - min_d) / d_span * 100)
                amenity_bonus   = min(len(h.amenities) * 2, 10)
                score = (rating_score * 0.4 + price_score * 0.35
                         + distance_score * 0.2 + amenity_bonus)
                scored.append(h.model_copy(update={"ranking_score": round(min(score, 100), 1)}))

        return sorted(scored, key=lambda h: h.ranking_score, reverse=True)

    def prebook_hotel(
        self,
        hotel: Hotel,
        check_in: str,
        check_out: str,
        num_guests: int,
        day_number: Optional[int] = None,
    ) -> HotelPrebook:
        """
        Pre-book a hotel room and return a booking confirmation.
        """
        prebook_id  = f"HTL-{uuid.uuid4().hex[:8].upper()}"
        nights      = self._calc_nights(check_in, check_out)
        total       = round(hotel.price_per_night * nights, 2)
        return HotelPrebook(
            prebook_id   = prebook_id,
            hotel        = hotel,
            check_in     = check_in,
            check_out    = check_out,
            guests       = num_guests,
            total_charged= total,
            status       = "confirmed",
            day_number   = day_number,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_raw_hotels(self, params: HotelSearchParams) -> List[Hotel]:
        nights = self._calc_nights(params.check_in, params.check_out)

        raw_hotels = search_hotels(
            city_name=params.destination,
            country_code="IN",
            checkin=params.check_in,
            checkout=params.check_out,
            adults=params.num_guests,
        )

        hotels: List[Hotel] = []
        for raw in raw_hotels:
            rating = (raw["rating"] or 0) / 2.0
            total_price = raw["price"] or 0.0
            price_per_night = round(total_price / nights, 2) if nights else total_price

            hotels.append(
                Hotel(
                    hotel_id                = raw["hotel_id"],
                    name                    = raw["hotel_name"],
                    rating                  = round(min(rating, 5.0), 1),
                    address                 = raw["address"] or "",
                    distance_from_center_km = 0.0,
                    price_per_night         = price_per_night,
                    amenities               = [raw["board_name"]] if raw["board_name"] else [],
                    room_type               = raw["room_name"] or "",
                    check_in                = params.check_in,
                    check_out               = params.check_out,
                    total_price             = total_price,
                    image_placeholder       = raw.get("main_photo") or "🏨",
                )
            )

        return hotels

    def _apply_filters(
        self,
        hotels: List[Hotel],
        params: HotelSearchParams,
    ) -> List[Hotel]:
        """Filter by max_price_per_night and min_rating if provided."""
        result = hotels

        if params.max_price_per_night is not None:
            result = [h for h in result if h.price_per_night <= params.max_price_per_night]

        if params.min_rating is not None:
            result = [h for h in result if h.rating >= params.min_rating]

        return result

    @staticmethod
    def _calc_nights(check_in: str, check_out: str) -> int:
        """Return the number of nights between two ISO date strings."""
        try:
            d1 = date.fromisoformat(check_in)
            d2 = date.fromisoformat(check_out)
            return max(1, (d2 - d1).days)
        except ValueError:
            return 1