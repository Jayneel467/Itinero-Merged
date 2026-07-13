"""Itinerary Planner — sits between General Agent and Travel / Hotel agents."""

from __future__ import annotations

from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from itinero.models import OrchestratorOutput
from itinero.travel_agent import TravelAgent

logger = get_logger(__name__)


class ItineraryPlanner:
    """
    Diagram: General Agent ↔ Itinerary Planner ↔ Travel Agent / Hotel Agent.

    For flight search & booking requests, forwards to Travel Agent → Flight Booking.
    """

    def __init__(self, travel_agent: TravelAgent | None = None) -> None:
        self._travel = travel_agent or TravelAgent()

    @property
    def travel_agent(self) -> TravelAgent:
        return self._travel

    async def aclose(self) -> None:
        await self._travel.aclose()

    async def plan_flight(
        self,
        *,
        message: str,
        session: SessionContext,
        history: list[dict[str, str]] | None = None,
        session_id: str | None = None,
        path_prefix: list[str] | None = None,
    ) -> OrchestratorOutput:
        """Route flight portion of the itinerary to Travel Agent → Flight Booking."""
        path = list(path_prefix or [])
        path.append("itinerary_planner")
        path.append("travel_agent")
        path.append("flight_booking")

        logger.info("itinerary_planner_delegate", target="flight_booking")
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
        payment_ready = bool(
            session_out.awaiting_payment_confirmation
            or (session_out.prebook_id and not session_out.booking_id)
        )
        if payment_ready or session_out.booking_id:
            path.append("payment")

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

    def hotel_stub(self, path_prefix: list[str] | None = None) -> OrchestratorOutput:
        path = list(path_prefix or [])
        path.extend(["itinerary_planner", "hotel_agent"])
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
