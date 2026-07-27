"""
Business logic + response normalization for travel data.

Tools in llm/tools.py are thin - they just call these functions and return
plain strings for the LLM. All the "what do we do with a hotel search
result" parsing/formatting logic lives here, not in the tool layer, so it
can be reused outside the LangChain tool-calling path later (a future API
endpoint, a different agent framework, etc.) without duplicating logic.
"""
from typing import Optional
import json
import re

from general_agent.exceptions import ProviderRequestError
from providers import liteapi_provider, google_maps_provider, weather_provider


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
def get_weather_summary(city: str) -> str:
    try:
        data = weather_provider.get_current_weather(city)
    except ProviderRequestError as e:
        return f"Could not fetch weather for '{city}': {e}"

    desc = data["weather"][0]["description"]
    temp = data["main"]["temp"]
    feels_like = data["main"]["feels_like"]
    humidity = data["main"]["humidity"]
    return (
        f"Weather in {city}: {desc}, {temp}°C (feels like {feels_like}°C), "
        f"humidity {humidity}%."
    )


# ---------------------------------------------------------------------------
# Hotels (LiteAPI /hotels/rates) - search only, no booking
# ---------------------------------------------------------------------------
def search_hotels(
    city_name: str,
    country_code: str,
    checkin: str,
    checkout: str,
    adults: int = 2,
    currency: str = "USD",
    guest_nationality: str = "US",
    max_price: Optional[float] = None,
    min_rating: Optional[float] = None,
    room_type: Optional[str] = None,
    max_results: int = 5,
) -> str:
    payload = {
        "checkin": checkin,
        "checkout": checkout,
        "currency": currency,
        "guestNationality": guest_nationality,
        "occupancies": [{"adults": adults}],
        "cityName": city_name,
        "countryCode": country_code,
        "maxRatesPerHotel": 1,
        "includeHotelData": True,
        # Pull a wider pool than max_results since we filter by price/rating
        # on our side after the fact.
        "limit": max(max_results * 4, 20),
    }
    if min_rating is not None:
        payload["minRating"] = min_rating
    if room_type:
        payload["bedTypes"] = [room_type]

    try:
        body = liteapi_provider.search_hotel_rates(payload)
    except ProviderRequestError as e:
        return f"Hotel search failed: {e}"

    rate_entries = body.get("data") or []
    if not rate_entries:
        return f"No hotels with available rates found in {city_name} for {checkin} to {checkout}."

    # `hotels` carries display metadata (name, address, rating), keyed by hotel id.
    hotel_meta = {h.get("id"): h for h in body.get("hotels", [])}

    results = []
    for entry in rate_entries:
        hotel_id = entry.get("hotelId")
        room_types = entry.get("roomTypes") or []
        if not room_types:
            continue

        cheapest = None
        for rt in room_types:
            for rate in rt.get("rates", []):
                total = rate.get("retailRate", {}).get("total", [])
                amount = total[0].get("amount") if total else None
                if amount is None:
                    continue
                if cheapest is None or amount < cheapest["amount"]:
                    cheapest = {
                        "amount": amount,
                        "room_name": rate.get("name", "Room"),
                        "board": rate.get("boardName", ""),
                        "refundable": rate.get("cancellationPolicies", {}).get("refundableTag") == "RFN",
                    }
        if cheapest is None:
            continue
        if max_price is not None and cheapest["amount"] > max_price:
            continue

        meta = hotel_meta.get(hotel_id, {})
        results.append(
            {
                "name": meta.get("name", "Unknown hotel"),
                "address": meta.get("address", ""),
                "rating": meta.get("rating"),
                "price": cheapest["amount"],
                "room_name": cheapest["room_name"],
                "board": cheapest["board"],
                "refundable": cheapest["refundable"],
            }
        )

    if not results:
        budget_note = f" under {max_price} {currency}" if max_price is not None else ""
        return f"Found hotels in {city_name}, but none{budget_note} matched the criteria given."

    results.sort(key=lambda h: h["price"])
    results = results[:max_results]

    lines = [f"Hotels in {city_name} ({checkin} to {checkout}, {adults} adult(s)):"]
    for h in results:
        rating_str = f", rated {h['rating']}" if h.get("rating") else ""
        refund_str = "refundable" if h["refundable"] else "non-refundable"
        address_str = f" — {h['address']}" if h["address"] else ""
        lines.append(
            f"- {h['name']}{rating_str} — {h['room_name']} ({h['board']}), "
            f"{h['price']:.2f} {currency} total, {refund_str}{address_str}"
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Flights (LiteAPI /flights/rates) - search only, no booking
# ---------------------------------------------------------------------------
def _summarize_flight_offer(offer: dict, currency: str) -> Optional[str]:
    """
    Best-effort extraction of price/airline/duration from a flight offer.

    NOTE: LiteAPI's flight offer response shape wasn't fully confirmed from
    public docs at the time this was written (the request shape is
    documented, the response fields are not spelled out in detail). This
    reads a few likely key names and returns None instead of crashing if it
    can't find a price. Verify against one real sandbox response and adjust
    the key names below if needed.
    """
    price = None
    price_field = offer.get("price")
    if isinstance(price_field, dict):
        price = price_field.get("total") or price_field.get("amount")
    elif isinstance(price_field, (int, float)):
        price = price_field
    if price is None:
        price = offer.get("totalPrice") or offer.get("total")

    if price is None:
        return None

    airline = (
        offer.get("airline")
        or offer.get("carrier")
        or offer.get("marketingCarrier")
        or offer.get("validatingCarrier")
    )
    duration = offer.get("duration") or offer.get("totalDuration")
    stops = offer.get("stops")

    parts = [f"{price} {currency}"]
    if airline:
        parts.append(str(airline))
    if duration:
        parts.append(str(duration))
    if stops is not None:
        parts.append("nonstop" if stops == 0 else f"{stops} stop(s)")
    return " · ".join(parts)


def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
    adults: int = 1,
    cabin_class: str = "ECONOMY",
    currency: str = "USD",
    max_results: int = 5,
) -> str:
    legs = [
        {"origin": origin, "destination": destination, "date": departure_date, "direction": "OUTBOUND"}
    ]
    if return_date:
        legs.append(
            {"origin": destination, "destination": origin, "date": return_date, "direction": "INBOUND"}
        )

    payload = {
        "legs": legs,
        "adults": adults,
        "currency": currency,
        "cabinClass": cabin_class,
    }

    try:
        body = liteapi_provider.search_flight_rates(payload)
    except ProviderRequestError as e:
        return f"Flight search failed: {e}"

    offers = body.get("data") or body.get("offers") or []
    if not offers:
        return f"No flights found from {origin} to {destination} on {departure_date}."

    trip_desc = f"{origin} to {destination} on {departure_date}"
    if return_date:
        trip_desc += f" (returning {return_date})"

    lines = [f"Flights from {trip_desc}:"]
    shown = 0
    for offer in offers:
        if shown >= max_results:
            break
        summary = _summarize_flight_offer(offer, currency)
        if summary:
            lines.append(f"- {summary}")
            shown += 1

    if shown == 0:
        return (
            f"Found {len(offers)} flight offer(s) from {trip_desc}, but couldn't "
            "parse the price/airline details from the response format. This "
            "needs a quick check against a real LiteAPI response to fix the parser."
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Route / distance (Google Routes API)
# ---------------------------------------------------------------------------
def get_route_summary(origin: str, destination: str, mode: str = "DRIVE") -> str:
    try:
        body = google_maps_provider.compute_route(origin, destination, mode)
    except ProviderRequestError as e:
        return f"Route lookup failed: {e}"

    routes = body.get("routes") or []
    if not routes:
        return f"Could not find a route from {origin} to {destination}."

    route = routes[0]
    distance_km = route.get("distanceMeters", 0) / 1000
    duration_raw = route.get("duration", "0s")  # e.g. "16800s"
    duration_seconds = int(duration_raw.rstrip("s")) if duration_raw.endswith("s") else 0
    hours, minutes = divmod(duration_seconds // 60, 60)

    return (
        f"{origin} to {destination} ({mode.title()}): {distance_km:.1f} km one way, "
        f"about {hours}h {minutes}m."
    )


# ---------------------------------------------------------------------------
# Place search (Google Places API New)
# ---------------------------------------------------------------------------
_PRICE_LABELS = {
    "PRICE_LEVEL_FREE": "free",
    "PRICE_LEVEL_INEXPENSIVE": "₹",
    "PRICE_LEVEL_MODERATE": "₹₹",
    "PRICE_LEVEL_EXPENSIVE": "₹₹₹",
    "PRICE_LEVEL_VERY_EXPENSIVE": "₹₹₹₹",
}

# Prefer human-readable food/venue types over generic Place types.
_TYPE_LABELS = {
    "restaurant": "restaurant",
    "cafe": "cafe",
    "coffee_shop": "coffee shop",
    "bakery": "bakery",
    "bar": "bar",
    "meal_takeaway": "takeaway",
    "meal_delivery": "delivery",
    "fine_dining_restaurant": "fine dining",
    "fast_food_restaurant": "fast food",
    "indian_restaurant": "Indian",
    "vegetarian_restaurant": "vegetarian",
    "seafood_restaurant": "seafood",
    "pizza_restaurant": "pizza",
    "chinese_restaurant": "Chinese",
    "italian_restaurant": "Italian",
    "japanese_restaurant": "Japanese",
    "thai_restaurant": "Thai",
    "mexican_restaurant": "Mexican",
    "american_restaurant": "American",
    "mediterranean_restaurant": "Mediterranean",
    "steak_house": "steakhouse",
    "sushi_restaurant": "sushi",
    "ice_cream_shop": "ice cream",
    "street_food": "street food",
}


def _place_type_label(place: dict) -> str:
    primary = (place.get("primaryType") or "").strip()
    if primary in _TYPE_LABELS:
        return _TYPE_LABELS[primary]
    if primary:
        return primary.replace("_", " ")
    for t in place.get("types") or []:
        if t in _TYPE_LABELS:
            return _TYPE_LABELS[t]
    return ""


def _short_area(address: str) -> str:
    """Prefer neighbourhood / locality over the full postal address."""
    if not address:
        return ""
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if len(parts) >= 3:
        # e.g. "Shop 12, Linking Road, Bandra West, Mumbai, ..." → Linking Road, Bandra West
        return ", ".join(parts[-4:-2] if len(parts) >= 4 else parts[:2])
    return parts[0] if parts else address


# Machine-readable block appended to search_places tool output so the
# supervisor can attach structured `places[]` for Vero restaurant cards.
PLACES_JSON_START = "<<<PLACES_JSON>>>"
PLACES_JSON_END = "<<<END_PLACES_JSON>>>"


def normalize_place(place: dict) -> dict:
    """Map a Google Places (New) result into the Vero card schema."""
    address = (place.get("formattedAddress") or "").strip()
    open_now = (place.get("currentOpeningHours") or {}).get("openNow")
    if open_now is not True and open_now is not False:
        open_now = None
    return {
        "name": (place.get("displayName") or {}).get("text") or "Unknown",
        "rating": place.get("rating"),
        "rating_count": place.get("userRatingCount"),
        "type": _place_type_label(place) or None,
        "price": _PRICE_LABELS.get(place.get("priceLevel") or "", "") or None,
        "open_now": open_now,
        "area": _short_area(address) or None,
        "address": address or None,
        "maps_url": (place.get("googleMapsUri") or "").strip() or None,
        "website_url": (place.get("websiteUri") or "").strip() or None,
    }


def search_places_list(query: str, max_results: int = 8) -> list[dict]:
    """Structured place results for chat cards / APIs."""
    body = google_maps_provider.search_places_text(query, max_results)
    raw = body.get("places") or []
    return [normalize_place(p) for p in raw[:max_results]]


def search_places_summary(query: str, max_results: int = 8) -> str:
    try:
        places = search_places_list(query, max_results)
    except ProviderRequestError as e:
        return f"Place search failed: {e}"

    if not places:
        return f"No places found for '{query}'."

    lines = [
        f"Places for '{query}' ({len(places)} results). "
        "The chat UI will render these as cards. "
        "Your reply to the user should be ONE short warm intro only "
        "(e.g. 'Here are great places in Bangalore:') — do NOT list venues, "
        "Maps/Website markdown links, or full addresses. "
        "Do NOT replace with blog listicles."
    ]
    for p in places:
        bits = []
        if p.get("rating"):
            rc = p.get("rating_count")
            bits.append(f"{p['rating']}★" + (f" ({rc})" if rc else ""))
        if p.get("type"):
            bits.append(p["type"])
        if p.get("price"):
            bits.append(p["price"])
        if p.get("open_now") is True:
            bits.append("open now")
        elif p.get("open_now") is False:
            bits.append("closed now")
        if p.get("area"):
            bits.append(p["area"])
        meta = " · ".join(bits)
        lines.append(f"- {p['name']}" + (f" — {meta}" if meta else ""))

    # Trailing machine block (LLM should ignore; supervisor extracts it).
    lines.append(PLACES_JSON_START)
    lines.append(json.dumps(places, ensure_ascii=False))
    lines.append(PLACES_JSON_END)
    return "\n".join(lines)


def extract_places_json(text: str) -> list[dict]:
    """Parse <<<PLACES_JSON>>>…<<<END_PLACES_JSON>>> from tool output."""
    if not text or PLACES_JSON_START not in text:
        return []

    match = re.search(
        re.escape(PLACES_JSON_START) + r"\s*(.*?)\s*" + re.escape(PLACES_JSON_END),
        text,
        flags=re.DOTALL,
    )
    if not match:
        return []
    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    return [p for p in data if isinstance(p, dict) and p.get("name")]


# ---------------------------------------------------------------------------
# Geocoding (Google Geocoding API)
# ---------------------------------------------------------------------------
def geocode_summary(place: str) -> str:
    try:
        body = google_maps_provider.geocode(place)
    except ProviderRequestError as e:
        return f"Geocoding failed: {e}"

    results = body.get("results") or []
    if not results:
        return f"Could not geocode '{place}'."

    top = results[0]
    location = top.get("geometry", {}).get("location", {})
    return (
        f"{top.get('formatted_address', place)} "
        f"(lat {location.get('lat')}, lng {location.get('lng')})"
    )
