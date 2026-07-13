"""General Agent — architecture entry (Start → General Agent).

Policy: anything **flight / flight-booking** related is handed only to the Flight Agent
(LiteAPI + LLM). Hotel / train / bus are stubs and never steal an active flight booking.
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

from itinero.itinerary_planner import ItineraryPlanner
from itinero.models import OrchestratorInput, OrchestratorOutput

logger = get_logger(__name__)

RouteTarget = Literal[
    "flight",
    "hotel",
    "train",
    "bus",
    "general",
    "payment",
]


class GeneralRouteDecision(BaseModel):
    """What the General Agent should do with this user message."""

    target: RouteTarget = Field(
        description=(
            "flight = ALL flight search + booking work; "
            "hotel/train/bus = non-flight stubs only; "
            "payment = pay during flight booking; "
            "general = greeting only"
        )
    )
    reason: str = Field(default="")


# --- Flight / booking domain (Flight Agent only) ---
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
_TRANSPORT_WORD = r"train|trains|bus|buses|flight|flights|hotel|hotels"
_ROUTE_DATE = re.compile(
    rf"\b(?!{_TRANSPORT_WORD}\b)([A-Za-z]{{3,}})\s+to\s+(?!{_TRANSPORT_WORD}\b)([A-Za-z]{{3,}})\b",
    re.I,
)
_FLIGHT_BOOK_HINT = re.compile(
    r"\b(book\s+(a\s+)?flight|flight\s+book|air\s*ticket|airfare|flight\s+ticket)\b",
    re.I,
)

# --- Non-flight (stubs only; never during active flight booking) ---
_HOTEL_HINT = re.compile(r"\b(hotel|hotels|resort|check[- ]?in)\b", re.I)
_TRAIN_HINT = re.compile(r"\b(train|trains|railway|irctc)\b", re.I)
_BUS_HINT = re.compile(r"\b(bus|buses|volvo|redbus)\b", re.I)

_GENERAL_SYSTEM = """You are the General Agent for Itinero.

ONLY route to:
- flight: EVERY flight-related OR booking-related message (search, options, passengers,
  traveler details, hold, pay, PNR, cancel, fare questions). Flight Agent does ALL of this.
- payment: same as flight (pay / issue ticket) — still Flight Agent
- hotel / train / bus: ONLY when user clearly wants that mode alone (no flight booking)
- general: ONLY hi / thanks with no travel content

HARD RULE: booking = Flight Agent. Never send booking steps to hotel/train/bus.
When unsure → flight.
"""


class GeneralAgent:
    """
    Architecture hub:

      Start → General Agent
                ↓  (flight / booking only)
            Itinerary Planner → Travel Agent → Flight Booking → Payment
    """

    def __init__(
        self,
        *,
        planner: ItineraryPlanner | None = None,
        nlp: FlightNLP | None = None,
    ) -> None:
        self._settings = get_settings()
        self._nlp = nlp or FlightNLP(self._settings)
        self._planner = planner or ItineraryPlanner()

    @property
    def planner(self) -> ItineraryPlanner:
        return self._planner

    async def aclose(self) -> None:
        await self._planner.aclose()

    def _session_active_flight(self, session: SessionContext) -> bool:
        """Any in-progress flight search/book/pay/cancel stays on Flight Agent."""
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
            or session.search_context
        )

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

        # 1) Active flight booking session → Flight Agent only (ignore hotel/train drift)
        if self._session_active_flight(session):
            return "flight"

        # 2) Explicit non-flight modes (only when not an active flight booking)
        if _TRAIN_HINT.search(text) and not re.search(r"\bflights?\b", text, re.I):
            return "train"
        if _BUS_HINT.search(text) and not re.search(r"\bflights?\b", text, re.I):
            return "bus"
        if _HOTEL_HINT.search(text) and not re.search(r"\bflights?\b", text, re.I):
            return "hotel"

        # 3) Any flight / booking language → Flight Agent
        if self._is_flight_or_booking(text):
            return "flight"

        lower = text.lower()
        if lower in {"hi", "hello", "hey", "hii", "thanks", "thank you"}:
            return "general"

        # 4) Default → Flight Agent (asks for route/date via LiteAPI flow)
        if len(text.split()) >= 2:
            return "flight"
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
            if decision.target in {"general", "hotel", "train", "bus"} and self._is_flight_or_booking(
                message
            ):
                return GeneralRouteDecision(target="flight", reason="force_flight_booking")
            if decision.target == "payment":
                return GeneralRouteDecision(target="flight", reason="payment_via_flight")
            return decision
        except Exception as exc:
            logger.warning("general_agent_classify_failed", error=str(exc))
            return GeneralRouteDecision(target="flight", reason="fallback_flight")

    def _general_reply(self) -> str:
        return (
            "Hi — I'm your **Itinero** assistant.\n\n"
            "**Flight search and booking** are fully connected "
            "(live data → choose → travelers → hold → pay).\n\n"
            "Try: **Mumbai to Delhi on 26 July**"
        )

    def _non_flight_stub(self, mode: str) -> str:
        return (
            f"**{mode.title()}** is not available in this build.\n\n"
            "I only complete **flight** search and booking right now.\n"
            "Example: **Hyderabad to Mumbai on 15 July**"
        )

    async def run(self, input_data: OrchestratorInput) -> OrchestratorOutput:
        """Flight/booking → Flight Agent only; other modes are short stubs."""
        session = input_data.session_context or SessionContext()
        path = ["start", "general_agent"]

        decision = await self._classify(input_data.message, session)
        # Collapse payment into flight path (same Flight Agent)
        target = "flight" if decision.target == "payment" else decision.target

        logger.info(
            "general_agent_route",
            target=target,
            reason=decision.reason,
            active_flight=self._session_active_flight(session),
        )

        if target == "flight":
            out = await self._planner.plan_flight(
                message=input_data.message,
                session=session,
                history=input_data.history,
                session_id=input_data.session_id,
                path_prefix=path,
            )
            logger.info(
                "flight_agent_only_handoff",
                routed_to=out.routed_to,
                booking_ready=out.booking_ready,
                payment_ready=out.payment_ready,
                has_offers=len(out.session_context.last_search_results or []),
                intent=out.intent.value if out.intent else None,
            )
            return out

        if target == "hotel":
            path.extend(["itinerary_planner", "hotel_agent"])
            return OrchestratorOutput(
                response=self._non_flight_stub("hotel"),
                intent=FlightIntent.GENERAL,
                session_context=session,
                route_path=path,
                routed_to="hotel_agent",
            )

        if target in {"train", "bus"}:
            path.extend(["itinerary_planner", "travel_agent", f"{target}_booking"])
            return OrchestratorOutput(
                response=self._non_flight_stub(target),
                intent=FlightIntent.GENERAL,
                session_context=session,
                route_path=path,
                routed_to=f"{target}_booking",
            )

        return OrchestratorOutput(
            response=self._general_reply(),
            intent=FlightIntent.GENERAL,
            session_context=session,
            route_path=path,
            routed_to="general_agent",
        )
