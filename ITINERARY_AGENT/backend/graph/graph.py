from __future__ import annotations

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from backend.models.state import AppState, WorkflowStep
from backend.graph.nodes import (
    node_supervisor,
    node_collect_requirements,
    node_check_missing_info,
    node_ask_missing_questions,
    node_user_confirmation,
    node_flight_search,
    node_flight_ranking,
    node_flight_selection,
    node_flight_passenger_details,
    node_flight_prebook,
    node_flight_prebooked,
    node_draft_itinerary,
    node_draft_confirm,
    node_edit_trip_details,
    node_hotel_search,
    node_hotel_ranking,
    node_hotel_selection,
    node_hotel_room_selection,
    node_hotel_summary,
    node_hotel_prebook,
    node_hotel_prebook_retry,
    node_final_itinerary,
    step_to_node,
    WORKER_NODES,
)


# ---------------------------------------------------------------------------
# Supervisor router
# ---------------------------------------------------------------------------

def supervisor_router(state: AppState) -> str:
    step = state.workflow_step
    if step == WorkflowStep.COMPLETED:
        return END
    return step_to_node(step)


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    graph = StateGraph(AppState)

    graph.add_node("supervisor",           node_supervisor)
    graph.add_node("collect_requirements",  node_collect_requirements)
    graph.add_node("check_missing_info",    node_check_missing_info)
    graph.add_node("ask_missing_questions", node_ask_missing_questions)
    graph.add_node("user_confirmation",     node_user_confirmation)
    graph.add_node("flight_search",         node_flight_search)
    graph.add_node("flight_ranking",        node_flight_ranking)
    graph.add_node("flight_selection",      node_flight_selection)
    graph.add_node("flight_passenger_details", node_flight_passenger_details)
    graph.add_node("flight_prebook",        node_flight_prebook)
    graph.add_node("flight_prebooked",      node_flight_prebooked)
    graph.add_node("draft_itinerary",       node_draft_itinerary)
    graph.add_node("draft_confirm",         node_draft_confirm)
    graph.add_node("edit_trip_details",     node_edit_trip_details)
    graph.add_node("hotel_search",          node_hotel_search)
    graph.add_node("hotel_ranking",         node_hotel_ranking)
    graph.add_node("hotel_selection",       node_hotel_selection)
    graph.add_node("hotel_room_selection",  node_hotel_room_selection)
    graph.add_node("hotel_summary",         node_hotel_summary)
    graph.add_node("hotel_prebook",         node_hotel_prebook)
    graph.add_node("hotel_prebook_retry",   node_hotel_prebook_retry)
    graph.add_node("final_itinerary",       node_final_itinerary)

    graph.set_entry_point("supervisor")

    # All workers return to supervisor
    for node_name in list(WORKER_NODES.values()):
        graph.add_edge(node_name, "supervisor")

    # Supervisor routes to next worker or END
    all_workers = list(WORKER_NODES.values())
    route_map = {w: w for w in all_workers}
    route_map[END] = END

    graph.add_conditional_edges(
        "supervisor",
        supervisor_router,
        route_map,
    )

    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_compiled_graph = None


def get_graph() -> StateGraph:
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_graph()
    return _compiled_graph
