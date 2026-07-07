"""
Flight Agent — production-ready LangGraph orchestration for flight booking.

Designed for integration with a Supervisor Agent or MCP server via the
public ``FlightAgent`` class and ``FlightAgentInput`` / ``FlightAgentOutput`` models.
"""

from flight_agent.agent import FlightAgent
from flight_agent.models import FlightAgentInput, FlightAgentOutput, SessionContext

__version__ = "1.0.0"

__all__ = [
    "FlightAgent",
    "FlightAgentInput",
    "FlightAgentOutput",
    "SessionContext",
    "__version__",
]
