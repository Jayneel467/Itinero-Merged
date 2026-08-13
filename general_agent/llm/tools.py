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
from typing import Annotated, Any, Optional, Union

from langchain_core.tools import tool, InjectedToolCallId
from langchain_core.messages import ToolMessage
from langchain_tavily import TavilySearch
from langgraph.prebuilt import InjectedState
from langgraph.types import Command

from services import travel_service, quick_search_service
from services.indic_dates import normalize_indic_date
from services.india_ground import describe_route, flight_search_guard

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

    Handles ordinals ("18th July"), relative phrases ("next month", "tomorrow",
    Gujarati કાલે / બાવીસ ઓગસ્ટ, Hindi कल / बाईस अगस्त), connectors
    ("1st of August"), loose punctuation, common typos ("@nd" = "2nd"), ISO.

    Never tell the user to say "21 August 2026". Confirm softly in their language.

    Args:
        date_str: The date string exactly as the user provided it.
    """
    today = _date.today()
    date_str = normalize_indic_date(date_str)
    range_end = None  # optional second day when user said "Sep 3–6"

    # --- helper: advance to 1st of next month using only stdlib ---
    def _next_month(d):
        m = d.month + 1
        y = d.year
        if m > 12:
            m = 1
            y += 1
        return _date(y, m, 1)

    def _next_weekday(name: str) -> _date:
        target = {
            "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
            "friday": 4, "saturday": 5, "sunday": 6,
        }[name.lower()]
        delta = (target - today.weekday()) % 7 or 7
        return today + timedelta(days=delta)

    # --- helper: resolve "end of <month>" to last day of that month ---
    def _end_of_month(month_num, year):
        import calendar
        last_day = calendar.monthrange(year, month_num)[1]
        return _date(year, month_num, last_day)

    # -----------------------------------------------------------------------
    # Step 1: fix common symbol typos + strip filler words
    # -----------------------------------------------------------------------
    cleaned = date_str.strip()
    cleaned = cleaned.replace("–", "-").replace("—", "-").replace("−", "-")
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
        'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'dec': 12,
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

    # Date ranges: "September 3-6" must NOT parse as year 2006.
    _mon = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    range_match = re.search(
        rf"\b({_mon})\s+(\d{{1,2}})\s*-\s*(\d{{1,2}})(?:\s*,?\s*(\d{{4}}))?\b",
        cleaned, flags=re.IGNORECASE,
    ) or re.search(
        rf"\b(\d{{1,2}})\s*-\s*(\d{{1,2}})\s+({_mon})(?:\s*,?\s*(\d{{4}}))?\b",
        cleaned, flags=re.IGNORECASE,
    )
    if range_match and parsed is None:
        g = range_match.groups()
        if g[0].isalpha() or (g[0] and g[0][:3].lower() in _month_names):
            month_word, d1, d2, year_s = g[0], g[1], g[2], g[3] if len(g) > 3 else None
        else:
            d1, d2, month_word, year_s = g[0], g[1], g[2], g[3] if len(g) > 3 else None
        mnum = _month_names.get(month_word.lower())
        if mnum:
            y = int(year_s) if year_s else today.year
            try:
                start = _date(y, mnum, int(d1))
                end = _date(y, mnum, int(d2))
            except ValueError:
                start = end = None
            if start and end and end >= start:
                if start < today and not year_s:
                    try:
                        start = start.replace(year=y + 1)
                        end = end.replace(year=y + 1)
                    except ValueError:
                        pass
                parsed = start
                range_end = end
                cleaned = start.strftime("%d %B %Y")

    if parsed is None:
        wd = re.search(
            r'\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',
            cleaned, flags=re.IGNORECASE,
        )
        if wd:
            parsed = _next_weekday(wd.group(1))

    if parsed is None:
        relative_map = [
            (r'\bday\s+after\s+tomorrow\b',     lambda d: d + timedelta(days=2)),
            (r'\btomorrow\b',                   lambda d: d + timedelta(days=1)),
            (r'\btoday\b',                      lambda d: d),
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
            "Ask once, in the SAME language the user is already using this thread "
            "(do not switch to Gujarati/Hindi just to confirm). Never demand ISO format."
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
            f"VALID_TODAY: {parsed.strftime('%d %B %Y')} is today. "
            "Same-day trains/buses are often still possible; same-day flights usually not. "
            "Proceed with surface travel if they asked train/bus; otherwise offer tomorrow."
        )
    range_note = ""
    if range_end and range_end >= parsed:
        range_note = (
            f" User gave a date RANGE through {range_end.strftime('%d %B %Y')} "
            f"({range_end.isoformat()}). Treat {parsed.isoformat()} as the earliest departure "
            f"and {range_end.isoformat()} as the latest — do NOT ask them to restate the year."
        )
    return (
        f"VALID_FUTURE: {parsed.strftime('%d %B %Y')} ({parsed.isoformat()}) is {days_away} day(s) from today "
        f"({today.strftime('%d %B %Y')}). Use this date silently. Do NOT switch language to confirm it. "
        f"If you mention it, use the user's current thread language only.{range_note}"
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
        "sightseeing spots, local events, travel advisories, opening hours, "
        "or anything about a place the agent doesn't already know confidently. "
        "NOT for visa/immigration/ETA/transit-visa — use check_visa. "
        "Input should be a focused search query."
    ),
)


@tool
def check_visa(
    destination: str,
    passport_nationality: str = "",
    transit_countries: str = "",
    residence: str = "",
    visas_held: str = "",
    travel_dates: str = "",
    purpose: str = "tourism",
    passport_expiry: str = "",
    tickets: str = "",
    question: str = "",
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Visa & immigration check against OFFICIAL government / border sources.
    ALWAYS use this for visa, eVisa, ETA/eTA/ESTA, transit visa, airside vs
    landside, passport validity for entry, onward-ticket, yellow-fever entry,
    Schengen, Heathrow/LHR transit, F-1 / existing-visa exemptions.

    NEVER invent visa-free days or transit rules from memory.
    NEVER use destination_search for immigration.

    Extract what you know; leave unknown fields empty. Do not guess nationality
    (never assume Indian). Prefer trip_context / ui_page traveler passport when set.

    Args:
        destination: Country or city or airport, e.g. "Thailand", "UK", "LHR".
        passport_nationality: e.g. "Indian", "IN", "US". Required if unknown in context.
        transit_countries: Comma-separated transits, e.g. "UK, Heathrow, FRA".
        residence: Country of residence if different from passport.
        visas_held: e.g. "US F-1", "valid US visa", "Schengen C".
        travel_dates: e.g. "12 Aug 2026" or "next week".
        purpose: tourism | business | study | transit | work. Default tourism.
        passport_expiry: If known.
        tickets: e.g. "separate tickets", "self-transfer LHR", "through-ticket".
        question: The user's exact immigration ask.
    """
    from services.visa_agent import check_visa as _run

    ctx = {}
    if isinstance(state, dict):
        ctx = (state.get("trip_context") or {}) if isinstance(state.get("trip_context"), dict) else {}
    nat = passport_nationality or str(
        ctx.get("passport_nationality")
        or ctx.get("nationality")
        or ((ctx.get("ui_page") or {}).get("traveler") or {}).get("passport_nationality")
        or ((ctx.get("ui_page") or {}).get("traveler") or {}).get("nationality")
        or ((ctx.get("ui_page") or {}).get("explore") or {}).get("passport_country")
        or ""
    )
    dest = destination or str(ctx.get("destination") or "")
    result = _run(
        destination=dest,
        passport_nationality=nat,
        transit_countries=transit_countries,
        residence=residence,
        visas_held=visas_held,
        travel_dates=travel_dates or str(ctx.get("checkin") or ""),
        purpose=purpose,
        passport_expiry=passport_expiry,
        tickets=tickets,
        question=question,
    )
    content = result["text"]
    if result.get("cards"):
        content += f"\n\n[CARDS_DATA: {json.dumps(result['cards'])}]"
    return Command(
        update={
            "trip_context": {
                "last_visa_check": {
                    "destination": dest,
                    "nationality": nat,
                    "transit": transit_countries,
                    "checked_at": (result.get("payload") or {}).get("retrieved_at") if isinstance(result.get("payload"), dict) else "",
                }
            },
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def lookup_india_route(origin: str, destination: str) -> str:
    """
    How families actually go between Indian cities / temple towns.
    Call BEFORE search_flights when destination is a pilgrimage or small town
    (Ambaji, Somnath, Dwarka, Palitana, Pavagadh, Shirdi, …) OR the user said
    train / bus / car. Returns nearest rail head — never invent an airport.
    After this, call search_trains for IRCTC numbers (Baroda = Vadodara BRC).
    """
    return describe_route(origin, destination)


@tool
def search_trains(
    origin: str,
    destination: str,
    when: str = "",
    window: str = "",
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Indian Rail / IRCTC trains between two cities. ALWAYS use this when they
    ask train / ટ્રેન / railway / IRCTC (Surat→Baroda, Mumbai→Pune, …).
    Baroda = Vadodara Junction (BRC). Surat = ST.

    Pass afternoon/evening/morning in `when` or `window` so only that slot is
    returned. Left Itinero /trains page shows the timetable. Reply 1–2 trains
    out loud — never dump the full list in chat. NEVER invent a train number.
    NEVER answer with Google private buses. Not waitlist — book on IRCTC.

    Args:
        origin: City or station code, e.g. "Surat" or "ST".
        destination: City or station code, e.g. "Baroda", "Vadodara", "BRC".
        when: "today", "tomorrow", "9 Aug", or "tomorrow afternoon".
        window: Optional "morning" | "afternoon" | "evening" | "night".
    """
    result = travel_service.search_india_trains_structured(origin, destination, when, window)
    content = result.get("text") or ""
    recs = [
        {
            "number": t.get("number"),
            "name": t.get("name"),
            "dep": t.get("dep"),
            "arr": t.get("arr"),
        }
        for t in (result.get("trains") or [])[:6]
    ]
    trip_context_update = {
        "last_train_query": f"{origin}→{destination}",
        "last_train_recs": recs,
        "transport_mode": "train",
    }
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def search_buses(
    origin: str = "",
    destination: str = "",
    when: str = "",
    window: str = "",
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Google Maps public transit worldwide: bus, metro/subway, tram, light rail,
    commuter rail, ferry, plus intercity coaches. Same coverage as Maps TRANSIT.
    India Sitilink, US CATA, London Tube, Tokyo Metro, NY subway — all this tool.
    ALWAYS use for bus / metro / tram / “how do I get there” / campus A→B.
    Do NOT ask walking vs driving vs transit. Left /transits page.
    NEVER say you cannot search buses or transit.

    Reply 1–2 lines: EXACT line + boarding stop + time + next 1–2 times.
    NEVER invent an operator, stop, or fare. City/campus = directions only.

    Args:
        origin: City, neighborhood, or campus building. Empty OK if destination is a known local landmark.
        destination: City, station, or building, e.g. "Pollock Commons", "Surat Railway Station".
        when: "today", "tomorrow", "9 Aug", or "tomorrow evening".
        window: Optional "morning" | "afternoon" | "evening" | "night".
    """
    result = travel_service.search_india_buses_structured(origin, destination, when, window)
    content = result.get("text") or ""
    recs = [
        {
            "operator": b.get("operator"),
            "dep": b.get("dep"),
            "arr": b.get("arr"),
            "bus_type": b.get("bus_type"),
            "from_stop": b.get("from_stop"),
            "to_stop": b.get("to_stop"),
            "name": b.get("name"),
            "local": bool(b.get("local") or result.get("local")),
        }
        for b in (result.get("buses") or [])[:6]
    ]
    trip_context_update = {
        "last_bus_query": f"{origin}→{destination}",
        "last_bus_recs": recs,
        "transport_mode": "bus",
    }
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def track_train(
    train_number: str,
    start_day: int = 0,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Live Indian Rail running STATUS for a known train number (e.g. 20901, 12952).
    Use for: where has this train reached, is it late, next station, platform on feed,
    has today's Vande Bharat departed.

    ROUTE DATA ≠ VEHICLE LOCATION. A timetable or driving ETA is NOT GPS.
    Never infer "between Bharuch and Surat" from scheduled times + clock.
    If the feed has gps_unable / no current station, say live position is unavailable.

    If they said "Vande Bharat" without a number, call search_trains first, then this.

    Args:
        train_number: 4–5 digit IRCTC number.
        start_day: 0 = started today, 1 = started yesterday, 2 = day before.
    """
    result = travel_service.track_india_train_structured(train_number, start_day=start_day or 0)
    content = result.get("text") or ""
    trip_context_update = {
        "last_tracked_train": str(train_number or ""),
        "transport_mode": "train",
    }
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def track_airport(
    airport: str,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Live AIRPORT board: departures, arrivals, inbound, scheduled, nearby radar.
    Use when they ask what's departing Surat / STV, arrivals at BOM, airport schedule,
    who's on the ground, or "airport routine" for a place — NOT a fare search.

    Never invent times. Airport screens win. Left nav: /flights/track?airport=STV.

    Args:
        airport: IATA or ICAO (STV, BOM, VASU) or a city with a major airport.
    """
    result = travel_service.track_airport_structured(airport)
    content = result.get("text") or ""
    trip_context_update = {
        "last_tracked_airport": str(airport or ""),
        "transport_mode": "flight",
    }
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    if result.get("cards"):
        trip_context_update["pending_cards"] = result["cards"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def track_flight(
    flight: str,
    date: str = "",
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Live FLIGHT status for a known flight number (e.g. AI 131, 6E 2341, EK 500).
    Use for: is my flight delayed, gate, has it departed, where is the aircraft,
    track AI101, flight status today.

    NOT a guaranteed GPS pin. ADS-B last-seen only when the aircraft is broadcasting.
    Never invent gate, delay, terminal, or position. Airport screens win if they disagree.
    A booked itinerary time is NOT live status — call this instead of guessing.

    If they said only an airline with no number ("track IndiGo"), ask for the flight number.

    Args:
        flight: IATA/ICAO flight number (AI131, 6E-2341, AIC101).
        date: optional YYYY-MM-DD. Empty = today.
    """
    result = travel_service.track_flight_structured(flight, date=date or "")
    content = result.get("text") or ""
    trip_context_update = {
        "last_tracked_flight": str(flight or ""),
        "transport_mode": "flight",
    }
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    if result.get("cards"):
        trip_context_update["pending_cards"] = result["cards"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def order_train_food(
    pnr: str = "",
    train_number: str = "",
    boarding_station: str = "",
    date: str = "",
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Open Food on train on the left Itinero /trains?mode=food page.
    Use for: meal on train, food on train, eCatering, pantry, order to berth.
    Pass a 10-digit PNR OR train number + boarding station + date (today/tomorrow/YYYY-MM-DD).
    Never invent a menu, restaurant, or price. Never name the kitchen partner.
    IRCTC eCatering is official.

    Args:
        pnr: 10-digit PNR if they have one.
        train_number: 4–5 digit IRCTC train number.
        boarding_station: Boarding halt name or code (e.g. ST, Surat).
        date: today / tomorrow / YYYY-MM-DD.
    """
    result = travel_service.order_train_food_structured(
        pnr=pnr or "",
        train_number=train_number or "",
        boarding_station=boarding_station or "",
        date=date or "",
    )
    content = result.get("text") or ""
    trip_context_update = {"transport_mode": "train"}
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


@tool
def check_pnr(
    pnr: str,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Check a 10-digit IRCTC PNR via a partner status feed. Never invent CNF/RAC/WL.
    If lookup fails, say you cannot verify. Left page: /trains?mode=pnr&pnr=
    Food on train: call order_train_food with this PNR. IRCTC eCatering is official.
    Never invent a menu or price. Never name the partner.

    Args:
        pnr: Exactly 10 digits.
    """
    result = travel_service.check_india_pnr_structured(pnr)
    content = result.get("text") or ""
    trip_context_update = {"last_pnr": str(pnr or "")[:10], "transport_mode": "train"}
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]
    return Command(
        update={
            "trip_context": trip_context_update,
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


# ---------------------------------------------------------------------------
# Exchange rates (Frankfurter — live, no key)
# ---------------------------------------------------------------------------
@tool
def get_exchange_rate(
    amount: float = 1,
    from_currency: str = "USD",
    to_currency: str = "INR",
) -> str:
    """
    Live mid-market FX (central banks). Use for "what's the
    rate", "$350 in INR", exchange-booth vs real rate, budget in another
    currency. NEVER invent an exchange rate. NEVER name the FX vendor to the user.

    Args:
        amount: Amount in from_currency. Defaults to 1 (just the rate).
        from_currency: ISO code converting FROM, e.g. USD, EUR, GBP.
        to_currency: ISO code converting TO. Default INR.
    """
    return travel_service.get_exchange_rate_summary(amount, from_currency, to_currency)


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
def get_route(
    origin: str,
    destination: str,
    mode: str = "DRIVE",
    departure_time: str = "",
    arrival_time: str = "",
    routing_preference: str = "",
    transit_modes: str = "",
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Live routes. NEVER invent distance, drive time, bus/metro/train
    lines, stop names, or timetables.

    DRIVE — road time (traffic-aware). WALK / BICYCLE — those modes.
    TRANSIT — public transport: city bus, metro/subway, commuter rail, train,
    light rail, multi-leg bus+train, walking to/from stops, fares when priced.
    Also accepts mode aliases BUS, METRO, SUBWAY, TRAIN, RAIL, TRAM.

    Use TRANSIT for: how do I get there without a car, local bus, metro,
    fewer transfers, less walking, leave at X, arrive by Y, airport↔city
    on transit. Same-city days with no car → TRANSIT not DRIVE.
    Same-city Sitilink (Adajan → Surat station) and PSU CATA (IM Building,
    Pollock, Pattee–Paterno): SPEAK the boarding stop. Left /transits page opens
    when it is a city/campus bus. Campus “how do I get there” → TRANSIT not DRIVE.
    Never ask the user to pick walking vs driving vs transit first.

    India city→city TRAIN (Surat–Baroda etc.): prefer the search_trains tool.
    Never list private sleeper buses as IRCTC trains.

    Args:
        origin: Start — address or place, e.g. "Bandra West, Mumbai" or "Adajan".
        destination: End — e.g. "CSMT, Mumbai" or "Surat Railway Station".
        mode: DRIVE, WALK, BICYCLE, TRANSIT (or BUS/METRO/TRAIN). Default DRIVE.
        departure_time: Leave at — "now", "tomorrow 9am", "18:00", ISO. Empty = now.
        arrival_time: Arrive by (only if departure_time is empty). Same formats.
        routing_preference: For TRANSIT: LESS_WALKING or FEWER_TRANSFERS. Else empty.
        transit_modes: Optional bias, comma-separated: BUS,SUBWAY,TRAIN,LIGHT_RAIL,RAIL.
            RAIL = subway+train+light rail. Empty = all Google transit modes.
    """
    from providers import bus_provider

    o_n = bus_provider.normalize_place(origin)
    d_n = bus_provider.normalize_place(destination)
    raw_mode = (mode or "").upper().replace(" ", "_").replace("-", "_")
    if bus_provider.is_local_city_bus(o_n, d_n) and raw_mode in {"", "DRIVE"}:
        blob = ""
        try:
            for msg in reversed(state.get("messages") or []):
                name = type(msg).__name__
                content = getattr(msg, "content", "") or ""
                if name == "HumanMessage" or getattr(msg, "type", "") == "human":
                    blob = str(content).lower()
                    break
                if isinstance(msg, dict) and msg.get("role") == "user":
                    blob = str(msg.get("content") or "").lower()
                    break
        except Exception:
            blob = ""
        if not re.search(r"\b(driv(?:e|ing)|taxi|uber|lyft|\bcar\b|walk(?:ing)?)\b", blob):
            mode = "TRANSIT"
            raw_mode = "TRANSIT"

    summary = travel_service.get_route_summary(
        o_n or origin,
        d_n or destination,
        mode,
        departure_time=departure_time,
        arrival_time=arrival_time,
        routing_preference=routing_preference,
        transit_modes=transit_modes,
    )
    trip_context_update: dict[str, Any] = {}
    wants_bus = raw_mode in {"BUS", "TRANSIT", "PUBLIC", "PUBLIC_TRANSIT"} or "BUS" in (
        transit_modes or ""
    ).upper()
    if wants_bus and bus_provider.is_local_city_bus(o_n or origin, d_n or destination):
        bus_res = travel_service.search_india_buses_structured(
            o_n or origin, d_n or destination, when=departure_time or "", window=""
        )
        recs = [
            {
                "operator": b.get("operator"),
                "dep": b.get("dep"),
                "from_stop": b.get("from_stop"),
                "to_stop": b.get("to_stop"),
                "local": True,
            }
            for b in (bus_res.get("buses") or [])[:6]
        ]
        trip_context_update = {
            "last_bus_query": f"{origin}→{destination}",
            "last_bus_recs": recs,
            "transport_mode": "bus",
        }
        if bus_res.get("left_nav"):
            trip_context_update["pending_left_nav"] = bus_res["left_nav"]
        nearby = next((r.get("from_stop") for r in recs if r.get("from_stop")), "")
        if nearby and nearby.lower() not in summary.lower():
            summary = f"SPEAK FIRST — nearby boarding stop: {nearby}.\n{summary}"
    update: dict[str, Any] = {
        "messages": [ToolMessage(content=summary, tool_call_id=tool_call_id)],
    }
    if trip_context_update:
        update["trip_context"] = trip_context_update
    return Command(update=update)


# ---------------------------------------------------------------------------
# Place search (Google Places API New)
# ---------------------------------------------------------------------------
@tool
def search_places(
    query: str,
    max_results: int = 5,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Search real restaurants / attractions / landmarks via Google Places.
    Use for dinner, restaurants, "where to eat", cafes, nightlife, sights.
    NOT for hotel stays (use search_hotels) and NOT for inventing a trip.

    Indian neighbourhoods MUST include the parent city:
    "fine dining restaurants in Adajan, Surat, Gujarat"
    "romantic dinner Vesu Surat" — never query "Adajan" alone.

    Args:
        query: Natural-language place search including city + state.
        max_results: Maximum places to return. Defaults to 5.
    """
    result = travel_service.search_places_structured(query, max_results)
    content = result["text"]
    if result["cards"]:
        content += f"\n\n[CARDS_DATA: {json.dumps(result['cards'])}]"

    recs = [
        {
            "name": p.get("name"),
            "rating": p.get("rating"),
            "type": p.get("type"),
            "area": p.get("area"),
            "summary": (p.get("summary") or "")[:180],
        }
        for p in (result.get("places") or [])[:8]
    ]
    return Command(
        update={
            "trip_context": {
                "last_place_query": query,
                "last_place_recs": recs,
                "dining_intent": True,
            },
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


# ---------------------------------------------------------------------------
# Live events (Ticketmaster Discovery) — search only, never purchase
# ---------------------------------------------------------------------------
@tool
def search_events(
    city: str,
    start_date: str = "",
    end_date: str = "",
    keyword: str = "",
    classification: str = "",
    country_code: str = "",
    max_results: int = 8,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Search live Ticketmaster events: concerts, sports, theatre, comedy, family shows.
    Use for "what's on tonight", tickets, Broadway, NFL/NBA/MLB, Universal-adjacent
    live shows, date-night entertainment. NOT restaurants (search_places) and
    NOT hotel stays (search_hotels). NEVER purchase or claim you booked tickets.

    Coverage is strongest in US, Canada, UK, Ireland, Australia, NZ, Mexico, and
    parts of EU. India / much of Asia often returns zero — say so; do not invent.

    Call validate_date first when they said tonight / tomorrow / a named date.

    Args:
        city: City name, e.g. "New York", "London", "Orlando".
        start_date: YYYY-MM-DD inclusive. Empty = upcoming from now.
        end_date: YYYY-MM-DD inclusive. Empty = open-ended.
        keyword: Artist, team, or show name (e.g. "Coldplay", "Yankees").
        classification: music | sports | theatre | arts | family | film | comedy.
        country_code: ISO-2 if known (US, GB, AU, CA…). Optional.
        max_results: 1–20, default 8.
    """
    result = travel_service.search_events_structured(
        city,
        start_date=start_date,
        end_date=end_date,
        keyword=keyword,
        classification=classification,
        country_code=country_code,
        max_results=max_results,
    )
    content = result["text"]
    if result["cards"]:
        content += f"\n\n[CARDS_DATA: {json.dumps(result['cards'])}]"

    recs = [
        {
            "name": e.get("name"),
            "venue": e.get("venue"),
            "when": e.get("when"),
            "classification": e.get("classification"),
            "price": e.get("price"),
            "url": e.get("url"),
            "id": e.get("id"),
        }
        for e in (result.get("events") or [])[:8]
    ]
    return Command(
        update={
            "trip_context": {
                "last_event_query": city,
                "last_event_recs": recs,
            },
            "messages": [ToolMessage(content=content, tool_call_id=tool_call_id)],
        }
    )


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
    max_results: int = 12,
    *,
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Quick flight price/options lookup ONLY — never books.

    FORBIDDEN when trip_context.ui_page already shows a flights search for this
    same origin/destination — answer from ui_page picks/samples instead (cheapest,
    fastest, expensive, nonstop). Do not call this tool just to sort/filter.

    FORBIDDEN when planning_mode=full_trip or the user is building an N-day
    itinerary / asked for both flights+hotels. In that case call
    escalate_to_itinerary instead (staged flight → draft → day hotels).

    Use only for one-off fare checks with no full trip plan, or a DIFFERENT route.

    Args:
        origin: Origin city or airport code, e.g. "Mumbai" or "BOM".
        destination: Destination city or airport code, e.g. "Goa" or "GOI".
        departure_date: Outbound date, YYYY-MM-DD (from validate_date).
        return_date: Optional return date for round trips, YYYY-MM-DD. Omit for one-way.
        adults: Number of adult passengers. Defaults to 1.
        cabin_class: One of Economy, Premium Economy, Business, First. Defaults to Economy.
        max_budget_per_person: Optional max price per passenger.
        nonstop_preferred: Optional, true to prefer nonstop options.
        max_results: Maximum number of offers to show. Defaults to 12 (diverse airlines).
    """
    ctx = (state or {}).get("trip_context") or {}
    guard = flight_search_guard(
        destination,
        origin,
        str(ctx.get("transport_mode") or ""),
    )
    if guard:
        return Command(
            update={"messages": [ToolMessage(content=guard, tool_call_id=tool_call_id)]}
        )
    if str(ctx.get("planning_mode") or "").lower() == "full_trip":
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            "BLOCKED: planning_mode=full_trip. Do not quick-search flights. "
                            "Call escalate_to_itinerary now with the known trip JSON "
                            "(destination, origin, checkin, checkout, travelers, budget)."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

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
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]

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
    state: Annotated[dict, InjectedState],
    tool_call_id: Annotated[str, InjectedToolCallId],
) -> Command:
    """
    Quick hotel price/options lookup ONLY — never books.

    FORBIDDEN when planning_mode=full_trip or the user is building an N-day
    itinerary / asked for both flights+hotels. In that case call
    escalate_to_itinerary instead (staged flight → draft → day hotels).

    Use only for one-off stay checks with no full trip plan.

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
    ctx = (state or {}).get("trip_context") or {}
    if str(ctx.get("planning_mode") or "").lower() == "full_trip":
        return Command(
            update={
                "messages": [
                    ToolMessage(
                        content=(
                            "BLOCKED: planning_mode=full_trip. Do not quick-search hotels. "
                            "Call escalate_to_itinerary now with the known trip JSON "
                            "(destination, origin, checkin, checkout, travelers, budget)."
                        ),
                        tool_call_id=tool_call_id,
                    )
                ],
            }
        )

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
    if result.get("left_nav"):
        trip_context_update["pending_left_nav"] = result["left_nav"]

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
    planning_mode: Optional[str] = None,
    transport_mode: Optional[str] = None,
    preferred_name: Optional[str] = None,
    address_style: Optional[str] = None,
    selected_flight: Optional[Union[str, dict[str, Any]]] = None,
    selected_hotel: Optional[Union[str, dict[str, Any]]] = None,
    return_flight: Optional[Union[str, dict[str, Any]]] = None,
    leg_index: Optional[int] = None,
    leg_data: Optional[Union[str, dict[str, Any]]] = None,
) -> str:
    """
    Update the agent's internal state tracker with confirmed trip details.

    Call this tool proactively whenever the user provides or confirms new
    information about their trip. This ensures the full context is preserved
    for the final itinerary handoff.

    SELECTION SAVING — MANDATORY:
    Whenever a user confirms a flight or hotel choice, immediately call this
    tool with selected_flight or selected_hotel (JSON object OR JSON string).
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
        planning_mode: 'full_trip' when building a multi-day itinerary / both
            flights+hotels; 'quick_search' for price-only lookups. Set as soon
            as intent is clear.
        transport_mode: 'train' | 'bus' | 'car' | 'flight' when the user said
            how they want to go. Train/bus/car STICKS — do not search_flights.
        preferred_name: If they said "call me X", store X. Empty string to stop using a name.
        address_style: 'respectful' | 'neutral' | 'casual' | 'intimate'. Default respectful.
        selected_flight: Flight the user just selected — object or JSON string.
            Include: airline, flight_code, dep_time, arr_time, origin, destination,
            price, currency, stops, duration.
        selected_hotel: Hotel the user just selected — object or JSON string.
            Include: name, room_name, board, price_total, price_per_night,
            currency, refundable.
        return_flight: Return flight (round_trip only) — object or JSON string.
            Same structure as selected_flight.
        leg_index: For multi_destination trips only — which leg (1-based) this
            update belongs to (e.g. 1 = first leg, 2 = second leg).
        leg_data: For multi_destination — full leg object as JSON string.
            Include: from, to, departure_date, nights, hotel_checkin,
            hotel_checkout, selected_flight, selected_hotel.
    """
    return "Trip context updated successfully in agent state."


# ---------------------------------------------------------------------------
# Full trip-plan escalation — signal only (orchestrator continues as Vero)
# ---------------------------------------------------------------------------
@tool
def escalate_to_itinerary(task_description: str, reason: str) -> str:
    """
    Continue as Vero into the full trip-planning flow: flight pick → draft
    day-by-day itinerary → hotels day-by-day → prebook → final confirmation.
    The user must never hear about internal agents — this is still Vero.

    Call this ONLY when building a bookable MULTI-CITY trip (or modifying one):
    - Origin AND one chosen destination (they must differ)
    - Dates + travellers known (or user said go / both / ready)
    - planning_mode is full_trip
    - User wants only a multi-day day-by-day plan → scope itinerary_only

    Do NOT call this for:
    - Within-city day / "full day in Mumbai" / 8 hours between trains (use search_places + get_route TRANSIT)
    - Compare / eliminate / constraint-satisfaction across several countries
    - Visa, transit, train-vs-flight advice
    - "I want to go to X" / one-way ticket / flight prices (use search_flights)
    - weather, routes, or pure price look-ups
    Do NOT invent checkout / a 3-day sightseeing plan when they only gave a depart date.
    Origin is REQUIRED. Destination is REQUIRED and must not equal origin.
    If origin is unknown, ask it — do not escalate.
    Do NOT call search_flights/search_hotels in the same turn — escalate instead.

    IMPORTANT — task_description must be a JSON string built from ALL known
    trip context. Use this exact structure:

    For one_way / round_trip:
    {
      "trip_type": "one_way" | "round_trip",
      "origin": "...",
      "destination": "...",
      "checkin": "YYYY-MM-DD",
      "checkout": "YYYY-MM-DD",
      "departure_date": "YYYY-MM-DD",
      "return_date": "YYYY-MM-DD",
      "travelers": {"adults": N, "children": N, "infants": N},
      "budget": "...",
      "currency": "INR",
      "scope": "full" | "hotels_only" | "itinerary_only",
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
        reason: Short internal reason for starting full trip planning.
    """
    data = {}
    raw = (task_description or "").strip()
    try:
        parsed = json.loads(raw) if raw.startswith("{") else {}
        if isinstance(parsed, dict):
            data = parsed
    except Exception:
        data = {}
    origin = str(data.get("origin") or "").strip()
    dest = str(data.get("destination") or "").strip()
    checkout = str(data.get("checkout") or data.get("return_date") or "").strip()
    scope = str(data.get("scope") or "full").lower().strip()
    trip_type = str(data.get("trip_type") or "").lower().strip()
    reason_l = f"{reason or ''} {raw}".lower()
    compare_ask = any(
        p in reason_l
        for p in (
            "compare",
            "eliminate",
            "pick exactly one",
            "pick one winner",
            "hard constraint",
            "which country",
            "which destination",
        )
    )
    within_city_ask = any(
        p in reason_l
        for p in (
            "full day",
            "one day",
            "one-day",
            "day plan",
            "8 hours",
            "today in",
            "this evening",
            "date night",
            "walking only",
            "metro and walking",
        )
    )
    full_trip_ask = any(
        p in reason_l
        for p in (
            "n-day",
            "n day",
            "full trip",
            "full plan",
            "flights and hotel",
            "hotel and flight",
            "both",
            "3 day",
            "3-day",
            "plan a trip",
            "7-day",
            "7 day",
            "honeymoon",
        )
    )
    if not origin:
        return (
            "BLOCKED_ESCALATION: origin is missing. Ask where they are flying FROM, "
            "then call search_flights. Do NOT invent a day-by-day plan."
        )
    same_place = bool(dest) and origin.strip().lower() == dest.strip().lower()
    if dest and not same_place:
        try:
            from services.location_resolver import local_airport_key
            oa, da = local_airport_key(origin), local_airport_key(dest)
            same_place = bool(oa and da and oa == da)
        except Exception:
            pass
    if within_city_ask or same_place:
        return (
            "BLOCKED_ESCALATION: this is a within-city day, not a multi-city booking. "
            "Use search_places + get_route + get_weather. Do NOT invent an airport arrival itinerary."
        )
    if compare_ask and (not dest or "," in dest or "+" in dest or " or " in dest.lower()):
        return (
            "BLOCKED_ESCALATION: constraint comparison. Eliminate options in Vero first, "
            "pick exactly ONE destination that differs from origin, then escalate or search_flights."
        )
    if not dest:
        return (
            "BLOCKED_ESCALATION: destination is missing. For advice/compare, reason with tools. "
            "For a bookable trip, lock ONE destination first."
        )
    if scope in ("full", "itinerary_only", "") and trip_type in ("one_way", "oneway") and not checkout and not full_trip_ask:
        return (
            "BLOCKED_ESCALATION: this is a one-way flight ticket, not a full itinerary. "
            "Set planning_mode=quick_search and call search_flights "
            f"(origin={origin}, destination={dest or '?'}). "
            "Do NOT invent checkout dates or a 3-day sightseeing plan."
        )
    logger.info(
        "Escalating to itinerary engine (user-facing: Vero) | task=%s | reason=%s",
        task_description,
        reason,
    )
    return f"ESCALATE_TO_ITINERARY|task={task_description}|reason={reason}"


# Single list the graph imports - add new tools here as they're built.
ALL_TOOLS = [
    validate_date,          # always first — date guard before any search
    tavily_search,
    lookup_india_route,
    search_trains,
    search_buses,
    track_train,
    track_flight,
    track_airport,
    check_pnr,
    order_train_food,
    check_visa,
    get_weather,
    get_exchange_rate,
    get_route,
    search_places,
    search_events,
    geocode_location,
    search_flights,
    search_hotels,
    select_searched_flight,
    select_searched_hotel,
    update_trip_context,
    escalate_to_itinerary,
]
