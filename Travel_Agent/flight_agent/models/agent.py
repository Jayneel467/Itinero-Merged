"""LangGraph agent state and public API models."""

from typing import Annotated, Any

from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from flight_agent.models.intents import FlightIntent


class SessionContext(BaseModel):
    """Persistent booking session data across conversation turns."""

    selected_offer_id: str | None = None
    verified_offer_id: str | None = None
    prebook_id: str | None = None
    transaction_id: str | None = None
    secret_key: str | None = None
    booking_id: str | None = None
    last_search_results: list[dict[str, Any]] = Field(default_factory=list)
    last_verified_offer: dict[str, Any] | None = None
    last_prebook: dict[str, Any] | None = None
    last_booking: dict[str, Any] | None = None
    # Partial traveler details collected across short user replies
    traveler_draft: dict[str, Any] = Field(default_factory=dict)
    selected_offer_index: int | None = None
    search_context: dict[str, Any] = Field(default_factory=dict)
    booking_requirements: dict[str, Any] = Field(default_factory=dict)
    available_services: dict[str, Any] = Field(default_factory=dict)
    selected_services: list[dict[str, Any]] = Field(default_factory=list)
    awaiting_booking_confirmation: bool = False
    booking_confirmed: bool = False
    awaiting_payment_confirmation: bool = False
    payment_confirmed: bool = False
    passengers_confirmed: bool = False
    service_preference: str | None = None
    awaiting_service_preference: bool = False


class FlightAgentInput(BaseModel):
    """Public input for the Flight Agent — designed for Supervisor/MCP integration."""

    message: str = Field(min_length=1, description="User message")
    session_id: str | None = Field(default=None, description="Optional session identifier")
    session_context: SessionContext | None = Field(
        default=None,
        description="Optional persisted context from a previous turn",
    )
    history: list[dict[str, str]] = Field(
        default_factory=list,
        description="Prior turns [{role: user|assistant, content: ...}] for multi-turn context",
    )


class FlightAgentOutput(BaseModel):
    """Public output from the Flight Agent."""

    response: str
    intent: FlightIntent
    session_context: SessionContext
    operation_result: dict[str, Any] | None = None
    error: str | None = None
    needs_follow_up: bool = False


class FlightAgentState(TypedDict):
    """LangGraph state schema."""

    messages: Annotated[list, add_messages]
    session: SessionContext
    last_tool: str | None
    operation_result: dict[str, Any] | None
    error: str | None
    user_message: str
    query_hints: Any
