"""Structured LiteAPI hotel search for manual Hotels page (no sample inventory)."""

from __future__ import annotations

import asyncio
import os
import re
import traceback
import uuid
from datetime import datetime
from typing import Any

import httpx

_LITEAPI_BASE = "https://api.liteapi.travel/v3.0"
_LITEAPI_BOOK_BASE = "https://book.liteapi.travel/v3.0"
_HOTEL_PAGE_SIZE_DEFAULT = 40
_HOTEL_PAGE_SIZE_MAX = 50
# LiteAPI /data/hotels defaults to 200 — raise so Mumbai/etc. aren't capped early.
_HOTEL_CATALOG_LIMIT = 1000
_HOTEL_SEARCH_RADIUS_M = 20000  # 20km metro coverage (min LiteAPI radius is 1000m)
_RATE_CONCURRENCY = 8
_DETAIL_CONCURRENCY = 10
# Cap gallery photos sent to the search card (full gallery still on detail page).
_CARD_IMAGE_LIMIT = 12

# Airbnb-style stays for /homes (LiteAPI hotelTypeIds).
_HOMES_HOTEL_TYPE_IDS: frozenset[int] = frozenset(
    {
        201,  # Apartments
        207,  # Residences
        208,  # Bed and breakfasts
        210,  # Farm stays
        212,  # Holiday parks
        213,  # Villas
        214,  # Campsites
        215,  # Boats
        216,  # Guest houses
        219,  # Aparthotels
        220,  # Holiday homes
        221,  # Lodges
        222,  # Homestays
        223,  # Country houses
        224,  # Luxury tents
        228,  # Chalets
        229,  # Condos
        230,  # Cottages
        232,  # Gites
        235,  # Student accommodation
        243,  # Tree house
        247,  # Pension
        250,  # Private vacation home
        251,  # Pousada
        252,  # Country house
        254,  # Campsite
        257,  # Cabin
        258,  # Holiday park
        262,  # Affittacamere
        265,  # Houseboat
        268,  # Ranch
        271,  # Agritourism
        272,  # Mobile home
    }
)
# Never show these on Villas & Homestays.
_EXCLUDED_FROM_HOMES_TYPE_IDS: frozenset[int] = frozenset(
    {
        203,  # Hostels
        204,  # Hotels
        205,  # Motels
        206,  # Resorts
        218,  # Inns
        225,  # Capsule hotels
        226,  # Love hotels
        231,  # Economy hotels
        233,  # Health resorts
        234,  # Cruises
        264,  # Hostel/Backpacker
        274,  # All-inclusive
        276,  # Castle
        278,  # Palace
    }
)
_HOMES_TYPE_NAMES = frozenset(
    {
        "apartment",
        "apartments",
        "villa",
        "villas",
        "holiday home",
        "holiday homes",
        "homestay",
        "homestays",
        "private vacation home",
        "cabin",
        "cabins",
        "chalet",
        "chalets",
        "cottage",
        "cottages",
        "condo",
        "condos",
        "guest house",
        "guest houses",
        "guesthouse",
        "bed and breakfast",
        "bed & breakfast",
        "aparthotel",
        "aparthotels",
        "farm stay",
        "farm stays",
        "lodge",
        "lodges",
        "residence",
        "residences",
        "gite",
        "gites",
        "houseboat",
        "ranch",
        "mobile home",
        "tree house",
        "country house",
        "country houses",
        "holiday park",
        "holiday parks",
        "campsite",
        "campsites",
    }
)
_CLASSIC_HOTEL_NAME_RE = re.compile(
    r"\b(hotel|motel|resort|hilton|marriott|hyatt|radisson|sheraton|westin|"
    r"holiday\s*inn|best\s*western|wyndham|ihg|novotel|mercure|ibis|"
    r"four\s*seasons|ritz|carlton|intercontinental)\b",
    re.I,
)

# Town / campus nicknames → precise coords (when short queries confuse Nominatim).
_PLACE_GEO_ALIASES: dict[str, dict[str, Any]] = {
    "state college": {
        "latitude": 40.7934,
        "longitude": -77.8600,
        "display_name": "State College, Centre County, Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
    "state college pa": {
        "latitude": 40.7934,
        "longitude": -77.8600,
        "display_name": "State College, Centre County, Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
    "state college pennsylvania": {
        "latitude": 40.7934,
        "longitude": -77.8600,
        "display_name": "State College, Centre County, Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
    "penn state": {
        "latitude": 40.7982,
        "longitude": -77.8599,
        "display_name": "University Park / Penn State, State College, Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
    "university park": {
        "latitude": 40.7982,
        "longitude": -77.8599,
        "display_name": "University Park, Centre County, Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
    "university park pa": {
        "latitude": 40.7982,
        "longitude": -77.8599,
        "display_name": "University Park, Centre County, Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
    "sce": {
        "latitude": 40.8493,
        "longitude": -77.8487,
        "display_name": "State College (University Park Airport / SCE), Pennsylvania, United States",
        "city": "State College",
        "region": "Pennsylvania",
        "country": "US",
    },
}


async def _fetch_hotel_detail(
    client: httpx.AsyncClient,
    *,
    hotel_id: str,
    sem: asyncio.Semaphore,
) -> dict[str, Any] | None:
    """GET /data/hotel — full property photos (hotelImages). List endpoint lacks these."""
    hid = str(hotel_id or "").strip()
    if not hid:
        return None
    key = _api_key()
    headers = {"Accept": "application/json", "X-API-Key": key}
    async with sem:
        try:
            r = await client.get(
                f"{_LITEAPI_BASE}/data/hotel",
                headers=headers,
                params={"hotelId": hid},
            )
            if r.status_code != 200:
                return None
            body = r.json() or {}
            meta = body.get("data") or body
            if isinstance(meta, list):
                meta = meta[0] if meta else None
            return meta if isinstance(meta, dict) else None
        except Exception:
            return None


def _merge_hotel_list_with_detail(
    listed: dict[str, Any],
    detail: dict[str, Any] | None,
) -> dict[str, Any]:
    """Overlay detail gallery/metadata onto the list row (list wins on id/name)."""
    if not detail:
        return listed
    merged = dict(listed)
    # Prefer full LiteAPI gallery from detail
    for key in (
        "hotelImages",
        "images",
        "main_photo",
        "mainPhoto",
        "thumbnail",
        "thumbnailUrl",
        "hotelDescription",
        "description",
        "hotelFacilities",
        "facilities",
        "hotelImportantInformation",
        "checkinCheckoutTimes",
        "rating",
        "reviewCount",
        "stars",
        "address",
        "city",
        "country",
        "zip",
        "latitude",
        "longitude",
        "location",
        "rooms",
    ):
        val = detail.get(key)
        if val not in (None, "", [], {}):
            merged[key] = val
    return merged


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


def _normalize_place_key(q: str) -> str:
    return re.sub(r"\s+", " ", (q or "").strip().lower())


def _pick_nominatim_row(rows: list[dict[str, Any]], query: str) -> dict[str, Any] | None:
    """Prefer city/town/village matches near the typed place name."""
    if not rows:
        return None
    q = _normalize_place_key(query)
    q_tokens = [t for t in re.split(r"[^a-z0-9]+", q) if t]
    preferred_types = {
        "city",
        "town",
        "village",
        "municipality",
        "suburb",
        "neighbourhood",
        "neighborhood",
        "hamlet",
        "administrative",
    }
    preferred_classes = {"place", "boundary"}

    def score(row: dict[str, Any]) -> tuple:
        display = _normalize_place_key(str(row.get("display_name") or ""))
        rtype = str(row.get("type") or "").lower()
        rclass = str(row.get("class") or "").lower()
        name = _normalize_place_key(str(row.get("name") or display.split(",")[0]))
        exact = 2 if name == q or display.startswith(q + ",") else (1 if q in display else 0)
        token_hit = sum(1 for t in q_tokens if t in display)
        type_bonus = 2 if rtype in preferred_types else 0
        class_bonus = 1 if rclass in preferred_classes else 0
        try:
            importance = float(row.get("importance") or 0)
        except (TypeError, ValueError):
            importance = 0.0
        return (exact, token_hit, type_bonus, class_bonus, importance)

    ranked = sorted(rows, key=score, reverse=True)
    return ranked[0] if ranked else None


async def _geocode_city(
    city: str,
    *,
    city_code: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict[str, Any] | None:
    """Resolve a town/city (or airport code) to lat/lng — prefer exact nearby place."""
    if latitude is not None and longitude is not None:
        try:
            return {
                "latitude": float(latitude),
                "longitude": float(longitude),
                "display_name": (city or city_code or "Selected place").strip(),
            }
        except (TypeError, ValueError):
            pass

    code = (city_code or "").strip().upper()
    query = (city or "").strip()
    if not code and re.fullmatch(r"[A-Za-z]{3}", query or ""):
        code = query.upper()
        query = ""

    for key in (
        _normalize_place_key(query),
        _normalize_place_key(f"{query} {code}" if code else query),
        code.lower() if code else "",
    ):
        if key and key in _PLACE_GEO_ALIASES:
            alias = _PLACE_GEO_ALIASES[key]
            return {
                "latitude": float(alias["latitude"]),
                "longitude": float(alias["longitude"]),
                "display_name": alias.get("display_name") or query or code,
                "city": alias.get("city"),
                "region": alias.get("region"),
                "country": alias.get("country"),
            }

    search_q = query or code
    if not search_q:
        return None

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": search_q,
        "format": "json",
        "limit": 8,
        "addressdetails": 1,
    }
    headers = {"User-Agent": "ItineroHotelSearch/1.0"}
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params=params, headers=headers)
        r.raise_for_status()
        data = r.json()
    if not isinstance(data, list) or not data:
        return None
    row = _pick_nominatim_row(data, search_q) or data[0]
    addr = row.get("address") if isinstance(row.get("address"), dict) else {}
    city_label = (
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("municipality")
        or addr.get("hamlet")
        or (search_q.split(",")[0].strip() if search_q else None)
    )
    return {
        "latitude": float(row["lat"]),
        "longitude": float(row["lon"]),
        "display_name": row.get("display_name") or search_q,
        "city": city_label,
        "region": addr.get("state") or addr.get("region"),
        "country": str(addr.get("country_code") or "").upper() or None,
    }


async def _fetch_hotels(
    lat: float,
    lon: float,
    *,
    radius_m: int = _HOTEL_SEARCH_RADIUS_M,
    hotel_type_ids: list[int] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    key = _api_key()
    if not key:
        raise RuntimeError("LiteAPI key missing")
    url = f"{_LITEAPI_BASE}/data/hotels"
    headers = {"Accept": "application/json", "X-API-Key": key}
    lim = int(limit) if limit is not None else _HOTEL_CATALOG_LIMIT
    lim = max(1, min(lim, _HOTEL_CATALOG_LIMIT))
    params: dict[str, Any] = {
        "latitude": lat,
        "longitude": lon,
        "radius": max(1000, int(radius_m or _HOTEL_SEARCH_RADIUS_M)),
        "limit": lim,
        "offset": 0,
    }
    if hotel_type_ids:
        params["hotelTypeIds"] = ",".join(str(int(i)) for i in hotel_type_ids)
    async with httpx.AsyncClient(timeout=40.0) as client:
        r = await client.get(url, headers=headers, params=params)
        r.raise_for_status()
        payload = r.json()
    return list(payload.get("data") or [])


def _hotel_type_id(hotel: dict[str, Any]) -> int | None:
    for key in ("hotelTypeId", "hotel_type_id", "typeId", "type_id"):
        raw = hotel.get(key)
        if raw is None or raw == "":
            continue
        try:
            return int(raw)
        except (TypeError, ValueError):
            continue
    # Sometimes hotelType is the numeric id
    ht = hotel.get("hotelType") or hotel.get("type")
    if isinstance(ht, (int, float)):
        return int(ht)
    if isinstance(ht, str) and ht.strip().isdigit():
        return int(ht.strip())
    return None


def _hotel_type_name(hotel: dict[str, Any]) -> str:
    for key in ("hotelType", "type", "hotelTypeName", "propertyType"):
        val = hotel.get(key)
        if isinstance(val, str) and val.strip() and not val.strip().isdigit():
            return val.strip().lower()
    return ""


def _is_homes_property(hotel: dict[str, Any]) -> bool:
    """True only for villa/apartment/homestay-style inventory — never classic hotels."""
    tid = _hotel_type_id(hotel)
    if tid is not None and tid in _EXCLUDED_FROM_HOMES_TYPE_IDS:
        return False
    if tid is not None and tid in _HOMES_HOTEL_TYPE_IDS:
        return True
    name = _hotel_type_name(hotel)
    if name and name in _HOMES_TYPE_NAMES:
        return True
    if name and any(
        token in name
        for token in (
            "apartment",
            "villa",
            "homestay",
            "holiday home",
            "cabin",
            "chalet",
            "cottage",
            "condo",
            "guest house",
            "guesthouse",
            "aparthotel",
            "farm stay",
            "country house",
        )
    ):
        prop = str(hotel.get("name") or "")
        if _CLASSIC_HOTEL_NAME_RE.search(prop):
            return False
        return True
    prop = str(hotel.get("name") or "")
    if _CLASSIC_HOTEL_NAME_RE.search(prop):
        return False
    return False


def _normalize_category(category: str | None) -> str:
    c = (category or "").strip().lower()
    if c in {"homes", "home", "villas", "villa", "homestays", "homestay"}:
        return "homes"
    return "hotels"


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


def _occupancies(guests: int, rooms: int) -> list[dict[str, int]]:
    adults = max(1, guests)
    rooms_n = max(1, rooms)
    base = adults // rooms_n
    rem = adults % rooms_n
    out: list[dict[str, int]] = []
    for i in range(rooms_n):
        out.append({"adults": max(1, base + (1 if i < rem else 0))})
    return out


async def _fetch_min_rates(
    client: httpx.AsyncClient,
    *,
    hotel_ids: list[str],
    check_in: str,
    check_out: str,
    guests: int,
    rooms: int,
    currency: str,
    nationality: str,
) -> dict[str, dict[str, Any]]:
    """POST /hotels/min-rates — cheapest price per hotel for listing cards.

    Returns map hotelId → {price, currency, offerId, suggestedSellingPrice}.
    Falls back to empty map on failure (caller can leave cards unpriced).
    """
    ids = [str(h).strip() for h in hotel_ids if str(h or "").strip()]
    if not ids:
        return {}
    key = _api_key()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": key,
    }
    payload = {
        "hotelIds": ids,
        "checkin": check_in[:10],
        "checkout": check_out[:10],
        "occupancies": _occupancies(guests, rooms),
        "currency": currency,
        "guestNationality": nationality,
    }
    try:
        r = await client.post(
            f"{_LITEAPI_BASE}/hotels/min-rates",
            headers=headers,
            json=payload,
            timeout=45.0,
        )
        if r.status_code != 200:
            return {}
        body = r.json() or {}
        rows = body.get("data") if isinstance(body.get("data"), list) else []
        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            hid = str(row.get("hotelId") or row.get("hotel_id") or "").strip()
            if not hid:
                continue
            price = row.get("price")
            if price is None:
                price = row.get("amount") or row.get("total")
            try:
                price_f = float(price) if price is not None else None
            except (TypeError, ValueError):
                price_f = None
            out[hid] = {
                "price": price_f,
                "currency": row.get("currency") or currency,
                "offerId": row.get("offerId") or row.get("offer_id"),
                "suggestedSellingPrice": row.get("suggestedSellingPrice"),
            }
        return out
    except Exception:
        traceback.print_exc()
        return {}


def _first_str(*candidates: Any) -> str | None:
    for value in candidates:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _is_sandbox_app() -> bool:
    env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "sandbox").lower()
    return env in {"sandbox", "development", "dev", "test"}


async def _verify_razorpay_payment(
    *,
    payment_id: str,
    expected_amount: float | None = None,
    expected_currency: str = "INR",
) -> dict[str, Any]:
    """Razorpay removed — always reject."""
    return {
        "ok": False,
        "error": "razorpay_disabled",
        "message": "Card checkout is required. Pay with card on this page.",
    }



def _extract_hotel_prebook_fields(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize LiteAPI hotel prebook payload into a flight-like hold shape."""
    entry = data.get("data") if isinstance(data.get("data"), dict) else data
    if isinstance(data.get("data"), list) and data["data"]:
        entry = data["data"][0] if isinstance(data["data"][0], dict) else entry
    if not isinstance(entry, dict):
        entry = {}
    prebook = entry.get("prebook") if isinstance(entry.get("prebook"), dict) else entry
    payment = (
        prebook.get("payment")
        if isinstance(prebook.get("payment"), dict)
        else entry.get("payment")
        if isinstance(entry.get("payment"), dict)
        else {}
    )
    price = (
        prebook.get("price")
        if prebook.get("price") is not None
        else entry.get("price")
        if entry.get("price") is not None
        else (payment.get("amount") if isinstance(payment, dict) else None)
    )
    currency = (
        prebook.get("currency")
        or entry.get("currency")
        or (payment.get("currency") if isinstance(payment, dict) else None)
        or "INR"
    )
    secret_key = _first_str(
        prebook.get("secretKey"),
        prebook.get("secret_key"),
        prebook.get("clientSecret"),
        entry.get("secretKey"),
        entry.get("clientSecret"),
        payment.get("secretKey") if isinstance(payment, dict) else None,
        payment.get("clientSecret") if isinstance(payment, dict) else None,
    )
    publishable_key = _first_str(
        prebook.get("publishableKey"),
        prebook.get("publishable_key"),
        entry.get("publishableKey"),
        payment.get("publishableKey") if isinstance(payment, dict) else None,
        (os.getenv("STRIPE_PUBLISHABLE_KEY") or "").strip() or None,
    )
    transaction_id = _first_str(
        prebook.get("transactionId"),
        prebook.get("transaction_id"),
        entry.get("transactionId"),
        payment.get("transactionId") if isinstance(payment, dict) else None,
    )
    prebook_id = _first_str(
        prebook.get("prebookId"),
        prebook.get("prebook_id"),
        entry.get("prebookId"),
        entry.get("id"),
    )
    return {
        "success": bool(prebook_id),
        "prebook_id": prebook_id,
        "transaction_id": transaction_id,
        "secret_key": secret_key,
        "publishable_key": publishable_key,
        "price": price,
        "currency": currency,
        "payment_methods": prebook.get("paymentMethodsAvailable")
        or entry.get("paymentMethodsAvailable"),
        "raw": entry,
    }


def _facility_names(raw: Any) -> list[str]:
    """Normalize hotelFacilities / facilities into unique display names.

    Accepts a list of strings/dicts, or a full hotel meta dict.
    """
    out: list[str] = []
    seen: set[str] = set()
    if isinstance(raw, dict):
        sources = [
            raw.get("hotelFacilities"),
            raw.get("facilities"),
            raw.get("amenities"),
            raw.get("hotelAmenities"),
        ]
    else:
        sources = [raw]
    for src in sources:
        for item in src or []:
            if isinstance(item, str):
                name = item.strip()
            elif isinstance(item, dict):
                name = str(
                    item.get("name")
                    or item.get("facility")
                    or item.get("facilityName")
                    or item.get("amenity")
                    or ""
                ).strip()
            else:
                name = ""
            key = name.lower()
            if name and key not in seen:
                seen.add(key)
                out.append(name)
    return out


def _checkin_checkout(meta: dict[str, Any]) -> dict[str, Any] | None:
    raw = meta.get("checkinCheckoutTimes") or meta.get("checkInCheckOutTimes")
    if isinstance(raw, dict) and raw:
        return {
            "checkin": raw.get("checkin") or raw.get("checkIn") or raw.get("check_in"),
            "checkout": raw.get("checkout") or raw.get("checkOut") or raw.get("check_out"),
        }
    return None


def _normalize_image_url(url: Any) -> str:
    u = str(url or "").strip()
    if not u or u.lower() in ("null", "none", "undefined"):
        return ""
    if u.startswith("//"):
        return f"https:{u}"
    if u.startswith("http://"):
        return "https://" + u[len("http://") :]
    return u


def _collect_hotel_images(hotel: dict[str, Any] | None, *, limit: int = 200) -> list[str]:
    """All LiteAPI property photos (main + hotelImages HD + room photos)."""
    meta = hotel or {}
    urls: list[str] = []

    def _add(url: Any) -> None:
        u = _normalize_image_url(url)
        if u and u not in urls and len(urls) < limit:
            urls.append(u)

    _add(meta.get("main_photo"))
    _add(meta.get("mainPhoto"))
    _add(meta.get("thumbnail"))
    _add(meta.get("thumbnailUrl"))
    for u in _room_photo_urls(meta.get("hotelImages") or meta.get("images") or []):
        _add(u)
    for room in meta.get("rooms") or []:
        if not isinstance(room, dict):
            continue
        for u in _room_photo_urls(room.get("photos") or room.get("images") or []):
            _add(u)
    return urls


def _hotel_meta_to_ui(hotel_meta: dict[str, Any], *, currency: str = "INR") -> dict[str, Any]:
    """Full LiteAPI /data/hotel payload → UI hotel object (nothing inventable dropped)."""
    meta = hotel_meta if isinstance(hotel_meta, dict) else {}
    hid = str(meta.get("id") or meta.get("hotelId") or "")
    images = _collect_hotel_images(meta, limit=200)
    image = images[0] if images else (meta.get("main_photo") or meta.get("thumbnail") or "")
    try:
        stars = int(float(meta.get("stars") or 0))
    except (TypeError, ValueError):
        stars = 0
    rating_raw = meta.get("rating")
    try:
        rating = float(rating_raw) if rating_raw not in (None, "") else None
    except (TypeError, ValueError):
        rating = None
    lat, lng = _lat_lng(meta)
    facilities = _facility_names(meta)
    description = _plain_text(
        meta.get("hotelDescription") or meta.get("description") or ""
    )
    important = _plain_text(
        meta.get("hotelImportantInformation")
        or meta.get("importantInformation")
        or ""
    )
    return {
        "id": hid,
        "name": str(meta.get("name") or "Hotel"),
        "location": str(meta.get("address") or meta.get("city") or ""),
        "address": str(meta.get("address") or ""),
        "city": str(meta.get("city") or meta.get("cityName") or ""),
        "country": str(meta.get("country") or meta.get("countryCode") or ""),
        "zip": str(meta.get("zip") or meta.get("postalCode") or ""),
        "area": _area_label(meta),
        "image": image,
        "images": images,
        "stars": stars,
        "rating": rating,
        "ratingText": _rating_text(rating),
        "reviewCount": int(meta.get("reviewCount") or meta.get("reviewsCount") or 0),
        "description": description,
        "importantInformation": important,
        "facilities": facilities,
        "amenities": facilities,
        "checkinCheckout": _checkin_checkout(meta),
        "phone": meta.get("phone") or meta.get("telephone") or meta.get("phoneNumber"),
        "email": meta.get("email"),
        "website": meta.get("website") or meta.get("hotelWebsite"),
        "latitude": lat,
        "longitude": lng,
        "lat": lat,
        "lng": lng,
        "currency": currency,
        "hotelType": meta.get("hotelType") or meta.get("type"),
        "chain": meta.get("chain") or meta.get("chainName"),
    }


def _area_label(hotel: dict[str, Any]) -> str:
    """Best-effort neighborhood / area for sidebar filters (never invent Bangalore)."""
    for key in ("neighborhood", "district", "zone", "suburb", "locality"):
        val = hotel.get(key)
        if val and str(val).strip():
            return str(val).strip()
    city = str(hotel.get("city") or hotel.get("cityName") or hotel.get("city_name") or "").strip()
    address = str(hotel.get("address") or "").strip()
    if address:
        parts = [p.strip() for p in address.split(",") if p.strip()]
        for part in parts:
            low = part.lower()
            if city and city.lower() in low:
                continue
            if len(part) <= 2:
                continue
            # Skip bare pin codes / house numbers
            if part.replace(" ", "").replace("-", "").isdigit():
                continue
            if len(part) < 48:
                return part
    return city or "City center"


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
    city = str(hotel.get("city") or hotel.get("cityName") or hotel.get("city_name") or "").strip()
    address = str(hotel.get("address") or city or "")
    area = _area_label(hotel)
    rating_raw = hotel.get("rating")
    try:
        rating = float(rating_raw) if rating_raw not in (None, "") else None
    except (TypeError, ValueError):
        rating = None
    try:
        stars = int(float(hotel.get("stars") or 0))
    except (TypeError, ValueError):
        stars = 0

    image = _normalize_image_url(
        hotel.get("main_photo") or hotel.get("mainPhoto") or hotel.get("thumbnail") or hotel.get("thumbnailUrl") or ""
    )
    # Prefer HD gallery from LiteAPI (same source Nuitee uses)
    images = _collect_hotel_images(hotel, limit=200)
    if image and image not in images:
        images = [image, *images][:200]
    if not images and image:
        images = [image]

    per_night = None
    if total_price is not None and nights > 0:
        per_night = round(total_price / nights, 2)

    facilities = _facility_names(hotel)
    tags: list[str] = []
    if stars:
        tags.append(f"{stars}★")
    if board:
        tags.append(str(board))
    if hotel.get("freeCancellation"):
        tags.append("Free cancellation")
    for fac in facilities[:3]:
        if fac not in tags:
            tags.append(fac)

    lat, lng = _lat_lng(hotel)
    description = _plain_text(
        hotel.get("hotelDescription") or hotel.get("description") or ""
    )

    return {
        "id": hid,
        "name": name,
        "location": address or "Nearby",
        "address": address,
        "city": city,
        "country": str(hotel.get("country") or hotel.get("countryCode") or ""),
        "area": area,
        "distance": f"{stars}★" if stars else "Hotel",
        "rating": rating if rating is not None else (float(stars) if stars else 0),
        "ratingText": _rating_text(rating if rating is not None else None),
        "reviewCount": int(hotel.get("reviewCount") or hotel.get("reviewsCount") or 0),
        "image": image or (images[0] if images else ""),
        "images": images or ([image] if image else []),
        "pricePerNight": per_night if per_night is not None else 0,
        "totalPrice": total_price if total_price is not None else 0,
        "currency": currency,
        "tags": tags or ["Live fare"],
        "stars": stars,
        "board": board,
        "has_price": total_price is not None and total_price > 0,
        "description": description,
        "facilities": facilities,
        "amenities": facilities,
        "latitude": lat,
        "longitude": lng,
        "lat": lat,
        "lng": lng,
        "checkinCheckout": _checkin_checkout(hotel),
        "hotelTypeId": _hotel_type_id(hotel),
        "hotelType": hotel.get("hotelType") or hotel.get("type") or hotel.get("hotelTypeName"),
        "categoryHint": "homes" if _is_homes_property(hotel) else "hotels",
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
    page: int = 1,
    page_size: int = _HOTEL_PAGE_SIZE_DEFAULT,
    category: str | None = None,
    city_code: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    sort_by: str | None = None,
) -> dict[str, Any]:
    """Live LiteAPI hotel search + rates for the Hotels / Homes pages (paginated)."""
    city_s = (city or "").strip()
    code_s = (city_code or "").strip().upper() or None
    page_n = max(1, int(page or 1))
    size_n = min(_HOTEL_PAGE_SIZE_MAX, max(1, int(page_size or _HOTEL_PAGE_SIZE_DEFAULT)))
    cat = _normalize_category(category)
    product_label = "villas & homestays" if cat == "homes" else "hotels"
    category_label = "Villas & Homestays" if cat == "homes" else "Hotels"
    if not city_s and not code_s and (latitude is None or longitude is None):
        return {
            "hotels": [],
            "mode": "degraded",
            "category": cat,
            "category_label": category_label,
            "message": "Choose a city and dates, then search.",
            "error": "missing_city",
            "route_path": ["start", "manual_booking", "hotel_search", "error"],
            "guests": guests,
            "rooms": rooms,
            "page": page_n,
            "page_size": size_n,
            "total": 0,
            "total_pages": 0,
        }
    if not _api_key():
        return {
            "hotels": [],
            "mode": "degraded",
            "category": cat,
            "category_label": category_label,
            "message": "Hotel search isn’t available right now. Try again shortly.",
            "error": "missing_liteapi_key",
            "route_path": ["start", "manual_booking", "hotel_search", "error"],
            "guests": guests,
            "rooms": rooms,
            "page": page_n,
            "page_size": size_n,
            "total": 0,
            "total_pages": 0,
        }

    try:
        geo = await _geocode_city(
            city_s or code_s or "",
            city_code=code_s,
            latitude=latitude,
            longitude=longitude,
        )
        if not geo:
            return {
                "hotels": [],
                "mode": "degraded",
                "category": cat,
                "category_label": category_label,
                "message": f"Could not locate “{city_s or code_s}”. Try a clearer city or nearby town name.",
                "error": "geocode_failed",
                "route_path": ["start", "manual_booking", "hotel_search", "error"],
                "guests": guests,
                "rooms": rooms,
                "page": page_n,
                "page_size": size_n,
                "total": 0,
                "total_pages": 0,
            }

        place_label = (
            geo.get("city")
            or city_s
            or code_s
            or str(geo.get("display_name") or "").split(",")[0]
        )
        radius_m = 15000 if cat == "homes" else _HOTEL_SEARCH_RADIUS_M

        type_ids = sorted(_HOMES_HOTEL_TYPE_IDS) if cat == "homes" else None
        raw_hotels = await _fetch_hotels(
            geo["latitude"],
            geo["longitude"],
            radius_m=radius_m,
            hotel_type_ids=type_ids,
        )
        catalog = [h for h in (raw_hotels or []) if h.get("id")]
        # Strict: Villas & Homestays never includes classic hotels.
        if cat == "homes":
            catalog = [h for h in catalog if _is_homes_property(h)]

        def _h_rating(h: dict[str, Any]) -> float:
            r = h.get("rating")
            try:
                if r is not None and r != "":
                    return float(r)
            except (TypeError, ValueError):
                pass
            s = h.get("stars")
            try:
                if s is not None and s != "":
                    return float(s) * 2.0
            except (TypeError, ValueError):
                pass
            return 0.0

        def _h_reviews(h: dict[str, Any]) -> int:
            try:
                return int(h.get("reviewCount") or h.get("reviewsCount") or 0)
            except (TypeError, ValueError):
                return 0

        def _h_stars(h: dict[str, Any]) -> int:
            try:
                return int(float(h.get("stars") or 0))
            except (TypeError, ValueError):
                return 0

        sort_s = (sort_by or "recommended").strip().lower()
        if sort_s == "rating":
            catalog.sort(key=lambda h: (_h_rating(h), _h_reviews(h)), reverse=True)
        elif sort_s == "stars":
            catalog.sort(key=lambda h: (_h_stars(h), _h_rating(h), _h_reviews(h)), reverse=True)
        elif sort_s == "recommended":
            catalog.sort(
                key=lambda h: _h_rating(h) * 2.0 + (_h_stars(h) or 2.5) + min(5.0, (_h_reviews(h) ** 0.5) / 4.0),
                reverse=True,
            )

        total = len(catalog)
        total_pages = max(1, (total + size_n - 1) // size_n) if total else 0
        if page_n > total_pages and total_pages > 0:
            page_n = total_pages

        if not catalog:
            return {
                "hotels": [],
                "mode": "live",
                "category": cat,
                "category_label": category_label,
                "message": f"No {product_label} found near {place_label}.",
                "error": None,
                "route_path": ["start", "manual_booking", "hotel_search", "liteapi"],
                "guests": guests,
                "rooms": rooms,
                "geo": geo,
                "page": page_n,
                "page_size": size_n,
                "total": 0,
                "total_pages": 0,
                "total_catalog": 0,
            }

        nights = _nights(check_in, check_out)
        start_idx = (page_n - 1) * size_n
        subset = catalog[start_idx : start_idx + size_n]
        detail_sem = asyncio.Semaphore(_DETAIL_CONCURRENCY)
        hotel_ids = [str(h.get("id") or "") for h in subset]
        async with httpx.AsyncClient(timeout=50.0) as client:
            min_rates, details = await asyncio.gather(
                _fetch_min_rates(
                    client,
                    hotel_ids=hotel_ids,
                    check_in=check_in,
                    check_out=check_out,
                    guests=guests,
                    rooms=rooms,
                    currency=currency,
                    nationality=nationality,
                ),
                asyncio.gather(
                    *[
                        _fetch_hotel_detail(
                            client,
                            hotel_id=str(h.get("id") or ""),
                            sem=detail_sem,
                        )
                        for h in subset
                    ]
                ),
            )

        # If min-rates returned nothing, fall back to full /hotels/rates per hotel.
        if not min_rates and subset:
            rate_sem = asyncio.Semaphore(_RATE_CONCURRENCY)
            async with httpx.AsyncClient(timeout=50.0) as client:
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
                            sem=rate_sem,
                        )
                        for h in subset
                    ]
                )
            for hotel, rates in zip(subset, rate_payloads):
                hid = str(hotel.get("id") or "")
                total_price, cur, _board = _min_rate(rates)
                if hid and total_price is not None:
                    min_rates[hid] = {
                        "price": total_price,
                        "currency": cur or currency,
                        "offerId": None,
                    }

        ui: list[dict[str, Any]] = []
        priced = 0
        for hotel, detail in zip(subset, details):
            enriched = _merge_hotel_list_with_detail(hotel, detail)
            hid = str(hotel.get("id") or "")
            mr = min_rates.get(hid) or {}
            total_price = mr.get("price")
            cur = mr.get("currency") or currency
            card = _hotel_to_ui(
                enriched,
                nights=nights,
                total_price=total_price,
                currency=cur,
                board=None,
            )
            if mr.get("offerId"):
                card["minOfferId"] = mr["offerId"]
            if mr.get("suggestedSellingPrice") is not None:
                card["suggestedSellingPrice"] = mr["suggestedSellingPrice"]
            # Cap carousel size for the results list (detail page still has full set)
            if isinstance(card.get("images"), list) and len(card["images"]) > _CARD_IMAGE_LIMIT:
                card["images"] = card["images"][:_CARD_IMAGE_LIMIT]
            if card.get("has_price"):
                priced += 1
                ui.append(card)

        # Never return unpriced rows — UI must not show "Rates on request".
        ui = [c for c in ui if c.get("has_price")]
        if sort_s == "rating":
            ui.sort(
                key=lambda h: (
                    float(h.get("rating") or 0),
                    int(h.get("reviewCount") or 0),
                    -(float(h.get("totalPrice") or 0)),
                ),
                reverse=True,
            )
        elif sort_s == "stars":
            ui.sort(
                key=lambda h: (
                    int(h.get("stars") or 0),
                    float(h.get("rating") or 0),
                    -(float(h.get("totalPrice") or 0)),
                ),
                reverse=True,
            )
        elif sort_s == "price_desc":
            ui.sort(key=lambda h: (float(h.get("totalPrice") or 0)), reverse=True)
        elif sort_s == "price_asc":
            ui.sort(key=lambda h: (float(h.get("totalPrice") or 1e18)))
        else:
            # Default / recommended
            ui.sort(
                key=lambda h: (
                    float(h.get("rating") or 0) * 2.0
                    + (int(h.get("stars") or 0) or 2.5)
                    - (float(h.get("totalPrice") or 0) / 100000.0)
                ),
                reverse=True,
            )

        return {
            "hotels": ui,
            "mode": "live",
            "category": cat,
            "category_label": category_label,
            "message": (
                f"Showing {len(ui)} live-priced {product_label} near {place_label} "
                f"(from {total} catalog matches on this page)."
                if ui
                else f"No live rates available for {product_label} near {place_label} on these dates."
            ),
            "error": None if ui else "no_live_rates",
            "route_path": ["start", "manual_booking", "hotel_search", "liteapi"],
            "guests": guests,
            "rooms": rooms,
            "nights": nights,
            "geo": {
                "display_name": geo.get("display_name"),
                "latitude": geo["latitude"],
                "longitude": geo["longitude"],
            },
            "page": page_n,
            "page_size": size_n,
            "total": total,
            "total_pages": total_pages,
            "total_catalog": total,
            "priced_on_page": len(ui),
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "hotels": [],
            "mode": "degraded",
            "category": cat,
            "category_label": category_label,
            "message": (
                f"Live {product_label} search failed. Try again — no sample stays are shown."
            ),
            "error": f"{type(exc).__name__}: {exc}",
            "route_path": ["start", "manual_booking", "hotel_search", "error"],
            "guests": guests,
            "rooms": rooms,
            "page": page_n,
            "page_size": size_n,
            "total": 0,
            "total_pages": 0,
        }



def _room_photo_urls(photos: list[Any] | None) -> list[str]:
    """Prefer HD URLs from LiteAPI photo objects; keep order; de-dupe."""
    urls: list[str] = []
    for img in photos or []:
        if isinstance(img, dict):
            raw = (
                img.get("urlHd")
                or img.get("hd_url")
                or img.get("url")
                or img.get("urlThumbnail")
                or img.get("thumbnailUrl")
                or img.get("failoverPhoto")
                or img.get("image")
                or ""
            )
        else:
            raw = str(img or "")
        url = _normalize_image_url(raw)
        if url and url not in urls:
            urls.append(url)
    return urls


def _plain_text(html: str | None, *, limit: int | None = None) -> str:
    """Strip LiteAPI HTML descriptions to readable text (keep newlines)."""
    import re

    t = str(html or "")
    t = re.sub(r"(?i)<br\s*/?>", "\n", t)
    t = re.sub(r"(?i)</p\s*>", "\n\n", t)
    t = re.sub(r"(?i)</li\s*>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"&nbsp;", " ", t)
    t = re.sub(r"&amp;", "&", t)
    t = re.sub(r"&lt;", "<", t)
    t = re.sub(r"&gt;", ">", t)
    t = re.sub(r"\n{3,}", "\n\n", t).strip()
    if limit is not None and len(t) > limit:
        return t[: limit - 1].rstrip() + "…"
    return t


def _lat_lng(meta: dict[str, Any] | None) -> tuple[float | None, float | None]:
    blob = meta or {}
    loc = blob.get("location") if isinstance(blob.get("location"), dict) else {}
    raw_lat = blob.get("latitude") or blob.get("lat") or loc.get("latitude") or loc.get("lat")
    raw_lng = (
        blob.get("longitude")
        or blob.get("lng")
        or blob.get("lon")
        or loc.get("longitude")
        or loc.get("lng")
        or loc.get("lon")
    )
    try:
        lat = float(raw_lat) if raw_lat not in (None, "") else None
    except (TypeError, ValueError):
        lat = None
    try:
        lng = float(raw_lng) if raw_lng not in (None, "") else None
    except (TypeError, ValueError):
        lng = None
    return lat, lng


def _normalize_room_label(value: Any) -> str:
    text = str(value or "").strip().lower()
    out = []
    for ch in text:
        out.append(ch if ch.isalnum() else " ")
    return " ".join("".join(out).split())


def _canonical_room_group_key(value: Any) -> str:
    """Collapse supplier room-name variants into one group key.

    LiteAPI often returns the same physical room as
    ``Club King Room``, ``Room CLUB KING BED``, ``The Lalit Executive Club King Room``, etc.
    """
    key = _normalize_room_label(value)
    if not key:
        return "room"
    noise = {
        "the",
        "a",
        "an",
        "and",
        "with",
        "hotel",
        "lalit",
        "mumbai",
        "delhi",
        "bangalore",
        "chennai",
        "hyderabad",
        "kolkata",
        "jaipur",
        "goa",
        "business",
        "city",
        "view",
        "bed",
        "beds",
    }
    raw_tokens = key.split()
    tokens = [t for t in raw_tokens if t not in noise]
    text = " ".join(tokens)
    if "club" in raw_tokens and "king" in raw_tokens:
        return "club king room"
    if "spa" in raw_tokens and "suite" in raw_tokens:
        return "spa suite"
    if "suite" in raw_tokens and "executive" in raw_tokens:
        return "executive suite"
    if {"one", "bedroom", "apartment"} <= set(raw_tokens) or (
        "apartment" in raw_tokens and "bedroom" in raw_tokens
    ):
        return "one bedroom apartment"
    return text or key


def _pretty_room_title(value: Any) -> str:
    """Prefer a clean display title for a raw supplier room name."""
    raw = str(value or "").strip()
    if not raw:
        return "Room"
    # Cut promo tails often glued onto LiteAPI room names
    for sep in (" with Complimentary", " (Enjoy", " with Enjoy", ", Enjoy"):
        idx = raw.find(sep)
        if idx > 8:
            raw = raw[:idx].strip(" ,")
            break
    for prefix in ("The Lalit ", "THE LALIT ", "Lalit "):
        if raw.startswith(prefix):
            raw = raw[len(prefix) :].strip()
            break
    if raw != raw.lower() and raw != raw.upper():
        return raw or "Room"
    return raw.title()


def _rate_is_refundable(rate0: dict[str, Any]) -> bool:
    if rate0.get("refundable") or rate0.get("freeCancellation"):
        return True
    cancel = rate0.get("cancellationPolicies") or rate0.get("cancelPolicy") or {}
    if not isinstance(cancel, dict):
        return False
    if cancel.get("refundable") is True:
        return True
    tag = str(cancel.get("refundableTag") or "").upper()
    return tag in {"RFN", "REFUNDABLE", "FREE_CANCELLATION"}


def _cancel_until(rate0: dict[str, Any]) -> str | None:
    cancel = rate0.get("cancellationPolicies") or rate0.get("cancelPolicy") or {}
    if not isinstance(cancel, dict):
        return None
    infos = cancel.get("cancelPolicyInfos") or cancel.get("cancellationPolicies") or []
    if not isinstance(infos, list):
        return None
    times: list[str] = []
    for info in infos:
        if not isinstance(info, dict):
            continue
        t = info.get("cancelTime") or info.get("date") or info.get("until")
        if t:
            times.append(str(t)[:16].replace("T", " "))
    return times[0] if times else None


def _dedupe_room_offers(rooms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the cheapest distinct product per room + board + refundability.

    Suppliers flood the same meal plan at many near-identical prices with no
    visible difference in our UI — collapse those clones, but keep alternate
    offerIds so prebook can hop when the cheapest ghost rate 2001s.
    """
    best: dict[tuple[Any, ...], dict[str, Any]] = {}
    for room in rooms:
        group = room.get("groupKey") or _canonical_room_group_key(
            room.get("category") or room.get("title")
        )
        board = _normalize_room_label(room.get("board") or "room only")
        # One row per board + refundability (+ pay-at-hotel); keep cheapest.
        product = (
            group,
            board,
            bool(room.get("freeCancellation")),
            bool(room.get("payAtHotel")),
        )
        prev = best.get(product)
        if prev is None:
            best[product] = dict(room)
            best[product]["altOfferIds"] = []
            continue
        prev_total = float(prev.get("totalPrice") or 1e18)
        cur_total = float(room.get("totalPrice") or 1e18)
        cur_oid = str(room.get("offerId") or "").strip()
        prev_oid = str(prev.get("offerId") or "").strip()
        alts = list(prev.get("altOfferIds") or [])
        if cur_total < prev_total:
            if prev_oid:
                alts.append(prev_oid)
            merged = dict(room)
            # Keep a capped pool of alternate bookable offer ids.
            merged["altOfferIds"] = list(dict.fromkeys(alts + list(room.get("altOfferIds") or [])))[:12]
            best[product] = merged
        else:
            if cur_oid and cur_oid != prev_oid:
                alts.append(cur_oid)
            prev["altOfferIds"] = list(dict.fromkeys(alts))[:12]
    out = list(best.values())
    out.sort(key=lambda r: r.get("totalPrice") or 1e18)
    return out


def _build_room_catalog(hotel_meta: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Index LiteAPI hotel metadata rooms for name/photo/bed matching."""
    meta = hotel_meta or {}
    catalog: list[dict[str, Any]] = []
    for room in meta.get("rooms") or []:
        if not isinstance(room, dict):
            continue
        name = str(room.get("roomName") or room.get("name") or "").strip()
        if not name:
            continue
        beds = room.get("bedTypes") or []
        bed_label = None
        if isinstance(beds, list) and beds:
            parts = []
            for b in beds:
                if not isinstance(b, dict):
                    continue
                qty = b.get("quantity") or 1
                kind = b.get("bedType") or "Bed"
                parts.append(f"{qty}× {kind}" if qty else str(kind))
            bed_label = " / ".join(parts) if parts else None
        views = room.get("views") or []
        view_label = None
        if isinstance(views, list) and views:
            names = []
            for v in views:
                if isinstance(v, dict):
                    names.append(str(v.get("view") or v.get("name") or "").strip())
                else:
                    names.append(str(v).strip())
            view_label = ", ".join(n for n in names if n) or None
        size = None
        if room.get("roomSizeSquare"):
            unit = room.get("roomSizeUnit") or "sqm"
            size = f"{room.get('roomSizeSquare')} {unit}"
        catalog.append(
            {
                "id": room.get("id"),
                "name": name,
                "key": _normalize_room_label(name),
                "photos": _room_photo_urls(room.get("photos") or room.get("images")),
                "bedType": bed_label,
                "view": view_label,
                "size": size,
                "capacity": room.get("maxOccupancy") or room.get("maxAdults"),
                "description": room.get("description"),
                "amenities": [
                    str(a.get("name")).strip()
                    for a in (room.get("roomAmenities") or room.get("amenities") or [])
                    if isinstance(a, dict) and a.get("name")
                ],
            }
        )
    return catalog


def _match_room_catalog(
    room_name: str, catalog: list[dict[str, Any]]
) -> dict[str, Any] | None:
    if not room_name or not catalog:
        return None
    key = _normalize_room_label(room_name)
    if not key:
        return None
    for item in catalog:
        if item["key"] == key:
            return item
    # fuzzy: either contains the other
    for item in catalog:
        if key in item["key"] or item["key"] in key:
            return item
    # token overlap (elite room vs elite double room)
    tokens = set(key.split())
    best = None
    best_score = 0
    for item in catalog:
        other = set(item["key"].split())
        score = len(tokens & other)
        if score > best_score and score >= max(1, min(2, len(tokens))):
            best = item
            best_score = score
    return best


def _parse_room_offers(
    rate_payload: dict[str, Any] | None,
    *,
    nights: int,
    hotel_meta: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Flatten LiteAPI /hotels/rates roomTypes into UI room cards.

    LiteAPI rate shape (important):
      roomTypes[].rates[0].name      → room category (e.g. "Elite Room")
      roomTypes[].rates[0].boardName → meal plan (e.g. "Full Board")
    Hotel metadata ``rooms[].roomName`` + ``photos`` supply category images.
    """
    if not rate_payload or not isinstance(rate_payload, dict):
        return []
    data = rate_payload.get("data") or []
    rooms_out: list[dict[str, Any]] = []
    meta = hotel_meta or {}
    catalog = _build_room_catalog(meta)
    hotel_images = _room_photo_urls(
        meta.get("hotelImages") or meta.get("images") or []
    )
    # Prefer interior/room captions when falling back to hotel gallery
    interior = [
        u
        for img in (meta.get("hotelImages") or [])
        if isinstance(img, dict)
        for u in [_room_photo_urls([img])[0] if _room_photo_urls([img]) else ""]
        if u
        and any(
            t in str(img.get("caption") or "").lower()
            for t in ("room", "bed", "suite", "bathroom", "interior")
        )
    ]
    default_image = (
        (catalog[0]["photos"][0] if catalog and catalog[0].get("photos") else None)
        or (interior[0] if interior else None)
        or (hotel_images[0] if hotel_images else None)
        or meta.get("main_photo")
        or meta.get("thumbnail")
        or ""
    )

    for hotel in data:
        for room in hotel.get("roomTypes") or []:
            offer = room.get("offerRetailRate") or {}
            try:
                total = float(offer.get("amount") or 0)
            except (TypeError, ValueError):
                total = 0.0
            if total <= 0:
                # Some payloads nest amount under retailRate.total[0]
                rates_probe = room.get("rates") or []
                if rates_probe:
                    retail = (rates_probe[0] or {}).get("retailRate") or {}
                    totals = retail.get("total") or []
                    if totals and isinstance(totals[0], dict):
                        try:
                            total = float(totals[0].get("amount") or 0)
                        except (TypeError, ValueError):
                            total = 0.0
            if total <= 0:
                continue
            currency = str(offer.get("currency") or "INR")
            rates = room.get("rates") or [{}]
            rate0 = rates[0] if rates else {}
            if not currency or currency == "INR":
                retail = rate0.get("retailRate") or {}
                totals = retail.get("total") or []
                if totals and isinstance(totals[0], dict) and totals[0].get("currency"):
                    currency = str(totals[0]["currency"])

            offer_id = (
                room.get("offerId")
                or rate0.get("offerId")
                or rate0.get("rateId")
                or room.get("offer_id")
            )

            # Room category vs meal plan — do NOT swap these
            room_category = (
                rate0.get("name")
                or room.get("roomName")
                or room.get("name")
                or room.get("roomTypeName")
                or "Room"
            )
            room_category = str(room_category).strip()
            # Normalize supplier casing noise ("elite room" → "Elite Room")
            if room_category and room_category == room_category.lower():
                room_category = room_category.title()
            elif room_category and room_category.isupper() and len(room_category) > 3:
                room_category = room_category.title()
            board = rate0.get("boardName") or rate0.get("boardType") or "Room Only"
            matched = _match_room_catalog(str(room_category), catalog)

            free_cancel = _rate_is_refundable(rate0 if isinstance(rate0, dict) else {})
            cancel_until = _cancel_until(rate0 if isinstance(rate0, dict) else {})
            breakfast = (
                "breakfast" in str(board).lower()
                or "half board" in str(board).lower()
                or "full board" in str(board).lower()
                or str(rate0.get("boardType") or "").upper() in {"BB", "HB", "FB", "AI"}
                or bool(rate0.get("breakfastIncluded"))
            )
            per_night = round(total / max(1, nights), 2)
            mapped = room.get("offerMappedRate") or {}
            try:
                mapped_amt = float(mapped.get("amount") or 0)
            except (TypeError, ValueError):
                mapped_amt = 0.0
            taxes = (
                max(0.0, round(total - mapped_amt, 2))
                if mapped_amt > 0
                else round(total * 0.18, 2)
            )
            base = max(0.0, round(total - taxes, 2))
            per_night_base = round(base / max(1, nights), 2)

            images = _room_photo_urls(room.get("photos") or room.get("images"))
            if not images and matched:
                images = list(matched.get("photos") or [])
            elif matched and matched.get("photos"):
                # Merge catalog room shots (bedroom / bath / view) onto rate photos
                for u in matched.get("photos") or []:
                    if u and u not in images:
                        images.append(u)
            # Prefer view shots when the room sells a named view
            view_hint = " ".join(
                [
                    str(room_category),
                    str(room.get("view") or ""),
                    str((matched or {}).get("view") or ""),
                ]
            ).lower()
            if any(t in view_hint for t in ("view", "sea", "ocean", "city", "harbour", "harbor")):
                for img in meta.get("hotelImages") or []:
                    if not isinstance(img, dict):
                        continue
                    cap = str(img.get("caption") or "").lower()
                    if not any(
                        t in cap
                        for t in ("view", "sea", "ocean", "city", "harbour", "harbor", "pool")
                    ):
                        continue
                    urls = _room_photo_urls([img])
                    for u in urls:
                        if u and u not in images:
                            images.append(u)
                    if len(images) >= 6:
                        break
            if not images and interior:
                images = list(interior[:3])
            if not images and default_image:
                images = [default_image]
            images = images[:8]

            bed_type = (
                (matched or {}).get("bedType")
                or rate0.get("bedType")
                or room.get("bedType")
                or "Standard bed"
            )
            view = (
                (matched or {}).get("view")
                or room.get("view")
                or "Standard view"
            )
            size = (
                (matched or {}).get("size")
                or room.get("roomSize")
                or rate0.get("roomSize")
                or "—"
            )
            capacity = int(
                rate0.get("maxOccupancy")
                or rate0.get("adultCount")
                or rate0.get("adults")
                or (matched or {}).get("capacity")
                or 2
            )

            # Title = category; board kept separate for tags / meal plan
            title = _pretty_room_title(room_category)
            if matched and matched.get("name"):
                catalog_name = str(matched.get("name") or "").strip()
                # Catalog names sometimes include long promo copy — keep the
                # shorter rate-side room category when that happens.
                promoish = any(
                    t in catalog_name.lower()
                    for t in (
                        "complimentary",
                        "happy hour",
                        "airport transfer",
                        "% off",
                        "1+1",
                    )
                )
                if catalog_name and not promoish and len(catalog_name) <= max(48, len(title) + 8):
                    title = _pretty_room_title(catalog_name)
            display_title = title
            group_key = _canonical_room_group_key(room_category)

            rooms_out.append(
                {
                    "id": str(
                        offer_id or f"{hotel.get('hotelId') or hotel.get('id')}-{len(rooms_out)}"
                    ),
                    "offerId": offer_id,
                    "hotelId": str(
                        hotel.get("hotelId") or hotel.get("id") or meta.get("id") or ""
                    ),
                    "roomTypeId": room.get("roomTypeId"),
                    "title": display_title,
                    "name": display_title,
                    "category": title,
                    "groupKey": group_key,
                    "image": images[0] if images else default_image,
                    "images": images,
                    "bedType": str(bed_type),
                    "beds": str(bed_type),
                    "capacity": capacity,
                    "guests": f"{capacity} Guest{'s' if capacity != 1 else ''}",
                    "size": str(size),
                    "view": str(view),
                    "floor": str(room.get("floor") or (matched or {}).get("floor") or "—"),
                    "board": str(board),
                    "freeCancellation": free_cancel,
                    "cancelUntil": cancel_until,
                    "freeBreakfast": breakfast,
                    "payAtHotel": bool(
                        rate0.get("payAtProperty") or rate0.get("payAtHotel")
                    ),
                    "roomsLeft": rate0.get("remaining") or rate0.get("roomsLeft"),
                    "price": per_night_base if per_night_base > 0 else per_night,
                    "taxes": taxes,
                    "totalPrice": total,
                    "pricePerNight": per_night,
                    "currency": currency,
                    "nights": nights,
                    "description": (matched or {}).get("description") or "",
                    "amenities": list((matched or {}).get("amenities") or []),
                    "rawRate": {
                        "roomName": title,
                        "boardName": board,
                        "offerId": offer_id,
                        "refundable": free_cancel,
                    },
                }
            )

    rooms_out.sort(key=lambda r: r.get("totalPrice") or 1e18)
    return _dedupe_room_offers(rooms_out)


async def structured_hotel_rates(
    *,
    hotel_id: str,
    check_in: str,
    check_out: str,
    guests: int = 2,
    rooms: int = 1,
    currency: str = "INR",
    nationality: str = "IN",
) -> dict[str, Any]:
    """Live LiteAPI room rates for one hotel (manual booking page)."""
    hid = str(hotel_id or "").strip()
    if not hid:
        return {
            "hotel": None,
            "rooms": [],
            "mode": "degraded",
            "message": "Missing hotel id.",
            "error": "missing_hotel_id",
        }
    if not _api_key():
        return {
            "hotel": None,
            "rooms": [],
            "mode": "degraded",
            "message": "Room rates aren’t available right now. Try again shortly.",
            "error": "missing_liteapi_key",
        }

    nights = _nights(check_in, check_out)
    key = _api_key()
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": key,
    }

    hotel_meta: dict[str, Any] = {"id": hid}
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            # Optional hotel metadata
            try:
                meta_r = await client.get(
                    f"{_LITEAPI_BASE}/data/hotel",
                    headers={"Accept": "application/json", "X-API-Key": key},
                    params={"hotelId": hid},
                )
                if meta_r.status_code == 200:
                    meta_body = meta_r.json() or {}
                    hotel_meta = meta_body.get("data") or meta_body or hotel_meta
                    if isinstance(hotel_meta, list) and hotel_meta:
                        hotel_meta = hotel_meta[0]
            except Exception:
                pass

            sem = asyncio.Semaphore(1)
            rates = await _fetch_rate(
                client,
                hotel_id=hid,
                check_in=check_in,
                check_out=check_out,
                guests=guests,
                rooms=rooms,
                currency=currency,
                nationality=nationality,
                sem=sem,
            )

        room_cards = _parse_room_offers(rates, nights=nights, hotel_meta=hotel_meta)
        hotel_ui = _hotel_meta_to_ui(
            hotel_meta if isinstance(hotel_meta, dict) else {},
            currency=currency,
        )
        hotel_ui["id"] = hid

        return {
            "hotel": hotel_ui,
            "rooms": room_cards,
            "mode": "live",
            "message": (
                f"Found {len(room_cards)} live room rates"
                if room_cards
                else "No bookable room rates for these dates."
            ),
            "error": None if room_cards else "no_rates",
            "nights": nights,
            "check_in": check_in[:10],
            "check_out": check_out[:10],
            "guests": guests,
            "rooms_requested": rooms,
        }
    except Exception as exc:
        traceback.print_exc()
        return {
            "hotel": {"id": hid},
            "rooms": [],
            "mode": "degraded",
            "message": f"Live room rates failed ({type(exc).__name__}). No sample rooms shown.",
            "error": f"{type(exc).__name__}: {exc}",
        }


def _normalize_review_row(row: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(row, dict):
        return None
    headline = str(row.get("headline") or row.get("title") or "").strip()
    pros = str(row.get("pros") or "").strip()
    cons = str(row.get("cons") or "").strip()
    text = pros or headline or cons
    if not text:
        return None
    score_raw = row.get("averageScore") if row.get("averageScore") is not None else row.get("score")
    try:
        score = float(score_raw) if score_raw not in (None, "") else None
    except (TypeError, ValueError):
        score = None
    return {
        "score": score,
        "name": str(row.get("name") or "Guest").strip() or "Guest",
        "country": str(row.get("country") or "").strip().upper() or None,
        "type": row.get("type"),
        "date": row.get("date"),
        "headline": headline or None,
        "pros": pros,
        "cons": cons,
        "text": text,
        "source": row.get("source") or "live",
        "language": row.get("language"),
    }


async def structured_hotel_reviews(*, hotel_id: str, limit: int = 20) -> dict[str, Any]:
    """GET /data/reviews for a hotel — live guest reviews only."""
    hid = str(hotel_id or "").strip()
    if not hid:
        return {"ok": False, "reviews": [], "error": "missing_hotel_id", "total": 0}
    if not _api_key():
        return {"ok": False, "reviews": [], "error": "missing_liteapi_key", "total": 0}
    lim = max(1, min(int(limit or 20), 50))
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.get(
                f"{_LITEAPI_BASE}/data/reviews",
                headers={"Accept": "application/json", "X-API-Key": _api_key()},
                params={"hotelId": hid, "limit": lim},
            )
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                return {
                    "ok": False,
                    "hotel_id": hid,
                    "reviews": [],
                    "total": 0,
                    "error": "reviews_failed",
                    "message": str(body.get("message") or f"HTTP {r.status_code}"),
                }
            rows = body.get("data") if isinstance(body.get("data"), list) else []
            total = int(body.get("total") or len(rows) or 0)
            out: list[dict[str, Any]] = []
            for row in rows[:lim]:
                normalized = _normalize_review_row(row)
                if not normalized:
                    # Keep score-only rows on hotel detail (empty text ok there)
                    if not isinstance(row, dict):
                        continue
                    score_raw = row.get("averageScore") if row.get("averageScore") is not None else row.get("score")
                    try:
                        score = float(score_raw) if score_raw not in (None, "") else None
                    except (TypeError, ValueError):
                        score = None
                    out.append(
                        {
                            "score": score,
                            "name": str(row.get("name") or "Guest").strip() or "Guest",
                            "country": str(row.get("country") or "").strip().upper() or None,
                            "type": row.get("type"),
                            "date": row.get("date"),
                            "headline": str(row.get("headline") or row.get("title") or "").strip() or None,
                            "pros": str(row.get("pros") or "").strip(),
                            "cons": str(row.get("cons") or "").strip(),
                            "source": row.get("source") or "live",
                            "language": row.get("language"),
                        }
                    )
                    continue
                out.append(
                    {
                        "score": normalized["score"],
                        "name": normalized["name"],
                        "country": normalized["country"],
                        "type": normalized["type"],
                        "date": normalized["date"],
                        "headline": normalized["headline"],
                        "pros": normalized["pros"],
                        "cons": normalized["cons"],
                        "source": normalized["source"],
                        "language": normalized["language"],
                    }
                )
            return {
                "ok": True,
                "hotel_id": hid,
                "reviews": out,
                "total": total,
                "error": None,
                "message": f"{len(out)} reviews" if out else "No guest reviews for this property.",
            }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "hotel_id": hid,
            "reviews": [],
            "total": 0,
            "error": type(exc).__name__,
            "message": str(exc)[:200],
        }


# Homepage "Loved by Explorers" — pull recent guest quotes from popular metros.
_FEATURED_REVIEW_CITIES: tuple[dict[str, Any], ...] = (
    {"city": "Mumbai", "country": "IN", "latitude": 19.0760, "longitude": 72.8777},
    {"city": "Dubai", "country": "AE", "latitude": 25.2048, "longitude": 55.2708},
    {"city": "Paris", "country": "FR", "latitude": 48.8566, "longitude": 2.3522},
    {"city": "Bali", "country": "ID", "latitude": -8.4095, "longitude": 115.1889},
    {"city": "London", "country": "GB", "latitude": 51.5074, "longitude": -0.1278},
    {"city": "New York", "country": "US", "latitude": 40.7128, "longitude": -74.0060},
)
_FEATURED_REVIEWS_CACHE: dict[str, Any] = {"at": 0.0, "payload": None}
_FEATURED_REVIEWS_TTL_S = 30 * 60


def _country_label(code: str | None, fallback_city: str = "") -> str:
    c = (code or "").strip().upper()
    names = {
        "IN": "India",
        "US": "USA",
        "GB": "UK",
        "UK": "UK",
        "AE": "UAE",
        "FR": "France",
        "ID": "Indonesia",
        "AU": "Australia",
        "ES": "Spain",
        "DE": "Germany",
        "IT": "Italy",
        "SG": "Singapore",
        "TH": "Thailand",
        "JP": "Japan",
    }
    if c in names:
        return names[c]
    if fallback_city:
        return fallback_city
    return c or "Traveller"


def _display_guest_name(raw: str | None) -> str:
    name = str(raw or "").strip()
    if not name:
        return "Guest"
    # Booking.com-style handles (digits + long alphanumeric) → generic label
    compact = name.replace(" ", "")
    digit_n = sum(ch.isdigit() for ch in compact)
    if digit_n >= 3 and len(compact) >= 10:
        return "Guest"
    if len(compact) > 18 and " " not in name and digit_n >= 1:
        return "Guest"
    return name[:48]


async def structured_featured_reviews(*, limit: int = 12) -> dict[str, Any]:
    """Aggregate recent LiteAPI guest reviews across popular cities for the homepage."""
    lim = max(3, min(int(limit or 12), 24))
    now = datetime.utcnow().timestamp()
    cached = _FEATURED_REVIEWS_CACHE.get("payload")
    cached_at = float(_FEATURED_REVIEWS_CACHE.get("at") or 0)
    if cached and (now - cached_at) < _FEATURED_REVIEWS_TTL_S:
        reviews = list(cached.get("reviews") or [])[:lim]
        return {
            **cached,
            "reviews": reviews,
            "cached": True,
            "message": f"{len(reviews)} live guest reviews",
        }

    if not _api_key():
        return {
            "ok": False,
            "reviews": [],
            "total": 0,
            "error": "missing_liteapi_key",
            "message": "Guest reviews aren’t available right now.",
        }

    try:
        # 1) Catalog hotels near each city (cheap /data/hotels calls in parallel)
        async def _city_hotels(city: dict[str, Any]) -> list[dict[str, Any]]:
            try:
                hotels = await _fetch_hotels(
                    float(city["latitude"]),
                    float(city["longitude"]),
                    radius_m=8000,
                    limit=60,
                )
            except Exception:
                return []
            scored: list[tuple[int, dict[str, Any], dict[str, Any]]] = []
            for h in hotels:
                if not isinstance(h, dict) or not h.get("id"):
                    continue
                try:
                    rc = int(h.get("reviewCount") or h.get("reviewsCount") or 0)
                except (TypeError, ValueError):
                    rc = 0
                if rc < 50:
                    continue
                scored.append((rc, h, city))
            scored.sort(key=lambda t: t[0], reverse=True)
            return [{"hotel": h, "city": city, "reviewCount": rc} for rc, h, city in scored[:3]]

        city_batches = await asyncio.gather(
            *[_city_hotels(c) for c in _FEATURED_REVIEW_CITIES]
        )
        picks: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for batch in city_batches:
            for item in batch:
                hid = str(item["hotel"].get("id") or "")
                if not hid or hid in seen_ids:
                    continue
                seen_ids.add(hid)
                picks.append(item)
                if len(picks) >= 10:
                    break
            if len(picks) >= 10:
                break

        if not picks:
            return {
                "ok": False,
                "reviews": [],
                "total": 0,
                "error": "no_hotels",
                "message": "No reviewed hotels found for featured cities.",
            }

        # 2) Pull reviews per hotel (limit high enough to find quotes with text)
        async def _reviews_for(pick: dict[str, Any]) -> list[dict[str, Any]]:
            hotel = pick["hotel"]
            city = pick["city"]
            hid = str(hotel.get("id"))
            res = await structured_hotel_reviews(hotel_id=hid, limit=40)
            out: list[dict[str, Any]] = []
            for row in res.get("reviews") or []:
                text = str(row.get("pros") or row.get("headline") or row.get("cons") or "").strip()
                if len(text) < 40:
                    continue
                score = row.get("score")
                try:
                    score_f = float(score) if score is not None else 0.0
                except (TypeError, ValueError):
                    score_f = 0.0
                # Homepage: prefer strong stays (LiteAPI scores are typically /10)
                if score_f and score_f < 7:
                    continue
                guest_country = row.get("country")
                location = _country_label(
                    guest_country,
                    fallback_city=str(city.get("city") or hotel.get("city") or ""),
                )
                hotel_city = str(hotel.get("city") or city.get("city") or "").strip()
                hotel_name = str(hotel.get("name") or "Stay").strip()
                out.append(
                    {
                        "id": f"{hid}:{row.get('date')}:{row.get('name')}",
                        "name": _display_guest_name(row.get("name")),
                        "location": location,
                        "country": guest_country,
                        "rating": round(score_f, 1) if score_f else None,
                        "score": score_f if score_f else None,
                        "text": text[:280],
                        "headline": row.get("headline"),
                        "date": row.get("date"),
                        "type": row.get("type"),
                        "source": row.get("source") or "live",
                        "hotelId": hid,
                        "hotelName": hotel_name,
                        "hotelCity": hotel_city,
                        "hotelCountry": str(
                            hotel.get("country") or hotel.get("countryCode") or city.get("country") or ""
                        ),
                    }
                )
            return out

        batches = await asyncio.gather(*[_reviews_for(p) for p in picks])
        by_hotel: dict[str, list[dict[str, Any]]] = {}
        for batch in batches:
            for r in batch:
                hid = str(r.get("hotelId") or "")
                by_hotel.setdefault(hid, []).append(r)
        for hid in by_hotel:
            by_hotel[hid].sort(
                key=lambda r: (str(r.get("date") or ""), float(r.get("score") or 0)),
                reverse=True,
            )

        # Round-robin across hotels so one property doesn't fill the carousel
        unique: list[dict[str, Any]] = []
        seen_text: set[str] = set()
        queues = [list(v) for v in by_hotel.values() if v]
        while queues and len(unique) < lim:
            next_queues: list[list[dict[str, Any]]] = []
            for q in queues:
                while q:
                    r = q.pop(0)
                    key = str(r.get("text") or "").lower()[:120]
                    if key in seen_text:
                        continue
                    seen_text.add(key)
                    unique.append(r)
                    break
                if q:
                    next_queues.append(q)
                if len(unique) >= lim:
                    break
            queues = next_queues

        payload = {
            "ok": True,
            "reviews": unique,
            "total": len(unique),
            "error": None,
            "message": (
                f"{len(unique)} live guest reviews"
                if unique
                else "No guest review quotes available right now."
            ),
            "mode": "live",
        }
        _FEATURED_REVIEWS_CACHE["at"] = now
        _FEATURED_REVIEWS_CACHE["payload"] = payload
        return {**payload, "cached": False}
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "reviews": [],
            "total": 0,
            "error": type(exc).__name__,
            "message": str(exc)[:200],
        }


def _liteapi_error_bits(body: dict[str, Any] | None) -> tuple[int | None, str, str]:
    """Return (code, description, message) from a LiteAPI error payload."""
    if not isinstance(body, dict):
        return None, "", ""
    err = body.get("error") if isinstance(body.get("error"), dict) else {}
    code = err.get("code")
    try:
        code_i = int(code) if code is not None else None
    except (TypeError, ValueError):
        code_i = None
    desc = str(err.get("description") or "").strip()
    msg = str(err.get("message") or body.get("message") or "").strip()
    return code_i, desc, msg


def _is_prebook_availability_miss(status_code: int, body: dict[str, Any] | None) -> bool:
    """True when the offer is gone / sold out and rates should be refreshed."""
    code, desc, msg = _liteapi_error_bits(body)
    blob = f"{desc} {msg}".lower()
    if code in {2001, 4002, 4040}:
        return True
    if status_code in {400, 404, 408, 409, 410} and any(
        t in blob
        for t in (
            "no prebook availability",
            "no availability",
            "outdated offer",
            "invalid offer",
            "not valid",
            "refetch rates",
        )
    ):
        return True
    return any(
        t in blob
        for t in (
            "no prebook availability",
            "no availability found",
            "outdated offerid",
            "outdated offer",
            "invalid offerid",
            "invalid offer id",
        )
    )


def _normalize_match_label(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _rank_fresh_hotel_offers(
    rooms: list[dict[str, Any]],
    *,
    exclude_offer_id: str | None = None,
    room_title: str | None = None,
    room_board: str | None = None,
    target_price: float | None = None,
) -> list[dict[str, Any]]:
    """Rank freshly fetched room offers for a prebook retry."""
    want_title = _normalize_match_label(room_title)
    want_board = _normalize_match_label(room_board)
    exclude = (exclude_offer_id or "").strip()
    ranked: list[tuple[tuple[Any, ...], dict[str, Any]]] = []
    seen: set[str] = set()
    for room in rooms:
        if not isinstance(room, dict):
            continue
        oid = str(room.get("offerId") or "").strip()
        if not oid or oid == exclude or oid in seen:
            continue
        seen.add(oid)
        title = _normalize_match_label(
            room.get("title") or room.get("name") or room.get("category")
        )
        board = _normalize_match_label(room.get("board"))
        try:
            price = float(room.get("totalPrice") or room.get("price") or 0)
        except (TypeError, ValueError):
            price = 0.0
        title_score = 0
        if want_title and title:
            if title == want_title:
                title_score = 0
            elif want_title in title or title in want_title:
                title_score = 1
            else:
                title_score = 3
        else:
            title_score = 2
        board_score = 0 if (not want_board or board == want_board) else 1
        if target_price is not None and price > 0:
            price_delta = abs(price - float(target_price))
        else:
            price_delta = price if price > 0 else 1e18
        ranked.append(((title_score, board_score, price_delta, price), room))
        # Also queue any alternate offer ids kept during dedupe.
        for alt in room.get("altOfferIds") or []:
            alt_oid = str(alt or "").strip()
            if not alt_oid or alt_oid == exclude or alt_oid in seen:
                continue
            seen.add(alt_oid)
            alt_room = dict(room)
            alt_room["offerId"] = alt_oid
            ranked.append(((title_score, board_score, price_delta + 0.01, price), alt_room))
    ranked.sort(key=lambda item: item[0])
    return [room for _, room in ranked]


_PREBOOK_RETRY_LIMIT = 20


def _resolve_hotel_payment_sdk(use_payment_sdk: bool | None) -> bool:
    """Always prefer LiteAPI Payment SDK (Stripe). Razorpay is not supported."""
    if use_payment_sdk is not None:
        return bool(use_payment_sdk)
    return (os.getenv("LITEAPI_USE_PAYMENT_SDK") or "true").lower() in {
        "1",
        "true",
        "yes",
    }


def _liteapi_payment_sdk_env() -> str:
    """LiteAPI payment-wrapper publicKey: sandbox | live."""
    key = _api_key().lower()
    if key.startswith("prod_") or key.startswith("live_"):
        return "live"
    if key.startswith("sand_"):
        return "sandbox"
    return "live" if not _is_sandbox_app() else "sandbox"


def _hotel_prebook_response(
    *,
    fields: dict[str, Any],
    offer_id: str,
    currency: str,
    use_sdk: bool,
    voucher_code: str | None = None,
    refreshed: bool = False,
    matched_room: dict[str, Any] | None = None,
) -> dict[str, Any]:
    cur = (currency or "INR").upper()
    raw_pk = fields.get("publishable_key")
    publishable = (raw_pk or "").strip()
    if not publishable.startswith("pk_"):
        env_pk = (
            (os.getenv("STRIPE_PUBLISHABLE_KEY") or "")
            or (os.getenv("STRIPE_PK") or "")
        ).strip()
        publishable = env_pk if env_pk.startswith("pk_") else ""
    client_secret = fields.get("secret_key")
    # Client secret is enough to treat this as Stripe SDK; publishable key may
    # come from the frontend env (VITE_STRIPE_PUBLISHABLE_KEY).
    has_stripe = bool(client_secret and use_sdk)
    ok = bool(fields.get("success") and fields.get("prebook_id"))
    payment_provider = (
        "stripe"
        if has_stripe
        else "credit"
    )
    allow_mock = (
        ok
        and payment_provider != "stripe"
        and _is_sandbox_app()
        and (os.getenv("ITINERO_ALLOW_MOCK_PAYMENT") or "false").lower()
        in {"1", "true", "yes"}
    )
    payment_mode = (
        "stripe"
        if has_stripe
        else ("mock_sandbox" if allow_mock else "unavailable")
    )
    price = fields.get("price")
    if price is None and matched_room:
        price = matched_room.get("totalPrice") or matched_room.get("price")
    msg = "Hold created."
    if has_stripe:
        msg = "Hold created. Complete card payment with Stripe."
    elif allow_mock:
        msg = "Hold created. Sandbox demo payment available."
    elif not ok:
        msg = "Hotel hold did not succeed."
    if ok and refreshed:
        msg = f"{msg} Rate refreshed after the previous offer sold out."
    return {
        "ok": ok,
        "prebook": {
            "prebook_id": fields.get("prebook_id"),
            "price": price,
            "currency": fields.get("currency") or cur,
            "publishable_key": publishable if use_sdk else None,
            "transaction_id": fields.get("transaction_id") if use_sdk else None,
            "client_secret": client_secret if use_sdk else None,
            "has_secret": bool(client_secret) if use_sdk else False,
            "payment_methods": fields.get("payment_methods"),
            "payment_mode": payment_mode,
            "payment_provider": payment_provider,
            "allow_mock_payment": allow_mock,
            "allow_razorpay": False,
            "offer_id": offer_id,
            "voucher_code": voucher_code or None,
            "refreshed_offer": bool(refreshed),
            "sdk_public_key": _liteapi_payment_sdk_env() if use_sdk else None,
            "room_title": (matched_room or {}).get("title") or (matched_room or {}).get("name"),
            "room_board": (matched_room or {}).get("board"),
        },
        "payment_ready": ok and (has_stripe or allow_mock),
        "message": msg if ok else "Hotel hold did not succeed.",
        "error": None if ok else "prebook_failed",
        "mode": payment_mode if ok else "degraded",
        "refreshed": bool(refreshed),
    }


async def _post_hotel_prebook(
    client: httpx.AsyncClient,
    *,
    offer_id: str,
    use_sdk: bool,
    voucher_code: str | None = None,
    addons: list[dict[str, Any]] | None = None,
) -> tuple[int, dict[str, Any]]:
    payload: dict[str, Any] = {"offerId": offer_id, "usePaymentSdk": use_sdk}
    code = (voucher_code or "").strip()
    if code:
        payload["voucherCode"] = code
    if addons:
        payload["addons"] = addons
    r = await client.post(
        f"{_LITEAPI_BOOK_BASE}/rates/prebook",
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-API-Key": _api_key(),
        },
        params={"timeout": 60},
        json=payload,
    )
    body = r.json() if r.content else {}
    return r.status_code, body if isinstance(body, dict) else {}


async def structured_hotel_prebook(
    *,
    offer_id: str,
    voucher_code: str | None = None,
    use_payment_sdk: bool | None = None,
    currency: str = "INR",
    hotel_id: str | None = None,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int | None = None,
    rooms: int | None = None,
    room_title: str | None = None,
    room_board: str | None = None,
    target_price: float | None = None,
    addons: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Hold a hotel rate via LiteAPI POST /rates/prebook.

    Default: LiteAPI Payment SDK (Stripe). Razorpay is not supported.

    When LiteAPI returns sold-out / outdated offer errors, optionally refresh
    live rates for the same stay and retry a close matching offer.
    """
    oid = (offer_id or "").strip()
    if not oid:
        return {"ok": False, "error": "missing_offer", "message": "Missing room offer id."}
    if not _api_key():
        return {
            "ok": False,
            "error": "missing_liteapi_key",
            "message": "Booking isn’t available right now. Try again shortly.",
        }

    cur = (currency or "INR").upper()
    use_sdk = _resolve_hotel_payment_sdk(use_payment_sdk)
    code = (voucher_code or "").strip() or None
    addon_rows = addons or []

    try:
        async with httpx.AsyncClient(timeout=75.0) as client:
            status, body = await _post_hotel_prebook(
                client, offer_id=oid, use_sdk=use_sdk, voucher_code=code, addons=addon_rows
            )
            if status < 400:
                fields = _extract_hotel_prebook_fields(body)
                return _hotel_prebook_response(
                    fields=fields,
                    offer_id=oid,
                    currency=cur,
                    use_sdk=use_sdk,
                    voucher_code=code,
                )

            code_i, desc, msg = _liteapi_error_bits(body)
            err_text = desc or msg or f"Hotel hold failed ({status})."
            availability_miss = _is_prebook_availability_miss(status, body)
            can_refresh = bool(hotel_id and check_in and check_out and availability_miss)
            if not can_refresh:
                friendly = err_text
                if availability_miss:
                    friendly = (
                        "This room rate just sold out. Go back, refresh rooms, and pick another rate."
                    )
                return {
                    "ok": False,
                    "error": "prebook_unavailable" if availability_miss else "prebook_failed",
                    "message": str(friendly)[:400],
                    "details": body,
                    "liteapi_code": code_i,
                    "refresh_skipped": True,
                    "refresh_context": {
                        "hotel_id": bool(hotel_id),
                        "check_in": bool(check_in),
                        "check_out": bool(check_out),
                        "availability_miss": availability_miss,
                    },
                }

            rates = await structured_hotel_rates(
                hotel_id=str(hotel_id).strip(),
                check_in=str(check_in)[:10],
                check_out=str(check_out)[:10],
                guests=max(1, int(guests or 2)),
                rooms=max(1, int(rooms or 1)),
                currency=cur,
            )
            fresh_rooms = rates.get("rooms") if isinstance(rates, dict) else None
            candidates = _rank_fresh_hotel_offers(
                list(fresh_rooms or []),
                exclude_offer_id=oid,
                room_title=room_title,
                room_board=room_board,
                target_price=target_price,
            )
            last_err = body
            tried = 0
            for cand in candidates[:_PREBOOK_RETRY_LIMIT]:
                cand_oid = str(cand.get("offerId") or "").strip()
                if not cand_oid:
                    continue
                tried += 1
                status2, body2 = await _post_hotel_prebook(
                    client, offer_id=cand_oid, use_sdk=use_sdk, voucher_code=code, addons=addon_rows
                )
                if status2 < 400:
                    fields = _extract_hotel_prebook_fields(body2)
                    return _hotel_prebook_response(
                        fields=fields,
                        offer_id=cand_oid,
                        currency=cur,
                        use_sdk=use_sdk,
                        voucher_code=code,
                        refreshed=True,
                        matched_room=cand,
                    )
                last_err = body2
                if not _is_prebook_availability_miss(status2, body2):
                    # Different class of failure — stop hopping offers.
                    break

            _, last_desc, last_msg = _liteapi_error_bits(last_err if isinstance(last_err, dict) else {})
            return {
                "ok": False,
                "error": "prebook_unavailable",
                "message": (
                    "This room rate isn’t available anymore. Go back and pick another room — "
                    "live rates change quickly."
                ),
                "details": last_err if isinstance(last_err, dict) else {"error": last_desc or last_msg},
                "tried_offers": tried,
                "hotel_id": hotel_id,
                "check_in": check_in,
                "check_out": check_out,
            }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": "prebook_error",
            "message": f"Hotel hold failed ({type(exc).__name__}).",
        }


async def structured_hotel_book(
    *,
    prebook_id: str,
    holder: dict[str, Any],
    guests: list[dict[str, Any]] | None = None,
    transaction_id: str | None = None,
    mock_payment: bool = False,
    payment_provider: str | None = None,
    payment_id: str | None = None,
    expected_amount: float | None = None,
    allow_agency_credit: bool = False,
) -> dict[str, Any]:
    """Confirm hotel stay via LiteAPI POST /rates/book.

    Stripe / LiteAPI Payment SDK: require transaction_id after card confirm.
    Razorpay is disabled; clients must use Stripe / Payment SDK.
    Agency CREDIT only when ``allow_agency_credit`` (package settle after verified pay).
    Never invent a successful booking without hold + payment proof (or sandbox mock).
    """
    pid = (prebook_id or "").strip()
    if not pid:
        return {"ok": False, "error": "missing_prebook", "message": "Missing hotel hold id."}
    if not _api_key():
        return {"ok": False, "error": "missing_liteapi_key", "message": "Booking isn’t available right now. Try again shortly."}

    provider = (payment_provider or "").strip().lower()
    pay_id = (payment_id or "").strip()
    tid = (transaction_id or "").strip()
    if provider == "razorpay":
        return {
            "ok": False,
            "error": "razorpay_disabled",
            "message": "Complete card payment on this page.",
        }
    if provider == "stripe" and not tid and not mock_payment:
        return {
            "ok": False,
            "error": "payment_required",
            "message": "Stripe payment must be completed before confirming the stay.",
        }
    if mock_payment:
        from supervisor.payment_guards import assert_mock_payment_allowed

        blocked = assert_mock_payment_allowed(mock_payment=True)
        if blocked:
            return blocked
    # Public hotel book must never settle on agency CREDIT without an explicit
    # post-payment settle flag (packages set allow_agency_credit after verifying Itinero pay).
    if not mock_payment and provider in {"", "credit"} and not allow_agency_credit:
        return {
            "ok": False,
            "error": "payment_required",
            "message": "Complete card payment before confirming the stay.",
        }

    first = (holder.get("firstName") or holder.get("first_name") or "Guest").strip()
    last = (holder.get("lastName") or holder.get("last_name") or "Traveller").strip()
    email = (holder.get("email") or "guest@itinero.local").strip()
    holder_payload = {"firstName": first, "lastName": last, "email": email}
    guest_rows = guests or [
        {
            "occupancyNumber": 1,
            "firstName": first,
            "lastName": last,
            "email": email,
        }
    ]
    book_payload: dict[str, Any] = {
        "prebookId": pid,
        "holder": holder_payload,
        "guests": guest_rows,
    }
    if tid and provider == "stripe" and not mock_payment:
        book_payload["transactionId"] = tid
        book_payload["payment"] = {
            "method": "TRANSACTION_ID",
            "transactionId": tid,
        }
    # CREDIT / sandbox mock: no Stripe transactionId on LiteAPI book
    if provider == "credit" or mock_payment:
        book_payload.pop("transactionId", None)
        book_payload.pop("payment", None)

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{_LITEAPI_BOOK_BASE}/rates/book",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-API-Key": _api_key(),
                },
                json=book_payload,
            )
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                is_sand = str(_api_key() or "").startswith("sand_") or (os.getenv("APP_ENV") or "").lower() not in ("production", "prod")
                if is_sand and (allow_agency_credit or mock_payment):
                    synth_id = f"bkg_pkg_{uuid.uuid4().hex[:10]}"
                    return {
                        "ok": True,
                        "booking": {
                            "booking_id": synth_id,
                            "prebook_id": pid,
                            "status": "CONFIRMED",
                            "hotel_confirmation_code": f"HTL-{uuid.uuid4().hex[:8].upper()}",
                            "price": expected_amount or 0.0,
                            "currency": "INR",
                            "payment_provider": provider or "stripe",
                            "payment_id": pay_id or None,
                            "addons": [],
                            "raw": body if isinstance(body, dict) else {},
                        },
                        "message": "Stay confirmed (sandbox credit).",
                        "error": None,
                        "mode": "sandbox",
                    }
                msg = (
                    (body.get("error") or {}).get("description")
                    if isinstance(body.get("error"), dict)
                    else None
                )
                msg = msg or body.get("message") or f"Hotel book failed ({r.status_code})."
                return {
                    "ok": False,
                    "error": "book_failed",
                    "message": str(msg)[:400],
                    "details": body if isinstance(body, dict) else {},
                }
            data = body.get("data") if isinstance(body.get("data"), dict) else body
            if isinstance(body.get("data"), list) and body["data"]:
                data = body["data"][0]
            if not isinstance(data, dict):
                data = {}
            booking_id = _first_str(
                data.get("bookingId"),
                data.get("hotelBookingId"),
                data.get("id"),
                data.get("booking_id"),
            )
            status = data.get("status") or ("BOOKED" if booking_id else "UNKNOWN")
            from supervisor.liteapi_addons import normalize_booking_addons

            addons_out = normalize_booking_addons(data)
            return {
                "ok": bool(booking_id),
                "booking": {
                    "booking_id": booking_id,
                    "prebook_id": pid,
                    "status": status,
                    "hotel_confirmation_code": data.get("hotelConfirmationCode")
                    or data.get("confirmationCode"),
                    "checkin": data.get("checkin") or data.get("checkIn"),
                    "checkout": data.get("checkout") or data.get("checkOut"),
                    "price": data.get("price") or data.get("amount") or expected_amount,
                    "currency": data.get("currency"),
                    "payment_provider": provider or ("mock" if mock_payment else None),
                    "payment_id": pay_id or None,
                    "addons": addons_out,
                    "raw": data,
                },
                "message": "Stay confirmed." if booking_id else "Book succeeded without booking id.",
                "error": None if booking_id else "book_incomplete",
                "mode": "sandbox" if mock_payment else "live",
            }
    except Exception as exc:
        traceback.print_exc()
        return {
            "ok": False,
            "error": "book_error",
            "message": f"Hotel book failed ({type(exc).__name__}).",
        }


async def structured_hotel_get_booking(*, booking_id: str) -> dict[str, Any]:
    """GET LiteAPI /bookings/{id} for a hotel stay."""
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "error": "missing_booking_id"}
    if not _api_key():
        return {"ok": False, "error": "missing_liteapi_key"}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(
                f"{_LITEAPI_BOOK_BASE}/bookings/{bid}",
                headers={"Accept": "application/json", "X-API-Key": _api_key()},
            )
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                return {
                    "ok": False,
                    "error": "get_failed",
                    "message": str(body.get("message") or f"HTTP {r.status_code}"),
                    "status_code": r.status_code,
                }
            data = body.get("data") if isinstance(body.get("data"), dict) else body
            if isinstance(body.get("data"), list) and body["data"]:
                data = body["data"][0]
            if not isinstance(data, dict):
                data = {}
            return {
                "ok": True,
                "booking": {
                    "booking_id": data.get("bookingId") or data.get("id") or bid,
                    "status": data.get("status"),
                    "hotel_confirmation_code": data.get("hotelConfirmationCode"),
                    "checkin": data.get("checkin") or data.get("checkIn"),
                    "checkout": data.get("checkout") or data.get("checkOut"),
                    "price": data.get("price") or data.get("amount"),
                    "currency": data.get("currency"),
                    "raw": data,
                },
            }
    except Exception as exc:
        traceback.print_exc()
        return {"ok": False, "error": type(exc).__name__, "message": str(exc)[:200]}


async def structured_hotel_cancel_booking(
    *,
    booking_id: str,
    payment_id: str | None = None,
    expected_amount: float | None = None,
    payment_provider: str | None = None,
) -> dict[str, Any]:
    """PUT LiteAPI /bookings/{id} — cancel hotel; refund via LiteAPI or Itinero Stripe."""
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "error": "missing_booking_id"}
    if not _api_key():
        return {"ok": False, "error": "missing_liteapi_key"}
    try:
        from supervisor.payment_routing import (
            customer_refund_rail,
            maybe_refund_customer_after_cancel,
        )

        async with httpx.AsyncClient(timeout=40.0) as client:
            r = await client.put(
                f"{_LITEAPI_BOOK_BASE}/bookings/{bid}",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-API-Key": _api_key(),
                },
                json={},
            )
            body = r.json() if r.content else {}
            if r.status_code >= 400:
                return {
                    "ok": False,
                    "error": "cancel_failed",
                    "message": str(body.get("message") or f"HTTP {r.status_code}"),
                    "details": body if isinstance(body, dict) else {},
                }
            data = body.get("data") if isinstance(body.get("data"), dict) else body
            if isinstance(body.get("data"), list) and body["data"]:
                data = body["data"][0]
            if not isinstance(data, dict):
                data = {}
            status = str(data.get("status") or "CANCELLED")
            fee = data.get("cancellation_fee")
            if fee is None:
                fee = data.get("cancellationFee")
            refund_amt = data.get("refund_amount")
            if refund_amt is None:
                refund_amt = data.get("refundAmount")
            currency = data.get("currency") or "INR"
            destination = (
                data.get("destination") or data.get("refund_destination") or "original_payment"
            )
            vouchers = data.get("vouchers") or []
            rail = customer_refund_rail(
                payment_id=payment_id,
                payment_provider=payment_provider,
            )
            liteapi_handles_refund = rail == "liteapi"
            dest = str(destination or "original_payment").replace("_", " ")
            message = "Hotel booking cancelled."
            stripe_refund: dict[str, Any] | None = None

            if rail == "itinero_stripe":
                use_amt = refund_amt if refund_amt is not None else expected_amount
                stripe_refund = await maybe_refund_customer_after_cancel(
                    payment_id=payment_id,
                    payment_provider=payment_provider,
                    amount=float(use_amt) if use_amt is not None else None,
                    currency=currency,
                    booking_id=bid,
                )
                if stripe_refund.get("ok") and not stripe_refund.get("skipped"):
                    amt = stripe_refund.get("refund_amount")
                    message = (
                        f"Stay cancelled. Refund of {amt} {stripe_refund.get('currency') or currency} "
                        "sent to your original card via Stripe."
                        if amt is not None
                        else "Stay cancelled. Stripe refund submitted to your original card."
                    )
                elif stripe_refund.get("skipped") and stripe_refund.get("message"):
                    message = f"Stay cancelled. {stripe_refund['message']}"
                elif not stripe_refund.get("ok"):
                    message = (
                        "Stay cancelled, but Stripe refund failed: "
                        f"{stripe_refund.get('message') or 'contact support'}."
                    )
            elif liteapi_handles_refund:
                if refund_amt is not None:
                    message = (
                        f"Stay cancelled. Refund {refund_amt} {currency} → {dest}."
                    )
                else:
                    message = (
                        f"Stay cancelled. Any refund is credited to {dest} per policy."
                    )
            elif rail == "legacy_unsupported":
                message = (
                    "Stay cancelled. Legacy payment cannot be auto-refunded — contact support."
                )

            out_refund = (
                (stripe_refund or {}).get("refund_amount")
                if stripe_refund and stripe_refund.get("ok")
                else refund_amt
            )
            return {
                "ok": True,
                "booking": {
                    "booking_id": data.get("bookingId") or bid,
                    "status": status,
                    "cancellation_fee": fee,
                    "refund_amount": out_refund,
                    "currency": currency,
                    "destination": destination,
                    "vouchers": vouchers,
                    "cancellation": data.get("cancellation") or data.get("cancellationDetails"),
                    "raw": data,
                },
                "cancellation": {
                    "status": status,
                    "cancellation_fee": fee,
                    "refund_amount": out_refund,
                    "currency": currency,
                    "destination": destination,
                    "pending": False,
                    "liteapi_auto_refund": liteapi_handles_refund,
                    "refund_rail": rail,
                },
                "itinero_stripe_refund": stripe_refund,
                "pending": False,
                "message": message,
            }
    except Exception as exc:
        traceback.print_exc()
        return {"ok": False, "error": type(exc).__name__, "message": str(exc)[:200]}


async def structured_hotel_amend_guest(
    *,
    booking_id: str,
    holder: dict[str, Any] | None = None,
    guests: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Soft amend: guest name/email via LiteAPI PUT /bookings/{id}/amend."""
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "error": "missing_booking_id"}
    if not _api_key():
        return {"ok": False, "error": "missing_liteapi_key"}
    body: dict[str, Any] = {}
    if isinstance(holder, dict) and holder:
        body["holder"] = holder
    if isinstance(guests, list) and guests:
        body["guests"] = guests
    if not body:
        return {"ok": False, "error": "missing_guest_fields", "message": "Provide holder or guests."}
    try:
        async with httpx.AsyncClient(timeout=40.0) as client:
            r = await client.put(
                f"{_LITEAPI_BOOK_BASE}/bookings/{bid}/amend",
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-API-Key": _api_key(),
                },
                json=body,
            )
            payload = r.json() if r.content else {}
            if r.status_code >= 400:
                return {
                    "ok": False,
                    "error": "amend_failed",
                    "message": str(payload.get("message") or f"HTTP {r.status_code}"),
                    "status_code": r.status_code,
                }
            data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
            return {"ok": True, "kind": "guest", "booking": data or payload, "booking_id": bid}
    except Exception as exc:
        traceback.print_exc()
        return {"ok": False, "error": type(exc).__name__, "message": str(exc)[:200]}


async def structured_hotel_amend_dates(
    *,
    booking_id: str,
    check_in: str,
    check_out: str,
    occupancies: list[dict[str, Any]] | None = None,
    prebook_id: str | None = None,
    guest_info: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Hard amend: quote alternative prebooks, then confirm with prebook_id."""
    bid = (booking_id or "").strip()
    cin = (check_in or "").strip()[:10]
    cout = (check_out or "").strip()[:10]
    if not bid or not cin or not cout:
        return {"ok": False, "error": "missing_dates", "message": "booking_id, check_in and check_out are required."}
    if not _api_key():
        return {"ok": False, "error": "missing_liteapi_key"}
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": _api_key(),
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            if not (prebook_id or "").strip():
                r = await client.get(
                    f"{_LITEAPI_BOOK_BASE}/bookings/{bid}/alternative-prebooks",
                    headers=headers,
                    params={"checkin": cin, "checkout": cout},
                )
                payload = r.json() if r.content else {}
                if r.status_code >= 400:
                    return {
                        "ok": False,
                        "error": "amend_quote_failed",
                        "message": str(payload.get("message") or f"HTTP {r.status_code}"),
                        "status_code": r.status_code,
                    }
                data = payload.get("data") if payload.get("data") is not None else payload
                offers = data if isinstance(data, list) else (data.get("prebooks") or data.get("offers") or [])
                return {
                    "ok": True,
                    "kind": "date_quote",
                    "booking_id": bid,
                    "check_in": cin,
                    "check_out": cout,
                    "offers": offers if isinstance(offers, list) else [],
                    "raw": data,
                }

            confirm_body: dict[str, Any] = {
                "prebookId": (prebook_id or "").strip(),
                "checkin": cin,
                "checkout": cout,
            }
            if occupancies:
                confirm_body["occupancies"] = occupancies
            if isinstance(guest_info, dict) and guest_info:
                confirm_body.update(guest_info)
            r = await client.post(
                f"{_LITEAPI_BOOK_BASE}/bookings/{bid}/amend",
                headers=headers,
                json=confirm_body,
            )
            payload = r.json() if r.content else {}
            if r.status_code >= 400:
                return {
                    "ok": False,
                    "error": "amend_confirm_failed",
                    "message": str(payload.get("message") or f"HTTP {r.status_code}"),
                    "status_code": r.status_code,
                }
            data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
            return {
                "ok": True,
                "kind": "date_confirm",
                "booking_id": bid,
                "check_in": cin,
                "check_out": cout,
                "booking": data or payload,
            }
    except Exception as exc:
        traceback.print_exc()
        return {"ok": False, "error": type(exc).__name__, "message": str(exc)[:200]}
