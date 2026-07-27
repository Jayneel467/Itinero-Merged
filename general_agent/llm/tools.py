"""
LangChain tool definitions bound to the agent's LLM.

Kept thin on purpose: each function does no parsing itself, it just calls
straight into services/travel_service.py, which owns all the actual
request-building/formatting logic. Add a new tool here, then list it in
ALL_TOOLS - that's the only other place that needs to know about it.

Flight and hotel search hit LiteAPI directly (search only - no
prebook/book calls anywhere in this codebase on purpose). Booking is a
separate, deliberate step the team is building elsewhere.
"""
import logging
from typing import Optional

from langchain_core.tools import tool
from langchain_tavily import TavilySearch

from services import travel_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Destination / general knowledge search
# ---------------------------------------------------------------------------
# Reads TAVILY_API_KEY from the environment automatically (config.py already
# calls load_dotenv() before this module is imported).
tavily_search = TavilySearch(
    max_results=5,
    name="destination_search",
    description=(
        "Search the web for up-to-date destination information: attractions, "
        "sightseeing spots, local events, travel advisories, visa rules, "
        "opening hours, famous local dishes / food culture "
        "(e.g. 'what is Surat locho', 'Gujarati thali dishes'), "
        "or anything about a place the agent doesn't already know confidently. "
        "Do NOT use this as the primary tool for restaurant / where-to-eat lists — "
        "call search_places first for real venues. Only fall back here if "
        "search_places fails, and then extract named restaurants (prefer map links), "
        "never answer with blog roundup / listicle URLs alone. "
        "Input should be a focused search query."
    ),
)


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
@tool
def get_weather(city: str) -> str:
    """
    Get the current weather for a city.
    Use this whenever the user asks about weather, climate, or what to pack
    for a specific destination.

    Args:
        city: City name, optionally with country code, e.g. "Goa,IN".
    """
    return travel_service.get_weather_summary(city)


# ---------------------------------------------------------------------------
# Hotels (LiteAPI) - search only, no booking
# ---------------------------------------------------------------------------
@tool
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
    """
    Search real, live hotel availability and prices via LiteAPI. Search only
    - this never books or reserves anything.

    Use this whenever the user asks what hotels are available, wants options
    under a budget, wants a specific room type, or wants prices/ratings for a
    destination. If exact dates are not given, use a reasonable upcoming window
    (e.g. 2 weeks from today for 2 nights) and note the assumption.

    Args:
        city_name: City to search in, e.g. "Goa".
        country_code: ISO 2-letter country code, e.g. "IN".
        checkin: Check-in date, YYYY-MM-DD.
        checkout: Check-out date, YYYY-MM-DD.
        adults: Number of adults sharing the room(s). Defaults to 2.
        currency: ISO currency code for prices. Defaults to "USD".
        guest_nationality: Guest's nationality as ISO 2-letter country code. Defaults to "US".
        max_price: Optional. Only return hotels whose cheapest available room is at or below this total price.
        min_rating: Optional star rating floor (0-5 scale) to filter by.
        room_type: Optional bed/room type keyword, e.g. "double", "king", "twin", "queen", "single".
        max_results: Maximum number of hotels to return, sorted cheapest first. Defaults to 5.
    """
    return travel_service.search_hotels(
        city_name=city_name,
        country_code=country_code,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        currency=currency,
        guest_nationality=guest_nationality,
        max_price=max_price,
        min_rating=min_rating,
        room_type=room_type,
        max_results=max_results,
    )


# ---------------------------------------------------------------------------
# Flights (LiteAPI) - search only, no booking
# ---------------------------------------------------------------------------
@tool
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
    """
    Search real, live flight offers via LiteAPI. Search only - this never
    books or purchases anything.

    Use this whenever the user asks about flight availability, schedules,
    or prices between two places. If exact dates are not given, use a
    reasonable upcoming date (e.g. 2 weeks from today) and note the assumption.

    Args:
        origin: Origin airport or city IATA code, e.g. "BOM".
        destination: Destination airport or city IATA code, e.g. "GOI".
        departure_date: Outbound date, YYYY-MM-DD.
        return_date: Optional return date for round trips, YYYY-MM-DD. Omit for one-way.
        adults: Number of adult passengers. Defaults to 1.
        cabin_class: One of ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST. Defaults to ECONOMY.
        currency: ISO currency code for prices. Defaults to "USD".
        max_results: Maximum number of offers to summarize. Defaults to 5.
    """
    return travel_service.search_flights(
        origin=origin,
        destination=destination,
        departure_date=departure_date,
        return_date=return_date,
        adults=adults,
        cabin_class=cabin_class,
        currency=currency,
        max_results=max_results,
    )


# ---------------------------------------------------------------------------
# Route / distance (Google Routes API)
# ---------------------------------------------------------------------------
@tool
def get_route(origin: str, destination: str, mode: str = "DRIVE") -> str:
    """
    Get real distance and travel time between two places via Google Routes API.
    Use this for ANY "how far", "how long to drive/travel", or road-trip
    time/fuel-cost question - never estimate distance from memory or a plain
    web search, this returns an actual routed number.

    Args:
        origin: Starting place - plain address or place name, e.g. "Surat, Gujarat".
        destination: Ending place - plain address or place name, e.g. "Ujjain, Madhya Pradesh".
        mode: One of DRIVE, WALK, BICYCLE, TRANSIT. Defaults to DRIVE.
    """
    return travel_service.get_route_summary(origin, destination, mode)


# ---------------------------------------------------------------------------
# Place search (Google Places API New)
# ---------------------------------------------------------------------------
@tool
def search_places(query: str, max_results: int = 8) -> str:
    """
    Search for real places via Google Places API — REQUIRED first tool for any
    "where to eat" / restaurant / cafe / street-food / cuisine query.
    Also use for attractions, temples, landmarks, "what's near X".

    Query tips for food:
    - "best restaurants in Mumbai", "vegetarian restaurant Bandra Mumbai",
      "street food Colaba Mumbai", "fine dining Surat", "locho Surat"
    - Include city + cuisine/diet/area when the user mentioned them.

    Returns real venue names with rating, area, open/closed, price level,
    plus a machine JSON block for the chat UI cards. Never invent places —
    only report what this tool returns. Prefer this over destination_search
    for named venues. After calling, reply with a short intro only — the UI
    shows the venue cards (do not paste Maps/Website markdown into chat).

    Args:
        query: Natural-language place search, e.g. "restaurants in Mumbai".
        max_results: Maximum places to return (5–8 for food lists). Defaults to 8.
    """
    return travel_service.search_places_summary(query, max_results)


# ---------------------------------------------------------------------------
# Geocoding (Google Geocoding API)
# ---------------------------------------------------------------------------
@tool
def geocode_location(place: str) -> str:
    """
    Convert a place name or address into its precise formatted address and
    coordinates via Google Geocoding API. Use this to confirm or disambiguate
    an exact location - e.g. when a place name could refer to more than one
    spot, or you need coordinates rather than a name.

    Args:
        place: Place name or address to look up, e.g. "Omkareshwar, Madhya Pradesh".
    """
    return travel_service.geocode_summary(place)


# ---------------------------------------------------------------------------
# Itinerary Agent escalation — signal only, no external API call
# ---------------------------------------------------------------------------
@tool
def escalate_to_itinerary(task_description: str, reason: str) -> str:
    """
    Hand off a complex or out-of-scope task to the Itinerary Agent.

    Call this ONLY when the user's request goes beyond what the General Agent
    handles on its own:
    - Actual hotel or flight BOOKING (not just browsing/comparing options)
    - A complete multi-day trip ITINERARY with full day-by-day logistics
    - Trip TRACKING, travel alerts, or family NOTIFICATIONS
    - PDF itinerary EXPORT or any document generation
    - End-to-end trip COORDINATION across hotels, flights, and activities

    Do NOT call this for quick searches, weather, routes, places, or Q&A —
    handle those yourself using the other tools.

    Args:
        task_description: Plain-language description of what the user wants done.
        reason: Why this needs the Itinerary Agent (e.g. "user wants to book a hotel",
                "full multi-day itinerary requested", "PDF export needed").
    """
    logger.info(
        "Escalating to Itinerary Agent | task=%s | reason=%s", task_description, reason
    )
    # Return a signal string the graph's routing function checks after tools run.
    # This string is NOT shown to the user — the itinerary_node generates the reply.
    return f"ESCALATE_TO_ITINERARY|task={task_description}|reason={reason}"


# Single list the graph imports - add new tools here as they're built.
ALL_TOOLS = [
    tavily_search,
    get_weather,
    search_hotels,
    search_flights,
    get_route,
    search_places,
    geocode_location,
    escalate_to_itinerary,
]
