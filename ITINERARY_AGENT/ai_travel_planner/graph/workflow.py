"""
LangGraph Workflow
==================
Assembles all nodes into a StateGraph and defines every edge and conditional
transition.  The graph models the full travel planning workflow:

  greeting
    → collect_requirements  (loop until complete)
    → flight_search_confirmation (yes/no gate)
    → flight_search
    → flight_selection       (loop until valid selection)
    → flight_prebook_confirmation (yes/no gate)
    → flight_prebook
    → draft_itinerary        (generate)
    → draft_itinerary_review (loop until approved)
    → hotel_search           (loop per day group)
    → hotel_selection        (loop per day group)
    → hotel_prebook_confirmation (yes/no gate)
    → hotel_prebook
    → final_itinerary
    → END

All routing decisions are based on state.current_stage, which is the single
source of truth set by each node.  No hardcoded step-to-step wiring.
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, StateGraph

from ai_travel_planner.graph.nodes import (
    node_collect_requirements,
    node_draft_itinerary,
    node_draft_itinerary_review,
    node_error,
    node_final_itinerary,
    node_flight_prebook,
    node_flight_prebook_confirmation,
    node_flight_search,
    node_flight_search_confirmation,
    node_flight_selection,
    node_greeting,
    node_hotel_prebook,
    node_hotel_prebook_confirmation,
    node_hotel_search,
    node_hotel_selection,
)
from ai_travel_planner.state.models import AppState, WorkflowStage
from ai_travel_planner.utils.logger import get_logger

logger = get_logger("graph.workflow")


# ─────────────────────────────────────────────────────────────────────────────
# Router (conditional edge function)
# ─────────────────────────────────────────────────────────────────────────────

def _route(state_dict: dict[str, Any]) -> str:
    """
    Master router — inspects state.current_stage and returns the name of the
    next node to execute.  Called after every node as a conditional edge.

    Note: LangGraph passes state as a plain dict.  AppState.model_dump(mode='json')
    serialises WorkflowStage enum values as their string values (e.g. "greeting"),
    so we normalise the stage to its string value before lookup.
    """
    raw_stage = state_dict.get("current_stage", WorkflowStage.GREETING.value)
    # Normalise: accept both enum instance and plain string
    stage_str = raw_stage.value if isinstance(raw_stage, WorkflowStage) else str(raw_stage)
    logger.debug("Router: current_stage=%s", stage_str)

    routing: dict[str, str] = {
        WorkflowStage.GREETING.value: "node_greeting",
        WorkflowStage.REQUIREMENT_COLLECTION.value: "node_collect_requirements",
        WorkflowStage.FLIGHT_SEARCH_CONFIRMATION.value: "node_flight_search_confirmation",
        WorkflowStage.FLIGHT_SEARCH.value: "node_flight_search",
        WorkflowStage.FLIGHT_SELECTION.value: "node_flight_selection",
        WorkflowStage.FLIGHT_PREBOOK_CONFIRMATION.value: "node_flight_prebook_confirmation",
        WorkflowStage.FLIGHT_PREBOOK.value: "node_flight_prebook",
        WorkflowStage.DRAFT_ITINERARY.value: "node_draft_itinerary",
        WorkflowStage.DRAFT_ITINERARY_REVIEW.value: "node_draft_itinerary_review",
        WorkflowStage.HOTEL_SEARCH.value: "node_hotel_search",
        WorkflowStage.HOTEL_SELECTION.value: "node_hotel_selection",
        WorkflowStage.HOTEL_PREBOOK_CONFIRMATION.value: "node_hotel_prebook_confirmation",
        WorkflowStage.HOTEL_PREBOOK.value: "node_hotel_prebook",
        WorkflowStage.FINAL_ITINERARY.value: "node_final_itinerary",
        WorkflowStage.COMPLETED.value: END,
        WorkflowStage.ERROR.value: "node_error",
    }

    return routing.get(stage_str, END)


# ─────────────────────────────────────────────────────────────────────────────
# Graph Builder
# ─────────────────────────────────────────────────────────────────────────────

def build_travel_planner_graph() -> Any:
    """
    Build and compile the full LangGraph StateGraph for the AI Travel Planner.

    The graph uses a dict-based state schema (AppState serialised as dict).
    Every node is connected to the master router via conditional edges so
    workflow transitions are fully data-driven — no hardcoded step sequences.

    Returns a compiled LangGraph runnable.
    """
    # Use a plain dict as the state type since LangGraph works with TypedDicts.
    # We serialise/deserialise AppState inside each node.
    graph = StateGraph(dict)

    # ── Register nodes ────────────────────────────────────────────────────────
    graph.add_node("node_greeting", node_greeting)
    graph.add_node("node_collect_requirements", node_collect_requirements)
    graph.add_node("node_flight_search_confirmation", node_flight_search_confirmation)
    graph.add_node("node_flight_search", node_flight_search)
    graph.add_node("node_flight_selection", node_flight_selection)
    graph.add_node("node_flight_prebook_confirmation", node_flight_prebook_confirmation)
    graph.add_node("node_flight_prebook", node_flight_prebook)
    graph.add_node("node_draft_itinerary", node_draft_itinerary)
    graph.add_node("node_draft_itinerary_review", node_draft_itinerary_review)
    graph.add_node("node_hotel_search", node_hotel_search)
    graph.add_node("node_hotel_selection", node_hotel_selection)
    graph.add_node("node_hotel_prebook_confirmation", node_hotel_prebook_confirmation)
    graph.add_node("node_hotel_prebook", node_hotel_prebook)
    graph.add_node("node_final_itinerary", node_final_itinerary)
    graph.add_node("node_error", node_error)

    # ── Entry point ───────────────────────────────────────────────────────────
    graph.set_entry_point("node_greeting")

    # ── Conditional edges from every node via master router ───────────────────
    _all_node_names = [
        "node_greeting",
        "node_collect_requirements",
        "node_flight_search_confirmation",
        "node_flight_search",
        "node_flight_selection",
        "node_flight_prebook_confirmation",
        "node_flight_prebook",
        "node_draft_itinerary",
        "node_draft_itinerary_review",
        "node_hotel_search",
        "node_hotel_selection",
        "node_hotel_prebook_confirmation",
        "node_hotel_prebook",
        "node_final_itinerary",
        "node_error",
    ]

    # The possible destinations the router can return
    _all_destinations = _all_node_names + [END]

    for node_name in _all_node_names:
        graph.add_conditional_edges(
            node_name,
            _route,
            {dest: dest for dest in _all_destinations},
        )

    compiled = graph.compile()
    logger.info("Travel planner graph compiled successfully.")
    return compiled
