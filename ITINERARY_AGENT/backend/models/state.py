"""
AppState and all Pydantic models for the AI Travel Itinerary Planner.

This module defines the central state object (AppState) that is passed
through every LangGraph node, plus all supporting data models.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------

class WorkflowStep(str, Enum):
    """Represents the current position in the planning workflow."""
    COLLECT_REQUIREMENTS  = "collect_requirements"
    CHECK_MISSING_INFO    = "check_missing_info"
    ASK_MISSING_QUESTIONS = "ask_missing_questions"
    USER_CONFIRMATION     = "user_confirmation"
    FLIGHT_SEARCH         = "flight_search"
    FLIGHT_RANKING        = "flight_ranking"
    FLIGHT_SELECTION      = "flight_selection"
    FLIGHT_PREBOOK        = "flight_prebook"
    FLIGHT_PREBOOKED       = "flight_prebooked"
    DRAFT_ITINERARY       = "draft_itinerary"
    DRAFT_CONFIRM         = "draft_confirm"
    EDIT_TRIP_DETAILS     = "edit_trip_details"
    HOTEL_SEARCH          = "hotel_search"
    HOTEL_RANKING         = "hotel_ranking"
    HOTEL_SELECTION       = "hotel_selection"
    HOTEL_PREBOOK         = "hotel_prebook"
    FINAL_ITINERARY       = "final_itinerary"
    COMPLETED             = "completed"


class TripType(str, Enum):
    LEISURE    = "leisure"
    BUSINESS   = "business"
    ADVENTURE  = "adventure"
    HONEYMOON  = "honeymoon"
    FAMILY     = "family"
    SOLO       = "solo"


class CabinClass(str, Enum):
    ECONOMY         = "Economy"
    PREMIUM_ECONOMY = "Premium Economy"
    BUSINESS        = "Business"
    FIRST           = "First"


class RankingCriteria(str, Enum):
    PRICE      = "price"
    DURATION   = "duration"
    BEST_VALUE = "best_value"
    RATING     = "rating"
    DISTANCE   = "distance"


# ---------------------------------------------------------------------------
# Trip Requirements
# ---------------------------------------------------------------------------

class TripRequirements(BaseModel):
    """Holds all user-provided trip details."""
    departure_city:   Optional[str]      = None
    destination:      Optional[str]      = None
    departure_date:   Optional[str]      = None   # ISO date string e.g. "2025-03-15"
    return_date:      Optional[str]      = None
    num_travelers:    Optional[int]      = None
    budget:           Optional[float]    = None   # total budget in INR
    trip_type:        Optional[TripType] = None
    special_requests: Optional[str]      = None

    def missing_fields(self) -> List[str]:
        required = {
            "departure_city": self.departure_city,
            "destination":    self.destination,
            "departure_date": self.departure_date,
            "return_date":    self.return_date,
            "num_travelers":  self.num_travelers,
            "budget":         self.budget,
            "trip_type":      self.trip_type,
        }
        return [k for k, v in required.items() if v is None]

    def is_complete(self) -> bool:
        return len(self.missing_fields()) == 0


# ---------------------------------------------------------------------------
# Flight Models
# ---------------------------------------------------------------------------

class Flight(BaseModel):
    """Represents a single flight option returned by the Flight Agent."""
    flight_id:          str
    airline:            str
    flight_number:      str
    departure_airport:  str
    arrival_airport:    str
    departure_time:     str           # ISO datetime e.g. "2025-03-15T08:30:00"
    arrival_time:       str
    duration_minutes:   int
    stops:              int
    price_per_person:   float
    total_price:        float
    cabin:              CabinClass
    refundable:         bool
    baggage_included:   bool
    ranking_score:      Optional[float] = None

    @property
    def duration_display(self) -> str:
        h, m = divmod(self.duration_minutes, 60)
        return f"{h}h {m}m"


class FlightSearchParams(BaseModel):
    """Parameters sent to the Flight Agent for a search."""
    origin:         str
    destination:    str
    departure_date: str
    num_passengers: int
    cabin_class:    Optional[CabinClass] = CabinClass.ECONOMY
    max_price:      Optional[float]      = None
    max_stops:      Optional[int]        = None


class FlightPrebook(BaseModel):
    """Records a confirmed flight pre-booking."""
    prebook_id:    str
    flight:        Flight
    passengers:    int
    total_charged: float
    status:        str = "confirmed"


# ---------------------------------------------------------------------------
# Hotel Models
# ---------------------------------------------------------------------------

class Hotel(BaseModel):
    """Represents a single hotel option returned by the Hotel Agent."""
    hotel_id:                str
    name:                    str
    rating:                  float           # 1.0 – 5.0
    address:                 str
    distance_from_center_km: float
    price_per_night:         float
    amenities:               List[str]
    room_type:               str
    check_in:                str             # ISO date string
    check_out:               str
    total_price:             float
    ranking_score:           Optional[float] = None
    image_placeholder:       str             = "🏨"


class HotelSearchParams(BaseModel):
    """Parameters sent to the Hotel Agent for a search."""
    destination:         str
    check_in:            str
    check_out:           str
    num_guests:          int
    max_price_per_night: Optional[float] = None
    min_rating:          Optional[float] = None


class HotelPrebook(BaseModel):
    """Records a confirmed hotel pre-booking."""
    prebook_id:    str
    hotel:         Hotel
    check_in:      str
    check_out:     str
    guests:        int
    total_charged: float
    status:        str           = "confirmed"
    day_number:    Optional[int] = None   # which day of the itinerary this covers


# ---------------------------------------------------------------------------
# Itinerary Models — enhanced
# ---------------------------------------------------------------------------

class WeatherInfo(BaseModel):
    """Weather forecast for a single day."""
    date_str:      str            # "24 Jul 2026"
    temperature_c: int
    condition:     str            # "Sunny & Clear"
    humidity_pct:  int
    advice:        str            # "Carry an umbrella."


class BudgetBreakdown(BaseModel):
    """Itemised trip budget."""
    flights:      float = 0.0
    hotel:        float = 0.0
    food:         float = 0.0
    transport:    float = 0.0
    activities:   float = 0.0
    shopping:     float = 0.0
    buffer:       float = 0.0

    @property
    def total(self) -> float:
        return round(
            self.flights + self.hotel + self.food + self.transport
            + self.activities + self.shopping + self.buffer,
            2,
        )


class DailyCost(BaseModel):
    """Estimated cost breakdown for a single day."""
    food:       float = 0.0
    transport:  float = 0.0
    tickets:    float = 0.0
    shopping:   float = 0.0

    @property
    def total(self) -> float:
        return round(self.food + self.transport + self.tickets + self.shopping, 2)


class RestaurantRecommendation(BaseModel):
    """A restaurant recommendation entry."""
    name:         str
    cuisine:      str
    approx_cost:  str          # e.g. "₹600–₹900 per person"
    why:          str          # one-line recommendation reason


class TravelDetail(BaseModel):
    """A single point-to-point travel segment."""
    from_place:  str
    to_place:    str
    distance:    str           # e.g. "12 km"
    est_time:    str           # e.g. "25 min"
    transport:   str           # e.g. "Taxi / Ola"


class DayActivity(BaseModel):
    """Detailed schedule for a single day."""
    day_number:           int
    date:                 str
    morning:              str
    breakfast:            str
    mid_morning:          str  = ""
    sightseeing:          str
    travel_time:          str
    lunch:                str
    afternoon_activities: str
    evening_activities:   str
    dinner:               str
    night:                str  = ""
    hotel_stay:           str
    timeline:             List[Dict[str, str]]           = Field(default_factory=list)
    daily_cost:           Optional[DailyCost]            = None
    travel_details:       List[TravelDetail]             = Field(default_factory=list)
    restaurants:          List[RestaurantRecommendation] = Field(default_factory=list)


class DraftItinerary(BaseModel):
    """Draft itinerary shown before hotel booking."""
    trip_summary:     str
    flight_info:      str
    days:             List[DayActivity]
    estimated_budget: float
    budget_breakdown: Optional[BudgetBreakdown] = None
    weather:          List[WeatherInfo]          = Field(default_factory=list)
    notes:            List[str]                  = Field(default_factory=list)
    markdown:         str                        = ""   # pre-rendered markdown
    web_data:         Optional[Dict[str, Any]]   = None  # Tavily research data for frontend
    draft_hotel:      Optional[Dict[str, Any]]   = None  # suggested hotel snapshot for frontend
    travel_tips:      List[str]                  = Field(default_factory=list)
    trip_title:       str                        = ""


class FinalItinerary(BaseModel):
    """Complete itinerary shown after all bookings."""
    trip_title:       str
    trip_summary:     str
    flight_details:   str
    hotel_details:    str
    days:             List[DayActivity]
    total_cost:       float
    budget_breakdown: Optional[BudgetBreakdown]  = None
    weather:          List[WeatherInfo]           = Field(default_factory=list)
    travel_tips:      List[str]                   = Field(default_factory=list)
    important_notes:  List[str]                   = Field(default_factory=list)
    markdown:         str                         = ""   # pre-rendered markdown
    web_data:         Optional[Dict[str, Any]]    = None  # Tavily research data for frontend


# ---------------------------------------------------------------------------
# Itinerary Version Model
# ---------------------------------------------------------------------------

class ItineraryVersion(BaseModel):
    """
    Represents a single saved version of a draft itinerary.

    Versions are immutable snapshots — never overwrite, always append.
    The active version is tracked separately in AppState.active_itinerary_version.
    """
    version_number:   int
    label:            str                  # e.g. "Original", "Edited Budget", "Changed Destination"
    created_at:       str                  # ISO datetime string
    itinerary:        DraftItinerary
    trip_requirements: Optional[Dict[str, Any]] = None  # snapshot of requirements at creation time


# ---------------------------------------------------------------------------
# Conversation Message
# ---------------------------------------------------------------------------

class MessageRole(str, Enum):
    USER      = "user"
    ASSISTANT = "assistant"
    SYSTEM    = "system"


class ConversationMessage(BaseModel):
    role:     MessageRole
    content:  str
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Central Application State
# ---------------------------------------------------------------------------

class AppState(BaseModel):
    """
    Central state object threaded through all LangGraph nodes.

    Every node receives this object and returns an updated copy.
    Never mutate this object in place; always return a new instance.
    """

    # ---- Conversation ----
    conversation_history:     List[ConversationMessage] = Field(default_factory=list)
    current_user_message:     str = ""
    current_assistant_message: str = ""

    # ---- Workflow position ----
    workflow_step:       WorkflowStep = WorkflowStep.COLLECT_REQUIREMENTS
    missing_fields:      List[str]    = Field(default_factory=list)
    awaiting_user_input: bool         = True
    user_confirmed:      Optional[bool] = None

    # ---- Trip requirements ----
    trip_requirements: TripRequirements = Field(default_factory=TripRequirements)

    # ---- Flight data ----
    flight_search_results: List[Flight]          = Field(default_factory=list)
    selected_flight:       Optional[Flight]      = None
    flight_prebook:        Optional[FlightPrebook] = None

    # ---- Hotel data ----
    hotel_search_results: List[Hotel]                  = Field(default_factory=list)
    selected_hotels:      Dict[str, Hotel]             = Field(default_factory=dict)  # keyed by day number
    hotel_prebooks:       Dict[str, HotelPrebook]      = Field(default_factory=dict)

    # ---- Itineraries ----
    draft_itinerary: Optional[DraftItinerary] = None
    final_itinerary: Optional[FinalItinerary] = None

    # ---- Itinerary version history ----
    itinerary_versions:       List[ItineraryVersion] = Field(default_factory=list)
    active_itinerary_version: int                    = 0  # 0 = none active yet

    # ---- Session metadata ----
    session_id:    str            = ""
    error_message: Optional[str] = None

    # ---- UI hints sent back to the frontend ----
    ui_action: Optional[str] = None

    class Config:
        use_enum_values = True

    def add_user_message(self, content: str) -> "AppState":
        msg = ConversationMessage(role=MessageRole.USER, content=content)
        return self.model_copy(update={
            "conversation_history": self.conversation_history + [msg],
            "current_user_message": content,
        })

    def add_assistant_message(self, content: str, metadata: Optional[Dict] = None) -> "AppState":
        msg = ConversationMessage(role=MessageRole.ASSISTANT, content=content, metadata=metadata)
        return self.model_copy(update={
            "conversation_history":     self.conversation_history + [msg],
            "current_assistant_message": content,
        })

    def num_trip_days(self) -> int:
        if not self.trip_requirements.departure_date or not self.trip_requirements.return_date:
            return 1
        from datetime import date
        try:
            d1 = date.fromisoformat(self.trip_requirements.departure_date)
            d2 = date.fromisoformat(self.trip_requirements.return_date)
            return max(1, (d2 - d1).days)
        except ValueError:
            return 1
