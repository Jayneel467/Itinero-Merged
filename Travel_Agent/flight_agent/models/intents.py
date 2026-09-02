from __future__ import annotations
"""Domain models for flight search and booking payloads."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class FlightIntent(str, Enum):
    """Operation category reflected in agent output metadata."""

    SEARCH_FLIGHTS = "search_flights"
    VERIFY_OFFER = "verify_offer"
    PREBOOK = "prebook"
    ATTACH_SERVICES = "attach_services"
    COMPLETE_BOOKING = "complete_booking"
    GET_BOOKING = "get_booking"
    LIST_BOOKINGS = "list_bookings"
    BOOKING_STATUS = "booking_status"
    CANCEL_BOOKING = "cancel_booking"
    GENERAL = "general"


class FlightSearchParams(BaseModel):
    """Parameters for a LiteAPI flight search."""

    origin: str
    destination: str
    departure_date: str = Field(description="YYYY-MM-DD")
    return_date: str | None = None
    adults: int = Field(default=1, ge=1)
    children: int = Field(default=0, ge=0)
    infants: int = Field(default=0, ge=0)
    children_ages: list[int] | None = Field(
        default=None,
        description="Age of each child (2–11), length must match children count when set",
    )
    infant_ages: list[int] | None = Field(
        default=None,
        description="Age of each infant (under 2), length must match infants count when set",
    )
    cabin_class: str | None = None
    currency: str | None = None


class PassengerSlot(BaseModel):
    """Passenger details for prebook."""

    first_name: str
    last_name: str
    birthday: str = Field(description="YYYY-MM-DD")
    gender: str = Field(description="M or F")
    nationality: str = "US"
    document_type: str = "passport"
    document_number: str
    document_expiry: str = Field(description="YYYY-MM-DD")
    document_issue_country: str = "US"
    passenger_type: int = Field(default=0, description="0=adult, 1=child, 2=infant")
    middle_name: str | None = None

    @field_validator("passenger_type", mode="before")
    @classmethod
    def _coerce_passenger_type(cls, v: Any) -> int:
        if isinstance(v, str):
            s = v.strip().lower()
            if s in ("adult", "adults", "adt"):
                return 0
            if s in ("child", "children", "chd"):
                return 1
            if s in ("infant", "infants", "inf"):
                return 2
            try:
                return int(s)
            except ValueError:
                return 0
        if isinstance(v, (int, float)):
            return int(v)
        return 0


class ContactSlot(BaseModel):
    """Contact details for booking confirmation."""

    first_name: str
    last_name: str
    email: str
    phone_country_code: str
    phone_number: str
    middle_name: str | None = None
