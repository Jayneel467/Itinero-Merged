"""Public models for the Travel Agent (parent of Flight Agent in the workflow)."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent


class TravelTask(str, Enum):
    """High-level travel tasks routed from General Agent."""

    TRAVEL_SEARCH = "travel_search"
    TRAVEL_BOOKING = "travel_booking"
    GENERAL = "general"


class TravelAgentInput(BaseModel):
    """Input from General Agent / Supervisor."""

    message: str = Field(min_length=1, description="User or upstream agent message")
    session_id: str | None = Field(default=None, description="Conversation session id")
    task_hint: TravelTask | None = Field(
        default=None,
        description="Optional hint: travel_search or travel_booking",
    )
    session_context: SessionContext | None = Field(
        default=None,
        description="Persisted flight booking session from prior turns",
    )
    history: list[dict[str, str]] = Field(
        default_factory=list,
        description="Prior turns [{role: user|assistant, content: ...}]",
    )


class ItineraryFlightPayload(BaseModel):
    """Structured flight output for Itinerary Agent."""

    agent: str = "flight"
    status: str = Field(
        description="search_results | verified | prebooked | booked | in_progress",
    )
    route: dict[str, Any] = Field(default_factory=dict)
    selected_option: int | None = None
    offers: list[dict[str, Any]] = Field(default_factory=list)
    verified_offer: dict[str, Any] | None = None
    booking: dict[str, Any] | None = None
    summary: str = ""


class TravelAgentOutput(BaseModel):
    """Output back to General Agent and Itinerary Agent."""

    response: str
    travel_task: TravelTask
    flight_intent: FlightIntent
    sub_agent: str = "flight"
    session_context: SessionContext
    operation_result: dict[str, Any] | None = None
    itinerary_payload: ItineraryFlightPayload | None = None
    needs_follow_up: bool = False
    escalate_to_supervisor: bool = False
    error: str | None = None
