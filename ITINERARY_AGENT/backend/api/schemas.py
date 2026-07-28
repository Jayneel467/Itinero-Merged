"""
Request / Response Pydantic schemas for the FastAPI layer.

These are deliberately kept separate from the domain models in
backend/models/state.py so the API contract can evolve independently.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Generic wrappers
# ---------------------------------------------------------------------------

class SuccessResponse(BaseModel):
    success: bool = True
    message: str  = "OK"


class ErrorResponse(BaseModel):
    success: bool = False
    error: str


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

class CreateSessionResponse(BaseModel):
    session_id: str
    welcome_message: str


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    assistant_message: str
    workflow_step: str
    ui_action: Optional[str] = None
    # Structured payloads the frontend may render
    flight_results: Optional[List[Dict[str, Any]]] = None
    hotel_results: Optional[List[Dict[str, Any]]] = None
    draft_itinerary: Optional[Dict[str, Any]] = None
    final_itinerary: Optional[Dict[str, Any]] = None
    trip_requirements: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Flight endpoints
# ---------------------------------------------------------------------------

class FlightSearchRequest(BaseModel):
    session_id: str
    origin: str
    destination: str
    departure_date: str
    num_passengers: int = 1
    cabin_class: Optional[str] = "Economy"
    max_price: Optional[float] = None
    max_stops: Optional[int] = None


class FlightSearchResponse(BaseModel):
    session_id: str
    flights: List[Dict[str, Any]]
    count: int


class FlightSelectRequest(BaseModel):
    session_id: str
    flight_id: str


class FlightSelectResponse(BaseModel):
    session_id: str
    selected_flight: Dict[str, Any]
    assistant_message: str


class FlightPrebookRequest(BaseModel):
    session_id: str
    flight_id: str
    num_passengers: int = 1


class FlightPrebookResponse(BaseModel):
    session_id: str
    prebook_id: str
    flight: Dict[str, Any]
    total_charged: float
    status: str
    assistant_message: str


# ---------------------------------------------------------------------------
# Hotel endpoints
# ---------------------------------------------------------------------------

class HotelSearchRequest(BaseModel):
    session_id: str
    destination: str
    check_in: str
    check_out: str
    num_guests: int = 1
    max_price_per_night: Optional[float] = None
    min_rating: Optional[float] = None


class HotelSearchResponse(BaseModel):
    session_id: str
    hotels: List[Dict[str, Any]]
    count: int


class HotelSelectRequest(BaseModel):
    session_id: str
    hotel_id: str
    day_number: int = Field(..., description="Which trip day (1-based) this hotel covers")


class HotelSelectResponse(BaseModel):
    session_id: str
    day_number: int
    selected_hotel: Dict[str, Any]
    all_days_selected: bool
    assistant_message: str


class HotelPrebookRequest(BaseModel):
    session_id: str
    # List of {hotel_id, day_number} for bulk booking
    selections: List[Dict[str, Any]]


class HotelPrebookResponse(BaseModel):
    session_id: str
    # keyed by day_number string e.g. {"1": prebookObj, "2": prebookObj}
    prebooks: Dict[str, Any]
    total_charged: float
    assistant_message: str


# ---------------------------------------------------------------------------
# Itinerary endpoints
# ---------------------------------------------------------------------------

class DraftItineraryRequest(BaseModel):
    session_id: str


class DraftItineraryResponse(BaseModel):
    session_id: str
    draft: Dict[str, Any]
    markdown: str


class FinalItineraryRequest(BaseModel):
    session_id: str


class FinalItineraryResponse(BaseModel):
    session_id: str
    final: Dict[str, Any]
    markdown: str


class ItineraryStatusResponse(BaseModel):
    session_id: str
    workflow_step: str
    trip_requirements: Optional[Dict[str, Any]]
    has_flight: bool
    has_draft: bool
    has_hotels: bool
    has_final: bool


# ---------------------------------------------------------------------------
# Itinerary versioning endpoints
# ---------------------------------------------------------------------------

class ItineraryVersionSummary(BaseModel):
    """Lightweight version metadata (no full itinerary body)."""
    version_number:    int
    label:             str
    created_at:        str
    is_active:         bool
    trip_requirements: Optional[Dict[str, Any]] = None


class VersionListResponse(BaseModel):
    session_id:      str
    versions:        List[ItineraryVersionSummary]
    active_version:  int   # 0 if none active yet
    total_versions:  int


class RegenerateItineraryRequest(BaseModel):
    session_id:           str
    # Optional trip requirement overrides sent from the edit form.
    # If omitted the current state.trip_requirements are used.
    budget:               Optional[float]  = None
    destination:          Optional[str]    = None
    departure_date:       Optional[str]    = None
    return_date:          Optional[str]    = None
    num_travelers:        Optional[int]    = None
    trip_type:            Optional[str]    = None
    special_requests:     Optional[str]    = None
    # Free-form label for the new version (auto-generated when omitted)
    version_label:        Optional[str]    = None


class RegenerateItineraryResponse(BaseModel):
    session_id:      str
    version_number:  int
    label:           str
    draft:           Dict[str, Any]
    markdown:        str
    assistant_message: str


class CompareVersionsRequest(BaseModel):
    session_id:  str
    v1:          int   # version number (1-based)
    v2:          int


class CompareVersionsResponse(BaseModel):
    session_id:      str
    comparison:      Dict[str, Any]   # full build_comparison() output
    assistant_message: str


class SetActiveVersionRequest(BaseModel):
    session_id:      str
    version_number:  int


class SetActiveVersionResponse(BaseModel):
    session_id:      str
    version_number:  int
    label:           str
    draft:           Dict[str, Any]
    assistant_message: str


# ---------------------------------------------------------------------------
# Requirements form submission
# ---------------------------------------------------------------------------

class SubmitRequirementsRequest(BaseModel):
    session_id:       str
    departure_city:   str
    destination:      str
    departure_date:   str
    return_date:      str
    num_travelers:    int = 1
    budget:           float = 0.0
    trip_type:        str = "leisure"
    special_requests: Optional[str] = None


class SubmitRequirementsResponse(BaseModel):
    session_id:        str
    success:           bool = True
    message:           str = ""
    assistant_message: str = ""
    workflow_step:     str = ""
    ui_action:         str = "show_message"
