"""
Centralized State Management Models
====================================
All Pydantic models that form the single source of truth for the entire
AI Travel Planner application.  Every agent reads from and writes to
these models — no free-form dicts are passed between components.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ─────────────────────────────────────────────────────────────────────────────
# Enumerations
# ─────────────────────────────────────────────────────────────────────────────


class WorkflowStage(str, Enum):
    """Represents the current high-level stage of the travel planning workflow."""

    GREETING = "greeting"
    REQUIREMENT_COLLECTION = "requirement_collection"
    FLIGHT_SEARCH_CONFIRMATION = "flight_search_confirmation"
    FLIGHT_SEARCH = "flight_search"
    FLIGHT_SELECTION = "flight_selection"
    # IMPROVEMENT: Outbound selection done; now select return flight (round-trip)
    RETURN_FLIGHT_SELECTION = "return_flight_selection"
    FLIGHT_PREBOOK_CONFIRMATION = "flight_prebook_confirmation"
    # IMPROVEMENT: Collect passenger names/contact before prebook
    PASSENGER_DETAILS = "passenger_details"
    FLIGHT_PREBOOK = "flight_prebook"
    # IMPROVEMENT: Payment step before final booking
    FLIGHT_PAYMENT = "flight_payment"
    # IMPROVEMENT: Final confirmed booking (generates permanent booking IDs)
    FLIGHT_BOOKING = "flight_booking"
    DRAFT_ITINERARY = "draft_itinerary"
    DRAFT_ITINERARY_REVIEW = "draft_itinerary_review"
    HOTEL_SEARCH = "hotel_search"
    HOTEL_SELECTION = "hotel_selection"
    HOTEL_PREBOOK_CONFIRMATION = "hotel_prebook_confirmation"
    HOTEL_PREBOOK = "hotel_prebook"
    # IMPROVEMENT: Hotel payment + final hotel booking
    HOTEL_PAYMENT = "hotel_payment"
    HOTEL_BOOKING = "hotel_booking"
    FINAL_ITINERARY = "final_itinerary"
    COMPLETED = "completed"
    ERROR = "error"


class PendingAction(str, Enum):
    """Actions that are waiting for explicit user confirmation."""

    NONE = "none"
    SEARCH_FLIGHTS = "search_flights"
    PREBOOK_FLIGHT = "prebook_flight"
    CONFIRM_PAYMENT = "confirm_payment"
    APPROVE_DRAFT_ITINERARY = "approve_draft_itinerary"
    SEARCH_HOTELS = "search_hotels"
    PREBOOK_HOTELS = "prebook_hotels"
    CONFIRM_HOTEL_PAYMENT = "confirm_hotel_payment"
    FINALIZE_ITINERARY = "finalize_itinerary"


class CabinClass(str, Enum):
    ECONOMY = "Economy"
    PREMIUM_ECONOMY = "Premium Economy"
    BUSINESS = "Business"
    FIRST = "First"


class MealPlan(str, Enum):
    ROOM_ONLY = "Room Only"
    BREAKFAST = "Breakfast Included"
    HALF_BOARD = "Half Board"
    FULL_BOARD = "Full Board"
    ALL_INCLUSIVE = "All Inclusive"


class TripType(str, Enum):
    ONE_WAY = "one_way"
    ROUND_TRIP = "round_trip"


class AgentResponseStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL = "partial"
    NOT_FOUND = "not_found"
    ERROR = "error"
    PENDING_CONFIRMATION = "pending_confirmation"


# ─────────────────────────────────────────────────────────────────────────────
# Search Parameter Models
# ─────────────────────────────────────────────────────────────────────────────


class FlightSearchParams(BaseModel):
    """Parameters collected from the user for a flight search."""

    origin: str | None = Field(None, description="Departure city / airport code")
    destination: str | None = Field(None, description="Arrival city / airport code")
    departure_date: date | None = Field(None, description="Outbound flight date")
    return_date: date | None = Field(None, description="Return flight date (round-trip)")
    adults: int = Field(1, ge=1, le=9, description="Number of adult passengers")
    children: int = Field(0, ge=0, le=9, description="Number of child passengers")
    cabin_class: CabinClass = CabinClass.ECONOMY
    trip_type: TripType = TripType.ROUND_TRIP
    max_budget_per_person: float | None = Field(None, description="Maximum price per passenger")
    preferred_airlines: list[str] = Field(default_factory=list)
    nonstop_preferred: bool = False

    @field_validator("departure_date", "return_date", mode="before")
    @classmethod
    def parse_date(cls, v: Any) -> date | None:
        if v is None:
            return None
        if isinstance(v, date):
            return v
        return date.fromisoformat(str(v))

    def missing_required_fields(self) -> list[str]:
        """Return a list of field names that are still missing."""
        missing: list[str] = []
        if not self.origin:
            missing.append("departure city")
        if not self.destination:
            missing.append("destination city")
        if not self.departure_date:
            missing.append("departure date")
        if self.trip_type == TripType.ROUND_TRIP and not self.return_date:
            missing.append("return date")
        # IMPROVEMENT: also require passenger count and cabin class explicitly
        return missing

    def next_missing_field(self) -> str | None:
        """Return the single next missing field (for one-question-at-a-time flow)."""
        missing = self.missing_required_fields()
        return missing[0] if missing else None

    def is_complete(self) -> bool:
        return len(self.missing_required_fields()) == 0


class HotelSearchParams(BaseModel):
    """Parameters used to search hotels for a specific night of the itinerary."""

    location: str = Field(..., description="City or area for the hotel")
    check_in: date = Field(..., description="Check-in date")
    check_out: date = Field(..., description="Check-out date")
    adults: int = Field(1, ge=1)
    children: int = Field(0, ge=0)
    max_budget_per_night: float | None = None
    min_star_rating: float = Field(3.0, ge=1.0, le=5.0)
    meal_plan: MealPlan = MealPlan.BREAKFAST
    free_cancellation: bool = False
    amenities_required: list[str] = Field(default_factory=list)
    room_type_preference: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Flight Models
# ─────────────────────────────────────────────────────────────────────────────


class FlightOption(BaseModel):
    """A single flight option returned by the Flight Agent."""

    flight_id: str = Field(default_factory=lambda: f"FL-{uuid.uuid4().hex[:8].upper()}")
    airline: str
    flight_number: str
    origin: str
    destination: str
    departure_time: datetime
    arrival_time: datetime
    duration_minutes: int
    stops: int = 0
    stopover_cities: list[str] = Field(default_factory=list)
    cabin_class: CabinClass = CabinClass.ECONOMY
    price_per_adult: float
    price_per_child: float = 0.0
    total_price: float
    baggage_included: str = "15 kg check-in + 7 kg cabin"
    refund_policy: str = "Non-refundable"
    seats_available: int
    rank_score: float = Field(0.0, description="Internal ranking score 0–10")
    recommended: bool = False

    @property
    def duration_display(self) -> str:
        h, m = divmod(self.duration_minutes, 60)
        return f"{h}h {m}m"


class FlightAgentResponse(BaseModel):
    """Structured output contract from the Flight Agent to the Itinerary Agent."""

    status: AgentResponseStatus
    action_performed: str
    summary: str
    flights: list[FlightOption] = Field(default_factory=list)
    recommended_flight: FlightOption | None = None
    selected_flight: FlightOption | None = None
    total_results: int = 0
    filters_applied: dict[str, Any] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    suggested_next_action: str = ""
    raw_instruction: str = ""


class FlightPrebook(BaseModel):
    """Pre-booking record for a flight."""

    prebook_id: str = Field(default_factory=lambda: f"FPB-{uuid.uuid4().hex[:10].upper()}")
    flight: FlightOption
    passengers: dict[str, int] = Field(default_factory=dict)  # {"adults": 2, "children": 0}
    total_price: float
    currency: str = "INR"
    booking_status: str = "Pre-booked (Pending Confirmation)"
    booking_expiry: datetime
    created_at: datetime = Field(default_factory=datetime.now)


class FlightPrebookResponse(BaseModel):
    """Structured output from a flight pre-booking operation."""

    status: AgentResponseStatus
    action_performed: str = "prebook_flight"
    summary: str
    prebook: FlightPrebook | None = None
    errors: list[str] = Field(default_factory=list)
    suggested_next_action: str = "Review draft itinerary"


# ─────────────────────────────────────────────────────────────────────────────
# IMPROVEMENT: Passenger Details Model
# ─────────────────────────────────────────────────────────────────────────────

class PassengerDetail(BaseModel):
    """Contact and identity details for a single passenger."""

    passenger_type: str = "adult"  # "adult" | "child"
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""

    def is_complete(self) -> bool:
        """All mandatory fields are filled and valid."""
        import re
        if not self.first_name.strip() or not self.last_name.strip():
            return False
        if not re.match(r"[^@]+@[^@]+\.[^@]+", self.email):
            return False
        if not re.match(r"^\+?[\d\s\-]{7,15}$", self.phone):
            return False
        return True

    def missing_fields(self) -> list[str]:
        import re
        missing = []
        if not self.first_name.strip():
            missing.append("first name")
        if not self.last_name.strip():
            missing.append("last name")
        if not re.match(r"[^@]+@[^@]+\.[^@]+", self.email):
            missing.append("valid email address")
        if not re.match(r"^\+?[\d\s\-]{7,15}$", self.phone):
            missing.append("valid phone number")
        return missing


# ─────────────────────────────────────────────────────────────────────────────
# IMPROVEMENT: Payment + Final Booking Models
# ─────────────────────────────────────────────────────────────────────────────

class PaymentRecord(BaseModel):
    """Simulated payment record (dummy — no real payment gateway)."""

    payment_id: str = Field(
        default_factory=lambda: f"PAY-{uuid.uuid4().hex[:10].upper()}"
    )
    amount: float
    currency: str = "INR"
    method: str = "Credit Card"  # dummy
    status: str = "Paid"
    paid_at: datetime = Field(default_factory=datetime.now)


class FlightBooking(BaseModel):
    """Final confirmed flight booking record with permanent booking ID."""

    booking_id: str = Field(
        default_factory=lambda: f"FBK-{uuid.uuid4().hex[:10].upper()}"
    )
    prebook_id: str
    flight: FlightOption
    passengers: list[PassengerDetail] = Field(default_factory=list)
    payment: PaymentRecord | None = None
    total_price: float
    currency: str = "INR"
    booking_status: str = "Confirmed"
    booked_at: datetime = Field(default_factory=datetime.now)
    # Round-trip: may have a paired return booking_id
    return_booking_id: str | None = None


class HotelBooking(BaseModel):
    """Final confirmed hotel booking record with permanent booking ID."""

    booking_id: str = Field(
        default_factory=lambda: f"HBK-{uuid.uuid4().hex[:10].upper()}"
    )
    prebook_id: str
    hotel: HotelOption
    check_in: date
    check_out: date
    room_type: str
    guests: list[PassengerDetail] = Field(default_factory=list)
    payment: PaymentRecord | None = None
    total_price: float
    currency: str = "INR"
    booking_status: str = "Confirmed"
    booked_at: datetime = Field(default_factory=datetime.now)
    day_label: str = ""


# ─────────────────────────────────────────────────────────────────────────────
# Hotel Models
# ─────────────────────────────────────────────────────────────────────────────


class HotelOption(BaseModel):
    """A single hotel option returned by the Hotel Agent."""

    hotel_id: str = Field(default_factory=lambda: f"HT-{uuid.uuid4().hex[:8].upper()}")
    name: str
    star_rating: float = Field(..., ge=1.0, le=5.0)
    location: str
    area: str
    distance_from_center_km: float
    amenities: list[str] = Field(default_factory=list)
    room_type: str
    meal_plan: MealPlan
    cancellation_policy: str
    check_in_time: str = "14:00"
    check_out_time: str = "12:00"
    price_per_night: float
    total_price: float
    nights: int = 1
    rank_score: float = Field(0.0, description="Internal ranking score 0–10")
    recommended: bool = False
    image_description: str = ""


class HotelAgentResponse(BaseModel):
    """Structured output contract from the Hotel Agent to the Itinerary Agent."""

    status: AgentResponseStatus
    action_performed: str
    summary: str
    search_params: HotelSearchParams | None = None
    hotels: list[HotelOption] = Field(default_factory=list)
    recommended_hotel: HotelOption | None = None
    selected_hotel: HotelOption | None = None
    total_results: int = 0
    filters_applied: dict[str, Any] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    suggested_next_action: str = ""
    raw_instruction: str = ""
    day_label: str = ""


class HotelPrebook(BaseModel):
    """Pre-booking record for a hotel."""

    prebook_id: str = Field(default_factory=lambda: f"HPB-{uuid.uuid4().hex[:10].upper()}")
    hotel: HotelOption
    check_in: date
    check_out: date
    room_type: str
    guests: dict[str, int] = Field(default_factory=dict)
    total_price: float
    currency: str = "INR"
    booking_status: str = "Pre-booked (Pending Confirmation)"
    booking_expiry: datetime
    created_at: datetime = Field(default_factory=datetime.now)
    day_label: str = ""


class HotelPrebookResponse(BaseModel):
    """Structured output from a hotel pre-booking operation."""

    status: AgentResponseStatus
    action_performed: str = "prebook_hotel"
    summary: str
    prebook: HotelPrebook | None = None
    errors: list[str] = Field(default_factory=list)
    suggested_next_action: str = "Proceed to final itinerary"


# ─────────────────────────────────────────────────────────────────────────────
# Itinerary Models
# ─────────────────────────────────────────────────────────────────────────────


class ItineraryActivity(BaseModel):
    """A single time-bound activity within a travel day."""

    time: str = Field(..., description="24h time string, e.g. '14:30'")
    description: str
    category: str = Field(
        "general",
        description="One of: transport, check-in, check-out, meal, sightseeing, leisure, flight",
    )
    duration_minutes: int | None = None
    location: str | None = None
    notes: str = ""


class ItineraryDay(BaseModel):
    """A single day within the travel itinerary."""

    day_number: int
    date: date
    title: str
    hotel_name: str | None = None
    hotel_prebook_id: str | None = None
    activities: list[ItineraryActivity] = Field(default_factory=list)
    notes: str = ""


class DraftItinerary(BaseModel):
    """Draft itinerary generated after flight pre-booking, before hotels."""

    trip_title: str
    origin: str
    destination: str
    departure_date: date
    return_date: date | None
    total_days: int
    days: list[ItineraryDay] = Field(default_factory=list)
    generated_at: datetime = Field(default_factory=datetime.now)
    version: int = 1
    notes: str = ""


class FinalItinerary(BaseModel):
    """Complete itinerary including flights, hotels, and day-wise schedule."""

    trip_title: str
    origin: str
    destination: str
    departure_date: date
    return_date: date | None

    # Flight summary
    outbound_flight: FlightOption | None = None
    return_flight: FlightOption | None = None
    flight_prebook_id: str | None = None

    # Hotel summaries
    hotel_prebook_ids: list[str] = Field(default_factory=list)
    hotel_names: list[str] = Field(default_factory=list)

    # Day-wise plan
    total_days: int = 0
    days: list[ItineraryDay] = Field(default_factory=list)

    # Meta
    total_flight_cost: float = 0.0
    total_hotel_cost: float = 0.0
    grand_total: float = 0.0
    currency: str = "INR"
    generated_at: datetime = Field(default_factory=datetime.now)
    version: int = 1


# ─────────────────────────────────────────────────────────────────────────────
# Per-Agent State Buckets
# ─────────────────────────────────────────────────────────────────────────────


class TripState(BaseModel):
    """Core trip parameters collected from the user."""

    search_params: FlightSearchParams = Field(default_factory=FlightSearchParams)
    trip_type: TripType = TripType.ROUND_TRIP
    is_complete: bool = False


class FlightState(BaseModel):
    """All flight-related state for the current session."""

    # Outbound search results
    search_results: list[FlightOption] = Field(default_factory=list)
    recommended_flight: FlightOption | None = None
    selected_flight: FlightOption | None = None

    # IMPROVEMENT: Round-trip return flight
    return_search_results: list[FlightOption] = Field(default_factory=list)
    return_recommended_flight: FlightOption | None = None
    selected_return_flight: FlightOption | None = None

    prebook: FlightPrebook | None = None
    # IMPROVEMENT: Return flight prebook
    return_prebook: FlightPrebook | None = None

    last_agent_response: FlightAgentResponse | None = None
    search_performed: bool = False
    selection_made: bool = False
    # IMPROVEMENT: Track return selection separately
    return_selection_made: bool = False
    prebook_done: bool = False

    # IMPROVEMENT: Final booking records
    booking: FlightBooking | None = None
    return_booking: FlightBooking | None = None


class HotelState(BaseModel):
    """All hotel-related state for the current session."""

    # Keyed by day label (e.g. "Day 1", "Day 2") → list of options
    search_results_by_day: dict[str, list[HotelOption]] = Field(default_factory=dict)
    recommended_by_day: dict[str, HotelOption] = Field(default_factory=dict)
    # User-selected hotel per day
    selected_hotels: dict[str, HotelOption] = Field(default_factory=dict)
    # Pre-booking records per day
    prebooks: dict[str, HotelPrebook] = Field(default_factory=dict)
    last_agent_responses: list[HotelAgentResponse] = Field(default_factory=list)
    current_search_day: str | None = None
    all_days_searched: bool = False
    all_hotels_selected: bool = False
    prebook_done: bool = False
    # IMPROVEMENT: Final hotel booking records keyed by day_label
    bookings: dict[str, HotelBooking] = Field(default_factory=dict)


class ItineraryState(BaseModel):
    """Itinerary-related state."""

    draft: DraftItinerary | None = None
    draft_approved: bool = False
    final: FinalItinerary | None = None
    modification_requests: list[str] = Field(default_factory=list)


class ConversationState(BaseModel):
    """Conversation memory and turn tracking."""

    turn_count: int = 0
    last_user_message: str = ""
    last_agent_message: str = ""
    # Raw message history for LLM context (list of {"role": ..., "content": ...})
    message_history: list[dict[str, str]] = Field(default_factory=list)
    clarification_pending: bool = False
    clarification_question: str = ""


class UserPreferences(BaseModel):
    """User's qualitative preferences collected during conversation."""

    hotel_preference: str | None = None       # "beach", "city center", "near airport"
    room_preference: str | None = None        # "sea view", "suite", "standard"
    meal_preference: MealPlan = MealPlan.BREAKFAST
    amenities_wanted: list[str] = Field(default_factory=list)
    free_cancellation: bool = False
    brand_preference: str | None = None
    special_requests: str | None = None
    sightseeing_interests: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Master Application State
# ─────────────────────────────────────────────────────────────────────────────


class AppState(BaseModel):
    """
    Single source of truth for the entire AI Travel Planner session.

    This object is persisted across every LangGraph node invocation and is
    the only thing passed between the Itinerary Agent and the worker agents.
    """

    session_id: str = Field(default_factory=lambda: f"SESS-{uuid.uuid4().hex[:8].upper()}")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # ── Workflow control ──────────────────────────────────────────────────────
    current_stage: WorkflowStage = WorkflowStage.GREETING
    pending_action: PendingAction = PendingAction.NONE
    error_message: str | None = None
    # The last response that should be shown to the user
    agent_response_text: str = ""
    # Flag: did the user just confirm a pending action?
    user_confirmed: bool = False
    # Raw last user input — used by nodes to route decisions
    last_user_input: str = ""

    # ── Sub-state buckets ─────────────────────────────────────────────────────
    trip: TripState = Field(default_factory=TripState)
    conversation: ConversationState = Field(default_factory=ConversationState)
    flights: FlightState = Field(default_factory=FlightState)
    hotels: HotelState = Field(default_factory=HotelState)
    itinerary: ItineraryState = Field(default_factory=ItineraryState)
    preferences: UserPreferences = Field(default_factory=UserPreferences)

    # IMPROVEMENT: Passenger details and payment
    passengers: list[PassengerDetail] = Field(default_factory=list)
    flight_payment: PaymentRecord | None = None
    hotel_payment: PaymentRecord | None = None

    def touch(self) -> None:
        """Update the timestamp whenever state is mutated."""
        self.updated_at = datetime.now()

    def add_user_message(self, content: str) -> None:
        self.conversation.message_history.append({"role": "user", "content": content})
        self.conversation.last_user_message = content
        self.conversation.turn_count += 1
        self.last_user_input = content
        self.touch()

    def add_assistant_message(self, content: str) -> None:
        self.conversation.message_history.append({"role": "assistant", "content": content})
        self.conversation.last_agent_message = content
        self.agent_response_text = content
        self.touch()

    def set_stage(self, stage: WorkflowStage) -> None:
        self.current_stage = stage
        self.touch()

    def set_pending_action(self, action: PendingAction) -> None:
        self.pending_action = action
        self.user_confirmed = False
        self.touch()

    def confirm_pending_action(self) -> None:
        self.user_confirmed = True
        self.touch()

    def clear_pending_action(self) -> None:
        self.pending_action = PendingAction.NONE
        self.user_confirmed = False
        self.touch()
