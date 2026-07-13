"""Shared dependencies injected into LangGraph nodes."""

from dataclasses import dataclass

from flight_agent.llm.nlp import FlightNLP
from flight_agent.services.flight_service import FlightService


@dataclass
class NodeDependencies:
    """Injectable dependencies for graph nodes — enables testing and MCP wiring."""

    flight_service: FlightService
    nlp: FlightNLP
