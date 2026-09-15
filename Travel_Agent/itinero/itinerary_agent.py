"""Itinerary Agent — between General Agent and Flight / Hotel specialists.

  General Agent
       ↓
  Itinerary Agent
       ├─→ Travel Agent → Flight Agent
       └─→ Hotel Agent
"""

from __future__ import annotations

import re

from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from itinero.hotel_agent import HotelAgent
from itinero.models import OrchestratorOutput
from itinero.travel_agent import TravelAgent

logger = get_logger(__name__)

_FLIGHT_WORD = re.compile(r"\b(flight|flights|fly|flying|airport|airline|air\s*ticket)\b", re.I)
_HOTEL_WORD = re.compile(r"\b(hotel|hotels|resort|stay|accommodation|check[- ]?in)\b", re.I)
_ROUTE = re.compile(
    r"\b([A-Za-z][A-Za-z\s]{1,20}?)\s+to\s+([A-Za-z][A-Za-z\s]{1,20}?)\b",
    re.I,
)
_TRIP_DEST = re.compile(
    r"\b(?:trip|vacation|holiday|itinerary|visit|travel)\s+to\s+([A-Za-z][A-Za-z\s]{1,24})\b"
    r"|\bplan\s+(?:a\s+|my\s+|the\s+)?(?:trip|vacation|holiday)\s+(?:to\s+|in\s+)([A-Za-z][A-Za-z\s]{1,24})\b"
    r"|\bin\s+([A-Za-z][A-Za-z\s]{1,24})\s+for\s+\d+",
    re.I,
)


class ItineraryAgent:
    """
    Trip coordinator.

    General Agent hands travel work here.
    This agent calls Flight (via Travel Agent) and/or Hotel Agent.
    """

    def __init__(
        self,
        travel_agent: TravelAgent | None = None,
        hotel_agent: HotelAgent | None = None,
    ) -> None:
        self._travel = travel_agent or TravelAgent()
        self._hotel = hotel_agent or HotelAgent()

    @property
    def travel_agent(self) -> TravelAgent:
        return self._travel

    @property
    def hotel_agent(self) -> HotelAgent:
        return self._hotel

    @property
    def flight_agent(self):
        return self._travel.flight_agent

    async def aclose(self) -> None:
        await self._travel.aclose()
        await self._hotel.aclose()

    async def plan_flight(
        self,
        *,
        message: str,
        session: SessionContext,
        history: list[dict[str, str]] | None = None,
        session_id: str | None = None,
        path_prefix: list[str] | None = None,
    ) -> OrchestratorOutput:
        """Itinerary → Travel Agent → Flight Agent."""
        path = list(path_prefix or [])
        path.append("itinerary_agent")
        path.append("travel_agent")
        path.append("flight_booking")

        logger.info("itinerary_agent_call", target="flight_agent")
        out = await self._travel.run_flight(
            message=message,
            session=session,
            history=history,
            session_id=session_id,
        )
        session_out = out.session_context
        booking_ready = bool(
            session_out.awaiting_booking_confirmation
            or session_out.prebook_id
            or session_out.awaiting_payment_confirmation
            or session_out.booking_id
        )
        payment_ready = bool(session_out.prebook_id and not session_out.booking_id)
        if payment_ready:
            path.append("checkout")

        return OrchestratorOutput(
            response=out.response,
            intent=out.intent,
            session_context=session_out,
            route_path=path,
            routed_to="flight_booking",
            booking_ready=booking_ready,
            payment_ready=payment_ready,
            operation_result=out.operation_result,
            error=out.error,
        )

    async def plan_hotel(
        self,
        *,
        message: str,
        session: SessionContext,
        path_prefix: list[str] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> OrchestratorOutput:
        """Itinerary → Hotel Agent."""
        path = list(path_prefix or [])
        path.append("itinerary_agent")

        logger.info("itinerary_agent_call", target="hotel_agent")
        return await self._hotel.run(
            message=message,
            session=session,
            path_prefix=path,
            history=history,
        )

    async def plan_trip(
        self,
        *,
        message: str,
        session: SessionContext,
        history: list[dict[str, str]] | None = None,
        session_id: str | None = None,
        path_prefix: list[str] | None = None,
    ) -> OrchestratorOutput:
        """
        Full trip ask — Itinerary calls Flight and/or Hotel specialists.
        """
        path = list(path_prefix or [])
        path.append("itinerary_agent")
        text = message or ""
        lower = text.lower()
        logger.info("itinerary_agent_call", target="trip_plan")

        wants_flight = bool(_FLIGHT_WORD.search(text))
        wants_hotel = bool(_HOTEL_WORD.search(text))
        route = _ROUTE.search(text)
        # "Mumbai to Delhi" is a flight route; "trip to Goa" is a destination
        trip_dest_m = _TRIP_DEST.search(text)
        trip_dest = None
        if trip_dest_m:
            trip_dest = (
                trip_dest_m.group(1) or trip_dest_m.group(2) or trip_dest_m.group(3) or ""
            ).strip()
            trip_dest = re.sub(r"\s+(for|with|and)\b.*$", "", trip_dest, flags=re.I).strip()

        # Both specialists requested → Flight first when route present, else Hotel then note flights
        if wants_flight and wants_hotel:
            if route and not trip_dest:
                flight_out = await self.plan_flight(
                    message=message,
                    session=session,
                    history=history,
                    session_id=session_id,
                    path_prefix=path_prefix,
                )
                flight_out.response = (
                    flight_out.response
                    + "\n\n---\nAfter the flight, I can also help with **hotels** — "
                    "tell me the city and check-in dates."
                )
                if "itinerary_agent" not in (flight_out.route_path or []):
                    flight_out.route_path = path + list(flight_out.route_path or [])
                return flight_out
            hotel_out = await self.plan_hotel(
                message=message,
                session=session,
                path_prefix=path_prefix,
                history=history,
            )
            hotel_out.response = (
                hotel_out.response
                + "\n\n---\nI can book **flights** too — e.g. *Mumbai to Delhi on 26 July*."
            )
            return hotel_out

        if wants_hotel and not wants_flight:
            return await self.plan_hotel(
                message=message,
                session=session,
                path_prefix=path_prefix,
                history=history,
            )

        # Explicit flight wording or clear A→B route (not "trip to X")
        if wants_flight or (route and not trip_dest):
            return await self.plan_flight(
                message=message,
                session=session,
                history=history,
                session_id=session_id,
                path_prefix=path_prefix,
            )

        # Destination trip (e.g. plan a trip to Goa) → Hotel Agent for stay, mention flights
        if trip_dest:
            hotel_msg = f"hotels in {trip_dest}"
            hotel_out = await self.plan_hotel(
                message=hotel_msg,
                session=session,
                path_prefix=path_prefix,
                history=history,
            )
            hotel_out.response = (
                f"Let's plan your trip to **{trip_dest.title()}**.\n\n"
                + hotel_out.response
                + f"\n\n---\nFor **flights**, tell me where you're flying from "
                f"(e.g. *Mumbai to {trip_dest.title()} on 26 July*)."
            )
            hotel_out.routed_to = "itinerary_agent"
            hotel_out.route_path = path + ["hotel_agent"]
            return hotel_out

        return OrchestratorOutput(
            response=(
                "I can build a **trip plan** with you.\n\n"
                "- **Flights** — say a route and date (e.g. *Mumbai to Delhi on 26 July*)\n"
                "- **Hotels** — say the city and check-in dates (e.g. *hotels in Goa*)\n"
                "- **Both** — e.g. *plan a trip to Goa with flights and hotels*\n\n"
                "What would you like to start with?"
            ),
            intent=FlightIntent.GENERAL,
            session_context=session,
            route_path=path,
            routed_to="itinerary_agent",
        )

    def hotel_stub(self, path_prefix: list[str] | None = None) -> OrchestratorOutput:
        """Back-compat; prefer plan_hotel()."""
        path = list(path_prefix or [])
        path.extend(["itinerary_agent", "hotel_agent"])
        return OrchestratorOutput(
            response=(
                "I can help with **hotels** — tell me the city and dates.\n\n"
                "Example: *hotels in Goa from 12 August to 15 August*"
            ),
            intent=FlightIntent.GENERAL,
            session_context=SessionContext(),
            route_path=path,
            routed_to="hotel_agent",
        )


ItineraryPlanner = ItineraryAgent
