"""
Builds the Itinero orchestrator agent graph.

Graph shape:

    START → agent → (tools_condition) → tools → (_route_after_tools) → agent → ... → END
                 ↘ END (no tool calls)                              ↘ itinerary → END

`itinerary_node` generates the full day-by-day plan in one LLM call and its
AIMessage is the final response for that turn — no second agent call needed.
On the NEXT user turn, agent_node resumes normally with full context.

`_route_after_tools` is the only new logic vs. the original MVP:
  - If the most-recent tool message contains the ESCALATE_TO_ITINERARY signal
    (placed there by the `escalate_to_itinerary` tool), route to itinerary_node.
  - Otherwise loop back to agent as before.

After itinerary_node completes, the graph routes directly to END so the full
itinerary is returned to the user immediately without a redundant agent call
that would summarise it into a short "all set" message.
"""
import logging

from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition

from models.state import AgentState
from llm.tools import ALL_TOOLS
from graph.nodes import agent_node, itinerary_node
from graph.utils import save_graph_image
from general_agent.config import GRAPH_IMAGE_PATH

try:
    from general_agent.checkpointing import get_checkpointer
except ImportError:
    from checkpointing import get_checkpointer  # type: ignore

# Signal produced by the `escalate_to_itinerary` tool.
# Kept in sync with llm/tools.py and graph/nodes.py.
_ESCALATION_SIGNAL = "ESCALATE_TO_ITINERARY"


def _route_after_tools(state: AgentState) -> str:
    """Conditional edge function: inspects the most-recent batch of tool
    messages and returns 'itinerary' if an escalation was requested,
    'agent' otherwise (standard ReAct loop-back).

    Loop guard: if update_trip_context has been called more than 2 times
    since the last HumanMessage, force END to break the loop.  This prevents
    the agent from calling the same state-saving tool dozens of times in one
    turn (seen in logs as repeated 'Agent state updated: [selected_flight]').
    Escalation always wins over the loop guard.
    """
    messages = state.get("messages", [])

    # ── Escalation check (wins over loop guard) ────────────────────────────
    # Scan ALL tool messages since the last HumanMessage. The LLM often calls
    # update_trip_context + escalate_to_itinerary in one turn; if we only
    # inspect the newest tool result, a later update_trip_context reply can
    # hide the escalation signal and skip itinerary_node.
    for msg in reversed(messages):
        msg_type = getattr(msg, "type", None)
        if msg_type == "human":
            break
        if msg_type == "tool" and _ESCALATION_SIGNAL in (msg.content or ""):
            return "itinerary"

    # ── Loop guard ─────────────────────────────────────────────────────────
    # Count consecutive update_trip_context tool calls in the current turn
    # (i.e. since the most-recent HumanMessage).
    update_ctx_count = 0
    for msg in reversed(messages):
        msg_type = getattr(msg, "type", None)
        if msg_type == "human":
            break  # stop counting at the boundary of the previous turn
        if msg_type == "ai":
            tool_calls = getattr(msg, "tool_calls", None) or []
            for tc in tool_calls:
                if tc.get("name") == "update_trip_context":
                    update_ctx_count += 1

    if update_ctx_count > 2:
        logging.getLogger(__name__).warning(
            "_route_after_tools: loop guard triggered (%d update_trip_context calls) — forcing END",
            update_ctx_count,
        )
        return END

    return "agent"


def _friendly_tool_error(exc: Exception) -> str:
    """Surface tool failures honestly — never claim trip/booking progress."""
    logging.getLogger(__name__).warning("Tool invocation failed: %s", exc)
    return (
        "TOOL_ERROR: the last lookup or booking step failed. "
        "Tell the traveller something went wrong and ask them to retry or clarify. "
        "Do not invent prices, holds, booking IDs, or confirmations. "
        "Do not mention tools, kwargs, stack traces, or internal validation details."
    )


def build_graph():
    graph = StateGraph(AgentState)

    # ── Nodes ────────────────────────────────────────────────────────────────
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(ALL_TOOLS, handle_tool_errors=_friendly_tool_error))
    graph.add_node("itinerary", itinerary_node)

    # ── Edges ─────────────────────────────────────────────────────────────────
    graph.add_edge(START, "agent")

    # After agent: tool calls requested → tools node; plain reply → END.
    graph.add_conditional_edges(
        "agent",
        tools_condition,
        {"tools": "tools", END: END},
    )

    # After tools: escalation signal → itinerary; normal result → back to agent.
    graph.add_conditional_edges(
        "tools",
        _route_after_tools,
        {"agent": "agent", "itinerary": "itinerary", END: END},
    )

    # After itinerary: the node's AIMessage IS the full trip plan.
    # Route directly to END so the complete itinerary is returned to the user.
    # On the next user turn, agent_node resumes normally — it will have
    # trip_context[itinerary_complete]=True so it knows planning is done.
    graph.add_edge("itinerary", END)

    # Durable checkpointer by default (sqlite). See checkpointing.py.
    # thread_id in agent.py must match supervisor session_id for coherent UX.
    checkpointer = get_checkpointer()
    compiled = graph.compile(checkpointer=checkpointer)

    save_graph_image(compiled, GRAPH_IMAGE_PATH)

    return compiled
