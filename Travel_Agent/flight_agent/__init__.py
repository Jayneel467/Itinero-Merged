"""
Flight Agent — search / book / retrieve / cancel via GPT + LangGraph + LiteAPI.

  from flight_agent import FlightAgent, FlightAgentInput, SessionContext
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

__version__ = "1.1.0"

__all__ = [
    "FlightAgent",
    "FlightAgentInput",
    "FlightAgentOutput",
    "SessionContext",
    "__version__",
]

if TYPE_CHECKING:
    from flight_agent.agent import FlightAgent as FlightAgent
    from flight_agent.models import (
        FlightAgentInput as FlightAgentInput,
        FlightAgentOutput as FlightAgentOutput,
        SessionContext as SessionContext,
    )


def __getattr__(name: str) -> Any:
    if name == "FlightAgent":
        from flight_agent.agent import FlightAgent

        return FlightAgent
    if name in {"FlightAgentInput", "FlightAgentOutput", "SessionContext"}:
        from flight_agent import models

        return getattr(models, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
