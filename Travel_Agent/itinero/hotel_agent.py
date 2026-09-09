"""Hotel Agent — hotel search / stay specialist under Itinerary Agent."""

from __future__ import annotations

from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from itinero.models import OrchestratorOutput

logger = get_logger(__name__)


class HotelAgent:
    """
    Hotel specialist.

    Called by Itinerary Agent (not directly by General Agent in the happy path).
    Live hotel APIs can plug in here later; for now the reply is clear and honest.
    """

    async def aclose(self) -> None:
        return None

    async def run(
        self,
        *,
        message: str,
        session: SessionContext,
        path_prefix: list[str] | None = None,
    ) -> OrchestratorOutput:
        """Handle a hotel / stay request."""
        path = list(path_prefix or [])
        if "hotel_agent" not in path:
            path.append("hotel_agent")

        logger.info("hotel_agent_run", message_preview=(message or "")[:60])
        return OrchestratorOutput(
            response=(
                "I can help plan **hotels** as part of your trip.\n\n"
                "Full hotel search in this chat is still being connected. "
                "For stays right now, use **Manual booking** on the site.\n\n"
                "I *can* book **flights** here — e.g. **Mumbai to Delhi on 26 July**."
            ),
            intent=FlightIntent.GENERAL,
            session_context=session,
            route_path=path,
            routed_to="hotel_agent",
        )
