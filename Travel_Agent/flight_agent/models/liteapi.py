"""LiteAPI request and response Pydantic models."""

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LiteAPIBaseModel(BaseModel):
    """Base model allowing extra fields from evolving API responses."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class SearchLeg(LiteAPIBaseModel):
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    date: str = Field(description="YYYY-MM-DD")
    direction: Literal["OUTBOUND", "INBOUND"] | None = None


class SearchFilters(LiteAPIBaseModel):
    cabin_class: str | None = Field(default=None, alias="cabinClass")
    max_stops: int | None = Field(default=None, alias="maxStops", ge=0, le=2)
    refundable_only: bool | None = Field(default=None, alias="refundableOnly")


class FlightSearchRequest(LiteAPIBaseModel):
    legs: list[SearchLeg] = Field(min_length=1)
    adults: int = Field(ge=1)
    children: int = Field(default=0, ge=0)
    infants: int = Field(default=0, ge=0)
    currency: str = Field(min_length=3, max_length=3)
    country: str | None = None
    cabin_class: str | None = Field(default=None, alias="cabinClass")
    filters: SearchFilters | None = None
    sort: str | None = None

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class VerifyOfferRequest(LiteAPIBaseModel):
    offer_id: str = Field(alias="offerId")

    model_config = ConfigDict(populate_by_name=True)


class PrebookContact(LiteAPIBaseModel):
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    email: str
    phone_country_code: str = Field(alias="phoneCountryCode")
    phone_number: str = Field(alias="phoneNumber")
    middle_name: str | None = Field(default=None, alias="middleName")


class PrebookPassenger(LiteAPIBaseModel):
    first_name: str = Field(alias="firstName")
    last_name: str = Field(alias="lastName")
    birthday: str
    gender: str
    nationality: str
    document_type: str = Field(alias="documentType")
    document_number: str = Field(alias="documentNumber")
    document_expiry: str = Field(alias="documentExpiry")
    document_issue_country: str = Field(alias="documentIssueCountry")
    passenger_type: int = Field(default=0, alias="passengerType")
    middle_name: str | None = Field(default=None, alias="middleName")


class PrebookRequest(LiteAPIBaseModel):
    offer_id: str = Field(alias="offerId")
    contact: PrebookContact
    passengers: list[PrebookPassenger] = Field(min_length=1)
    use_payment_sdk: bool = Field(default=False, alias="usePaymentSdk")
    include_credit_balance: bool = Field(default=False, alias="includeCreditBalance")
    voucher_code: str | None = Field(default=None, alias="voucherCode")


class PaymentMethod(str, Enum):
    TRANSACTION_ID = "TRANSACTION_ID"
    CREDIT = "CREDIT"
    THIRD_PARTY = "THIRD_PARTY"


class BookingPayment(LiteAPIBaseModel):
    method: PaymentMethod
    transaction_id: str | None = Field(default=None, alias="transactionId")
    token: str | None = None


class CompleteBookingRequest(LiteAPIBaseModel):
    prebook_id: str = Field(alias="prebookId")
    payment: BookingPayment


class AttachServicesRequest(LiteAPIBaseModel):
    selected_services: list[dict[str, Any]] = Field(alias="selectedServices")
    voucher_code: str | None = Field(default=None, alias="voucherCode")


# ---------------------------------------------------------------------------
# Response models (validated subsets; extra fields preserved)
# ---------------------------------------------------------------------------


class LiteAPIErrorDetail(LiteAPIBaseModel):
    code: int | None = None
    message: str | None = None
    description: str | None = None
    key: str | None = None


class LiteAPIErrorResponse(LiteAPIBaseModel):
    error: LiteAPIErrorDetail | None = None


class FlightPrice(LiteAPIBaseModel):
    total: float | None = None
    currency: str | None = None
    base: float | None = None
    taxes: float | None = None
    fees: float | None = None


class FlightOffer(LiteAPIBaseModel):
    offer_id: str | None = Field(default=None, alias="offerId")
    price: FlightPrice | None = None
    is_cheapest: bool | None = Field(default=None, alias="isCheapest")
    expiration: str | None = None
    cabin_class: str | None = Field(default=None, alias="cabinClass")
    fare_family: str | None = Field(default=None, alias="fareFamily")


class FlightSegment(LiteAPIBaseModel):
    origin_code: str | None = Field(default=None, alias="originCode")
    destination_code: str | None = Field(default=None, alias="destinationCode")
    origin_name: str | None = Field(default=None, alias="originName")
    destination_name: str | None = Field(default=None, alias="destinationName")
    departure_time: str | None = Field(default=None, alias="departureTime")
    arrival_time: str | None = Field(default=None, alias="arrivalTime")
    direction: str | None = None


class FlightJourney(LiteAPIBaseModel):
    journey_key: str | None = Field(default=None, alias="journeyKey")
    segments: list[FlightSegment] = Field(default_factory=list)
    offers: list[FlightOffer] = Field(default_factory=list)
    pricing: dict[str, Any] | None = None
    expiration: str | None = None


class SearchRatesResponse(LiteAPIBaseModel):
    data: list[dict[str, Any]] = Field(default_factory=list)


class VerifyOfferResponse(LiteAPIBaseModel):
    data: list[dict[str, Any]] = Field(default_factory=list)


class PrebookResponse(LiteAPIBaseModel):
    data: list[dict[str, Any]] = Field(default_factory=list)


class BookingRecord(LiteAPIBaseModel):
    booking_id: str | None = Field(default=None, alias="bookingId")
    status: str | None = None
    booking_ref: str | None = Field(default=None, alias="bookingRef")
    airline_pnr: str | None = Field(default=None, alias="airlinePnr")
    journey: FlightJourney | None = None
    passengers: list[dict[str, Any]] = Field(default_factory=list)
    payment_status: str | None = Field(default=None, alias="paymentStatus")


class BookingResponse(LiteAPIBaseModel):
    data: list[dict[str, Any]] = Field(default_factory=list)
