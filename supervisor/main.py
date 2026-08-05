"""Itinero Supervisor Gateway — FastAPI front door for Vero (product: Itinero).

Command-router architecture (see supervisor/architecture.py + README):
  START → supervisor → general_chat | trip_detail_collection | travel_search | …

Routes:
  POST /api/chat                   — Vero supervisor turn (AI flow)
  POST /api/flights/search         — structured flight search (manual flow)
  POST /api/flights/price-calendar — min live fare per date (manual date strip)
  GET  /api/hotels/search          — structured hotel search (LiteAPI live)
  GET  /api/hotels/{id}/rates      — live room rates for one hotel (LiteAPI)
  GET  /api/health
  GET  /api/capabilities
"""

from __future__ import annotations

import os
import re
import sys
import traceback
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

# Windows console defaults to cp1252, which cannot encode the ₹ / → / ★ / ✈
# characters used across flight + itinerary copy and structured logs. Force
# UTF-8 so a stray log/print of those characters can never crash a request.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
    except Exception:
        pass

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Path / env bootstrap
# ---------------------------------------------------------------------------
_SUPERVISOR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SUPERVISOR_DIR.parent

load_dotenv(_SUPERVISOR_DIR / ".env")
load_dotenv(_REPO_ROOT / "general_agent" / ".env", override=False)
load_dotenv(_REPO_ROOT / "Travel_Agent" / ".env", override=False)
load_dotenv(_REPO_ROOT / "ITINERARY_AGENT" / ".env", override=False)

# Normalize LiteAPI key aliases so Travel_Agent Settings always sees a key.
_lite = (
    os.getenv("API_KEY")
    or os.getenv("LITEAPI_API_KEY")
    or os.getenv("LITEAPI_KEY")
)
if _lite:
    os.environ.setdefault("API_KEY", _lite)
    os.environ.setdefault("LITEAPI_API_KEY", _lite)
    os.environ.setdefault("LITEAPI_KEY", _lite)

# Append (not insert) so earlier packages win. Never put hotel_research_agent
# ahead of general_agent — both expose a top-level `agent` module.
for p in (
    str(_REPO_ROOT / "general_agent"),
    str(_REPO_ROOT / "Travel_Agent"),
    str(_REPO_ROOT / "ITINERARY_AGENT"),
):
    if p not in sys.path:
        sys.path.append(p)

Specialist = Literal[
    "supervisor",
    "research",
    "flights",
    "hotels",
    "itinerary",
    "train",
    "bus",
    "visa",
    "sports",
    "payment",
]

# ---------------------------------------------------------------------------
# Session store (in-memory — swap for Redis later)
# ---------------------------------------------------------------------------
_SESSIONS: dict[str, dict[str, Any]] = {}


def _get_session(session_id: str) -> dict[str, Any]:
    if session_id not in _SESSIONS:
        _SESSIONS[session_id] = {
            "session_id": session_id,
            "flight_context": None,  # Travel_Agent SessionContext dict
            "history": [],
            "itinerary_state": None,
            "active_specialist": "supervisor",
            "dietary_preference": None,  # veg | non_veg | jain | eggetarian | no_preference
            "user_id": None,
            # Trip-plan continuity (create a trip → destination → dates …)
            "trip_flow": False,
            "pending_trip_slot": None,  # destination | dates | travelers | None
            "trip_slots": {},
        }
    return _SESSIONS[session_id]


# Dietary / cuisine preference (separate from hotel board plans)
_DIETARY_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b(jain)\b", re.I), "jain"),
    (re.compile(r"\b(eggetarian|egg\s*etarian|egg\s*only)\b", re.I), "eggetarian"),
    (
        re.compile(
            r"\b(non[-\s]?veg|nonvegetarian|non\s*vegetarian|i\s*eat\s*(meat|chicken|fish))\b",
            re.I,
        ),
        "non_veg",
    ),
    (
        re.compile(
            r"\b(i'?m\s+veg(?:etarian)?|vegetarian|pure\s*veg|only\s*veg|veg\s*only|"
            r"i\s*am\s+veg(?:etarian)?)\b",
            re.I,
        ),
        "veg",
    ),
    (
        re.compile(
            r"\b(no\s+(meal\s+)?pref(?:erence)?|no\s+preference|any(?:thing)?\s*(is\s*)?fine|"
            r"don'?t\s+care\s+(about\s+)?(food|meals?))\b",
            re.I,
        ),
        "no_preference",
    ),
]

_FOOD_INTENT = re.compile(
    r"\b(restaurant|restaurants|food|eat|eats|eating|breakfast|brunch|lunch|dinner|"
    r"snack|cuisine|thali|locho|veg(?:etarian)?|where\s+to\s+eat|what\s+to\s+eat|"
    r"street\s*food|cafe|café)\b",
    re.I,
)


def extract_dietary_preference(message: str) -> str | None:
    """Return dietary preference label if the user stated one, else None."""
    text = message.strip()
    # Prefer explicit "I'm veg" style before bare "veg" in other contexts
    for pattern, label in _DIETARY_PATTERNS:
        if pattern.search(text):
            return label
    # Chip-style short messages
    lower = text.lower().strip().strip(".")
    chip_map = {
        "i'm veg": "veg",
        "im veg": "veg",
        "i am veg": "veg",
        "vegetarian": "veg",
        "veg": "veg",
        "non-veg": "non_veg",
        "non veg": "non_veg",
        "jain": "jain",
        "eggetarian": "eggetarian",
        "no pref": "no_preference",
        "no preference": "no_preference",
    }
    return chip_map.get(lower)


def _session_prefs_context(session: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Client-round-tripped prefs + trip continuity merged with flight context."""
    ctx: dict[str, Any] = {}
    flight = session.get("flight_context")
    if isinstance(flight, dict):
        ctx.update(flight)
    if session.get("dietary_preference"):
        ctx["dietary_preference"] = session["dietary_preference"]
    if session.get("trip_slots"):
        ctx["trip_slots"] = session["trip_slots"]
    if session.get("trip_flow"):
        ctx["trip_flow"] = True
    if session.get("pending_trip_slot"):
        ctx["pending_trip_slot"] = session["pending_trip_slot"]
    if session.get("active_specialist"):
        ctx["active_specialist"] = session["active_specialist"]
    if session.get("itinerary_state"):
        ctx["itinerary_state"] = session["itinerary_state"]
    return ctx if ctx else None


def _restore_prefs_from_client(session: dict[str, Any], session_context: dict[str, Any] | None) -> None:
    """Pull dietary_preference, trip continuity, and flight fields from client round-trip."""
    if not session_context:
        return
    diet = session_context.get("dietary_preference")
    if diet:
        session["dietary_preference"] = diet
    if session_context.get("trip_flow"):
        session["trip_flow"] = True
    pending = session_context.get("pending_trip_slot")
    if pending:
        session["pending_trip_slot"] = pending
    if isinstance(session_context.get("trip_slots"), dict):
        merged_slots = dict(session.get("trip_slots") or {})
        merged_slots.update(session_context["trip_slots"])
        session["trip_slots"] = merged_slots
    if session_context.get("itinerary_state") and not session.get("itinerary_state"):
        session["itinerary_state"] = session_context["itinerary_state"]
    active = session_context.get("active_specialist")
    if active and session.get("active_specialist") in (None, "supervisor"):
        session["active_specialist"] = active
    # Prefer full flight payload without overwriting dietary-only stubs
    flight_keys = (
        "last_search_results",
        "verified_offer_id",
        "prebook_id",
        "booking_id",
        "selected_offer_id",
        "search_context",
    )
    if any(session_context.get(k) for k in flight_keys) or "search_context" in session_context:
        skip = {
            "dietary_preference",
            "trip_slots",
            "trip_flow",
            "pending_trip_slot",
            "active_specialist",
            "itinerary_state",
        }
        session["flight_context"] = {
            k: v for k, v in session_context.items() if k not in skip
        }


def _last_assistant_text(session: dict[str, Any]) -> str:
    for msg in reversed(session.get("history") or []):
        if isinstance(msg, dict) and msg.get("role") == "assistant":
            return str(msg.get("content") or "")
    return ""


def _assistant_asked_destination(session: dict[str, Any]) -> bool:
    if session.get("pending_trip_slot") == "destination":
        return True
    return bool(_ASKED_DESTINATION.search(_last_assistant_text(session)))


def _assistant_asked_dates(session: dict[str, Any]) -> bool:
    if session.get("pending_trip_slot") == "dates":
        return True
    return bool(_ASKED_DATES.search(_last_assistant_text(session)))


def _itinerary_destination(session: dict[str, Any]) -> Optional[str]:
    raw = session.get("itinerary_state")
    if not isinstance(raw, dict):
        return None
    try:
        trip = raw.get("trip") or {}
        params = trip.get("search_params") or {}
        dest = params.get("destination")
        return str(dest) if dest else None
    except Exception:
        return None


def _seed_itinerary_destination(session: dict[str, Any], city: str) -> None:
    """Write destination into itinerary_state + trip_slots without a full LLM turn."""
    try:
        from ai_travel_planner.state.models import AppState, WorkflowStage
        from supervisor.architecture import _to_iata
    except Exception:
        slots = dict(session.get("trip_slots") or {})
        slots["destination"] = city
        session["trip_slots"] = slots
        return

    raw = session.get("itinerary_state")
    if raw:
        state = AppState.model_validate(raw)
    else:
        state = AppState()
        state.set_stage(WorkflowStage.REQUIREMENT_COLLECTION)
    state.trip.search_params.destination = city
    session["itinerary_state"] = state.model_dump(mode="json")
    slots = dict(session.get("trip_slots") or {})
    code = _to_iata(city)
    slots["destination"] = code or city
    session["trip_slots"] = slots


def _apply_dates_to_itinerary(session: dict[str, Any], depart_date: str, return_date: Optional[str] = None) -> None:
    raw = session.get("itinerary_state")
    if not raw:
        return
    try:
        from datetime import date as date_cls

        from ai_travel_planner.state.models import AppState

        state = AppState.model_validate(raw)
        state.trip.search_params.departure_date = date_cls.fromisoformat(depart_date)
        if return_date:
            state.trip.search_params.return_date = date_cls.fromisoformat(return_date)
        session["itinerary_state"] = state.model_dump(mode="json")
    except Exception:
        traceback.print_exc()


def _trip_dates_ui_prompts(destination: str) -> list[dict[str, Any]]:
    from datetime import datetime as _dt

    return [
        {
            "type": "date_picker",
            "field": "depart_date",
            "label": f"When do you want to go to {destination}?",
            "required": True,
            "min_date": _dt.now().date().isoformat(),
        },
        {
            "type": "travelers_cabin",
            "field": "travelers",
            "label": "Travelers (optional)",
            "required": False,
            "defaults": {"adults": 1, "children": 0, "infants": 0, "cabin": "ECONOMY"},
        },
    ]


# ---------------------------------------------------------------------------
# Request / response models (Orchestrator-shaped)
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: Literal["user", "assistant", "system"] = "user"
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: Optional[str] = None
    history: list[ChatMessage] = Field(default_factory=list)
    session_context: Optional[dict[str, Any]] = None
    user_id: Optional[str] = None  # Clerk user id for future trip scoping
    # Structured answers from Vero chat widgets (date / airport / travelers)
    slot_answers: Optional[dict[str, Any]] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    route_path: list[str] = Field(default_factory=list)
    routed_to: str = "supervisor"
    active_specialist: Specialist = "supervisor"
    intent: Optional[str] = None
    architecture_stage: Optional[str] = None
    branch_results: Optional[list[dict[str, Any]]] = None
    booking_ready: bool = False
    payment_ready: bool = False
    session_context: Optional[dict[str, Any]] = None
    operation_result: Optional[dict[str, Any]] = None
    flights: Optional[list[dict[str, Any]]] = None
    # Structured Places results for Vero restaurant / venue cards
    places: Optional[list[dict[str, Any]]] = None
    itinerary: Optional[dict[str, Any]] = None
    # FE widgets for missing trip details (date_picker / airport_picker / travelers_cabin)
    ui_prompts: Optional[list[dict[str, Any]]] = None
    clarification: Optional[dict[str, Any]] = None
    # Clickable follow-up chips under the assistant reply (2–4 short prompts)
    suggestions: Optional[list[str]] = None
    error: Optional[str] = None
    mode: Literal["live", "degraded", "stub"] = "live"
    config_missing: list[str] = Field(default_factory=list)


class FlightSearchRequest(BaseModel):
    origin: str
    destination: str
    depart_date: str  # YYYY-MM-DD
    return_date: Optional[str] = None
    adults: int = 1
    children: int = 0
    infants: int = 0
    cabin: str = "ECONOMY"
    session_id: Optional[str] = None


class FlightPriceCalendarRequest(BaseModel):
    """Min fare per date for the manual flights date strip / price calendar."""

    origin: str
    destination: str
    dates: list[str]  # YYYY-MM-DD
    return_date: Optional[str] = None
    adults: int = 1
    children: int = 0
    infants: int = 0
    cabin: str = "ECONOMY"


class FlightSelectRequest(BaseModel):
    session_id: str
    offer_id: Optional[str] = None
    offer_index: Optional[int] = None
    session_context: Optional[dict[str, Any]] = None


class TravelerPayload(BaseModel):
    first_name: str
    last_name: str
    birthday: str
    gender: str = "M"
    nationality: str = "IN"
    document_type: str = "passport"
    document_number: str
    document_expiry: str
    document_issue_country: str = "IN"
    passenger_type: int = 0
    middle_name: Optional[str] = None


class ContactPayload(BaseModel):
    first_name: str
    last_name: str
    email: str
    phone_country_code: str = "91"
    phone_number: str
    middle_name: Optional[str] = None


class FlightPrebookRequest(BaseModel):
    session_id: str
    passengers: list[TravelerPayload]
    contact: ContactPayload
    session_context: Optional[dict[str, Any]] = None


class FlightCompleteRequest(BaseModel):
    session_id: str
    prebook_id: Optional[str] = None
    transaction_id: Optional[str] = None
    # Sandbox demo: accepted when LiteAPI Payment SDK keys were missing.
    mock_payment: bool = False
    session_context: Optional[dict[str, Any]] = None


class HotelSearchRequest(BaseModel):
    city: str
    check_in: str
    check_out: str
    guests: int = 2
    rooms: int = 1


# ---------------------------------------------------------------------------
# Intent heuristics (supervisor routing)
# ---------------------------------------------------------------------------
_FLIGHT = re.compile(
    r"\b(flight|flights|fly|flying|airport|airline|pnr|boarding|"
    r"book\s+(a\s+)?flight|air\s*ticket|airfare|"
    r"BOM|DEL|HYD|BLR|MAA|CCU|AMD|GOI)\b",
    re.I,
)
# City names alone are weak flight signals — only with route/date/flight words.
_FLIGHT_CITY = re.compile(
    r"\b(mumbai|delhi|hyderabad|bangalore|bengaluru|chennai|kolkata|"
    r"pune|ahmedabad|goa|jaipur)\b",
    re.I,
)
_HOTEL = re.compile(r"\b(hotel|hotels|resort|check[- ]?in|stay|accommodation)\b", re.I)
# Itinerary phrases MUST beat "X to Y" / "trip to X" flight-route heuristics.
# Includes "can u create a trip?" / "plan a trip" / "plan trips" / "plan trip to Goa".
_ITIN = re.compile(
    r"\b("
    r"itinerary|"
    r"trip\s+plan|"
    r"plan\s+(?:out\s+)?(?:a\s+|an\s+|my\s+|the\s+|some\s+)?"
    r"(?:\d+[-\s]?day(?:s)?\s+)?(?:whole\s+)?(?:trip|trips|vacation|getaway|holiday)|"
    r"plan\s+(?:a\s+)?(?:\d+[-\s]?day(?:s)?\s+)?(?:vacation|getaway|holiday)|"
    r"multi[- ]?day|"
    r"day[- ]?by[- ]?day|"
    r"\d+[-\s]?days?\s+(?:in|to|trip|visit)|"
    r"vacation\s+plan|"
    r"full\s+trip|"
    r"(?:make|build|create|design|plan)\s+(?:me\s+)?(?:a\s+|an\s+|my\s+|some\s+)?"
    r"(?:\d+[-\s]?day(?:s)?\s+)?(?:trip|trips|itinerary|plan|vacation|getaway|holiday)|"
    r"(?:can\s+(?:u|you)\s+)?(?:please\s+)?(?:help\s+(?:me\s+)?)?"
    r"(?:create|make|plan|build)\s+(?:me\s+)?(?:a\s+|an\s+|my\s+|some\s+)?(?:trip|trips)|"
    r"i\s+(?:want|need|wanna)\s+(?:to\s+)?(?:create|make|plan|build)\s+"
    r"(?:a\s+|an\s+|my\s+)?(?:trip|trips)|"
    r"(?:want|need)\s+(?:to\s+)?plan\s+(?:a\s+|an\s+|my\s+)?trip"
    r")\b",
    re.I,
)

_ASKED_DESTINATION = re.compile(
    r"(where\s+(?:are\s+you\s+)?(?:thinking\s+of\s+)?going"
    r"|where\s+(?:to|do\s+you\s+want\s+to\s+(?:go|head))"
    r"|what(?:'s|\s+is)\s+(?:your\s+)?destination"
    r"|which\s+city"
    r"|headed\??)",
    re.I,
)
_ASKED_DATES = re.compile(
    r"(when\s+(?:are\s+you|do\s+you)|what\s+dates?|how\s+many\s+days|"
    r"departure\s+date|travel\s+dates?|roughly\s+when)",
    re.I,
)
_RESEARCH = re.compile(
    r"\b(weather|temperature|forecast|things\s+to\s+do|attraction|place|places|"
    r"visa\s+info|best\s+time|when\s+to\s+visit|distance|how\s+far|"
    r"restaurant|restaurants|food|eat|eating|breakfast|lunch|dinner|cuisine|"
    r"culture|safety|currency)\b",
    re.I,
)
_TRAIN = re.compile(r"\b(train|trains|railway|irctc)\b", re.I)
_BUS = re.compile(r"\b(bus|buses|volvo|redbus)\b", re.I)
_VISA = re.compile(r"\b(visa|immigration|passport\s+stamp)\b", re.I)
_SPORTS = re.compile(r"\b(match|cricket|football|sports?\s+event|stadium|fixture)\b", re.I)
# City→city route — exclude itinerary/food phrasing like "trip to Surat" / "where to eat"
_ROUTE = re.compile(
    r"\b(?!trip|plan|where|what|how|when|day|days|food|place|places)"
    r"((?:new|los|san|abu|hong|sri|port)\s+[A-Za-z]{3,}|[A-Za-z]{3,})\s+to\s+"
    r"(?!eat|eats|eating|do|be|go|visit)"
    r"((?:new|los|san|abu|hong|sri|port)\s+[A-Za-z]{3,}|[A-Za-z]{3,})\b",
    re.I,
)
_HAS_DATE = re.compile(
    r"\b(\d{1,2})\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"|\b\d{4}-\d{2}-\d{2}\b|"
    r"\b(tomorrow|today|next\s+week|this\s+weekend)\b",
    re.I,
)

_IATA_TO_CITY = {
    "BOM": "Mumbai",
    "DEL": "Delhi",
    "HYD": "Hyderabad",
    "BLR": "Bangalore",
    "MAA": "Chennai",
    "CCU": "Kolkata",
    "PNQ": "Pune",
    "AMD": "Ahmedabad",
    "GOI": "Goa",
    "JAI": "Jaipur",
    "COK": "Kochi",
    "STV": "Surat",
    "DXB": "Dubai",
    "AUH": "Abu Dhabi",
}

_PLACE_HINT = re.compile(
    r"\b(?:in|at|to|for|near|around)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z][A-Za-z]+)?)\b",
    re.I,
)
_KNOWN_PLACES = (
    "Goa",
    "Mumbai",
    "Delhi",
    "Bangalore",
    "Bengaluru",
    "Hyderabad",
    "Chennai",
    "Kolkata",
    "Pune",
    "Ahmedabad",
    "Jaipur",
    "Kochi",
    "Surat",
    "Dubai",
    "Manali",
    "Shimla",
    "Udaipur",
    "Rishikesh",
    "Lonavala",
)


def _guess_place(message: str, reply: str = "", destination: Optional[str] = None) -> Optional[str]:
    if destination:
        code = str(destination).strip().upper()
        if code in _IATA_TO_CITY:
            return _IATA_TO_CITY[code]
        if len(code) > 3:
            return code.title()
    blob = f"{message or ''} {reply or ''}"
    for place in _KNOWN_PLACES:
        if re.search(rf"\b{re.escape(place)}\b", blob, re.I):
            return place
    m = _PLACE_HINT.search(blob)
    if m:
        cand = m.group(1).strip().title()
        if cand.lower() not in {
            "week",
            "month",
            "india",
            "next",
            "this",
            "that",
            "your",
            "my",
            "the",
        }:
            return cand
    return None


def build_followup_suggestions(
    message: str,
    *,
    specialist: str = "supervisor",
    intent: Optional[str] = None,
    reply: str = "",
    destination: Optional[str] = None,
    has_flights: bool = False,
    has_ui_prompts: bool = False,
) -> list[str]:
    """2–4 short follow-up prompts for Vero chat chips."""
    if has_ui_prompts:
        return []
    place = _guess_place(message, reply, destination) or "Goa"
    text = f"{message or ''} {reply or ''}".lower()
    chips: list[str] = []

    # Greeting / open-ended supervisor — starter chips (don't mine place from stub copy)
    if specialist == "supervisor" and not _guess_place(message, "", destination):
        chips = [
            "Weather in Goa next week",
            "Mumbai to Delhi on 26 July",
            "Plan a 5-day trip to Surat",
            "Where to eat in Mumbai",
        ]
    elif specialist == "flights" or has_flights or intent in {"travel_search", "trip_detail_collection"}:
        chips = [
            "Show cheapest option",
            "Try a different date",
            f"Weather in {place}",
            f"Where to eat in {place}",
        ]
    elif specialist == "itinerary" or intent == "itinerary":
        chips = [
            f"Flights to {place}",
            f"Where to eat in {place}",
            f"Best beaches in {place}",
            f"Weather in {place}",
        ]
    elif specialist == "research" or intent == "general_chat":
        if re.search(r"\b(weather|forecast|temperature|rain)\b", text):
            chips = [
                f"Best beaches in {place}",
                f"Where to eat in {place}",
                f"Plan 3-day {place} trip",
                f"Flights to {place}",
            ]
        elif re.search(r"\b(restaurant|food|eat|cuisine|cafe|street\s*food)\b", text):
            chips = [
                f"Veg only in {place}",
                f"Best street food in {place}",
                f"Fine dining in {place}",
                f"Near Bandra" if place.lower() == "mumbai" else f"Cafes in {place}",
            ]
        elif re.search(r"\b(beach|beaches|things to do|attraction|activities)\b", text):
            chips = [
                f"Where to eat in {place}",
                f"Weather in {place}",
                f"Plan 3-day {place} trip",
                f"Flights to {place}",
            ]
        else:
            chips = [
                f"Weather in {place}",
                f"Where to eat in {place}",
                f"Plan 3-day {place} trip",
                f"Flights to {place}",
            ]
    elif specialist == "visa":
        chips = [f"Flights to {place}", f"Plan a trip to {place}", "Weather tips for travelers"]
    elif specialist in {"hotels", "train", "bus", "sports"}:
        chips = [
            f"Flights to {place}",
            f"Plan 3-day {place} trip",
            f"Where to eat in {place}",
        ]
    else:
        chips = [
            "Weather in Goa next week",
            "Mumbai to Delhi on 26 July",
            "Plan a 5-day trip to Surat",
            "Where to eat in Mumbai",
        ]

    last = (message or "").strip().lower()
    out: list[str] = []
    for c in chips:
        label = str(c).strip()
        if not label or label.lower() == last:
            continue
        if label not in out:
            out.append(label)
        if len(out) >= 4:
            break
    return out


def attach_suggestions(
    resp: ChatResponse,
    message: str,
    session: Optional[dict[str, Any]] = None,
) -> ChatResponse:
    """Fill ChatResponse.suggestions when the handler didn't set them."""
    if resp.suggestions:
        return resp
    slots = (session or {}).get("trip_slots") or {}
    dest = slots.get("destination")
    resp.suggestions = build_followup_suggestions(
        message,
        specialist=str(resp.active_specialist or "supervisor"),
        intent=resp.intent,
        reply=resp.response or "",
        destination=dest if isinstance(dest, str) else None,
        has_flights=bool(resp.flights),
        has_ui_prompts=bool(resp.ui_prompts),
    ) or None
    return resp


def classify_intent(message: str, session: dict[str, Any]) -> Specialist:
    text = message.strip()

    # 1) Itinerary phrases win over route/"X to Y" flight patterns always.
    #    "Plan a 5-day trip to Surat" / "can u create a trip?" must never become flights.
    if _ITIN.search(text):
        session["trip_flow"] = True
        if not session.get("pending_trip_slot"):
            session["pending_trip_slot"] = "destination"
        return "itinerary"

    # 2) Food / weather / research win over sticky flight sessions.
    if _FOOD_INTENT.search(text) and not _FLIGHT.search(text):
        return "research"
    if _RESEARCH.search(text) and not _FLIGHT.search(text) and not _ROUTE.search(text):
        return "research"

    # 3) Sticky trip / itinerary collection — short follow-ups like "newyork"
    #    must continue the plan, not reset to a welcome stub.
    from supervisor.architecture import resolve_place_reply

    sticky_trip = bool(
        session.get("trip_flow")
        or session.get("itinerary_state")
        or session.get("pending_trip_slot")
        or session.get("active_specialist") == "itinerary"
    )
    place_reply = resolve_place_reply(text)
    if sticky_trip or _assistant_asked_destination(session):
        if place_reply or session.get("pending_trip_slot") in {"destination", "dates", "travelers"}:
            session["trip_flow"] = True
            return "itinerary"
        # Keep collecting while an itinerary is already in progress (unless clear new domain)
        if session.get("itinerary_state") and not _FLIGHT.search(text):
            session["trip_flow"] = True
            return "itinerary"

    # Destination asked last turn + bare place → itinerary even without sticky flag yet
    if _assistant_asked_destination(session) and place_reply:
        session["trip_flow"] = True
        session["pending_trip_slot"] = "destination"
        return "itinerary"

    # 4) Sticky flight booking — only mid-booking, never steals itinerary/food/weather.
    ctx = session.get("flight_context") or {}
    sticky_flight = any(
        ctx.get(k)
        for k in (
            "last_search_results",
            "verified_offer_id",
            "prebook_id",
            "booking_id",
            "selected_offer_id",
            "awaiting_booking_confirmation",
            "awaiting_payment_confirmation",
            "travelers_draft",
        )
    )
    # Bare search_context alone is too weak to sticky (would steal next intents).
    mid_booking = sticky_flight or (
        ctx.get("search_context")
        and (
            ctx.get("awaiting_booking_confirmation")
            or ctx.get("awaiting_payment_confirmation")
            or ctx.get("selected_offer_id")
            or ctx.get("last_search_results")
        )
    )
    if mid_booking and (
        _FLIGHT.search(text)
        or (_ROUTE.search(text) and _HAS_DATE.search(text))
        or ctx.get("awaiting_booking_confirmation")
        or ctx.get("awaiting_payment_confirmation")
        or ctx.get("prebook_id")
        or len(text.split()) <= 3  # "yes", "2", option picks
    ):
        if ctx.get("awaiting_payment_confirmation") or ctx.get("payment_ready"):
            return "payment"
        return "flights"

    # Pure dietary preference statements → research
    if extract_dietary_preference(text) and (
        len(text.split()) <= 6 or _FOOD_INTENT.search(text)
    ):
        return "research"

    if _VISA.search(text) and not _FLIGHT.search(text):
        return "visa"
    if _SPORTS.search(text):
        return "sports"
    if _TRAIN.search(text) and not _FLIGHT.search(text):
        return "train"
    if _BUS.search(text) and not _FLIGHT.search(text):
        return "bus"
    if _HOTEL.search(text) and not _FLIGHT.search(text):
        return "hotels"

    # Explicit flight language, or city→city with a date (e.g. Mumbai to Delhi on 26 July)
    if _FLIGHT.search(text) or (
        _ROUTE.search(text)
        and _HAS_DATE.search(text)
        and not _FOOD_INTENT.search(text)
        and not re.search(r"\bwhere\s+to\b", text, re.I)
        and not _ITIN.search(text)
    ):
        return "flights"
    # City pair without date but strong flight city + "to" → still flights
    if (
        _ROUTE.search(text)
        and _FLIGHT_CITY.search(text)
        and not _FOOD_INTENT.search(text)
        and not _ITIN.search(text)
        and not re.search(r"\b(trip|plan|visit|days?)\b", text, re.I)
    ):
        return "flights"

    if _RESEARCH.search(text) and not _ITIN.search(text):
        return "research"
    lower = text.lower()
    if lower in {"hi", "hello", "hey", "hii", "thanks", "thank you"}:
        return "supervisor"
    # Mid-conversation follow-ups: never treat as cold supervisor greeting
    hist = session.get("history") or []
    if len(hist) >= 2 and (sticky_trip or place_reply or _assistant_asked_destination(session)):
        session["trip_flow"] = True
        return "itinerary"
    # Vague questions with a ? used to dump into slow research — keep trip-ish asks on itinerary
    if _ITIN.search(text) or re.search(r"\b(trip|trips|itinerary|vacation)\b", text, re.I):
        session["trip_flow"] = True
        return "itinerary"
    if "?" in text or len(text.split()) >= 4:
        return "research"
    return "supervisor"


def missing_keys(*names: str) -> list[str]:
    return [n for n in names if not os.getenv(n)]


# ---------------------------------------------------------------------------
# Agent adapters
# ---------------------------------------------------------------------------
def run_research(
    message: str,
    thread_id: str,
    session: dict[str, Any] | None = None,
) -> tuple[str, list[str], str, list[str], list[dict[str, Any]] | None]:
    """general_agent ItineroAgent — sync. Injects remembered dietary preference.

    Returns (reply, path, routed_to, missing_keys, places_or_None).
    """
    import importlib

    missing = missing_keys("OPENAI_API_KEY")
    try:
        # Repo root for `import general_agent.*`; package dir for flat imports inside it.
        root = str(_REPO_ROOT)
        ga = str(_REPO_ROOT / "general_agent")
        for p in (root, ga):
            if p in sys.path:
                sys.path.remove(p)
        sys.path.insert(0, ga)
        sys.path.insert(0, root)

        # Drop a wrongly cached hotel_research `agent` module if present
        for key in list(sys.modules):
            if key == "agent" or key.startswith("agent."):
                mod = sys.modules.get(key)
                f = getattr(mod, "__file__", "") or ""
                if "hotel_research" in f.replace("\\", "/"):
                    del sys.modules[key]

        # Prefer package import
        from general_agent.agent import build_agent  # type: ignore

        diet = (session or {}).get("dietary_preference")
        enriched = message
        notes: list[str] = []
        if diet:
            notes.append(
                f"User's meal preference: {diet}. "
                "Use this for any food/restaurant suggestions; don't re-ask unless they change it."
            )
        if _FOOD_INTENT.search(message):
            notes.append(
                "Food/restaurant intent: call search_places FIRST for real venues. "
                "Reply with ONE short intro only — the UI shows venue cards. "
                "Do NOT list venues or paste Maps/Website markdown. "
                "Do NOT answer with travel-blog listicle URLs. "
                "Only use destination_search if Places fails — then extract named restaurants."
            )
        if notes:
            enriched = (
                "[Session notes — follow these]\n- "
                + "\n- ".join(notes)
                + f"\n\n{message}"
            )
        agent = build_agent()
        reply = agent.invoke(enriched, thread_id=thread_id)
        if not isinstance(reply, str):
            reply = getattr(reply, "content", None) or str(reply)
        places = list(getattr(agent, "last_places", None) or []) or None
        reply = _soften_places_reply(reply, places)
        return reply, ["start", "supervisor", "general_agent"], "general_agent", missing, places
    except Exception as exc:
        traceback.print_exc()
        # Fallback: load by path with general_agent cwd semantics
        try:
            import importlib.util

            agent_py = _REPO_ROOT / "general_agent" / "agent.py"
            # Patch workflow-style imports by ensuring ga is first
            if ga in sys.path:
                sys.path.remove(ga)
            sys.path.insert(0, ga)
            spec = importlib.util.spec_from_file_location(
                "itinero_general_agent_mod", agent_py
            )
            if spec is None or spec.loader is None:
                raise ImportError(f"Cannot load {agent_py}")
            mod = importlib.util.module_from_spec(spec)
            sys.modules["itinero_general_agent_mod"] = mod
            spec.loader.exec_module(mod)
            agent = mod.build_agent()
            diet = (session or {}).get("dietary_preference")
            enriched = message
            notes = []
            if diet:
                notes.append(
                    f"User's meal preference: {diet}. Use this for food suggestions."
                )
            if _FOOD_INTENT.search(message):
                notes.append(
                    "Food intent: search_places first; short intro only — UI shows cards; "
                    "no Maps markdown dumps or blog-listicles."
                )
            if notes:
                enriched = (
                    "[Session notes]\n- "
                    + "\n- ".join(notes)
                    + f"\n\n{message}"
                )
            reply = agent.invoke(enriched, thread_id=thread_id)
            if not isinstance(reply, str):
                reply = getattr(reply, "content", None) or str(reply)
            places = list(getattr(agent, "last_places", None) or []) or None
            reply = _soften_places_reply(reply, places)
            return (
                reply,
                ["start", "supervisor", "general_agent"],
                "general_agent",
                missing,
                places,
            )
        except Exception as exc2:
            traceback.print_exc()
            msg = (
                "I couldn't look that up just now — something's off on my side.\n\n"
                f"Technical detail: `{type(exc2).__name__}: {exc2}`\n\n"
                "Try again in a moment, or ask about flights "
                "(e.g. *Mumbai to Delhi on 26 July*)."
            )
            return msg, ["start", "supervisor", "general_agent"], "general_agent", missing, None


def _soften_places_reply(
    reply: str,
    places: list[dict[str, Any]] | None,
) -> str:
    """When cards are present, collapse wall-of-markdown place dumps to a short intro."""
    if not places or not reply:
        return reply or ""
    text = str(reply)
    # Strip accidental machine JSON if the model echoed it
    text = re.sub(
        r"<<<PLACES_JSON>>>.*?<<<END_PLACES_JSON>>>",
        "",
        text,
        flags=re.DOTALL,
    ).strip()
    # Detect markdown place dumps (Maps links / Address: lines)
    dumpish = bool(
        re.search(r"\[Maps\]\s*\(|Website:\s*\[|Address:\s*", text, re.I)
        or (text.count("\n") >= 8 and re.search(r"https?://", text))
    )
    if not dumpish:
        return text.strip()
    # Keep first non-bullet paragraph as intro
    intro_lines: list[str] = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            if intro_lines:
                break
            continue
        if re.match(r"^[-*•]\s+", s) or s.startswith("#"):
            break
        if re.search(r"\[Maps\]|Website:|Address:|https?://", s, re.I):
            break
        intro_lines.append(s)
        if len(" ".join(intro_lines)) > 180:
            break
    if intro_lines:
        return " ".join(intro_lines)
    # Fallback city from first place area/name
    where = ""
    for p in places:
        area = (p.get("area") or "") if isinstance(p, dict) else ""
        if area:
            # last token often city-ish; keep area short
            where = area.split(",")[-1].strip() or area
            break
    return f"Here are great places{f' in {where}' if where else ''}:"


async def run_flights(
    message: str,
    session: dict[str, Any],
    history: list[dict[str, str]],
) -> ChatResponse:
    missing = missing_keys("OPENAI_API_KEY")
    # Travel_Agent uses API_KEY for LiteAPI
    lite_missing = missing_keys("API_KEY", "LITEAPI_KEY")
    # Either API_KEY or LITEAPI_KEY is ok
    if not (os.getenv("API_KEY") or os.getenv("LITEAPI_KEY")):
        missing = list(dict.fromkeys(missing + ["API_KEY"]))

    try:
        import asyncio

        from itinero import GeneralAgent, OrchestratorInput
        from flight_agent.models.agent import SessionContext

        ctx_data = session.get("flight_context")
        session_ctx = SessionContext.model_validate(ctx_data) if ctx_data else SessionContext()

        agent = GeneralAgent()
        try:
            # Hard ceiling so chat never hangs on "Vero is thinking…"
            out = await asyncio.wait_for(
                agent.run(
                    OrchestratorInput(
                        message=message,
                        session_id=session["session_id"],
                        session_context=session_ctx,
                        history=history,
                    )
                ),
                timeout=75.0,
            )
        finally:
            await agent.aclose()

        session["flight_context"] = out.session_context.model_dump()
        from supervisor.normalize import normalize_search_list

        raw_offers = out.session_context.last_search_results or []
        sc = out.session_context.search_context or {}
        flights = (
            normalize_search_list(
                raw_offers,
                origin=str(sc.get("origin") or ""),
                destination=str(sc.get("destination") or ""),
            )
            or None
        )
        specialist: Specialist = "flights"
        if out.payment_ready or "payment" in (out.route_path or []):
            specialist = "payment"
        elif out.routed_to and "hotel" in out.routed_to:
            specialist = "hotels"

        op = out.operation_result if isinstance(out.operation_result, dict) else {}
        search_failed = op.get("status") == "search_failed" or bool(out.error)
        mode = "degraded" if search_failed or missing else "live"

        return ChatResponse(
            response=out.response,
            session_id=session["session_id"],
            route_path=out.route_path or ["start", "supervisor", "travel_agent"],
            routed_to=out.routed_to or "flight_booking",
            active_specialist=specialist,
            intent=out.intent.value if out.intent else None,
            booking_ready=out.booking_ready,
            payment_ready=out.payment_ready,
            session_context=out.session_context.model_dump(),
            operation_result=out.operation_result,
            flights=flights,
            error=out.error or (str(op.get("error")) if search_failed else None),
            mode=mode,
            config_missing=missing,
        )
    except Exception as exc:
        import asyncio as _asyncio

        detail = f"{type(exc).__name__}: {exc}"
        timed_out = isinstance(exc, _asyncio.TimeoutError) or "TimeoutError" in type(exc).__name__
        warm = (
            "That search took too long on my side — sorry about that.\n\n"
            if timed_out
            else "I couldn't pull live flights just now — sorry about that.\n\n"
        )
        warm += (
            "Try again with a clear route and date, like *Mumbai to Delhi on 26 July*. "
            "Or use the Flights search bar for the same live fares."
        )
        if missing:
            warm += "\n\n(If this keeps happening, the travel keys on the server may need a refresh.)"
        return ChatResponse(
            response=warm,
            session_id=session["session_id"],
            route_path=["start", "supervisor", "travel_agent", "error"],
            routed_to="flight_booking",
            active_specialist="flights",
            architecture_stage="travel_search",
            error=detail,
            mode="degraded",
            config_missing=missing,
        )


def run_itinerary(message: str, session: dict[str, Any]) -> ChatResponse:
    """Live ITINERARY_AGENT path — no mock day plans. Preserves trip-slot continuity."""
    from supervisor.architecture import (
        extract_destination_from_trip_ask,
        resolve_place_reply,
    )

    diet = session.get("dietary_preference")
    session["trip_flow"] = True
    missing = missing_keys("OPENAI_API_KEY")
    mid_convo = len(session.get("history") or []) >= 2

    # Widget dates → itinerary state
    slots = session.get("trip_slots") or {}
    if slots.get("depart_date"):
        _apply_dates_to_itinerary(
            session,
            str(slots["depart_date"]),
            str(slots["return_date"]) if slots.get("return_date") else None,
        )
        if session.get("pending_trip_slot") == "dates":
            session["pending_trip_slot"] = "travelers"

    # Bare place follow-up OR destination embedded in "plan trip to Goa"
    place = resolve_place_reply(message) or extract_destination_from_trip_ask(message)
    needs_dest = (
        session.get("pending_trip_slot") == "destination"
        or _assistant_asked_destination(session)
        or not _itinerary_destination(session)
    )
    if place and needs_dest and (
        session.get("pending_trip_slot") in {None, "destination"}
        or not _itinerary_destination(session)
    ):
        _seed_itinerary_destination(session, place)
        session["pending_trip_slot"] = "dates"
        prefs_ctx = _session_prefs_context(session)
        reply = (
            f"**{place}** — love it.\n\n"
            "When are you thinking of going, and roughly how many days? "
            "Pick a start date below and I’ll shape the plan."
        )
        return ChatResponse(
            response=reply,
            session_id=session["session_id"],
            route_path=[
                "start",
                "supervisor",
                "trip_detail_collection",
                "itinerary_agent",
            ],
            routed_to="itinerary_planner",
            active_specialist="itinerary",
            intent="trip_detail_collection",
            architecture_stage="trip_detail_collection",
            mode="live",
            ui_prompts=_trip_dates_ui_prompts(place),
            clarification={
                "missing": ["depart_date"],
                "known": {"destination": place},
            },
            session_context=prefs_ctx,
            config_missing=missing,
        )

    # Fresh "create a trip" with no destination yet — ask once (no repeated welcome)
    if _ITIN.search(message) and not place and not _itinerary_destination(session):
        session["pending_trip_slot"] = "destination"
        ask = (
            "Where are you thinking of going?"
            if mid_convo
            else "Sure — I can plan that. Where are you thinking of going?"
        )
        try:
            from ai_travel_planner.state.models import AppState, WorkflowStage

            if not session.get("itinerary_state"):
                state = AppState()
                state.set_stage(WorkflowStage.REQUIREMENT_COLLECTION)
                state.add_assistant_message(ask)
                session["itinerary_state"] = state.model_dump(mode="json")
        except Exception:
            pass
        prefs_ctx = _session_prefs_context(session)
        return ChatResponse(
            response=ask,
            session_id=session["session_id"],
            route_path=[
                "start",
                "supervisor",
                "trip_detail_collection",
                "itinerary_agent",
            ],
            routed_to="itinerary_planner",
            active_specialist="itinerary",
            intent="trip_detail_collection",
            architecture_stage="trip_detail_collection",
            mode="live",
            session_context=prefs_ctx,
            config_missing=missing,
        )

    prefs_ctx = _session_prefs_context(session)

    try:
        from ai_travel_planner.graph.nodes import (
            node_collect_requirements,
            node_flight_search_confirmation,
            node_greeting,
        )
        from ai_travel_planner.state.models import AppState, WorkflowStage

        raw_state = session.get("itinerary_state")
        if not raw_state:
            state = AppState()
            if diet:
                try:
                    from ai_travel_planner.state.models import DietaryPreference

                    state.preferences.dietary_preference = DietaryPreference(diet)
                except Exception:
                    pass
            dumped = node_greeting(state.model_dump(mode="json"))
            # First user message already contains the trip ask — collect immediately
            state = AppState.model_validate(dumped)
            state.add_user_message(message)
            dumped = node_collect_requirements(state.model_dump(mode="json"))
        else:
            state = AppState.model_validate(raw_state)
            if diet and not getattr(state.preferences, "dietary_preference", None):
                try:
                    from ai_travel_planner.state.models import DietaryPreference

                    state.preferences.dietary_preference = DietaryPreference(diet)
                except Exception:
                    pass
            state.add_user_message(message)
            stage = state.current_stage
            if stage == WorkflowStage.FLIGHT_SEARCH_CONFIRMATION:
                dumped = node_flight_search_confirmation(state.model_dump(mode="json"))
            elif stage in (
                WorkflowStage.GREETING,
                WorkflowStage.REQUIREMENT_COLLECTION,
            ):
                dumped = node_collect_requirements(state.model_dump(mode="json"))
            else:
                # Keep collecting / acknowledge until fuller graph is wired through chat
                dumped = node_collect_requirements(state.model_dump(mode="json"))

        session["itinerary_state"] = dumped
        state = AppState.model_validate(dumped)
        reply = (
            state.agent_response_text
            or state.conversation.last_agent_message
            or "Tell me where you're headed, roughly when, and who's coming — I'll plan with you."
        )

        # Sync pending slot from missing fields / reply cues
        dest = getattr(state.trip.search_params, "destination", None)
        depart = getattr(state.trip.search_params, "departure_date", None)
        if not dest:
            session["pending_trip_slot"] = "destination"
        elif not depart:
            session["pending_trip_slot"] = "dates"
        else:
            session["pending_trip_slot"] = session.get("pending_trip_slot") or "travelers"

        ui_prompts = None
        clarification = None
        if dest and not depart:
            city = str(dest)
            ui_prompts = _trip_dates_ui_prompts(city)
            clarification = {
                "missing": ["depart_date"],
                "known": {"destination": city},
            }
            if not _ASKED_DATES.search(str(reply)):
                reply = (
                    f"**{city}** noted.\n\n"
                    "When are you thinking of going, and roughly how many days? "
                    "Pick a start date below if you like."
                )

        itin_payload = _itinerary_payload_from_state(state)
        prefs_ctx = _session_prefs_context(session)

        return ChatResponse(
            response=str(reply),
            session_id=session["session_id"],
            route_path=["start", "supervisor", "itinerary_agent"],
            routed_to="itinerary_planner",
            active_specialist="itinerary",
            itinerary=itin_payload,
            mode="live" if not missing else "degraded",
            config_missing=missing,
            session_context=prefs_ctx,
            ui_prompts=ui_prompts,
            clarification=clarification,
            intent="itinerary",
        )
    except Exception as exc:
        traceback.print_exc()
        detail = f"{type(exc).__name__}: {exc}"
        key_bit = ""
        if missing:
            key_bit = f" Missing: {', '.join(missing)}."
        prefs_ctx = _session_prefs_context(session)
        return ChatResponse(
            response=(
                "I couldn't start the live trip planner just now.\n\n"
                f"**What happened:** {detail}.{key_bit}\n\n"
                "Share destination + dates again in a moment, or check OpenAI keys "
                "in the ITINERARY_AGENT / supervisor env. I won't invent a fake day-by-day plan."
            ),
            session_id=session["session_id"],
            route_path=["start", "supervisor", "itinerary_agent", "error"],
            routed_to="itinerary_planner",
            active_specialist="itinerary",
            itinerary=None,
            mode="degraded",
            error=detail,
            config_missing=missing,
            session_context=prefs_ctx,
        )


def _itinerary_payload_from_state(state: Any) -> dict[str, Any] | None:
    """Expose draft/final itinerary to the UI when the agent has produced one."""
    try:
        itin_bucket = getattr(state, "itinerary", None)
        if not itin_bucket:
            return None
        draft = getattr(itin_bucket, "draft", None) or getattr(
            itin_bucket, "draft_itinerary", None
        )
        final = getattr(itin_bucket, "final", None) or getattr(
            itin_bucket, "final_itinerary", None
        )
        source = final or draft
        if not source:
            return None
        data = source.model_dump(mode="json") if hasattr(source, "model_dump") else dict(source)
        days_out = []
        for d in data.get("days") or []:
            days_out.append(
                {
                    "day": d.get("day_number") or d.get("day"),
                    "title": d.get("title") or d.get("theme") or "",
                    "items": d.get("activities")
                    or d.get("items")
                    or [],
                    "morning": d.get("morning"),
                    "afternoon": d.get("afternoon"),
                    "evening": d.get("evening"),
                    "food": d.get("food") or d.get("meals") or [],
                    "hotel": d.get("hotel"),
                    "transport": d.get("transport"),
                    "practical": d.get("practical") or d.get("notes"),
                }
            )
        return {
            "title": data.get("trip_title") or data.get("title") or "Your trip",
            "summary": data.get("summary"),
            "days": days_out,
        }
    except Exception:
        return None


def stub_reply(specialist: Specialist, message: str, session_id: str) -> ChatResponse:
    copy = {
        "hotels": (
            "Hotel search in chat isn't live yet — sorry.\n\n"
            "I can help with **flights** and **trip planning** though. "
            f"You said: *{message}*"
        ),
        "train": (
            "Train booking isn't connected here yet.\n\n"
            "I *can* search **flights** — try: *Mumbai to Delhi on 26 July*."
        ),
        "bus": (
            "Bus booking isn't connected here yet.\n\n"
            "For now I can search **flights** — try: *Hyderabad to Bangalore tomorrow*."
        ),
        "visa": (
            "I can't run a full visa check in this chat yet.\n\n"
            "Share nationality + destination and I'll note it, "
            "or ask me about entry rules and I'll research what I can."
        ),
        "sports": (
            "Sports-event lookup isn't wired yet.\n\n"
            "Tell me the city and dates — I'll keep it in mind for your trip plan."
        ),
        "supervisor": (
            "Hey — I'm **Vero**. Flights, trip ideas, food tips — what's on your mind?"
        ),
        "payment": (
            "Payment sits inside your flight booking. "
            "Keep going with the hold, or say **pay now** if a fare is ready."
        ),
        "research": "On it — looking that up…",
        "flights": "Checking flights for you…",
        "itinerary": "Let's plan this together…",
    }
    path_map = {
        "hotels": ["start", "supervisor", "hotel_agent"],
        "train": ["start", "supervisor", "train_stub"],
        "bus": ["start", "supervisor", "bus_stub"],
        "visa": ["start", "supervisor", "visa_stub"],
        "sports": ["start", "supervisor", "sports_stub"],
        "supervisor": ["start", "supervisor"],
        "payment": ["start", "supervisor", "travel_agent", "payment"],
    }
    return ChatResponse(
        response=copy.get(specialist, copy["supervisor"]),
        session_id=session_id,
        route_path=path_map.get(specialist, ["start", "supervisor"]),
        routed_to=specialist,
        active_specialist=specialist,
        mode="stub",
    )


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Itinero Supervisor", version="0.1.0")

# Local Vite (5173) + Next (3000). Env CORS_ORIGINS merges in; never drop local defaults.
# Note: browser Origin never includes a path — "http://localhost:5173/itinero" is invalid.
_default_cors = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_env_cors = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip() and "://" in o.strip() and o.strip().count("/") == 2
]
_origins = list(dict.fromkeys(_default_cors + _env_cors))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # Dev: Vite on localhost or LAN IP (e.g. http://192.168.x.x:5173)
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    openai = bool(os.getenv("OPENAI_API_KEY"))
    liteapi = bool(os.getenv("API_KEY") or os.getenv("LITEAPI_KEY") or os.getenv("LITEAPI_API_KEY"))
    tavily = bool(os.getenv("TAVILY_API_KEY"))
    weather = bool(os.getenv("OPENWEATHER_API_KEY"))
    maps = bool(os.getenv("GOOGLE_MAPS_API_KEY"))
    payment_sdk = os.getenv("LITEAPI_USE_PAYMENT_SDK", "").lower() in {"1", "true", "yes"}
    from supervisor.architecture import NODE_STATUS

    return {
        "status": "ok",
        "service": "itinero-supervisor",
        "assistant": "Vero",
        "product": "Itinero",
        "configured": {
            "openai": openai,
            "liteapi": liteapi,
            "tavily": tavily,
            "openweather": weather,
            "google_maps": maps,
            "liteapi_payment_sdk": payment_sdk,
        },
        "agents": {
            "general_agent_research": "ready" if openai else "needs_openai",
            "travel_agent_flights": "ready" if openai and liteapi else "needs_keys",
            "itinerary_agent": "best_effort" if openai else "needs_openai",
            "hotels": "stub",
            "visa_checker": "future_v1_1",
            "pdf_generation": "future_v1_1",
            "tracking_list": "future_v1_1",
            "calling_agent": "future_v1_1",
            "train_bus_visa_sports": "stub",
        },
        "architecture_nodes": NODE_STATUS,
        "sessions": len(_SESSIONS),
    }


@app.get("/api/capabilities")
def capabilities():
    from supervisor.architecture import NODE_STATUS

    return {
        "assistant": "Vero",
        "product": "Itinero",
        "flows": ["ai_chat", "manual_booking", "travel_search_parallel"],
        "contracts": [
            "OrchestratorInput/Output",
            "FlightOffer",
            "session_id + session_context",
            "route_path",
            "architecture_stage",
            "branch_results",
            "booking_ready",
            "payment_ready",
        ],
        "command_router": {
            "general_chat": "general_agent (+ websearch tools)",
            "trip_detail_collection": "missing_field_checker interrupt",
            "travel_search": "research_dispatch → research_join → present_options",
            "itinerary": "itinerary_agent",
            "mid_booking": "travel_agent availability_recheck / payment / booking",
        },
        "specialists": {
            "research": "live_if_configured",
            "flights": "live_if_configured",
            "itinerary": "best_effort",
            "hotels": "stub",
            "train": "stub",
            "bus": "stub",
            "visa": "future_v1_1",
            "sports": "stub",
        },
        "architecture_nodes": NODE_STATUS,
        "manual_endpoints": [
            "POST /api/flights/search",
            "POST /api/flights/price-calendar",
            "POST /api/flights/select",
            "POST /api/flights/prebook",
            "POST /api/flights/complete",
            "GET /api/hotels/search",
        ],
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Vero command router — see supervisor/architecture.py."""
    from supervisor.architecture import (
        apply_slot_answers,
        build_ui_prompts,
        compose_present_options,
        extract_trip_slots,
        missing_field_interrupt,
        persist_trip_slots,
        research_dispatch,
        tracking_list_stub,
        pdf_generation_stub,
    )
    from supervisor.flight_structured import structured_search

    session_id = req.session_id or str(uuid.uuid4())
    session = _get_session(session_id)
    if req.user_id:
        session["user_id"] = req.user_id
    _restore_prefs_from_client(session, req.session_context)

    # Merge structured widget answers before slot extraction
    if req.slot_answers:
        apply_slot_answers(session, req.slot_answers)

    # Capture meal preference early and remember for the session (+ Clerk user_id when present)
    detected_diet = extract_dietary_preference(req.message)
    if detected_diet:
        session["dietary_preference"] = detected_diet

    history = [{"role": m.role, "content": m.content} for m in req.history]
    session["history"] = history + [{"role": "user", "content": req.message}]

    specialist = classify_intent(req.message, session)
    # Widget follow-ups with trip_slots already filled should stay on flights
    if req.slot_answers and (session.get("trip_slots") or {}):
        specialist = "flights"
    # Date / cabin / pax follow-ups after we already know BOM→DEL must stay on flights
    # (e.g. "Depart on 2026-07-26") — otherwise classify returns supervisor/research and hangs.
    prior_slots = session.get("trip_slots") or {}
    if (
        prior_slots.get("origin")
        and prior_slots.get("destination")
        and session.get("active_specialist") in {"flights", None, "supervisor"}
        and not _FOOD_INTENT.search(req.message)
        and not _ITIN.search(req.message)
        and (
            bool(re.search(r"\b20\d{2}-\d{2}-\d{2}\b", req.message or ""))
            or bool(re.search(r"\bdepart\b|\breturn\b|\bcabin\b|\badults?\b", req.message or "", re.I))
            or (session.get("active_specialist") == "flights" and len((req.message or "").split()) <= 8)
        )
    ):
        specialist = "flights"
    session["active_specialist"] = specialist
    prefs_ctx = _session_prefs_context(session)

    # Keep trip slots fresh for travel_search / missing_field_checker
    slots = extract_trip_slots(req.message, session)
    persist_trip_slots(session, slots)

    try:
        # ── Mid-booking (availability_recheck / payment / booking_subflow) ──
        if specialist == "flights" or specialist == "payment":
            ctx = session.get("flight_context") or {}
            mid_booking = any(
                ctx.get(k)
                for k in (
                    "last_search_results",
                    "verified_offer_id",
                    "prebook_id",
                    "booking_id",
                    "selected_offer_id",
                    "awaiting_booking_confirmation",
                    "awaiting_payment_confirmation",
                    "travelers_draft",
                )
            )

            # Deep booking (prebook/pay) must stay on Travel_Agent. Mere leftover
            # search results must NOT block the fast LiteAPI structured search —
            # otherwise "Depart on 2026-07-26" falls into run_flights and times out.
            deep_booking = any(
                ctx.get(k)
                for k in (
                    "prebook_id",
                    "booking_id",
                    "verified_offer_id",
                    "selected_offer_id",
                    "awaiting_booking_confirmation",
                    "awaiting_payment_confirmation",
                )
            )
            fresh_slot_search = slots.ready_for_travel_search() and (
                bool(req.slot_answers)
                or bool(re.search(r"\b20\d{2}-\d{2}-\d{2}\b", req.message or ""))
                or bool(re.search(r"\bdepart\b|\bdate\b|\bon\s+\d", (req.message or ""), re.I))
                or not mid_booking
            )

            # ── FAST PATH: missing date/airport → ui_prompts immediately ──
            # Never call LiteAPI / research_dispatch / Travel_Agent LLM first.
            # Also interrupts when mid_booking leftovers exist but the user
            # started a new incomplete route ask (e.g. "mumbai to delhi flights").
            if specialist == "flights" and not slots.ready_for_travel_search():
                new_route_ask = bool(
                    slots.origin or slots.destination or _ROUTE.search(req.message)
                )
                if new_route_ask:
                    ui_prompts = build_ui_prompts(slots)
                    return attach_suggestions(
                        ChatResponse(
                            response=missing_field_interrupt(slots),
                            session_id=session_id,
                            route_path=[
                                "start",
                                "supervisor",
                                "trip_detail_collection",
                                "missing_field_checker",
                                "interrupt",
                            ],
                            routed_to="trip_detail_collection",
                            active_specialist="flights",
                            intent="trip_detail_collection",
                            architecture_stage="trip_detail_collection",
                            mode="live",
                            ui_prompts=ui_prompts,
                            clarification={
                                "missing": slots.missing_for_travel_search(),
                                "known": {
                                    "origin": slots.origin,
                                    "destination": slots.destination,
                                    "depart_date": slots.depart_date,
                                    "adults": slots.adults,
                                    "children": slots.children,
                                    "cabin": slots.cabin,
                                },
                            },
                            session_context={
                                **(prefs_ctx or {}),
                                "trip_slots": session.get("trip_slots"),
                            },
                        ),
                        req.message,
                        session,
                    )

            # New travel_search with complete slots → parallel research_dispatch
            if (
                specialist == "flights"
                and slots.ready_for_travel_search()
                and (not deep_booking or fresh_slot_search)
            ):
                branches, flights, mode = await research_dispatch(
                    slots=slots,
                    message=req.message,
                    session=session,
                    flight_search_fn=structured_search,
                    websearch_fn=run_research,
                    flight_focused=True,
                )
                reply = compose_present_options(
                    slots=slots,
                    branches=branches,
                    flights=flights,
                    message=req.message,
                    flight_focused=True,
                )
                branch_payload = [
                    {
                        "name": b.name,
                        "status": b.status,
                        "summary": b.summary,
                        "route_node": b.route_node,
                    }
                    for b in branches
                ]
                merged = dict(session.get("flight_context") or {})
                if session.get("dietary_preference"):
                    merged["dietary_preference"] = session["dietary_preference"]
                if session.get("trip_slots"):
                    merged["trip_slots"] = session["trip_slots"]
                return attach_suggestions(
                    ChatResponse(
                        response=reply,
                        session_id=session_id,
                        route_path=[
                            "start",
                            "supervisor",
                            "travel_search",
                            "research_dispatch",
                            "research_join",
                            "present_options",
                        ],
                        routed_to="travel_search",
                        active_specialist="flights",
                        intent="travel_search",
                        architecture_stage="present_options",
                        branch_results=branch_payload,
                        flights=flights or None,
                        mode=mode if mode in {"live", "degraded", "stub"} else "live",
                        session_context=merged or prefs_ctx,
                    ),
                    req.message,
                    session,
                )

            resp = await run_flights(req.message, session, history)
            # Annotate architecture stage for mid-booking
            stage = "booking_subflow"
            if specialist == "payment" or (session.get("flight_context") or {}).get(
                "awaiting_payment_confirmation"
            ):
                stage = "payment_confirmation"
            elif (session.get("flight_context") or {}).get("awaiting_booking_confirmation"):
                stage = "availability_recheck"
            resp.architecture_stage = stage
            path = list(resp.route_path or [])
            if "supervisor" not in path[:2]:
                path = ["start", "supervisor"] + path
            if stage not in path:
                path = path + [stage]
            resp.route_path = path
            # Preserve dietary on flight round-trips
            merged = dict(resp.session_context or {})
            if session.get("dietary_preference"):
                merged["dietary_preference"] = session["dietary_preference"]
            if session.get("trip_slots"):
                merged["trip_slots"] = session["trip_slots"]
            resp.session_context = merged or None
            # After confirmed booking, surface future itinerary/PDF/tracking handoff labels
            if resp.booking_ready or (session.get("flight_context") or {}).get("booking_id"):
                extras = [pdf_generation_stub(), tracking_list_stub()]
                resp.branch_results = [
                    {"name": b.name, "status": b.status, "summary": b.summary}
                    for b in extras
                ]
                resp.architecture_stage = "booking_confirmation"
            return attach_suggestions(resp, req.message, session)

        # ── general_chat / research (WebSearch via general_agent tools) ──
        if specialist == "research" or specialist == "supervisor":
            # Mid-conversation: never return the cold welcome stub.
            mid_convo = len(session.get("history") or []) >= 2 or bool(
                session.get("trip_flow")
                or session.get("itinerary_state")
                or session.get("pending_trip_slot")
            )
            if specialist == "supervisor" and mid_convo:
                session["trip_flow"] = True
                resp = run_itinerary(req.message, session)
                resp.architecture_stage = (
                    resp.architecture_stage or "trip_detail_collection"
                )
                resp.intent = resp.intent or "trip_detail_collection"
                path = list(
                    resp.route_path or ["start", "supervisor", "itinerary_agent"]
                )
                if "itinerary_agent" not in path:
                    path = path + ["itinerary_agent"]
                resp.route_path = path
                session["history"] = list(session.get("history") or []) + [
                    {"role": "assistant", "content": resp.response}
                ]
                resp.session_context = _session_prefs_context(session)
                return attach_suggestions(resp, req.message, session)

            if specialist == "supervisor" and req.message.strip().lower() in {
                "hi",
                "hello",
                "hey",
                "hii",
                "thanks",
                "thank you",
            }:
                stub = stub_reply("supervisor", req.message, session_id)
                stub.architecture_stage = "general_chat"
                stub.intent = "general_chat"
                stub.session_context = prefs_ctx
                return attach_suggestions(stub, req.message, session)

            if specialist == "supervisor":
                # Never spam the welcome mid-thread; nudge toward trip planning instead.
                if mid_convo:
                    session["trip_flow"] = True
                    resp = run_itinerary(req.message, session)
                    resp.architecture_stage = (
                        resp.architecture_stage or "trip_detail_collection"
                    )
                    resp.intent = resp.intent or "trip_detail_collection"
                    session["history"] = list(session.get("history") or []) + [
                        {"role": "assistant", "content": resp.response}
                    ]
                    resp.session_context = _session_prefs_context(session)
                    return attach_suggestions(resp, req.message, session)
                stub = stub_reply("supervisor", req.message, session_id)
                stub.architecture_stage = "general_chat"
                stub.intent = "general_chat"
                stub.session_context = prefs_ctx
                return attach_suggestions(stub, req.message, session)

            reply, path, routed, missing, places = run_research(
                req.message, session_id, session=session
            )
            if _ASKED_DESTINATION.search(reply or ""):
                session["trip_flow"] = True
                session["pending_trip_slot"] = "destination"
            prefs_ctx = _session_prefs_context(session)
            session["history"] = list(session.get("history") or []) + [
                {"role": "assistant", "content": reply}
            ]
            return attach_suggestions(
                ChatResponse(
                    response=reply,
                    session_id=session_id,
                    route_path=["start", "supervisor", "general_chat", "general_agent", "websearch_agent"],
                    routed_to=routed,
                    active_specialist="research",
                    intent="general_chat",
                    architecture_stage="general_chat",
                    mode="degraded" if missing and "Error" in reply else "live",
                    config_missing=missing,
                    session_context=prefs_ctx,
                    places=places,
                ),
                req.message,
                session,
            )

        if specialist == "itinerary":
            resp = run_itinerary(req.message, session)
            resp.architecture_stage = resp.architecture_stage or "itinerary_agent"
            resp.intent = resp.intent or "itinerary"
            path = list(resp.route_path or ["start", "supervisor", "itinerary_agent"])
            if "itinerary_agent" not in path:
                path = path + ["itinerary_agent"]
            resp.route_path = path
            session["history"] = list(session.get("history") or []) + [
                {"role": "assistant", "content": resp.response}
            ]
            resp.session_context = _session_prefs_context(session)
            return attach_suggestions(resp, req.message, session)

        # Visa → future node (clear V1.1 copy)
        if specialist == "visa":
            from supervisor.architecture import visa_checker_stub

            b = visa_checker_stub(slots)
            return attach_suggestions(
                ChatResponse(
                    response=b.summary
                    + "\n\nI can still help with **flights** or a **trip plan** in the meantime.",
                    session_id=session_id,
                    route_path=["start", "supervisor", "visa_checker_agent", "future_v1_1"],
                    routed_to="visa",
                    active_specialist="visa",
                    intent="visa",
                    architecture_stage="visa_checker_agent",
                    branch_results=[{"name": b.name, "status": b.status, "summary": b.summary}],
                    mode="stub",
                    session_context=prefs_ctx,
                ),
                req.message,
                session,
            )

        stub = stub_reply(specialist, req.message, session_id)
        stub.architecture_stage = f"{specialist}_stub"
        stub.session_context = prefs_ctx
        return attach_suggestions(stub, req.message, session)
    except Exception as exc:
        traceback.print_exc()
        return attach_suggestions(
            ChatResponse(
                response=(
                    "Sorry — something went wrong on my side. "
                    "Try that again in a moment, or rephrase what you need."
                ),
                session_id=session_id,
                route_path=["start", "supervisor", "error"],
                routed_to="supervisor",
                active_specialist="supervisor",
                architecture_stage="error",
                error=str(exc),
                mode="degraded",
                session_context=prefs_ctx,
            ),
            req.message,
            session,
        )


@app.post("/api/flights/search")
async def flights_search(req: FlightSearchRequest):
    """Manual OTA search — LiteAPI only (no sample fares)."""
    from supervisor.flight_structured import structured_search

    session_id = req.session_id or str(uuid.uuid4())
    session = _get_session(session_id)

    result = await structured_search(
        origin=req.origin,
        destination=req.destination,
        depart_date=req.depart_date,
        return_date=req.return_date,
        adults=req.adults,
        children=req.children,
        infants=req.infants,
        cabin=req.cabin,
        session=session,
    )
    return result


@app.post("/api/flights/price-calendar")
async def flights_price_calendar(req: FlightPriceCalendarRequest):
    """Min live LiteAPI fare per date for the date strip / price calendar (no AI)."""
    from supervisor.flight_structured import structured_price_calendar

    # Cap fan-out to keep LiteAPI load bounded (strip ~15 days or one month).
    dates = list(dict.fromkeys((d or "").strip() for d in (req.dates or []) if d))[:31]
    return await structured_price_calendar(
        origin=req.origin,
        destination=req.destination,
        dates=dates,
        return_date=req.return_date,
        adults=req.adults,
        children=req.children,
        infants=req.infants,
        cabin=req.cabin,
    )


@app.post("/api/flights/select")
async def flights_select(req: FlightSelectRequest):
    from supervisor.flight_structured import structured_select

    session = _get_session(req.session_id)
    if req.session_context:
        session["flight_context"] = req.session_context
    return await structured_select(
        session=session,
        offer_id=req.offer_id,
        offer_index=req.offer_index,
    )


@app.post("/api/flights/prebook")
async def flights_prebook(req: FlightPrebookRequest):
    from supervisor.flight_structured import structured_prebook

    session = _get_session(req.session_id)
    if req.session_context:
        session["flight_context"] = req.session_context
    return await structured_prebook(
        session=session,
        passengers=[p.model_dump() for p in req.passengers],
        contact=req.contact.model_dump(),
    )


@app.post("/api/flights/complete")
async def flights_complete(req: FlightCompleteRequest):
    """Issue ticket after prebook + (optional) Payment SDK card capture."""
    from supervisor.flight_structured import structured_complete

    session = _get_session(req.session_id)
    if req.session_context:
        session["flight_context"] = req.session_context
    return await structured_complete(
        session=session,
        prebook_id=req.prebook_id,
        transaction_id=req.transaction_id,
        mock_payment=bool(req.mock_payment),
    )


@app.get("/api/hotels/search")
async def hotels_search(city: str, check_in: str, check_out: str, guests: int = 2, rooms: int = 1):
    """Manual hotel search — LiteAPI live inventory (no sample hotels)."""
    from supervisor.hotel_structured import structured_hotel_search

    return await structured_hotel_search(
        city=city,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        rooms=rooms,
    )


@app.get("/api/hotels/{hotel_id}/rates")
async def hotel_rates(
    hotel_id: str,
    check_in: str,
    check_out: str,
    guests: int = 2,
    rooms: int = 1,
    currency: str = "INR",
):
    """Manual hotel room rates for one property — LiteAPI /hotels/rates (no fakes)."""
    from supervisor.hotel_structured import structured_hotel_rates

    return await structured_hotel_rates(
        hotel_id=hotel_id,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        rooms=rooms,
        currency=currency or "INR",
        nationality="IN",
    )


@app.get("/")
def root():
    return {
        "service": "Itinero Supervisor Gateway",
        "docs": "/docs",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
