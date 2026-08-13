"""LiteAPI request models (responses are normalized as dicts in FlightService)."""

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LiteAPIBaseModel(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class SearchLeg(LiteAPIBaseModel):
    origin: str = Field(min_length=3, max_length=3)
    destination: str = Field(min_length=3, max_length=3)
    date: str = Field(description="YYYY-MM-DD")
    direction: Literal["OUTBOUND", "INBOUND"] | None = None


class FlightSearchRequest(LiteAPIBaseModel):
    legs: list[SearchLeg] = Field(min_length=1)
    adults: int = Field(ge=1)
    children: int = Field(default=0, ge=0)
    infants: int = Field(default=0, ge=0)
    children_ages: list[int] | None = Field(default=None, alias="childrenAges")
    infant_ages: list[int] | None = Field(default=None, alias="infantAges")
    currency: str = Field(min_length=3, max_length=3)
    country: str | None = None
    cabin_class: str | None = Field(default=None, alias="cabinClass")
    sort: str | None = None

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()


class VerifyOfferRequest(LiteAPIBaseModel):
    offer_id: str = Field(alias="offerId")


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
    ACC_CREDIT_CARD = "ACC_CREDIT_CARD"


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


class LiteAPIErrorDetail(LiteAPIBaseModel):
    code: int | None = None
    message: str | None = None
    description: str | None = None
    key: str | None = None


class LiteAPIErrorResponse(LiteAPIBaseModel):
    error: LiteAPIErrorDetail | None = None
