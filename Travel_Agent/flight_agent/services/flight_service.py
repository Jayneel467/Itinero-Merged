"""Business logic layer for flight operations."""

import asyncio
from typing import Any

from flight_agent.config import Settings, get_settings
from flight_agent.exceptions import LiteAPIError, ValidationError
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
    "SURAT": "STV",
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
    "NYC": "JFK",
    "LOS ANGELES": "LAX",
    "DUBAI": "DXB",
    "ABU DHABI": "AUH",
    "SINGAPORE": "SIN",
    "BANGKOK": "BKK",
    "DOHA": "DOH",
}

# Codes we trust as literal IATA without an airport lookup.
KNOWN_IATA: frozenset[str] = frozenset(
    {
        "BOM", "DEL", "BLR", "MAA", "CCU", "HYD", "PNQ", "GOI", "AMD", "COK",
        "JAI", "LKO", "GAU", "IXC", "BBI", "TRV", "VNS", "PAT", "IDR", "NAG",
        "STV", "SXR", "ATQ", "DXB", "AUH", "SHJ", "DOH", "JFK", "EWR", "LGA",
        "LAX", "SFO", "ORD", "LHR", "LGW", "CDG", "AMS", "FRA", "SIN", "BKK",
        "HKG", "NRT", "HND", "ICN", "KUL", "SYD", "MEL", "IST", "FCO", "MAD",
        "BCN", "MIA", "SEA", "BOS", "DFW", "DEN", "ATL", "YYZ", "YVR",
    }
)

# Return the full result set (sorted cheapest-first) so the UI can page/filter
# client-side. Kept as a generous safety cap rather than a small display limit.
MAX_OFFERS_RETURNED = 250


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
            children_ages=params.children_ages,
            infant_ages=params.infant_ages,
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
        """Complete booking using Payment SDK transaction ID or sandbox credit line."""
        if payment_method:
            method = payment_method
        elif transaction_id:
            method = PaymentMethod.TRANSACTION_ID.value
        elif self._settings.liteapi_use_payment_sdk:
            method = PaymentMethod.TRANSACTION_ID.value
        else:
            method = PaymentMethod.CREDIT.value

        if method == PaymentMethod.CREDIT.value:
            try:
                self._settings.assert_payment_allowed()
            except ValueError as exc:
                raise ValidationError(str(exc)) from exc

        if method == PaymentMethod.TRANSACTION_ID.value and not transaction_id:
            raise ValidationError(
                "transaction_id is required when completing booking with Payment SDK (TRANSACTION_ID)"
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
        Cancel a flight booking via LiteAPI PUT /flights/bookings/{bookingId}.

        Re-fetches the booking afterwards so the agent can report the real status.
        """
        before = await self.get_booking(booking_id)
        if not before.get("found"):
            return {
                "cancelled": False,
                "found": False,
                "booking_id": booking_id,
                "message": "Booking not found.",
            }

        prior_status = str(before.get("status") or "")
        if "CANCEL" in prior_status.upper():
            return {
                "cancelled": True,
                "already_cancelled": True,
                "found": True,
                "booking_id": booking_id,
                "status": prior_status,
                "airline_pnr": before.get("airline_pnr"),
                "booking_ref": before.get("booking_ref"),
                "message": "This booking is already cancelled.",
            }

        logger.info("flight_cancel_booking", booking_id=booking_id)
        raw = await self._provider.cancel_booking(booking_id)
        after = await self.get_booking(booking_id)
        status = str(after.get("status") or prior_status)
        cancelled = "CANCEL" in status.upper()
        refund = None
        fee = None
        currency = None
        if isinstance(raw, dict):
            payload = raw.get("data") if isinstance(raw.get("data"), dict) else raw
            if isinstance(payload, dict):
                refund = payload.get("refund_amount") or payload.get("refundAmount")
                fee = payload.get("cancellation_fee") or payload.get("cancellationFee")
                currency = payload.get("currency")
                if payload.get("status"):
                    status = str(payload.get("status"))
                    cancelled = "CANCEL" in status.upper() or cancelled

        return {
            "cancelled": cancelled,
            "found": True,
            "booking_id": booking_id,
            "status": status,
            "prior_status": prior_status,
            "airline_pnr": after.get("airline_pnr") or before.get("airline_pnr"),
            "booking_ref": after.get("booking_ref") or before.get("booking_ref"),
            "refund_amount": refund,
            "cancellation_fee": fee,
            "currency": currency,
            "segments_summary": after.get("segments_summary") or before.get("segments_summary"),
            "message": (
                "Booking cancelled successfully."
                if cancelled
                else (
                    "Cancellation request was sent. The booking still shows as "
                    f"{status or 'confirmed'} — keep your airline PNR handy and "
                    "contact the airline if needed."
                )
            ),
        }

    async def resolve_airport_code(self, location: str) -> str:
        """Resolve a city name or partial code to a 3-letter IATA code."""
        cleaned = location.strip().upper()
        # Only accept literal 3-letter codes we know — never "NEW" from "New York".
        if len(cleaned) == 3 and cleaned.isalpha() and cleaned in KNOWN_IATA:
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

        if origin_clean not in KNOWN_IATA:
            tasks.append(self.resolve_airport_code(origin))
            keys.append("origin")
        if dest_clean not in KNOWN_IATA:
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

                    seg_summary = self._summarize_segments(segments)
                    # Stops = connections on the outbound leg only (ignore INBOUND return)
                    outbound_segs = [
                        s
                        for s in segments
                        if str(s.get("direction") or "").upper() != "INBOUND"
                    ] or list(segments)
                    baggage = self._summarize_baggage(offer)
                    offers.append(
                        (
                            sort_price,
                            {
                                "offer_id": offer.get("offerId"),
                                "total_price": total,
                                "currency": display.get("currency"),
                                "price_base": display.get("base"),
                                "price_taxes": display.get("taxes"),
                                "price_fees": display.get("fees"),
                                "cabin_class": self._extract_cabin_class(offer, journey),
                                "fare_family": fare.get("fareFamily") or fare.get("family"),
                                "seats_remaining": fare.get("seatsRemaining"),
                                "is_cheapest": offer.get("offerId")
                                == (cheapest or {}).get("offerId")
                                or journey.get("isCheapest"),
                                "expiration": offer.get("expiration"),
                                "segments_summary": seg_summary,
                                "stops": max(0, len(outbound_segs) - 1) if outbound_segs else None,
                                "journey_key": journey.get("journeyKey"),
                                "airline_logo": next(
                                    (s.get("logo") for s in seg_summary if s.get("logo")),
                                    None,
                                ),
                                "baggage": baggage.get("summary"),
                                "baggage_detail": baggage.get("detail"),
                                "amenities": self._summarize_amenities(offer),
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

    @staticmethod
    def _first_str(*candidates: Any) -> str | None:
        for value in candidates:
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    def _normalize_prebook_result(self, raw: dict[str, Any]) -> dict[str, Any]:
        data = raw.get("data") or []
        if not data:
            return {"success": False}

        entry = data[0] if isinstance(data, list) else data
        if not isinstance(entry, dict):
            return {"success": False}

        prebook = entry.get("prebook") if isinstance(entry.get("prebook"), dict) else entry
        payment = (
            prebook.get("payment")
            if isinstance(prebook.get("payment"), dict)
            else entry.get("payment") if isinstance(entry.get("payment"), dict) else {}
        )
        services_raw = prebook.get("servicesAttachable") or entry.get("servicesAttachable")
        services = summarize_attachable_services(services_raw)

        # LiteAPI Payment SDK: secretKey = Stripe PI client_secret; publishableKey optional.
        secret_key = self._first_str(
            prebook.get("secretKey"),
            prebook.get("secret_key"),
            prebook.get("clientSecret"),
            prebook.get("client_secret"),
            entry.get("secretKey"),
            entry.get("secret_key"),
            entry.get("clientSecret"),
            payment.get("secretKey"),
            payment.get("clientSecret"),
            payment.get("client_secret"),
        )
        publishable_key = self._first_str(
            prebook.get("publishableKey"),
            prebook.get("publishable_key"),
            entry.get("publishableKey"),
            entry.get("publishable_key"),
            payment.get("publishableKey"),
            payment.get("publishable_key"),
            (self._settings.stripe_publishable_key or "").strip() or None,
        )
        transaction_id = self._first_str(
            prebook.get("transactionId"),
            prebook.get("transaction_id"),
            entry.get("transactionId"),
            entry.get("transaction_id"),
            payment.get("transactionId"),
            payment.get("transaction_id"),
        )
        prebook_id = self._first_str(
            prebook.get("prebookId"),
            prebook.get("prebook_id"),
            entry.get("prebookId"),
            entry.get("prebook_id"),
        )

        return {
            "success": bool(prebook_id),
            "prebook_id": prebook_id,
            "transaction_id": transaction_id,
            "secret_key": secret_key,
            "publishable_key": publishable_key,
            "price": prebook.get("price") if prebook.get("price") is not None else entry.get("price"),
            "currency": prebook.get("currency") or entry.get("currency"),
            "payment_methods": prebook.get("paymentMethodsAvailable")
            or entry.get("paymentMethodsAvailable"),
            "services_attachable": bool(services_raw),
            "services": services,
            "payment_sdk_ready": bool(secret_key and publishable_key),
        }

    def _normalize_booking_result(self, raw: dict[str, Any]) -> dict[str, Any]:
        data = raw.get("data") or []
        if not data:
            return {"found": False}

        entry = data[0] if isinstance(data, list) else data
        if isinstance(entry, dict) and "bookings" in entry and not entry.get("booking"):
            # List-shaped payload mistakenly passed to single-booking normalize
            bookings = entry.get("bookings") or []
            entry = bookings[0] if bookings else {}
        booking = entry.get("booking") if isinstance(entry, dict) else None
        if not isinstance(booking, dict):
            booking = entry if isinstance(entry, dict) else {}
        journey = booking.get("journey") or {}
        pricing = booking.get("pricing") or journey.get("pricing") or {}
        display = pricing.get("display") if isinstance(pricing, dict) else {}
        if not isinstance(display, dict):
            display = {}

        payment = booking.get("payment") if isinstance(booking.get("payment"), dict) else {}
        # Prefer display.total, then booking.pricing.totalAmount, then payment.amount
        total_price = (
            display.get("total")
            or (pricing.get("totalAmount") if isinstance(pricing, dict) else None)
            or payment.get("amount")
            or booking.get("distributorPrice")
        )
        currency = (
            display.get("currency")
            or (pricing.get("currency") if isinstance(pricing, dict) else None)
            or payment.get("currency")
        )

        ticket_data = booking.get("ticketData") if isinstance(booking.get("ticketData"), dict) else {}
        airline_locators = self._extract_airline_locators(booking)
        ticket_numbers = self._extract_ticket_numbers(booking)
        eticket_url = self._extract_eticket_url(booking)

        pricing_out: dict[str, Any] = {}
        if display:
            pricing_out.update(display)
        if isinstance(pricing, dict):
            for key in ("subtotal", "servicesAmount", "seatsAmount", "baggageAmount", "totalAmount", "currency"):
                if pricing.get(key) is not None and key not in pricing_out:
                    pricing_out[key] = pricing[key]

        return {
            "found": True,
            "booking_id": booking.get("bookingId"),
            "status": booking.get("status"),
            "payment_status": booking.get("paymentStatus"),
            "airline_pnr": self._extract_airline_pnr(booking),
            "booking_ref": booking.get("bookingRef"),
            "timestamp": booking.get("timestamp"),
            "ticket_limit_time": booking.get("ticketLimitTime"),
            "airline_locators": airline_locators,
            "ticket_numbers": ticket_numbers,
            "eticket_url": eticket_url,
            "ticket_data": {
                "confirmation_id": ticket_data.get("confirmationId"),
                "ticketed_at": ticket_data.get("ticketedAt"),
                "provider": ticket_data.get("provider"),
                "source": ticket_data.get("source"),
            }
            if ticket_data
            else {},
            "segments_summary": self._summarize_segments(journey.get("segments") or []),
            "passengers": self._normalize_passengers(booking.get("passengers") or []),
            "contact": self._normalize_contact(booking.get("contact") or {}),
            "pricing": pricing_out or display or pricing,
            "payment": {
                "amount": payment.get("amount"),
                "currency": payment.get("currency"),
            }
            if payment
            else {},
            "total_price": total_price,
            "price": total_price,
            "currency": currency,
            "order_status": (booking.get("order") or {}).get("status")
            if isinstance(booking.get("order"), dict)
            else None,
        }

    def _normalize_booking_list(self, raw: dict[str, Any]) -> dict[str, Any]:
        bookings: list[dict[str, Any]] = []
        for item in raw.get("data") or []:
            if not isinstance(item, dict):
                continue
            nested = item.get("bookings")
            if isinstance(nested, list):
                for booking in nested:
                    if isinstance(booking, dict):
                        bookings.append(self._summarize_listed_booking(booking))
                continue
            booking = item.get("booking") or item
            if isinstance(booking, dict):
                bookings.append(self._summarize_listed_booking(booking))
        return {"total": len(bookings), "bookings": bookings}

    def _summarize_listed_booking(self, booking: dict[str, Any]) -> dict[str, Any]:
        journey = booking.get("journey") or {}
        pricing = booking.get("pricing") or journey.get("pricing") or {}
        display = pricing.get("display") if isinstance(pricing, dict) else {}
        if not isinstance(display, dict):
            display = {}
        return {
            "booking_id": booking.get("bookingId"),
            "status": booking.get("status"),
            "airline_pnr": self._extract_airline_pnr(booking),
            "booking_ref": booking.get("bookingRef"),
            "total_price": display.get("total"),
            "currency": display.get("currency"),
            "segments_summary": self._summarize_segments(journey.get("segments") or []),
            "timestamp": booking.get("timestamp"),
        }

    @staticmethod
    def _extract_airline_pnr(booking: dict[str, Any]) -> str | None:
        if booking.get("airlinePnr"):
            return str(booking["airlinePnr"])
        locators = booking.get("airlineLocators") or []
        if locators and isinstance(locators[0], dict) and locators[0].get("airlinePnr"):
            return str(locators[0]["airlinePnr"])
        order = booking.get("order") or {}
        if isinstance(order, dict):
            ref = order.get("reference") or {}
            if isinstance(ref, dict):
                if ref.get("pnr"):
                    return str(ref["pnr"])
                provider = ref.get("provider") or {}
                if isinstance(provider, dict):
                    if provider.get("pnr"):
                        return str(provider["pnr"])
                    meta = provider.get("metadata") or {}
                    if isinstance(meta, dict):
                        data = meta.get("data") or {}
                        if isinstance(data, dict) and data.get("pnrCode"):
                            return str(data["pnrCode"])
            for ab in order.get("airlineBookings") or []:
                if isinstance(ab, dict) and (ab.get("airlinePnr") or ab.get("pnr")):
                    return str(ab.get("airlinePnr") or ab.get("pnr"))
        return booking.get("bookingRef")

    @staticmethod
    def _extract_airline_locators(booking: dict[str, Any]) -> list[dict[str, Any]]:
        """Return airline locator rows only when LiteAPI provides them."""
        out: list[dict[str, Any]] = []
        seen: set[str] = set()

        def _add(code: Any, pnr: Any, name: Any = None) -> None:
            pnr_s = str(pnr).strip() if pnr else ""
            if not pnr_s:
                return
            key = f"{code or ''}|{pnr_s}"
            if key in seen:
                return
            seen.add(key)
            row: dict[str, Any] = {"airline_pnr": pnr_s}
            if code:
                row["airline_code"] = str(code)
            if name:
                row["airline_name"] = str(name)
            out.append(row)

        for loc in booking.get("airlineLocators") or []:
            if isinstance(loc, dict):
                _add(loc.get("airlineCode"), loc.get("airlinePnr") or loc.get("pnr"))

        order = booking.get("order") if isinstance(booking.get("order"), dict) else {}
        ref = order.get("reference") if isinstance(order.get("reference"), dict) else {}
        for ab in ref.get("airlineBookings") or order.get("airlineBookings") or []:
            if isinstance(ab, dict):
                _add(ab.get("airlineCode"), ab.get("airlinePnr") or ab.get("pnr"), ab.get("airlineName"))

        return out

    @staticmethod
    def _extract_ticket_numbers(booking: dict[str, Any]) -> list[str]:
        """Collect ticket / confirmation numbers only if present on the LiteAPI payload."""
        found: list[str] = []
        seen: set[str] = set()

        def _push(val: Any) -> None:
            if val is None:
                return
            s = str(val).strip()
            if not s or s in seen:
                return
            seen.add(s)
            found.append(s)

        ticket_data = booking.get("ticketData") if isinstance(booking.get("ticketData"), dict) else {}
        _push(ticket_data.get("confirmationId"))
        _push(ticket_data.get("ticketNumber"))
        _push(ticket_data.get("ticketNo"))

        for key in ("ticketNumbers", "tickets", "documents", "etickets", "eTickets"):
            items = booking.get(key)
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, str):
                        _push(item)
                    elif isinstance(item, dict):
                        _push(
                            item.get("ticketNumber")
                            or item.get("number")
                            or item.get("ticketNo")
                            or item.get("confirmationId")
                        )
            elif isinstance(items, str):
                _push(items)

        for pax in booking.get("passengers") or []:
            if not isinstance(pax, dict):
                continue
            _push(pax.get("ticketNumber") or pax.get("ticketNo"))
            for t in pax.get("tickets") or []:
                if isinstance(t, str):
                    _push(t)
                elif isinstance(t, dict):
                    _push(t.get("ticketNumber") or t.get("number") or t.get("ticketNo"))

        return found

    @staticmethod
    def _extract_eticket_url(booking: dict[str, Any]) -> str | None:
        """Return an e-ticket / document URL only when LiteAPI includes one."""
        url_keys = (
            "eticketUrl",
            "eTicketUrl",
            "ticketUrl",
            "ticketURL",
            "documentUrl",
            "documentsUrl",
            "url",
            "href",
            "link",
        )

        def _is_http(val: Any) -> str | None:
            if not isinstance(val, str):
                return None
            s = val.strip()
            if s.startswith("http://") or s.startswith("https://"):
                return s
            return None

        for key in url_keys:
            hit = _is_http(booking.get(key))
            if hit:
                return hit

        ticket_data = booking.get("ticketData") if isinstance(booking.get("ticketData"), dict) else {}
        for key in url_keys:
            hit = _is_http(ticket_data.get(key))
            if hit:
                return hit

        for key in ("tickets", "documents", "etickets", "eTickets", "links"):
            items = booking.get(key)
            if not isinstance(items, list):
                continue
            for item in items:
                if isinstance(item, str):
                    hit = _is_http(item)
                    if hit:
                        return hit
                elif isinstance(item, dict):
                    for uk in url_keys:
                        hit = _is_http(item.get(uk))
                        if hit:
                            return hit
        return None

    @staticmethod
    def _normalize_passengers(passengers: list[Any]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for p in passengers:
            if not isinstance(p, dict):
                continue
            row: dict[str, Any] = {}
            mapping = {
                "title": "title",
                "firstName": "first_name",
                "lastName": "last_name",
                "first_name": "first_name",
                "last_name": "last_name",
                "gender": "gender",
                "birthday": "date_of_birth",
                "dateOfBirth": "date_of_birth",
                "dob": "date_of_birth",
                "nationality": "nationality",
                "passengerType": "passenger_type",
                "documentType": "document_type",
                "documentNumber": "document_number",
                "ticketNumber": "ticket_number",
                "ticketNo": "ticket_number",
            }
            for src, dest in mapping.items():
                if p.get(src) is not None and dest not in row:
                    row[dest] = p.get(src)
            if row:
                out.append(row)
        return out

    @staticmethod
    def _normalize_contact(contact: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(contact, dict):
            return {}
        out: dict[str, Any] = {}
        for src, dest in (
            ("email", "email"),
            ("phoneNumber", "phone"),
            ("phone", "phone"),
            ("phoneCountryCode", "phone_country_code"),
            ("firstName", "first_name"),
            ("lastName", "last_name"),
        ):
            if contact.get(src) is not None:
                out[dest] = contact.get(src)
        return out

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
            duration = seg.get("duration") or {}
            summary.append(
                {
                    "from": seg.get("originCode"),
                    "to": seg.get("destinationCode"),
                    "from_name": seg.get("originName"),
                    "to_name": seg.get("destinationName"),
                    "departure": seg.get("departureTime"),
                    "arrival": seg.get("arrivalTime"),
                    "airline": carrier.get("marketingName") or carrier.get("marketingCode"),
                    "airline_code": carrier.get("marketingCode"),
                    "operating_airline": carrier.get("operatingName"),
                    "logo": carrier.get("marketingLogo") or carrier.get("operatingLogo"),
                    "flight_number": flight.get("marketingNumber"),
                    "duration_minutes": duration.get("minutes"),
                    "direction": seg.get("direction"),
                }
            )
        return summary

    @staticmethod
    def _summarize_baggage(offer: dict[str, Any]) -> dict[str, Any]:
        """Extract included cabin/checked baggage allowance from a LiteAPI offer.

        Only reports what LiteAPI actually returns — never invents an allowance.
        """
        bag = offer.get("baggage") or {}
        included = bag.get("included") or []
        cabin_kg: float | None = None
        checked_kg: float | None = None
        cabin_pieces: int | None = None
        checked_pieces: int | None = None
        for item in included:
            btype = str(item.get("bagType") or "").lower()
            weight = item.get("weightKg")
            pieces = item.get("pieces")
            if btype in {"cabin", "carry-on", "carryon", "carry_on"}:
                cabin_kg = weight if weight is not None else cabin_kg
                cabin_pieces = pieces if pieces is not None else cabin_pieces
            elif btype in {"checked", "check-in", "checkin", "hold"}:
                checked_kg = weight if weight is not None else checked_kg
                checked_pieces = pieces if pieces is not None else checked_pieces

        parts: list[str] = []
        if cabin_kg is not None:
            parts.append(f"Cabin {cabin_kg:g}kg")
        elif bag.get("hasCarryOnBag"):
            parts.append("Cabin included")
        if checked_kg is not None:
            parts.append(f"Checked {checked_kg:g}kg")
        elif bag.get("hasCheckedBag"):
            parts.append("Checked included")

        detail = {
            "cabin_kg": cabin_kg,
            "checked_kg": checked_kg,
            "cabin_pieces": cabin_pieces,
            "checked_pieces": checked_pieces,
            "has_carry_on": bag.get("hasCarryOnBag"),
            "has_checked": bag.get("hasCheckedBag"),
        }
        return {"summary": (" · ".join(parts) or None), "detail": detail}

    @staticmethod
    def _summarize_amenities(offer: dict[str, Any]) -> list[dict[str, Any]]:
        """Flatten unique per-segment amenities (only those LiteAPI marks available)."""
        seen: set[str] = set()
        out: list[dict[str, Any]] = []
        for seg in offer.get("segmentAmenities") or []:
            for am in seg.get("amenities") or []:
                name = am.get("name")
                if not name or not am.get("available"):
                    continue
                key = str(name).lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(
                    {
                        "name": name,
                        "category": am.get("category"),
                        "chargeable": bool(am.get("chargeable")),
                    }
                )
        return out

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

    async def warm_up(self) -> None:
        """Open a LiteAPI connection early so the first search is faster."""
        await self._provider.warm_up()

    async def close(self) -> None:
        """Release underlying provider resources."""
        await self._provider.close()
