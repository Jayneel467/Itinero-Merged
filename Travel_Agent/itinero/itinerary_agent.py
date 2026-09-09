"""Itinerary Agent — sits between General Agent and Flight / Hotel specialists.

Diagram:
  General Agent
       ↓
  Itinerary Agent
       ├─→ Travel Agent → Flight Agent
       └─→ Hotel Agent
"""

from __future__ import annotations

from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from itinero.hotel_agent import HotelAgent
from itinero.models import OrchestratorOutput
from itinero.travel_agent import TravelAgent

logger = get_logger(__name__)


class ItineraryAgent:
    """
    Trip coordinator.

    General Agent talks to this agent for travel work.
    This agent then calls Flight (via Travel Agent) or Hotel Agent.
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
    ) -> OrchestratorOutput:
        """Itinerary → Hotel Agent."""
        path = list(path_prefix or [])
        path.append("itinerary_agent")

        logger.info("itinerary_agent_call", target="hotel_agent")
        return await self._hotel.run(
            message=message,
            session=session,
            path_prefix=path,
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
        Full trip ask — Itinerary Agent coordinates specialists.

        Today: explain the plan and offer flight + hotel handoffs.
        Flight and hotel are still reached through the same agents.
        """
        path = list(path_prefix or [])
        path.append("itinerary_agent")

        logger.info("itinerary_agent_call", target="trip_plan")

        # If the trip message is clearly flight-first, go straight to Flight Agent.
        lower = (message or "").lower()
        if any(w in lower for w in ("flight", "fly", "airport", " to ")) and "hotel" not in lower:
            return await self.plan_flight(
                message=message,
                session=session,
                history=history,
                session_id=session_id,
                path_prefix=path_prefix,
            )
        if "hotel" in lower or "resort" in lower or "stay" in lower:
            hotel_out = await self.plan_hotel(
                message=message,
                session=session,
                path_prefix=path_prefix,
            )
            return hotel_out

        return OrchestratorOutput(
            response=(
                "I can build a **trip plan** with you.\n\n"
                "- **Flights** — say a route and date (e.g. *Mumbai to Delhi on 26 July*)\n"
                "- **Hotels** — say the city and check-in dates\n\n"
                "Tell me which you want first, or both."
            ),
            intent=FlightIntent.GENERAL,
            session_context=session,
            route_path=path,
            routed_to="itinerary_agent",
        )

    # Back-compat name used by older callers / tests
    def hotel_stub(self, path_prefix: list[str] | None = None) -> OrchestratorOutput:
        path = list(path_prefix or [])
        path.extend(["itinerary_agent", "hotel_agent"])
        return OrchestratorOutput(
            response=(
                "Hotel booking is on the itinerary roadmap but not connected yet.\n\n"
                "I can book **flights** for you now — e.g. **Hyderabad to Mumbai on 15 July**."
            ),
            intent=FlightIntent.GENERAL,
            session_context=SessionContext(),
            route_path=path,
            routed_to="hotel_agent",
        )


# Alias: older code imported ItineraryPlanner
ItineraryPlanner = ItineraryAgent
