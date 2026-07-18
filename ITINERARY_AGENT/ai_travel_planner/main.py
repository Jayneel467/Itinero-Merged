"""
AI Travel Planner — Main Entry Point
======================================
Runs the interactive conversation loop by calling LangGraph node functions
directly — one node per turn — instead of using graph.invoke() which runs
the entire graph to completion and hits the recursion limit.

This gives us precise control: after every node execution we check whether
we need user input before proceeding to the next node.

Auto-advance stages (no user input needed — run immediately after prev node):
  FLIGHT_SEARCH, FLIGHT_PREBOOK, DRAFT_ITINERARY, HOTEL_PREBOOK, FINAL_ITINERARY

Await-input stages (pause and prompt the user before proceeding):
  REQUIREMENT_COLLECTION, FLIGHT_SEARCH_CONFIRMATION, FLIGHT_SELECTION,
  FLIGHT_PREBOOK_CONFIRMATION, DRAFT_ITINERARY_REVIEW,
  HOTEL_SEARCH, HOTEL_SELECTION, HOTEL_PREBOOK_CONFIRMATION
"""
from __future__ import annotations

import sys
from typing import Any, Callable

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
from ai_travel_planner.utils.display import (
    console,
    print_agent_message,
    print_banner,
    print_error,
    print_info,
)
from ai_travel_planner.utils.logger import get_logger

logger = get_logger("main")

# ── Map every WorkflowStage to the node function that handles it ─────────────
_NODE_MAP: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    WorkflowStage.GREETING.value:                    node_greeting,
    WorkflowStage.REQUIREMENT_COLLECTION.value:      node_collect_requirements,
    WorkflowStage.FLIGHT_SEARCH_CONFIRMATION.value:  node_flight_search_confirmation,
    WorkflowStage.FLIGHT_SEARCH.value:               node_flight_search,
    WorkflowStage.FLIGHT_SELECTION.value:            node_flight_selection,
    WorkflowStage.FLIGHT_PREBOOK_CONFIRMATION.value: node_flight_prebook_confirmation,
    WorkflowStage.FLIGHT_PREBOOK.value:              node_flight_prebook,
    WorkflowStage.DRAFT_ITINERARY.value:             node_draft_itinerary,
    WorkflowStage.DRAFT_ITINERARY_REVIEW.value:      node_draft_itinerary_review,
    WorkflowStage.HOTEL_SEARCH.value:                node_hotel_search,
    WorkflowStage.HOTEL_SELECTION.value:             node_hotel_selection,
    WorkflowStage.HOTEL_PREBOOK_CONFIRMATION.value:  node_hotel_prebook_confirmation,
    WorkflowStage.HOTEL_PREBOOK.value:               node_hotel_prebook,
    WorkflowStage.FINAL_ITINERARY.value:             node_final_itinerary,
    WorkflowStage.ERROR.value:                       node_error,
}

# ── Stages that run automatically — no user input before them ────────────────
_AUTO_ADVANCE_STAGES = {
    WorkflowStage.FLIGHT_SEARCH.value,
    WorkflowStage.FLIGHT_PREBOOK.value,
    WorkflowStage.DRAFT_ITINERARY.value,
    WorkflowStage.HOTEL_PREBOOK.value,
    WorkflowStage.FINAL_ITINERARY.value,
}


def _get_stage(state_dict: dict[str, Any]) -> str:
    return str(state_dict.get("current_stage", WorkflowStage.GREETING.value))


def _display_new_messages(old_count: int, state_dict: dict[str, Any]) -> int:
    """Print any new assistant messages added since old_count. Returns new total count."""
    history: list[dict[str, str]] = (
        state_dict.get("conversation", {}).get("message_history", [])
    )
    new_msgs = history[old_count:]
    for msg in new_msgs:
        if msg.get("role") == "assistant":
            print_agent_message(msg["content"])
    return len(history)


def _inject_user_input(state_dict: dict[str, Any], user_input: str) -> dict[str, Any]:
    """Write the user's message into the state dict."""
    state_dict["last_user_input"] = user_input
    conv = state_dict.setdefault("conversation", {})
    history = conv.setdefault("message_history", [])
    history.append({"role": "user", "content": user_input})
    conv["last_user_message"] = user_input
    conv["turn_count"] = conv.get("turn_count", 0) + 1
    return state_dict


def _run_node(stage: str, state_dict: dict[str, Any]) -> dict[str, Any]:
    """Execute the node function for the given stage and return updated state."""
    node_fn = _NODE_MAP.get(stage)
    if node_fn is None:
        logger.warning("No node found for stage: %s — ending session.", stage)
        return state_dict
    logger.info("Running node for stage: %s", stage)
    return node_fn(state_dict)


def run_conversation_loop(state_dict: dict[str, Any]) -> None:
    """
    Main loop — runs one node at a time, pausing for user input where needed.

    Flow per iteration:
      1. Read current stage.
      2. If auto-advance  → run its node immediately, print output, loop.
      3. If await-input   → read user input, inject it, run the node, print output.
      4. If COMPLETED     → exit.
    """
    msg_count = 0

    # Step 0: run greeting node immediately (no input needed)
    state_dict = _run_node(WorkflowStage.GREETING.value, state_dict)
    msg_count = _display_new_messages(msg_count, state_dict)

    while True:
        stage = _get_stage(state_dict)

        # Terminal
        if stage == WorkflowStage.COMPLETED.value:
            print_info("Session complete. Thank you for using AI Travel Planner!")
            break

        # Auto-advance (no user input needed before this stage)
        if stage in _AUTO_ADVANCE_STAGES:
            logger.debug("Auto-advancing: %s", stage)
            state_dict = _run_node(stage, state_dict)
            msg_count = _display_new_messages(msg_count, state_dict)
            continue

        # Await user input
        try:
            user_input = console.input("\n[bold green]👤 You:[/bold green] ").strip()
        except (EOFError, KeyboardInterrupt):
            print_info("\nSession interrupted. Goodbye!")
            break

        if not user_input:
            continue

        if user_input.lower() in ("quit", "exit", "bye", "q"):
            print_agent_message(
                "Thank you for using AI Travel Planner! Have a wonderful trip! ✈️"
            )
            break

        # Inject user input and run the current stage's node
        state_dict = _inject_user_input(state_dict, user_input)
        state_dict = _run_node(stage, state_dict)
        msg_count = _display_new_messages(msg_count, state_dict)


def main() -> None:
    """Application entry point."""
    print_banner()

    # Validate environment
    try:
        from ai_travel_planner.utils.config import get_settings
        settings = get_settings()
        logger.info("Configuration loaded — model: %s", settings.itinerary_agent_model)
    except Exception as exc:
        print_error(
            f"Configuration error: {exc}\n"
            "Make sure you have a .env file with OPENAI_API_KEY set.\n"
            "Copy .env.example to .env and fill in your API key."
        )
        sys.exit(1)

    # Initial state
    initial_state = AppState()
    state_dict = initial_state.model_dump(mode="json")

    # Run conversation
    try:
        run_conversation_loop(state_dict)
    except KeyboardInterrupt:
        print_info("\nSession ended by user.")
    except Exception as exc:
        print_error(f"Unexpected error: {exc}")
        logger.exception("Unhandled exception in conversation loop")
        sys.exit(1)


if __name__ == "__main__":
    main()
