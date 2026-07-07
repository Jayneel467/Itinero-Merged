"""Rule-based user query analysis — gives the LLM clear intent hints before each turn."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from flight_agent.llm.user_copy import next_step_hint
from flight_agent.models.agent import SessionContext

# Cities the agent knows without airport API lookup (must match flight_service.CITY_IATA)
_CITY_ALIASES: dict[str, str] = {
    "mumbai": "BOM",
    "bombay": "BOM",
    "delhi": "DEL",
    "new delhi": "DEL",
    "bangalore": "BLR",
    "bengaluru": "BLR",
    "chennai": "MAA",
    "kolkata": "CCU",
    "hyderabad": "HYD",
    "pune": "PNQ",
    "goa": "GOI",
    "paris": "CDG",
    "london": "LHR",
    "dubai": "DXB",
    "singapore": "SIN",
    "new york": "JFK",
}

_OFF_TOPIC = re.compile(
    r"\b(hotel|hotels|train|trains|bus|cab|taxi|visa|weather|joke|recipe|"
    r"stock|crypto|homework|python code|write code|who are you|what model)\b",
    re.I,
)

_OPTION_PATTERNS = [
    re.compile(r"\boption\s*#?\s*(\d+)\b", re.I),
    re.compile(r"\b#(\d+)\b"),
    re.compile(r"\b(?:pick|choose|select|take|want|book)\s+(?:the\s+)?(?:option\s+)?#?(\d+)\b", re.I),
    re.compile(r"\b(?:first|1st)\s+(?:one|option|flight)\b", re.I),
    re.compile(r"\b(?:second|2nd)\s+(?:one|option|flight)\b", re.I),
    re.compile(r"\b(?:third|3rd)\s+(?:one|option|flight)\b", re.I),
    re.compile(r"^(\d+)\s*$"),
]

_PASSENGER_PATTERNS = [
    (re.compile(r"(\d+)\s*adults?", re.I), "adults"),
    (re.compile(r"(\d+)\s*children?", re.I), "children"),
    (re.compile(r"(\d+)\s*child(?:ren)?", re.I), "children"),
    (re.compile(r"(\d+)\s*infants?", re.I), "infants"),
    (re.compile(r"(\d+)\s*passengers?", re.I), "adults"),
    (re.compile(r"\bfamily\s+of\s+(\d+)\b", re.I), "adults"),
    (re.compile(r"\b(\d+)\s*people\b", re.I), "adults"),
    (re.compile(r"\bonly\s+me\b|\bjust\s+me\b|\b1\s+adult\s+only\b", re.I), "solo"),
]

_CONFIRM_WORDS = frozenset(
    {
        "yes", "y", "yeah", "yep", "ok", "okay", "confirm", "confirmed",
        "proceed", "book", "book it", "go ahead", "sure", "pay", "pay now",
        "haan", "han", "ji", "theek", "theek hai", "thik hai", "sahi",
        "bilkul", "kar do", "kardo", "chalega",
    }
)

_SEARCH_ROUTE = re.compile(
    r"(?:from\s+)?([a-zA-Z][a-zA-Z\s]{1,20}?)\s+to\s+([a-zA-Z][a-zA-Z\s]{1,20}?)"
    r"(?:\s+on\s+|\s+for\s+|\s*,\s*|\s+)(\d{1,2}[\s/-]\w+[\s/-]?\d{0,4}|\w+\s+\d{1,2}(?:,?\s*\d{4})?)?",
    re.I,
)

_DATE_PATTERNS = [
    re.compile(r"\b(\d{1,2})[\s/-](\w{3,9})[\s/-]?(\d{2,4})?\b", re.I),
    re.compile(r"\b(\w{3,9})\s+(\d{1,2})(?:,?\s*(\d{4}))?\b", re.I),
    re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"),
]

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "september": 9, "oct": 10, "october": 10,
    "nov": 11, "november": 11, "dec": 12, "december": 12,
}


@dataclass
class QueryHints:
    """Structured interpretation of the latest user message."""

    intents: list[str] = field(default_factory=list)
    option_index: int | None = None
    adults: int | None = None
    children: int | None = None
    infants: int | None = None
    origin: str | None = None
    destination: str | None = None
    departure_date: str | None = None
    is_confirmation: bool = False
    is_off_topic: bool = False
    is_greeting: bool = False
    service_preference: str | None = None
    suggested_tool: str | None = None
    suggested_action: str = ""
    booking_step: str = ""


def _resolve_city(name: str) -> str | None:
    cleaned = name.strip().lower()
    if len(cleaned) == 3 and cleaned.isalpha():
        return cleaned.upper()
    return _CITY_ALIASES.get(cleaned)


def _parse_date(text: str) -> str | None:
    for pat in _DATE_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        groups = m.groups()
        try:
            if len(groups) == 3 and groups[0] and groups[0].isdigit() and len(groups[0]) == 4:
                y, mo, d = int(groups[0]), int(groups[1]), int(groups[2])
            elif groups[0].isdigit() and not groups[1].isdigit():
                d = int(groups[0])
                mo = _MONTHS.get(groups[1].lower()[:9], 0)
                y = int(groups[2]) if groups[2] else date.today().year
                if mo == 0:
                    continue
                if y < 100:
                    y += 2000
            elif not groups[0].isdigit():
                mo = _MONTHS.get(groups[0].lower()[:9], 0)
                d = int(groups[1])
                y = int(groups[2]) if groups[2] else date.today().year
                if mo == 0:
                    continue
            else:
                continue
            return date(y, mo, d).isoformat()
        except (ValueError, TypeError):
            continue
    return None


def _parse_option(text: str) -> int | None:
    lower = text.lower()
    if re.search(r"\b(?:first|1st)\b", lower):
        return 1
    if re.search(r"\b(?:second|2nd)\b", lower):
        return 2
    if re.search(r"\b(?:third|3rd)\b", lower):
        return 3
    for pat in _OPTION_PATTERNS:
        m = pat.search(text)
        if m:
            try:
                return int(m.group(1))
            except (IndexError, ValueError):
                pass
    return None


def _parse_passengers(text: str) -> tuple[int | None, int | None, int | None]:
    adults = children = infants = None
    if re.search(r"\b(?:only\s+me|just\s+me|solo|alone)\b", text, re.I):
        return 1, 0, 0
    for pat, kind in _PASSENGER_PATTERNS:
        m = pat.search(text)
        if not m:
            continue
        if kind == "solo":
            return 1, 0, 0
        val = int(m.group(1))
        if kind == "adults":
            adults = val
        elif kind == "children":
            children = val
        elif kind == "infants":
            infants = val
    return adults, children, infants


def _detect_booking_step(session: SessionContext) -> str:
    if session.booking_id:
        return "completed"
    if session.awaiting_payment_confirmation and not session.payment_confirmed:
        return "awaiting_payment_yes"
    if session.awaiting_service_preference and not session.service_preference:
        return "awaiting_extras_choice"
    if session.prebook_id and session.service_preference and session.service_preference != "none":
        return "pick_addon_or_pay"
    if session.awaiting_booking_confirmation and not session.booking_confirmed:
        return "awaiting_details_yes"
    if session.verified_offer_id and not session.traveler_draft.get("passenger_first_name"):
        return "collect_traveler_details"
    if session.verified_offer_id:
        return "collect_or_confirm_details"
    if session.selected_offer_index and not session.passengers_confirmed:
        return "collect_passenger_count"
    if session.last_search_results and not session.selected_offer_index:
        return "pick_flight_option"
    if session.last_search_results:
        return "in_booking_flow"
    return "new_search"


def _suggest_tool(hints: QueryHints, session: SessionContext) -> tuple[str | None, str]:
    step = hints.booking_step
    if hints.is_off_topic:
        return None, "Politely say you only help with flights. Ask for route + date."
    if hints.is_greeting and step == "new_search":
        return None, "Greet warmly. Ask where from, where to, and travel date."
    if hints.is_confirmation:
        if step == "awaiting_details_yes":
            return "prebook_flight", "User confirmed details — call prebook_flight."
        if step == "awaiting_payment_yes":
            return "complete_flight_booking", "User confirmed payment — call complete_flight_booking."
    if hints.option_index and session.last_search_results:
        if not session.passengers_confirmed:
            return "set_booking_passengers", (
                f"User picked option {hints.option_index}. "
                "If passenger count is in message, call set_booking_passengers then verify_flight_offer. "
                "Else ask passenger count first."
            )
        return "verify_flight_offer", f"User picked option {hints.option_index} — call verify_flight_offer."
    if hints.adults is not None and step in {"collect_passenger_count", "pick_flight_option"}:
        return "set_booking_passengers", "User gave passenger count — call set_booking_passengers."
    if hints.origin and hints.destination and hints.departure_date:
        return "search_flights", (
            f"User wants {hints.origin} → {hints.destination} on {hints.departure_date} — call search_flights."
        )
    if hints.origin and hints.destination and step == "new_search":
        return "search_flights", f"User wants {hints.origin} → {hints.destination} — call search_flights (ask date if missing)."
    if hints.service_preference:
        return "set_service_preference", f"User wants extras: {hints.service_preference}."
    return None, next_step_hint(session)


def analyze_user_query(message: str, session: SessionContext) -> QueryHints:
    """Parse user message and session state into LLM-friendly hints."""
    text = message.strip()
    lower = text.lower()
    hints = QueryHints(booking_step=_detect_booking_step(session))

    if _OFF_TOPIC.search(lower):
        hints.is_off_topic = True
        hints.intents.append("off_topic")

    if re.match(r"^(hi|hello|hey|namaste|good\s+(morning|evening|afternoon))\b", lower):
        hints.is_greeting = True
        hints.intents.append("greeting")

    norm_confirm = lower.rstrip(".! ")
    if norm_confirm in _CONFIRM_WORDS or any(lower.startswith(p) for p in ("yes ", "confirm ", "haan ", "ji ")):
        hints.is_confirmation = True
        hints.intents.append("confirm")

    opt = _parse_option(text)
    if opt:
        hints.option_index = opt
        hints.intents.append("select_option")

    adults, children, infants = _parse_passengers(text)
    if adults is not None or children is not None or infants is not None:
        hints.adults = adults if adults is not None else 1
        hints.children = children or 0
        hints.infants = infants or 0
        hints.intents.append("passenger_count")

    route = _SEARCH_ROUTE.search(text)
    if route:
        hints.origin = _resolve_city(route.group(1)) or route.group(1).strip().upper()[:3]
        hints.destination = _resolve_city(route.group(2)) or route.group(2).strip().upper()[:3]
        hints.intents.append("search")
        if route.group(3):
            hints.departure_date = _parse_date(route.group(3))
    if not hints.departure_date:
        hints.departure_date = _parse_date(text)
        if hints.departure_date and "search" not in hints.intents:
            hints.intents.append("search")

    if any(w in lower for w in ("seat", "window", "aisle")) and "bag" not in lower:
        hints.service_preference = "seats"
        hints.intents.append("extras")
    elif any(w in lower for w in ("bag", "baggage", "luggage")):
        if any(w in lower for w in ("seat", "both", "and")):
            hints.service_preference = "both"
        else:
            hints.service_preference = "baggage"
        hints.intents.append("extras")
    elif any(w in lower for w in ("skip", "no extras", "none", "no thanks", "nothing")):
        hints.service_preference = "none"
        hints.intents.append("extras")

    if re.search(r"\b(status|pnr|booking\s+ref)\b", lower):
        hints.intents.append("booking_status")

    hints.suggested_tool, hints.suggested_action = _suggest_tool(hints, session)
    return hints


def apply_query_hints(message: str, session: SessionContext, hints: QueryHints) -> None:
    """Apply deterministic session updates so tools/LLM stay in sync."""
    if hints.option_index and session.last_search_results:
        max_idx = len(session.last_search_results)
        if 1 <= hints.option_index <= max_idx:
            session.selected_offer_index = hints.option_index

    if hints.adults is not None:
        search = dict(session.search_context or {})
        search.update(
            {
                "adults": max(1, hints.adults),
                "children": hints.children or 0,
                "infants": hints.infants or 0,
            }
        )
        session.search_context = search
        if session.selected_offer_index or hints.option_index:
            session.passengers_confirmed = True

    if hints.origin and hints.destination and not session.last_search_results:
        search = dict(session.search_context or {})
        search.setdefault("origin", hints.origin)
        search.setdefault("destination", hints.destination)
        if hints.departure_date:
            search.setdefault("departure_date", hints.departure_date)
        session.search_context = search


def format_hints_for_llm(hints: QueryHints, message: str) -> str:
    """Human-readable block injected into the system prompt."""
    lines = [
        "USER MESSAGE ANALYSIS (trust this — user said):",
        f'  Message: "{message[:200]}"',
        f"  Detected intents: {', '.join(hints.intents) or 'general'}",
        f"  Booking step: {hints.booking_step}",
        f"  Suggested action: {hints.suggested_action}",
    ]
    if hints.option_index:
        lines.append(f"  Selected option: {hints.option_index}")
    if hints.adults is not None:
        lines.append(
            f"  Passengers: {hints.adults} adult(s), {hints.children or 0} child(ren), {hints.infants or 0} infant(s)"
        )
    if hints.origin and hints.destination:
        lines.append(f"  Route: {hints.origin} → {hints.destination}")
    if hints.departure_date:
        lines.append(f"  Date: {hints.departure_date}")
    if hints.is_confirmation:
        lines.append("  User is confirming (YES) — proceed to next booking step.")
    if hints.is_off_topic:
        lines.append("  OFF-TOPIC — politely redirect to flight booking only.")
    if hints.suggested_tool:
        lines.append(f"  Recommended tool: {hints.suggested_tool}")
    return "\n".join(lines)