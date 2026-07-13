"""Flight Agent — LangGraph + GPT + LiteAPI.

Architecture slot (Itinero diagram):

  Start → General Agent → Itinerary Planner → Travel Agent → **Flight Booking**
       → Payment / PDF

This package is the Flight Booking specialist only.
Search and book requests should enter via General Agent (`itinero.GeneralAgent`).
"""

from __future__ import annotations

import json

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError

from flight_agent.config import get_settings
from flight_agent.graph.state import NodeDependencies
from flight_agent.graph.workflow import build_flight_graph
from flight_agent.llm.booking_progress import try_booking_progress
from flight_agent.llm.confirmation import apply_user_confirmation
from flight_agent.llm.nlp import FlightNLP
from flight_agent.llm.tools import TOOL_TO_INTENT, build_flight_tools
from flight_agent.llm.user_copy import (
    contextual_fallback_prompt,
    is_generic_clarification,
    is_technical_error,
    sanitize_assistant_text,
)
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import FlightAgentInput, FlightAgentOutput, SessionContext
from flight_agent.models.intents import FlightIntent
from flight_agent.providers.liteapi_provider import LiteAPIProvider
from flight_agent.services.flight_service import FlightService

logger = get_logger(__name__)


def _final_response(messages: list) -> str:
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
            return msg.content if isinstance(msg.content, str) else str(msg.content)
    return ""


def _intent_from_tool(tool_name: str | None) -> FlightIntent:
    if tool_name and tool_name in TOOL_TO_INTENT:
        return TOOL_TO_INTENT[tool_name]
    return FlightIntent.GENERAL


class FlightAgent:
    """
    Flight Agent entry point for chat or Supervisor handoff.

    Caller owns SessionContext across turns (Streamlit, CLI, or future Supervisor).
    """

    def __init__(
        self,
        *,
        flight_service: FlightService | None = None,
        nlp: FlightNLP | None = None,
    ) -> None:
        settings = get_settings()
        self._settings = settings
        provider = LiteAPIProvider(settings)
        self._flight_service = flight_service or FlightService(provider, settings)
        self._nlp = nlp or FlightNLP(settings)
        deps = NodeDependencies(flight_service=self._flight_service, nlp=self._nlp)
        self._graph = build_flight_graph(deps)

    async def warm_up(self) -> None:
        try:
            await self._flight_service.warm_up()
        except Exception:
            pass

    async def aclose(self) -> None:
        await self._flight_service.close()

    async def _run_confirmed_cancel(self, session: SessionContext) -> FlightAgentOutput | None:
        """Execute cancel after YES without waiting for another LLM tool call."""
        if not (session.awaiting_cancel_confirmation and session.cancel_confirmed):
            return None
        bid = session.pending_cancel_booking_id or session.booking_id
        if not bid:
            return None
        tools = {t.name: t for t in build_flight_tools(self._flight_service, session)}
        raw = await tools["cancel_flight_booking"].ainvoke({"booking_id": bid})
        data = json.loads(raw) if isinstance(raw, str) else raw
        text = str(
            (data or {}).get("user_prompt")
            or (data or {}).get("message")
            or "Cancellation update ready."
        )
        return FlightAgentOutput(
            response=sanitize_assistant_text(text, session),
            intent=FlightIntent.CANCEL_BOOKING,
            session_context=session,
            operation_result=data if isinstance(data, dict) else None,
            needs_follow_up=True,
        )

    async def _run_confirmed_prebook(self, session: SessionContext) -> FlightAgentOutput | None:
        """Hold fare after YES — do not rely on the LLM calling prebook_flight."""
        if not (
            session.awaiting_booking_confirmation
            and session.booking_confirmed
            and not session.prebook_id
            and session.verified_offer_id
        ):
            return None
        if session.awaiting_service_preference and not session.service_preference:
            return None
        tools = {t.name: t for t in build_flight_tools(self._flight_service, session)}
        raw = await tools["prebook_flight"].ainvoke({})
        data = json.loads(raw) if isinstance(raw, str) else raw
        text = str(
            (data or {}).get("user_prompt")
            or (data or {}).get("message")
            or "Your flight is on hold."
        )
        return FlightAgentOutput(
            response=sanitize_assistant_text(text, session),
            intent=FlightIntent.PREBOOK,
            session_context=session,
            operation_result=data if isinstance(data, dict) else None,
            needs_follow_up=True,
        )

    async def _run_confirmed_complete(self, session: SessionContext) -> FlightAgentOutput | None:
        """Issue ticket after YES — do not rely on the LLM calling complete_flight_booking."""
        if not (
            session.prebook_id
            and session.awaiting_payment_confirmation
            and session.payment_confirmed
            and not session.booking_id
        ):
            return None
        tools = {t.name: t for t in build_flight_tools(self._flight_service, session)}
        raw = await tools["complete_flight_booking"].ainvoke({})
        data = json.loads(raw) if isinstance(raw, str) else raw
        text = str(
            (data or {}).get("user_prompt")
            or (data or {}).get("message")
            or "Booking update ready."
        )
        return FlightAgentOutput(
            response=sanitize_assistant_text(text, session),
            intent=FlightIntent.COMPLETE_BOOKING,
            session_context=session,
            operation_result=data if isinstance(data, dict) else None,
            needs_follow_up=True,
        )

    async def run(self, input_data: FlightAgentInput) -> FlightAgentOutput:
        """One user turn: Intent → Flight Agent ↔ LiteAPI tools → reply."""
        session = input_data.session_context or SessionContext()
        apply_user_confirmation(input_data.message, session)

        logger.info(
            "agent_run_start",
            session_id=input_data.session_id,
            message_preview=input_data.message[:60],
        )

        cancel_out = await self._run_confirmed_cancel(session)
        if cancel_out is not None:
            logger.info("agent_run_complete", intent="cancel_booking")
            return cancel_out

        prebook_out = await self._run_confirmed_prebook(session)
        if prebook_out is not None:
            logger.info("agent_run_complete", intent="prebook", last_tool="prebook_flight")
            return prebook_out

        complete_out = await self._run_confirmed_complete(session)
        if complete_out is not None:
            logger.info(
                "agent_run_complete",
                intent="complete_booking",
                last_tool="complete_flight_booking",
            )
            return complete_out

        # Ensure option / passengers are saved even if the LLM only chats
        progress = await try_booking_progress(
            flight_service=self._flight_service,
            session=session,
            message=input_data.message,
        )
        if progress is not None:
            logger.info(
                "agent_run_complete",
                intent=progress.intent.value,
                last_tool="booking_progress",
            )
            return progress

        messages: list = []
        for turn in input_data.history[-6:]:
            role, content = turn.get("role", ""), turn.get("content", "")
            if not content:
                continue
            if len(content) > 600:
                content = content[:600] + "…"
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        messages.append(HumanMessage(content=input_data.message))

        try:
            final_state = await self._graph.ainvoke(
                {
                    "messages": messages,
                    "session": session,
                    "last_tool": None,
                    "operation_result": None,
                    "error": None,
                    "user_message": input_data.message,
                    "route": "flight_booking",
                },
                config={"recursion_limit": self._settings.agent_recursion_limit},
            )
        except GraphRecursionError:
            logger.warning("agent_recursion_limit")
            return FlightAgentOutput(
                response=contextual_fallback_prompt(session),
                intent=FlightIntent.GENERAL,
                session_context=session,
                needs_follow_up=True,
            )
        except Exception as exc:
            logger.exception("agent_run_failed", error=str(exc))
            return FlightAgentOutput(
                response=contextual_fallback_prompt(session),
                intent=FlightIntent.GENERAL,
                session_context=session,
                needs_follow_up=True,
            )

        last_tool = final_state.get("last_tool")
        out_session = final_state.get("session") or session
        response = sanitize_assistant_text(
            _final_response(final_state.get("messages") or []),
            out_session,
        )
        op_result = final_state.get("operation_result")
        if isinstance(op_result, dict):
            if op_result.get("status") == "incomplete":
                response = (
                    op_result.get("user_prompt")
                    or op_result.get("details_prompt")
                    or response
                )
            elif op_result.get("user_prompt") and not str(response).strip():
                response = str(op_result["user_prompt"])

        if not str(response).strip() or is_generic_clarification(response):
            response = contextual_fallback_prompt(out_session)
        elif is_technical_error(response):
            response = contextual_fallback_prompt(out_session)

        raw_error = final_state.get("error")
        user_error = None
        if raw_error and not is_technical_error(str(raw_error)):
            user_error = sanitize_assistant_text(str(raw_error))

        intent = _intent_from_tool(last_tool)
        logger.info("agent_run_complete", intent=intent.value, last_tool=last_tool)
        return FlightAgentOutput(
            response=response,
            intent=intent,
            session_id=input_data.session_id,
            session_context=out_session,
            operation_result=op_result if isinstance(op_result, dict) else None,
            error=user_error,
            needs_follow_up=True,
        )
