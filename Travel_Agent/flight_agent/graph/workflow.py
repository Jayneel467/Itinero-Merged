"""LangGraph workflow — Flight Agent architecture slice.

  START → Intent (GPT)
            ├─ general_chat → reply → END
            └─ flight / manage → Agent (GPT) ↔ LiteAPI tools → END
"""

from langgraph.graph import END, START, StateGraph

from flight_agent.graph.nodes import (
    agent_node,
    general_chat_node,
    intent_node,
    route_after_intent,
    should_continue,
    tools_node,
)
from flight_agent.graph.state import NodeDependencies
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import FlightAgentState

logger = get_logger(__name__)


def build_flight_graph(deps: NodeDependencies):
    graph = StateGraph(FlightAgentState)

    async def _intent(state: FlightAgentState) -> dict:
        return await intent_node(state, deps)

    async def _general(state: FlightAgentState) -> dict:
        return await general_chat_node(state, deps)

    async def _agent(state: FlightAgentState) -> dict:
        return await agent_node(state, deps)

    async def _tools(state: FlightAgentState) -> dict:
        return await tools_node(state, deps)

    graph.add_node("intent", _intent)
    graph.add_node("general", _general)
    graph.add_node("agent", _agent)
    graph.add_node("tools", _tools)

    graph.add_edge(START, "intent")
    graph.add_conditional_edges(
        "intent",
        route_after_intent,
        {"general": "general", "flight": "agent"},
    )
    graph.add_edge("general", END)
    graph.add_conditional_edges(
        "agent",
        should_continue,
        {"tools": "tools", "end": END},
    )
    graph.add_edge("tools", "agent")

    compiled = graph.compile()
    logger.debug("flight_graph_compiled")
    return compiled
