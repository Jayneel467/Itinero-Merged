"""Structured LiteAPI hotel search for manual Hotels page (no sample inventory)."""

from __future__ import annotations

import asyncio
import os
import traceback
from datetime import datetime
from typing import Any

import httpx

_LITEAPI_BASE = "https://api.liteapi.travel/v3.0"
_HOTEL_LIMIT = 24
_RATE_CONCURRENCY = 5


def _api_key() -> str:
    return (
        os.getenv("API_KEY")
        or os.getenv("LITEAPI_API_KEY")
        or os.getenv("LITEAPI_KEY")
        or ""
    ).strip()


def _nights(check_in: str, check_out: str) -> int:
    try:
        d0 = datetime.strptime(check_in[:10], "%Y-%m-%d").date()
        d1 = datetime.strptime(check_out[:10], "%Y-%m-%d").date()
        n = (d1 - d0).days
        return max(1, n)
    except Exception:
        return 1


def _rating_text(score: float | None) -> str:
    if score is None:
        return "Unrated"
    if score >= 9:
        return "Excellent"
    if score >= 8:
        return "Very good"
    if score >= 7:
        return "Good"
    if score >= 6:
        return "Pleasant"
    return "Fair"


async def _geocode_city(city: str) -> dict[str, Any] | None:
    query = (city or "").strip()
    if not query:
        return None
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": query, "format": "json", "limit": 1}
    headers = {"User-Agent": "ItineroHotelSearch/1.0"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params=params, headers=headers)
        r.raise_for_status()
        data = r.json()
    if not data:
        return None
    return {
        "latitude": float(data[0]["lat"]),
        "longitude": float(data[0]["lon"]),
        "display_name": data[0].get("display_name") or query,
    }


async def _fetch_hotels(lat: float, lon: float, *, radius_m: int = 5000) -> list[dict[str, Any]]:
    key = _api_key()
    if not key:
        raise RuntimeError("LiteAPI key missing")
    url = f"{_LITEAPI_BASE}/data/hotels"
    headers = {"Accept": "application/json", "X-API-Key": key}
    params = {"latitude": lat, "longitude": lon, "radius": radius_m}
    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.get(url, headers=headers, params=params)
        r.raise_for_status()
        payload = r.json()
    return list(payload.get("data") or [])


def _min_rate(rate_payload: dict[str, Any] | None) -> tuple[float | None, str, str | None]:
    """Return (total_amount, currency, board_name) for cheapest room offer."""
    if not rate_payload or not isinstance(rate_payload, dict):
        return None, "INR", None
    data = rate_payload.get("data") or []
    best: float | None = None
    currency = "INR"
    board: str | None = None
    for hotel in data:
        for room in hotel.get("roomTypes") or []:
            offer = room.get("offerRetailRate") or {}
            try:
                amount = float(offer.get("amount"))
            except (TypeError, ValueError):
                continue
            if amount <= 0:
                continue
            if best is None or amount < best:
                best = amount
                currency = str(offer.get("currency") or "INR")
                rates = room.get("rates") or []
                if rates:
                    board = rates[0].get("boardName") or rates[0].get("name")
    return best, currency, board


async def _fetch_rate(
    client: httpx.AsyncClient,
    *,
    hotel_id: str,
    check_in: str,
    check_out: str,
    guests: int,
    rooms: int,
    currency: str,
    nationality: str,
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    key = _api_key()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": key,
    }
    adults = max(1, guests)
    rooms_n = max(1, rooms)
    base = adults // rooms_n
    rem = adults % rooms_n
    occupancies = []
    for i in range(rooms_n):
        occ_adults = base + (1 if i < rem else 0)
        occupancies.append({"adults": max(1, occ_adults)})

    payload = {
        "hotelIds": [hotel_id],
        "checkin": check_in[:10],
        "checkout": check_out[:10],
        "occupancies": occupancies,
        "currency": currency,
        "guestNationality": nationality,
    }
    async with sem:
        try:
            r = await client.post(f"{_LITEAPI_BASE}/hotels/rates", headers=headers, json=payload)
            if r.status_code != 200:
                return None
            return r.json()
        except Exception:
            return None


def _hotel_to_ui(
    hotel: dict[str, Any],
    *,
    nights: int,
    total_price: float | None,
    currency: str,
    board: str | None,
) -> dict[str, Any]:
    hid = str(hotel.get("id") or "")
    name = str(hotel.get("name") or "Hotel")
    address = str(hotel.get("address") or hotel.get("city") or "")
    rating_raw = hotel.get("rating")
    try:
        rating = float(rating_raw) if rating_raw not in (None, "") else None
    except (TypeError, ValueError):
        rating = None
    try:
        stars = int(float(hotel.get("stars") or 0))
    except (TypeError, ValueError):
        stars = 0

    image = hotel.get("main_photo") or hotel.get("thumbnail") or ""
    images = [image] if image else []
    for img in hotel.get("hotelImages") or []:
        url = img.get("url") if isinstance(img, dict) else None
        if url and url not in images:
            images.append(url)
            if len(images) >= 5:
                break

    per_night = None
    if total_price is not None and nights > 0:
        per_night = round(total_price / nights, 2)

    tags: list[str] = []
    if stars:
        tags.append(f"{stars}★")
    if board:
        tags.append(str(board))
    if hotel.get("freeCancellation"):
        tags.append("Free cancellation")

    return {
        "id": hid,
        "name": name,
        "location": address or "Nearby",
        "distance": f"{stars}★" if stars else "Hotel",
        "rating": rating if rating is not None else (float(stars) if stars else 0),
        "ratingText": _rating_text(rating if rating is not None else None),
        "reviewCount": int(hotel.get("reviewCount") or hotel.get("reviewsCount") or 0),
        "image": image,
        "images": images or ([image] if image else []),
        "pricePerNight": per_night if per_night is not None else 0,
        "totalPrice": total_price if total_price is not None else 0,
        "currency": currency,
        "tags": tags or ["Live fare"],
        "stars": stars,
        "board": board,
        "has_price": total_price is not None and total_price > 0,
        "description": (hotel.get("hotelDescription") or "")[:280],
    }


async def structured_hotel_search(
    *,
    city: str,
    check_in: str,
    check_out: str,
    guests: int = 2,
    rooms: int = 1,
    currency: str = "INR",
    nationality: str = "IN",
) -> dict[str, Any]:
    """Live LiteAPI hotel search + rates for the Hotels page."""
    city_s = (city or "").strip()
    if not city_s:
        return {
            "hotels": [],
            "mode": "degraded",
            "message": "Choose a city and dates, then search.",
            "error": "missing_city",
            "route_path": ["start", "manual_booking", "hotel_search", "error"],
            "guests": guests,
            "rooms": rooms,
        }
    if not _api_key():
        return {
            "hotels": [],
            "mode": "degraded",
            "message": "LiteAPI key is missing — hotel search cannot run.",
            "error": "missing_liteapi_key",
            "route_path": ["start", "manual_booking", "hotel_search", "error"],
            "guests": guests,
            "rooms": rooms,
        }

    try:
        geo = await _geocode_city(city_s)
        if not geo:
            return {
                "hotels": [],
                "mode": "degraded",
                "message": f"Could not locate “{city_s}”. Try a clearer city name.",
                "error": "geocode_failed",
                "route_path": ["start", "manual_booking", "hotel_search", "error"],
                "guests": guests,
                "rooms": rooms,
            }

        raw_hotels = await _fetch_hotels(geo["latitude"], geo["longitude"])
        if not raw_hotels:
            return {
                "hotels": [],
                "mode": "live",
                "message": f"No LiteAPI hotels found near {city_s}.",
                "error": None,
                "route_path": ["start", "manual_booking", "hotel_search", "liteapi"],
                "guests": guests,
                "rooms": rooms,
                "geo": geo,
            }

        nights = _nights(check_in, check_out)
        subset = raw_hotels[:_HOTEL_LIMIT]
        sem = asyncio.Semaphore(_RATE_CONCURRENCY)
        async with httpx.AsyncClient(timeout=35.0) as client:
            rate_payloads = await asyncio.gather(
                *[
                    _fetch_rate(
                        client,
                        hotel_id=str(h.get("id") or ""),
                        check_in=check_in,
                        check_out=check_out,
                        guests=guests,
                        rooms=rooms,
                        currency=currency,
                        nationality=nationality,
                        sem=sem,
                    )
                    for h in subset
                    if h.get("id")
                ]
            )

        ui: list[dict[str, Any]] = []
        priced = 0
        for hotel, rates in zip(subset, rate_payloads):
            total, cur, board = _min_rate(rates)
            card = _hotel_to_ui(
                hotel,
                nights=nights,
                total_price=total,
                currency=cur,
                board=board,
            )
            if card.get("has_price"):
                priced += 1
            ui.append(card)

        ui.sort(key=lambda h: (0 if h.get("has_price") else 1, h.get("totalPrice") or 1e18))

        return {
            "hotels": ui,
            "mode": "live",
            "message": (
                f"Found {len(ui)} live hotels near {city_s}"
                + (f" ({priced} with rates)." if priced else " (rates unavailable for these dates).")
            ),
            "error": None,
            "route_path": ["start", "manual_booking", "hotel_search", "liteapi"],
            "guests": guests,
            "rooms": rooms,
            "nights": nights,
            "geo": {
                "display_name": geo.get("display_name"),
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
            },
            "total_catalog": len(raw_hotels),
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "hotels": [],
            "mode": "degraded",
            "message": (
                f"Live hotel search failed ({type(exc).__name__}). "
                "Check LiteAPI / API_KEY — no sample hotels are shown."
            ),
            "error": f"{type(exc).__name__}: {exc}",
            "route_path": ["start", "manual_booking", "hotel_search", "error"],
            "guests": guests,
            "rooms": rooms,
        }
