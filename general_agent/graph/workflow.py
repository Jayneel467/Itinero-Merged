"""
Builds the Itinero orchestrator agent graph.

Graph shape:

    START → agent → (tools_condition) → tools → (_route_after_tools) → agent → ... → END
                 ↘ END (no tool calls)                              ↘ itinerary → END

`_route_after_tools` is the only new logic vs. the original MVP:
  - If the most-recent tool message contains the ESCALATE_TO_ITINERARY signal
    (placed there by the `escalate_to_itinerary` tool), route to itinerary_node.
  - Otherwise loop back to agent as before.

To grow into full multi-agent later: add new specialist nodes in graph/nodes.py
and wire them from itinerary_node in this file — the state schema and
message-passing convention stay identical.
"""
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver

from models.state import AgentState
from llm.tools import ALL_TOOLS
from graph.nodes import agent_node, itinerary_node
from graph.utils import save_graph_image
from general_agent.config import GRAPH_IMAGE_PATH

# Signal produced by the `escalate_to_itinerary` tool.
# Kept in sync with llm/tools.py and graph/nodes.py.
_ESCALATION_SIGNAL = "ESCALATE_TO_ITINERARY"


def _route_after_tools(state: AgentState) -> str:
    """Conditional edge function: inspects the most-recent batch of tool
    messages and returns 'itinerary' if an escalation was requested,
    'agent' otherwise (standard ReAct loop-back)."""
    for msg in reversed(state["messages"]):
        msg_type = getattr(msg, "type", None)
        if msg_type == "tool":
            if _ESCALATION_SIGNAL in (msg.content or ""):
                return "itinerary"
            # Stop at the first (most-recent) tool message — earlier batches
            # from this conversation should not re-trigger routing.
            break
    return "agent"


def build_graph():
    graph = StateGraph(AgentState)

    # ── Nodes ────────────────────────────────────────────────────────────────
    graph.add_node("agent", agent_node)
    graph.add_node("tools", ToolNode(ALL_TOOLS))
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
        {"agent": "agent", "itinerary": "itinerary"},
    )

    # Itinerary node always ends the general agent's turn — the itinerary agent
    # takes full ownership from this point onward.
    graph.add_edge("itinerary", END)

    # MemorySaver gives the agent short-term memory across turns, keyed by
    # thread_id (see agent.py). Swap for SqliteSaver / PostgresSaver later
    # without touching the graph shape.
    checkpointer = MemorySaver()
    compiled = graph.compile(checkpointer=checkpointer)

    save_graph_image(compiled, GRAPH_IMAGE_PATH)

    return compiled
