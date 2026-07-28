"""
LangGraph workflow graph definition.

Builds the StateGraph that orchestrates all planning nodes.
The graph is compiled once at import time and reused across requests.

Conditional routing logic:
  - After check_missing_info  → ask questions OR show confirmation
  - After user_confirmation   → flight search OR wait
  - After flight_ranking      → wait for user selection
  - After flight_selection    → prebook OR re-show flights
  - After flight_prebook      → draft itinerary
  - After draft_itinerary     → hotel search OR final itinerary
  - After hotel_ranking       → wait for selection
  - After hotel_selection     → prebook OR re-show hotels
  - After hotel_prebook       → final itinerary
"""

from __future__ import annotations

from typing import Any, Dict

from langgraph.graph import END, StateGraph

from backend.models.state import WorkflowStep
from backend.workflow.nodes import (
    node_ask_missing_questions,
    node_check_missing_info,
    node_collect_requirements,
    node_draft_itinerary,
    node_final_itinerary,
    node_flight_prebook,
    node_flight_ranking,
    node_flight_search,
    node_flight_selection,
    node_hotel_prebook,
    node_hotel_ranking,
    node_hotel_search,
    node_hotel_selection,
    node_user_confirmation,
)


# ---------------------------------------------------------------------------
# Routing / conditional-edge functions
# ---------------------------------------------------------------------------

def _route_after_check_missing(state: Dict[str, Any]) -> str:
    """Branch: missing fields → ask questions; complete → confirmation."""
    if state.get("missing_fields"):
        return "ask_missing_questions"
    return "user_confirmation"


def _route_after_user_confirmation(state: Dict[str, Any]) -> str:
    """Branch: user confirmed → search flights; declined / waiting → END."""
    if state.get("user_confirmed") is True:
        return "flight_search"
    return END


def _route_after_flight_ranking(state: Dict[str, Any]) -> str:
    """Always pause after ranking to wait for user selection."""
    return END


def _route_after_flight_selection(state: Dict[str, Any]) -> str:
    """Branch: flight selected → ask prebook; nothing yet → END (wait)."""
    if state.get("selected_flight"):
        step = state.get("workflow_step")
        if step == WorkflowStep.FLIGHT_PREBOOK:
            return "flight_prebook"
    return END


def _route_after_flight_prebook(state: Dict[str, Any]) -> str:
    """Proceed to draft itinerary after a successful prebook."""
    if state.get("flight_prebook"):
        return "draft_itinerary"
    return END


def _route_after_draft_itinerary(state: Dict[str, Any]) -> str:
    """Always pause after draft to wait for hotel search decision."""
    return END


def _route_after_hotel_search(state: Dict[str, Any]) -> str:
    """Branch: results present → rank; user declined → final itinerary."""
    step = state.get("workflow_step")
    if step == WorkflowStep.FINAL_ITINERARY:
        return "final_itinerary"
    if state.get("hotel_search_results"):
        return "hotel_ranking"
    return END


def _route_after_hotel_ranking(state: Dict[str, Any]) -> str:
    """Always pause after ranking to wait for user selection."""
    return END


def _route_after_hotel_selection(state: Dict[str, Any]) -> str:
    """Branch: all days selected → prebook; still waiting → END."""
    step = state.get("workflow_step")
    if step == WorkflowStep.HOTEL_PREBOOK:
        return "hotel_prebook"
    return END


def _route_after_hotel_prebook(state: Dict[str, Any]) -> str:
    """Proceed to final itinerary after all hotel prebooks."""
    step = state.get("workflow_step")
    if step == WorkflowStep.FINAL_ITINERARY:
        return "final_itinerary"
    return END


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """
    Construct and compile the travel-planning StateGraph.

    Returns the compiled graph object ready to be invoked.
    """
    # LangGraph requires a typed-dict or plain dict schema.
    # We use Dict[str, Any] here and do Pydantic conversion inside each node.
    graph = StateGraph(dict)

    # ------------------------------------------------------------------
    # Register nodes
    # ------------------------------------------------------------------
    graph.add_node("collect_requirements",   node_collect_requirements)
    graph.add_node("check_missing_info",     node_check_missing_info)
    graph.add_node("ask_missing_questions",  node_ask_missing_questions)
    graph.add_node("user_confirmation",      node_user_confirmation)
    graph.add_node("flight_search",          node_flight_search)
    graph.add_node("flight_ranking",         node_flight_ranking)
    graph.add_node("flight_selection",       node_flight_selection)
    graph.add_node("flight_prebook",         node_flight_prebook)
    graph.add_node("draft_itinerary",        node_draft_itinerary)
    graph.add_node("hotel_search",           node_hotel_search)
    graph.add_node("hotel_ranking",          node_hotel_ranking)
    graph.add_node("hotel_selection",        node_hotel_selection)
    graph.add_node("hotel_prebook",          node_hotel_prebook)
    graph.add_node("final_itinerary",        node_final_itinerary)

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    graph.set_entry_point("collect_requirements")

    # ------------------------------------------------------------------
    # Edges
    # ------------------------------------------------------------------

    # collect → check
    graph.add_edge("collect_requirements", "check_missing_info")

    # check → (ask questions | confirmation)
    graph.add_conditional_edges(
        "check_missing_info",
        _route_after_check_missing,
        {
            "ask_missing_questions": "ask_missing_questions",
            "user_confirmation":     "user_confirmation",
        },
    )

    # ask → END (wait for user reply — next turn restarts at collect)
    graph.add_edge("ask_missing_questions", END)

    # confirmation → (flight_search | END)
    graph.add_conditional_edges(
        "user_confirmation",
        _route_after_user_confirmation,
        {
            "flight_search": "flight_search",
            END:             END,
        },
    )

    # flight_search → ranking (always)
    graph.add_edge("flight_search", "flight_ranking")

    # ranking → END (wait for user to pick a flight via the API)
    graph.add_conditional_edges(
        "flight_ranking",
        _route_after_flight_ranking,
        {END: END},
    )

    # selection → (prebook | END)
    graph.add_conditional_edges(
        "flight_selection",
        _route_after_flight_selection,
        {
            "flight_prebook": "flight_prebook",
            END:              END,
        },
    )

    # prebook → (draft | END)
    graph.add_conditional_edges(
        "flight_prebook",
        _route_after_flight_prebook,
        {
            "draft_itinerary": "draft_itinerary",
            END:               END,
        },
    )

    # draft → END (wait for hotel decision)
    graph.add_conditional_edges(
        "draft_itinerary",
        _route_after_draft_itinerary,
        {END: END},
    )

    # hotel_search → (hotel_ranking | final_itinerary | END)
    graph.add_conditional_edges(
        "hotel_search",
        _route_after_hotel_search,
        {
            "hotel_ranking":   "hotel_ranking",
            "final_itinerary": "final_itinerary",
            END:               END,
        },
    )

    # hotel_ranking → END (wait for selection)
    graph.add_conditional_edges(
        "hotel_ranking",
        _route_after_hotel_ranking,
        {END: END},
    )

    # hotel_selection → (prebook | END)
    graph.add_conditional_edges(
        "hotel_selection",
        _route_after_hotel_selection,
        {
            "hotel_prebook": "hotel_prebook",
            END:             END,
        },
    )

    # hotel_prebook → (final_itinerary | END)
    graph.add_conditional_edges(
        "hotel_prebook",
        _route_after_hotel_prebook,
        {
            "final_itinerary": "final_itinerary",
            END:               END,
        },
    )

    # final → END
    graph.add_edge("final_itinerary", END)

    return graph.compile()


# ---------------------------------------------------------------------------
# Singleton compiled graph
# ---------------------------------------------------------------------------

_compiled_graph = None


def get_graph():
    """Return the singleton compiled LangGraph graph."""
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph
