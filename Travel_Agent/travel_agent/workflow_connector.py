"""Stable workflow hook — other agents import this to call Flight Agent."""

from __future__ import annotations

from typing import Any

from flight_agent.models.agent import SessionContext

from travel_agent.agent import TravelAgent
from travel_agent.models import TravelAgentInput, TravelAgentOutput, TravelTask

WORKFLOW_AGENT = "travel_agent"
SUB_AGENT = "flight_agent"


def _parse_task(task: str | None) -> TravelTask | None:
    if not task:
        return None
    normalized = task.strip().lower()
    if normalized in {"travel_search", "search", "flight_search"}:
        return TravelTask.TRAVEL_SEARCH
    if normalized in {"travel_booking", "booking", "flight_booking"}:
        return TravelTask.TRAVEL_BOOKING
    return None


def workflow_handoff(output: TravelAgentOutput) -> dict[str, Any]:
    """Serialize Travel Agent output for Supervisor / General / Itinerary agents."""
    return {
        "agent": WORKFLOW_AGENT,
        "sub_agent": SUB_AGENT,
        "response": output.response,
        "travel_task": output.travel_task.value,
        "flight_intent": output.flight_intent.value,
        "needs_follow_up": output.needs_follow_up,
        "escalate_to_supervisor": output.escalate_to_supervisor,
        "session_context": output.session_context.model_dump(),
        "itinerary_payload": (
            output.itinerary_payload.model_dump() if output.itinerary_payload else None
        ),
        "operation_result": output.operation_result,
        "error": output.error,
    }


class FlightWorkflowBridge:
    """
    Long-lived connection from the multi-agent workflow to Flight Agent.

    Usage (other developer):
        bridge = FlightWorkflowBridge()
        await bridge.warm_up()
        result = await bridge.handle("Mumbai to Delhi on 10 July", session_id="u1")
        session = SessionContext.model_validate(result["session_context"])
    """

    def __init__(self) -> None:
        self._travel = TravelAgent()

    async def warm_up(self) -> None:
        await self._travel.warm_up()

    async def handle(
        self,
        message: str,
        *,
        session_id: str | None = None,
        task: str | None = None,
        session_context: SessionContext | dict[str, Any] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """Run one workflow turn and return a JSON-serializable handoff dict."""
        ctx: SessionContext | None = None
        if isinstance(session_context, SessionContext):
            ctx = session_context
        elif isinstance(session_context, dict):
            ctx = SessionContext.model_validate(session_context)

        output = await self._travel.run(
            TravelAgentInput(
                message=message,
                session_id=session_id,
                task_hint=_parse_task(task),
                session_context=ctx,
                history=history or [],
            )
        )
        return workflow_handoff(output)

    async def close(self) -> None:
        await self._travel.aclose()


async def handle_workflow_message(
    message: str,
    *,
    session_id: str | None = None,
    task: str | None = None,
    session_context: SessionContext | dict[str, Any] | None = None,
    history: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """One-shot workflow call (creates and closes bridge per request)."""
    bridge = FlightWorkflowBridge()
    try:
        await bridge.warm_up()
        return await bridge.handle(
            message,
            session_id=session_id,
            task=task,
            session_context=session_context,
            history=history,
        )
    finally:
        await bridge.close()
