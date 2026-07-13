"""Travel Agent — Flight / Train / Bus booking specialist (diagram box)."""

from __future__ import annotations

from flight_agent import FlightAgent, FlightAgentInput, FlightAgentOutput, SessionContext
from flight_agent.logging_config import get_logger
from flight_agent.models.intents import FlightIntent

logger = get_logger(__name__)


class TravelAgent:
    """
    Travel Agent under Itinerary Planner.

    Diagram: Travel Agent → Flight Booking | Train Booking | Bus Booking

    **Only Flight Booking is implemented** (LiteAPI + LLM).
    Train / Bus are not available — callers get a clear stub.
    All flight search + booking work stays on FlightAgent.
    """

    def __init__(self, flight_agent: FlightAgent | None = None) -> None:
        self._flight = flight_agent or FlightAgent()

    @property
    def flight_agent(self) -> FlightAgent:
        return self._flight

    async def aclose(self) -> None:
        await self._flight.aclose()

    async def run_flight(
        self,
        *,
        message: str,
        session: SessionContext,
        history: list[dict[str, str]] | None = None,
        session_id: str | None = None,
    ) -> FlightAgentOutput:
        """Only entry for flight search + booking (LiteAPI)."""
        logger.info("travel_agent_flight_only", mode="flight_booking")
        return await self._flight.run(
            FlightAgentInput(
                message=message,
                session_id=session_id,
                session_context=session,
                history=history or [],
            )
        )

    def stub_train_or_bus(self, mode: str) -> str:
        label = "trains" if mode == "train" else "buses"
        return (
            f"**{label.title()}** are not connected.\n\n"
            "I only do **flight** search and booking. "
            "Try: **Mumbai to Delhi on 26 July**."
        )

    def unsupported_mode_reply(self, mode: str) -> FlightAgentOutput:
        text = self.stub_train_or_bus(mode)
        return FlightAgentOutput(
            response=text,
            intent=FlightIntent.GENERAL,
            session_context=SessionContext(),
            needs_follow_up=True,
        )
