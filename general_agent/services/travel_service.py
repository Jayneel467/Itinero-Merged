"""
Business logic + response normalization for travel data.

Tools in llm/tools.py are thin - they just call these functions and return
plain strings for the LLM. All the "what do we do with a hotel search
result" parsing/formatting logic lives here, not in the tool layer, so it
can be reused outside the LangChain tool-calling path later (a future API
endpoint, a different agent framework, etc.) without duplicating logic.
"""
from typing import Optional

from general_agent.exceptions import ProviderRequestError

from providers import google_maps_provider, weather_provider


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
# NOTE: the old direct search_hotels()/search_flights() tool implementations
# that used to live here were removed — general_agent/llm/tools.py's
# search_flights/search_hotels tools now call
# services/quick_search_service.py instead (which reuses ITINERARY_AGENT's
# own FlightAgent/HotelAgent search code, plus resolves city names to the
# IATA/country codes LiteAPI's real endpoints require — see
# services/location_resolver.py). The helpers below (_format_hhmm,
# _format_duration, _parse_journey) are kept: ITINERARY_AGENT's own
# flight_agent.py imports _parse_journey directly from this module, so it
# must stay even though this file's own former callers are gone.
# ---------------------------------------------------------------------------

def _format_hhmm(iso_time: str) -> str:
    """Extract HH:MM from an ISO datetime string like '2026-08-15T23:35:00'."""
    try:
        return iso_time[11:16]
    except (IndexError, TypeError):
        return iso_time or "?"


def _format_duration(minutes: int) -> str:
    """Convert total minutes to a readable string like '2h 10m'."""
    if not minutes:
        return ""
    h, m = divmod(int(minutes), 60)
    if h and m:
        return f"{h}h {m}m"
    return f"{h}h" if h else f"{m}m"


def _parse_journey(journey: dict, currency: str) -> Optional[dict]:
    """
    Parse one journey object from the real LiteAPI response shape:
      journey.cheapestOffer.pricing.display.total  -> price
      journey.segments[]                           -> airline, times, stops
      journey.totalDuration.minutes                -> flight duration
    Returns None if the journey can't be parsed (missing price).
    """
    cheapest = journey.get("cheapestOffer") or {}
    display = cheapest.get("pricing", {}).get("display", {})
    price = display.get("total")
    if price is None:
        return None

    segments = journey.get("segments") or []
    if not segments:
        return None

    first = segments[0]
    last = segments[-1]
    carrier = first.get("carrier", {})
    flight = first.get("flight", {})

    airline_name = carrier.get("marketingName", "")
    airline_code = carrier.get("marketingCode", "")
    flight_number = flight.get("marketingNumber", "")
    flight_code = f"{airline_code}{flight_number}".strip()

    dep_time = _format_hhmm(first.get("departureTime", ""))
    arr_time = _format_hhmm(last.get("arrivalTime", ""))
    origin_code = first.get("originCode", "")
    dest_code = last.get("destinationCode", "")

    duration_mins = journey.get("totalDuration", {}).get("minutes")
    duration_str = _format_duration(duration_mins)

    stops = len(segments) - 1
    stops_str = "Direct" if stops == 0 else f"{stops} stop{'s' if stops > 1 else ''}"

    baggage = cheapest.get("baggage", {})
    has_checked = baggage.get("hasCheckedBag", False)

    terms = cheapest.get("terms", {})
    refundable = terms.get("refundable")

    fare_family = cheapest.get("fare", {}).get("family", "")

    return {
        "price": price,
        "currency": display.get("currency", currency),
        "airline": airline_name,
        "flight_code": flight_code,
        "dep_time": dep_time,
        "arr_time": arr_time,
        "origin": origin_code,
        "dest": dest_code,
        "duration": duration_str,
        "stops": stops_str,
        "has_checked_bag": has_checked,
        "refundable": refundable,
        "fare_family": fare_family,
    }


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
def search_places_summary(query: str, max_results: int = 5) -> str:
    try:
        body = google_maps_provider.search_places_text(query, max_results)
    except ProviderRequestError as e:
        return f"Place search failed: {e}"

    places = body.get("places") or []
    if not places:
        return f"No places found for '{query}'."

    lines = [f"Places for '{query}':"]
    for p in places[:max_results]:
        name = p.get("displayName", {}).get("text", "Unknown")
        address = p.get("formattedAddress", "")
        rating = p.get("rating")
        rating_count = p.get("userRatingCount")
        open_now = p.get("currentOpeningHours", {}).get("openNow")

        rating_str = f", {rating}★ ({rating_count} reviews)" if rating else ""
        open_str = " · open now" if open_now is True else (" · closed now" if open_now is False else "")
        address_str = f" — {address}" if address else ""
        lines.append(f"- {name}{rating_str}{open_str}{address_str}")
    return "\n".join(lines)


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
