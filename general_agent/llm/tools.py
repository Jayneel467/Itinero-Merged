"""
LangChain tool definitions bound to the agent's LLM.

Kept thin on purpose: each function does no parsing itself, it just calls
straight into services/travel_service.py or services/quick_search_service.py,
which own all the actual request-building/formatting logic. Add a new tool
here, then list it in ALL_TOOLS - that's the only other place that needs to
know about it.

search_flights/search_hotels are QUICK, SEARCH-ONLY lookups — they call the
exact same FlightAgent/HotelAgent search code ITINERARY_AGENT's booking flow
uses (services/quick_search_service.py), just without the staged
confirm->search->select->prebook state machine. They never book anything.
select_searched_flight/select_searched_hotel let the user commit to one of
those results by id; that exact structured option then rides in
trip_context["selected_flight"/"selected_hotel"] into escalate_to_itinerary,
so the itinerary hand-off skips straight to pre-book confirmation for it
instead of re-searching (see itinerary_bridge.py::_apply_preselected_flight).
"""
import json
import logging
import re
from datetime import datetime, date as _date, timedelta
from typing import Annotated, Optional

from langchain_core.tools import tool, InjectedToolCallId
from langchain_core.messages import ToolMessage
from langchain_tavily import TavilySearch
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

from services import travel_service, quick_search_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Date validation — deterministic, no LLM, no API call
# ---------------------------------------------------------------------------
@tool
def validate_date(date_str: str) -> str:
    """
    Validate whether a user-provided travel date is in the future or already past.

    ALWAYS call this tool first whenever the user mentions ANY date—check-in,
    departure, travel date—BEFORE passing it to search_hotels, search_flights,
    or any other tool. Never assume a date is valid without checking.

    Handles ordinals ("18th July"), relative phrases ("next month", "tomorrow"),
    connectors ("1st of August"), loose punctuation ("August 1 , 2026"),
    common typos ("@nd" = "2nd"), and ISO formats.

    Args:
        date_str: The date string exactly as the user provided it.
    """
    today = _date.today()

    # --- helper: advance to 1st of next month using only stdlib ---
    def _next_month(d):
        m = d.month + 1
        y = d.year
        if m > 12:
            m = 1
            y += 1
        return _date(y, m, 1)

    # --- helper: resolve "end of <month>" to last day of that month ---
    def _end_of_month(month_num, year):
        import calendar
        last_day = calendar.monthrange(year, month_num)[1]
        return _date(year, month_num, last_day)

    # -----------------------------------------------------------------------
    # Step 1: fix common symbol typos + strip filler words
    # -----------------------------------------------------------------------
    cleaned = date_str.strip()
    # Fix keyboard typos: @ is shift+2, so @nd = 2nd, @st = 1st, @rd = 3rd
    cleaned = re.sub(r'(?:^|(?<=\s))@nd\b', '2nd', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'(?:^|(?<=\s))@st\b', '1st', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'(?:^|(?<=\s))@rd\b', '3rd', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'(?:^|(?<=\s))@th\b', '4th', cleaned, flags=re.IGNORECASE)


    # Remove filler words
    cleaned = re.sub(
        r'\b(maybe|around|about|perhaps|approximately|sometime|roughly|probably|possibly)\b',
        '', cleaned, flags=re.IGNORECASE
    ).strip()

    # -----------------------------------------------------------------------
    # Step 2: resolve relative phrases to concrete dates (no external deps)
    # -----------------------------------------------------------------------
    # Map of month names for "end of august" style input
    _month_names = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5,
        'june': 6, 'july': 7, 'august': 8, 'september': 9, 'october': 10,
        'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
        'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    }

    parsed = None

    # Check "end of <month>" pattern first
    eom_match = re.search(r'\bend\s+of\s+(\w+)\b', cleaned, flags=re.IGNORECASE)
    if eom_match:
        month_word = eom_match.group(1).lower()
        if month_word in _month_names:
            m = _month_names[month_word]
            y = today.year
            candidate = _end_of_month(m, y)
            if candidate < today:
                candidate = _end_of_month(m, y + 1)
            parsed = candidate

    if parsed is None:
        relative_map = [
            (r'\btomorrow\b',                   lambda d: d + timedelta(days=1)),
            (r'\bnext\s+week\b',                lambda d: d + timedelta(weeks=1)),
            (r'\bthis\s+weekend\b',             lambda d: d + timedelta(days=(5 - d.weekday()) % 7 or 7)),
            (r'\bnext\s+month\b',               lambda d: _next_month(d)),
            (r'\bthis\s+month\b',               lambda d: d + timedelta(days=7)),
            (r'\bnext\s+year\b',                lambda d: d.replace(year=d.year + 1) if d.month == 1 and d.day == 1 else _date(d.year + 1, 1, 1)),
            (r'\bin\s+a\s+(?:few\s+)?weeks?\b', lambda d: d + timedelta(weeks=2)),
            (r'\bin\s+a\s+(?:few\s+)?days?\b',  lambda d: d + timedelta(days=3)),
            (r'\bsoon\b',                       lambda d: d + timedelta(weeks=2)),
        ]
        for pattern, resolver in relative_map:
            if re.search(pattern, cleaned, flags=re.IGNORECASE):
                parsed = resolver(today)
                break

    if parsed is None:
        # -----------------------------------------------------------------------
        # Step 3: string normalisation before numeric parsing
        # -----------------------------------------------------------------------
        # Strip ordinal suffixes: 18th -> 18, 21st -> 21, 1st -> 1
        cleaned = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', cleaned, flags=re.IGNORECASE)
        # Remove "of" connector: "1 of august" -> "1 august"
        cleaned = re.sub(r'(\d)\s+of\s+', r'\1 ', cleaned, flags=re.IGNORECASE)
        # Normalize commas (stray or spacing): "August 1 , 2026" -> "August 1 2026"
        cleaned = re.sub(r'\s*,\s*', ' ', cleaned)
        # Collapse multiple spaces
        cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()

        # -----------------------------------------------------------------------
        # Step 4: dateutil (optional, soft import — skips if not installed)
        # -----------------------------------------------------------------------
        try:
            from dateutil import parser as du_parser
            default_dt = datetime(today.year, today.month, today.day)
            dt = du_parser.parse(cleaned, dayfirst=True, default=default_dt)
            parsed = dt.date()
            if dt.year == today.year and parsed < today and str(today.year) not in date_str:
                parsed = parsed.replace(year=today.year + 1)
        except Exception:
            pass

        # -----------------------------------------------------------------------
        # Step 5: strptime fallback (always available, no deps)
        # -----------------------------------------------------------------------
        if parsed is None:
            formats = [
                "%d %B %Y", "%B %d %Y", "%d %b %Y", "%b %d %Y",
                "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%d", "%d-%m-%Y",
                "%d %B",    "%B %d",    "%d %b",    "%b %d",
            ]
            for fmt in formats:
                try:
                    dt = datetime.strptime(cleaned, fmt)
                    if "%Y" not in fmt and "%y" not in fmt:
                        dt = dt.replace(year=today.year)
                        if dt.date() < today:
                            dt = dt.replace(year=today.year + 1)
                    parsed = dt.date()
                    break
                except ValueError:
                    continue


    # -----------------------------------------------------------------------
    # Step 6: verdict
    # -----------------------------------------------------------------------
    if parsed is None:
        return (
            f"INVALID_DATE: Could not understand '{date_str}' as a date. "
            "Ask the user to clarify (e.g. '21 August 2026')."
        )

    days_away = (parsed - today).days

    if days_away < 0:
        return (
            f"PAST_DATE: {parsed.strftime('%d %B %Y')} is {abs(days_away)} day(s) "
            f"in the past. Today is {today.strftime('%d %B %Y')}. "
            "Reject this date and ask the user for a valid future date."
        )
    if days_away == 0:
        return (
            f"PAST_DATE: {parsed.strftime('%d %B %Y')} is TODAY. "
            "Same-day travel bookings are generally not possible. "
            "Ask if they mean tomorrow or a future date."
        )
    return (
        f"VALID_FUTURE: {parsed.strftime('%d %B %Y')} is {days_away} day(s) from today "
        f"({today.strftime('%d %B %Y')}). This date is valid — proceed with searches."
    )



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
        "opening hours, or anything about a place the agent doesn't already "
        "know confidently. Input should be a focused search query."
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
def search_places(query: str, max_results: int = 5) -> str:
    """
    Search for real places - attractions, restaurants, temples, landmarks,
    etc. - via Google Places API. Use this for "what's near X", "find a
    restaurant/attraction in Y", or to confirm a real place's rating,
    address, or open-now status. More reliable for named-place facts than a
    general web search.

    Args:
        query: Natural-language place search, e.g. "budget hotels near Mahakaleshwar Temple Ujjain".
        max_results: Maximum number of places to return. Defaults to 5.
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
# Quick flight/hotel search — search-only, real data, no booking.
# Same underlying search code the itinerary hand-off uses (FlightAgent/
# HotelAgent), just invoked directly without the staged booking flow.
# ---------------------------------------------------------------------------
@tool
def search_flights(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
    adults: int = 1,
    cabin_class: str = "Economy",
    max_budget_per_person: Optional[float] = None,
    nonstop_preferred: bool = False,
    max_results: int = 5,
    *,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Search real flight options. Search only — never books or holds anything.

    Use this whenever the user wants to see flight prices/options/schedules,
    even as a quick one-off check with no full trip plan in mind. Covers
    standard structured filters only (route, dates, travelers, cabin class,
    budget, nonstop preference). If the request needs something these
    parameters can't represent — specific seat preferences, complex
    multi-passenger splits, or anything else outside this filter set — do
    NOT force it into this tool with guessed values; use
    escalate_to_itinerary instead, same as a full booking request.

    Results are shown as selectable cards. If the user picks one and wants
    to book it, call select_searched_flight with that option's id, then
    escalate_to_itinerary — the exact flight they saw carries forward, no
    re-search needed.

    Args:
        origin: Origin city or airport code, e.g. "Mumbai" or "BOM".
        destination: Destination city or airport code, e.g. "Goa" or "GOI".
        departure_date: Outbound date, YYYY-MM-DD (from validate_date).
        return_date: Optional return date for round trips, YYYY-MM-DD. Omit for one-way.
        adults: Number of adult passengers. Defaults to 1.
        cabin_class: One of Economy, Premium Economy, Business, First. Defaults to Economy.
        max_budget_per_person: Optional max price per passenger.
        nonstop_preferred: Optional, true to prefer nonstop options.
        max_results: Maximum number of offers to show. Defaults to 5.
    """
    result = quick_search_service.run_flight_search(
        origin=origin,
        destination=destination,
        departure_date=departure_date,
        return_date=return_date,
        adults=adults,
        cabin_class=cabin_class,
        max_budget_per_person=max_budget_per_person,
        nonstop_preferred=nonstop_preferred,
        max_results=max_results,
    )

    content = result["text"]
    if result["cards"]:
        content += f"\n\n[CARDS_DATA: {json.dumps(result['cards'])}]"

    trip_context_update: dict = {}
    if result["flights"]:
        trip_context_update["quick_flight_search"] = {
            "results": result["flights"],
            "origin": origin,
            "destination": destination,
        }

    return Command(update={
        "trip_context": trip_context_update,
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


@tool
def search_hotels(
    location: str,
    check_in: str,
    check_out: str,
    adults: int = 2,
    max_budget_per_night: Optional[float] = None,
    min_star_rating: Optional[float] = None,
    meal_plan: Optional[str] = None,
    free_cancellation: bool = False,
    room_type_preference: Optional[str] = None,
    max_results: int = 5,
    *,
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Search real hotel options. Search only — never books or holds anything.

    Use this whenever the user wants to see hotel prices/options, even as a
    quick one-off check with no full trip plan in mind. Covers standard
    structured filters only (location, dates, travelers, budget, star
    rating, meal plan, free cancellation, room type). If the request needs
    something these parameters can't represent, do NOT force it into this
    tool with guessed values; use escalate_to_itinerary instead.

    Results are shown as selectable cards. If the user picks one and wants
    to book it, call select_searched_hotel with that option's id, then
    escalate_to_itinerary.

    Args:
        location: City or area to search in, e.g. "Goa".
        check_in: Check-in date, YYYY-MM-DD (from validate_date).
        check_out: Check-out date, YYYY-MM-DD (from validate_date).
        adults: Number of adults. Defaults to 2.
        max_budget_per_night: Optional max price per night.
        min_star_rating: Optional star rating floor (1-5).
        meal_plan: Optional, one of Room Only, Breakfast, Half Board, Full Board, All Inclusive.
        free_cancellation: Optional, true to require free cancellation.
        room_type_preference: Optional room type keyword, e.g. "suite", "sea view".
        max_results: Maximum number of hotels to show. Defaults to 5.
    """
    result = quick_search_service.run_hotel_search(
        location=location,
        check_in=check_in,
        check_out=check_out,
        adults=adults,
        max_budget_per_night=max_budget_per_night,
        min_star_rating=min_star_rating,
        meal_plan=meal_plan,
        free_cancellation=free_cancellation,
        room_type_preference=room_type_preference,
        max_results=max_results,
    )

    content = result["text"]
    if result["cards"]:
        content += f"\n\n[CARDS_DATA: {json.dumps(result['cards'])}]"

    trip_context_update: dict = {}
    if result["hotels"]:
        trip_context_update["quick_hotel_search"] = {
            "results": result["hotels"],
            "location": location,
        }

    return Command(update={
        "trip_context": trip_context_update,
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


@tool
def select_searched_flight(
    flight_id: str,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Record the user's choice of a SPECIFIC flight from the most recent
    search_flights results, by its id. Call this the moment the user picks
    or confirms one of the shown flight options — do NOT hand-type the
    flight's details yourself, this looks up the authoritative record from
    the search so price/times can never be misremembered.

    After this, if the user wants to proceed with booking, call
    escalate_to_itinerary — the exact selected flight rides along
    automatically via trip_context, so the itinerary hand-off skips straight
    to pre-book confirmation for it instead of re-searching.

    Args:
        flight_id: The id of the chosen flight, exactly as shown in the
            search_flights results (each option was listed with its id).
    """
    trip_context = state.get("trip_context", {}) or {}
    cached = (trip_context.get("quick_flight_search") or {}).get("results") or []
    match = next((f for f in cached if f.get("flight_id") == flight_id), None)

    if match is None:
        content = f"That flight option isn't available anymore (id={flight_id}). Want me to search again?"
        return Command(update={"messages": [ToolMessage(content=content, tool_call_id=tool_call_id)]})

    content = (
        f"Selected: {match.get('airline')} {match.get('flight_number')} — "
        f"{match.get('origin')} to {match.get('destination')}, "
        f"Rs.{match.get('price_per_adult', 0):.0f}/adult. Ready to proceed with booking?"
    )
    return Command(update={
        "trip_context": {"selected_flight": match},
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


@tool
def select_searched_hotel(
    hotel_id: str,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Record the user's choice of a SPECIFIC hotel from the most recent
    search_hotels results, by its id. Call this the moment the user picks
    or confirms one of the shown hotel options — do NOT hand-type the
    hotel's details yourself, this looks up the authoritative record from
    the search so price/room details can never be misremembered.

    After this, if the user wants to proceed with booking, call
    escalate_to_itinerary — the selected hotel rides along automatically via
    trip_context as a strong preference for the itinerary hand-off's hotel
    search step.

    Args:
        hotel_id: The id of the chosen hotel, exactly as shown in the
            search_hotels results (each option was listed with its id).
    """
    trip_context = state.get("trip_context", {}) or {}
    cached = (trip_context.get("quick_hotel_search") or {}).get("results") or []
    match = next((h for h in cached if h.get("hotel_id") == hotel_id), None)

    if match is None:
        content = f"That hotel option isn't available anymore (id={hotel_id}). Want me to search again?"
        return Command(update={"messages": [ToolMessage(content=content, tool_call_id=tool_call_id)]})

    content = (
        f"Selected: {match.get('name')} — {match.get('room_type')}, "
        f"Rs.{match.get('price_per_night', 0):.0f}/night. Ready to proceed with booking?"
    )
    return Command(update={
        "trip_context": {"selected_hotel": match},
        "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
    })


# ---------------------------------------------------------------------------
# State tracking tool
# ---------------------------------------------------------------------------
@tool
def update_trip_context(
    destination: Optional[str] = None,
    origin: Optional[str] = None,
    checkin: Optional[str] = None,
    checkout: Optional[str] = None,
    adults: Optional[int] = None,
    children: Optional[int] = None,
    infants: Optional[int] = None,
    budget: Optional[str] = None,
    currency: Optional[str] = None,
    extra_info: Optional[str] = None,
    trip_type: Optional[str] = None,
    selected_flight: Optional[str] = None,
    selected_hotel: Optional[str] = None,
    return_flight: Optional[str] = None,
    leg_index: Optional[int] = None,
    leg_data: Optional[str] = None,
) -> str:
    """
    Update the agent's internal state tracker with confirmed trip details.

    Call this tool proactively whenever the user provides or confirms new
    information about their trip. This ensures the full context is preserved
    for the final itinerary handoff to the Itinerary Agent.

    SELECTION SAVING — MANDATORY:
    Whenever a user confirms a flight or hotel choice, immediately call this
    tool with selected_flight or selected_hotel as a JSON string.
    For multi-destination trips, always include leg_index.

    Args:
        destination: Confirmed travel destination.
        origin: Confirmed departure origin.
        checkin: Confirmed check-in / arrival date (YYYY-MM-DD).
        checkout: Confirmed check-out / return date (YYYY-MM-DD).
        adults: Number of adults.
        children: Number of children.
        infants: Number of infants.
        budget: The user's stated total trip budget (e.g. '50000 INR').
        currency: ISO currency code for this trip (e.g. 'INR', 'USD', 'AED').
        extra_info: Special needs, occasions, preferences, visa notes.
        trip_type: One of 'one_way', 'round_trip', 'multi_destination'.
        selected_flight: JSON string of the flight the user just selected.
            Include: airline, flight_code, dep_time, arr_time, origin, destination,
            price, currency, stops, duration.
        selected_hotel: JSON string of the hotel the user just selected.
            Include: name, room_name, board, price_total, price_per_night,
            currency, refundable.
        return_flight: JSON string of the return flight (round_trip only).
            Same structure as selected_flight.
        leg_index: For multi_destination trips only — which leg (1-based) this
            update belongs to (e.g. 1 = first leg, 2 = second leg).
        leg_data: For multi_destination — full leg object as JSON string.
            Include: from, to, departure_date, nights, hotel_checkin,
            hotel_checkout, selected_flight, selected_hotel.
    """
    return "Trip context updated successfully in agent state."


# ---------------------------------------------------------------------------
# Itinerary Agent escalation — signal only, no external API call
# ---------------------------------------------------------------------------
@tool
def escalate_to_itinerary(task_description: str, reason: str) -> str:
    """
    Hand off the complete trip context to the Itinerary Agent to generate the
    full day-by-day itinerary, handle pre-booking, and produce the final plan.

    Call this ONLY when:
    - User explicitly requests a full multi-day itinerary or complete trip plan
    - User wants to book / pre-book flights or hotels
    - User requests a PDF itinerary or end-to-end trip coordination
    - All required trip details are confirmed (destination, dates, travelers)

    Do NOT call this for quick searches, weather, routes, or Q&A.

    IMPORTANT — task_description must be a JSON string built from ALL known
    trip context. Use this exact structure:

    For one_way / round_trip:
    {
      "trip_type": "one_way" | "round_trip",
      "origin": "...",
      "destination": "...",
      "checkin": "YYYY-MM-DD",
      "checkout": "YYYY-MM-DD",
      "travelers": {"adults": N, "children": N, "infants": N},
      "budget": "...",
      "currency": "INR",
      "extra_info": {"visa_required": "yes/no", "occasion": "", "preferences": ""},
      "selected_flight": { ...flight card object or null },
      "selected_hotel":  { ...hotel card object or null },
      "return_flight":   { ...or null }
    }

    For multi_destination:
    {
      "trip_type": "multi_destination",
      "origin": "...",
      "travelers": {...},
      "budget": "...",
      "currency": "...",
      "legs": [
        {
          "leg_index": 1,
          "from": "...", "to": "...",
          "departure_date": "YYYY-MM-DD",
          "nights": N,
          "hotel_checkin": "YYYY-MM-DD",
          "hotel_checkout": "YYYY-MM-DD",
          "selected_flight": {...or null},
          "selected_hotel":  {...or null}
        },
        ...
      ]
    }

    Args:
        task_description: JSON string of the complete structured trip context
            as described above. Pack everything Vero knows — confirmed fields
            AND assumptions clearly noted.
        reason: Why the Itinerary Agent is being called.
    """
    logger.info(
        "Escalating to Itinerary Agent | task=%s | reason=%s", task_description, reason
    )
    return f"ESCALATE_TO_ITINERARY|task={task_description}|reason={reason}"


# Single list the graph imports - add new tools here as they're built.
ALL_TOOLS = [
    validate_date,          # always first — date guard before any search
    tavily_search,
    get_weather,
    get_route,
    search_places,
    geocode_location,
    search_flights,
    search_hotels,
    select_searched_flight,
    select_searched_hotel,
    update_trip_context,
    escalate_to_itinerary,
]
