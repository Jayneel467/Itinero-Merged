"""General Agent — first stop for every user message (router only).

Does **not** search flights or hotels itself.

Talks to:
  • Itinerary Agent  → trip plans (Itinerary then calls Hotel / Flight)
  • Itinerary Agent  → flights   (Itinerary → Travel → Flight Agent)
  • Itinerary Agent  → hotels    (Itinerary → Hotel Agent)

Conversation handoff for flights:
  User: "Mumbai to Delhi"
    → General → Itinerary → Flight Agent asks date
  User: "26 July"
    → Flight Agent searches and lists options
  User: "option 1"
    → Flight Agent asks passenger count
  Then traveler details → extras → fare hold (payment = backend checkout)
"""

from __future__ import annotations

import re
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from flight_agent.config import get_settings
from flight_agent.llm.nlp import FlightNLP
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from itinero.itinerary_agent import ItineraryAgent
from itinero.models import OrchestratorInput, OrchestratorOutput

logger = get_logger(__name__)

RouteTarget = Literal[
    "flight",
    "hotel",
    "itinerary",
    "train",
    "bus",
    "general",
    "payment",
]


class GeneralRouteDecision(BaseModel):
    """What the General Agent should do with this user message."""

    target: RouteTarget = Field(
        description=(
            "flight = flight search + hold via Itinerary → Flight Agent; "
            "hotel = stays via Itinerary → Hotel Agent; "
            "itinerary = full trip plan via Itinerary Agent; "
            "train/bus = not live yet; "
            "payment = still flight path (checkout is backend); "
            "general = greeting / food / non-booking chat"
        )
    )
    reason: str = Field(default="")


# --- Flight / booking domain ---
_FLIGHT_HINT = re.compile(
    r"\b(flight|flights|fly|flying|airport|airline|airlines|pnr|boarding|"
    r"mumbai|delhi|hyderabad|bangalore|bengaluru|chennai|kolkata|"
    r"pune|ahmedabad|jaipur|kochi|cochin|lucknow|chandigarh|indore|"
    r"nagpur|varanasi|patna|guwahati|srinagar|amritsar|dubai|singapore|"
    r"option\s*\d+|adults?|children|infants?|passenger|traveller|traveler|"
    r"prebook|cancel\s+booking|retrieve\s+booking|my\s+booking)\b",
    re.I,
)
_IATA_HINT = re.compile(r"\b(BOM|DEL|HYD|BLR|MAA|CCU|AMD|GOI|PNQ|IXC|IXB|JAI|COK|LKO)\b")
_BOOKING_HINT = re.compile(
    r"\b("
    r"book|booking|booked|ticket|tickets|fare|fares|price|prices|"
    r"confirm|yes|hold|pay|payment|card|stripe|issue\s+ticket|"
    r"seat|seats|baggage|luggage|extras?|skip|none|"
    r"passport|aadhaar|aadhar|dob|date\s+of\s+birth|gender|"
    r"email|phone|passenger|traveller|traveler|"
    r"cheapest|non[- ]?stop|direct|morning|evening|"
    r"indigo|akasa|spice|vistara|air\s*india|"
    r"retrieve|cancel|status|pnr|refund"
    r")\b",
    re.I,
)
_TRANSPORT_WORD = r"train|trains|bus|buses|flight|flights|hotel|hotels|eat|eats|eating"
_ROUTE_DATE = re.compile(
    rf"\b(?!{_TRANSPORT_WORD}\b|where|what|how|when|whom)([A-Za-z]{{3,}})\s+to\s+"
    rf"(?!{_TRANSPORT_WORD}\b|eat|eats|eating|do|be|go)([A-Za-z]{{3,}})\b",
    re.I,
)
_FOOD_HINT = re.compile(
    r"\b(restaurant|food|eat|eating|breakfast|lunch|dinner|cuisine|where\s+to\s+eat|"
    r"what\s+to\s+eat|locho|thali)\b",
    re.I,
)
_FLIGHT_BOOK_HINT = re.compile(
    r"\b(book\s+(a\s+)?flight|flight\s+book|air\s*ticket|airfare|flight\s+ticket)\b",
    re.I,
)
_ITINERARY_HINT = re.compile(
    r"\b("
    r"itinerary|trip\s+plan|plan\s+(?:a\s+|my\s+|the\s+)?trip|"
    r"full\s+trip|vacation\s+plan|day[- ]?by[- ]?day|"
    r"(?:make|build|create|plan)\s+(?:me\s+)?(?:a\s+|an\s+|my\s+)?(?:trip|itinerary)"
    r")\b",
    re.I,
)
_GREETING = re.compile(
    r"^\s*(hi|hello|hey|hii|hola|namaste|thanks|thank\s+you|thx|ok|okay|bye)\s*[!.]*\s*$",
    re.I,
)
_HELP_HINT = re.compile(r"\b(help|what\s+can\s+you\s+do|how\s+do\s+you\s+work)\b", re.I)

# --- Non-flight ---
_HOTEL_HINT = re.compile(r"\b(hotel|hotels|resort|check[- ]?in|stay|accommodation)\b", re.I)
_TRAIN_HINT = re.compile(r"\b(train|trains|railway|irctc)\b", re.I)
_BUS_HINT = re.compile(r"\b(bus|buses|volvo|redbus)\b", re.I)

_GENERAL_SYSTEM = """You are Vero's internal chat router on Itinero (never tell the user this).

ONLY route to:
- flight: flight search / booking (Itinerary → Flight Agent)
- hotel: hotel / stay (Itinerary → Hotel Agent)
- itinerary: full trip plan (Itinerary Agent, which may call Hotel + Flight)
- payment: still flight path (checkout is backend)
- train / bus: only when user clearly wants that mode alone
- general: hi / thanks / food / help with no booking action

HARD RULE: deep flight booking (selected offer, travelers, prebook) stays on flight.
When unsure between flight and general for a short travel phrase → flight.
"""


class GeneralAgent:
    """
    Architecture hub (readable handoffs only):

      Start → General Agent
                ├─ flight     → Itinerary Agent → Flight Agent
                ├─ hotel      → Itinerary Agent → Hotel Agent
                ├─ itinerary  → Itinerary Agent → (Hotel + Flight as needed)
                └─ general    → short helpful reply
    """

    def __init__(
        self,
        *,
        planner: ItineraryAgent | None = None,
        nlp: FlightNLP | None = None,
    ) -> None:
        self._settings = get_settings()
        self._nlp = nlp or FlightNLP(self._settings)
        self._planner = planner or ItineraryAgent()

    @property
    def planner(self) -> ItineraryAgent:
        """Itinerary Agent (coordinates Flight + Hotel)."""
        return self._planner

    async def aclose(self) -> None:
        await self._planner.aclose()

    def _session_deep_flight(self, session: SessionContext) -> bool:
        """Mid booking — do not interrupt with hotel/itinerary."""
        return bool(
            session.last_search_results
            or session.verified_offer_id
            or session.prebook_id
            or session.booking_id
            or session.selected_offer_index is not None
            or session.selected_offer_id
            or session.awaiting_booking_confirmation
            or session.awaiting_payment_confirmation
            or session.awaiting_cancel_confirmation
            or session.awaiting_service_preference
            or session.travelers_draft
            or session.passengers_confirmed
        )

    def _session_active_flight(self, session: SessionContext) -> bool:
        """Soft sticky: route/date draft OR deep booking."""
        return self._session_deep_flight(session) or bool(session.search_context)

    def _is_flight_or_booking(self, text: str) -> bool:
        return bool(
            _FLIGHT_HINT.search(text)
            or _IATA_HINT.search(text)
            or _ROUTE_DATE.search(text)
            or _FLIGHT_BOOK_HINT.search(text)
            or _BOOKING_HINT.search(text)
        )

    def _heuristic_route(self, message: str, session: SessionContext) -> RouteTarget | None:
        text = message.strip()

        # Deep flight booking always stays on Flight Agent
        if self._session_deep_flight(session):
            return "flight"

        if _FOOD_HINT.search(text) and not _FLIGHT_HINT.search(text) and not _IATA_HINT.search(text):
            return "general"

        if _TRAIN_HINT.search(text) and not re.search(r"\bflights?\b", text, re.I):
            return "train"
        if _BUS_HINT.search(text) and not re.search(r"\bflights?\b", text, re.I):
            return "bus"

        # Soft search_context only — hotel / trip plan may interrupt
        if _ITINERARY_HINT.search(text):
            return "itinerary"

        if _HOTEL_HINT.search(text) and not re.search(r"\bflights?\b", text, re.I):
            return "hotel"

        if _GREETING.search(text) or _HELP_HINT.search(text):
            return "general"

        # Soft sticky: continue flight (date / passengers after "Mumbai to Delhi")
        if self._session_active_flight(session):
            return "flight"

        if self._is_flight_or_booking(text):
            return "flight"

        # Short unclear multi-word → prefer flight (route phrases)
        if len(text.split()) >= 2 and _ROUTE_DATE.search(text):
            return "flight"

        if len(text.split()) >= 2:
            return "general"

        return None

    async def _classify(self, message: str, session: SessionContext) -> GeneralRouteDecision:
        heuristic = self._heuristic_route(message, session)
        if heuristic is not None:
            return GeneralRouteDecision(target=heuristic, reason="heuristic")

        try:
            structured = self._nlp.llm.with_structured_output(GeneralRouteDecision)
            result = await structured.ainvoke(
                [
                    SystemMessage(content=_GENERAL_SYSTEM),
                    HumanMessage(content=message),
                ]
            )
            decision = (
                result
                if isinstance(result, GeneralRouteDecision)
                else GeneralRouteDecision.model_validate(result)
            )
            if decision.target in {"general", "hotel", "train", "bus", "itinerary"} and self._is_flight_or_booking(
                message
            ):
                return GeneralRouteDecision(target="flight", reason="force_flight_booking")
            if decision.target == "payment":
                return GeneralRouteDecision(target="flight", reason="payment_via_flight")
            return decision
        except Exception as exc:
            logger.warning("general_agent_classify_failed", error=str(exc))
            return GeneralRouteDecision(target="flight", reason="fallback_flight")

    def _general_reply(self, message: str = "") -> str:
        text = (message or "").strip()
        if _FOOD_HINT.search(text):
            return (
                "I don't book restaurants yet — but I can help with **flights**, **hotels**, "
                "or a **trip plan**.\n\n"
                "Try: *Mumbai to Delhi on 26 July*, *hotels in Goa*, or *plan a trip to Goa*."
            )
        if _HELP_HINT.search(text):
            return (
                "I'm **Vero**. I can:\n\n"
                "- **Flights** — e.g. *Mumbai to Delhi on 26 July*\n"
                "- **Hotels** — e.g. *hotels in Goa from 12 Aug to 15 Aug*\n"
                "- **Trip plans** — e.g. *plan a trip to Goa*\n\n"
                "What would you like to do?"
            )
        if re.search(r"\b(thanks|thank\s+you|thx)\b", text, re.I):
            return "You're welcome! Ping me anytime for flights, hotels, or a trip plan."
        return (
            "Hey — I'm **Vero**. For **flights**, try: **Mumbai to Delhi on 26 July**.\n\n"
            "Or ask for a **trip plan** or **hotels** — I'll hand you to the right specialist."
        )

    def _non_flight_stub(self, mode: str) -> str:
        labels = {"train": "Trains", "bus": "Buses"}
        label = labels.get(mode, mode.title())
        return (
            f"**{label}** aren't live in this chat yet — sorry about that.\n\n"
            "I *can* help with **flights**, **hotels**, or a **trip plan**. "
            "Example: **Hyderabad to Mumbai on 15 July**"
        )

    async def run(self, input_data: OrchestratorInput) -> OrchestratorOutput:
        """Route to Itinerary / Flight / Hotel specialists — do not search here."""
        session = input_data.session_context or SessionContext()
        path = ["start", "general_agent"]

        decision = await self._classify(input_data.message, session)
        target = "flight" if decision.target == "payment" else decision.target

        logger.info(
            "general_agent_route",
            target=target,
            reason=decision.reason,
            deep_flight=self._session_deep_flight(session),
            active_flight=self._session_active_flight(session),
        )

        # Flight → Itinerary Agent → Flight Agent
        if target == "flight":
            out = await self._planner.plan_flight(
                message=input_data.message,
                session=session,
                history=input_data.history,
                session_id=input_data.session_id,
                path_prefix=path,
            )
            logger.info(
                "general_to_flight",
                routed_to=out.routed_to,
                booking_ready=out.booking_ready,
                has_offers=len(out.session_context.last_search_results or []),
            )
            return out

        # Hotel → Itinerary Agent → Hotel Agent
        if target == "hotel":
            out = await self._planner.plan_hotel(
                message=input_data.message,
                session=session,
                path_prefix=path,
                history=input_data.history,
            )
            logger.info("general_to_hotel", routed_to=out.routed_to)
            return out

        # Trip plan → Itinerary Agent (may call Hotel + Flight)
        if target == "itinerary":
            out = await self._planner.plan_trip(
                message=input_data.message,
                session=session,
                history=input_data.history,
                session_id=input_data.session_id,
                path_prefix=path,
            )
            logger.info("general_to_itinerary", routed_to=out.routed_to)
            return out

        if target in {"train", "bus"}:
            path.extend(["itinerary_agent", "travel_agent", f"{target}_booking"])
            return OrchestratorOutput(
                response=self._non_flight_stub(target),
                intent=FlightIntent.GENERAL,
                session_context=session,
                route_path=path,
                routed_to=f"{target}_booking",
            )

        return OrchestratorOutput(
            response=self._general_reply(input_data.message),
            intent=FlightIntent.GENERAL,
            session_context=session,
            route_path=path,
            routed_to="general_agent",
        )
