"""Itinero Supervisor Gateway — FastAPI front door for Vero (product: Itinero).

Command-router architecture (see supervisor/architecture.py + README):
  START → supervisor → general_chat | trip_detail_collection | travel_search | …

Routes:
  POST /api/chat                   — Vero supervisor turn (AI flow)
  POST /api/flights/search         — structured flight search (manual flow)
  POST /api/flights/price-calendar — min live fare per date (manual date strip)
  GET  /api/flights/track          — live flight status + optional ADS-B
  GET  /api/flights/airport        — live airport departures / arrivals / nearby
  GET  /api/hotels/search          — structured hotel search (LiteAPI live)
  GET  /api/hotels/{id}/rates      — live room rates for one hotel (LiteAPI)
  GET  /api/events                 — Ticketmaster live events (manual tab)
  GET  /api/events/{id}            — one Ticketmaster event
  GET  /api/fx/rates               — Frankfurter live FX
  GET  /api/fx/convert             — convert amount via Frankfurter
  GET  /api/health
  GET  /api/health/live
  GET  /api/health/ready
  GET  /api/billing/plans          — Vero credit packs (free daily + prepaid)
  GET  /api/billing/me
  GET  /api/billing/credits        — daily free + wallet balance
  GET  /api/account/state          — signed-in travellers + prefs
  PUT  /api/account/state
  POST /api/billing/checkout       — one-time Stripe pack purchase
  POST /api/billing/checkout/complete
  POST /api/billing/portal
  POST /api/webhooks/stripe
  GET  /api/capabilities
  GET  /api/trips                 — My Trips for this device (Neon)
  PUT  /api/trips                 — upsert trip JSON
  DELETE /api/trips/{id}          — remove trip
"""

from __future__ import annotations

import hmac
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
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Path / env bootstrap
# ---------------------------------------------------------------------------
_SUPERVISOR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SUPERVISOR_DIR.parent

for _candidate_root in [_REPO_ROOT, _REPO_ROOT.parent, _SUPERVISOR_DIR]:
    for _subdir in ["ITINERARY_AGENT", "general_agent", "Travel_Agent", "supervisor"]:
        _path = _candidate_root / _subdir
        if _path.exists() and str(_path) not in sys.path:
            sys.path.insert(0, str(_path))
    if str(_candidate_root) not in sys.path:
        sys.path.insert(0, str(_candidate_root))

# Compatibility patch for LangGraph JsonPlusSerializer dumps/loads mismatch
try:
    from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer
    if not hasattr(JsonPlusSerializer, "dumps"):
        def _dumps(self, obj):
            res = self.dumps_typed(obj)
            return res[1] if isinstance(res, tuple) else res
        def _loads(self, data):
            if isinstance(data, tuple):
                return self.loads_typed(data)
            return self.loads_typed(("msgpack", data))
        JsonPlusSerializer.dumps = _dumps
        JsonPlusSerializer.loads = _loads
except Exception:
    pass

load_dotenv(_SUPERVISOR_DIR / ".env")
load_dotenv(_REPO_ROOT / "general_agent" / ".env", override=False)
load_dotenv(_REPO_ROOT / "Travel_Agent" / ".env", override=False)
load_dotenv(_REPO_ROOT / "ITINERARY_AGENT" / ".env", override=False)

# Local dev launcher (scripts/dev-supervisor.sh) sets ITINERO_LOCAL_DEV before uvicorn.
if os.getenv("ITINERO_LOCAL_DEV", "").lower() in {"1", "true", "yes"}:
    os.environ["APP_ENV"] = "sandbox"
    os.environ["ITINERO_ALLOW_MOCK_PAYMENT"] = "true"

from supervisor.observability import configure_logging, init_sentry

configure_logging()
init_sentry()

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
# Session store (in-memory or Redis — see session_store.py)
# ---------------------------------------------------------------------------
import contextvars

from supervisor import session_store

_touched_sessions: contextvars.ContextVar[set[str] | None] = contextvars.ContextVar(
    "touched_sessions", default=None
)


def _get_session(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip() or "anonymous"
    touched = _touched_sessions.get()
    if touched is not None:
        touched.add(sid)
    return session_store.get_session(sid)


def _save_session(session_id: str, session: dict[str, Any] | None = None) -> None:
    session_store.save_session(session_id, session)


def _mark_session_touched(session_id: str) -> None:
    touched = _touched_sessions.get()
    if touched is not None:
        touched.add((session_id or "").strip())


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
    # Left-page context from Itinero UI — forwarded to general_agent when present
    page_context: Optional[dict[str, Any]] = None
    voice_mode: bool = False
    spoken_language: Optional[str] = None
    traveler: Optional[dict[str, Any]] = None


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
    cards: Optional[dict[str, Any]] = None
    preferred_name: Optional[str] = None
    address_style: Optional[str] = None
    itinerary: Optional[dict[str, Any]] = None
    # FE widgets for missing trip details (date_picker / airport_picker / travelers_cabin)
    ui_prompts: Optional[list[dict[str, Any]]] = None
    clarification: Optional[dict[str, Any]] = None
    # Clickable follow-up chips under the assistant reply (2–4 short prompts)
    suggestions: Optional[list[str]] = None
    error: Optional[str] = None
    mode: Literal["live", "degraded", "stub"] = "live"
    config_missing: list[str] = Field(default_factory=list)
    credits: Optional[dict[str, Any]] = None


class FlightSearchRequest(BaseModel):
    origin: str
    destination: str
    depart_date: str  # YYYY-MM-DD
    return_date: Optional[str] = None
    adults: int = 1
    children: int = 0
    infants: int = 0
    cabin: str = "ECONOMY"
    currency: str = "INR"
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
    currency: str = "INR"


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

    @field_validator("passenger_type", mode="before")
    @classmethod
    def _coerce_passenger_type(cls, v: Any) -> int:
        if isinstance(v, str):
            s = v.strip().lower()
            if s in ("adult", "adults", "adt"):
                return 0
            if s in ("child", "children", "chd"):
                return 1
            if s in ("infant", "infants", "inf"):
                return 2
            try:
                return int(s)
            except ValueError:
                return 0
        if isinstance(v, (int, float)):
            return int(v)
        return 0


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
    voucher_code: Optional[str] = None
    session_context: Optional[dict[str, Any]] = None


class FlightCompleteRequest(BaseModel):
    session_id: str
    prebook_id: Optional[str] = None
    transaction_id: Optional[str] = None
    # Sandbox demo: accepted when LiteAPI Payment SDK keys were missing.
    mock_payment: bool = False
    payment_provider: Optional[str] = None  # stripe | liteapi_sdk
    payment_id: Optional[str] = None  # stripe / supplier payment ref
    expected_amount: Optional[float] = None
    currency: Optional[str] = None
    contact_email: Optional[str] = None
    session_context: Optional[dict[str, Any]] = None


class FlightAttachServicesRequest(BaseModel):
    """Attach seats / baggage / other LiteAPI ancillaries after prebook."""

    session_id: str
    prebook_id: Optional[str] = None
    selected_services: list[dict[str, Any]] = Field(default_factory=list)
    voucher_code: Optional[str] = None
    session_context: Optional[dict[str, Any]] = None


class FlightBookingIdRequest(BaseModel):
    booking_id: str
    payment_id: Optional[str] = None
    expected_amount: Optional[float] = None
    # stripe/credit/liteapi_sdk → LiteAPI auto-refund
    payment_provider: Optional[str] = None
    email: Optional[str] = None


class HotelPrebookRequest(BaseModel):
    offer_id: str
    voucher_code: Optional[str] = None
    currency: str = "INR"
    use_payment_sdk: Optional[bool] = None
    # Used to auto-refresh a sold-out / stale offerId.
    hotel_id: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    guests: Optional[int] = None
    rooms: Optional[int] = None
    room_title: Optional[str] = None
    room_board: Optional[str] = None
    target_price: Optional[float] = None
    addons: Optional[list[dict[str, Any]]] = None


class HotelBookRequest(BaseModel):
    prebook_id: str
    holder: dict[str, Any]
    guests: list[dict[str, Any]] = Field(default_factory=list)
    transaction_id: Optional[str] = None
    mock_payment: bool = False
    payment_provider: Optional[str] = None  # stripe | credit | liteapi_sdk
    payment_id: Optional[str] = None  # stripe / supplier payment ref
    expected_amount: Optional[float] = None


class HotelBookingIdRequest(BaseModel):
    booking_id: str
    payment_id: Optional[str] = None
    expected_amount: Optional[float] = None
    payment_provider: Optional[str] = None
    email: Optional[str] = None


class HotelAmendRequest(BaseModel):
    booking_id: str
    email: Optional[str] = None
    holder: Optional[dict[str, Any]] = None
    guests: Optional[list[dict[str, Any]]] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    occupancies: Optional[list[dict[str, Any]]] = None
    prebook_id: Optional[str] = None


class WatchUpsertRequest(BaseModel):
    origin: str
    destination: str
    currency: str = "INR"
    email: Optional[str] = None
    id: Optional[str] = None


class PaymentIntentRequest(BaseModel):
    prebook_id: str
    kind: str  # flight | hotel
    session_id: Optional[str] = None
    amount: Optional[float] = None
    currency: str = "INR"
    email: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TripUpsertRequest(BaseModel):
    trip: dict[str, Any]


class OtpSendRequest(BaseModel):
    identifier: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class FeedbackRequest(BaseModel):
    message: str
    email: Optional[str] = None
    category: Optional[str] = "other"
    rating: Optional[int] = None
    page_path: Optional[str] = None


class OtpVerifyRequest(BaseModel):
    identifier: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    code: str


class AuthRegisterRequest(BaseModel):
    pending_token: str
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    newsletter: bool = True
    acq_source: Optional[str] = None
    acq_medium: Optional[str] = None
    acq_campaign: Optional[str] = None
    landing_path: Optional[str] = None
    referral_code: Optional[str] = None


class InterestsUpdateRequest(BaseModel):
    home_airport: Optional[str] = None
    home_city: Optional[str] = None
    home_country: Optional[str] = None
    vibes: Optional[list] = None
    destinations: Optional[list] = None
    trip_styles: Optional[list] = None
    budget_band: Optional[str] = None
    preferred_currency: Optional[str] = None
    mail_frequency: Optional[str] = None
    categories: Optional[list] = None


class InterestEventsRequest(BaseModel):
    events: list = []
    lead_email: Optional[str] = None


class NewsletterSubscribeRequest(BaseModel):
    email: str
    vibes: Optional[list] = None
    acq_source: Optional[str] = None
    acq_medium: Optional[str] = None
    acq_campaign: Optional[str] = None
    landing_path: Optional[str] = None


class OfferValidateRequest(BaseModel):
    code: str
    vibes: Optional[list] = None


class MarketingPreviewRequest(BaseModel):
    template: str = "signup_spark"
    to_email: str


class MarketingBroadcastRequest(BaseModel):
    template: str = "daily_digest"
    segment_id: str
    limit: int = 25


class MarketingOfferUpsertRequest(BaseModel):
    id: Optional[str] = None
    code: str
    title: str
    copy: Optional[str] = None
    image_url: Optional[str] = None
    targets: Optional[dict] = None
    discount_type: str = "percent"
    discount_value: float = 0
    currency: str = "INR"
    active: bool = True


class AuthProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    newsletter: Optional[bool] = None


class AccountStateRequest(BaseModel):
    travellers: Optional[list[Any]] = None
    prefs: Optional[dict[str, Any]] = None
    contact: Optional[dict[str, Any]] = None
    saved: Optional[list[Any]] = None


class GoogleAuthRequest(BaseModel):
    id_token: str


class HotelSearchRequest(BaseModel):
    city: str
    check_in: str
    check_out: str
    guests: int = 2
    rooms: int = 1


class PackageBookRequest(BaseModel):
    package_id: str
    check_in: str
    check_out: str
    guests: int = 2
    rooms: int = 1
    offer_id: str | None = None
    hotel_id: str | None = None
    currency: str = "INR"
    mock_payment: bool = False
    guest: dict | None = None
    room: dict | None = None
    hotel: dict | None = None
    prebook_id: str | None = None
    transaction_id: str | None = None
    payment_provider: str | None = None
    expected_amount: float | None = None
    itinero_amount: float | None = None
    itinero_payment_id: str | None = None
    itinero_payment_provider: str | None = None
    single_payment: bool = True
    flight_prebook_id: str | None = None
    flight_transaction_id: str | None = None
    flight_expected_amount: float | None = None
    flight_session_id: str | None = None
    flight: dict | None = None
    loyalty_redemption_id: str | None = None
    promo_code: str | None = None


class PackageSendEmailRequest(BaseModel):
    email: str | None = None


class PackageItineroPaymentIntentRequest(BaseModel):
    package_id: str
    amount: float
    currency: str = "INR"
    email: str | None = None
    prebook_id: str | None = None
    loyalty_redemption_id: str | None = None


class VeroFilterRequest(BaseModel):
    """Natural-language filter interpretation for Let Vero Filter UI."""

    domain: str = Field(..., description="hotels | flights")
    query: str = ""
    areas: list[str] = Field(default_factory=list)
    airlines: list[str] = Field(default_factory=list)
    price_bounds: dict[str, Any] | None = None
    hotels: list[dict[str, Any]] = Field(default_factory=list)


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
    if not resp.suggestions:
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
    if resp.credits is None:
        try:
            from supervisor.credits import (
                consume,
                current_turn,
                lane_from_specialist,
                snapshot,
            )

            ctx = current_turn()
            if ctx:
                live = bool(resp.flights) or (
                    isinstance(resp.cards, dict)
                    and str(resp.cards.get("type") or "")
                    in {"flights", "hotels", "trains", "buses", "places", "events"}
                )
                lane = lane_from_specialist(resp.active_specialist, has_live_cards=live)
                if ctx.get("consume") and str(resp.mode or "") != "error" and not resp.error:
                    resp.credits = consume(ctx["subject"], lane=lane, plan=ctx.get("plan"))
                else:
                    resp.credits = snapshot(ctx["subject"], plan=ctx.get("plan"))
        except Exception:
            pass
    try:
        from supervisor.credits import end_turn as _end_credit_turn

        _end_credit_turn()
    except Exception:
        pass
    return resp


def classify_intent(message: str, session: dict[str, Any]) -> Specialist:
    """Capability routing — LLM-first via intent_router; hard locks for money path.

    Legacy Specialist names kept for ChatResponse compatibility. visa/sports/hotels
    are mapped to research (live Vero tools), never stub copy.
    """
    from supervisor.intent_router import route_capability

    cap = route_capability(message, session)
    # Specialist Literal still includes visa/sports/hotels — we never return those
    # for product paths (research handles them with tools).
    return cap  # type: ignore[return-value]


def missing_keys(*names: str) -> list[str]:
    return [n for n in names if not os.getenv(n)]


# ---------------------------------------------------------------------------
# Agent adapters
# ---------------------------------------------------------------------------
def run_research(
    message: str,
    thread_id: str,
    session: dict[str, Any] | None = None,
    page_context: dict[str, Any] | None = None,
    voice_mode: bool = False,
    spoken_language: str | None = None,
    traveler: dict[str, Any] | None = None,
) -> tuple[
    str,
    list[str],
    str,
    list[str],
    list[dict[str, Any]] | None,
    dict[str, Any] | None,
    str | None,
    str | None,
]:
    """general_agent ItineroAgent — sync. Injects remembered dietary preference.

    Returns (reply, path, routed_to, missing_keys, places, cards, preferred_name, address_style).
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
        res = agent.invoke_with_cards(
            enriched,
            thread_id=thread_id,
            page_context=page_context,
            voice_mode=bool(voice_mode),
            spoken_language=spoken_language,
            traveler=traveler,
        )
        reply = res.get("reply") if isinstance(res, dict) else res
        if not isinstance(reply, str):
            reply = getattr(reply, "content", None) or str(reply)
        places = list(res.get("places") or []) or None if isinstance(res, dict) else None
        cards = res.get("cards") if isinstance(res, dict) else None
        preferred_name = res.get("preferred_name") if isinstance(res, dict) else None
        address_style = res.get("address_style") if isinstance(res, dict) else None
        agent.last_places = places  # type: ignore[attr-defined]
        reply = _soften_places_reply(reply, places)
        return (
            reply,
            ["start", "supervisor", "general_agent"],
            "general_agent",
            missing,
            places,
            cards,
            preferred_name,
            address_style,
        )
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
            reply = agent.invoke_with_cards(
                enriched,
                thread_id=thread_id,
                page_context=page_context,
                voice_mode=bool(voice_mode),
                spoken_language=spoken_language,
                traveler=traveler,
            )
            if isinstance(reply, dict):
                text = reply.get("reply") or ""
                places = list(reply.get("places") or []) or None
                cards = reply.get("cards")
                preferred_name = reply.get("preferred_name")
                address_style = reply.get("address_style")
            else:
                text = reply
                places = None
                cards = None
                preferred_name = None
                address_style = None
            if not isinstance(text, str):
                text = getattr(text, "content", None) or str(text)
            agent.last_places = places  # type: ignore[attr-defined]
            text = _soften_places_reply(text, places)
            return (
                text,
                ["start", "supervisor", "general_agent"],
                "general_agent",
                missing,
                places,
                cards,
                preferred_name,
                address_style,
            )
        except Exception as exc2:
            traceback.print_exc()
            msg = (
                "I couldn't look that up just now — something's off on my side.\n\n"
                f"Technical detail: `{type(exc2).__name__}: {exc2}`\n\n"
                "Try again in a moment, or ask about flights "
                "(e.g. *Mumbai to Delhi on 26 July*)."
            )
            return msg, ["start", "supervisor", "general_agent"], "general_agent", missing, None, None, None, None


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


    # Dead: canned stub replies removed — all tool domains go through live Vero research.


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
def _device_from(request: Request) -> str | None:
    from supervisor.db import normalize_device_id

    return normalize_device_id(request.headers.get("x-itinero-device"))


def _admin_secret_ok(request: Request) -> bool:
    """Internal ops only — set ITINERO_ADMIN_SECRET on the server."""
    secret = (os.getenv("ITINERO_ADMIN_SECRET") or "").strip()
    if not secret:
        return False
    got = (request.headers.get("x-itinero-admin-secret") or "").strip()
    return bool(got) and hmac.compare_digest(got, secret)


def _require_booking_device_access(
    request: Request,
    booking_id: str,
    email: str | None = None,
) -> None:
    """GET/cancel booking: admin, matching device, or checkout email. Prod denies unknown."""
    from supervisor.booking_access import require_booking_access_from_request

    require_booking_access_from_request(
        request,
        booking_id,
        email=email,
        admin_ok=_admin_secret_ok(request),
    )


app = FastAPI(title="Itinero Supervisor", version="0.1.0")


@app.middleware("http")
async def _persist_sessions_middleware(request: Request, call_next):
    token = _touched_sessions.set(set())
    try:
        response = await call_next(request)
        for sid in _touched_sessions.get() or set():
            session_store.save_session(sid)
        return response
    finally:
        _touched_sessions.reset(token)


@app.on_event("startup")
def _startup_db():
    # Never block accepting connections on Neon DNS / LiteAPI warm — those belong
    # in the background. A hung init_db used to leave chat with "Can't reach Vero".
    import atexit
    import logging
    import signal
    import threading

    def _log_exit(reason: str) -> None:
        try:
            logging.getLogger("itinero-supervisor").warning("supervisor shutting down: %s", reason)
        except Exception:
            pass

    def _on_signal(signum, _frame) -> None:  # noqa: ANN001
        name = signal.Signals(signum).name if hasattr(signal, "Signals") else str(signum)
        _log_exit(f"signal {name}")

    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            signal.signal(sig, _on_signal)
        except Exception:
            pass
    atexit.register(lambda: _log_exit("atexit"))

    def _init_db_bg() -> None:
        try:
            from supervisor.db import init_db

            init_db()
        except Exception:
            traceback.print_exc()

    threading.Thread(target=_init_db_bg, name="init-db", daemon=True).start()

    def _warm_redis() -> None:
        try:
            session_store.redis_ping()
        except Exception:
            traceback.print_exc()

    threading.Thread(target=_warm_redis, name="warm-redis", daemon=True).start()

    # Warm LiteAPI airport catalog so expand-route never pays cold 40s mid-search.
    try:
        import asyncio

        async def _warm_airports() -> None:
            try:
                from supervisor.airport_suggest import _load_airports

                await _load_airports()
            except Exception:
                traceback.print_exc()

        def _warm_in_thread() -> None:
            try:
                asyncio.run(_warm_airports())
            except Exception:
                traceback.print_exc()

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_warm_airports())
        except RuntimeError:
            threading.Thread(target=_warm_in_thread, name="warm-airports", daemon=True).start()
    except Exception:
        traceback.print_exc()

# Local Vite (5173+) + Next (3000). Env CORS_ORIGINS merges in for non-prod.
_default_cors = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
]
_env_cors = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip() and "://" in o.strip() and o.strip().count("/") == 2
]
_is_prod = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").lower() in {
    "production",
    "prod",
}
# Production: only explicitly configured origins (never ship localhost allowlist).
_origins = list(dict.fromkeys(_env_cors if _is_prod else (_default_cors + _env_cors)))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    # Dev only: Vite on localhost or LAN IP (e.g. http://192.168.x.x:5173)
    allow_origin_regex=None
    if _is_prod
    else r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    openai = bool(os.getenv("OPENAI_API_KEY"))
    deepseek = bool((os.getenv("DEEPSEEK_API_KEY") or "").strip())
    gemini = bool((os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip())
    liteapi = bool(os.getenv("API_KEY") or os.getenv("LITEAPI_KEY") or os.getenv("LITEAPI_API_KEY"))
    tavily = bool(os.getenv("TAVILY_API_KEY"))
    weather = bool(os.getenv("OPENWEATHER_API_KEY"))
    maps = bool(os.getenv("GOOGLE_MAPS_API_KEY"))
    payment_sdk = os.getenv("LITEAPI_USE_PAYMENT_SDK", "").lower() in {"1", "true", "yes"}
    from supervisor.architecture import NODE_STATUS
    from supervisor.monitoring import dependency_report
    from supervisor.observability import health_payload

    deps = dependency_report()
    pg = deps["postgres"]
    redis = deps["redis"]
    smtp = deps["smtp"]
    sentry = deps["sentry"]

    from supervisor.payment_guards import money_path_launch_flags

    money = money_path_launch_flags()

    catalog_llm = {}
    try:
        from supervisor.catalog_llm import catalog_llm_status

        catalog_llm = catalog_llm_status()
    except Exception as exc:  # noqa: BLE001
        catalog_llm = {"configured": False, "error": str(exc)[:120]}

    vero_combo = {
        "tools": "openai" if openai else "missing",
        "planner": "deepseek" if deepseek else ("openai" if openai else "missing"),
        "comboEnabled": deepseek and (os.getenv("VERO_LLM_COMBO") or "1").lower() not in ("0", "false", "off"),
    }

    return health_payload(
        dependencies=deps,
        configured={
            "openai": openai,
            "deepseek": deepseek,
            "gemini": gemini,
            "liteapi": liteapi,
            "tavily": tavily,
            "openweather": weather,
            "google_maps": maps,
            "liteapi_payment_sdk": payment_sdk,
            "postgres": pg["ok"] and pg["configured"],
            "auth": bool((os.getenv("AUTH_SECRET") or "").strip()) and pg["ok"],
            "redis": redis["ok"] and redis["configured"],
            "smtp": smtp["ok"] and smtp["configured"],
            "sentry": sentry["ok"] and sentry["configured"],
            "liteapi_webhook": bool(money.get("liteapiWebhookSecret")),
        },
        extra={
            "assistant": "Vero",
            "product": "Itinero",
            "postgres": pg["status"],
            "redis": redis["status"],
            "smtp": smtp["status"],
            "sentry": sentry["status"],
            "money_path": money,
            "ai_stack": {
                "vero": vero_combo,
                "catalog": catalog_llm,
            },
            "agents": {
                "vero_tools": "ready" if openai else "needs_openai",
                "vero_planner": "ready" if deepseek else ("openai_fallback" if openai else "needs_key"),
                "catalog_factory": "ready" if gemini else "seed_bank_only",
                "general_agent_research": "ready" if openai else "needs_openai",
                "travel_agent_flights": "ready" if openai and liteapi else "needs_keys",
                "itinerary_agent": "best_effort" if openai else "needs_openai",
                "hotels": "live_if_configured",
                "visa_checker": "live_if_configured",
                "pdf_generation": "future_v1_1",
                "tracking_list": "partial",
                "calling_agent": "future_v1_1",
                "train_bus_visa_sports": "live_if_configured",
            },
            "architecture_nodes": NODE_STATUS,
            "sessions": session_store.session_count(),
            "redis_sessions": session_store.redis_enabled(),
        },
    )


@app.post("/api/feedback")
async def submit_site_feedback(req: FeedbackRequest, request: Request):
    """Public product feedback — logged + emailed to support when SMTP is set."""
    from supervisor.auth import user_from_token
    from supervisor.feedback import submit_feedback

    user = user_from_token(_bearer_token(request))
    result = await submit_feedback(
        message=req.message,
        email=req.email,
        category=req.category,
        rating=req.rating,
        page_path=req.page_path,
        user_agent=(request.headers.get("user-agent") or "")[:400],
        device_id=_device_from(request),
        user_id=str(user["id"]) if user and user.get("id") else None,
    )
    if not result.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=result.get("message") or result.get("error") or "Invalid feedback.",
        )
    return result


def _marketing_admin_ok(request: Request) -> bool:
    from supervisor.booking_access import marketing_admin_allowed

    return marketing_admin_allowed(request)


# ── Marketing OS ──────────────────────────────────────────────────────


@app.get("/api/go/{slug}")
def marketing_go_campaign(slug: str):
    from supervisor.marketing_campaigns import get_go_campaign

    camp = get_go_campaign(slug)
    if not camp:
        raise HTTPException(status_code=404, detail="Campaign not found.")
    return {"ok": True, "campaign": camp}


@app.get("/api/go")
def marketing_go_list():
    from supervisor.marketing_campaigns import list_go_campaigns

    return {"ok": True, "campaigns": list_go_campaigns()}


@app.post("/api/marketing/lead")
@app.post("/api/newsletter/subscribe")
async def marketing_subscribe(req: NewsletterSubscribeRequest):
    from supervisor import marketing_store as mstore
    from supervisor.marketing_mailer import send_marketing
    from supervisor import marketing_templates as mtpl
    import os as _os

    result = mstore.create_lead(
        req.email,
        vibes=req.vibes,
        acq_source=req.acq_source,
        acq_medium=req.acq_medium,
        acq_campaign=req.acq_campaign,
        landing_path=req.landing_path,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "subscribe_failed")
    # Welcome spark for new leads (no account yet)
    if result.get("created"):
        try:
            api_base = (_os.getenv("PUBLIC_API_URL") or "https://itinero.company").rstrip("/")
            html_body = mtpl.signup_spark_html(
                name="",
                send_id="SEND_ID_PLACEHOLDER",
                unsub_token=str(result.get("unsubscribe_token") or ""),
                api_base=api_base,
            )
            await send_marketing(
                to=result["email"],
                subject="Where should your next weekend go?",
                html_body=html_body,
                plain=mtpl.signup_spark_plain(),
                campaign="lead_welcome",
                template="signup_spark",
            )
        except Exception:
            pass
    return result


@app.api_route("/api/newsletter/unsubscribe", methods=["GET", "POST"])
async def marketing_unsubscribe(request: Request, token: str = ""):
    """GET = human click. POST = Gmail one-click (List-Unsubscribe-Post)."""
    from supervisor import marketing_store as mstore
    from fastapi.responses import HTMLResponse, PlainTextResponse

    tok = (token or "").strip()
    if not tok and request.method == "POST":
        try:
            form = await request.form()
            tok = str(form.get("token") or "").strip()
        except Exception:
            tok = ""
    result = mstore.unsubscribe_by_token(tok)
    if request.method == "POST":
        return PlainTextResponse("OK" if result.get("ok") else "ERR", status_code=200)
    msg = result.get("message") or "Updated."
    return HTMLResponse(
        f"""<!DOCTYPE html><html><body style="font-family:system-ui;padding:48px;text-align:center;">
        <h1>Itinero</h1><p>{msg}</p>
        <p><a href="https://itinero.company">Back to Itinero</a></p>
        </body></html>"""
    )


@app.get("/api/me/interests")
def me_interests_get(request: Request):
    from supervisor.auth import user_from_token
    from supervisor import marketing_store as mstore

    user = user_from_token(_bearer_token(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required.")
    mstore.ensure_user_marketing_row(user["id"])
    return {"ok": True, "interests": mstore.get_interests(user["id"])}


@app.put("/api/me/interests")
def me_interests_put(req: InterestsUpdateRequest, request: Request):
    from supervisor.auth import user_from_token
    from supervisor import marketing_store as mstore

    user = user_from_token(_bearer_token(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required.")
    data = req.model_dump(exclude_unset=True)
    interests = mstore.put_interests(user["id"], data)
    return {"ok": True, "interests": interests}


@app.post("/api/me/interest-events")
def me_interest_events(req: InterestEventsRequest, request: Request):
    from supervisor.auth import user_from_token
    from supervisor import marketing_store as mstore

    user = user_from_token(_bearer_token(request))
    uid = user["id"] if user else None
    n = mstore.record_events(req.events or [], user_id=uid, lead_email=req.lead_email)
    # activation: cancel onboarding drip on meaningful action
    if uid:
        types = {str(e.get("type") or e.get("event_type") or "") for e in (req.events or [])}
        if types & {"search", "booking_confirm", "save"}:
            try:
                from supervisor.marketing_workflows import mark_user_activated

                if "booking_confirm" in types or "search" in types:
                    mark_user_activated(uid)
            except Exception:
                pass
        if "booking_confirm" in types:
            try:
                from supervisor.marketing_workflows import enroll_booking_followup

                dest = ""
                for e in req.events or []:
                    if (e.get("type") or e.get("event_type")) == "booking_confirm":
                        dest = str((e.get("payload") or {}).get("destination") or "")
                        break
                enroll_booking_followup(uid, dest)
            except Exception:
                pass
        if "search" in types:
            try:
                from supervisor.demand_campaign import enroll_from_search_events

                market = None
                try:
                    interests = mstore.get_interests(uid)
                    market = interests.get("home_country")
                except Exception:
                    market = None
                enroll_from_search_events(
                    req.events or [],
                    user_id=uid,
                    lead_email=req.lead_email,
                    market=market,
                )
            except Exception:
                pass
    elif req.lead_email and any(
        (e.get("type") or e.get("event_type")) == "search" for e in (req.events or [])
    ):
        try:
            from supervisor.demand_campaign import enroll_from_search_events

            enroll_from_search_events(
                req.events or [],
                user_id=None,
                lead_email=req.lead_email,
            )
        except Exception:
            pass
    return {"ok": True, "recorded": n}


@app.get("/api/me/score")
def me_score(request: Request):
    from supervisor.auth import user_from_token
    from supervisor import marketing_store as mstore

    user = user_from_token(_bearer_token(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return {"ok": True, "score": mstore.get_contact_score(user["id"])}


@app.get("/api/offers")
def marketing_offers_list(request: Request, vibe: str = ""):
    from supervisor.auth import user_from_token
    from supervisor import marketing_store as mstore

    vibes = [v.strip() for v in vibe.split(",") if v.strip()]
    user = user_from_token(_bearer_token(request))
    if user and not vibes:
        interests = mstore.get_interests(user["id"])
        for v in interests.get("vibes") or []:
            if isinstance(v, str):
                vibes.append(v)
            elif isinstance(v, dict) and v.get("id"):
                vibes.append(str(v["id"]))
    return {"ok": True, "offers": mstore.list_offers(vibes=vibes or None)}


@app.post("/api/offers/validate")
def marketing_offers_validate(req: OfferValidateRequest):
    from supervisor import marketing_store as mstore

    return mstore.validate_offer(req.code, vibes=req.vibes)


@app.get("/api/marketing/o/{send_id}.gif")
def marketing_open_pixel(send_id: str):
    from supervisor import marketing_store as mstore
    from fastapi.responses import Response

    sid = send_id.replace(".gif", "")
    mstore.record_engagement(sid, "open")
    # 1x1 transparent GIF
    gif = (
        b"GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00"
        b"!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01"
        b"\x00\x00\x02\x02D\x01\x00;"
    )
    return Response(content=gif, media_type="image/gif")


@app.get("/api/marketing/r/{send_id}")
def marketing_click_redirect(send_id: str, u: str = ""):
    from supervisor import marketing_store as mstore
    from fastapi.responses import RedirectResponse
    from urllib.parse import unquote

    target = unquote(u or "https://itinero.company")
    if not target.startswith("http"):
        target = "https://itinero.company"
    mstore.record_engagement(send_id, "click", target)
    return RedirectResponse(url=target, status_code=302)


@app.post("/api/internal/marketing/run-due")
async def marketing_run_due(request: Request, digests: bool = False, drain: bool = True):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor.marketing_workflows import process_due_runs, run_daily_digests

    out = await process_due_runs(drain=drain)
    if digests:
        out["digests"] = await run_daily_digests()
    return out


@app.post("/api/internal/marketing/preview")
async def marketing_preview(req: MarketingPreviewRequest, request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor.marketing_mailer import preview_template

    return await preview_template(req.template, req.to_email)


@app.post("/api/internal/marketing/broadcast")
async def marketing_broadcast(req: MarketingBroadcastRequest, request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor.marketing_mailer import broadcast_to_segment

    result = await broadcast_to_segment(
        template=req.template,
        segment_id=req.segment_id,
        limit=req.limit,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "broadcast_failed")
    return result


@app.get("/api/admin/marketing/catalog")
def marketing_admin_catalog(request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor.marketing_campaigns import marketing_catalog

    return marketing_catalog()


@app.get("/api/admin/marketing/queue")
def marketing_admin_queue(request: Request, limit: int = 40):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor import marketing_store as mstore

    return {"ok": True, "runs": mstore.list_workflow_queue(limit=limit)}


@app.get("/api/admin/marketing/stats")
def marketing_admin_stats(request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor import marketing_store as mstore

    return mstore.marketing_stats()


@app.get("/api/admin/segments")
def marketing_admin_segments(request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor import marketing_store as mstore

    return {"ok": True, "segments": mstore.list_segments()}


@app.get("/api/admin/offers")
def marketing_admin_offers_list(request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor import marketing_store as mstore

    return {"ok": True, "offers": mstore.list_offers(active_only=False)}


@app.post("/api/admin/offers")
def marketing_admin_offers_upsert(req: MarketingOfferUpsertRequest, request: Request):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor import marketing_store as mstore

    return mstore.upsert_offer(req.model_dump())


@app.post("/api/admin/marketing/ab/lock")
def marketing_ab_lock(request: Request, campaign: str = "daily_digest"):
    if not _marketing_admin_ok(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    from supervisor import marketing_store as mstore

    result = mstore.maybe_lock_ab_winner(campaign, min_sends=1)
    return {"ok": True, "result": result}


@app.post("/api/v1/auth/register")
def auth_register(req: AuthRegisterRequest, request: Request):
    from supervisor.auth import complete_signup
    from supervisor import marketing_store as mstore

    result = complete_signup(
        req.pending_token,
        name=req.name,
        email=req.email,
        phone=req.phone,
        newsletter=req.newsletter,
        device_id=_device_from(request),
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "register_failed")
    user = result.get("user") or {}
    uid = user.get("id")
    if uid:
        try:
            mstore.set_user_attribution(
                uid,
                acq_source=req.acq_source,
                acq_medium=req.acq_medium,
                acq_campaign=req.acq_campaign,
                landing_path=req.landing_path,
            )
            if req.referral_code:
                mstore.attach_referral(req.referral_code, uid)
        except Exception:
            pass
    return result


@app.get("/api/health/live")
def health_live():
    """Liveness — process is up (always 200)."""
    return {"status": "ok", "live": True}


@app.get("/api/health/ready")
def health_ready():
    """Readiness — 503 in production when critical deps are missing."""
    from fastapi.responses import JSONResponse

    from supervisor.monitoring import dependency_report, readiness_missing

    missing = readiness_missing(production=_is_prod)
    deps = dependency_report(deep=_is_prod)
    body = {
        "status": "ok" if not missing else "not_ready",
        "ready": not missing,
        "missing": missing,
        "production": _is_prod,
        "dependencies": deps,
    }
    if _is_prod and missing:
        return JSONResponse(status_code=503, content=body)
    return body


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
            "hotels": "live_if_configured",
            "train": "live_if_configured",
            "bus": "live_if_configured",
            "visa": "live_if_configured",
            "sports": "live_if_configured",
        },
        "architecture_nodes": NODE_STATUS,
        "manual_endpoints": [
            "POST /api/flights/search",
            "GET /api/flights/airports",
            "GET /api/flights/airports/expand",
            "POST /api/flights/price-calendar",
            "POST /api/flights/select",
            "POST /api/flights/prebook",
            "POST /api/flights/attach-services",
            "POST /api/flights/complete",
            "GET /api/flights/track",
            "GET /api/flights/airport",
            "GET /api/hotels/search",
            "GET /api/events",
            "GET /api/events/{id}",
            "GET /api/trains",
            "GET /api/trains/stations",
            "GET /api/trains/track",
            "GET /api/trains/pnr",
            "GET /api/trains/fares",
            "GET /api/buses",
            "GET /api/places/suggest",
            "GET /api/fx/rates",
            "GET /api/fx/convert",
            "POST /api/vero/filter",
        ],
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, request: Request):
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
    from supervisor.auth import user_from_token
    from supervisor.credits import (
        begin_turn,
        exhausted_reply,
        peek,
        plan_for_user,
        subject_key,
    )
    from supervisor.flight_structured import structured_search

    user = user_from_token(_bearer_token(request))
    uid = str((user or {}).get("id") or req.user_id or "").strip() or None
    did = _device_from(request)
    credit_plan = plan_for_user(uid)
    credit_subject = subject_key(
        user_id=uid, device_id=did, thread_id=req.session_id or req.message[:24]
    )
    credit_snap = peek(credit_subject, plan=credit_plan)
    begin_turn(
        credit_subject,
        credit_plan,
        consume=credit_snap.get("remaining", 0) >= 1,
        remaining=credit_snap.get("remaining"),
    )

    session_id = req.session_id or str(uuid.uuid4())
    session = _get_session(session_id)
    if uid:
        session["user_id"] = uid
    elif req.user_id:
        session["user_id"] = req.user_id
    if credit_snap.get("remaining", 0) < 1:
        return attach_suggestions(
            ChatResponse(
                response=exhausted_reply(
                    plan=credit_plan, reset_at=credit_snap.get("resetAt")
                ),
                session_id=session_id,
                route_path=["start", "supervisor", "credits"],
                routed_to="vero",
                active_specialist="supervisor",
                intent="credits_exhausted",
                architecture_stage="credits",
                mode="degraded",
                session_context=_session_prefs_context(session),
                credits=credit_snap,
                suggestions=["Buy Vero credits", "Search flights", "Search hotels"],
            ),
            req.message,
            session,
        )
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

        # ── general_chat / research (full Vero via general_agent) ──
        # visa/sports/hotels/train/bus are live tool domains — never stub.
        if specialist in {
            "research",
            "supervisor",
            "hotels",
            "train",
            "bus",
            "visa",
            "sports",
        } or req.page_context:
            # Narrow sticky itinerary: only when pending slot collection, not forever
            itinerary_takeover = specialist == "itinerary" or (
                session.get("pending_trip_slot") in {"destination", "dates", "travelers"}
                and not req.page_context
                and specialist not in {"research", "flights", "payment"}
                and (
                    _ITIN.search(req.message)
                    or len((req.message or "").split()) <= 6
                )
            )
            if itinerary_takeover:
                resp = run_itinerary(req.message, session)
                resp.architecture_stage = resp.architecture_stage or "trip_detail_collection"
                resp.intent = resp.intent or "trip_detail_collection"
                path = list(resp.route_path or ["start", "supervisor", "itinerary_agent"])
                if "itinerary_agent" not in path:
                    path = path + ["itinerary_agent"]
                resp.route_path = path
                session["history"] = list(session.get("history") or []) + [
                    {"role": "assistant", "content": resp.response}
                ]
                resp.session_context = _session_prefs_context(session)
                return attach_suggestions(resp, req.message, session)

            (
                reply,
                path,
                routed,
                missing,
                places,
                cards,
                preferred_name,
                address_style,
            ) = run_research(
                req.message,
                session_id,
                session=session,
                page_context=req.page_context,
                voice_mode=bool(req.voice_mode),
                spoken_language=req.spoken_language,
                traveler=req.traveler,
            )
            if _ASKED_DESTINATION.search(reply or ""):
                session["trip_flow"] = True
                session["pending_trip_slot"] = "destination"
            prefs_ctx = _session_prefs_context(session)
            session["history"] = list(session.get("history") or []) + [
                {"role": "assistant", "content": reply}
            ]
            route_note = str(session.get("route_reason") or "")
            return attach_suggestions(
                ChatResponse(
                    response=reply,
                    session_id=session_id,
                    route_path=[
                        "start",
                        "supervisor",
                        "capability_router",
                        "general_agent",
                    ],
                    routed_to=routed or "research",
                    active_specialist="research",
                    intent="general_chat",
                    architecture_stage="general_chat",
                    mode="degraded" if missing and "Error" in reply else "live",
                    config_missing=missing,
                    session_context={
                        **(prefs_ctx if isinstance(prefs_ctx, dict) else {}),
                        **({"route_reason": route_note} if route_note else {}),
                    } or None,
                    places=places,
                    cards=cards,
                    preferred_name=preferred_name,
                    address_style=address_style,
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

        # Last resort: still prefer Vero thinking over canned stubs
        (
            reply,
            _path,
            routed,
            missing,
            places,
            cards,
            preferred_name,
            address_style,
        ) = run_research(
            req.message,
            session_id,
            session=session,
            page_context=req.page_context,
            voice_mode=bool(req.voice_mode),
            spoken_language=req.spoken_language,
            traveler=req.traveler,
        )
        session["history"] = list(session.get("history") or []) + [
            {"role": "assistant", "content": reply}
        ]
        return attach_suggestions(
            ChatResponse(
                response=reply,
                session_id=session_id,
                route_path=["start", "supervisor", "capability_router", "general_agent"],
                routed_to=routed or "research",
                active_specialist="research",
                intent="general_chat",
                architecture_stage="general_chat",
                mode="degraded" if missing and "Error" in (reply or "") else "live",
                config_missing=missing,
                session_context=prefs_ctx,
                places=places,
                cards=cards,
                preferred_name=preferred_name,
                address_style=address_style,
            ),
            req.message,
            session,
        )
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


@app.get("/api/flights/airports")
async def flights_airports(q: str = "", limit: int = 10):
    """Airport autocomplete — place names, IATA codes, and nearest airports."""
    from supervisor.airport_suggest import suggest_airports

    lim = max(1, min(int(limit or 10), 20))
    return await suggest_airports(q or "", limit=lim)


@app.get("/api/flights/airports/expand")
async def flights_airports_expand(origin: str = "", destination: str = ""):
    """Nearby metros + feeder hubs for Google-style O → hub → D pairing."""
    from supervisor.airport_suggest import expand_route_airports

    return await expand_route_airports(origin, destination)


@app.get("/api/flights/track")
async def flights_track(flight: str | None = None, date: str | None = None):
    """Live flight status + optional ADS-B. Never invent gate, delay, or a map pin."""
    from supervisor.flights_track import track_flight

    return track_flight(flight=flight or "", date=date or "")


@app.get("/api/flights/airport")
async def flights_airport_board(code: str | None = None, airport: str | None = None):
    """Live airport departures / arrivals / nearby. Never invent times or pins."""
    from supervisor.flights_track import track_airport

    return track_airport(airport=code or airport or "")


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
        currency=(req.currency or "INR").upper(),
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
        currency=(req.currency or "INR").upper(),
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
        voucher_code=req.voucher_code,
    )


@app.post("/api/flights/attach-services")
async def flights_attach_services(req: FlightAttachServicesRequest):
    """Attach seats/bags (and any other LiteAPI ancillaries) to a hold before pay."""
    from supervisor.flight_structured import structured_attach_services

    session = _get_session(req.session_id)
    if req.session_context:
        session["flight_context"] = req.session_context
    return await structured_attach_services(
        session=session,
        prebook_id=req.prebook_id,
        selected_services=list(req.selected_services or []),
    )


@app.post("/api/flights/complete")
async def flights_complete(req: FlightCompleteRequest, request: Request):
    """Issue ticket after prebook + (optional) Payment SDK card capture."""
    from supervisor.auth import user_from_token
    from supervisor.flight_structured import structured_complete
    from supervisor.ledger import persist_flight_complete, safe_call
    from supervisor.loyalty_ledger import loyalty_on_booking_confirmed
    from supervisor.payment_guards import assert_mock_payment_allowed

    mock_block = assert_mock_payment_allowed(mock_payment=bool(req.mock_payment))
    if mock_block:
        raise HTTPException(status_code=400, detail=mock_block.get("message") or "Mock payment disabled.")

    session = _get_session(req.session_id)
    if req.session_context:
        session["flight_context"] = req.session_context
    result = await structured_complete(
        session=session,
        prebook_id=req.prebook_id,
        transaction_id=req.transaction_id,
        mock_payment=bool(req.mock_payment),
        payment_provider=req.payment_provider,
        payment_id=req.payment_id,
        expected_amount=req.expected_amount,
        currency=req.currency,
    )
    safe_call(
        persist_flight_complete,
        device_id=_device_from(request),
        result=result,
        payment_id=req.payment_id,
        expected_amount=req.expected_amount,
        currency=req.currency,
        guest_email=getattr(req, "contact_email", None),
    )
    pay_ref = (req.payment_id or req.transaction_id or "").strip()
    # Email hygiene: only send confirmation after a successful ticket issue
    # (never on payment-id alone — that caused false "booked" emails).
    if result.get("ok"):
        from supervisor.booking_notify import resolve_checkout_email, schedule_booking_email
        from supervisor.payment_intents import get_pending_by_prebook, mark_completed

        ctx = session.get("flight_context") or {}
        pid = req.prebook_id or ctx.get("prebook_id")
        intent = get_pending_by_prebook(pid) if pid else None
        mail = resolve_checkout_email(
            session=session,
            intent=intent,
            explicit=req.contact_email,
        )
        slots = session.get("trip_slots") or {}
        ctx = session.get("flight_context") or {}
        last_pb = ctx.get("last_prebook") if isinstance(ctx.get("last_prebook"), dict) else {}
        route = (intent or {}).get("payload", {}).get("route") if intent else ""
        if not route and slots.get("origin") and slots.get("destination"):
            route = f"{slots.get('origin')} → {slots.get('destination')}"
        travelers = ctx.get("travelers_draft") if isinstance(ctx.get("travelers_draft"), list) else []
        pax_names = []
        for t in travelers:
            if not isinstance(t, dict):
                continue
            nm = " ".join(
                str(t.get(k) or "").strip() for k in ("first_name", "firstName", "last_name", "lastName") if t.get(k)
            ).strip()
            if nm:
                pax_names.append(nm)
        schedule_booking_email(
            kind="flight",
            to_email=mail,
            result=result,
            extras={
                "route": route,
                "amount": req.expected_amount or last_pb.get("price"),
                "currency": req.currency or last_pb.get("currency") or "INR",
                "airline": last_pb.get("airline") or last_pb.get("carrier"),
                "flight_number": last_pb.get("flight_number"),
                "passengers": pax_names,
            },
            payment_id=pay_ref or None,
        )
        if pid and pay_ref:
            mark_completed(prebook_id=pid, payment_id=pay_ref)
        booking = result.get("booking") if isinstance(result.get("booking"), dict) else {}
        booking_id = str(
            result.get("booking_id")
            or booking.get("booking_id")
            or booking.get("bookingId")
            or result.get("booking_ref")
            or ""
        )
        user = user_from_token(_bearer_token(request))
        await loyalty_on_booking_confirmed(
            user_id=str(user["id"]) if user and user.get("id") else None,
            guest_email=mail,
            booking_id=booking_id,
            booking_kind="flight",
            amount=req.expected_amount or booking.get("price") or last_pb.get("price"),
            currency=req.currency or booking.get("currency") or last_pb.get("currency") or "INR",
            check_out_date=None,
        )
    _save_session(req.session_id, session)
    return result


class SendBookingEmailRequest(BaseModel):
    """Manual SMTP send from My Trips / confirmation pages."""

    kind: str = "flight"
    email: str
    payment_id: Optional[str] = None
    booking_ref: Optional[str] = None
    route: Optional[str] = None
    hotel_name: Optional[str] = None
    airline: Optional[str] = None
    flight_number: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "INR"
    pending: bool = False
    # Schedule / pax — required for a useful e-ticket (Trip Details often has these)
    depart_at: Optional[str] = None
    arrive_at: Optional[str] = None
    travel_date: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    duration: Optional[str] = None
    cabin: Optional[str] = None
    stops: Optional[str] = None
    passengers: Optional[list[str]] = None
    phone: Optional[str] = None


@app.post("/api/bookings/send-email")
async def send_booking_email(req: SendBookingEmailRequest):
    """Send booking confirmation via Zoho SMTP (same stack as checkout mail)."""
    from supervisor.booking_notify import send_booking_email_smtp

    mail = (req.email or "").strip()
    pay = (req.payment_id or "").strip()
    ref = (req.booking_ref or "").strip()
    if not mail or "@" not in mail:
        raise HTTPException(status_code=400, detail="Valid email is required.")
    if not pay and not ref:
        raise HTTPException(status_code=400, detail="booking_ref or payment_id is required.")

    kind = (req.kind or "flight").strip().lower()
    if kind not in {"flight", "hotel"}:
        raise HTTPException(status_code=400, detail="kind must be flight or hotel.")

    # Do not invent ITN-* refs from payment suffixes — only use caller ref or ledger.
    if not ref and pay:
        try:
            from supervisor.ledger import configured, connection

            if configured():
                with connection() as conn:
                    row = conn.execute(
                        """
                        SELECT COALESCE(pnr, supplier_booking_id)
                        FROM bookings
                        WHERE payment_id = %s
                        ORDER BY updated_at DESC NULLS LAST
                        LIMIT 1
                        """,
                        (pay,),
                    ).fetchone()
                    if row and row[0]:
                        ref = str(row[0]).strip()
        except Exception:
            ref = ref
    if not ref:
        raise HTTPException(
            status_code=400,
            detail="Unknown booking — provide booking_ref from a completed checkout.",
        )

    result: dict[str, Any] = {
        "ok": not req.pending,
        "payment_ready": True,
        "booking": {
            "airline_pnr": ref,
            "booking_ref": ref,
            "hotel_confirmation_code": ref if kind == "hotel" else None,
        },
    }
    if req.pending:
        result["error"] = (
            "Your payment was captured. The booking is still being issued — "
            "support@itinero.company can help if this takes more than a few minutes."
        )

    out = await send_booking_email_smtp(
        kind=kind,
        to_email=mail,
        result=result,
        extras={
            "route": req.route,
            "hotel_name": req.hotel_name,
            "airline": req.airline,
            "flight_number": req.flight_number,
            "amount": req.amount,
            "currency": req.currency or "INR",
            "booking_ref": ref,
            "depart_at": req.depart_at,
            "arrive_at": req.arrive_at,
            "travel_date": req.travel_date,
            "origin": (req.origin or "").strip().upper()[:3] or None,
            "destination": (req.destination or "").strip().upper()[:3] or None,
            "duration": req.duration,
            "cabin": req.cabin,
            "stops": req.stops,
            "passengers": [p for p in (req.passengers or []) if str(p or "").strip()],
            "email": mail,
            "phone": req.phone,
        },
        payment_id=pay or None,
        force_pending=bool(req.pending),
        allow_unconfirmed=False,
    )
    if not out.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=out.get("message") or out.get("error") or "SMTP send failed.",
        )
    return {"ok": True, "channel": out.get("channel") or "smtp", "message": f"Email sent to {mail}."}


class ResendBookingEmailRequest(BaseModel):
    kind: str = "flight"
    payment_id: Optional[str] = None
    email: str
    route: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "INR"
    booking_ref: Optional[str] = None
    pending: bool = True


@app.post("/api/bookings/resend-email")
async def resend_booking_email(req: ResendBookingEmailRequest):
    """Compat alias — same Zoho SMTP path as /api/bookings/send-email."""
    return await send_booking_email(
        SendBookingEmailRequest(
            kind=req.kind,
            email=req.email,
            payment_id=req.payment_id,
            booking_ref=req.booking_ref,
            route=req.route,
            amount=req.amount,
            currency=req.currency,
            pending=req.pending,
        )
    )


@app.get("/api/hotels/search")
async def hotels_search(
    city: str = "",
    check_in: str = "",
    check_out: str = "",
    guests: int = 2,
    rooms: int = 1,
    currency: str = "INR",
    page: int = 1,
    page_size: int = 20,
    category: str = "hotels",
    city_code: str = "",
    latitude: float | None = None,
    longitude: float | None = None,
    sort_by: str = "recommended",
):
    """Manual hotel/homes search — LiteAPI live inventory (paginated, no samples).

    Pass category=homes for villas, apartments, homestays (LiteAPI hotelTypeIds).
    """
    from supervisor.hotel_structured import structured_hotel_search

    return await structured_hotel_search(
        city=city,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        rooms=rooms,
        currency=(currency or "INR").upper(),
        page=page,
        page_size=page_size,
        category=category,
        city_code=city_code or None,
        latitude=latitude,
        longitude=longitude,
        sort_by=sort_by,
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


@app.get("/api/hotels/reviews/featured")
async def hotels_featured_reviews(limit: int = 12):
    """Homepage guest quotes — live LiteAPI reviews across popular cities (no invented text)."""
    from supervisor.hotel_structured import structured_featured_reviews

    return await structured_featured_reviews(limit=limit)


@app.get("/api/hotels/{hotel_id}/reviews")
async def hotel_reviews(hotel_id: str, limit: int = 20):
    """Live guest reviews — LiteAPI GET /data/reviews."""
    from supervisor.hotel_structured import structured_hotel_reviews

    return await structured_hotel_reviews(hotel_id=hotel_id, limit=limit)


@app.post("/api/hotels/prebook")
async def hotels_prebook(req: HotelPrebookRequest):
    """Hold a hotel rate via LiteAPI Payment SDK (Stripe) by default."""
    from supervisor.hotel_structured import structured_hotel_prebook
    from supervisor.liteapi_addons import normalize_addons

    return await structured_hotel_prebook(
        offer_id=req.offer_id,
        voucher_code=req.voucher_code,
        currency=req.currency or "INR",
        use_payment_sdk=req.use_payment_sdk,
        hotel_id=req.hotel_id,
        check_in=req.check_in,
        check_out=req.check_out,
        guests=req.guests,
        rooms=req.rooms,
        room_title=req.room_title,
        room_board=req.room_board,
        target_price=req.target_price,
        addons=normalize_addons(req.addons),
    )


@app.get("/api/hotels/addons/esim/{country_code}")
async def hotels_esim_packages(country_code: str):
    """LiteAPI eSimply — list eSIM data plans for destination country (ISO-2)."""
    from supervisor.liteapi_addons import fetch_esim_packages

    return await fetch_esim_packages(country_code=country_code)


@app.get("/api/integrations/liteapi")
async def liteapi_integrations_status():
    """Full LiteAPI / Nuitee Connect capability map (wired / partial / pbo_only / unused)."""
    from supervisor.liteapi_catalog import build_liteapi_catalog
    from supervisor.liteapi_loyalty import fetch_loyalty_settings

    loyalty = await fetch_loyalty_settings()
    return build_liteapi_catalog(loyalty=loyalty)


@app.post("/api/webhooks/stripe")
async def stripe_billing_webhook(request: Request):
    """Stripe Billing webhooks for Vero credit packs (+ legacy Plus events)."""
    from supervisor.billing import process_stripe_webhook

    payload = await request.body()
    sig = request.headers.get("stripe-signature") or request.headers.get("Stripe-Signature")
    out = process_stripe_webhook(payload=payload, signature=sig)
    if not out.get("ok"):
        code = 400 if out.get("error") == "invalid_signature" else 400
        raise HTTPException(status_code=code, detail=out.get("message") or out.get("error"))
    return out


@app.post("/api/webhooks/liteapi")
async def liteapi_webhook(request: Request):
    """LiteAPI (Nuitee Connect) booking lifecycle webhooks."""
    from supervisor.liteapi_webhook import process_liteapi_webhook, verify_auth_header

    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not verify_auth_header(auth):
        raise HTTPException(status_code=401, detail="Invalid LiteAPI webhook authorization.")
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected JSON object.")
    return await process_liteapi_webhook(body)


@app.post("/api/hotels/book")
async def hotels_book(req: HotelBookRequest, request: Request):
    """Confirm hotel after LiteAPI Payment SDK (Stripe) or sandbox mock."""
    from supervisor.auth import user_from_token
    from supervisor.hotel_structured import structured_hotel_book
    from supervisor.ledger import persist_hotel_book, safe_call
    from supervisor.loyalty_ledger import loyalty_on_booking_confirmed
    from supervisor.payment_guards import assert_mock_payment_allowed

    mock_block = assert_mock_payment_allowed(mock_payment=bool(req.mock_payment))
    if mock_block:
        raise HTTPException(status_code=400, detail=mock_block.get("message") or "Mock payment disabled.")

    result = await structured_hotel_book(
        prebook_id=req.prebook_id,
        holder=req.holder,
        guests=list(req.guests or []),
        transaction_id=req.transaction_id,
        mock_payment=bool(req.mock_payment),
        payment_provider=req.payment_provider,
        payment_id=req.payment_id,
        expected_amount=req.expected_amount,
    )
    safe_call(
        persist_hotel_book,
        device_id=_device_from(request),
        result=result,
        payment_id=req.payment_id,
        expected_amount=req.expected_amount,
        guest_email=(req.holder or {}).get("email") if isinstance(req.holder, dict) else None,
    )
    if result.get("ok") and (req.payment_id or req.transaction_id):
        from supervisor.booking_notify import schedule_booking_email
        from supervisor.payment_intents import get_pending_by_prebook, mark_completed

        holder = req.holder or {}
        intent = get_pending_by_prebook(req.prebook_id)
        payload = (intent or {}).get("payload") or {}
        pay_ref = (req.payment_id or req.transaction_id or "").strip()
        schedule_booking_email(
            kind="hotel",
            to_email=holder.get("email"),
            result=result,
            extras={
                "hotel_name": payload.get("hotel_name") or holder.get("hotel_name"),
                "check_in": payload.get("check_in"),
                "check_out": payload.get("check_out"),
                "amount": req.expected_amount,
                "currency": "INR",
            },
            payment_id=pay_ref or None,
        )
        if pay_ref:
            mark_completed(prebook_id=req.prebook_id, payment_id=pay_ref)
    if result.get("ok"):
        from supervisor.payment_intents import get_pending_by_prebook

        user = user_from_token(_bearer_token(request))
        holder = req.holder or {}
        booking = result.get("booking") if isinstance(result.get("booking"), dict) else {}
        intent = get_pending_by_prebook(req.prebook_id) if req.prebook_id else None
        payload = (intent or {}).get("payload") or {}
        await loyalty_on_booking_confirmed(
            user_id=str(user["id"]) if user and user.get("id") else None,
            guest_email=holder.get("email"),
            booking_id=str(booking.get("booking_id") or booking.get("bookingId") or req.prebook_id or ""),
            booking_kind="hotel",
            amount=req.expected_amount or booking.get("price"),
            currency=booking.get("currency") or payload.get("currency") or "INR",
            check_out_date=payload.get("check_out"),
        )
    return result


@app.get("/api/hotels/bookings/{booking_id}")
async def hotels_get_booking(booking_id: str, request: Request, email: str | None = None):
    from supervisor.hotel_structured import structured_hotel_get_booking

    _require_booking_device_access(request, booking_id, email=email)
    return await structured_hotel_get_booking(booking_id=booking_id)


@app.post("/api/hotels/bookings/amend")
async def hotels_amend_booking(req: HotelAmendRequest, request: Request):
    from supervisor.hotel_structured import (
        structured_hotel_amend_dates,
        structured_hotel_amend_guest,
    )

    _require_booking_device_access(request, req.booking_id, email=req.email)
    if req.check_in or req.check_out or req.prebook_id:
        return await structured_hotel_amend_dates(
            booking_id=req.booking_id,
            check_in=req.check_in or "",
            check_out=req.check_out or "",
            occupancies=req.occupancies,
            prebook_id=req.prebook_id,
            guest_info={"holder": req.holder} if req.holder else None,
        )
    return await structured_hotel_amend_guest(
        booking_id=req.booking_id,
        holder=req.holder,
        guests=req.guests,
    )


@app.post("/api/hotels/bookings/cancel")
async def hotels_cancel_booking(req: HotelBookingIdRequest, request: Request):
    from supervisor.hotel_structured import structured_hotel_cancel_booking
    from supervisor.ledger import persist_cancel_result, safe_call
    from supervisor.loyalty_ledger import loyalty_on_booking_cancelled

    _require_booking_device_access(request, req.booking_id, email=req.email)
    result = await structured_hotel_cancel_booking(
        booking_id=req.booking_id,
        payment_id=req.payment_id,
        expected_amount=req.expected_amount,
        payment_provider=req.payment_provider,
    )
    if result.get("ok"):
        safe_call(
            persist_cancel_result,
            kind="hotel",
            device_id=_device_from(request),
            supplier_booking_id=req.booking_id,
            payment_id=req.payment_id,
            result=result,
        )
        await loyalty_on_booking_cancelled(
            booking_id=req.booking_id,
            reason="hotel_cancel_api",
        )
        result["loyalty"] = {"reversed": True}
        try:
            from supervisor.email_service import send_booking_cancellation
            from supervisor.booking_access import ledger_guest_email

            mail = (req.email or "").strip() or ledger_guest_email(req.booking_id)
            if mail:
                await send_booking_cancellation(
                    kind="hotel",
                    to_email=mail,
                    details={
                        "booking_ref": req.booking_id,
                        "booking_id": req.booking_id,
                        "status": "cancelled",
                        "loyalty_reversed": True,
                    },
                )
        except Exception:
            traceback.print_exc()
    return result


@app.get("/api/flights/bookings/{booking_id}")
async def flights_get_booking(booking_id: str, request: Request, email: str | None = None):
    from supervisor.flight_structured import structured_flight_get_booking

    _require_booking_device_access(request, booking_id, email=email)
    return await structured_flight_get_booking(booking_id=booking_id)


@app.get("/api/flights/bookings/{booking_id}/cancel-quote")
async def flights_cancel_quote(booking_id: str, request: Request, email: str | None = None):
    from supervisor.flight_structured import structured_flight_cancel_quote

    _require_booking_device_access(request, booking_id, email=email)
    return await structured_flight_cancel_quote(booking_id=booking_id)


@app.post("/api/flights/bookings/cancel")
async def flights_cancel_booking(req: FlightBookingIdRequest, request: Request):
    from supervisor.flight_structured import structured_flight_cancel_booking
    from supervisor.ledger import persist_cancel_result, safe_call
    from supervisor.loyalty_ledger import loyalty_on_booking_cancelled

    _require_booking_device_access(request, req.booking_id, email=req.email)
    result = await structured_flight_cancel_booking(
        booking_id=req.booking_id,
        payment_id=req.payment_id,
        expected_amount=req.expected_amount,
        payment_provider=req.payment_provider,
    )
    if result.get("ok"):
        safe_call(
            persist_cancel_result,
            kind="flight",
            device_id=_device_from(request),
            supplier_booking_id=req.booking_id,
            payment_id=req.payment_id,
            result=result,
        )
        await loyalty_on_booking_cancelled(
            booking_id=req.booking_id,
            reason="flight_cancel_api",
        )
        result["loyalty"] = {"reversed": True}
        try:
            from supervisor.email_service import send_booking_cancellation
            from supervisor.booking_access import ledger_guest_email

            mail = (req.email or "").strip() or ledger_guest_email(req.booking_id)
            if mail:
                await send_booking_cancellation(
                    kind="flight",
                    to_email=mail,
                    details={
                        "booking_ref": req.booking_id,
                        "booking_id": req.booking_id,
                        "status": "cancelled",
                        "loyalty_reversed": True,
                    },
                )
        except Exception:
            traceback.print_exc()
    return result


@app.post("/api/payments/intent")
def payments_intent(req: PaymentIntentRequest, request: Request):
    """Register checkout context (orphan recovery / analytics). Stripe Payment SDK is the checkout rail."""
    from supervisor.payment_intents import upsert_intent

    result = upsert_intent(
        prebook_id=req.prebook_id,
        kind=req.kind,
        device_id=_device_from(request),
        session_id=req.session_id,
        amount=req.amount,
        currency=req.currency or "INR",
        email=req.email,
        payload=req.payload,
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "intent_failed")
    return result



def _auth_user(request: Request) -> dict[str, Any] | None:
    from supervisor.auth import user_from_token

    return user_from_token(_bearer_token(request))


@app.get("/api/trips")
def trips_list(request: Request):
    from supervisor.db import configured
    from supervisor.ledger import list_trips

    if not configured():
        return {"ok": False, "error": "db_unset", "trips": []}
    device_id = _device_from(request)
    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    if not device_id and not user_id:
        return {"ok": False, "error": "missing_device", "trips": []}
    return {"ok": True, "trips": list_trips(device_id, user_id=user_id)}


@app.put("/api/trips")
def trips_upsert(req: TripUpsertRequest, request: Request):
    from supervisor.db import configured
    from supervisor.ledger import upsert_trip

    if not configured():
        return {"ok": False, "error": "db_unset"}  # graceful no-op when DB not configured
    device_id = _device_from(request)
    if not device_id:
        raise HTTPException(status_code=400, detail="Missing X-Itinero-Device header.")
    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    result = upsert_trip(device_id, req.trip, user_id=user_id)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "upsert_failed")
    return result


@app.delete("/api/trips/{trip_id}")
def trips_delete(trip_id: str, request: Request):
    from supervisor.db import configured
    from supervisor.ledger import delete_trip

    if not configured():
        return {"ok": False, "error": "db_unset"}  # graceful no-op
    device_id = _device_from(request)
    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    if not device_id and not user_id:
        raise HTTPException(status_code=400, detail="Missing X-Itinero-Device header.")
    ok = delete_trip(device_id, trip_id, user_id=user_id)
    return {"ok": ok}


def _bearer_token(request: Request) -> str | None:
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip() or None
    return None


@app.post("/api/v1/auth/otp/send")
async def auth_otp_send(req: OtpSendRequest):
    from supervisor.auth import request_otp

    result = await request_otp(identifier=req.identifier, phone=req.phone, email=req.email)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "otp_send_failed")
    return result


@app.post("/api/v1/auth/otp/verify")
def auth_otp_verify(req: OtpVerifyRequest, request: Request):
    from supervisor.auth import verify_otp

    result = verify_otp(
        identifier=req.identifier,
        phone=req.phone,
        email=req.email,
        code=req.code,
        device_id=_device_from(request),
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "otp_verify_failed")
    return result


@app.post("/api/v1/auth/login")
def auth_login(req: OtpVerifyRequest, request: Request):
    from supervisor.auth import verify_otp

    result = verify_otp(
        identifier=req.identifier,
        phone=req.phone,
        email=req.email,
        code=req.code,
        device_id=_device_from(request),
    )
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "login_failed")
    return result


@app.post("/api/v1/auth/google")
def auth_google(req: GoogleAuthRequest, request: Request):
    from supervisor.auth import login_with_google

    result = login_with_google(id_token_str=req.id_token, device_id=_device_from(request))
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "google_auth_failed")
    return result


@app.get("/api/v1/auth/profile")
def auth_profile(request: Request):
    from supervisor.auth import user_from_token

    user = user_from_token(_bearer_token(request))
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required.")
    return {"ok": True, "user": user}


@app.put("/api/v1/auth/profile")
def auth_profile_update(req: AuthProfileUpdateRequest, request: Request):
    from supervisor.auth import update_profile

    result = update_profile(
        _bearer_token(request),
        name=req.name,
        phone=req.phone,
        newsletter=req.newsletter,
    )
    if not result.get("ok"):
        code = 401 if result.get("error") == "unauthorized" else 400
        raise HTTPException(status_code=code, detail=result.get("message") or "update_failed")
    return result


@app.post("/api/v1/auth/logout")
def auth_logout(request: Request):
    from supervisor.auth import logout

    return logout(_bearer_token(request))


@app.get("/api/account/state")
def account_state_get(request: Request):
    from supervisor.account_profile import get_state

    user = _auth_user(request)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    return get_state(str(user["id"]))


@app.put("/api/account/state")
def account_state_put(req: AccountStateRequest, request: Request):
    from supervisor.account_profile import put_state

    user = _auth_user(request)
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    result = put_state(
        str(user["id"]),
        travellers=req.travellers,
        prefs=req.prefs,
        contact=req.contact,
        saved=req.saved,
    )
    if not result.get("ok") and result.get("error") == "db_unset":
        raise HTTPException(status_code=503, detail="Database is not configured.")
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error") or "save_failed")
    return result


class BillingCheckoutRequest(BaseModel):
    pack_id: str = "traveler"
    currency: str = "INR"
    interval: str | None = None  # month (default, autocard) | once


class BillingCheckoutCompleteRequest(BaseModel):
    session_id: str


@app.get("/api/billing/plans")
def billing_plans(currency: str = "INR"):
    """Public plan catalog. Vero is always free."""
    from supervisor.billing import catalog

    return catalog(currency=currency)


@app.get("/api/billing/me")
def billing_me(request: Request):
    from supervisor.auth import user_from_token
    from supervisor.billing import snapshot_for_user
    from supervisor.credits import snapshot as credit_snapshot, subject_key

    user = user_from_token(_bearer_token(request))
    uid = (user or {}).get("id") if user else None
    snap = snapshot_for_user(uid)
    credits = credit_snapshot(
        subject_key(user_id=uid, device_id=_device_from(request)),
        plan=snap.get("plan"),
    )
    return {
        "ok": True,
        "veroFree": True,
        **snap,
        "credits": credits,
        "signedIn": bool(user and user.get("id")),
    }


@app.get("/api/watches")
def watches_list(request: Request):
    from supervisor.watches import list_watches

    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    return {
        "ok": True,
        "watches": list_watches(user_id=user_id, device_id=_device_from(request)),
        "limit": (
            int((user or {}).get("plan", {}).get("priceWatchLimit") or 0)
            if user
            else 1
        )
        or None,
    }


@app.post("/api/watches")
def watches_upsert(req: WatchUpsertRequest, request: Request):
    from supervisor.watches import upsert_watch

    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    email = req.email or (user.get("email") if user else None)
    out = upsert_watch(
        user_id=user_id,
        device_id=_device_from(request),
        origin=req.origin,
        destination=req.destination,
        currency=req.currency,
        email=email,
        watch_id=req.id,
    )
    if not out.get("ok"):
        code = 409 if out.get("error") == "watch_limit" else 400
        raise HTTPException(status_code=code, detail=out.get("message") or out.get("error"))
    return out


@app.delete("/api/watches/{watch_id}")
def watches_delete(watch_id: str, request: Request):
    from supervisor.watches import delete_watch

    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    ok = delete_watch(watch_id=watch_id, user_id=user_id, device_id=_device_from(request))
    return {"ok": ok}


@app.post("/api/watches/{watch_id}/check")
async def watches_check_one(watch_id: str, request: Request):
    from supervisor.watches import check_watch, list_watches

    user = _auth_user(request)
    user_id = str(user["id"]) if user and user.get("id") else None
    owned = list_watches(user_id=user_id, device_id=_device_from(request))
    if not any(w.get("id") == watch_id for w in owned) and not _admin_secret_ok(request):
        raise HTTPException(status_code=403, detail="Not your watch.")
    return await check_watch(watch_id, send_email=True)


@app.post("/api/watches/check")
async def watches_check_due(request: Request):
    from supervisor.watches import check_due

    if not _admin_secret_ok(request) and not _marketing_admin_ok(request):
        raise HTTPException(status_code=403, detail="Admin token required.")
    return await check_due(send_email=True)


@app.get("/api/billing/credits")
def billing_credits(request: Request):
    from supervisor.auth import user_from_token
    from supervisor.credits import snapshot as credit_snapshot, plan_for_user, subject_key

    user = user_from_token(_bearer_token(request))
    uid = (user or {}).get("id") if user else None
    plan = plan_for_user(uid)
    return credit_snapshot(
        subject_key(user_id=uid, device_id=_device_from(request)),
        plan=plan,
    )


@app.post("/api/billing/checkout")
def billing_checkout(req: BillingCheckoutRequest, request: Request):
    from supervisor.auth import user_from_token
    from supervisor.billing import create_checkout_session

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in to buy credits.")
    out = create_checkout_session(
        user_id=str(user["id"]),
        email=user.get("email"),
        name=user.get("displayName") or user.get("name"),
        pack_id=req.pack_id,
        interval=req.interval,
        currency=req.currency,
    )
    if not out.get("ok"):
        code = 401 if out.get("error") == "unauthorized" else 400
        raise HTTPException(status_code=code, detail=out.get("message") or out.get("error"))
    return out


@app.post("/api/billing/checkout/complete")
def billing_checkout_complete(req: BillingCheckoutCompleteRequest, request: Request):
    from supervisor.auth import user_from_token
    from supervisor.billing import complete_checkout_session

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in to finish checkout.")
    out = complete_checkout_session(user_id=str(user["id"]), session_id=req.session_id)
    if not out.get("ok"):
        code = 403 if out.get("error") == "forbidden" else 400
        raise HTTPException(status_code=code, detail=out.get("message") or out.get("error"))
    return out


@app.post("/api/billing/portal")
def billing_portal(request: Request):
    from supervisor.auth import user_from_token
    from supervisor.billing import create_portal_session

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    out = create_portal_session(user_id=str(user["id"]))
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("message") or out.get("error"))
    return out


@app.post("/api/vero/filter")
async def vero_filter(req: VeroFilterRequest):
    """Let Vero Filter — LLM turns natural language into structured result filters."""
    from supervisor.vero_filter import interpret_flight_filter, interpret_hotel_filter

    domain = (req.domain or "").strip().lower()
    if domain == "hotels":
        return await interpret_hotel_filter(
            req.query,
            areas=req.areas,
            price_bounds=req.price_bounds,
            hotels=req.hotels,
        )
    if domain == "flights":
        return await interpret_flight_filter(
            req.query,
            airlines=req.airlines,
            price_bounds=req.price_bounds,
        )
    return {
        "domain": domain or "unknown",
        "filters": {},
        "summary": "Unknown domain — use hotels or flights.",
        "mode": "error",
        "error": "unknown_domain",
    }


@app.get("/api/fx/rates")
async def fx_rates(base: str = "INR", quotes: str | None = None):
    """Live Frankfurter mid-market rates. No API key."""
    from supervisor.fx_structured import rates_bundle

    return rates_bundle(base=base, quotes=quotes)


@app.get("/api/fx/convert")
async def fx_convert(amount: float, src: str = "USD", dst: str = "INR"):
    from supervisor.fx_structured import convert

    return convert(amount, src, dst)


@app.get("/api/loyalty/settings")
async def loyalty_settings():
    """LiteAPI loyalty program status (cached)."""
    from supervisor.liteapi_loyalty import fetch_loyalty_settings

    return await fetch_loyalty_settings()


@app.get("/api/loyalty/estimate")
async def loyalty_estimate(request: Request, amount: float, currency: str = "INR"):
    """Estimated Itinero points for a booking total."""
    from supervisor.auth import user_from_token
    from supervisor.billing import loyalty_multiplier_for
    from supervisor.liteapi_loyalty import estimate_loyalty_earn, fetch_loyalty_settings

    settings = await fetch_loyalty_settings()
    est = estimate_loyalty_earn(amount=amount, currency=currency, settings=settings)
    user = user_from_token(_bearer_token(request))
    uid = str((user or {}).get("id") or "") or None
    mult = loyalty_multiplier_for(uid)
    pts = int(est.get("points") or 0)
    if est.get("ok") and pts > 0 and mult > 1:
        pts = max(1, int(round(pts * mult)))
        est = {
            **est,
            "points": pts,
            "loyaltyMultiplier": mult,
            "label": f"Earn ~{pts:,} {(est.get('programName') or 'Itinero Rewards')} points (2× member)",
        }
    else:
        est = {**est, "loyaltyMultiplier": mult}
    return est


@app.get("/api/loyalty/balance")
async def loyalty_balance(request: Request):
    from supervisor.auth import user_from_token
    from supervisor.loyalty_ledger import get_balance

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        return {"ok": False, "enabled": True, "message": "Sign in to view your points."}
    return get_balance(user_id=str(user["id"]))


@app.get("/api/loyalty/history")
async def loyalty_history(request: Request, limit: int = 30):
    from supervisor.auth import user_from_token
    from supervisor.loyalty_ledger import list_history

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    return list_history(user_id=str(user["id"]), limit=limit)


@app.get("/api/loyalty/redeem-quote")
async def loyalty_redeem_quote(request: Request, points: int, currency: str = "INR"):
    from supervisor.auth import user_from_token
    from supervisor.loyalty_ledger import get_balance, points_to_discount

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    bal = get_balance(user_id=str(user["id"]))
    quote = points_to_discount(points=points, currency=currency)
    if quote.get("ok"):
        quote["balance"] = bal.get("balance", 0)
        quote["maxPoints"] = bal.get("balance", 0)
    return quote


class LoyaltyRedeemRequest(BaseModel):
    points: int
    currency: str = "INR"


@app.post("/api/loyalty/redeem")
async def loyalty_redeem(req: LoyaltyRedeemRequest, request: Request):
    """Reserve points for checkout — returns redemptionId + discount amount."""
    from supervisor.auth import user_from_token
    from supervisor.loyalty_ledger import reserve_redemption

    user = user_from_token(_bearer_token(request))
    if not user or not user.get("id"):
        raise HTTPException(status_code=401, detail="Sign in required.")
    out = reserve_redemption(
        user_id=str(user["id"]),
        points=int(req.points),
        currency=(req.currency or "INR").upper(),
    )
    if not out.get("ok"):
        raise HTTPException(status_code=400, detail=out.get("message") or out.get("error"))
    return out


@app.post("/api/loyalty/confirm-due")
async def loyalty_confirm_due(request: Request, limit: int = 500):
    """Cron/ops: move pending earns to available after check-out (admin secret)."""
    if not _admin_secret_ok(request):
        raise HTTPException(status_code=401, detail="Admin secret required.")
    from supervisor.loyalty_ledger import confirm_all_due_points

    return confirm_all_due_points(limit=limit)


@app.get("/api/events")
async def events_search(
    city: str | None = None,
    keyword: str | None = None,
    classification: str | None = None,
    start: str | None = None,
    end: str | None = None,
    country: str | None = None,
    size: int = 24,
):
    """Live Ticketmaster events for the manual Events tab. Search only."""
    from supervisor.events_structured import search_events

    return search_events(
        city=city or "",
        keyword=keyword or "",
        classification=classification or "",
        start=start or "",
        end=end or "",
        country=country or "",
        size=size,
    )


@app.get("/api/events/{event_id}")
async def events_detail(event_id: str):
    from supervisor.events_structured import get_event

    return get_event(event_id)


@app.get("/api/trains")
async def trains_search(
    origin: str | None = None,
    destination: str | None = None,
    when: str | None = None,
    window: str | None = None,
    date: str | None = None,
    limit: int = 120,
):
    """Live Indian Rail timetable for the left-page Trains UI (full corridor)."""
    from supervisor.trains_structured import search_trains

    return search_trains(
        origin=origin or "",
        destination=destination or "",
        when=when or "",
        window=window or "",
        date=date or "",
        limit=limit or 120,
    )


@app.get("/api/trains/stations")
async def trains_stations(q: str | None = None, limit: int = 8):
    """City / station name → IRCTC codes for the trains search bar."""
    from supervisor.trains_structured import suggest_stations

    return suggest_stations(q=q or "", limit=limit or 8)


@app.get("/api/trains/track")
async def trains_track(number: str | None = None, start_day: int = 0):
    """Operational IR running status (not GPS)."""
    from supervisor.trains_structured import track_train

    return track_train(number=number or "", start_day=start_day or 0)


@app.get("/api/trains/pnr")
async def trains_pnr(pnr: str | None = None):
    """Partner PNR status. Never invent WL/RAC/CNF."""
    from supervisor.trains_structured import check_pnr

    return check_pnr(pnr=pnr or "")


@app.get("/api/trains/fares")
async def trains_fares(
    number: str | None = None,
    origin: str | None = None,
    destination: str | None = None,
    date: str | None = None,
    quota: str | None = None,
):
    """Coach-wise fare + availability. Never invent a price."""
    from supervisor.trains_structured import train_fares

    return train_fares(
        number=number or "",
        origin=origin or "",
        destination=destination or "",
        date=date or "",
        quota=quota or "GN",
    )


@app.get("/api/places/suggest")
async def places_suggest(q: str = "", limit: int = 8):
    """Google Places typeahead — any landmark, stop, airport, or neighborhood."""
    from supervisor.place_suggest import suggest_places

    return suggest_places(q or "", limit=limit)


@app.get("/api/places/photo")
async def places_photo(
    q: str = "",
    city: str = "",
    country: str = "",
    max_px: int = 900,
    i: int = 0,
):
    """Google Places landmark photo metadata (proxy path for <img src>)."""
    import asyncio

    from supervisor.places_photos import resolve_place_photo

    return await asyncio.to_thread(
        resolve_place_photo,
        q or "",
        city=city or "",
        country=country or "",
        max_px=max_px,
        index=i,
    )


@app.get("/api/places/photo/img")
async def places_photo_img(
    q: str = "",
    city: str = "",
    country: str = "",
    max_px: int = 900,
    i: int = 0,
):
    """Same-origin image bytes — Explore cards use this so VPN can't block Google CDN."""
    import asyncio

    from fastapi.responses import Response

    from supervisor.places_photos import fetch_place_photo_bytes

    got = await asyncio.to_thread(
        fetch_place_photo_bytes,
        q or "",
        city=city or "",
        country=country or "",
        max_px=max_px,
        index=i,
    )
    if not got:
        raise HTTPException(status_code=404, detail="photo_unavailable")
    data, content_type = got
    return Response(
        content=data,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=604800",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/buses")
async def buses_search(
    origin: str | None = None,
    destination: str | None = None,
    when: str | None = None,
    window: str | None = None,
    date: str | None = None,
    limit: int = 80,
):
    """Live intercity buses for the left-page Buses UI. Booking is partner handoff."""
    from supervisor.buses_structured import search_buses

    return search_buses(
        origin=origin or "",
        destination=destination or "",
        when=when or "",
        window=window or "",
        date=date or "",
        limit=limit or 80,
    )


@app.get("/api/packages")
async def packages_list(
    region: str | None = None,
    theme: str | None = None,
    max_price: float | None = None,
    q: str | None = None,
    duration: int | None = None,
    market: str | None = None,
):
    """Curated holiday packages catalog (Itinero-owned content).

    Optional `market` (ISO country, e.g. US / IN) filters by package.markets.
    """
    from supervisor.packages_structured import list_packages

    return list_packages(
        region=region,
        theme=theme,
        max_price=max_price,
        q=q,
        duration=duration,
        market=market,
    )


@app.get("/api/explore/destinations")
async def explore_destinations_list(
    market: str | None = None,
    continent: str | None = None,
    theme: str | None = None,
    q: str | None = None,
):
    """Explore destination catalog (market-tagged). Source: explore_factory pipeline."""
    from supervisor.explore_structured import list_destinations

    return list_destinations(
        market=market,
        continent=continent,
        theme=theme,
        q=q,
    )


@app.get("/api/catalog/health")
async def catalog_health(markets: str | None = None):
    """Curator health: Explore + Packages catalogs and SPA page contracts."""
    from supervisor.catalog_curator.health import run_health

    market_list = [m.strip().upper() for m in (markets or "US,IN").split(",") if m.strip()]
    return run_health(markets=market_list)


@app.post("/api/catalog/daily")
async def catalog_daily(
    request: Request,
    markets: str | None = None,
    publish: bool = True,
    dry_run: bool = False,
):
    """Cron entrypoint: improve packages daily + verify Explore/Packages pages.

    Auth: header `X-Curator-Token` or `Authorization: Bearer …` must match
    env `CATALOG_CURATOR_TOKEN` (required in production).
    """
    import os

    from fastapi import HTTPException

    expected = (os.getenv("CATALOG_CURATOR_TOKEN") or "").strip()
    if not expected:
        if (os.getenv("APP_ENV") or "").lower() in ("production", "prod"):
            raise HTTPException(status_code=503, detail="CATALOG_CURATOR_TOKEN not configured")
    else:
        got = (request.headers.get("x-curator-token") or "").strip()
        auth = (request.headers.get("authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            got = got or auth[7:].strip()
        if not got or got != expected:
            raise HTTPException(status_code=401, detail="Invalid curator token")

    from supervisor.catalog_curator.agent import daily

    market_list = [m.strip().upper() for m in (markets or "US,IN,GB").split(",") if m.strip()]
    return daily(
        markets=market_list,
        publish=publish,
        dry_run=dry_run,
        save_report=not dry_run,
    )


@app.post("/api/catalog/demand")
async def catalog_demand(
    request: Request,
    city: str,
    country: str | None = None,
    market: str = "IN",
    publish: bool = True,
):
    """On-demand Gemini curate for a searched place (ops / admin).

    Example: POST /api/catalog/demand?city=Vrindavan&market=IN
    Auth: same as catalog daily (`X-Curator-Token` / CATALOG_CURATOR_TOKEN).
    """
    import os

    from fastapi import HTTPException

    expected = (
        os.getenv("CATALOG_CURATOR_TOKEN") or os.getenv("MARKETING_ADMIN_TOKEN") or ""
    ).strip()
    if not expected:
        if (os.getenv("APP_ENV") or "").lower() in ("production", "prod"):
            raise HTTPException(status_code=503, detail="CATALOG_CURATOR_TOKEN not configured")
    else:
        got = (request.headers.get("x-curator-token") or "").strip()
        auth = (request.headers.get("authorization") or "").strip()
        if auth.lower().startswith("bearer "):
            got = got or auth[7:].strip()
        if not got or got != expected:
            raise HTTPException(status_code=401, detail="Invalid curator token")

    from supervisor.demand_campaign import curate_place

    return curate_place(city, market=market, country=country, publish=publish)


@app.get("/api/packages/bookings/{booking_id}")
async def packages_booking(booking_id: str, email: str | None = None):
    """Lookup requires guest email to prevent IDOR on short PKG-* ids."""
    from supervisor.packages_structured import get_package_booking

    return get_package_booking(booking_id, email=email)


class PackageCancelRequest(BaseModel):
    email: str


@app.post("/api/packages/bookings/{booking_id}/cancel")
async def packages_cancel(booking_id: str, req: PackageCancelRequest, request: Request):
    """Cancel package stay/flight via LiteAPI and refund Itinero Stripe (pi_)."""
    from supervisor.loyalty_ledger import loyalty_on_booking_cancelled
    from supervisor.packages_structured import cancel_package

    mail = (req.email or "").strip()
    if not mail or "@" not in mail:
        raise HTTPException(status_code=400, detail="Valid guest email is required.")
    result = await cancel_package(booking_id=booking_id, email=mail)
    if not result.get("ok") and result.get("error") in {"not_found", "forbidden", "email_required"}:
        raise HTTPException(
            status_code=404 if result.get("error") == "not_found" else 403,
            detail=result.get("message") or result.get("error") or "Cancel failed.",
        )
    if result.get("ok"):
        await loyalty_on_booking_cancelled(
            booking_id=booking_id,
            reason="package_cancel_api",
        )
        result["loyalty"] = {"reversed": True}
        try:
            from supervisor.email_service import send_booking_cancellation

            await send_booking_cancellation(
                kind="package",
                to_email=mail,
                details={
                    "booking_ref": booking_id,
                    "booking_id": booking_id,
                    "status": "cancelled",
                    "loyalty_reversed": True,
                },
            )
        except Exception:
            traceback.print_exc()
    return result


@app.post("/api/packages/bookings/{booking_id}/send-email")
async def packages_send_email(booking_id: str, req: PackageSendEmailRequest):
    """Resend package confirmation with itinerary PDF (guest email must match booking)."""
    from supervisor.email_service import send_package_confirmation
    from supervisor.packages_structured import get_package_booking

    mail = (req.email or "").strip()
    if not mail or "@" not in mail:
        raise HTTPException(status_code=400, detail="Valid guest email is required.")

    lookup = get_package_booking(booking_id, email=mail)
    booking = lookup.get("booking")
    if not booking:
        err = lookup.get("error") or "not_found"
        raise HTTPException(
            status_code=404 if err == "not_found" else 403,
            detail=lookup.get("message") or "Booking not found.",
        )

    out = await send_package_confirmation(booking=booking)
    if not out.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=out.get("message") or "Could not send confirmation email.",
        )
    return {"ok": True, "channel": out.get("channel"), "bookingId": booking_id}


@app.post("/api/packages/book")
async def packages_book(req: PackageBookRequest, request: Request):
    """One-click package book — hotel hold/book + itinerary snapshot."""
    from supervisor.payment_guards import assert_mock_payment_allowed

    mock_block = assert_mock_payment_allowed(mock_payment=bool(req.mock_payment))
    if mock_block:
        raise HTTPException(
            status_code=400,
            detail=mock_block.get("message") or "Mock payment is disabled. Complete checkout.",
        )
    from supervisor.auth import user_from_token
    from supervisor.loyalty_ledger import (
        apply_redemption,
        loyalty_on_booking_confirmed,
        release_redemption,
        validate_redemption_for_checkout,
    )
    from supervisor.packages_structured import book_package

    user = user_from_token(_bearer_token(request))
    redemption = validate_redemption_for_checkout(
        redemption_id=req.loyalty_redemption_id,
        user_id=str(user["id"]) if user and user.get("id") else None,
    )
    if req.loyalty_redemption_id and not redemption.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=redemption.get("message") or redemption.get("error") or "Invalid points redemption.",
        )
    loyalty_discount = float(redemption.get("discountAmount") or 0) if redemption.get("applied") else 0.0

    result = await book_package(
        package_id=req.package_id,
        offer_id=req.offer_id,
        hotel_id=req.hotel_id,
        check_in=req.check_in,
        check_out=req.check_out,
        guests=req.guests,
        rooms=req.rooms,
        guest=req.guest,
        room_snapshot=req.room,
        hotel_snapshot=req.hotel,
        mock_payment=req.mock_payment,
        currency=req.currency or "INR",
        prebook_id=req.prebook_id,
        transaction_id=req.transaction_id,
        payment_provider=req.payment_provider,
        expected_amount=req.expected_amount,
        itinero_amount=req.itinero_amount,
        itinero_payment_id=req.itinero_payment_id,
        itinero_payment_provider=req.itinero_payment_provider,
        single_payment=bool(req.single_payment),
        flight_prebook_id=req.flight_prebook_id,
        flight_transaction_id=req.flight_transaction_id,
        flight_expected_amount=req.flight_expected_amount,
        flight_session_id=req.flight_session_id,
        flight_snapshot=req.flight,
        loyalty_discount=loyalty_discount,
    )

    if result.get("ok"):
        guest = req.guest if isinstance(req.guest, dict) else {}
        booking_id = str(result.get("bookingId") or result.get("booking_id") or "")
        if redemption.get("applied") and user and user.get("id") and booking_id:
            apply_redemption(
                redemption_id=str(redemption["redemptionId"]),
                user_id=str(user["id"]),
                booking_id=booking_id,
            )
        await loyalty_on_booking_confirmed(
            user_id=str(user["id"]) if user and user.get("id") else None,
            guest_email=guest.get("email"),
            booking_id=booking_id,
            booking_kind="package",
            amount=(float(req.itinero_amount or 0) + loyalty_discount) or None,
            currency=req.currency or "INR",
            check_out_date=req.check_out,
        )
    elif redemption.get("applied") and user and user.get("id"):
        release_redemption(
            redemption_id=str(redemption["redemptionId"]),
            user_id=str(user["id"]),
        )
    return result


class PackageFlightHoldRequest(BaseModel):
    package_id: str
    origin: str
    check_in: str
    check_out: str
    guests: int = 2
    currency: str = "INR"
    flight_offer_id: str | None = None
    guest: dict | None = None


@app.post("/api/packages/flight-hold")
async def packages_flight_hold(req: PackageFlightHoldRequest):
    """Hold package return flights on LiteAPI before checkout payment."""
    from supervisor.packages_structured import hold_package_flight

    return await hold_package_flight(
        package_id=req.package_id,
        origin=req.origin,
        check_in=req.check_in,
        check_out=req.check_out,
        guests=req.guests,
        currency=req.currency or "INR",
        flight_offer_id=req.flight_offer_id,
        guest=req.guest,
    )


@app.post("/api/packages/itinero-payment-intent")
async def packages_itinero_payment_intent(req: PackageItineroPaymentIntentRequest, request: Request):
    """Create a PaymentIntent on Itinero's Stripe account (flights / package share)."""
    from supervisor.auth import user_from_token
    from supervisor.loyalty_ledger import validate_redemption_for_checkout
    from supervisor.payment_routing import create_itinero_stripe_intent

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive.")

    user = user_from_token(_bearer_token(request))
    charge_amount = float(req.amount)
    discount_meta: dict[str, str] = {}
    if req.loyalty_redemption_id:
        redemption = validate_redemption_for_checkout(
            redemption_id=req.loyalty_redemption_id,
            user_id=str(user["id"]) if user and user.get("id") else None,
        )
        if not redemption.get("ok"):
            raise HTTPException(
                status_code=400,
                detail=redemption.get("message") or redemption.get("error") or "Invalid points redemption.",
            )
        discount = float(redemption.get("discountAmount") or 0)
        charge_amount = max(1.0, round(charge_amount - discount, 2))
        discount_meta = {
            "loyalty_redemption_id": str(redemption["redemptionId"]),
            "loyalty_discount": str(discount),
            "loyalty_points": str(redemption.get("points") or 0),
        }

    out = await create_itinero_stripe_intent(
        amount=charge_amount,
        currency=(req.currency or "INR").upper(),
        email=(req.email or "").strip() or None,
        metadata={
            "kind": "package_itinero",
            "package_id": req.package_id,
            "prebook_id": req.prebook_id or "",
            **discount_meta,
        },
    )
    if not out.get("ok"):
        raise HTTPException(
            status_code=502,
            detail=out.get("message") or "Could not create Itinero payment intent.",
        )
    if discount_meta:
        out["loyalty"] = {
            "redemptionId": discount_meta.get("loyalty_redemption_id"),
            "discountAmount": float(discount_meta.get("loyalty_discount") or 0),
            "points": int(discount_meta.get("loyalty_points") or 0),
            "chargeAmount": charge_amount,
            "originalAmount": float(req.amount),
        }
    return out


@app.get("/api/packages/{package_id}")
async def packages_detail(
    package_id: str,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    origin: str | None = None,
    variant: str | None = None,
):
    from supervisor.packages_structured import get_package

    return get_package(
        package_id,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        origin=origin,
        variant=variant,
    )


@app.get("/api/packages/{package_id}/quote")
async def packages_quote(
    package_id: str,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    rooms: int = 1,
    hotel_id: str | None = None,
    hotel_ids: str | None = None,
    origin: str | None = None,
    include_flights: bool = True,
    flight_offer_id: str | None = None,
    currency: str = "INR",
    variant: str | None = None,
    quote_mode: str = "full",
):
    """Live stay (+ optional flights) quote for a package instance."""
    from supervisor.packages_structured import quote_package
    import json as _json

    id_map = None
    if hotel_ids:
        try:
            parsed = _json.loads(hotel_ids)
            if isinstance(parsed, dict):
                id_map = {str(k): str(v) for k, v in parsed.items()}
        except Exception:
            id_map = None

    return await quote_package(
        package_id,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        rooms=rooms,
        hotel_id=hotel_id,
        hotel_ids=id_map,
        origin=origin,
        include_flights=include_flights,
        flight_offer_id=flight_offer_id,
        currency=currency or "INR",
        variant=variant,
        quote_mode=quote_mode or "full",
    )


@app.get("/api/packages/{package_id}/preview-day")
async def packages_preview_day(
    package_id: str,
    day: int,
    check_in: str,
    check_out: str,
    variant: str | None = None,
):
    from supervisor.packages_structured import preview_package_day

    return preview_package_day(
        package_id,
        day,
        check_in=check_in,
        check_out=check_out,
        variant=variant,
    )


@app.get("/api/packages/{package_id}/flights")
async def packages_flights(
    package_id: str,
    origin: str,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    currency: str = "INR",
    limit: int = 12,
):
    """Alternate return flights for package flight swap."""
    from supervisor.packages_structured import package_flights

    return await package_flights(
        package_id,
        origin=origin,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        currency=currency or "INR",
        limit=limit,
    )


@app.get("/api/packages/{package_id}/hotels")
async def packages_hotels(
    package_id: str,
    check_in: str | None = None,
    check_out: str | None = None,
    guests: int = 2,
    rooms: int = 1,
    currency: str = "INR",
    page: int = 1,
    page_size: int = 12,
    city: str | None = None,
):
    """Alternate hotels for package stay swap (pass city for multi-stay segments)."""
    from supervisor.packages_structured import package_hotels

    return await package_hotels(
        package_id,
        check_in=check_in,
        check_out=check_out,
        guests=guests,
        rooms=rooms,
        currency=currency or "INR",
        page=page,
        page_size=page_size,
        city=city,
    )


@app.get("/")
def root():
    return {
        "service": "Itinero Supervisor Gateway",
        "docs": "/docs",
        "health": "/api/health",
        "health_live": "/api/health/live",
        "health_ready": "/api/health/ready",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
