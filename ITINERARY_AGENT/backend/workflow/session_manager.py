"""
Session Manager.

Maintains an in-memory dictionary of AppState objects keyed by session_id.
Each API request loads the correct state, runs the graph, then persists
the updated state back.

For production, replace the in-memory dict with Redis / a database.
"""

from __future__ import annotations

import uuid
from typing import Dict, Optional

from backend.models.state import AppState, WorkflowStep
from backend.workflow.graph import get_graph


# ---------------------------------------------------------------------------
# In-memory session store
# ---------------------------------------------------------------------------

_SESSIONS: Dict[str, AppState] = {}


def create_session() -> str:
    """Create a new session and return its ID."""
    session_id = uuid.uuid4().hex
    agent      = _get_itinerary_agent_instance()
    welcome    = agent.generate_welcome_message()

    initial_state = AppState(session_id=session_id)
    initial_state = initial_state.add_assistant_message(welcome)
    _SESSIONS[session_id] = initial_state
    return session_id


def get_session(session_id: str) -> Optional[AppState]:
    """Return the AppState for *session_id*, or None if not found."""
    return _SESSIONS.get(session_id)


def save_session(session_id: str, state: AppState) -> None:
    """Persist an updated state."""
    _SESSIONS[session_id] = state


def delete_session(session_id: str) -> None:
    """Remove a session (used for 'start new trip')."""
    _SESSIONS.pop(session_id, None)


def list_sessions() -> list[str]:
    """Return all active session IDs."""
    return list(_SESSIONS.keys())


# ---------------------------------------------------------------------------
# Core dispatch function
# ---------------------------------------------------------------------------

def process_user_message(
    session_id: str,
    user_message: str,
) -> AppState:
    """
    Main entry point called by API endpoints.

    1. Load state for the session.
    2. Add the user message.
    3. Route to the correct LangGraph starting node based on workflow_step.
    4. Run the graph.
    5. Save and return the updated state.
    """
    state = get_session(session_id)
    if state is None:
        raise ValueError(f"Session '{session_id}' not found")

    # Attach the incoming message
    state = state.add_user_message(user_message)
    state = state.model_copy(update={"awaiting_user_input": False})

    # Determine which node to invoke based on current workflow step
    entry_node = _step_to_entry_node(state.workflow_step)

    graph      = get_graph()
    state_dict = state.model_dump()

    # Override entry point by injecting state into the specific node directly
    # LangGraph's compiled graph always starts from "collect_requirements".
    # We use a simple dispatch map to call the right node function instead.
    updated_dict = _dispatch_to_node(entry_node, state_dict)
    updated_state = AppState(**updated_dict)

    # Run any automatic downstream nodes (non-interactive ones)
    updated_state = _run_automatic_nodes(updated_state)

    save_session(session_id, updated_state)
    return updated_state


def _step_to_entry_node(step: WorkflowStep) -> str:
    """Map the current workflow step to the node that should handle the next message."""
    mapping = {
        WorkflowStep.COLLECT_REQUIREMENTS: "collect_requirements",
        WorkflowStep.CHECK_MISSING_INFO:   "collect_requirements",
        WorkflowStep.ASK_MISSING_QUESTIONS:"collect_requirements",
        WorkflowStep.USER_CONFIRMATION:    "user_confirmation",
        WorkflowStep.FLIGHT_SEARCH:        "flight_search",
        WorkflowStep.FLIGHT_RANKING:       "flight_ranking",
        WorkflowStep.FLIGHT_SELECTION:     "flight_selection",
        WorkflowStep.FLIGHT_PREBOOK:       "flight_prebook",
        WorkflowStep.DRAFT_ITINERARY:      "draft_itinerary",
        WorkflowStep.HOTEL_SEARCH:         "hotel_search",
        WorkflowStep.HOTEL_RANKING:        "hotel_ranking",
        WorkflowStep.HOTEL_SELECTION:      "hotel_selection",
        WorkflowStep.HOTEL_PREBOOK:        "hotel_prebook",
        WorkflowStep.FINAL_ITINERARY:      "final_itinerary",
        WorkflowStep.COMPLETED:            "collect_requirements",  # restart
    }
    return mapping.get(step, "collect_requirements")


def _dispatch_to_node(node_name: str, state_dict: dict) -> dict:
    """Call the named node function directly."""
    from backend.workflow.nodes import (
        node_collect_requirements,
        node_check_missing_info,
        node_ask_missing_questions,
        node_user_confirmation,
        node_flight_search,
        node_flight_ranking,
        node_flight_selection,
        node_flight_prebook,
        node_draft_itinerary,
        node_hotel_search,
        node_hotel_ranking,
        node_hotel_selection,
        node_hotel_prebook,
        node_final_itinerary,
    )
    node_map = {
        "collect_requirements":  node_collect_requirements,
        "check_missing_info":    node_check_missing_info,
        "ask_missing_questions": node_ask_missing_questions,
        "user_confirmation":     node_user_confirmation,
        "flight_search":         node_flight_search,
        "flight_ranking":        node_flight_ranking,
        "flight_selection":      node_flight_selection,
        "flight_prebook":        node_flight_prebook,
        "draft_itinerary":       node_draft_itinerary,
        "hotel_search":          node_hotel_search,
        "hotel_ranking":         node_hotel_ranking,
        "hotel_selection":       node_hotel_selection,
        "hotel_prebook":         node_hotel_prebook,
        "final_itinerary":       node_final_itinerary,
    }
    fn = node_map.get(node_name)
    if fn is None:
        raise ValueError(f"Unknown node: {node_name}")
    return fn(state_dict)


def _run_automatic_nodes(state: AppState) -> AppState:
    """
    After the primary node runs, automatically execute any subsequent
    nodes that don't require user input (e.g. check_missing → ask, or
    flight_search → ranking).

    Stops when awaiting_user_input is True or no automatic next node exists.
    """
    AUTO_CHAIN: Dict[str, str] = {
        # After collect → always check missing
        "collect_requirements": "check_missing_info",
        # After flight_search → always rank
        "flight_search":        "flight_ranking",
        # After hotel_search → handled by conditional logic inside session_manager
    }

    current_step = state.workflow_step

    # Run check_missing after collect
    if current_step == WorkflowStep.CHECK_MISSING_INFO and not state.awaiting_user_input:
        from backend.workflow.nodes import node_check_missing_info
        state_dict  = _dispatch_to_node("check_missing_info", state.model_dump())
        state       = AppState(**state_dict)

        # If there are missing fields, ask them now
        if state.missing_fields:
            state_dict = _dispatch_to_node("ask_missing_questions", state.model_dump())
            state      = AppState(**state_dict)
            return state

        # No missing fields — show confirmation
        state_dict = _dispatch_to_node("user_confirmation", state.model_dump())
        state      = AppState(**state_dict)
        return state

    # After flight_search, auto-rank
    if current_step == WorkflowStep.FLIGHT_RANKING and not state.awaiting_user_input:
        state_dict = _dispatch_to_node("flight_ranking", state.model_dump())
        state      = AppState(**state_dict)
        return state

    # After hotel_search results arrive, auto-rank
    if (
        current_step == WorkflowStep.HOTEL_RANKING
        and state.hotel_search_results
        and not state.awaiting_user_input
    ):
        state_dict = _dispatch_to_node("hotel_ranking", state.model_dump())
        state      = AppState(**state_dict)
        return state

    return state


# ---------------------------------------------------------------------------
# Helper: lazy import to avoid circular deps
# ---------------------------------------------------------------------------

def _get_itinerary_agent_instance():
    from backend.agents.itinerary_agent import ItineraryAgent
    return ItineraryAgent()
