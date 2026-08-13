"""
Graph nodes for the Itinero orchestrator agent.

Two nodes:
  - agent_node      : the single LLM reasoning step (handles normal conversation
                      and tool routing). Injects a fresh datetime-aware system
                      prompt on every turn.
  - itinerary_node  : hands the conversation off to the real ITINERARY_AGENT
                      multi-agent system via itinerary_bridge.py. This node
                      only runs the FIRST itinerary turn — subsequent turns are
                      routed directly by general_agent/agent.py while
                      trip_context["engine"] == "itinerary", bypassing this
                      graph entirely until the itinerary session completes.

When this grows into multi-agent, new specialist nodes get added here alongside
`agent_node`, and `graph/workflow.py` wires the routing between them.
"""
import logging
import re

from langchain_core.messages import SystemMessage, AIMessage
from langchain_core.runnables import RunnableConfig

from models.state import AgentState
from llm.model import get_llm_for_turn
from llm.prompts import build_system_prompt
import itinerary_bridge

logger = logging.getLogger(__name__)

# The signal string that escalate_to_itinerary tool returns.
# Kept in sync with llm/tools.py and graph/workflow.py.
_ESCALATION_SIGNAL = "ESCALATE_TO_ITINERARY"

_PLANNER_EXTRA = (
    "\n\n[Lane: planner/synth — DeepSeek] "
    "You are writing the user-facing travel answer. Do NOT invent live fares, "
    "gates, or availability. If the history already contains tool results, "
    "synthesize them clearly. If the user needs live search or booking, say "
    "you'll look that up next (the tools lane will handle it)."
)


def agent_node(state: AgentState):
    """The single reasoning node: calls the LLM (with tools bound) on the
    current message history and returns its reply, which may include tool
    calls that the graph will route to the tools node.

    A fresh system prompt is injected on every turn so the agent always has
    the correct current date/time and the latest confirmed trip state.

    Dual-LLM: OpenAI handles tool/booking turns; DeepSeek handles plan-only
    and post-tool synthesis when DEEPSEEK_API_KEY is set.
    """
    messages = list(state["messages"])
    trip_context = state.get("trip_context", {}) or {}

    # Strip existing system messages to avoid duplication
    non_system_messages = [m for m in messages if m.type != "system"]

    # Windowing: Keep recent messages to prevent token inflation on long chats.
    # IMPORTANT: never slice in the middle of a tool_calls / tool pair —
    # OpenAI rejects any 'tool' message that isn't preceded by a 'tool_calls' AI message.
    if len(non_system_messages) > 20:
        non_system_messages = non_system_messages[-20:]
        # Strip any orphan tool messages at the head of the window.
        # They would be tool responses whose matching tool_calls AI message was cut off.
        while non_system_messages and getattr(non_system_messages[0], "type", None) == "tool":
            non_system_messages = non_system_messages[1:]

    llm, lane = get_llm_for_turn(non_system_messages, trip_context)

    # Inject fresh system message (rebuilds with current datetime and trip state each turn)
    system_body = build_system_prompt(trip_context)
    if lane in ("planner", "synth"):
        system_body = system_body + _PLANNER_EXTRA
    fresh_system = SystemMessage(content=system_body)
    final_messages = [fresh_system] + non_system_messages

    try:
        response = llm.invoke(final_messages)
    except Exception as exc:
        logger.exception("agent_node LLM invocation error lane=%s: %s", lane, exc)
        # Planner/synth failure → one retry on OpenAI tools lane.
        if lane in ("planner", "synth"):
            try:
                from llm.model import get_llm_with_tools

                logger.warning("vero_llm falling back to OpenAI tools after %s failure", lane)
                response = get_llm_with_tools().invoke(
                    [SystemMessage(content=build_system_prompt(trip_context))] + non_system_messages
                )
                lane = "tools_fallback"
            except Exception as exc2:
                logger.exception("agent_node OpenAI fallback failed: %s", exc2)
                return {
                    "messages": [
                        AIMessage(
                            content="I ran into a temporary connection issue. Please try your request again."
                        )
                    ]
                }
        else:
            return {
                "messages": [
                    AIMessage(
                        content="I ran into a temporary connection issue. Please try your request again."
                    )
                ]
            }

    updates = {"messages": [response]}
    logger.info("vero_llm lane=%s done tool_calls=%s", lane, bool(getattr(response, "tool_calls", None)))

    tool_calls = getattr(response, "tool_calls", None)
    if tool_calls:
        names = ", ".join(tc["name"] for tc in tool_calls)
        logger.info("Agent requested tool call(s): %s", names)

        # Intercept update_trip_context tool calls and write directly to state.
        # JSON-string fields (selected_flight, selected_hotel, return_flight,
        # leg_data) are parsed into real dicts so the context is always clean.
        new_context = dict(trip_context or {})
        for tc in tool_calls:
            if tc["name"] == "update_trip_context":
                args = tc.get("args", {})

                # JSON fields: parse from string to dict if the LLM serialised them
                json_fields = ("selected_flight", "selected_hotel", "return_flight")
                for field in json_fields:
                    if field in args and isinstance(args[field], str):
                        import json as _json
                        try:
                            args[field] = _json.loads(args[field])
                        except Exception:
                            pass  # keep as string if unparseable

                # Multi-destination leg: merge into the legs array
                leg_index = args.pop("leg_index", None)
                leg_data_raw = args.pop("leg_data", None)
                if leg_index is not None and leg_data_raw is not None:
                    import json as _json
                    try:
                        leg_data = (
                            _json.loads(leg_data_raw)
                            if isinstance(leg_data_raw, str)
                            else leg_data_raw
                        )
                        existing_legs = list(state.get("trip_context", {}).get("legs", []))
                        # Extend list to fit leg_index (1-based)
                        while len(existing_legs) < leg_index:
                            existing_legs.append({})
                        existing_legs[leg_index - 1].update(leg_data)
                        new_context["legs"] = existing_legs
                        logger.info("Multi-destination: updated leg %d", leg_index)
                    except Exception as e:
                        logger.warning("Failed to merge leg_data: %s", e)

                # Save all remaining non-empty values at top level
                for k, v in args.items():
                    if v is None:
                        continue
                    if isinstance(v, str) and not v.strip():
                        continue
                    # selected_flight dicts must match quick_flight_search cache
                    # (select_searched_flight). Block LLM-fabricated offer ids.
                    if k == "selected_flight" and isinstance(v, dict):
                        cached = (new_context.get("quick_flight_search") or {}).get("results") or []
                        fid = str(v.get("flight_id") or "").strip()
                        oid = str(v.get("offer_id") or v.get("offerId") or "").strip()
                        match = None
                        if fid:
                            match = next(
                                (f for f in cached if isinstance(f, dict) and str(f.get("flight_id") or "") == fid),
                                None,
                            )
                        if match is None and oid:
                            match = next(
                                (
                                    f
                                    for f in cached
                                    if isinstance(f, dict)
                                    and str(f.get("offer_id") or f.get("offerId") or "").strip() == oid
                                ),
                                None,
                            )
                        cache_oid = (
                            str(match.get("offer_id") or match.get("offerId") or "").strip()
                            if isinstance(match, dict)
                            else ""
                        )
                        if match is None or (oid and cache_oid and oid != cache_oid):
                            logger.warning(
                                "Rejecting update_trip_context selected_flight not in quick_flight_search"
                            )
                            continue
                        new_context[k] = match
                        continue
                    new_context[k] = v

        if new_context:
            updates["trip_context"] = new_context
            logger.info("Agent state updated: %s", list(new_context.keys()))

    return updates



def itinerary_node(state: AgentState, config: RunnableConfig):
    """
    Itinerary hand-off node — triggered when `escalate_to_itinerary` fires.

    Hands the conversation off to the real ITINERARY_AGENT multi-agent system
    (ITINERARY_AGENT/ai_travel_planner) via itinerary_bridge, which drives
    ITINERARY_AGENT's own LangGraph nodes one turn at a time — no changes to
    ITINERARY_AGENT itself, and no blocking console I/O.

    trip_context["engine"] flips to "itinerary" so that on the NEXT user
    message, general_agent/agent.py routes straight into
    itinerary_bridge.continue_itinerary_session(...) instead of calling the
    LLM again — Vero stays out of the loop until the itinerary session
    completes (or the user asks to go back to chat).
    """
    thread_id = config.get("configurable", {}).get("thread_id", "default")

    # ── Extract task_description from escalation signal ────────────────────
    task_description = ""
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", None) == "tool":
            content = msg.content or ""
            if _ESCALATION_SIGNAL in content:
                task_m = re.search(r"task=(.+?)(?:\|reason=|$)", content, re.DOTALL)
                if task_m:
                    task_description = task_m.group(1).strip()
                break

    logger.info("Itinerary node: handing off | thread=%s | task=%s", thread_id, task_description[:120])

    itin_state, reply_text, cards = itinerary_bridge.start_itinerary_session(state, task_description)

    merged_context = dict(state.get("trip_context", {}) or {})
    merged_context["engine"] = "itinerary"
    merged_context["itinerary_state"] = itin_state
    if cards:
        merged_context["pending_cards"] = cards

    return {
        "messages": [AIMessage(content=reply_text)],
        "trip_context": merged_context,
    }
