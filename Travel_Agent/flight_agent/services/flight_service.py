"""Business logic layer for flight operations."""

import asyncio
from typing import Any

from flight_agent.config import Settings, get_settings
from flight_agent.exceptions import LiteAPIError, UnsupportedOperationError, ValidationError
from flight_agent.logging_config import get_logger
from flight_agent.models.intents import ContactSlot, FlightSearchParams, PassengerSlot
from flight_agent.llm.booking_requirements import liteapi_document_type, summarize_attachable_services
from flight_agent.models.liteapi import (
    AttachServicesRequest,
    BookingPayment,
    CompleteBookingRequest,
    FlightSearchRequest,
    PaymentMethod,
    PrebookContact,
    PrebookPassenger,
    PrebookRequest,
    SearchLeg,
    VerifyOfferRequest,
)
from flight_agent.providers.liteapi_provider import LiteAPIProvider

logger = get_logger(__name__)

# Common city names to IATA codes (avoids an extra LiteAPI lookup when possible)
CITY_IATA: dict[str, str] = {
    "MUMBAI": "BOM",
    "BOMBAY": "BOM",
    "DELHI": "DEL",
    "NEW DELHI": "DEL",
    "BANGALORE": "BLR",
    "BENGALURU": "BLR",
    "CHENNAI": "MAA",
    "MADRAS": "MAA",
    "KOLKATA": "CCU",
    "CALCUTTA": "CCU",
    "HYDERABAD": "HYD",
    "PUNE": "PNQ",
    "GOA": "GOI",
    "AHMEDABAD": "AMD",
    "JAIPUR": "JAI",
    "KOCHI": "COK",
    "COCHIN": "COK",
    "LUCKNOW": "LKO",
    "CHANDIGARH": "IXC",
    "INDORE": "IDR",
    "NAGPUR": "NAG",
    "VARANASI": "VNS",
    "PATNA": "PAT",
    "GUWAHATI": "GAU",
    "SRINAGAR": "SXR",
    "AMRITSAR": "ATQ",
    "PARIS": "CDG",
    "LONDON": "LHR",
    "NEW YORK": "JFK",
    "LOS ANGELES": "LAX",
    "DUBAI": "DXB",
    "SINGAPORE": "SIN",
    "BANGKOK": "BKK",
    "DOHA": "DOH",
}

MAX_OFFERS_RETURNED = 20


class FlightService:
    """
    High-level flight operations for the agent tool layer.

    Validates inputs, calls LiteAPI, and normalizes responses for the LLM.
    """

    def __init__(
        self,
        provider: LiteAPIProvider | None = None,
        settings: Settings | None = None,
    ) -> None:
        self._settings = settings or get_settings()
        self._provider = provider or LiteAPIProvider(self._settings)
        self._airport_cache: dict[str, str] = {}

    async def search(self, params: FlightSearchParams) -> dict[str, Any]:
        """Search flights using validated search parameters."""
        if not params.origin or not params.destination or not params.departure_date:
            raise ValidationError("origin, destination, and departure_date are required")

        legs = [
            SearchLeg(
                origin=params.origin.upper(),
                destination=params.destination.upper(),
                date=params.departure_date,
                direction="OUTBOUND",
            )
        ]
        if params.return_date:
            legs.append(
                SearchLeg(
                    origin=params.destination.upper(),
                    destination=params.origin.upper(),
                    date=params.return_date,
                    direction="INBOUND",
                )
            )

        request = FlightSearchRequest(
            legs=legs,
            adults=params.adults,
            children=params.children,
            infants=params.infants,
            currency=(params.currency or self._settings.default_currency).upper(),
            country=self._settings.default_country,
            cabin_class=params.cabin_class,
        )

        logger.info(
            "flight_search",
            origin=params.origin,
            destination=params.destination,
            departure=params.departure_date,
            return_date=params.return_date,
        )
        raw = await self._provider.search_flights(request)
        return self._normalize_search_results(raw)

    async def verify(self, offer_id: str) -> dict[str, Any]:
        """Verify a selected offer before prebook."""
        request = VerifyOfferRequest(offerId=offer_id)
        logger.info("flight_verify", offer_id=offer_id[:32])
        raw = await self._provider.verify_offer(request)
        return self._normalize_verify_result(raw, offer_id)

    async def prebook(
        self,
        offer_id: str,
        passengers: list[PassengerSlot],
        contact: ContactSlot,
    ) -> dict[str, Any]:
        """Create a prebook session with passenger and contact details."""
        prebook_passengers = [
            PrebookPassenger(
                firstName=p.first_name,
                lastName=p.last_name,
                birthday=p.birthday,
                gender=p.gender.upper()[0],
                nationality=p.nationality.upper(),
                documentType=liteapi_document_type(p.document_type),
                documentNumber=p.document_number,
                documentExpiry=p.document_expiry,
                documentIssueCountry=p.document_issue_country.upper(),
                passengerType=p.passenger_type,
                middleName=p.middle_name,
            )
            for p in passengers
        ]
        prebook_contact = PrebookContact(
            firstName=contact.first_name,
            lastName=contact.last_name,
            email=contact.email,
            phoneCountryCode=contact.phone_country_code,
            phoneNumber=contact.phone_number,
            middleName=contact.middle_name,
        )
        request = PrebookRequest(
            offerId=offer_id,
            contact=prebook_contact,
            passengers=prebook_passengers,
            usePaymentSdk=self._settings.liteapi_use_payment_sdk,
            includeCreditBalance=not self._settings.liteapi_use_payment_sdk,
        )

        logger.info("flight_prebook", offer_id=offer_id[:32], passengers=len(passengers))
        raw = await self._provider.prebook(request)
        return self._normalize_prebook_result(raw)

    async def attach_services(
        self,
        prebook_id: str,
        selected_services: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Attach seats, baggage, or other ancillaries to a prebook."""
        request = AttachServicesRequest(selectedServices=selected_services)
        logger.info("flight_attach_services", prebook_id=prebook_id, count=len(selected_services))
        raw = await self._provider.attach_services(prebook_id, request)
        return self._normalize_prebook_result(raw)

    async def complete_booking(
        self,
        prebook_id: str,
        *,
        transaction_id: str | None = None,
        payment_method: str | None = None,
    ) -> dict[str, Any]:
        """Complete booking using prebook transaction ID or sandbox credit line."""
        if payment_method:
            method = payment_method
        elif transaction_id:
            method = PaymentMethod.TRANSACTION_ID.value
        elif self._settings.liteapi_use_payment_sdk:
            method = PaymentMethod.TRANSACTION_ID.value
        else:
            method = PaymentMethod.CREDIT.value

        if method == PaymentMethod.TRANSACTION_ID.value and not transaction_id:
            raise ValidationError(
                "transaction_id is required when completing booking with Stripe (TRANSACTION_ID)"
            )

        try:
            return await self._complete_with_payment(prebook_id, method, transaction_id)
        except LiteAPIError as exc:
            if (
                method == PaymentMethod.CREDIT.value
                and transaction_id
                and "credit" in str(exc).lower()
            ):
                logger.info("flight_complete_retry", method="TRANSACTION_ID")
                return await self._complete_with_payment(
                    prebook_id,
                    PaymentMethod.TRANSACTION_ID.value,
                    transaction_id,
                )
            raise

    async def _complete_with_payment(
        self,
        prebook_id: str,
        method: str,
        transaction_id: str | None,
    ) -> dict[str, Any]:
        payment = BookingPayment(
            method=PaymentMethod(method),
            transactionId=transaction_id,
        )
        request = CompleteBookingRequest(prebookId=prebook_id, payment=payment)
        logger.info("flight_complete_booking", prebook_id=prebook_id, method=method)
        raw = await self._provider.complete_booking(request)
        return self._normalize_booking_result(raw)

    async def get_booking(self, booking_id: str) -> dict[str, Any]:
        """Retrieve a booking by ID including status."""
        logger.info("flight_get_booking", booking_id=booking_id)
        raw = await self._provider.get_booking(booking_id)
        return self._normalize_booking_result(raw)

    async def list_bookings(
        self,
        *,
        airline_pnr: str | None = None,
        last_name: str | None = None,
    ) -> dict[str, Any]:
        """List all bookings or lookup by PNR + last name."""
        logger.info("flight_list_bookings", airline_pnr=airline_pnr)
        raw = await self._provider.list_bookings(
            airline_pnr=airline_pnr,
            last_name=last_name,
        )
        return self._normalize_booking_list(raw)

    async def get_booking_status(self, booking_id: str) -> dict[str, Any]:
        """Retrieve booking and extract status-focused summary."""
        booking = await self.get_booking(booking_id)
        return {
            "booking_id": booking.get("booking_id"),
            "status": booking.get("status"),
            "payment_status": booking.get("payment_status"),
            "airline_pnr": booking.get("airline_pnr"),
            "booking_ref": booking.get("booking_ref"),
        }

    async def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        """
        Flight cancellation is not exposed in the LiteAPI Flights API.

        Hotel bookings support PUT /bookings/{id}; flights do not have an equivalent
        endpoint. This method raises UnsupportedOperationError with guidance.
        """
        # Attempt to fetch booking to provide useful context in the error
        try:
            booking = await self.get_booking(booking_id)
            status = booking.get("status")
        except Exception:
            status = None

        raise UnsupportedOperationError(
            "Flight cancellation is not supported via the LiteAPI Flights API. "
            "Please contact the airline directly using your booking reference (PNR). "
            "Cancellation policies are available in the fare rules from verify/prebook.",
            details={"booking_id": booking_id, "current_status": status},
        )

    async def resolve_airport_code(self, location: str) -> str:
        """Resolve a city name or partial code to a 3-letter IATA code."""
        cleaned = location.strip().upper()
        if len(cleaned) == 3 and cleaned.isalpha():
            return cleaned

        if cleaned in self._airport_cache:
            return self._airport_cache[cleaned]

        if cleaned in CITY_IATA:
            code = CITY_IATA[cleaned]
            self._airport_cache[cleaned] = code
            return code

        raw = await self._provider.search_airports(location)
        airports = raw.get("data") or []
        if not airports:
            raise ValidationError(f"No airport found for '{location}'")

        first = airports[0]
        code = first.get("iata") or first.get("iataCode") or first.get("code")
        if not code:
            raise ValidationError(f"Could not resolve airport code for '{location}'")
        resolved = str(code).upper()
        self._airport_cache[cleaned] = resolved
        return resolved

    async def resolve_search_airports(self, origin: str, destination: str) -> tuple[str, str]:
        """Resolve origin and destination in parallel when lookup is needed."""
        origin_clean = origin.strip().upper()
        dest_clean = destination.strip().upper()
        tasks: list[Any] = []
        keys: list[str] = []

        if len(origin_clean) != 3 or not origin_clean.isalpha():
            tasks.append(self.resolve_airport_code(origin))
            keys.append("origin")
        if len(dest_clean) != 3 or not dest_clean.isalpha():
            tasks.append(self.resolve_airport_code(destination))
            keys.append("destination")

        resolved = {"origin": origin_clean, "destination": dest_clean}
        if tasks:
            codes = await asyncio.gather(*tasks)
            for key, code in zip(keys, codes):
                resolved[key] = code
        return resolved["origin"], resolved["destination"]

    # ------------------------------------------------------------------
    # Response normalization helpers
    # ------------------------------------------------------------------

    def _normalize_search_results(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Flatten search response into agent-friendly offer summaries (top cheapest only)."""
        offers: list[dict[str, Any]] = []

        for batch in raw.get("data") or []:
            journeys = batch.get("journeys") or []
            if not journeys and batch.get("journey"):
                journeys = [batch["journey"]]

            for journey in journeys:
                segments = journey.get("segments") or []
                journey_offers = list(journey.get("offers") or [])

                cheapest = journey.get("cheapestOffer")
                if cheapest and not any(
                    o.get("offerId") == cheapest.get("offerId") for o in journey_offers
                ):
                    journey_offers.insert(0, cheapest)

                for offer in journey_offers:
                    pricing = offer.get("pricing") or {}
                    display = pricing.get("display") or pricing
                    fare = offer.get("fare") or {}
                    total = display.get("total")
                    try:
                        sort_price = float(total) if total is not None else float("inf")
                    except (TypeError, ValueError):
                        sort_price = float("inf")

                    offers.append(
                        (
                            sort_price,
                            {
                                "offer_id": offer.get("offerId"),
                                "total_price": total,
                                "currency": display.get("currency"),
                                "cabin_class": self._extract_cabin_class(offer, journey),
                                "fare_family": fare.get("fareFamily") or fare.get("family"),
                                "is_cheapest": offer.get("offerId")
                                == (cheapest or {}).get("offerId")
                                or journey.get("isCheapest"),
                                "expiration": offer.get("expiration"),
                                "segments_summary": self._summarize_segments(segments),
                                "stops": max(0, len(segments) - 1) if segments else None,
                                "journey_key": journey.get("journeyKey"),
                            },
                        )
                    )

        offers.sort(key=lambda item: item[0])
        trimmed = [item[1] for item in offers[:MAX_OFFERS_RETURNED]]
        for idx, offer in enumerate(trimmed, start=1):
            offer["index"] = idx

        return {
            "total_offers": len(offers),
            "offers": trimmed,
            "raw_count": len(raw.get("data") or []),
        }

    def _normalize_verify_result(
        self,
        raw: dict[str, Any],
        offer_id: str,
    ) -> dict[str, Any]:
        data = raw.get("data") or []
        if not data:
            return {"offer_id": offer_id, "verified": False, "message": "Offer not available"}

        entry = data[0]
        journey = entry.get("journey") or {}
        changes = entry.get("changes")
        pricing = journey.get("pricing") or {}
        display = pricing.get("display") or pricing

        return {
            "offer_id": offer_id,
            "verified": True,
            "expiration": journey.get("expiration"),
            "pricing": display,
            "changes": changes,
            "segments_summary": self._summarize_segments(journey.get("segments") or []),
            "journey_key": journey.get("journeyKey"),
            "cabin_class": self._extract_cabin_class(
                (journey.get("offers") or [{}])[0],
                journey,
            ),
        }

    def _normalize_prebook_result(self, raw: dict[str, Any]) -> dict[str, Any]:
        data = raw.get("data") or []
        if not data:
            return {"success": False}

        entry = data[0]
        prebook = entry.get("prebook") or entry
        services_raw = prebook.get("servicesAttachable")
        services = summarize_attachable_services(services_raw)
        return {
            "success": True,
            "prebook_id": prebook.get("prebookId"),
            "transaction_id": prebook.get("transactionId"),
            "secret_key": prebook.get("secretKey"),
            "price": prebook.get("price"),
            "currency": prebook.get("currency"),
            "payment_methods": prebook.get("paymentMethodsAvailable"),
            "services_attachable": bool(services_raw),
            "services": services,
        }

    def _normalize_booking_result(self, raw: dict[str, Any]) -> dict[str, Any]:
        data = raw.get("data") or []
        if not data:
            return {"found": False}

        entry = data[0]
        booking = entry.get("booking") or entry
        journey = booking.get("journey") or {}

        return {
            "found": True,
            "booking_id": booking.get("bookingId"),
            "status": booking.get("status"),
            "payment_status": booking.get("paymentStatus"),
            "airline_pnr": booking.get("airlinePnr") or booking.get("bookingRef"),
            "booking_ref": booking.get("bookingRef"),
            "segments_summary": self._summarize_segments(journey.get("segments") or []),
            "passengers": booking.get("passengers") or [],
            "pricing": booking.get("pricing") or journey.get("pricing"),
        }

    def _normalize_booking_list(self, raw: dict[str, Any]) -> dict[str, Any]:
        bookings = []
        for item in raw.get("data") or []:
            booking = item.get("booking") or item
            journey = booking.get("journey") or {}
            bookings.append(
                {
                    "booking_id": booking.get("bookingId"),
                    "status": booking.get("status"),
                    "airline_pnr": booking.get("airlinePnr") or booking.get("bookingRef"),
                    "segments_summary": self._summarize_segments(journey.get("segments") or []),
                }
            )
        return {"total": len(bookings), "bookings": bookings}

    @staticmethod
    def _extract_cabin_class(offer: dict[str, Any], journey: dict[str, Any] | None = None) -> str | None:
        """Best-effort cabin extraction across LiteAPI response shapes."""
        fare = offer.get("fare") or {}
        if fare.get("cabinClass") or fare.get("cabin"):
            return fare.get("cabinClass") or fare.get("cabin")

        if offer.get("cabinClass"):
            return offer.get("cabinClass")

        for seg_fare in offer.get("segmentFares") or []:
            cabin = seg_fare.get("cabin") or seg_fare.get("cabinClass")
            if cabin:
                return cabin

        if journey:
            journey_fare = journey.get("fare") or {}
            if journey_fare.get("cabinClass") or journey_fare.get("cabin"):
                return journey_fare.get("cabinClass") or journey_fare.get("cabin")

        return None

    @staticmethod
    def _summarize_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        summary = []
        for seg in segments:
            carrier = seg.get("carrier") or {}
            flight = seg.get("flight") or {}
            summary.append(
                {
                    "from": seg.get("originCode"),
                    "to": seg.get("destinationCode"),
                    "from_name": seg.get("originName"),
                    "to_name": seg.get("destinationName"),
                    "departure": seg.get("departureTime"),
                    "arrival": seg.get("arrivalTime"),
                    "airline": carrier.get("marketingName") or carrier.get("marketingCode"),
                    "flight_number": flight.get("marketingNumber"),
                    "direction": seg.get("direction"),
                }
            )
        return summary

    def select_offer_from_index(
        self,
        search_results: list[dict[str, Any]],
        index: int,
    ) -> str | None:
        """Resolve 1-based offer index from last search to offer_id."""
        for offer in search_results:
            if offer.get("index") == index:
                return offer.get("offer_id")
        if 1 <= index <= len(search_results):
            return search_results[index - 1].get("offer_id")
        return None

    async def close(self) -> None:
        """Release underlying provider resources."""
        await self._provider.close()
