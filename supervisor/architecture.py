"""
Vero command-router architecture (aligned to the product flowchart).

Stages (route_path labels):
  start → supervisor (command_router)
    → general_chat → general_agent → [websearch_agent] → end
    → trip_detail_collection → missing_field_checker → interrupt
    → travel_search → research_dispatch (parallel fan-out) → research_join
         → present_options → availability_recheck → payment_confirmation
         → booking_subflow → booking_confirmation → itinerary_agent
         → pdf_generation_agent (async/future) + tracking_list_agent (async/future)
         → final_user_confirmation → END (BOOKED→MONITORING)

Future / V1.1 nodes are named and returned as stubs — never invent live data.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

# Per-branch timeout for research_dispatch fan-out.
# Flights/LiteAPI often need longer than a generic research branch.
BRANCH_TIMEOUT_S = 12.0
FLIGHT_BRANCH_TIMEOUT_S = 55.0

# Architecture node status for /api/capabilities
NODE_STATUS: dict[str, str] = {
    "supervisor_command_router": "live",
    "general_agent": "live_if_configured",
    "websearch_agent": "live_if_configured",  # via general_agent tools (Tavily etc.)
    "trip_detail_collection": "live",
    "missing_field_checker": "live",
    "travel_agent_flights": "live_if_configured",  # LiteAPI
    "travel_agent_train": "live_if_configured",  # Vero search_trains / IRCTC handoff
    "travel_agent_bus": "live_if_configured",  # Vero search_buses
    "hotel_agent": "live_if_configured",  # LiteAPI structured hotel search/book
    "visa_checker_agent": "live_if_configured",  # Vero check_visa
    "research_dispatch": "live",
    "research_join": "live",
    "present_options": "live",
    "availability_recheck": "partial",  # via flight verify/prebook path
    "payment_confirmation": "partial",  # via Travel_Agent payment flow
    "booking_subflow": "partial",
    "booking_confirmation": "partial",
    "itinerary_agent": "best_effort",
    "pdf_generation_agent": "future_v1_1",
    "tracking_list_agent": "future_v1_1",
    "calling_agent": "future_v1_1",
    "final_user_confirmation": "future_v1_1",
}


@dataclass
class TripSlots:
    origin: Optional[str] = None
    destination: Optional[str] = None
    depart_date: Optional[str] = None
    return_date: Optional[str] = None
    adults: int = 1
    children: int = 0
    infants: int = 0
    cabin: str = "ECONOMY"
    passport_country: Optional[str] = None

    def missing_for_travel_search(self) -> list[str]:
        missing: list[str] = []
        if not self.origin:
            missing.append("origin")
        if not self.destination:
            missing.append("destination")
        if not self.depart_date:
            missing.append("depart_date")
        return missing

    def ready_for_travel_search(self) -> bool:
        return not self.missing_for_travel_search()


@dataclass
class BranchResult:
    name: str
    status: str  # live | degraded | stub | timeout | future | error
    summary: str
    data: dict[str, Any] = field(default_factory=dict)
    route_node: str = ""


_CITY_IATA = {
    "mumbai": "BOM",
    "bombay": "BOM",
    "delhi": "DEL",
    "new delhi": "DEL",
    "hyderabad": "HYD",
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "chennai": "MAA",
    "madras": "MAA",
    "kolkata": "CCU",
    "calcutta": "CCU",
    "pune": "PNQ",
    "ahmedabad": "AMD",
    "goa": "GOI",
    "jaipur": "JAI",
    "kochi": "COK",
    "cochin": "COK",
    "surat": "STV",
    "lucknow": "LKO",
    "chandigarh": "IXC",
    "indore": "IDR",
    "nagpur": "NAG",
    "varanasi": "VNS",
    "patna": "PAT",
    "guwahati": "GAU",
    "srinagar": "SXR",
    "amritsar": "ATQ",
    "dubai": "DXB",
    "abu dhabi": "AUH",
    "new york": "JFK",
    "newyork": "JFK",
    "nyc": "JFK",
    "los angeles": "LAX",
    "london": "LHR",
    "paris": "CDG",
    "singapore": "SIN",
    "bangkok": "BKK",
    "doha": "DOH",
    "tokyo": "NRT",
    "hong kong": "HKG",
    "san francisco": "SFO",
}

# Real airport codes only — never treat English words like "NEW" as IATA.
_KNOWN_IATA = frozenset(
    {
        "BOM", "DEL", "BLR", "MAA", "CCU", "HYD", "PNQ", "GOI", "AMD", "COK",
        "JAI", "LKO", "GAU", "IXC", "BBI", "TRV", "VNS", "PAT", "IDR", "NAG",
        "STV", "SXR", "ATQ", "IXB", "IXE", "IXM", "IXR", "IXZ", "RPR", "VTZ",
        "DXB", "AUH", "SHJ", "DOH", "MCT", "BAH", "KWI", "RUH", "JED",
        "JFK", "EWR", "LGA", "LAX", "SFO", "ORD", "ATL", "MIA", "SEA", "BOS",
        "IAD", "DFW", "DEN", "LAS", "SAN", "PHX", "CLT", "MSP", "DTW",
        "LHR", "LGW", "STN", "MAN", "CDG", "ORY", "AMS", "FRA", "MUC", "ZRH",
        "FCO", "MXP", "BCN", "MAD", "IST", "ATH", "VIE", "CPH", "ARN", "HEL",
        "SIN", "BKK", "HKG", "NRT", "HND", "ICN", "PVG", "PEK", "KUL", "CGK",
        "SYD", "MEL", "AKL", "CPT", "JNB", "CAI", "NBO", "ADD", "CMN",
        "YYZ", "YVR", "YUL", "GRU", "GIG", "EZE", "SCL", "BOG", "MEX", "CUN",
    }
)

_ROUTE = re.compile(
    r"\b((?:new|los|san|abu|hong|sri|port)\s+[A-Za-z]{3,}"
    r"|(?!want|need|like|book|fly|going|travel|trip|plan|where|what|how|when)"
    r"[A-Za-z]{3,}|[A-Z]{3})"
    r"\s+to\s+"
    r"((?:new|los|san|abu|hong|sri|port)\s+[A-Za-z]{3,}"
    r"|(?!eat|eats|eating|do|be|go|visit|book|fly)"
    r"[A-Za-z]{3,}|[A-Z]{3})\b",
    re.I,
)
_IATA = re.compile(r"\b([A-Z]{3})\b")
_ISO_DATE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
# "17th August", "17 th august", "17 August 2026", "the 17th of Aug"
_DMY = re.compile(
    r"\b(?:the\s+)?(\d{1,2})(?:\s*(?:st|nd|rd|th))?"
    r"(?:\s+of)?\s+"
    r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"(?:\s*[,\-]?\s*(\d{4}))?\b",
    re.I,
)
# 17/08, 17-08-2026, 17.08.26
_NUMERIC_DATE = re.compile(
    r"\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b"
)
_RELATIVE = re.compile(
    r"\b(tomorrow|today|next\s+week|this\s+weekend)\b",
    re.I,
)
_MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def _to_iata(token: str) -> Optional[str]:
    """Map city name or known IATA → code. Never invent codes from English words."""
    t = " ".join(str(token or "").strip().split())
    if not t:
        return None
    low = t.lower()
    city = _CITY_IATA.get(low) or _CITY_IATA.get(low.replace(" ", ""))
    if city:
        return city
    if len(t) == 3 and t.isalpha():
        code = t.upper()
        if code in _KNOWN_IATA:
            return code
    return None


# Display names for bare place replies ("newyork", "NYC", "surat").
_PLACE_DISPLAY: dict[str, str] = {
    "newyork": "New York",
    "new york": "New York",
    "nyc": "New York",
    "ny": "New York",
    "losangeles": "Los Angeles",
    "los angeles": "Los Angeles",
    "la": "Los Angeles",
    "sanfrancisco": "San Francisco",
    "san francisco": "San Francisco",
    "sf": "San Francisco",
    "abudhabi": "Abu Dhabi",
    "abu dhabi": "Abu Dhabi",
    "hongkong": "Hong Kong",
    "hong kong": "Hong Kong",
    "bengaluru": "Bengaluru",
    "bangalore": "Bangalore",
    "mumbai": "Mumbai",
    "bombay": "Mumbai",
    "delhi": "Delhi",
    "newdelhi": "Delhi",
    "new delhi": "Delhi",
    "surat": "Surat",
    "goa": "Goa",
    "hyderabad": "Hyderabad",
    "chennai": "Chennai",
    "kolkata": "Kolkata",
    "pune": "Pune",
    "ahmedabad": "Ahmedabad",
    "jaipur": "Jaipur",
    "kochi": "Kochi",
    "dubai": "Dubai",
    "london": "London",
    "paris": "Paris",
    "singapore": "Singapore",
    "bangkok": "Bangkok",
    "tokyo": "Tokyo",
    "manali": "Manali",
    "shimla": "Shimla",
    "udaipur": "Udaipur",
    "rishikesh": "Rishikesh",
    "lonavala": "Lonavala",
}

_BARE_PLACE_BLOCKLIST = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "hii",
        "thanks",
        "thank",
        "yes",
        "yeah",
        "yep",
        "no",
        "nope",
        "ok",
        "okay",
        "sure",
        "please",
        "help",
        "flight",
        "flights",
        "hotel",
        "hotels",
        "trip",
        "plan",
        "food",
        "veg",
        "continue",
    }
)


def resolve_place_reply(message: str) -> Optional[str]:
    """
    Treat short destination-only replies as a city name.
    e.g. "newyork" / "NYC" / "surat" → "New York" / "Surat".
    Returns None when the message looks like a sentence or non-place.
    """
    raw = " ".join(str(message or "").strip().split())
    if not raw or len(raw) > 40:
        return None
    if any(ch in raw for ch in "?!."):
        return None
    words = raw.split()
    if len(words) > 3:
        return None
    # Drop filler: "to New York", "in surat"
    low_words = [w.lower().strip(",.") for w in words]
    if low_words and low_words[0] in {"to", "in", "for", "at", "near"}:
        low_words = low_words[1:]
        raw = " ".join(words[1:])
        words = raw.split()
        low_words = [w.lower().strip(",.") for w in words]
    # Reject route phrasing ("mumbai to delhi") and non-place tokens
    if not low_words or "to" in low_words:
        return None
    if any(w in _BARE_PLACE_BLOCKLIST for w in low_words):
        return None

    key = re.sub(r"[^a-z\s]", "", raw.lower())
    key = re.sub(r"\s+", " ", key).strip()
    compact = key.replace(" ", "")
    if not key or key in _BARE_PLACE_BLOCKLIST or compact in _BARE_PLACE_BLOCKLIST:
        return None

    if key in _PLACE_DISPLAY:
        return _PLACE_DISPLAY[key]
    if compact in _PLACE_DISPLAY:
        return _PLACE_DISPLAY[compact]

    # Known city→IATA keys (including spaced / compacted forms)
    compact_city = {k.replace(" ", ""): k for k in _CITY_IATA}
    if key in _CITY_IATA:
        return " ".join(part.capitalize() for part in key.split())
    if compact in compact_city:
        spaced = compact_city[compact]
        return " ".join(part.capitalize() for part in spaced.split())

    # Single-token alphabetic guess only (avoid inventing places from sentences)
    if len(words) == 1 and compact.isalpha() and len(compact) >= 3:
        return compact.capitalize()
    return None


def extract_destination_from_trip_ask(message: str) -> Optional[str]:
    """
    Pull a destination out of longer trip asks.
    e.g. "I want to plan trip to goa" → "Goa"
         "plan a 5-day trip in Surat" → "Surat"
    """
    text = " ".join(str(message or "").strip().split())
    if not text:
        return None

    patterns = [
        r"\b(?:trip|trips|vacation|holiday|getaway|visit|travel|itinerary)\s+to\s+([A-Za-z][A-Za-z\s]{1,28})",
        r"\b(?:plan|planning)\s+(?:a\s+|an\s+|my\s+|the\s+)?(?:\d+[-\s]?day(?:s)?\s+)?(?:trip\s+)?(?:to|in)\s+([A-Za-z][A-Za-z\s]{1,28})",
        r"\b(?:\d+[-\s]?days?)\s+(?:in|to|at)\s+([A-Za-z][A-Za-z\s]{1,28})",
        r"\b(?:going|headed|flying)\s+to\s+([A-Za-z][A-Za-z\s]{1,28})",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.I)
        if not m:
            continue
        frag = m.group(1).strip(" .,!?;:")
        # Cut trailing junk: "goa from mumbai" → goa
        frag = re.split(
            r"\b(?:from|for|with|on|next|this|and|please|tomorrow|today)\b",
            frag,
            maxsplit=1,
            flags=re.I,
        )[0].strip()
        if not frag:
            continue
        place = resolve_place_reply(frag)
        if place:
            return place
        key = re.sub(r"[^a-z\s]", "", frag.lower())
        key = re.sub(r"\s+", " ", key).strip()
        compact = key.replace(" ", "")
        if key in _PLACE_DISPLAY:
            return _PLACE_DISPLAY[key]
        if compact in _PLACE_DISPLAY:
            return _PLACE_DISPLAY[compact]
        if key and key not in _BARE_PLACE_BLOCKLIST and len(frag.split()) <= 3:
            return " ".join(w[:1].upper() + w[1:].lower() for w in frag.split() if w)
    return None


def _resolve_year(year: Optional[int], month: int, day: int) -> Optional[str]:
    """Build YYYY-MM-DD. If year omitted and that date already passed, use next year."""
    today = datetime.now().date()
    explicit = year is not None
    if year is None:
        year = today.year
    elif year < 100:
        year += 2000
    try:
        dt = datetime(year, month, day).date()
    except ValueError:
        return None
    if not explicit and dt < today:
        try:
            dt = datetime(today.year + 1, month, day).date()
        except ValueError:
            return None
    return dt.isoformat()


def _parse_date_token(text: str) -> Optional[str]:
    m = _ISO_DATE.search(text)
    if m:
        return m.group(1)

    m = _DMY.search(text)
    if m:
        day = int(m.group(1))
        mon_raw = m.group(2).lower()
        mon = _MONTHS.get(mon_raw[:3]) or _MONTHS.get(mon_raw)
        year = int(m.group(3)) if m.group(3) else None
        if not mon:
            return None
        return _resolve_year(year, mon, day)

    m = _NUMERIC_DATE.search(text)
    if m:
        a, b = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else None
        # Prefer D/M when day>12; else assume D/M (India-friendly)
        if a > 12 and b <= 12:
            day, mon = a, b
        elif b > 12 and a <= 12:
            day, mon = b, a
        else:
            day, mon = a, b
        return _resolve_year(year, mon, day)

    m = _RELATIVE.search(text)
    if not m:
        return None
    rel = m.group(1).lower()
    today = datetime.now().date()
    if rel == "today":
        return today.isoformat()
    if rel == "tomorrow":
        return (today + timedelta(days=1)).isoformat()
    if "weekend" in rel:
        days = (5 - today.weekday()) % 7 or 7
        return (today + timedelta(days=days)).isoformat()
    if "week" in rel:
        return (today + timedelta(days=7)).isoformat()
    return None


def apply_slot_answers(
    session: dict[str, Any],
    answers: dict[str, Any] | None,
) -> None:
    """Merge structured widget answers into session trip_slots (Vero chat UI)."""
    if not answers or not isinstance(answers, dict):
        return
    prior = dict(session.get("trip_slots") or {})
    mapping = {
        "origin": "origin",
        "destination": "destination",
        "depart_date": "depart_date",
        "return_date": "return_date",
        "adults": "adults",
        "children": "children",
        "infants": "infants",
        "cabin": "cabin",
        "passport_country": "passport_country",
    }
    for src, dest in mapping.items():
        if src not in answers or answers[src] is None or answers[src] == "":
            continue
        val = answers[src]
        if dest in {"adults", "children", "infants"}:
            try:
                prior[dest] = max(0, int(val))
            except (TypeError, ValueError):
                continue
            if dest == "adults":
                prior[dest] = max(1, prior[dest])
        elif dest == "cabin":
            prior[dest] = str(val).upper().strip() or "ECONOMY"
        elif dest in {"origin", "destination"}:
            code = _to_iata(str(val))
            if code:
                prior[dest] = code
        else:
            prior[dest] = str(val).strip()
    session["trip_slots"] = prior


def extract_trip_slots(message: str, session: dict[str, Any] | None = None) -> TripSlots:
    """Best-effort slot fill from message + prior session trip_slots."""
    prior = (session or {}).get("trip_slots") or {}
    slots = TripSlots(
        origin=prior.get("origin"),
        destination=prior.get("destination"),
        depart_date=prior.get("depart_date"),
        return_date=prior.get("return_date"),
        adults=int(prior.get("adults") or 1),
        children=int(prior.get("children") or 0),
        infants=int(prior.get("infants") or 0),
        cabin=str(prior.get("cabin") or "ECONOMY").upper(),
        passport_country=prior.get("passport_country"),
    )

    text = message.strip()
    # Bare destination replies while collecting trip details ("newyork", "Surat")
    pending = (session or {}).get("pending_trip_slot")
    trip_flow = bool((session or {}).get("trip_flow"))
    if pending == "destination" or (trip_flow and not slots.destination):
        place = resolve_place_reply(text)
        if place:
            code = _to_iata(place) or _to_iata(text)
            slots.destination = code or place
    route_in_message = False
    for rm in _ROUTE.finditer(text):
        o = _to_iata(rm.group(1))
        d = _to_iata(rm.group(2))
        if not (o or d):
            continue
        if o:
            slots.origin = o
        if d:
            slots.destination = d
        route_in_message = True
        break

    # Bare IATA pair fallback — only known airport codes
    codes = [c for c in _IATA.findall(text.upper()) if c in _KNOWN_IATA]
    if len(codes) >= 2 and not (slots.origin and slots.destination):
        slots.origin = slots.origin or codes[0]
        slots.destination = slots.destination or codes[1]
        route_in_message = True

    # Single-airport fills from widget copy: "Flying from Mumbai (BOM)" / "from New York"
    from_m = re.search(
        r"\b(?:from|origin)\s+((?:new|los|san|abu|hong|sri|port)\s+[A-Za-z]{3,}"
        r"|[A-Za-z][A-Za-z\s]{1,24}?)\s*(?:\(([A-Z]{3})\))?\b",
        text,
        re.I,
    )
    if from_m and not slots.origin:
        slots.origin = _to_iata(from_m.group(2) or from_m.group(1))

    to_m = re.search(
        r"\b(?:to|destination)\s+((?:new|los|san|abu|hong|sri|port)\s+[A-Za-z]{3,}"
        r"|[A-Za-z][A-Za-z\s]{1,24}?)\s*(?:\(([A-Z]{3})\))?\b",
        text,
        re.I,
    )
    if to_m and not slots.destination:
        slots.destination = _to_iata(to_m.group(2) or to_m.group(1))

    date = _parse_date_token(text)
    if date:
        slots.depart_date = date
    elif route_in_message:
        # New city-pair ask without a date in *this* message — never reuse a
        # stale prior depart_date (that incorrectly triggers live search).
        slots.depart_date = None

    adults_m = re.search(r"\b(\d+)\s*(adults?|passengers?|pax|people|travellers?)\b", text, re.I)
    if adults_m:
        slots.adults = max(1, int(adults_m.group(1)))

    children_m = re.search(r"\b(\d+)\s*(children|child|kids?)\b", text, re.I)
    if children_m:
        slots.children = max(0, int(children_m.group(1)))

    cabin_m = re.search(
        r"\b(economy|premium\s*economy|business|first)\b",
        text,
        re.I,
    )
    if cabin_m:
        raw = re.sub(r"\s+", "_", cabin_m.group(1).upper())
        slots.cabin = {
            "ECONOMY": "ECONOMY",
            "PREMIUM_ECONOMY": "PREMIUM_ECONOMY",
            "BUSINESS": "BUSINESS",
            "FIRST": "FIRST",
        }.get(raw, "ECONOMY")

    pass_m = re.search(
        r"\b(passport|nationality|citizen)\s*(of\s+|from\s+|is\s+)?([A-Za-z]{2,})",
        text,
        re.I,
    )
    if pass_m:
        slots.passport_country = pass_m.group(3)[:2].upper() if len(pass_m.group(3)) == 2 else pass_m.group(3)

    return slots


def persist_trip_slots(session: dict[str, Any], slots: TripSlots) -> None:
    session["trip_slots"] = {
        "origin": slots.origin,
        "destination": slots.destination,
        "depart_date": slots.depart_date,
        "return_date": slots.return_date,
        "adults": slots.adults,
        "children": slots.children,
        "infants": slots.infants,
        "cabin": slots.cabin,
        "passport_country": slots.passport_country,
    }


def build_ui_prompts(slots: TripSlots) -> list[dict[str, Any]]:
    """Structured widgets for the Vero chat FE (date / airport / travelers)."""
    missing = slots.missing_for_travel_search()
    prompts: list[dict[str, Any]] = []
    for field in missing:
        if field == "depart_date":
            prompts.append(
                {
                    "type": "date_picker",
                    "field": "depart_date",
                    "label": "Pick your departure date",
                    "required": True,
                    "min_date": datetime.now().date().isoformat(),
                }
            )
        elif field == "origin":
            prompts.append(
                {
                    "type": "airport_picker",
                    "field": "origin",
                    "label": "Where are you flying from?",
                    "required": True,
                }
            )
        elif field == "destination":
            prompts.append(
                {
                    "type": "airport_picker",
                    "field": "destination",
                    "label": "Where do you want to go?",
                    "required": True,
                }
            )
    # Optional travelers/cabin once route is known (or always if any missing)
    if missing or (slots.origin and slots.destination):
        prompts.append(
            {
                "type": "travelers_cabin",
                "field": "travelers",
                "label": "Travelers & cabin",
                "required": False,
                "defaults": {
                    "adults": slots.adults,
                    "children": slots.children,
                    "infants": slots.infants,
                    "cabin": slots.cabin or "ECONOMY",
                },
            }
        )
    return prompts


def missing_field_interrupt(slots: TripSlots) -> str:
    """User-facing interrupt — ask for the most critical missing field(s)."""
    missing = slots.missing_for_travel_search()
    ask = {
        "origin": "Where are you flying **from**?",
        "destination": "Where do you want to go?",
        "depart_date": "Which **date** should I search?",
    }
    # Ask at most two
    lines = [ask[m] for m in missing[:2] if m in ask]
    known = []
    if slots.origin:
        known.append(f"from **{slots.origin}**")
    if slots.destination:
        known.append(f"to **{slots.destination}**")
    if slots.depart_date:
        known.append(f"on **{slots.depart_date}**")
    prefix = "Got it so far — " + ", ".join(known) + ".\n\n" if known else ""
    return (
        prefix
        + "I need a bit more before I search live options:\n"
        + "\n".join(f"- {line}" for line in lines)
    )


async def _run_with_timeout(
    name: str,
    coro_or_fn: Any,
    *,
    is_coro: bool,
    timeout: float = BRANCH_TIMEOUT_S,
) -> BranchResult:
    try:
        if is_coro:
            data = await asyncio.wait_for(coro_or_fn, timeout=timeout)
        else:
            loop = asyncio.get_event_loop()
            data = await asyncio.wait_for(
                loop.run_in_executor(None, coro_or_fn),
                timeout=timeout,
            )
        if isinstance(data, BranchResult):
            return data
        return BranchResult(name=name, status="live", summary=str(data), data={})
    except asyncio.TimeoutError:
        return BranchResult(
            name=name,
            status="timeout",
            summary=f"{name} timed out after {int(timeout)}s — continuing with other results.",
            route_node=f"{name}_timeout",
        )
    except Exception as exc:
        return BranchResult(
            name=name,
            status="error",
            summary=f"{name} failed ({type(exc).__name__}).",
            data={"error": str(exc)},
            route_node=f"{name}_error",
        )


def hotel_agent_stub(slots: TripSlots) -> BranchResult:
    city = slots.destination or "your destination"
    return BranchResult(
        name="hotel_agent",
        status="stub",
        summary=(
            f"Stays in **{city}** aren't searchable in chat yet — "
            "I won't invent hotels. Try the Hotels page, or ask me to plan days around your flight."
        ),
        route_node="hotel_agent_stub",
    )


def visa_checker_stub(slots: TripSlots) -> BranchResult:
    dest = slots.destination or "your destination"
    passport = slots.passport_country or "your passport"
    return BranchResult(
        name="visa_checker_agent",
        status="future",
        summary=(
            f"I can't run a full visa check for {passport} → {dest} yet. "
            "Please verify entry rules before you travel — happy to note it for your plan."
        ),
        route_node="visa_checker_future_v1_1",
    )


def train_bus_stub(mode: str) -> BranchResult:
    return BranchResult(
        name=f"travel_agent_{mode}",
        status="stub",
        summary=(
            f"**{mode.title()}** booking isn't live here yet. "
            "I *can* search flights in the meantime — just say the cities and date."
        ),
        route_node=f"{mode}_stub",
    )


def pdf_generation_stub() -> BranchResult:
    return BranchResult(
        name="pdf_generation_agent",
        status="future",
        summary="Trip PDF export is coming soon — your plan still lives in this chat for now.",
        route_node="pdf_generation_future_v1_1",
    )


def tracking_list_stub() -> BranchResult:
    return BranchResult(
        name="tracking_list_agent",
        status="future",
        summary=(
            "Live trip tracking (flights, weather alerts) is on the roadmap — "
            "I'll keep helping you from chat until then."
        ),
        route_node="tracking_list_future_v1_1",
    )


def calling_agent_stub() -> BranchResult:
    return BranchResult(
        name="calling_agent",
        status="future",
        summary="Phone/SMS alerts for major disruptions aren't on yet — check back in chat for plan changes.",
        route_node="calling_agent_future_v1_1",
    )


# Topics that unlock non-flight branch copy in present_options.
# Flight-only queries stay short; stubs/timeouts never leak into chat otherwise.
_BRANCH_TOPIC_RE: dict[str, re.Pattern[str]] = {
    "hotel_agent": re.compile(
        r"\b(hotel|hotels|stay|stays|resort|accommodation|lodging)\b", re.I
    ),
    "visa_checker_agent": re.compile(r"\b(visa|immigration|passport\s+stamp)\b", re.I),
    "websearch_agent": re.compile(
        r"\b(safety|tips|weather|poi|attractions?|things\s+to\s+do|"
        r"itinerary|news|travel\s+advisory)\b",
        re.I,
    ),
}

_SUPPRESSED_BRANCH_STATUSES = frozenset({"stub", "future", "timeout", "error", "degraded"})


def _format_depart_friendly(iso_date: Optional[str]) -> str:
    """Render YYYY-MM-DD as '26 Jul' for chat copy."""
    if not iso_date:
        return "your date"
    try:
        dt = datetime.strptime(iso_date[:10], "%Y-%m-%d")
        return dt.strftime("%d %b").lstrip("0")
    except ValueError:
        return iso_date


def _user_asked_for_branch(message: str | None, branch_name: str) -> bool:
    if not message:
        return False
    pat = _BRANCH_TOPIC_RE.get(branch_name)
    return bool(pat and pat.search(message))


def _should_surface_branch(
    branch: BranchResult,
    *,
    message: str | None,
    flight_focused: bool,
) -> bool:
    """Keep stub/timeout research noise out of flight-search replies."""
    if branch.name == "travel_agent_flights":
        return False
    asked = _user_asked_for_branch(message, branch.name)
    if flight_focused and not asked:
        return False
    if branch.status in _SUPPRESSED_BRANCH_STATUSES and not asked:
        return False
    # Even when asked, don't dump raw timeout/error agent strings into chat.
    if branch.status in {"timeout", "error"} and not asked:
        return False
    if branch.status in {"timeout", "error"}:
        return False
    return bool((branch.summary or "").strip())


def compose_present_options(
    *,
    slots: TripSlots,
    branches: list[BranchResult],
    flights: list[dict[str, Any]] | None = None,
    message: str | None = None,
    flight_focused: bool = True,
) -> str:
    """User-facing present_options after research_join — short when flights-only."""
    date_label = _format_depart_friendly(slots.depart_date)
    origin = slots.origin or "?"
    dest = slots.destination or "?"
    flight_branch = next((b for b in branches if b.name == "travel_agent_flights"), None)

    if flights:
        n = len(flights)
        lines = [
            f"Here are live **{origin} → {dest}** options for **{date_label}** "
            f"— {n} fare{'s' if n != 1 else ''} below.",
        ]
    elif flight_branch and flight_branch.status in {"degraded", "timeout", "error"}:
        lines = [
            f"I couldn't load live fares for **{origin} → {dest}** on **{date_label}** just now.",
            "Try again in a moment, or open **Flights** in the app.",
        ]
    elif flight_branch:
        lines = [
            f"Here's what I found for **{origin} → {dest}** on **{date_label}**.",
            flight_branch.summary,
        ]
    else:
        lines = [
            f"Okay — looking at **{origin} → {dest}** on **{date_label}**.",
        ]

    friendly_labels = {
        "hotel_agent": "Stays",
        "visa_checker_agent": "Visa",
        "websearch_agent": "Tips & safety",
    }
    extras: list[str] = []
    for b in branches:
        if not _should_surface_branch(
            b, message=message, flight_focused=flight_focused
        ):
            continue
        label = friendly_labels.get(b.name, b.name.replace("_", " ").title())
        extras.append(f"**{label}** — {b.summary}")

    if extras:
        lines.append("")
        lines.extend(extras)

    if flights:
        lines.append("")
        lines.append("Tap **Book Now** on a card when you're ready.")

    return "\n".join(lines)


async def research_dispatch(
    *,
    slots: TripSlots,
    message: str,
    session: dict[str, Any],
    flight_search_fn: Callable[..., Any],
    websearch_fn: Callable[..., Any],
    flight_focused: bool = True,
) -> tuple[list[BranchResult], list[dict[str, Any]], str]:
    """
    Parallel fan-out → join with per-branch timeout.
    Returns (branches, flight_ui_list, mode).

    Flight-only chats skip hotel/visa/websearch fan-out by default so LiteAPI
    isn't blocked behind a 12s research timeout. Extra branches run only when
    the user asked for that topic.
    """

    async def flights_coro() -> BranchResult:
        result = await flight_search_fn(
            origin=slots.origin,
            destination=slots.destination,
            depart_date=slots.depart_date,
            return_date=slots.return_date,
            adults=slots.adults,
            children=max(0, slots.children),
            infants=max(0, slots.infants),
            cabin=(slots.cabin or "ECONOMY"),
            session=session,
        )
        flights = result.get("flights") or []
        mode = result.get("mode") or "live"
        err = result.get("error")
        if err and not flights:
            return BranchResult(
                name="travel_agent_flights",
                status="degraded",
                summary=result.get("message") or str(err),
                data=result,
                route_node="travel_agent_flights",
            )
        return BranchResult(
            name="travel_agent_flights",
            status=mode if mode in {"live", "degraded", "stub"} else "live",
            summary=result.get("message") or f"{len(flights)} offers",
            data=result,
            route_node="travel_agent_flights",
        )

    def websearch_sync() -> BranchResult:
        reply, _path, _routed, missing, *_rest = websearch_fn(
            (
                f"Brief travel safety / POI / news notes for a trip "
                f"{slots.origin} to {slots.destination} around {slots.depart_date}. "
                f"Keep it short. User also said: {message}"
            ),
            session.get("session_id") or "dispatch",
            session=session,
        )
        status = "degraded" if missing else "live"
        return BranchResult(
            name="websearch_agent",
            status=status,
            summary=(reply[:600] + ("…" if len(reply) > 600 else "")),
            data={"config_missing": missing},
            route_node="websearch_agent",
        )

    want_hotels = (not flight_focused) or _user_asked_for_branch(message, "hotel_agent")
    want_visa = (not flight_focused) or _user_asked_for_branch(message, "visa_checker_agent")
    want_web = (not flight_focused) or _user_asked_for_branch(message, "websearch_agent")

    tasks = [
        _run_with_timeout(
            "travel_agent_flights",
            flights_coro(),
            is_coro=True,
            timeout=FLIGHT_BRANCH_TIMEOUT_S,
        ),
    ]
    if want_hotels:
        tasks.append(
            _run_with_timeout(
                "hotel_agent",
                lambda: hotel_agent_stub(slots),
                is_coro=False,
            )
        )
    if want_visa:
        tasks.append(
            _run_with_timeout(
                "visa_checker_agent",
                lambda: visa_checker_stub(slots),
                is_coro=False,
            )
        )
    if want_web:
        tasks.append(
            _run_with_timeout("websearch_agent", websearch_sync, is_coro=False)
        )
    branches = list(await asyncio.gather(*tasks))

    flights: list[dict[str, Any]] = []
    mode = "live"
    for b in branches:
        if b.name == "travel_agent_flights":
            flights = (b.data or {}).get("flights") or []
            if b.status in {"degraded", "timeout", "error"}:
                mode = "degraded"
            # Overall chat mode follows the flight branch only — hotel/visa
            # stubs and websearch timeouts must not paint a successful fare
            # search as degraded.
            break

    return branches, flights, mode
