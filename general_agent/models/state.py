"""
Shared state schema for the Itinero orchestrator agent.

Kept intentionally small for the MVP: just the running message history plus
a lightweight `trip_context` dict the agent (or future specialist agents)
can use to remember trip details across turns without re-asking the user.
"""
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages

def merge_dicts(a: dict, b: dict) -> dict:
    if a is None:
        return b or {}
    a = a.copy()
    a.update(b or {})
    return a


class AgentState(TypedDict):
    # Full conversation history. `add_messages` merges new messages instead
    # of overwriting, which is what makes multi-turn memory work.
    messages: Annotated[list, add_messages]

    # Persistent state tracker for trip details gathered across turns.
    # LLM calls update_trip_context to write here, and the graph injects it
    # back into the prompt so the LLM doesn't forget.
    trip_context: Annotated[dict, merge_dicts]
