from __future__ import annotations
"""Business logic layer for flight operations."""

import asyncio
import re
from typing import Any
from collections import defaultdict

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


def _money_amount(value: Any) -> Any:
    """Pull a numeric amount from LiteAPI money / pricing.display shapes."""
    if value is None or isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    if isinstance(value, dict):
        for key in ("amount", "total", "value"):
            if value.get(key) is not None:
                return _money_amount(value.get(key))
        display = value.get("display") or value.get("pricing")
        if isinstance(display, dict):
            return _money_amount(display.get("amount") if "amount" in display else display)
        pricing = value.get("pricing")
        if isinstance(pricing, dict):
            return _money_amount(pricing.get("display") or pricing)
    return None


def _money_currency(value: Any, fallback: Any = None) -> Any:
    if isinstance(value, dict):
        for key in ("currency", "currencyCode"):
            if value.get(key):
                return value.get(key)
        display = value.get("display")
        if isinstance(display, dict) and display.get("currency"):
            return display.get("currency")
        pricing = value.get("pricing")
        if isinstance(pricing, dict):
            return _money_currency(pricing.get("display") or pricing, fallback)
    return fallback


def _extract_cancel_payload(raw: Any) -> dict[str, Any]:
    """Normalize LiteAPI cancel + pre-cancel quote envelopes into a flat dict.

    POST /cancellations → flat cancellation_fee / refund_amount.
    GET /cancellations  → nested refund / penalty (+ isRefundable, isVoidable).
    """
    if not isinstance(raw, dict):
        return {}
    payload = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    if isinstance(raw.get("data"), list) and raw["data"] and isinstance(raw["data"][0], dict):
        first = raw["data"][0]
        payload = first.get("cancellation") or first.get("quote") or first
    if not isinstance(payload, dict):
        return {}
    vouchers = payload.get("vouchers") or payload.get("voucher") or []
    if isinstance(vouchers, dict):
        vouchers = [vouchers]
    if not isinstance(vouchers, list):
        vouchers = []

    fee = payload.get("cancellation_fee")
    if fee is None:
        fee = payload.get("cancellationFee")
    if fee is None:
        fee = _money_amount(payload.get("penalty") or payload.get("penalties"))

    refund = payload.get("refund_amount")
    if refund is None:
        refund = payload.get("refundAmount")
    if refund is None:
        refund = _money_amount(payload.get("refund"))

    currency = (
        payload.get("currency")
        or _money_currency(payload.get("refund"))
        or _money_currency(payload.get("penalty"))
    )

    return {
        "status": payload.get("status"),
        "cancellation_fee": fee,
        "refund_amount": refund,
        "currency": currency,
        "destination": payload.get("destination") or payload.get("refund_destination"),
        "vouchers": vouchers,
        "http_status": raw.get("http_status"),
        "cancel_intent_at": payload.get("cancelIntentAt") or payload.get("cancel_intent_at"),
        "is_refundable": payload.get("isRefundable")
        if isinstance(payload.get("isRefundable"), bool)
        else payload.get("is_refundable"),
        "is_voidable": payload.get("isVoidable")
        if isinstance(payload.get("isVoidable"), bool)
        else payload.get("is_voidable"),
        "confidence": payload.get("confidence"),
    }

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
        "STV", "GOX", "SXR", "ATQ", "DXB", "AUH", "SHJ", "DOH", "JFK", "EWR", "LGA",
        "LAX", "SFO", "ORD", "LHR", "LGW", "CDG", "AMS", "FRA", "SIN", "BKK",
        "HKG", "NRT", "HND", "ICN", "KUL", "SYD", "MEL", "IST", "FCO", "MAD",
        "BCN", "MIA", "SEA", "BOS", "DFW", "DEN", "ATL", "YYZ", "YVR",
    }
)

# Return a broad result set (sorted cheapest-first) so the UI can page/filter
# client-side. Cap is a safety limit — diversify so one airline can't wipe others.
MAX_OFFERS_RETURNED = 80

# Prefer these carriers when seeding diversity (India domestic especially).
# LiteAPI often floods results with Air India fare-family variants and buries LCCs.
# Match on IATA marketing code OR canonical display name.
_AIRLINE_PRIORITY_CODES = (
    "6E",  # IndiGo
    "QP",  # Akasa
    "SG",  # SpiceJet
    "IX",  # Air India Express
    "UK",  # Vistara
    "AI",  # Air India
    "9I",  # Alliance Air
)

_AIRLINE_CODE_NAMES: dict[str, str] = {
    "6E": "IndiGo",
    "QP": "Akasa Air",
    "SG": "SpiceJet",
    "IX": "Air India Express",
    "AI": "Air India",
    "UK": "Vistara",
    "9I": "Alliance Air",
    "S5": "Star Air",
    "OG": "Flybig",
    "2T": "TruJet",
    "G8": "Go First",
    "I5": "AirAsia India",
    "EK": "Emirates",
    "EY": "Etihad Airways",
    "QR": "Qatar Airways",
    "SQ": "Singapore Airlines",
    "TG": "Thai Airways",
    "BA": "British Airways",
    "LH": "Lufthansa",
    "AF": "Air France",
    "KL": "KLM",
    "TK": "Turkish Airlines",
    "CX": "Cathay Pacific",
    "MH": "Malaysia Airlines",
    "UL": "SriLankan Airlines",
    "WY": "Oman Air",
    "FZ": "flydubai",
    "XY": "flynas",
    "J9": "Jazeera Airways",
    "G9": "Air Arabia",
}

_AIRLINE_NAME_ALIASES: tuple[tuple[str, str], ...] = (
    ("indigo", "IndiGo"),
    ("akasa air", "Akasa Air"),
    ("akasa", "Akasa Air"),
    ("spice jet", "SpiceJet"),
    ("spicejet", "SpiceJet"),
    ("air india express", "Air India Express"),
    ("airindia express", "Air India Express"),
    ("vistara", "Vistara"),
    ("air india", "Air India"),
    ("alliance air", "Alliance Air"),
    ("go first", "Go First"),
    ("goair", "Go First"),
)


def _normalize_airline_code(raw: Any) -> str:
    s = str(raw or "").strip().upper()
    if len(s) == 2 and s.isalnum():
        return s
    m = re.match(r"^([A-Z0-9]{2})\b", s)
    return m.group(1) if m else ""


def _canonicalize_airline(name: Any, code: Any = None) -> tuple[str, str]:
    """Return (display_name, iata_code) with stable identity across LiteAPI shapes."""
    c = _normalize_airline_code(code) or _normalize_airline_code(name)
    if c and c in _AIRLINE_CODE_NAMES:
        return _AIRLINE_CODE_NAMES[c], c

    n = str(name or "").strip()
    if not n:
        return (c or "Airline"), c

    key = re.sub(r"\s+", " ", n.lower())
    for alias, canon in _AIRLINE_NAME_ALIASES:
        if key == alias or key.startswith(alias + " "):
            # Prefer express before plain Air India when matching substrings
            return canon, c or next(
                (code for code, nm in _AIRLINE_CODE_NAMES.items() if nm == canon),
                "",
            )
    # Exact alias contains (e.g. "Indigo Airlines")
    for alias, canon in _AIRLINE_NAME_ALIASES:
        if alias in key:
            return canon, c or next(
                (code for code, nm in _AIRLINE_CODE_NAMES.items() if nm == canon),
                "",
            )
    return n, c


def _outbound_segs(offer: dict[str, Any]) -> list[dict[str, Any]]:
    segs = list(offer.get("segments_summary") or [])
    outbound = [s for s in segs if str(s.get("direction") or "").upper() != "INBOUND"]
    return outbound or segs


_FAKE_AIRLINE_RE = re.compile(
    r"nuit[eé]e|nuitee|\bsandbox\b|test\s*air|dummy\s*air|fake\s*air|mock\s*air",
    re.I,
)
_FAKE_AIRLINE_CODES = frozenset({"ND"})


def _is_fake_airline(name: Any = None, code: Any = None, flight_number: Any = None) -> bool:
    n = str(name or "")
    c = str(code or "").strip().upper()
    fn = str(flight_number or "").strip().upper().replace(" ", "")
    if _FAKE_AIRLINE_RE.search(n):
        return True
    if c in _FAKE_AIRLINE_CODES:
        return True
    if fn.startswith("ND"):
        return True
    return False


def _offer_airline_name(offer: dict[str, Any]) -> str:
    segs = _outbound_segs(offer)
    if segs:
        name, _code = _canonicalize_airline(
            segs[0].get("airline") or segs[0].get("operating_airline"),
            segs[0].get("airline_code"),
        )
        return name
    return "Airline"


def _schedule_fingerprint(offer: dict[str, Any]) -> str:
    """One key per marketed flight schedule (same plane/times; fares may differ)."""
    segs = _outbound_segs(offer)
    if not segs:
        return str(offer.get("offer_id") or id(offer))
    first, last = segs[0], segs[-1]
    code = _normalize_airline_code(
        first.get("airline_code") or first.get("airline")
    ) or str(first.get("airline") or "").upper()
    return "|".join(
        [
            code,
            str(first.get("flight_number") or "").upper(),
            str(first.get("departure") or "")[:16],
            str(last.get("arrival") or "")[:16],
            str(len(segs)),
        ]
    )


# Cap fare rows per schedule so Air India branded-fare floods don't explode the UI.
_MAX_FARES_PER_SCHEDULE = 8


def _coerce_seats_remaining(value: Any) -> int | None:
    """Only pass through a real positive seat count from LiteAPI — never invent."""
    if value is None or value is False:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    # Guard against junk sentinels
    if n > 500:
        return None
    return n


def _extract_seats_remaining(offer: dict[str, Any], fare: dict[str, Any] | None = None) -> int | None:
    """Read seatsRemaining from LiteAPI fare / segmentFares only."""
    fare = fare or (offer.get("fare") or {})
    direct = _coerce_seats_remaining(
        fare.get("seatsRemaining")
        if isinstance(fare, dict)
        else None
    )
    if direct is not None:
        return direct

    # Per-segment scarcity — use the tightest (min) real value
    mins: list[int] = []
    for sf in offer.get("segmentFares") or []:
        if not isinstance(sf, dict):
            continue
        n = _coerce_seats_remaining(sf.get("seatsRemaining"))
        if n is not None:
            mins.append(n)
    if mins:
        return min(mins)
    return None


def _coerce_policy_flag(value: Any) -> bool | None:
    """Strict policy flag — never treat nonempty dicts/strings as True."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, dict):
        for key in (
            "allowed",
            "refundable",
            "changeable",
            "isRefundable",
            "isChangeable",
            "permitted",
            "possible",
            "eligible",
        ):
            if key in value and value.get(key) is not None:
                nested = _coerce_policy_flag(value.get(key))
                if nested is not None:
                    return nested
        tag = value.get("refundableTag") or value.get("tag") or value.get("code")
        if tag is not None:
            return _coerce_policy_flag(tag)
        return None
    if isinstance(value, str):
        tag = value.strip().upper().replace(" ", "_").replace("-", "_")
        if not tag:
            return None
        if tag in {
            "TRUE",
            "YES",
            "Y",
            "1",
            "REF",
            "RFN",
            "RFNC",
            "REFUNDABLE",
            "CHANGEABLE",
            "ALLOWED",
            "PERMITTED",
        }:
            return True
        if tag in {
            "FALSE",
            "NO",
            "N",
            "0",
            "NRF",
            "NRFN",
            "NONREF",
            "NON_REFUNDABLE",
            "NONREFUNDABLE",
            "NON_CHANGEABLE",
            "NONCHANGEABLE",
            "NOT_ALLOWED",
            "FORBIDDEN",
        }:
            return False
        return None
    return None


def _summary_policy_hints(lines: list[str]) -> tuple[bool | None, bool | None]:
    """Read refund/change hints from LiteAPI summary messages (danger wins)."""
    refund: bool | None = None
    change: bool | None = None
    for raw in lines:
        msg = str(raw or "").strip().lower()
        if not msg:
            continue
        if any(
            needle in msg
            for needle in (
                "non-refundable",
                "non refundable",
                "not refundable",
                "no refund",
            )
        ):
            refund = False
        elif refund is not False and (
            msg == "refundable"
            or msg.startswith("refundable ")
            or "fully refundable" in msg
            or "free cancellation" in msg
        ):
            refund = True
        if any(
            needle in msg
            for needle in (
                "non-changeable",
                "non changeable",
                "not changeable",
                "changes not allowed",
                "change not allowed",
                "no changes",
            )
        ):
            change = False
        elif change is not False and (
            "changes allowed" in msg
            or "changes permitted" in msg
            or msg == "changeable"
            or "free changes" in msg
        ):
            change = True
    return refund, change


def _extract_fare_terms(offer: dict[str, Any]) -> dict[str, Any]:
    """Pass through LiteAPI fare terms when present — no invented policies."""
    terms = offer.get("terms") or {}
    if not isinstance(terms, dict):
        return {}
    out: dict[str, Any] = {}

    lines: list[str] = []
    summary = terms.get("summary")
    if isinstance(summary, list) and summary:
        for item in summary[:8]:
            if isinstance(item, dict):
                text = item.get("message") or item.get("text") or item.get("label")
                if text and str(text).strip():
                    lines.append(str(text).strip())
            elif isinstance(item, str) and item.strip():
                lines.append(item.strip())
        if lines:
            out["summary"] = lines

    refundable = _coerce_policy_flag(terms.get("refundable"))
    changeable = _coerce_policy_flag(terms.get("changeable"))
    hint_refund, hint_change = _summary_policy_hints(lines)

    # Explicit summary danger/warning beats a loose True from the boolean field
    if hint_refund is False:
        refundable = False
    elif refundable is None and hint_refund is True:
        refundable = True
    if hint_change is False:
        changeable = False
    elif changeable is None and hint_change is True:
        changeable = True

    if refundable is not None:
        out["refundable"] = refundable
    if changeable is not None:
        out["changeable"] = changeable

    if terms.get("hasRefundFee") is True:
        out["has_refund_fee"] = True
    if terms.get("hasChangeFee") is True:
        out["has_change_fee"] = True
    return out


def _fare_option_snapshot(offer: dict[str, Any]) -> dict[str, Any]:
    """Slim fare row attached to a schedule card (hotel rate analogue)."""
    return {
        "offer_id": offer.get("offer_id"),
        # Never invent a family name — omit / null when LiteAPI didn't send one
        "fare_family": offer.get("fare_family") or None,
        "cabin_class": offer.get("cabin_class"),
        "total_price": offer.get("total_price"),
        "currency": offer.get("currency"),
        "price_base": offer.get("price_base"),
        "price_taxes": offer.get("price_taxes"),
        "price_fees": offer.get("price_fees"),
        "baggage": offer.get("baggage"),
        "baggage_detail": offer.get("baggage_detail"),
        "amenities": offer.get("amenities") or [],
        "seats_remaining": _coerce_seats_remaining(offer.get("seats_remaining")),
        "refundable": offer.get("refundable"),
        "changeable": offer.get("changeable"),
        "has_refund_fee": offer.get("has_refund_fee"),
        "has_change_fee": offer.get("has_change_fee"),
        "terms_summary": offer.get("terms_summary"),
    }


def _fare_family_key(offer: dict[str, Any]) -> str:
    family = str(offer.get("fare_family") or "").strip().lower()
    cabin = str(offer.get("cabin_class") or "").strip().lower()
    bag = str(offer.get("baggage") or "").strip().lower()
    # Distinct bookable products — same family+cabin+bag collapses to cheapest.
    return f"{family}|{cabin}|{bag}" or str(offer.get("offer_id") or id(offer))


def _group_fares_by_schedule(
    priced_offers: list[tuple[float, dict[str, Any]]],
) -> list[tuple[float, dict[str, Any]]]:
    """One card per schedule, with stacked fare_options (like hotel room rates).

    Keeps every distinct fare family for the same flight times, but collapses
    identical branded-fare clones to the cheapest. Primary offer = cheapest.
    """
    groups: dict[str, list[tuple[float, dict[str, Any]]]] = defaultdict(list)
    for price, offer in priced_offers:
        groups[_schedule_fingerprint(offer)].append((price, offer))

    out: list[tuple[float, dict[str, Any]]] = []
    for _key, items in groups.items():
        items.sort(key=lambda item: item[0])
        # Collapse identical fare products → cheapest
        by_product: dict[str, tuple[float, dict[str, Any]]] = {}
        for price, offer in items:
            pk = _fare_family_key(offer)
            prev = by_product.get(pk)
            if prev is None or price < prev[0]:
                by_product[pk] = (price, offer)
        unique = sorted(by_product.values(), key=lambda item: item[0])
        unique = unique[:_MAX_FARES_PER_SCHEDULE]

        primary_price, primary = unique[0]
        # Shallow-copy so we don't mutate shared refs across groups
        primary = dict(primary)
        primary["fare_options"] = [_fare_option_snapshot(o) for _p, o in unique]
        primary["fare_options_count"] = len(unique)
        out.append((primary_price, primary))

    out.sort(key=lambda item: item[0])
    return out


# Back-compat alias used by older call sites / tests
def _dedupe_cheapest_by_schedule(
    priced_offers: list[tuple[float, dict[str, Any]]],
) -> list[tuple[float, dict[str, Any]]]:
    return _group_fares_by_schedule(priced_offers)


def _airline_priority_key(name: str) -> tuple[int, float, str]:
    n = str(name or "").strip()
    canon, code = _canonicalize_airline(n, None)
    if code and code in _AIRLINE_PRIORITY_CODES:
        return (0, _AIRLINE_PRIORITY_CODES.index(code), canon.lower())
    key = canon.lower()
    for idx, pcode in enumerate(_AIRLINE_PRIORITY_CODES):
        pname = _AIRLINE_CODE_NAMES.get(pcode, "").lower()
        if pname and (key == pname or pname in key):
            return (0, idx, key)
    return (1, 999, key)


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
        *,
        voucher_code: str | None = None,
        use_payment_sdk: bool | None = None,
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
        code = (voucher_code or "").strip() or None
        sdk = (
            self._settings.liteapi_use_payment_sdk
            if use_payment_sdk is None
            else bool(use_payment_sdk)
        )
        request = PrebookRequest(
            offerId=offer_id,
            contact=prebook_contact,
            passengers=prebook_passengers,
            usePaymentSdk=sdk,
            includeCreditBalance=not sdk,
            voucherCode=code,
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
        payment_token: str | None = None,
    ) -> dict[str, Any]:
        """Complete booking via Stripe, agency credit, or whitelabel THIRD_PARTY JWT."""
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
        if method == PaymentMethod.THIRD_PARTY.value and not (payment_token or "").strip():
            raise ValidationError(
                "payment_token is required when completing booking with THIRD_PARTY (whitelabel/CMI)"
            )

        try:
            return await self._complete_with_payment(
                prebook_id,
                method,
                transaction_id,
                payment_token=payment_token,
            )
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
                    payment_token=payment_token,
                )
            raise

    async def _complete_with_payment(
        self,
        prebook_id: str,
        method: str,
        transaction_id: str | None,
        *,
        payment_token: str | None = None,
    ) -> dict[str, Any]:
        payment = BookingPayment(
            method=PaymentMethod(method),
            transactionId=transaction_id,
            token=(payment_token or None),
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

    async def get_cancellation_quote(self, booking_id: str) -> dict[str, Any]:
        """Preview LiteAPI cancel fee/refund without committing."""
        booking = await self.get_booking(booking_id)
        if not booking.get("found"):
            return {
                "ok": False,
                "found": False,
                "booking_id": booking_id,
                "message": "Booking not found.",
            }
        if booking.get("cancel_intent_at") and "CANCEL" not in str(booking.get("status") or "").upper():
            return {
                "ok": True,
                "found": True,
                "booking_id": booking_id,
                "status": booking.get("status"),
                "cancel_intent_at": booking.get("cancel_intent_at"),
                "pending": True,
                "message": (
                    "Cancellation already in progress with the airline. "
                    "Connect will flip to CANCELLED when they confirm."
                ),
            }
        try:
            raw = await self._provider.get_cancellation_quote(booking_id)
        except LiteAPIError as exc:
            if int(exc.status_code or 0) == 409:
                return {
                    "ok": True,
                    "found": True,
                    "booking_id": booking_id,
                    "status": booking.get("status"),
                    "cancel_intent_at": booking.get("cancel_intent_at"),
                    "pending": True,
                    "message": (
                        "Cancellation already in progress with the airline. "
                        "Connect will flip to CANCELLED when they confirm."
                    ),
                }
            return {
                "ok": False,
                "found": True,
                "booking_id": booking_id,
                "status": booking.get("status"),
                "message": str(exc)[:240] or "Could not load cancellation quote.",
            }
        except Exception as exc:
            return {
                "ok": False,
                "found": True,
                "booking_id": booking_id,
                "status": booking.get("status"),
                "message": str(exc)[:240] or "Could not load cancellation quote.",
            }
        quote = _extract_cancel_payload(raw)
        refund = quote.get("refund_amount")
        fee = quote.get("cancellation_fee")
        dest = quote.get("destination") or "original_payment"
        lines = [
            "LiteAPI cancel quote (estimate — final refund set when cancel completes).",
        ]
        if quote.get("is_voidable") is True:
            lines.append("Within void window (isVoidable).")
        if quote.get("is_refundable") is True:
            lines.append("Marked refundable by supplier.")
        elif quote.get("is_refundable") is False:
            lines.append("Marked non-refundable — penalty may apply.")
        if quote.get("confidence"):
            lines.append(f"Quote confidence: {quote['confidence']}.")
        return {
            "ok": True,
            "found": True,
            "booking_id": booking_id,
            "status": quote.get("status") or booking.get("status"),
            "cancellation_fee": fee,
            "refund_amount": refund,
            "currency": quote.get("currency") or booking.get("currency"),
            "destination": dest,
            "vouchers": quote.get("vouchers") or [],
            "is_refundable": quote.get("is_refundable"),
            "is_voidable": quote.get("is_voidable"),
            "confidence": quote.get("confidence"),
            "pending": False,
            "message": " ".join(lines),
        }

    async def get_booking_status(self, booking_id: str) -> dict[str, Any]:
        """Retrieve booking and extract status-focused summary."""
        booking = await self.get_booking(booking_id)
        status = str(booking.get("status") or "")
        pending = "CANCEL" not in status.upper() and bool(
            booking.get("cancel_intent_at") or booking.get("provider_cancel_status")
        )
        return {
            "booking_id": booking.get("booking_id"),
            "status": booking.get("status"),
            "payment_status": booking.get("payment_status"),
            "airline_pnr": booking.get("airline_pnr"),
            "booking_ref": booking.get("booking_ref"),
            "cancel_intent_at": booking.get("cancel_intent_at"),
            "provider_cancel_status": booking.get("provider_cancel_status"),
            "pending": pending,
        }

    async def cancel_booking(self, booking_id: str) -> dict[str, Any]:
        """
        Cancel via LiteAPI POST /flights/bookings/{id}/cancellations
        (legacy PUT fallback). Re-fetches booking afterwards.
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
        quote: dict[str, Any] = {}
        http_status = 0
        # Already awaiting airline confirmation — don't re-POST (LiteAPI 409)
        if before.get("cancel_intent_at") and "CANCEL" not in prior_status.upper():
            quote = {
                "http_status": 202,
                "status": prior_status,
                "cancel_intent_at": before.get("cancel_intent_at"),
            }
            http_status = 202
            after = before
        else:
            try:
                raw = await self._provider.cancel_booking(booking_id)
                quote = _extract_cancel_payload(raw)
                http_status = int(quote.get("http_status") or 0)
            except LiteAPIError as exc:
                # 409 conflict: cancellation already in progress
                if int(exc.status_code or 0) == 409:
                    after = await self.get_booking(booking_id)
                    quote = {
                        "http_status": 202,
                        "status": after.get("status") or prior_status,
                        "cancel_intent_at": after.get("cancel_intent_at")
                        or before.get("cancel_intent_at"),
                    }
                    http_status = 202
                else:
                    raise
            else:
                after = await self.get_booking(booking_id)

        # LiteAPI 202 = accepted, airline still confirming. Poll briefly so Connect
        # can flip to CANCELLED before we return when sandbox finalizes quickly.
        status = str(after.get("status") or quote.get("status") or prior_status)
        if http_status == 202 or (
            "CANCEL" not in status.upper()
            and (quote.get("cancel_intent_at") or after.get("cancel_intent_at"))
        ):
            for attempt in range(8):
                await asyncio.sleep(1.5 if attempt < 4 else 2.5)
                after = await self.get_booking(booking_id)
                status = str(after.get("status") or status)
                if "CANCEL" in status.upper():
                    http_status = 200
                    break

        status = str(after.get("status") or quote.get("status") or prior_status)
        pending = "CANCEL" not in status.upper() and (
            http_status == 202
            or bool(
                quote.get("cancel_intent_at")
                or after.get("cancel_intent_at")
                or after.get("provider_cancel_status")
            )
        )
        cancelled = (not pending) and "CANCEL" in status.upper()
        refund = quote.get("refund_amount")
        fee = quote.get("cancellation_fee")
        currency = quote.get("currency") or after.get("currency") or before.get("currency")
        destination = quote.get("destination")
        vouchers = quote.get("vouchers") or []

        # Prefer amounts from the cancel POST body once finalized
        if cancelled:
            if refund is None:
                refund = quote.get("refund_amount")
            if fee is None:
                fee = quote.get("cancellation_fee")
        destination = destination or quote.get("destination") or "original_payment"
        status_u = status.upper()
        with_charges = "CANCELLED_WITH_CHARGES" in status_u or (
            cancelled and fee is not None and float(fee or 0) > 0
        )

        if pending:
            message = (
                "Cancel requested — LiteAPI accepted it (HTTP 202). "
                "Status stays CONFIRMED on Connect until the airline finalizes; "
                "refund is issued automatically to the original payment once CANCELLED."
            )
        elif with_charges:
            message = (
                "Booking cancelled with charges (CANCELLED_WITH_CHARGES). "
                "LiteAPI credits any remaining refund_amount to the original payment source."
            )
        elif cancelled:
            message = (
                "Booking cancelled (CANCELLED). "
                "LiteAPI refunds to the original payment / wallet automatically."
            )
        else:
            message = (
                "Cancellation request was sent. The booking still shows as "
                f"{status or 'confirmed'} — keep your airline PNR handy."
            )

        return {
            "cancelled": cancelled,
            "pending": pending,
            "found": True,
            "booking_id": booking_id,
            "status": status,
            "prior_status": prior_status,
            "airline_pnr": after.get("airline_pnr") or before.get("airline_pnr"),
            "booking_ref": after.get("booking_ref") or before.get("booking_ref"),
            "cancel_intent_at": after.get("cancel_intent_at") or quote.get("cancel_intent_at"),
            "provider_cancel_status": after.get("provider_cancel_status"),
            "refund_amount": refund,
            "cancellation_fee": fee,
            "currency": currency,
            "destination": destination,
            "vouchers": vouchers,
            "http_status": http_status or quote.get("http_status"),
            "segments_summary": after.get("segments_summary") or before.get("segments_summary"),
            "liteapi_auto_refund": True,
            "message": message,
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
                    first_seg = (seg_summary or outbound_segs or [{}])[0] or {}
                    if _is_fake_airline(
                        first_seg.get("airline") or first_seg.get("operating_airline"),
                        first_seg.get("airline_code"),
                        first_seg.get("flight_number"),
                    ):
                        continue
                    baggage = self._summarize_baggage(offer)
                    terms = _extract_fare_terms(offer)
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
                                "seats_remaining": _extract_seats_remaining(offer, fare),
                                "refundable": terms.get("refundable"),
                                "changeable": terms.get("changeable"),
                                "has_refund_fee": terms.get("has_refund_fee"),
                                "has_change_fee": terms.get("has_change_fee"),
                                "terms_summary": terms.get("summary"),
                                # Set after global sort — journey.isCheapest was marking every offer
                                "is_cheapest": False,
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
        # One schedule card + stacked fare_options (hotel room rates pattern).
        # Collapses identical fare clones; keeps distinct families (Saver/Flex/…).
        offers = _group_fares_by_schedule(offers)
        trimmed = self._select_diverse_offers(offers, MAX_OFFERS_RETURNED)
        for idx, offer in enumerate(trimmed, start=1):
            offer["index"] = idx
            offer["is_cheapest"] = idx == 1

        return {
            "total_offers": len(offers),
            "offers": trimmed,
            "raw_count": len(raw.get("data") or []),
        }

    @staticmethod
    def _select_diverse_offers(
        priced_offers: list[tuple[float, dict[str, Any]]],
        limit: int,
    ) -> list[dict[str, Any]]:
        """Keep cheap fares, but don't let one airline wipe out every other carrier.

        LiteAPI often returns hundreds of fare variants from a single marketing
        carrier. After schedule-dedupe we still seed IndiGo/Akasa/etc. early so
        domestic LCC options aren't buried under full-service fare walls.
        """
        if not priced_offers:
            return []

        by_airline: dict[str, list[tuple[float, dict[str, Any]]]] = defaultdict(list)
        for price, offer in priced_offers:
            by_airline[_offer_airline_name(offer)].append((price, offer))

        airline_order = sorted(
            by_airline.keys(),
            key=lambda name: (
                _airline_priority_key(name)[0],
                _airline_priority_key(name)[1],
                by_airline[name][0][0] if by_airline[name] else float("inf"),
            ),
        )

        # Always rotate airlines into the top of the list (even under the cap).
        if len(priced_offers) <= limit:
            if len(by_airline) <= 1:
                return [item[1] for item in priced_offers]
            out: list[dict[str, Any]] = []
            queues = [list(by_airline[n]) for n in airline_order]
            added = True
            while added:
                added = False
                for q in queues:
                    if q:
                        out.append(q.pop(0)[1])
                        added = True
            return out

        chosen: list[dict[str, Any]] = []
        chosen_ids: set[str] = set()
        # Guarantee every carrier a solid seed before filling cheapest-first.
        per_airline = max(8, min(50, limit // max(len(airline_order), 1)))

        for depth in range(per_airline):
            for name in airline_order:
                if len(chosen) >= limit:
                    break
                bucket = by_airline[name]
                if depth >= len(bucket):
                    continue
                offer = bucket[depth][1]
                oid = str(offer.get("offer_id") or id(offer))
                if oid in chosen_ids:
                    continue
                chosen_ids.add(oid)
                chosen.append(offer)
            if len(chosen) >= limit:
                break

        for _price, offer in priced_offers:
            if len(chosen) >= limit:
                break
            oid = str(offer.get("offer_id") or id(offer))
            if oid in chosen_ids:
                continue
            chosen_ids.add(oid)
            chosen.append(offer)

        return chosen

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
            "cancel_intent_at": booking.get("cancelIntentAt") or booking.get("cancel_intent_at"),
            "provider_cancel_status": booking.get("providerCancelStatus")
            or booking.get("provider_cancel_status"),
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
                    "airline": _canonicalize_airline(
                        carrier.get("marketingName") or carrier.get("marketingCode"),
                        carrier.get("marketingCode"),
                    )[0],
                    "airline_code": _normalize_airline_code(carrier.get("marketingCode"))
                    or carrier.get("marketingCode"),
                    "operating_airline": carrier.get("operatingName"),
                    "logo": carrier.get("marketingLogo") or carrier.get("operatingLogo"),
                    "flight_number": FlightService._format_flight_number(
                        carrier.get("marketingCode"),
                        flight.get("marketingNumber") or flight.get("operatingNumber"),
                    ),
                    "duration_minutes": duration.get("minutes"),
                    "direction": seg.get("direction"),
                }
            )
        return summary

    @staticmethod
    def _format_flight_number(code: Any, number: Any) -> str | None:
        """Return '6E 2324' style label from LiteAPI marketing code + number."""
        c = _normalize_airline_code(code) or str(code or "").strip().upper()
        if c and len(c) > 2:
            c = ""
        n = str(number or "").strip().upper().replace("FLIGHT ", "")
        if not n and not c:
            return None
        # Already "6E2324" / "6E 2324" — airline code must start with a letter
        # (avoid "5958" → "59 58").
        embedded = re.match(r"^([A-Z][A-Z0-9])\s*[-–]?\s*(\d{1,5}[A-Z]?)$", n)
        if embedded:
            return f"{embedded.group(1)} {embedded.group(2)}"
        digits = re.match(r"^(\d{1,5}[A-Z]?)$", n)
        if digits and c:
            return f"{c} {digits.group(1)}"
        if digits:
            return digits.group(1)
        if c and n and not n.startswith(c):
            return f"{c} {n}"
        return n or c or None

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
        elif cabin_pieces is not None:
            parts.append(f"Cabin {cabin_pieces} PC" if cabin_pieces != 1 else "Cabin 1 PC")
        elif bag.get("hasCarryOnBag"):
            parts.append("Cabin included")
        if checked_kg is not None:
            parts.append(f"Checked {checked_kg:g}kg")
        elif checked_pieces is not None:
            parts.append(
                f"Checked {checked_pieces} PC" if checked_pieces != 1 else "Checked 1 PC"
            )
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
