"""
Shared state schema for the Itinero orchestrator agent.

Kept intentionally small for the MVP: just the running message history plus
a lightweight `trip_context` dict the agent (or future specialist agents)
can use to remember trip details across turns without re-asking the user.
"""
from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Full conversation history. `add_messages` merges new messages instead
    # of overwriting, which is what makes multi-turn memory work.
    messages: Annotated[list, add_messages]

    # Free-form scratchpad for trip details the agent picks up during the
    # conversation (destination, dates, budget, preferences, etc).
    # Not auto-populated yet - reserved so future tools/agents can read
    # and write structured context here instead of re-parsing messages.
    trip_context: dict
