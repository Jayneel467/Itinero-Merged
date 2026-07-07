"""LangGraph workflow — ReAct-style tool loop."""

from langgraph.graph import END, START, StateGraph

from flight_agent.graph.nodes import agent_node, should_continue, tools_node
from flight_agent.graph.state import NodeDependencies
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import FlightAgentState

logger = get_logger(__name__)


def build_flight_graph(deps: NodeDependencies):
    """
    Build the Flight Agent graph.

    Flow: agent and tools loop until the LLM returns a final response.
    """
    graph = StateGraph(FlightAgentState)

    async def _agent(state: FlightAgentState) -> dict:
        return await agent_node(state, deps)

    async def _tools(state: FlightAgentState) -> dict:
        return await tools_node(state, deps)

    graph.add_node("agent", _agent)
    graph.add_node("tools", _tools)

    graph.add_edge(START, "agent")
    graph.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "end": END},
    )
    graph.add_edge("tools", "agent")

    compiled = graph.compile()
    logger.debug("flight_graph_compiled")
    return compiled
