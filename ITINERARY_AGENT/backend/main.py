from __future__ import annotations

import os
import sys
from typing import Any, Dict, Optional

from langgraph.types import Command

from backend.config import settings
from backend.graph.graph import get_graph
from backend.models.state import AppState, WorkflowStep


def run_travel_planner() -> None:
    """
    Single entry point for the AI Travel Planner.

    Launches a terminal-based conversation where LangGraph manages the
    complete travel planning process using interrupt()/resume() for every
    user interaction.  No HTTP server, no REST endpoints, no frontend.
    """
    # Ensure API keys are set
    if settings.openai_api_key:
        os.environ.setdefault("OPENAI_API_KEY", settings.openai_api_key)

    graph = get_graph()
    config: Dict[str, Any] = {"configurable": {"thread_id": "travel-planner-main"}}

    print("=" * 72)
    print("  {}  AI TRAVEL PLANNER".format(chr(9992)))
    print("  Intelligent trip planning powered by GPT-4o-mini + LangGraph")
    print("=" * 72)
    print()

    initial_state = AppState()
    first = True
    user_input = ""

    while True:
        try:
            if first:
                result = graph.invoke(initial_state, config)
                first = False
            else:
                result = graph.invoke(Command(resume=user_input), config)
        except Exception as exc:
            print(f"\n[ERROR] {exc}")
            break

        state_snapshot = graph.get_state(config)

        # Print assistant messages produced in this step
        _print_state_output(result)

        # --- Determine whether the graph is waiting or done ---
        tasks = state_snapshot.tasks if hasattr(state_snapshot, "tasks") else ()
        has_interrupts = any(
            getattr(t, "interrupts", None) for t in (tasks or ())
        )
        has_next = bool(
            getattr(state_snapshot, "next", None)
        )

        if not has_interrupts and not has_next:
            break

        # --- Display interrupt value(s) ---
        for task in (tasks or ()):
            for interrupt_val in (getattr(task, "interrupts", None) or ()):
                val = _extract_interrupt_value(interrupt_val)
                if val:
                    print(f"\n{val}")

        # --- Read user input ---
        try:
            user_input = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\nGoodbye!")
            break

        if user_input.lower() in ("exit", "quit", "bye"):
            print("Goodbye! Safe travels! {} ".format(chr(9992)))
            break

    _print_completion(state_snapshot)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _print_state_output(result: Any) -> None:
    if result is None:
        return
    if isinstance(result, dict):
        msg = result.get("current_assistant_message", "") or ""
        if msg.strip():
            print(f"\n{msg}")
    elif hasattr(result, "current_assistant_message"):
        msg = getattr(result, "current_assistant_message", "") or ""
        if msg.strip():
            print(f"\n{msg}")


def _extract_interrupt_value(interrupt_val: Any) -> str:
    if hasattr(interrupt_val, "value"):
        return str(interrupt_val.value)
    return str(interrupt_val)


def _print_completion(snapshot: Any) -> None:
    if not snapshot or not hasattr(snapshot, "values"):
        return
    values = snapshot.values
    if isinstance(values, dict):
        step = values.get("workflow_step", "")
    else:
        step = getattr(values, "workflow_step", "")
    if "completed" in str(step).lower() or getattr(snapshot, "next", None) is None:
        print()
        print("=" * 72)
        print("  {} TRIP PLANNING COMPLETE".format(chr(10004)))
        print("=" * 72)


# ===========================================================================
# CLI entry point
# ===========================================================================

if __name__ == "__main__":
    run_travel_planner()
