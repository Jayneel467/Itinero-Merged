"""LangChain tools wrapping FlightService."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.tools import StructuredTool

from flight_agent.exceptions import FlightAgentError, LiteAPIError, UnsupportedOperationError
from flight_agent.llm.booking_requirements import (
    booking_details_prompt,
    build_booking_requirements,
    detect_route_type,
    liteapi_document_type,
    missing_traveler_labels,
    requirements_from_session,
    services_question_prompt,
    summarize_attachable_services,
)
from flight_agent.llm.confirmation import (
    booking_summary_prompt,
    payment_summary_prompt,
    reset_booking_flow,
)
from flight_agent.llm.user_copy import passengers_question_prompt, service_preference_question
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import ContactSlot, FlightIntent, FlightSearchParams, PassengerSlot
from flight_agent.services.flight_service import FlightService

logger = get_logger(__name__)

MAX_OFFERS_SHOWN = 5

TOOL_TO_INTENT: dict[str, FlightIntent] = {
    "search_flights": FlightIntent.SEARCH_FLIGHTS,
    "verify_flight_offer": FlightIntent.VERIFY_OFFER,
    "get_booking_requirements": FlightIntent.VERIFY_OFFER,
    "set_booking_passengers": FlightIntent.SEARCH_FLIGHTS,
    "set_service_preference": FlightIntent.ATTACH_SERVICES,
    "save_traveler_info": FlightIntent.PREBOOK,
    "prebook_flight": FlightIntent.PREBOOK,
    "list_flight_services": FlightIntent.ATTACH_SERVICES,
    "attach_flight_services": FlightIntent.ATTACH_SERVICES,
    "complete_flight_booking": FlightIntent.COMPLETE_BOOKING,
    "get_flight_booking": FlightIntent.GET_BOOKING,
    "list_flight_bookings": FlightIntent.LIST_BOOKINGS,
    "get_booking_status": FlightIntent.BOOKING_STATUS,
    "cancel_flight_booking": FlightIntent.CANCEL_BOOKING,
}


def _apply_full_name(full_name: str, draft: dict[str, Any]) -> None:
    parts = full_name.strip().split()
    if len(parts) >= 2:
        draft["passenger_first_name"] = parts[0]
        draft["passenger_last_name"] = " ".join(parts[1:])
    elif parts:
        draft["passenger_first_name"] = parts[0]


def _apply_phone(phone: str, draft: dict[str, Any]) -> None:
    cleaned = re.sub(r"[\s\-()]", "", phone.strip())
    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if len(digits) > 10:
            draft["contact_phone_country_code"] = digits[:-10]
            draft["contact_phone_number"] = digits[-10:]
        else:
            draft.setdefault("contact_phone_country_code", "1")
            draft["contact_phone_number"] = digits
    else:
        draft["contact_phone_number"] = cleaned
        draft.setdefault("contact_phone_country_code", "1")


def _merge_traveler_draft(session: SessionContext, **fields: Any) -> dict[str, Any]:
    draft = dict(session.traveler_draft)
    for key, value in fields.items():
        if value is not None and value != "":
            draft[key] = value
    if fields.get("full_name"):
        _apply_full_name(str(fields["full_name"]), draft)
    if fields.get("phone"):
        _apply_phone(str(fields["phone"]), draft)
    if fields.get("email"):
        draft["contact_email"] = fields["email"]
    session.traveler_draft = draft
    return draft


def _missing_prebook_fields(session: SessionContext, default_country: str = "IN") -> list[str]:
    req = requirements_from_session(session, default_country)
    return missing_traveler_labels(session.traveler_draft, req)


def _ensure_document_defaults(session: SessionContext, draft: dict[str, Any], default_country: str) -> None:
    req = requirements_from_session(session, default_country)
    draft.setdefault("passenger_document_type", req.get("document_type", "passport"))
    if not draft.get("passenger_document_expiry") and not req.get("document_expiry_required"):
        draft["passenger_document_expiry"] = "2030-12-31"
    nat = draft.get("passenger_nationality") or default_country
    draft.setdefault("passenger_nationality", nat)
    draft.setdefault("passenger_document_issue_country", nat)


def _trim_search_result(result: dict[str, Any]) -> dict[str, Any]:
    offers = result.get("offers") or []
    total = result.get("total_offers", len(offers))
    trimmed = offers[:MAX_OFFERS_SHOWN]
    return {
        "total_offers": total,
        "showing": len(trimmed),
        "offers": trimmed,
    }


def _resolve_offer_id(
    service: FlightService,
    session: SessionContext,
    offer_index: int | None,
    offer_id: str | None,
) -> str | None:
    oid = offer_id or session.verified_offer_id or session.selected_offer_id
    idx = offer_index if offer_index is not None else session.selected_offer_index
    if idx is not None:
        oid = service.select_offer_from_index(session.last_search_results, idx)
        session.selected_offer_index = idx
    return oid


def build_flight_tools(
    service: FlightService,
    session: SessionContext,
) -> list[StructuredTool]:
    """Build LiteAPI-backed tools bound to the active session."""

    async def search_flights(
        origin: str,
        destination: str,
        departure_date: str,
        return_date: str | None = None,
        adults: int = 1,
        children: int = 0,
        infants: int = 0,
        cabin_class: str | None = None,
    ) -> str:
        """Search flights. Use when user gives route and date (city names or IATA codes OK).
        Examples: Mumbai to Delhi, BOM-DEL, 2 adults. Dates as YYYY-MM-DD."""
        params = FlightSearchParams(
            origin=origin,
            destination=destination,
            departure_date=departure_date,
            return_date=return_date,
            adults=adults,
            children=children,
            infants=infants,
            cabin_class=cabin_class,
            currency=service._settings.default_currency,
        )
        resolved_origin, resolved_dest = await service.resolve_search_airports(
            params.origin, params.destination
        )
        params = params.model_copy(update={"origin": resolved_origin, "destination": resolved_dest})
        session.search_context = {
            "origin": resolved_origin,
            "destination": resolved_dest,
            "departure_date": params.departure_date,
            "return_date": params.return_date,
            "adults": adults,
            "children": children,
            "infants": infants,
            "cabin_class": cabin_class or "ECONOMY",
        }
        session.booking_requirements = {}
        session.available_services = {}
        session.selected_services = []
        session.passengers_confirmed = False
        reset_booking_flow(session)
        try:
            result = await service.search(params)
        except LiteAPIError as exc:
            return json.dumps(
                {
                    "status": "search_failed",
                    "error": str(exc),
                    "user_prompt": (
                        "I couldn't fetch flights right now. Please check your route and date, "
                        "then try again in a moment.\n\n"
                        f"Route: **{resolved_origin} → {resolved_dest}** on **{params.departure_date}**"
                    ),
                    "llm_instruction": "Tell user search failed briefly. Suggest retry or different date.",
                }
            )
        session.last_search_results = result.get("offers") or []
        if not session.last_search_results:
            return json.dumps(
                {
                    "status": "no_flights",
                    "total_offers": 0,
                    "user_prompt": (
                        f"No flights found for **{resolved_origin} → {resolved_dest}** "
                        f"on **{params.departure_date}**. Try another date or nearby airports."
                    ),
                    "llm_instruction": "Tell user no flights found. Suggest different date.",
                }
            )
        return json.dumps(_trim_search_result(result))

    async def set_booking_passengers(
        adults: int = 1,
        children: int = 0,
        infants: int = 0,
        cabin_class: str | None = None,
    ) -> str:
        """Save passenger counts BEFORE verify. Call when user says option 1/2/3 AND how many adults/children/infants."""
        search = dict(session.search_context or {})
        search.update(
            {
                "adults": max(1, adults),
                "children": max(0, children),
                "infants": max(0, infants),
            }
        )
        if cabin_class:
            search["cabin_class"] = cabin_class
        session.search_context = search
        session.passengers_confirmed = True
        if session.booking_requirements:
            session.booking_requirements = build_booking_requirements(
                route_type=session.booking_requirements.get("route_type", "domestic"),
                origin=search.get("origin"),
                destination=search.get("destination"),
                adults=search["adults"],
                children=search["children"],
                infants=search["infants"],
                cabin_class=search.get("cabin_class"),
                default_country=service._settings.default_country,
            )
        total = search["adults"] + search["children"] + search["infants"]
        return json.dumps(
            {
                "status": "ready",
                "passengers": search,
                "user_prompt": (
                    f"Got it — **{search['adults']} adult(s)**"
                    + (f", **{search['children']} child(ren)**" if search["children"] else "")
                    + (f", **{search['infants']} infant(s)**" if search["infants"] else "")
                    + f" ({total} passenger(s) total).\n\n"
                    "I'll check the fare now. Say **option 1** (or your chosen number) if you haven't yet."
                ),
                "llm_instruction": "Confirm passenger count to user, then call verify_flight_offer for their chosen option.",
            }
        )

    async def set_service_preference(preference: str) -> str:
        """Record extras choice: none/skip, seats, baggage, or both. Call BEFORE list_flight_services."""
        pref = preference.strip().lower()
        mapping = {
            "none": "none",
            "skip": "none",
            "no": "none",
            "seat": "seats",
            "seats": "seats",
            "baggage": "baggage",
            "bag": "baggage",
            "both": "both",
        }
        resolved = mapping.get(pref, pref)
        if resolved not in {"none", "seats", "baggage", "both"}:
            return json.dumps(
                {
                    "status": "invalid",
                    "user_prompt": service_preference_question(session),
                    "llm_instruction": "Ask user to pick: seat, baggage, both, or skip.",
                }
            )
        session.service_preference = resolved
        session.awaiting_service_preference = False
        if not session.prebook_id:
            session.awaiting_booking_confirmation = True
            session.booking_confirmed = False
            session.awaiting_payment_confirmation = False
            session.payment_confirmed = False
            return json.dumps(
                {
                    "status": "await_confirmation",
                    "preference": resolved,
                    "user_prompt": booking_summary_prompt(session),
                    "summary_prompt": booking_summary_prompt(session),
                    "llm_instruction": "Show summary and ask user to reply YES to confirm.",
                }
            )
        if resolved == "none":
            session.awaiting_payment_confirmation = True
            return json.dumps(
                {
                    "status": "ready",
                    "preference": resolved,
                    "user_prompt": (
                        "No extras added. Reply **YES** when you're ready to confirm your ticket."
                    ),
                    "payment_prompt": payment_summary_prompt(session),
                }
            )
        return json.dumps(
            {
                "status": "ready",
                "preference": resolved,
                "user_prompt": (
                    f"You chose **{resolved}**. I'll show what's available — "
                    "pick one or say **skip**."
                ),
                "llm_instruction": "Call list_flight_services next, then help user choose.",
            }
        )

    async def verify_flight_offer(
        offer_index: int | None = None,
        offer_id: str | None = None,
    ) -> str:
        """Check fare and availability for selected option. ONLY after set_booking_passengers."""
        if offer_index is not None or offer_id:
            _resolve_offer_id(service, session, offer_index, offer_id)
        if not session.passengers_confirmed:
            return json.dumps(
                {
                    "status": "need_passenger_count",
                    "action": "ask_user",
                    "user_prompt": passengers_question_prompt(session),
                    "llm_instruction": (
                        "Ask how many passengers (adults, children, infants). "
                        "Call set_booking_passengers when user replies. Do NOT verify yet."
                    ),
                }
            )
        oid = _resolve_offer_id(service, session, offer_index, offer_id)
        if not oid:
            raise FlightAgentError("No offer selected. Search first, then provide an offer index.")
        result = await service.verify(oid)
        session.selected_offer_id = oid
        session.verified_offer_id = oid
        session.last_verified_offer = result
        search = session.search_context or {}
        route_type = detect_route_type(
            result.get("segments_summary") or [],
            search.get("origin"),
            search.get("destination"),
        )
        selected = next(
            (o for o in session.last_search_results if o.get("index") == session.selected_offer_index),
            {},
        )
        session.booking_requirements = build_booking_requirements(
            route_type=route_type,
            origin=search.get("origin"),
            destination=search.get("destination"),
            adults=int(search.get("adults") or 1),
            children=int(search.get("children") or 0),
            infants=int(search.get("infants") or 0),
            cabin_class=selected.get("cabin_class") or search.get("cabin_class"),
            verify_data=result,
            default_country=service._settings.default_country,
        )
        result["booking_requirements"] = session.booking_requirements
        result["details_prompt"] = booking_details_prompt(session)
        result["user_prompt"] = booking_details_prompt(session)
        result["llm_instruction"] = (
            "Tell user the fare is confirmed. Ask for traveler details using user_prompt. "
            "Mention passenger count from search context."
        )
        return json.dumps(result)

    async def get_booking_requirements() -> str:
        """Return traveler fields required for this verified offer (domestic vs international)."""
        if not session.last_verified_offer and not session.booking_requirements:
            return json.dumps(
                {
                    "status": "need_verify",
                    "message": "Search and verify a flight offer first.",
                }
            )
        req = requirements_from_session(session, service._settings.default_country)
        session.booking_requirements = req
        payload = {
            "status": "ready",
            "requirements": req,
            "details_prompt": booking_details_prompt(session),
            "user_prompt": booking_details_prompt(session),
            "llm_instruction": (
                "Tell the user what details you need in friendly language. "
                "Use user_prompt — do NOT mention LiteAPI or tools."
            ),
            "still_need": _missing_prebook_fields(session, service._settings.default_country),
        }
        return json.dumps(payload)

    async def save_traveler_info(
        full_name: str | None = None,
        email: str | None = None,
        phone: str | None = None,
        birthday: str | None = None,
        gender: str | None = None,
        passport_number: str | None = None,
        passport_expiry: str | None = None,
        id_number: str | None = None,
        id_expiry: str | None = None,
        nationality: str | None = None,
    ) -> str:
        """Save traveler details from user message. Use id_number for domestic India, passport_number for international."""
        nat = nationality or service._settings.default_country
        doc_number = id_number or passport_number
        doc_expiry = id_expiry or passport_expiry
        provided = any(
            v
            for v in (full_name, email, phone, birthday, gender, doc_number, doc_expiry)
            if v
        )
        draft = _merge_traveler_draft(
            session,
            full_name=full_name,
            email=email,
            phone=phone,
            passenger_birthday=birthday,
            passenger_gender=gender.upper()[0] if gender else None,
            passenger_document_number=doc_number,
            passenger_document_expiry=doc_expiry,
            passenger_nationality=nat,
            passenger_document_issue_country=nat,
        )
        _ensure_document_defaults(session, draft, service._settings.default_country)
        session.traveler_draft = draft
        missing = _missing_prebook_fields(session, service._settings.default_country)
        if missing:
            payload: dict[str, Any] = {
                "status": "incomplete",
                "still_need": missing,
                "action": "ask_user",
                "requirements": session.booking_requirements,
                "details_prompt": booking_details_prompt(session, missing),
            }
            if not provided:
                payload["message"] = (
                    f"Ask the user for all missing details in one message: {', '.join(missing)}. "
                    "Do not call save_traveler_info again until they reply."
                )
            else:
                payload["message"] = (
                    f"Some details saved. Ask for all remaining fields together: {', '.join(missing)}."
                )
            return json.dumps(payload)
        session.awaiting_service_preference = True
        session.service_preference = None
        session.awaiting_booking_confirmation = False
        session.booking_confirmed = False
        session.awaiting_payment_confirmation = False
        session.payment_confirmed = False
        return json.dumps(
            {
                "status": "await_service_preference",
                "action": "ask_user",
                "user_prompt": service_preference_question(session),
                "llm_instruction": (
                    "Traveler details are complete. Ask whether the user wants seat, baggage, "
                    "both, or no extras before asking for booking confirmation."
                ),
            }
        )

    async def prebook_flight(
        offer_index: int | None = None,
        offer_id: str | None = None,
    ) -> str:
        """Create a LiteAPI prebook when traveler data and offer are ready."""
        if session.awaiting_service_preference and not session.service_preference:
            return json.dumps(
                {
                    "status": "service_preference_required",
                    "action": "ask_user",
                    "user_prompt": service_preference_question(session),
                    "llm_instruction": "Ask about seat, baggage, both, or no extras before continuing.",
                }
            )
        if session.awaiting_booking_confirmation and not session.booking_confirmed:
            return json.dumps(
                {
                    "status": "confirmation_required",
                    "action": "ask_user",
                    "message": "User must confirm details first. Do NOT call prebook_flight until they reply YES.",
                "summary_prompt": booking_summary_prompt(session),
                "requirements": session.booking_requirements,
                "user_prompt": booking_summary_prompt(session),
                "llm_instruction": "Show summary and ask user to reply YES to confirm. No technical terms.",
            }
        )

        missing = _missing_prebook_fields(session, service._settings.default_country)
        if missing:
            return json.dumps({"status": "need_more", "still_need": missing})

        oid = _resolve_offer_id(service, session, offer_index, offer_id)
        if not oid:
            raise FlightAgentError("No verified offer. Search, select, and verify an offer first.")

        draft = session.traveler_draft
        req = requirements_from_session(session, service._settings.default_country)
        passenger = PassengerSlot(
            first_name=draft["passenger_first_name"],
            last_name=draft["passenger_last_name"],
            birthday=draft["passenger_birthday"],
            gender=str(draft["passenger_gender"])[0].upper(),
            nationality=draft.get("passenger_nationality", service._settings.default_country),
            document_type=liteapi_document_type(
                draft.get("passenger_document_type") or req.get("document_type", "passport")
            ),
            document_number=draft["passenger_document_number"],
            document_expiry=draft["passenger_document_expiry"],
            document_issue_country=draft.get(
                "passenger_document_issue_country", service._settings.default_country
            ),
        )
        contact = ContactSlot(
            first_name=draft["passenger_first_name"],
            last_name=draft["passenger_last_name"],
            email=draft["contact_email"],
            phone_country_code=str(draft["contact_phone_country_code"]),
            phone_number=str(draft["contact_phone_number"]),
        )
        result = await service.prebook(oid, [passenger], contact)
        session.prebook_id = result.get("prebook_id")
        session.transaction_id = result.get("transaction_id")
        session.secret_key = result.get("secret_key")
        session.last_prebook = result
        session.available_services = result.get("services") or {}
        session.awaiting_booking_confirmation = False
        session.booking_confirmed = False
        session.awaiting_payment_confirmation = False
        session.payment_confirmed = False
        if session.service_preference in {None, ""}:
            session.awaiting_service_preference = True
            session.service_preference = None
            result["status"] = "await_service_preference"
            result["user_prompt"] = service_preference_question(session)
            result["llm_instruction"] = (
                "Ask what extras user wants (seat/baggage/both/none) using user_prompt. "
                "Do NOT list options or ask for booking confirmation until they answer. "
                "Call set_service_preference when they reply."
            )
            return json.dumps(result)
        if session.service_preference == "none":
            session.awaiting_payment_confirmation = True
            result["status"] = "ready_for_booking"
            result["user_prompt"] = payment_summary_prompt(session)
            result["payment_prompt"] = payment_summary_prompt(session)
            result["llm_instruction"] = "No extras requested. Ask user to reply YES to confirm booking."
            return json.dumps(result)
        result["status"] = "ready_for_services"
        result["llm_instruction"] = (
            "User already chose extras. Call list_flight_services next and help them pick an option."
        )
        return json.dumps(result)

    async def list_flight_services() -> str:
        """List optional seats, baggage, and add-ons available for the current booking."""
        if session.awaiting_service_preference and not session.service_preference:
            return json.dumps(
                {
                    "status": "ask_preference_first",
                    "user_prompt": service_preference_question(session),
                    "llm_instruction": "Ask seat/baggage/both/none FIRST. Do not show options yet.",
                }
            )
        if session.service_preference == "none":
            return json.dumps(
                {
                    "status": "skipped",
                    "user_prompt": "No extras. Reply **YES** to confirm your booking.",
                    "payment_prompt": payment_summary_prompt(session),
                }
            )
        if not session.prebook_id and not session.available_services:
            return json.dumps(
                {
                    "status": "need_prebook",
                    "llm_instruction": "Complete the booking hold first, then check add-ons.",
                    "user_prompt": "I need to finish holding your flight before I can show add-ons.",
                }
            )
        services = session.available_services or summarize_attachable_services({})
        session.available_services = services
        pref = session.service_preference or "both"
        groups = services.get("groups") or []
        if pref in {"seats", "baggage"}:
            groups = [g for g in groups if pref.rstrip("s") in str(g.get("type", "")).lower()]
        payload = {
            "status": "ready",
            **services,
            "groups": groups,
            "user_prompt": services_question_prompt({**services, "groups": groups}),
            "llm_instruction": "Show options briefly. User picks one or says skip, then attach or confirm booking.",
        }
        return json.dumps(payload)

    async def attach_flight_services(selected_services_json: str) -> str:
        """Attach seats/baggage. Pass JSON list of {serviceId, passengerIndex, segmentKey}."""
        if not session.prebook_id:
            raise FlightAgentError("No active prebook. Call prebook_flight first.")
        try:
            selections = json.loads(selected_services_json)
        except json.JSONDecodeError as exc:
            raise FlightAgentError("selected_services_json must be valid JSON list") from exc
        if not isinstance(selections, list):
            raise FlightAgentError("selected_services_json must be a JSON list")
        if not selections:
            return json.dumps({"status": "skipped", "message": "No services selected."})

        result = await service.attach_services(session.prebook_id, selections)
        session.transaction_id = result.get("transaction_id") or session.transaction_id
        session.secret_key = result.get("secret_key") or session.secret_key
        session.selected_services = selections
        session.last_prebook = {**(session.last_prebook or {}), **result}
        result["status"] = "attached"
        result["llm_instruction"] = "Add-ons added. Show updated total and ask YES to confirm booking."
        result["user_prompt"] = payment_summary_prompt(session)
        session.awaiting_payment_confirmation = True
        result["payment_prompt"] = payment_summary_prompt(session)
        return json.dumps(result)

    async def complete_flight_booking(
        prebook_id: str | None = None,
        transaction_id: str | None = None,
    ) -> str:
        """Finalize a booking via LiteAPI."""
        if session.awaiting_service_preference and not session.service_preference:
            return json.dumps(
                {
                    "status": "ask_service_preference",
                    "user_prompt": service_preference_question(session),
                }
            )
        if session.awaiting_payment_confirmation and not session.payment_confirmed:
            return json.dumps(
                {
                    "status": "booking_confirmation_required",
                    "action": "ask_user",
                    "message": "User must confirm booking first. Do NOT complete until they reply YES.",
                    "payment_prompt": payment_summary_prompt(session),
                    "user_prompt": payment_summary_prompt(session),
                }
            )

        pid = prebook_id or session.prebook_id
        if not pid:
            raise FlightAgentError("No active prebook session.")
        tid = transaction_id or session.transaction_id
        try:
            result = await service.complete_booking(pid, transaction_id=tid)
        except LiteAPIError as exc:
            return json.dumps(
                {
                    "status": "booking_failed",
                    "error": str(exc),
                    "message": (
                        "Booking could not be completed. Your fare hold is still saved. "
                        "Card payment is not enabled yet — bookings use LiteAPI sandbox credit "
                        "(payment.method CREDIT). Ask your LiteAPI account admin to enable "
                        "credit-line billing, then try confirming again."
                    ),
                    "prebook_id": pid,
                    "user_prompt": (
                        "Sorry, I couldn't finish the booking right now. Your flight is still on hold. "
                        "Please try again in a moment, or contact support if this keeps happening."
                    ),
                    "llm_instruction": "Apologize briefly. Do not mention API errors or credit line details.",
                }
            )
        session.booking_id = result.get("booking_id")
        session.last_booking = result
        session.awaiting_payment_confirmation = False
        session.payment_confirmed = False
        if result.get("found"):
            pnr = result.get("airline_pnr") or result.get("booking_ref") or "—"
            bid = result.get("booking_id") or "—"
            result["status"] = "booked"
            result["user_prompt"] = (
                f"**Your flight is booked!**\n\n"
                f"- **Booking reference:** {bid}\n"
                f"- **Airline PNR:** {pnr}\n\n"
                "Please save these details. Have a safe trip!"
            )
            result["llm_instruction"] = (
                "Congratulate the user. Share booking reference and PNR clearly. No technical terms."
            )
        return json.dumps(result)

    async def get_flight_booking(
        booking_id: str | None = None,
        airline_pnr: str | None = None,
        passenger_last_name: str | None = None,
    ) -> str:
        """Retrieve booking details via LiteAPI."""
        if booking_id:
            result = await service.get_booking(booking_id)
        elif airline_pnr and passenger_last_name:
            result = await service.list_bookings(
                airline_pnr=airline_pnr,
                last_name=passenger_last_name,
            )
        else:
            bid = session.booking_id
            if not bid:
                raise FlightAgentError("booking_id or PNR with last name is required.")
            result = await service.get_booking(bid)
        return json.dumps(result)

    async def list_flight_bookings() -> str:
        """List account bookings via LiteAPI."""
        return json.dumps(await service.list_bookings())

    async def get_booking_status(booking_id: str | None = None) -> str:
        """Return booking status via LiteAPI."""
        bid = booking_id or session.booking_id
        if not bid:
            raise FlightAgentError("booking_id is required.")
        return json.dumps(await service.get_booking_status(bid))

    async def cancel_flight_booking(booking_id: str | None = None) -> str:
        """Request cancellation when supported by LiteAPI."""
        bid = booking_id or session.booking_id
        if not bid:
            raise FlightAgentError("booking_id is required.")
        try:
            await service.cancel_booking(bid)
            return json.dumps({"cancelled": True, "booking_id": bid})
        except UnsupportedOperationError as exc:
            return json.dumps({"cancelled": False, "message": exc.message})

    tool_functions = (
        search_flights,
        verify_flight_offer,
        get_booking_requirements,
        set_booking_passengers,
        save_traveler_info,
        prebook_flight,
        set_service_preference,
        list_flight_services,
        attach_flight_services,
        complete_flight_booking,
        get_flight_booking,
        list_flight_bookings,
        get_booking_status,
        cancel_flight_booking,
    )

    return [
        StructuredTool.from_function(
            coroutine=fn,
            name=fn.__name__,
            description=(fn.__doc__ or "").strip(),
        )
        for fn in tool_functions
    ]
