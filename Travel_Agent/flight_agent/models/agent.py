from __future__ import annotations
"""LangGraph agent state and public I/O models."""

from typing import Annotated, Any

from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from flight_agent.models.intents import FlightIntent


class SessionContext(BaseModel):
    """Booking session — owned by the caller across turns."""

    selected_offer_id: str | None = None
    verified_offer_id: str | None = None
    prebook_id: str | None = None
    transaction_id: str | None = None
    secret_key: str | None = None
    publishable_key: str | None = None
    booking_id: str | None = None
    payment_captured: bool = False
    last_search_results: list[dict[str, Any]] = Field(default_factory=list)
    last_verified_offer: dict[str, Any] | None = None
    last_prebook: dict[str, Any] | None = None
    last_booking: dict[str, Any] | None = None
    traveler_draft: dict[str, Any] = Field(default_factory=dict)
    travelers_draft: list[dict[str, Any]] = Field(default_factory=list)
    current_traveler_index: int = 0
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
    service_choices: list[dict[str, Any]] = Field(default_factory=list)
    awaiting_cancel_confirmation: bool = False
    cancel_confirmed: bool = False
    pending_cancel_booking_id: str | None = None


class FlightAgentInput(BaseModel):
    """Input for one Flight Agent turn (Supervisor or UI)."""

    message: str = Field(min_length=1)
    session_id: str | None = None
    session_context: SessionContext | None = None
    history: list[dict[str, str]] = Field(default_factory=list)


class FlightAgentOutput(BaseModel):
    """Output from one Flight Agent turn."""

    response: str
    intent: FlightIntent
    session_id: str | None = None
    session_context: SessionContext
    operation_result: dict[str, Any] | None = None
    error: str | None = None
    needs_follow_up: bool = False


class FlightAgentState(TypedDict):
    """LangGraph state."""

    messages: Annotated[list, add_messages]
    session: SessionContext
    last_tool: str | None
    operation_result: dict[str, Any] | None
    error: str | None
    user_message: str
    route: str
