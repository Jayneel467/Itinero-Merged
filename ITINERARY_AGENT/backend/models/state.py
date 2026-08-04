"""
AppState and all Pydantic models for the AI Travel Itinerary Planner.

This module defines the central state object (AppState) that is passed
through every LangGraph node, plus all supporting data models.
"""

from __future__ import annotations

import re
from datetime import date
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel


def _is_placeholder_phone(phone: str) -> bool:
    """
    Detect obviously placeholder phone numbers (long ascending/descending
    digit runs, e.g. 1234567890 / 9876543210) — LiteAPI rejects these
    with a 500 "placeholder (sequential digits)" error.
    """
    digits = phone.strip()
    if len(digits) < 8:
        return False
    asc = sum(
        1 for i in range(len(digits) - 1)
        if (int(digits[i + 1]) - int(digits[i])) % 10 == 1
    )
    desc = sum(
        1 for i in range(len(digits) - 1)
        if (int(digits[i]) - int(digits[i + 1])) % 10 == 1
    )
    return asc >= len(digits) - 2 or desc >= len(digits) - 2


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
    FLIGHT_PASSENGER_DETAILS = "flight_passenger_details"
    FLIGHT_PREBOOK        = "flight_prebook"
    FLIGHT_PREBOOKED       = "flight_prebooked"
    DRAFT_ITINERARY       = "draft_itinerary"
    DRAFT_CONFIRM         = "draft_confirm"
    EDIT_TRIP_DETAILS     = "edit_trip_details"
    HOTEL_SEARCH          = "hotel_search"
    HOTEL_RANKING         = "hotel_ranking"
    HOTEL_SELECTION       = "hotel_selection"
    HOTEL_ROOM_SELECTION  = "hotel_room_selection"
    HOTEL_SUMMARY         = "hotel_summary"
    HOTEL_REUSE_CHECK     = "hotel_reuse_check"
    HOTEL_PREBOOK         = "hotel_prebook"
    HOTEL_PREBOOK_RETRY   = "hotel_prebook_retry"
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
    offer_id:           Optional[str] = None   # LiteAPI offerId — required for pre-booking
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


# ---------------------------------------------------------------------------
# Flight booking models (LiteAPI pre-booking)
# ---------------------------------------------------------------------------

class PassengerType(str, Enum):
    """Passenger category accepted by the LiteAPI booking API."""
    ADULT  = "ADULT"
    CHILD  = "CHILD"
    INFANT = "INFANT"


class PassengerGender(str, Enum):
    """Gender code accepted by the LiteAPI booking API."""
    MALE   = "M"
    FEMALE = "F"
    OTHER  = "X"


class TravelDocument(BaseModel):
    """Passport / travel document of a passenger (LiteAPI `document`)."""
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    number:          str
    expiry_date:     str            # ISO date, must be in the future
    issuing_country: str            # ISO-2 country code, e.g. "IN"
    nationality:     str            # ISO-2 country code, e.g. "IN"
    type:            str = "PASSPORT"

    @field_validator("number", "issuing_country", "nationality")
    @classmethod
    def _not_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Document details are required")
        return v.upper()

    @field_validator("expiry_date")
    @classmethod
    def _valid_expiry(cls, v: str) -> str:
        v = (v or "").strip()
        try:
            d = date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("Expiry date must be in YYYY-MM-DD format") from exc
        if d <= date.today():
            raise ValueError("Expiry date must be in the future")
        return v


class Passenger(BaseModel):
    """A single traveller as required by the LiteAPI pre-booking API."""
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    type:        PassengerType = PassengerType.ADULT
    first_name:  str
    last_name:   str
    gender:      PassengerGender
    birthday:    str             # ISO date, must be in the past
    nationality: Optional[str]   = None   # ISO-2 country code, e.g. "IN"
    document_type: Optional[str] = None   # e.g. "passport" / "id"
    document_issue_country: Optional[str] = None  # ISO-2 code, e.g. "IN"
    document_number: Optional[str] = None
    document_expiry: Optional[str] = None  # ISO date
    document:    Optional[TravelDocument] = None

    @field_validator("first_name", "last_name")
    @classmethod
    def _name_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Passenger name is required")
        return v

    @field_validator("nationality")
    @classmethod
    def _valid_nationality(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not str(v).strip():
            return None
        v = str(v).strip().upper()
        if not re.fullmatch(r"[A-Z]{2}", v):
            raise ValueError("Nationality must be a 2-letter ISO code (e.g. IN)")
        return v

    @field_validator("birthday")
    @classmethod
    def _valid_birthday(cls, v: str) -> str:
        v = (v or "").strip()
        try:
            d = date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError("Birthday must be in YYYY-MM-DD format") from exc
        if d >= date.today():
            raise ValueError("Birthday must be in the past")
        return v


class ContactDetails(BaseModel):
    """Contact information of the person making the booking."""
    model_config = ConfigDict(populate_by_name=True, alias_generator=to_camel)

    first_name:         str
    last_name:          str
    email:              str
    phone:              str               # local number, no country code (e.g. "9876543210")
    phone_country_code: str = "91"        # numeric dialling code (e.g. "91" for India)

    @field_validator("first_name", "last_name")
    @classmethod
    def _name_required(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Contact name is required")
        return v

    @field_validator("email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = (v or "").strip()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("Invalid email address")
        return v

    @field_validator("phone")
    @classmethod
    def _valid_phone(cls, v: str) -> str:
        v = (v or "").strip()
        if not re.fullmatch(r"[0-9]{7,15}", v):
            raise ValueError("Invalid phone number (7-15 digits, no country code)")
        if _is_placeholder_phone(v):
            raise ValueError(
                "Phone number appears to be a placeholder (sequential digits). "
                "Please provide a valid phone number."
            )
        return v

    @field_validator("phone_country_code")
    @classmethod
    def _valid_phone_country_code(cls, v: str) -> str:
        v = (v or "").strip().lstrip("+")
        if not re.fullmatch(r"[0-9]{1,4}", v):
            raise ValueError("Invalid phone country code (numeric, e.g. 91)")
        return v


class PassengerFormData(BaseModel):
    """Complete payload collected from the Passenger Details form."""
    contact:    ContactDetails
    passengers: List[Passenger] = Field(min_length=1)

    @model_validator(mode="after")
    def _at_least_one_passenger(self) -> "PassengerFormData":
        if not self.passengers:
            raise ValueError("At least one passenger is required")
        return self


class FlightPrebook(BaseModel):
    """Records a confirmed flight pre-booking with the full LiteAPI response."""
    prebook_id:      str
    flight:          Flight
    passengers:      int               # number of travellers
    total_charged:   float
    status:          str = "confirmed"

    # ---- LiteAPI pre-booking details ----
    offer_id:          Optional[str]              = None
    contact:           Optional[ContactDetails]   = None
    passenger_details: List[Passenger]            = Field(default_factory=list)
    booking_status:    Optional[str]              = None   # e.g. "WAIT" / "HOLD" / "BOOKABLE"
    hold_expiry:       Optional[str]              = None
    bookable:          Optional[bool]             = None
    currency:          Optional[str]              = None
    raw_response:      Optional[Dict[str, Any]]   = None   # complete LiteAPI prebooks response


# ---------------------------------------------------------------------------
# Hotel Models
# ---------------------------------------------------------------------------

def _coerce_refundable(value: Any) -> Optional[bool]:
    """
    LiteAPI returns `refundableTag` as a string code ("REF", "NRFN", "RFNC")
    rather than a boolean. Normalise it to a real bool (None when unknown).
    """
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    tag = str(value).strip().upper()
    if not tag:
        return None
    if tag in ("TRUE", "YES", "1", "REF", "RFNC"):
        return True
    return False


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
    # ---- LiteAPI room-offer details (optional — backward compatible) ----
    offer_id:                Optional[str]   = None
    board_name:              Optional[str]   = None
    currency:                Optional[str]   = None
    refundable:              Optional[bool]  = None
    cancel_policy:           Optional[Any]   = None
    # ---- Images & details for the "Details More" section (optional) ----
    hotel_images:            List[str]                = Field(default_factory=list)
    hotel_description:       str                      = ""
    hotel_facilities:        List[str]                = Field(default_factory=list)
    important_information:   str                      = ""
    checkin_checkout_times:  Optional[Dict[str, Any]] = None

    _coerce_refundable = field_validator("refundable", mode="before")(
        staticmethod(_coerce_refundable)
    )


class RoomOffer(BaseModel):
    """A bookable room offer for a hotel returned by LiteAPI."""
    offer_id:        str
    room_type:       str
    board_name:      str               = ""
    price_per_night: float
    total_price:     float
    currency:        str               = "INR"
    refundable:      Optional[bool]    = None
    cancel_policy:   Optional[Any]     = None
    # ---- Room images & details for the "Details More" section (optional) ----
    room_id:          Optional[int]   = None
    room_images:      List[str]       = Field(default_factory=list)
    room_description: str             = ""
    room_size:        str             = ""
    bed_types:        List[str]       = Field(default_factory=list)
    room_amenities:   List[str]       = Field(default_factory=list)
    room_views:       List[str]       = Field(default_factory=list)
    max_occupancy:    int             = 0

    _coerce_refundable = field_validator("refundable", mode="before")(
        staticmethod(_coerce_refundable)
    )


class HotelWithOffers(BaseModel):
    """A hotel plus every bookable room offer returned for a search."""
    hotel:  Hotel
    offers: List[RoomOffer] = Field(default_factory=list)


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


class HotelNightSegment(BaseModel):
    """One night of the trip — used for per-night hotel searches."""
    night:     int
    check_in:  str                # ISO date string
    check_out: str


class HotelNightSelection(BaseModel):
    """
    A single night's hotel + room selection, optionally with prebook result.

    One entry per night — supports staying in a different hotel every night.
    """
    night:           int
    check_in:        str
    check_out:       str
    hotel_id:        str
    hotel_name:      str
    room_type:       str
    offer_id:        str
    price_per_night: float
    total_price:     float
    currency:        str               = "INR"
    hotel:           Optional[Hotel]   = None   # full snapshot for rendering
    prebook_id:      Optional[str]     = None
    prebook_status:  Optional[str]     = None   # confirmed / failed / skipped
    prebook_error:   Optional[str]     = None


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
    passenger_form:        Optional[PassengerFormData] = None  # submitted passenger details
    flight_prebook:        Optional[FlightPrebook] = None

    # ---- Hotel data ----
    hotel_search_results: List[Hotel]                  = Field(default_factory=list)
    selected_hotels:      Dict[str, Hotel]             = Field(default_factory=dict)  # keyed by day number
    hotel_prebooks:       Dict[str, HotelPrebook]      = Field(default_factory=dict)

    # ---- Per-night hotel flow (one hotel per night) ----
    hotel_night_segments:   List[HotelNightSegment]     = Field(default_factory=list)
    hotel_night_selections: List[HotelNightSelection]   = Field(default_factory=list)
    current_night:          int                         = 1
    hotel_room_offers:      List[RoomOffer]             = Field(default_factory=list)
    selected_night_hotel:   Optional[Hotel]             = None
    hotel_search_with_offers: List[HotelWithOffers]     = Field(default_factory=list)
    hotel_search_error:     Optional[str]               = None
    hotel_prebook_pending:  Optional[Dict[str, Any]]    = None

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


# ---------------------------------------------------------------------------
# Night segment helpers (pure date logic — no I/O)
# ---------------------------------------------------------------------------

def build_night_segments(
    check_in: str,
    check_out: str,
) -> List[HotelNightSegment]:
    """
    Split a full stay into one-night segments.

    Example: check_in=2026-08-10, check_out=2026-08-13 →
        [(1, 10-08, 11-08), (2, 11-08, 12-08), (3, 12-08, 13-08)]

    Supports any trip length (1, 2, 3, 5, 10 nights) without workflow changes.
    Falls back to a single segment when dates are missing or invalid.
    """
    from datetime import date, timedelta

    try:
        d1 = date.fromisoformat(check_in)
        d2 = date.fromisoformat(check_out)
    except (ValueError, TypeError):
        return [
            HotelNightSegment(
                night=1,
                check_in=check_in or "",
                check_out=check_out or "",
            )
        ]

    total_nights = max(1, (d2 - d1).days)
    segments: List[HotelNightSegment] = []
    for i in range(total_nights):
        night_in  = d1 + timedelta(days=i)
        night_out = night_in + timedelta(days=1)
        segments.append(
            HotelNightSegment(
                night=i + 1,
                check_in=night_in.isoformat(),
                check_out=night_out.isoformat(),
            )
        )
    return segments
