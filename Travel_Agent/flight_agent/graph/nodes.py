"""LangGraph nodes — LLM tool-calling loop (no separate intent step)."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage

from flight_agent.graph.state import NodeDependencies
from flight_agent.llm.booking_requirements import booking_details_prompt
from flight_agent.llm.confirmation import booking_summary_prompt, payment_summary_prompt
from flight_agent.llm.tools import build_flight_tools
from flight_agent.llm.user_copy import clarification_prompt, is_technical_error, strip_thinking_tags
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import FlightAgentState

logger = get_logger(__name__)

MAX_TOOL_STEPS = 12


def _last_tool_payload(state: FlightAgentState) -> dict[str, Any] | None:
    for msg in reversed(state["messages"]):
        if isinstance(msg, ToolMessage):
            try:
                data = json.loads(msg.content)
                return data if isinstance(data, dict) else None
            except json.JSONDecodeError:
                return None
    return None


def _save_traveler_loop(response: AIMessage, state: FlightAgentState) -> bool:
    """Detect LLM calling save_traveler_info again with no new user data."""
    if not response.tool_calls:
        return False
    if not all(call["name"] == "save_traveler_info" for call in response.tool_calls):
        return False
    if any((call.get("args") or {}).values() for call in response.tool_calls):
        return False
    last = _last_tool_payload(state)
    return bool(last and last.get("status") == "incomplete")


def _prompt_for_missing_traveler(state: FlightAgentState) -> str:
    last = _last_tool_payload(state) or {}
    still_need = last.get("still_need") or []
    return booking_details_prompt(state["session"], still_need if still_need else None)


def _blocked_booking_tool(response: AIMessage, session) -> str | None:
    """Stop LLM from retrying prebook/complete without user confirmation."""
    if not response.tool_calls:
        return None
    names = {call["name"] for call in response.tool_calls}
    if (
        "prebook_flight" in names
        and session.awaiting_booking_confirmation
        and not session.booking_confirmed
    ):
        return booking_summary_prompt(session)
    if (
        "complete_flight_booking" in names
        and session.awaiting_payment_confirmation
        and not session.payment_confirmed
    ):
        return payment_summary_prompt(session)
    return None


async def agent_node(state: FlightAgentState, deps: NodeDependencies) -> dict:
    """LLM decides whether to call tools or reply directly."""
    session = state["session"]
    query_hints = state.get("query_hints")
    try:
        if query_hints and query_hints.is_off_topic and not session.last_search_results and not session.booking_id:
            logger.info("agent_off_topic_redirect")
            return {
                "messages": [
                    AIMessage(
                        content=(
                            "I'm your **flight booking assistant** — I can search and book flights only.\n\n"
                            "Tell me **where you're flying from, where to, and your travel date** "
                            "(e.g. *Mumbai to Delhi on 8 July*)."
                        )
                    )
                ]
            }

        tools = build_flight_tools(deps.flight_service, session)
        llm = deps.nlp.bind_tools(tools)

        user_message = state.get("user_message") or ""
        query_hints = state.get("query_hints")
        messages = [
            deps.nlp.system_message(
                session,
                user_message=user_message,
                query_hints=query_hints,
            ),
            *state["messages"],
        ]
        response: AIMessage = await llm.ainvoke(messages)

        if response.content:
            cleaned = strip_thinking_tags(str(response.content))
            if cleaned != response.content:
                response = AIMessage(content=cleaned, tool_calls=response.tool_calls)

        if _save_traveler_loop(response, state):
            logger.info("agent_loop_break", reason="save_traveler_info repeated without user input")
            response = AIMessage(content=_prompt_for_missing_traveler(state))
        elif blocked := _blocked_booking_tool(response, session):
            logger.info("agent_loop_break", reason="booking tool without user confirmation")
            response = AIMessage(content=blocked)
        elif response.content and is_technical_error(str(response.content)):
            response = AIMessage(content=clarification_prompt())

        logger.info(
            "agent_turn",
            tool_calls=len(response.tool_calls) if response.tool_calls else 0,
        )
        return {"messages": [response]}
    except Exception as exc:
        logger.exception("agent_node_failed", error=str(exc))
        return {"messages": [AIMessage(content=clarification_prompt())]}


async def tools_node(state: FlightAgentState, deps: NodeDependencies) -> dict:
    """Execute tool calls chosen by the LLM."""
    session = state["session"]
    tools = build_flight_tools(deps.flight_service, session)
    tools_by_name = {t.name: t for t in tools}

    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return {}

    tool_messages: list[ToolMessage] = []
    last_tool: str | None = state.get("last_tool")
    operation_result: dict[str, Any] | None = state.get("operation_result")
    error: str | None = state.get("error")

    for call in last_message.tool_calls:
        name = call["name"]
        args = call.get("args") or {}
        logger.info("tool_call", tool=name)

        tool = tools_by_name.get(name)
        if not tool:
            content = json.dumps({"error": f"Unknown tool: {name}"})
            error = f"Unknown tool: {name}"
        else:
            try:
                raw = await tool.ainvoke(args)
                content = raw if isinstance(raw, str) else json.dumps(raw)
                try:
                    operation_result = json.loads(content)
                except json.JSONDecodeError:
                    operation_result = {"raw": content}
                if isinstance(operation_result, dict) and operation_result.get("error"):
                    error = str(operation_result["error"])
                else:
                    error = None
                last_tool = name
            except Exception as exc:
                logger.warning("tool_failed", tool=name, error=str(exc))
                friendly = clarification_prompt() if is_technical_error(str(exc)) else str(exc)
                content = json.dumps(
                    {
                        "error": friendly,
                        "user_prompt": clarification_prompt(
                            "Something went wrong — please repeat your request."
                        ),
                    }
                )
                error = friendly
                last_tool = name

        tool_messages.append(
            ToolMessage(content=content, tool_call_id=call["id"])
        )

    return {
        "messages": tool_messages,
        "session": session,
        "last_tool": last_tool,
        "operation_result": operation_result,
        "error": error,
    }


def should_continue(state: FlightAgentState) -> str:
    """Route to tools if the LLM requested tool calls, otherwise finish."""
    tool_steps = sum(1 for msg in state["messages"] if isinstance(msg, ToolMessage))
    if tool_steps >= MAX_TOOL_STEPS:
        logger.warning("agent_max_tool_steps", steps=tool_steps)
        return "end"

    last = state["messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "tools"
    return "end"
