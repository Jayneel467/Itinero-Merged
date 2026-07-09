"""Travel Agent — routes flight search and booking to the Flight sub-agent."""

from __future__ import annotations

from flight_agent import FlightAgent, FlightAgentInput
from flight_agent.logging_config import configure_logging, get_logger
from flight_agent.models.intents import FlightIntent

from travel_agent.itinerary import build_itinerary_payload, map_flight_intent_to_travel_task
from travel_agent.models import TravelAgentInput, TravelAgentOutput, TravelTask

logger = get_logger(__name__)


class TravelAgent:
    """
    Travel Agent in the Itinero workflow.

    General Agent delegates:
    - travel_search  → Flight Agent (search, compare, verify)
    - travel_booking → Flight Agent (details, prebook, pay, ticket)

    Outputs are wrapped for Itinerary Agent consumption.
    """

    def __init__(self, *, flight_agent: FlightAgent | None = None) -> None:
        self._flight = flight_agent or FlightAgent()

    async def run(self, input_data: TravelAgentInput) -> TravelAgentOutput:
        """Handle a travel message by delegating to the Flight sub-agent."""
        task = input_data.task_hint or TravelTask.GENERAL
        logger.info(
            "travel_agent_run",
            session_id=input_data.session_id,
            task_hint=task.value,
            message_preview=input_data.message[:80],
        )

        flight_result = await self._flight.run(
            FlightAgentInput(
                message=input_data.message,
                session_id=input_data.session_id,
                session_context=input_data.session_context,
                history=input_data.history,
            )
        )

        travel_task = map_flight_intent_to_travel_task(flight_result.intent)
        if input_data.task_hint and travel_task == TravelTask.GENERAL:
            travel_task = input_data.task_hint

        itinerary = build_itinerary_payload(
            flight_result.session_context,
            flight_result.intent,
            response=flight_result.response,
            operation_result=flight_result.operation_result,
        )

        escalate = bool(
            flight_result.error
            and flight_result.intent
            in {FlightIntent.COMPLETE_BOOKING, FlightIntent.PREBOOK, FlightIntent.CANCEL_BOOKING}
        )

        output = TravelAgentOutput(
            response=flight_result.response,
            travel_task=travel_task,
            flight_intent=flight_result.intent,
            session_context=flight_result.session_context,
            operation_result=flight_result.operation_result,
            itinerary_payload=itinerary,
            needs_follow_up=flight_result.needs_follow_up,
            escalate_to_supervisor=escalate,
            error=flight_result.error,
        )

        logger.info(
            "travel_agent_complete",
            travel_task=travel_task.value,
            flight_intent=flight_result.intent.value,
            has_itinerary=bool(itinerary),
            escalate=escalate,
        )
        return output

    async def aclose(self) -> None:
        await self._flight.aclose()

    async def warm_up(self) -> None:
        await self._flight.warm_up()


def create_travel_agent() -> TravelAgent:
    configure_logging()
    return TravelAgent()
