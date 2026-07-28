"""
FastAPI route definitions.

All endpoints are collected in a single APIRouter that is registered
in main.py.  Every endpoint is thin: it validates input, calls the
session_manager or agent layer, and serialises the response.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException, status

from backend.agents.flight_agent import FlightAgent
from backend.agents.hotel_agent import HotelAgent
from backend.models.state import (
    AppState,
    CabinClass,
    FlightSearchParams,
    HotelSearchParams,
    RankingCriteria,
    TripRequirements,
    TripType,
    WorkflowStep,
)
from backend.agents.itinerary_agent import ItineraryAgent
from backend.workflow.session_manager import (
    create_session,
    delete_session,
    get_session,
    process_user_message,
    save_session,
)
from backend.services.itinerary_versioning import (
    save_itinerary_version,
    get_active_itinerary,
    set_active_itinerary,
    build_comparison,
)

from backend.api.schemas import (
    ChatRequest,
    ChatResponse,
    CompareVersionsRequest,
    CompareVersionsResponse,
    CreateSessionResponse,
    DraftItineraryRequest,
    DraftItineraryResponse,
    ErrorResponse,
    FinalItineraryRequest,
    FinalItineraryResponse,
    FlightPrebookRequest,
    FlightPrebookResponse,
    FlightSearchRequest,
    FlightSearchResponse,
    FlightSelectRequest,
    FlightSelectResponse,
    HotelPrebookRequest,
    HotelPrebookResponse,
    HotelSearchRequest,
    HotelSearchResponse,
    HotelSelectRequest,
    HotelSelectResponse,
    ItineraryStatusResponse,
    ItineraryVersionSummary,
    RegenerateItineraryRequest,
    RegenerateItineraryResponse,
    SetActiveVersionRequest,
    SetActiveVersionResponse,
    SubmitRequirementsRequest,
    SubmitRequirementsResponse,
    SuccessResponse,
    VersionListResponse,
)

router = APIRouter()

# Shared agent instances
_flight_agent = FlightAgent()
_hotel_agent  = HotelAgent()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_or_404(session_id: str) -> AppState:
    state = get_session(session_id)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found. Please create a new session.",
        )
    return state


def _state_to_chat_response(state: AppState) -> ChatResponse:
    """Serialise the current AppState into a ChatResponse for the frontend."""
    # Include structured payloads so the UI can render them without
    # parsing markdown.
    return ChatResponse(
        session_id        = state.session_id,
        assistant_message = state.current_assistant_message,
        workflow_step     = state.workflow_step,
        ui_action         = state.ui_action,
        flight_results    = (
            [f.model_dump() for f in state.flight_search_results]
            if state.flight_search_results and state.ui_action == "show_flights"
            else None
        ),
        hotel_results     = (
            [h.model_dump() for h in state.hotel_search_results]
            if state.hotel_search_results and state.ui_action == "show_hotels"
            else None
        ),
        draft_itinerary   = (
            state.draft_itinerary.model_dump()
            if state.draft_itinerary and state.ui_action in ("show_draft_itinerary",)
            else None
        ),
        final_itinerary   = (
            state.final_itinerary.model_dump()
            if state.final_itinerary and state.ui_action == "show_final_itinerary"
            else None
        ),
        trip_requirements = state.trip_requirements.model_dump(),
    )


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------

@router.post("/session/create", response_model=CreateSessionResponse, tags=["Session"])
def create_new_session() -> CreateSessionResponse:
    """
    Create a new planning session.

    Returns a session_id that must be included in every subsequent request.
    """
    session_id = create_session()
    state      = get_session(session_id)
    return CreateSessionResponse(
        session_id      = session_id,
        welcome_message = state.current_assistant_message,
    )


@router.delete("/session/{session_id}", response_model=SuccessResponse, tags=["Session"])
def end_session(session_id: str) -> SuccessResponse:
    """Delete a session and free its resources."""
    delete_session(session_id)
    return SuccessResponse(message=f"Session '{session_id}' ended.")


@router.get("/session/{session_id}/status", response_model=ItineraryStatusResponse, tags=["Session"])
def get_session_status(session_id: str) -> ItineraryStatusResponse:
    """Return the current workflow position and booking status."""
    state = _get_or_404(session_id)
    return ItineraryStatusResponse(
        session_id        = session_id,
        workflow_step     = state.workflow_step,
        trip_requirements = state.trip_requirements.model_dump(),
        has_flight        = state.flight_prebook is not None,
        has_draft         = state.draft_itinerary is not None,
        has_hotels        = bool(state.hotel_prebooks),
        has_final         = state.final_itinerary is not None,
    )


# ---------------------------------------------------------------------------
# Chat endpoint — main conversation driver
# ---------------------------------------------------------------------------

@router.post("/chat", response_model=ChatResponse, tags=["Chat"])
def chat(req: ChatRequest) -> ChatResponse:
    """
    Send a user message and receive the AI assistant's response.

    This is the primary endpoint.  The frontend sends every user turn here
    and the backend advances the LangGraph workflow accordingly.
    """
    _get_or_404(req.session_id)   # validate session exists

    try:
        updated_state = process_user_message(req.session_id, req.message)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return _state_to_chat_response(updated_state)


# ---------------------------------------------------------------------------
# Requirements submission endpoint (replaces chat-based collection)
# ---------------------------------------------------------------------------

@router.post("/requirements/submit", response_model=SubmitRequirementsResponse, tags=["Requirements"])
def submit_requirements(req: SubmitRequirementsRequest) -> SubmitRequirementsResponse:
    """
    Submit trip requirements via a structured form.

    This replaces the chat-based requirement collection step.
    Receives all fields, saves them to the session, and advances
    the workflow directly to flight search.
    """
    _get_or_404(req.session_id)

    # Normalise trip_type
    try:
        trip_type = TripType(req.trip_type.lower())
    except ValueError:
        trip_type = TripType.LEISURE

    # Build the TripRequirements
    trip_req = TripRequirements(
        departure_city   = req.departure_city,
        destination      = req.destination,
        departure_date   = req.departure_date,
        return_date      = req.return_date,
        num_travelers    = req.num_travelers,
        budget           = req.budget,
        trip_type        = trip_type,
        special_requests = req.special_requests or None,
    )

    # Update session state
    state = get_session(req.session_id)
    agent = ItineraryAgent()

    msg = (
        f"**Great! Here's your trip summary:**\n\n"
        f"| Field | Value |\n|-------|-------|\n"
        f"| 🛫 From | {req.departure_city} |\n"
        f"| 🛬 To | {req.destination} |\n"
        f"| 📅 Departure | {req.departure_date} |\n"
        f"| 📅 Return | {req.return_date} |\n"
        f"| 👥 Travellers | {req.num_travelers} |\n"
        f"| 💰 Budget | ₹{req.budget:,.0f} |\n"
        f"| 🎯 Trip Type | {trip_type.value.title()} |\n"
        f"| 🌙 Duration | {_calc_days(req.departure_date, req.return_date)} night(s) |\n"
        + (f"| 📝 Notes | {req.special_requests} |\n" if req.special_requests else "")
        + "\n---\nSearching for flights now… ✈️"
    )

    # Add assistant message and set workflow to flight search
    updated = state.model_copy(update={
        "trip_requirements": trip_req,
        "workflow_step":     WorkflowStep.FLIGHT_SEARCH,
        "ui_action":         "show_message",
    })
    updated = updated.add_assistant_message(msg)

    # Also save as the conversation's initial user message
    updated = updated.add_user_message(
        f"Planning a trip from {req.departure_city} to {req.destination} "
        f"from {req.departure_date} to {req.return_date} "
        f"for {req.num_travelers} traveller(s) with a budget of ₹{req.budget:,.0f}."
    )

    save_session(req.session_id, updated)

    return SubmitRequirementsResponse(
        session_id        = req.session_id,
        success           = True,
        message           = "Requirements saved successfully!",
        assistant_message = msg,
        workflow_step     = WorkflowStep.FLIGHT_SEARCH,
    )


def _calc_days(departure: str, return_date: str) -> int:
    """Calculate number of trip days."""
    from datetime import date
    try:
        d1 = date.fromisoformat(departure)
        d2 = date.fromisoformat(return_date)
        return max(1, (d2 - d1).days)
    except ValueError:
        return 1


# ---------------------------------------------------------------------------
# Flight endpoints
# ---------------------------------------------------------------------------

@router.post("/flight/search", response_model=FlightSearchResponse, tags=["Flights"])
def search_flights(req: FlightSearchRequest) -> FlightSearchResponse:
    """
    Trigger a flight search using the Flight Agent.

    The results are stored in the session and also returned directly.
    """
    state  = _get_or_404(req.session_id)

    try:
        cabin = CabinClass(req.cabin_class) if req.cabin_class else CabinClass.ECONOMY
    except ValueError:
        cabin = CabinClass.ECONOMY

    params  = FlightSearchParams(
        origin         = req.origin,
        destination    = req.destination,
        departure_date = req.departure_date,
        num_passengers = req.num_passengers,
        cabin_class    = cabin,
        max_price      = req.max_price,
        max_stops      = req.max_stops,
    )
    results = _flight_agent.search_and_rank(params, RankingCriteria.BEST_VALUE)

    # Persist to session
    updated = state.model_copy(update={
        "flight_search_results": results,
        "workflow_step":         WorkflowStep.FLIGHT_SELECTION,
        "ui_action":             "show_flights",
    })
    updated = updated.add_assistant_message(
        f"Found **{len(results)} flights** — please select the one you prefer. ✈️"
    )
    save_session(req.session_id, updated)

    return FlightSearchResponse(
        session_id = req.session_id,
        flights    = [f.model_dump() for f in results],
        count      = len(results),
    )


@router.post("/flight/select", response_model=FlightSelectResponse, tags=["Flights"])
def select_flight(req: FlightSelectRequest) -> FlightSelectResponse:
    """
    Record the user's flight selection by flight_id.
    """
    state   = _get_or_404(req.session_id)
    flights = state.flight_search_results
    match   = next((f for f in flights if f.flight_id == req.flight_id), None)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Flight '{req.flight_id}' not found in search results.",
        )

    msg = (
        f"You selected **{match.airline} {match.flight_number}** "
        f"({match.departure_airport} → {match.arrival_airport}) "
        f"at **₹{match.total_price:,.0f}**.\n\n"
        "Ready to pre-book? Click **Pre-book Flight** or say *yes*."
    )
    updated = state.model_copy(update={
        "selected_flight": match,
        "workflow_step":   WorkflowStep.FLIGHT_PREBOOK,
        "ui_action":       "show_flight_confirmation",
    })
    updated = updated.add_assistant_message(msg)
    save_session(req.session_id, updated)

    return FlightSelectResponse(
        session_id       = req.session_id,
        selected_flight  = match.model_dump(),
        assistant_message= msg,
    )


@router.post("/flight/prebook", response_model=FlightPrebookResponse, tags=["Flights"])
def prebook_flight(req: FlightPrebookRequest) -> FlightPrebookResponse:
    """
    Pre-book the selected flight and advance the workflow to Draft Itinerary.
    """
    state = _get_or_404(req.session_id)

    # Allow overriding flight_id (re-select) or use the one already stored
    flight = state.selected_flight
    if req.flight_id and (flight is None or flight.flight_id != req.flight_id):
        flights = state.flight_search_results
        flight  = next((f for f in flights if f.flight_id == req.flight_id), None)
    if flight is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No flight selected. Please select a flight first.",
        )

    prebook = _flight_agent.prebook_flight(
        flight         = flight,
        num_passengers = req.num_passengers or state.trip_requirements.num_travelers or 1,
    )

    msg = (
        f"✅ **Flight Pre-booked!**\n\n"
        f"Booking ID: `{prebook.prebook_id}`\n"
        f"Flight: {flight.airline} {flight.flight_number}\n"
        f"Route: {flight.departure_airport} → {flight.arrival_airport}\n"
        f"Total Charged: **₹{prebook.total_charged:,.0f}**\n\n"
        "Generating your **Draft Itinerary** now… 📋"
    )

    updated = state.model_copy(update={
        "selected_flight": flight,
        "flight_prebook":  prebook,
        "workflow_step":   WorkflowStep.DRAFT_ITINERARY,
        "ui_action":       "show_message",
    })
    updated = updated.add_assistant_message(msg)
    save_session(req.session_id, updated)

    return FlightPrebookResponse(
        session_id        = req.session_id,
        prebook_id        = prebook.prebook_id,
        flight            = flight.model_dump(),
        total_charged     = prebook.total_charged,
        status            = prebook.status,
        assistant_message = msg,
    )


# ---------------------------------------------------------------------------
# Hotel endpoints
# ---------------------------------------------------------------------------

@router.post("/hotel/search", response_model=HotelSearchResponse, tags=["Hotels"])
def search_hotels(req: HotelSearchRequest) -> HotelSearchResponse:
    """
    Trigger a hotel search using the Hotel Agent.
    """
    state = _get_or_404(req.session_id)

    params  = HotelSearchParams(
        destination         = req.destination,
        check_in            = req.check_in,
        check_out           = req.check_out,
        num_guests          = req.num_guests,
        max_price_per_night = req.max_price_per_night,
        min_rating          = req.min_rating,
    )
    results = _hotel_agent.search_and_rank(params, RankingCriteria.BEST_VALUE)

    days = state.num_trip_days()
    updated = state.model_copy(update={
        "hotel_search_results": results,
        "workflow_step":        WorkflowStep.HOTEL_SELECTION,
        "ui_action":            "show_hotels",
    })
    updated = updated.add_assistant_message(
        f"Found **{len(results)} hotels** in {req.destination}! 🏨\n"
        f"Your trip is **{days} night(s)** — please select a hotel for each day."
    )
    save_session(req.session_id, updated)

    return HotelSearchResponse(
        session_id = req.session_id,
        hotels     = [h.model_dump() for h in results],
        count      = len(results),
    )


@router.post("/hotel/select", response_model=HotelSelectResponse, tags=["Hotels"])
def select_hotel(req: HotelSelectRequest) -> HotelSelectResponse:
    """
    Record a hotel selection for a specific trip day.

    Call this once per day (day_number 1, 2, 3 …).
    """
    state   = _get_or_404(req.session_id)
    hotels  = state.hotel_search_results
    match   = next((h for h in hotels if h.hotel_id == req.hotel_id), None)

    if match is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hotel '{req.hotel_id}' not found in search results.",
        )

    new_selected = {**state.selected_hotels, str(req.day_number): match}
    days         = state.num_trip_days()
    all_selected = len(new_selected) >= days

    msg = (
        f"✅ Night {req.day_number}: **{match.name}** selected "
        f"(⭐ {match.rating} | ₹{match.price_per_night:.0f}/night).\n"
        + (
            f"\n{days - len(new_selected)} more night(s) to select."
            if not all_selected
            else "\nAll nights selected! Ready to pre-book."
        )
    )

    next_step = WorkflowStep.HOTEL_PREBOOK if all_selected else WorkflowStep.HOTEL_SELECTION
    ui_action = "show_hotel_confirmation" if all_selected else "show_hotels"

    updated = state.model_copy(update={
        "selected_hotels": new_selected,
        "workflow_step":   next_step,
        "ui_action":       ui_action,
    })
    updated = updated.add_assistant_message(msg)
    save_session(req.session_id, updated)

    return HotelSelectResponse(
        session_id        = req.session_id,
        day_number        = req.day_number,
        selected_hotel    = match.model_dump(),
        all_days_selected = all_selected,
        assistant_message = msg,
    )


@router.post("/hotel/prebook", response_model=HotelPrebookResponse, tags=["Hotels"])
def prebook_hotels(req: HotelPrebookRequest) -> HotelPrebookResponse:
    """
    Bulk pre-book hotels for all selected days.

    The frontend passes a list of {hotel_id, day_number} items.
    """
    state  = _get_or_404(req.session_id)
    req_   = state.trip_requirements

    prebooks       = []
    total_charged  = 0.0
    confirmation_lines = []
    hotel_prebooks_map = {}

    for sel in req.selections:
        hotel_id   = sel.get("hotel_id")
        day_number = int(sel.get("day_number", 1))

        hotel = next(
            (h for h in state.hotel_search_results if h.hotel_id == hotel_id),
            None,
        )
        # Also check already-selected map
        if hotel is None:
            hotel = state.selected_hotels.get(str(day_number))
        if hotel is None:
            continue

        pb = _hotel_agent.prebook_hotel(
            hotel      = hotel,
            check_in   = req_.departure_date or hotel.check_in,
            check_out  = req_.return_date    or hotel.check_out,
            num_guests = req_.num_travelers  or 1,
            day_number = day_number,
        )
        prebooks.append(pb.model_dump())
        total_charged += pb.total_charged
        hotel_prebooks_map[str(day_number)] = pb
        confirmation_lines.append(
            f"- Night {day_number}: {hotel.name} | ID: `{pb.prebook_id}` | ₹{pb.total_charged:,.0f}"
        )

    confirmation_text = "\n".join(confirmation_lines)
    msg = (
        f"✅ **All Hotels Pre-booked!**\n\n{confirmation_text}\n\n"
        f"**Total Hotel Cost:** ₹{total_charged:,.0f}\n\n"
        "Generating your **Final Itinerary** now… 🎉"
    )

    updated = state.model_copy(update={
        "hotel_prebooks":  hotel_prebooks_map,
        "workflow_step":   WorkflowStep.FINAL_ITINERARY,
        "ui_action":       "show_message",
    })
    updated = updated.add_assistant_message(msg)
    save_session(req.session_id, updated)

    return HotelPrebookResponse(
        session_id        = req.session_id,
        prebooks          = {day: pb.model_dump() for day, pb in hotel_prebooks_map.items()},
        total_charged     = round(total_charged, 2),
        assistant_message = msg,
    )


# ---------------------------------------------------------------------------
# Itinerary endpoints
# ---------------------------------------------------------------------------

@router.post("/itinerary/draft", response_model=DraftItineraryResponse, tags=["Itinerary"])
def get_draft_itinerary(req: DraftItineraryRequest) -> DraftItineraryResponse:
    """
    Generate (or retrieve cached) draft itinerary.

    On first call: generates the itinerary, saves it as Version 1, and sets
    active_itinerary_version = 1.
    On subsequent calls: returns the cached draft (active version).

    Requires a flight pre-booking to exist in the session.
    """
    from backend.agents.itinerary_agent import ItineraryAgent

    state = _get_or_404(req.session_id)

    if state.flight_prebook is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A flight must be pre-booked before generating the draft itinerary.",
        )

    # Return active/cached version if already generated
    if state.draft_itinerary and state.itinerary_versions:
        draft = get_active_itinerary(state) or state.draft_itinerary
    else:
        # Generate fresh itinerary
        agent = ItineraryAgent()
        draft = agent.generate_draft_itinerary(state)

        # Save as Version 1 (immutable snapshot)
        state = save_itinerary_version(state, draft, label="Original")
        state = set_active_itinerary(state, 1)
        state = state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
            "ui_action":     "show_draft_itinerary",
        })
        state = state.add_assistant_message(
            "📋 **Draft Itinerary ready!** Would you like to search for hotels? *(yes / no)*"
        )
        save_session(req.session_id, state)

    return DraftItineraryResponse(
        session_id = req.session_id,
        draft      = draft.model_dump(),
        markdown   = draft.markdown,
    )


@router.post("/itinerary/final", response_model=FinalItineraryResponse, tags=["Itinerary"])
def get_final_itinerary(req: FinalItineraryRequest) -> FinalItineraryResponse:
    """
    Generate (or retrieve cached) final itinerary.

    Requires a flight pre-booking; hotel bookings are included if present.
    """
    from backend.agents.itinerary_agent import ItineraryAgent

    state = _get_or_404(req.session_id)

    if state.flight_prebook is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A flight must be pre-booked before generating the final itinerary.",
        )

    # Use cached final if available
    if state.final_itinerary:
        final = state.final_itinerary
    else:
        agent = ItineraryAgent()
        final = agent.generate_final_itinerary(state)
        updated = state.model_copy(update={
            "final_itinerary": final,
            "workflow_step":   WorkflowStep.COMPLETED,
            "ui_action":       "show_final_itinerary",
        })
        updated = updated.add_assistant_message(
            "🎉 **Your Final Itinerary is ready!** Have an amazing trip! ✈️"
        )
        save_session(req.session_id, updated)

    return FinalItineraryResponse(
        session_id = req.session_id,
        final      = final.model_dump(),
        markdown   = final.markdown,
    )


@router.get("/itinerary/{session_id}/status", response_model=ItineraryStatusResponse, tags=["Itinerary"])
def itinerary_status(session_id: str) -> ItineraryStatusResponse:
    """Return a quick status summary for the planning session."""
    return get_session_status(session_id)


def get_session_status(session_id: str) -> ItineraryStatusResponse:
    state = _get_or_404(session_id)
    return ItineraryStatusResponse(
        session_id        = session_id,
        workflow_step     = state.workflow_step,
        trip_requirements = state.trip_requirements.model_dump(),
        has_flight        = state.flight_prebook is not None,
        has_draft         = state.draft_itinerary is not None,
        has_hotels        = bool(state.hotel_prebooks),
        has_final         = state.final_itinerary is not None,
    )


# ---------------------------------------------------------------------------
# Itinerary versioning endpoints
# ---------------------------------------------------------------------------

@router.get("/itinerary/{session_id}/versions", response_model=VersionListResponse, tags=["Itinerary"])
def list_versions(session_id: str) -> VersionListResponse:
    """
    Return all saved itinerary versions for a session (metadata only — no full body).
    """
    state = _get_or_404(session_id)
    summaries = [
        ItineraryVersionSummary(
            version_number    = v.version_number,
            label             = v.label,
            created_at        = v.created_at,
            is_active         = (v.version_number == state.active_itinerary_version),
            trip_requirements = v.trip_requirements,
        )
        for v in state.itinerary_versions
    ]
    return VersionListResponse(
        session_id     = session_id,
        versions       = summaries,
        active_version = state.active_itinerary_version,
        total_versions = len(summaries),
    )


@router.post("/itinerary/regenerate", response_model=RegenerateItineraryResponse, tags=["Itinerary"])
def regenerate_itinerary(req: RegenerateItineraryRequest) -> RegenerateItineraryResponse:
    """
    Generate a new itinerary version from (optionally updated) trip requirements.

    - Merges any overrides into the current trip_requirements.
    - Calls ItineraryAgent.generate_draft_itinerary() with the updated state.
    - Saves the new itinerary as the next version (never overwrites previous versions).
    - Does NOT set it as active — caller must call /itinerary/set-active after comparison.

    Returns the new version's draft itinerary.
    """
    from backend.agents.itinerary_agent import ItineraryAgent

    state = _get_or_404(req.session_id)

    if state.flight_prebook is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A flight must be pre-booked before regenerating the itinerary.",
        )

    # Merge user-supplied overrides into current requirements
    current_req = state.trip_requirements.model_dump()
    overrides = {
        k: v for k, v in {
            "budget":           req.budget,
            "destination":      req.destination,
            "departure_date":   req.departure_date,
            "return_date":      req.return_date,
            "num_travelers":    req.num_travelers,
            "trip_type":        req.trip_type,
            "special_requests": req.special_requests,
        }.items() if v is not None
    }

    if overrides:
        current_req.update(overrides)
        # Normalise trip_type enum
        if "trip_type" in overrides:
            try:
                current_req["trip_type"] = TripType(overrides["trip_type"].lower())
            except ValueError:
                pass

    updated_req = TripRequirements(**current_req)
    # Build a temporary state with updated requirements for generation
    generation_state = state.model_copy(update={"trip_requirements": updated_req})

    # Generate the new itinerary
    agent = ItineraryAgent()
    new_draft = agent.generate_draft_itinerary(generation_state)

    # Determine version label
    next_version = len(state.itinerary_versions) + 1
    auto_label   = req.version_label or _build_version_label(overrides, next_version)

    # Save the new version (immutable append) — do NOT set active yet
    updated_state = save_itinerary_version(
        generation_state.model_copy(update={"trip_requirements": updated_req}),
        new_draft,
        label=auto_label,
    )
    # Preserve all other session data (flights, hotels, etc.) from original state
    updated_state = updated_state.model_copy(update={
        "selected_flight":   state.selected_flight,
        "flight_prebook":    state.flight_prebook,
        "flight_search_results": state.flight_search_results,
        "hotel_search_results":  state.hotel_search_results,
        "selected_hotels":       state.selected_hotels,
        "hotel_prebooks":        state.hotel_prebooks,
        "conversation_history":  state.conversation_history,
        "workflow_step":         WorkflowStep.HOTEL_SEARCH,
        "ui_action":             "show_comparison",
    })

    save_session(req.session_id, updated_state)

    msg = (
        f"✨ **Version {next_version} Generated!** — *{auto_label}*\n\n"
        "Compare it with the previous version and choose which one to keep."
    )

    return RegenerateItineraryResponse(
        session_id      = req.session_id,
        version_number  = next_version,
        label           = auto_label,
        draft           = new_draft.model_dump(),
        markdown        = new_draft.markdown,
        assistant_message = msg,
    )


@router.post("/itinerary/compare", response_model=CompareVersionsResponse, tags=["Itinerary"])
def compare_versions(req: CompareVersionsRequest) -> CompareVersionsResponse:
    """
    Build a rich structured comparison between two itinerary versions.

    Returns diff data including budget delta, activity changes, restaurant
    changes, transport changes, and per-field change indicators for the UI.
    """
    state = _get_or_404(req.session_id)

    if not state.itinerary_versions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No itinerary versions found for this session.",
        )

    try:
        comparison = build_comparison(state, req.v1, req.v2)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    diff = comparison["diff"]
    changes = comparison["changes_count"]
    msg = (
        f"📊 Comparing **Version {req.v1}** vs **Version {req.v2}** — "
        f"**{changes} field(s) changed**. Select which version to keep."
    )

    return CompareVersionsResponse(
        session_id        = req.session_id,
        comparison        = comparison,
        assistant_message = msg,
    )


@router.post("/itinerary/set-active", response_model=SetActiveVersionResponse, tags=["Itinerary"])
def set_active_version(req: SetActiveVersionRequest) -> SetActiveVersionResponse:
    """
    Set a version as the active itinerary (used after comparison / selection).

    - Updates state.active_itinerary_version.
    - Updates state.draft_itinerary to the selected version's itinerary.
    - The selected itinerary will be used by the Hotel Agent.
    """
    state = _get_or_404(req.session_id)

    try:
        updated_state = set_active_itinerary(state, req.version_number)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    # Find the version for metadata
    selected_version = next(
        (v for v in updated_state.itinerary_versions if v.version_number == req.version_number),
        None,
    )

    updated_state = updated_state.model_copy(update={
        "workflow_step": WorkflowStep.HOTEL_SEARCH,
        "ui_action":     "show_draft_itinerary",
    })

    msg = (
        f"✅ **Version {req.version_number}** ({selected_version.label if selected_version else ''}) "
        "selected as your active itinerary.\n\n"
        "Ready to search for hotels! 🏨"
    )
    updated_state = updated_state.add_assistant_message(msg)
    save_session(req.session_id, updated_state)

    draft = updated_state.draft_itinerary

    return SetActiveVersionResponse(
        session_id        = req.session_id,
        version_number    = req.version_number,
        label             = selected_version.label if selected_version else f"Version {req.version_number}",
        draft             = draft.model_dump() if draft else {},
        assistant_message = msg,
    )


# ---------------------------------------------------------------------------
# Private helpers for routes
# ---------------------------------------------------------------------------

def _build_version_label(overrides: dict, version_number: int) -> str:
    """Auto-generate a descriptive version label from the changed fields."""
    if not overrides:
        return f"Edit #{version_number - 1}"

    field_labels = {
        "budget":           "Budget Update",
        "destination":      "Destination Change",
        "departure_date":   "Date Change",
        "return_date":      "Date Change",
        "num_travelers":    "Traveller Change",
        "trip_type":        "Trip Type Change",
        "special_requests": "Custom Request",
    }

    changed = [field_labels[k] for k in overrides if k in field_labels]
    # Deduplicate (departure + return both map to "Date Change")
    seen = set()
    unique_changed = [x for x in changed if not (x in seen or seen.add(x))]

    if not unique_changed:
        return f"Edit #{version_number - 1}"
    if len(unique_changed) == 1:
        return unique_changed[0]
    if len(unique_changed) == 2:
        return " & ".join(unique_changed)
    return f"{unique_changed[0]} + {len(unique_changed) - 1} more changes"
