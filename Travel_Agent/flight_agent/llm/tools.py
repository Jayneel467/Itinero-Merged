"""LangChain tools wrapping FlightService."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.tools import StructuredTool

from flight_agent.exceptions import FlightAgentError, LiteAPIError
from flight_agent.llm.booking_requirements import (
    all_travelers_complete,
    booking_details_prompt,
    build_booking_requirements,
    current_traveler_slot,
    detect_route_type,
    ensure_travelers_draft,
    first_incomplete_traveler_index,
    liteapi_document_type,
    missing_traveler_labels,
    missing_traveler_labels_for_draft,
    next_traveler_details_prompt,
    passenger_saved_message,
    passenger_saved_summary,
    passenger_slot_plan,
    requirements_from_session,
    services_question_prompt,
    flatten_service_choices,
    summarize_attachable_services,
    sync_traveler_draft,
    traveler_progress,
    validate_passenger_dob_for_slot,
    validate_travelers_for_liteapi_prebook,
    is_valid_email,
)
from flight_agent.llm.confirmation import (
    booking_summary_prompt,
    hold_ready_prompt,
    reset_booking_flow,
)
from flight_agent.llm.user_copy import (
    booking_details_user_prompt,
    booking_list_user_prompt,
    cancel_confirmation_prompt,
    cancel_result_user_prompt,
    passengers_question_prompt,
    post_booking_help_prompt,
    service_preference_question,
)
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import ContactSlot, FlightIntent, FlightSearchParams, PassengerSlot
from flight_agent.services.flight_service import FlightService

logger = get_logger(__name__)

MAX_OFFERS_SHOWN = 12


def _hold_ready_payload(session: SessionContext) -> dict[str, Any]:
    """Agent stops at prebook; payment + ticket are backend checkout."""
    session.awaiting_payment_confirmation = False
    session.payment_confirmed = False
    session.payment_captured = False
    prompt = hold_ready_prompt(session)
    return {
        "status": "hold_ready",
        "prebook_id": session.prebook_id,
        "user_prompt": prompt,
        "payment_prompt": prompt,
        "llm_instruction": (
            "Fare is held. Do NOT ask for card details or complete the booking. "
            "Tell the user checkout will collect payment and issue the ticket."
        ),
    }

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


def _apply_phone(phone: str, draft: dict[str, Any], default_country_code: str = "91") -> None:
    cleaned = re.sub(r"[\s\-()]", "", phone.strip())
    if cleaned.startswith("+"):
        digits = cleaned[1:]
        if len(digits) > 10:
            draft["contact_phone_country_code"] = digits[:-10]
            draft["contact_phone_number"] = digits[-10:]
        else:
            draft.setdefault("contact_phone_country_code", default_country_code)
            draft["contact_phone_number"] = digits
    elif len(cleaned) == 10:
        draft["contact_phone_country_code"] = default_country_code
        draft["contact_phone_number"] = cleaned
    else:
        draft["contact_phone_number"] = cleaned
        draft.setdefault("contact_phone_country_code", default_country_code)


_COUNTRY_PHONE_CODES = {"IN": "91", "US": "1", "GB": "44", "AE": "971"}


def _merge_traveler_draft(
    session: SessionContext,
    *,
    default_country_code: str = "91",
    passenger_index: int | None = None,
    **fields: Any,
) -> dict[str, Any]:
    ensure_travelers_draft(session)
    idx = passenger_index if passenger_index is not None else session.current_traveler_index
    idx = max(0, min(idx, len(session.travelers_draft) - 1))
    draft = dict(session.travelers_draft[idx])
    for key, value in fields.items():
        if value is not None and value != "":
            draft[key] = value
    if fields.get("full_name"):
        _apply_full_name(str(fields["full_name"]), draft)
    if fields.get("phone"):
        _apply_phone(str(fields["phone"]), draft, default_country_code)
    if fields.get("email"):
        draft["contact_email"] = fields["email"]
    session.travelers_draft[idx] = draft
    session.traveler_draft = draft
    session.current_traveler_index = idx
    return draft


def _missing_for_passenger_index(
    session: SessionContext,
    passenger_index: int,
    default_country: str = "IN",
) -> list[str]:
    """Missing fields for one passenger slot only (used right after save_traveler_info)."""
    plan = passenger_slot_plan(session)
    ensure_travelers_draft(session)
    if passenger_index < 0 or passenger_index >= len(plan):
        return []
    req = requirements_from_session(session, default_country)
    slot = plan[passenger_index]
    draft = session.travelers_draft[passenger_index]
    return missing_traveler_labels_for_draft(draft, req, slot)


def _missing_prebook_fields(session: SessionContext, default_country: str = "IN") -> list[str]:
    if len(passenger_slot_plan(session)) > 1:
        ensure_travelers_draft(session)
        idx = first_incomplete_traveler_index(session, default_country)
        if idx >= len(session.travelers_draft):
            return []
        return _missing_for_passenger_index(session, idx, default_country)
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
            err = str(exc).lower()
            status = getattr(exc, "status_code", None)
            auth_fail = status in (401, 403) or "unauthorized" in err or "forbidden" in err
            if auth_fail:
                prompt = (
                    "I reached the flight provider, but the API key was rejected "
                    f"(HTTP {status or '401'}).\n\n"
                    "Ask whoever runs Itinero to update **API_KEY / LITEAPI_API_KEY** "
                    "in Travel_Agent/.env (or supervisor/.env), restart the supervisor, "
                    "then try again — e.g. *Mumbai to Delhi on 26 July*.\n\n"
                    f"Route checked: **{resolved_origin} → {resolved_dest}** on **{params.departure_date}**"
                )
            else:
                prompt = (
                    "Sorry — live flight search failed just now.\n\n"
                    f"**Detail:** {exc}\n\n"
                    "Double-check the route and date, then try again.\n"
                    f"Route: **{resolved_origin} → {resolved_dest}** on **{params.departure_date}**"
                )
            return json.dumps(
                {
                    "status": "search_failed",
                    "error": str(exc),
                    "http_status": status,
                    "user_prompt": prompt,
                    "llm_instruction": (
                        "Share the user_prompt almost as-is. Be warm and clear. "
                        "If it's an API key issue, say the flight key needs updating — "
                        "don't invent fares."
                    ),
                }
            )
        session.last_search_results = result.get("offers") or []
        if not session.last_search_results:
            return json.dumps(
                {
                    "status": "no_flights",
                    "total_offers": 0,
                    "user_prompt": (
                        f"No flights for **{resolved_origin} → {resolved_dest}** "
                        f"on **{params.departure_date}**. Want to try another date "
                        f"or a nearby airport?"
                    ),
                    "llm_instruction": (
                        "Say no flights found warmly. Suggest another date or nearby airport."
                    ),
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
        ensure_travelers_draft(session)
        session.current_traveler_index = 0
        sync_traveler_draft(session)
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
        if total > 1:
            parts = []
            if search["adults"]:
                parts.append(f"**{search['adults']} adult(s)**")
            if search["children"]:
                parts.append(f"**{search['children']} child(ren)** (ages 2–11)")
            if search["infants"]:
                parts.append(f"**{search['infants']} infant(s)** (under 2)")
            pax_saved = (
                "Got it — " + ", ".join(parts) + f" ({total} passenger(s) total)."
                + f"\n\nI'll collect details for **each passenger** one by one."
                + "\n- **Adults:** name, email, phone, DOB, gender, ID"
                + "\n- **Children:** name, DOB, gender, ID (no email/phone)"
                + "\n- **Infants:** name, DOB, gender, birth certificate/ID (no email/phone)"
            )
        else:
            pax_saved = (
                f"Got it — **{search['adults']} adult(s)**"
                + (f", **{search['children']} child(ren)**" if search["children"] else "")
                + (f", **{search['infants']} infant(s)**" if search["infants"] else "")
                + f" ({total} passenger(s) total)."
            )
        return json.dumps(
            {
                "status": "ready",
                "passengers": search,
                "user_prompt": pax_saved + "\n\nI'll check the fare now for your chosen flight.",
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
            payload = _hold_ready_payload(session)
            payload["preference"] = resolved
            return json.dumps(payload)
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
        ensure_travelers_draft(session)
        result["details_prompt"] = next_traveler_details_prompt(
            session, service._settings.default_country
        )
        result["user_prompt"] = result["details_prompt"]
        result["llm_instruction"] = (
            "Tell user the fare is confirmed. Ask for traveler details one passenger at a time "
            "using user_prompt. Mention passenger count from search context."
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
        passenger_number: int | None = None,
    ) -> str:
        """Save ONE passenger's details. For 2+ adults, save Adult 1 first, then Adult 2, etc.
        passenger_number is 1-based (1=Adult 1, 2=Adult 2). Omit to use the current passenger in session.
        Every adult needs: name, email, phone, DOB, gender, ID (or passport for international).
        Use id_number for domestic India, passport_number for international."""
        if passenger_number is not None and passenger_number >= 1:
            ensure_travelers_draft(session)
            session.current_traveler_index = min(
                passenger_number - 1, len(session.travelers_draft) - 1
            )
        nat = nationality or service._settings.default_country
        doc_number = id_number or passport_number
        if doc_number:
            doc_number = str(doc_number).strip().replace(" ", "")
            if len(doc_number) > 15:
                return json.dumps(
                    {
                        "status": "incomplete",
                        "still_need": ["ID / document number"],
                        "action": "ask_user",
                        "user_prompt": (
                            f"The ID/document number `{doc_number}` is **{len(doc_number)} characters**. "
                            "It must be **15 or fewer** (Aadhaar is 12 digits). "
                            "Please send a shorter ID without spaces."
                        ),
                    }
                )
        doc_expiry = id_expiry or passport_expiry
        provided = any(
            v
            for v in (full_name, email, phone, birthday, gender, doc_number, doc_expiry)
            if v
        )
        draft = _merge_traveler_draft(
            session,
            default_country_code=_COUNTRY_PHONE_CODES.get(
                service._settings.default_country.upper(), "91"
            ),
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
        session.travelers_draft[session.current_traveler_index] = draft
        session.traveler_draft = draft
        slot_now = current_traveler_slot(session)
        if slot_now.get("needs_contact") and email and not is_valid_email(email):
            return json.dumps(
                {
                    "status": "incomplete",
                    "still_need": ["email"],
                    "action": "ask_user",
                    "current_passenger": slot_now.get("label"),
                    "details_prompt": (
                        f"**{slot_now.get('label')}** — the email `{email}` is not valid. "
                        "Please send a valid email address (e.g. name@example.com)."
                    ),
                    "user_prompt": (
                        f"That email doesn't look valid for **{slot_now.get('label')}**. "
                        "Please send a correct email address."
                    ),
                }
            )
        travel_date = (session.search_context or {}).get("departure_date")
        dob_error = validate_passenger_dob_for_slot(draft, slot_now, travel_date)
        if dob_error and draft.get("passenger_birthday"):
            return json.dumps(
                {
                    "status": "incomplete",
                    "still_need": ["date of birth"],
                    "action": "ask_user",
                    "current_passenger": slot_now.get("label"),
                    "user_prompt": dob_error,
                    "llm_instruction": "Tell user the date of birth does not match passenger type. Ask for correct DOB.",
                }
            )
        missing = _missing_for_passenger_index(
            session, session.current_traveler_index, service._settings.default_country
        )
        if missing:
            payload: dict[str, Any] = {
                "status": "incomplete",
                "still_need": missing,
                "action": "ask_user",
                "requirements": session.booking_requirements,
                "details_prompt": booking_details_prompt(
                    session, missing, service._settings.default_country
                ),
                "user_prompt": booking_details_prompt(
                    session, missing, service._settings.default_country
                ),
                "current_passenger": current_traveler_slot(session).get("label"),
            }
            if not provided:
                payload["message"] = (
                    f"Ask the user for all missing details for {payload['current_passenger']}: "
                    f"{', '.join(missing)}. Do not call save_traveler_info again until they reply."
                )
            else:
                still = ", ".join(missing)
                if "email" in still.lower():
                    payload["message"] = (
                        f"**{payload['current_passenger']}** still needs a valid **email** "
                        f"(required for every adult). Also check: {still}."
                    )
                else:
                    payload["message"] = (
                        f"Some details saved for {payload['current_passenger']}. "
                        f"Ask for remaining fields: {still}."
                    )
            return json.dumps(payload)

        if not all_travelers_complete(session, service._settings.default_country):
            done, total = traveler_progress(session, service._settings.default_country)
            saved_idx = session.current_traveler_index
            saved_draft = session.travelers_draft[saved_idx]
            saved_slot = passenger_slot_plan(session)[saved_idx]
            next_idx = first_incomplete_traveler_index(session, service._settings.default_country)
            session.current_traveler_index = next_idx
            sync_traveler_draft(session)
            slot = current_traveler_slot(session)
            confirmed = passenger_saved_message(saved_draft, saved_slot)
            return json.dumps(
                {
                    "status": "need_next_traveler",
                    "completed": done,
                    "total": total,
                    "current_passenger": slot.get("label"),
                    "saved_passenger": passenger_saved_summary(saved_draft, saved_slot),
                    "user_prompt": (
                        confirmed
                        + "\n\n"
                        + next_traveler_details_prompt(
                            session, service._settings.default_country
                        )
                    ),
                    "llm_instruction": (
                        f"Confirm {done} of {total} passenger(s) saved including email. "
                        "Show saved_passenger summary, then ask for the next adult using user_prompt."
                    ),
                }
            )
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

        liteapi_ok, liteapi_errors = validate_travelers_for_liteapi_prebook(
            session, service._settings.default_country
        )
        if not liteapi_ok:
            return json.dumps(
                {
                    "status": "traveler_validation_failed",
                    "action": "ask_user",
                    "errors": liteapi_errors,
                    "user_prompt": (
                        "Some passenger details are still missing or invalid for booking:\n\n"
                        + "\n".join(f"- {e}" for e in liteapi_errors)
                        + "\n\nPlease send the missing details for the passenger listed above."
                    ),
                    "llm_instruction": "Show user_prompt. Do not call prebook until all adults have valid email.",
                }
            )

        oid = _resolve_offer_id(service, session, offer_index, offer_id)
        if not oid:
            raise FlightAgentError("No verified offer. Search, select, and verify an offer first.")

        draft = session.traveler_draft
        req = requirements_from_session(session, service._settings.default_country)
        plan = passenger_slot_plan(session)
        ensure_travelers_draft(session)
        passengers: list[PassengerSlot] = []
        for i, slot in enumerate(plan):
            d = session.travelers_draft[i] if i < len(session.travelers_draft) else draft
            passengers.append(
                PassengerSlot(
                    first_name=d["passenger_first_name"],
                    last_name=d["passenger_last_name"],
                    birthday=d["passenger_birthday"],
                    gender=str(d["passenger_gender"])[0].upper(),
                    nationality=d.get("passenger_nationality", service._settings.default_country),
                    document_type=liteapi_document_type(
                        d.get("passenger_document_type") or req.get("document_type", "passport")
                    ),
                    document_number=str(d["passenger_document_number"]).strip().replace(" ", ""),
                    document_expiry=d["passenger_document_expiry"],
                    document_issue_country=d.get(
                        "passenger_document_issue_country", service._settings.default_country
                    ),
                    passenger_type=int(slot.get("passenger_type", 0)),
                )
            )
        lead = session.travelers_draft[0] if session.travelers_draft else draft
        contact = ContactSlot(
            first_name=lead["passenger_first_name"],
            last_name=lead["passenger_last_name"],
            email=lead["contact_email"],
            phone_country_code=str(lead["contact_phone_country_code"]),
            phone_number=str(lead["contact_phone_number"]),
        )
        try:
            # Agent hold only — Payment SDK / complete is backend checkout.
            result = await service.prebook(
                oid, passengers, contact, use_payment_sdk=False
            )
        except LiteAPIError as exc:
            from flight_agent.llm.booking_requirements import friendly_liteapi_prebook_error

            friendly = friendly_liteapi_prebook_error(exc)
            detail = ""
            if isinstance(exc.details, dict):
                detail = str(exc.details.get("description") or "")
            return json.dumps(
                {
                    "status": "prebook_failed",
                    "error": (detail or str(exc))[:300],
                    "user_prompt": friendly,
                    "llm_instruction": (
                        "Apologize briefly using user_prompt only — never say LiteAPIError. "
                        "If phone/DOB is mentioned, ask them to fix that field."
                    ),
                }
            )
        session.prebook_id = result.get("prebook_id")
        session.transaction_id = result.get("transaction_id")
        session.secret_key = result.get("secret_key")
        session.publishable_key = result.get("publishable_key") or session.publishable_key
        session.payment_captured = False
        session.last_prebook = result
        session.available_services = result.get("services") or {}
        if isinstance(session.available_services, dict):
            session.service_choices = (
                session.available_services.get("choices")
                or flatten_service_choices(session.available_services)
            )
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
            result.update(_hold_ready_payload(session))
            return json.dumps(result)
        # Preference already set — show numbered add-on list immediately.
        services = session.available_services or {}
        pref = session.service_preference or "both"
        groups = list(services.get("groups") or [])
        if pref in {"seats", "baggage"}:
            groups = [g for g in groups if pref.rstrip("s") in str(g.get("type", "")).lower()]
        filtered = {**services, "groups": groups, "available": bool(groups)}
        filtered["choices"] = flatten_service_choices(filtered)
        session.available_services = filtered
        session.service_choices = filtered["choices"]
        result["status"] = "ready_for_services"
        result["services"] = filtered
        result["user_prompt"] = services_question_prompt(filtered)
        result["llm_instruction"] = (
            "Show the numbered add-on list from user_prompt. "
            "When user replies with a number (e.g. 3) or seat code, call attach_flight_services."
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
            return json.dumps(_hold_ready_payload(session))
        if not session.prebook_id and not session.available_services:
            return json.dumps(
                {
                    "status": "need_prebook",
                    "llm_instruction": "Complete the booking hold first, then check add-ons.",
                    "user_prompt": "I need to finish holding your flight before I can show add-ons.",
                }
            )
        services = session.available_services or summarize_attachable_services({})
        pref = session.service_preference or "both"
        groups = services.get("groups") or []
        if pref in {"seats", "baggage"}:
            groups = [g for g in groups if pref.rstrip("s") in str(g.get("type", "")).lower()]
        filtered = {**services, "groups": groups, "available": bool(groups)}
        filtered["choices"] = flatten_service_choices(filtered)
        session.available_services = filtered
        session.service_choices = filtered["choices"]
        payload = {
            "status": "ready",
            **filtered,
            "user_prompt": services_question_prompt(filtered),
            "llm_instruction": (
                "Show numbered options. When user picks a number or seat code, "
                "call attach_flight_services. Or they can say skip."
            ),
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
        session.publishable_key = result.get("publishable_key") or session.publishable_key
        session.payment_captured = False
        session.selected_services = selections
        session.last_prebook = {**(session.last_prebook or {}), **result}
        result.update(_hold_ready_payload(session))
        result["status"] = "attached"
        result["llm_instruction"] = (
            "Add-ons added. Show updated total. Do not collect payment — checkout will finish the ticket."
        )
        return json.dumps(result)

    async def get_flight_booking(
        booking_id: str | None = None,
        airline_pnr: str | None = None,
        passenger_last_name: str | None = None,
    ) -> str:
        """Retrieve booking details via LiteAPI GET /flights/bookings/{id} or PNR lookup."""
        if booking_id:
            result = await service.get_booking(booking_id)
        elif airline_pnr and passenger_last_name:
            listed = await service.list_bookings(
                airline_pnr=airline_pnr,
                last_name=passenger_last_name,
            )
            matches = listed.get("bookings") or []
            if not matches:
                result = {"found": False}
            elif len(matches) == 1 and matches[0].get("booking_id"):
                result = await service.get_booking(matches[0]["booking_id"])
            else:
                listed["user_prompt"] = booking_list_user_prompt(listed)
                listed["llm_instruction"] = "Show the booking list. Ask which booking ID to open."
                return json.dumps(listed)
        else:
            bid = session.booking_id
            if not bid:
                return json.dumps(
                    {
                        "found": False,
                        "status": "need_booking_id",
                        "user_prompt": (
                            "Please share your **booking ID**, or **airline PNR + last name**, "
                            "or say **list my bookings**."
                        ),
                        "llm_instruction": "Ask for booking ID or PNR + last name.",
                    }
                )
            result = await service.get_booking(bid)

        if result.get("found") and result.get("booking_id"):
            session.booking_id = result["booking_id"]
            session.last_booking = result
        result["user_prompt"] = booking_details_user_prompt(result)
        result["llm_instruction"] = "Show booking details clearly using user_prompt."
        return json.dumps(result)

    async def list_flight_bookings() -> str:
        """List account bookings via LiteAPI GET /flights/bookings."""
        result = await service.list_bookings()
        result["user_prompt"] = booking_list_user_prompt(result)
        result["llm_instruction"] = "Show the booking list using user_prompt."
        return json.dumps(result)

    async def get_booking_status(booking_id: str | None = None) -> str:
        """Return booking status via LiteAPI."""
        bid = booking_id or session.booking_id
        if not bid:
            raise FlightAgentError("booking_id is required.")
        result = await service.get_booking_status(bid)
        result["user_prompt"] = (
            f"**Booking status**\n\n"
            f"- **ID:** `{result.get('booking_id') or bid}`\n"
            f"- **Status:** {result.get('status') or '—'}\n"
            f"- **Payment:** {result.get('payment_status') or '—'}\n"
            f"- **Airline PNR:** {result.get('airline_pnr') or '—'}"
        )
        return json.dumps(result)

    async def cancel_flight_booking(booking_id: str | None = None) -> str:
        """Cancel a booking via LiteAPI PUT /flights/bookings/{bookingId}. Ask YES first."""
        bid = booking_id or session.pending_cancel_booking_id or session.booking_id
        if not bid:
            return json.dumps(
                {
                    "cancelled": False,
                    "status": "need_booking_id",
                    "user_prompt": (
                        "Which booking should I cancel? Share the **booking ID**, "
                        "or say **list my bookings** first."
                    ),
                }
            )

        if not session.cancel_confirmed:
            session.awaiting_cancel_confirmation = True
            session.pending_cancel_booking_id = bid
            preview = session.last_booking if session.booking_id == bid else {"booking_id": bid}
            if not preview.get("airline_pnr"):
                try:
                    preview = await service.get_booking(bid)
                    if preview.get("found"):
                        session.last_booking = preview
                except Exception:
                    preview = {"booking_id": bid}
            return json.dumps(
                {
                    "cancelled": False,
                    "status": "confirmation_required",
                    "action": "ask_user",
                    "booking_id": bid,
                    "user_prompt": cancel_confirmation_prompt(preview),
                    "llm_instruction": "Ask user to reply YES to cancel or NO to keep the ticket.",
                }
            )

        try:
            result = await service.cancel_booking(bid)
        except LiteAPIError as exc:
            session.awaiting_cancel_confirmation = False
            session.cancel_confirmed = False
            return json.dumps(
                {
                    "cancelled": False,
                    "booking_id": bid,
                    "error": str(exc),
                    "user_prompt": (
                        "I couldn't cancel that booking right now. "
                        f"Please try again, or cancel with the airline using your PNR.\n\n"
                        f"Booking ID: `{bid}`"
                    ),
                }
            )

        session.awaiting_cancel_confirmation = False
        session.cancel_confirmed = False
        session.pending_cancel_booking_id = None
        if result.get("cancelled"):
            session.last_booking = {**(session.last_booking or {}), **result}
        result["user_prompt"] = cancel_result_user_prompt(result)
        result["llm_instruction"] = "Tell the user the cancel result using user_prompt."
        return json.dumps(result)

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
