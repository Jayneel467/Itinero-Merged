"""LangGraph nodes — Intent → Flight Agent (LiteAPI tools) conversation loop."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, ToolMessage

from flight_agent.graph.state import NodeDependencies
from flight_agent.llm.booking_requirements import booking_details_prompt
from flight_agent.llm.confirmation import booking_summary_prompt
from flight_agent.llm.intent import classify_intent
from flight_agent.llm.tools import build_flight_tools
from flight_agent.llm.user_copy import (
    contextual_fallback_prompt,
    is_technical_error,
    strip_thinking_tags,
)
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import FlightAgentState

logger = get_logger(__name__)

_MAX_TOOL_JSON_CHARS = 2500
MAX_TOOL_STEPS = 12


def _compact_tool_content(content: str) -> str:
    """Shrink large tool JSON so context stays manageable."""
    if len(content) <= _MAX_TOOL_JSON_CHARS:
        return content
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return content[:_MAX_TOOL_JSON_CHARS] + "…"
    if isinstance(data, dict) and "offers" in data:
        offers = data.get("offers") or []
        data["offers"] = offers[:3]
        data["_truncated"] = True
    trimmed = json.dumps(data)
    if len(trimmed) > _MAX_TOOL_JSON_CHARS:
        return trimmed[:_MAX_TOOL_JSON_CHARS] + "…"
    return trimmed


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
    session = state["session"]
    return booking_details_prompt(session, still_need if still_need else None, "IN")


def _blocked_booking_tool(response: AIMessage, session) -> str | None:
    """Safety: block prebook until the user confirms the hold."""
    if not response.tool_calls:
        return None
    names = {call["name"] for call in response.tool_calls}
    if (
        "prebook_flight" in names
        and session.awaiting_booking_confirmation
        and not session.booking_confirmed
    ):
        return booking_summary_prompt(session)
    return None


async def intent_node(state: FlightAgentState, deps: NodeDependencies) -> dict:
    """LLM Intent Detector — general chat vs flight booking vs manage booking."""
    decision = await classify_intent(
        deps.nlp.raw_llm,
        user_message=state.get("user_message") or "",
        session=state["session"],
    )
    return {"route": decision.route}


async def general_chat_node(state: FlightAgentState, deps: NodeDependencies) -> dict:
    """Flight-only redirect — booking work belongs on LiteAPI tools, not free chat."""
    reply = (
        "I only handle **flights** — search, traveler details, and holding the fare.\n\n"
        "Payment and the ticket are finished at checkout.\n\n"
        "Tell me **from**, **to**, and **date** "
        "(e.g. *Mumbai to Delhi on 26 July*)."
    )
    user_message = (state.get("user_message") or "").strip().lower()
    if user_message in {"hi", "hello", "hey", "hii"}:
        reply = (
            "Hi! I book **flights** only (live fares).\n\n"
            "Where from, where to, and which **date**?"
        )
    return {"messages": [AIMessage(content=reply)]}


async def agent_node(state: FlightAgentState, deps: NodeDependencies) -> dict:
    """Flight Agent — LLM talks to user and calls LiteAPI tools via LangGraph."""
    session = state["session"]
    try:
        tools = build_flight_tools(deps.flight_service, session)
        llm = deps.nlp.bind_tools(tools)
        messages = [
            deps.nlp.system_message(session, user_message=state.get("user_message") or ""),
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
        elif last := _last_tool_payload(state):
            content = str(response.content or "").strip()
            if not response.tool_calls and (not content or is_technical_error(content)):
                if last.get("status") == "need_next_traveler" and last.get("user_prompt"):
                    response = AIMessage(content=str(last["user_prompt"]))
                elif last.get("status") == "incomplete":
                    prompt = last.get("user_prompt") or last.get("details_prompt")
                    if prompt:
                        response = AIMessage(content=str(prompt))
        elif blocked := _blocked_booking_tool(response, session):
            logger.info("agent_loop_break", reason="booking tool without user confirmation")
            response = AIMessage(content=blocked)
        elif response.content and is_technical_error(str(response.content)):
            response = AIMessage(content=contextual_fallback_prompt(session))

        logger.info(
            "agent_turn",
            tool_calls=len(response.tool_calls) if response.tool_calls else 0,
            route=state.get("route"),
        )
        return {"messages": [response]}
    except Exception as exc:
        logger.exception("agent_node_failed", error=str(exc))
        return {"messages": [AIMessage(content=contextual_fallback_prompt(state["session"]))]}


async def tools_node(state: FlightAgentState, deps: NodeDependencies) -> dict:
    """Execute LiteAPI tools chosen by the LLM."""
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
                content = _compact_tool_content(content)
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
                friendly = (
                    contextual_fallback_prompt(session)
                    if is_technical_error(str(exc))
                    else str(exc)
                )
                content = json.dumps(
                    {
                        "error": friendly,
                        "user_prompt": contextual_fallback_prompt(session),
                    }
                )
                error = friendly
                last_tool = name

        tool_messages.append(ToolMessage(content=content, tool_call_id=call["id"]))

    return {
        "messages": tool_messages,
        "session": session,
        "last_tool": last_tool,
        "operation_result": operation_result,
        "error": error,
    }


def route_after_intent(state: FlightAgentState) -> str:
    route = state.get("route") or "flight_booking"
    if route == "general_chat":
        return "general"
    return "flight"


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
