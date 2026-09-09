"""Itinero multi-agent orchestration — matches architecture diagram.

  Start → General Agent
            ├─ flight     → Itinerary Agent → Travel Agent → Flight Agent
            ├─ hotel      → Itinerary Agent → Hotel Agent
            └─ itinerary  → Itinerary Agent → (Hotel + Flight as needed)
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent


class OrchestratorInput(BaseModel):
    """One user turn into the General Agent."""

    message: str = Field(min_length=1)
    session_id: str | None = None
    session_context: SessionContext | None = None
    history: list[dict[str, str]] = Field(default_factory=list)


class OrchestratorOutput(BaseModel):
    """Reply after routing through the architecture path."""

    response: str
    intent: FlightIntent = FlightIntent.GENERAL
    session_context: SessionContext
    route_path: list[str] = Field(default_factory=list)
    routed_to: str = "general_agent"
    booking_ready: bool = False
    payment_ready: bool = False
    operation_result: dict[str, Any] | None = None
    error: str | None = None
