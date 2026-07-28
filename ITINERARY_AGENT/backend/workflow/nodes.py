"""
LangGraph node functions.

Each function receives an AppState dict (LangGraph passes state as a dict)
and returns a dict of fields to update.  We convert to/from our AppState
Pydantic model at the boundary so the rest of the code stays type-safe.

Node catalogue:
  node_collect_requirements
  node_check_missing_info
  node_ask_missing_questions
  node_user_confirmation
  node_flight_search
  node_flight_ranking
  node_flight_selection
  node_flight_prebook
  node_draft_itinerary
  node_hotel_search
  node_hotel_ranking
  node_hotel_selection
  node_hotel_prebook
  node_final_itinerary

Provider wiring:
  Flight and hotel operations delegate to the provider interfaces defined
  in backend.services.providers.  Swap get_flight_provider() /
  get_hotel_provider() in that module to go live — nothing here changes.
"""

from __future__ import annotations

from typing import Any, Dict

from backend.agents.itinerary_agent import ItineraryAgent
from backend.models.state import (
    AppState,
    FlightSearchParams,
    HotelSearchParams,
    RankingCriteria,
    WorkflowStep,
)
from backend.services.providers import (
    get_flight_provider,
    get_hotel_provider,
)

# ---------------------------------------------------------------------------
# Shared agent / provider instances  (stateless — safe to reuse)
# ---------------------------------------------------------------------------

_itinerary_agent  = ItineraryAgent()
_flight_provider  = get_flight_provider()
_hotel_provider   = get_hotel_provider()


# ---------------------------------------------------------------------------
# Helper: deserialise / serialise AppState
# ---------------------------------------------------------------------------

def _load(state_dict: Dict[str, Any]) -> AppState:
    return AppState(**state_dict)


def _dump(state: AppState) -> Dict[str, Any]:
    return state.model_dump()


# ---------------------------------------------------------------------------
# Node 1 — Collect Requirements
# ---------------------------------------------------------------------------

def node_collect_requirements(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract trip requirements from the latest user message and merge them
    into the existing TripRequirements object.
    """
    state = _load(state_dict)

    updated_req = _itinerary_agent.extract_requirements(
        user_message         = state.current_user_message,
        existing             = state.trip_requirements,
        conversation_history = [m.model_dump() for m in state.conversation_history],
    )

    state = state.model_copy(update={
        "trip_requirements": updated_req,
        "workflow_step":     WorkflowStep.CHECK_MISSING_INFO,
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 2 — Check Missing Info
# ---------------------------------------------------------------------------

def node_check_missing_info(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Inspect TripRequirements and populate missing_fields.
    The router branches to ask-questions or confirmation based on this.
    """
    state   = _load(state_dict)
    missing = state.trip_requirements.missing_fields()

    next_step = (
        WorkflowStep.ASK_MISSING_QUESTIONS
        if missing
        else WorkflowStep.USER_CONFIRMATION
    )

    state = state.model_copy(update={
        "missing_fields": missing,
        "workflow_step":  next_step,
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 3 — Ask Missing Questions
# ---------------------------------------------------------------------------

def node_ask_missing_questions(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate and emit a question for every missing field.
    Sets awaiting_user_input=True so the graph halts until the user replies.
    """
    state    = _load(state_dict)
    question = _itinerary_agent.generate_missing_fields_question(state.missing_fields)

    state = state.add_assistant_message(question)
    state = state.model_copy(update={
        "awaiting_user_input": True,
        "workflow_step":       WorkflowStep.COLLECT_REQUIREMENTS,
        "ui_action":           "show_message",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 4 — User Confirmation (search flights?)
# ---------------------------------------------------------------------------

def node_user_confirmation(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Show a trip summary and ask the user if they want to search flights.
    Also handles the incoming yes / no answer on the second pass.
    """
    state = _load(state_dict)
    msg   = state.current_user_message.lower().strip()

    # Second pass: user has answered yes
    if msg in ("yes", "y", "sure", "ok", "okay", "proceed", "go ahead", "search"):
        state = state.model_copy(update={
            "user_confirmed": True,
            "workflow_step":  WorkflowStep.FLIGHT_SEARCH,
            "ui_action":      "show_message",
        })
        state = state.add_assistant_message("Great! Searching for flights now… ✈️")
        return _dump(state)

    # Second pass: user said no
    if msg in ("no", "n", "cancel", "stop"):
        state = state.add_assistant_message(
            "No problem! Let me know whenever you'd like to search for flights."
        )
        state = state.model_copy(update={
            "user_confirmed":      False,
            "awaiting_user_input": True,
            "ui_action":           "show_message",
        })
        return _dump(state)

    # First pass: show summary and ask
    prompt = _itinerary_agent.generate_confirmation_prompt(state)
    state  = state.add_assistant_message(prompt)
    state  = state.model_copy(update={
        "awaiting_user_input": True,
        "workflow_step":       WorkflowStep.USER_CONFIRMATION,
        "ui_action":           "show_confirmation",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 5 — Flight Search
# ---------------------------------------------------------------------------

def node_flight_search(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Search for available flights via the flight provider interface."""
    state = _load(state_dict)
    req   = state.trip_requirements

    params = FlightSearchParams(
        origin         = req.departure_city or "",
        destination    = req.destination    or "",
        departure_date = req.departure_date or "",
        num_passengers = req.num_travelers  or 1,
        max_price      = req.budget,
    )

    results = _flight_provider.search(params)

    state = state.model_copy(update={
        "flight_search_results": results,
        "workflow_step":         WorkflowStep.FLIGHT_RANKING,
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 6 — Flight Ranking
# ---------------------------------------------------------------------------

def node_flight_ranking(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Rank flights by best_value and present them to the user."""
    from backend.agents.flight_agent import FlightAgent
    _fa     = FlightAgent()
    state   = _load(state_dict)
    ranked  = _fa.rank_flights(state.flight_search_results, RankingCriteria.BEST_VALUE)

    state = state.add_assistant_message(
        f"I found **{len(ranked)} flights** for your trip! "
        "Please review the options below and select the one you prefer. ✈️"
    )
    state = state.model_copy(update={
        "flight_search_results": ranked,
        "workflow_step":         WorkflowStep.FLIGHT_SELECTION,
        "awaiting_user_input":   True,
        "ui_action":             "show_flights",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 7 — Flight Selection
# ---------------------------------------------------------------------------

def node_flight_selection(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Record the user-selected flight (set by the API layer via state.selected_flight)
    and ask for pre-book confirmation.
    """
    state    = _load(state_dict)
    selected = state.selected_flight

    if not selected:
        state = state.add_assistant_message(
            "Please select a flight from the options shown above."
        )
        state = state.model_copy(update={
            "awaiting_user_input": True,
            "ui_action":           "show_flights",
        })
        return _dump(state)

    state = state.add_assistant_message(
        f"You selected **{selected.airline} {selected.flight_number}** "
        f"({selected.departure_airport} → {selected.arrival_airport}) "
        f"at **₹{selected.total_price:,.0f}**.\n\n"
        "Would you like to **pre-book** this flight? *(yes / no)*"
    )
    state = state.model_copy(update={
        "awaiting_user_input": True,
        "workflow_step":       WorkflowStep.FLIGHT_PREBOOK,
        "ui_action":           "show_flight_confirmation",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 8 — Flight Pre-book
# ---------------------------------------------------------------------------

def node_flight_prebook(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Pre-book the selected flight via the flight provider interface."""
    state = _load(state_dict)
    msg   = state.current_user_message.lower().strip()

    if msg in ("no", "n", "cancel"):
        state = state.add_assistant_message(
            "Okay, flight not booked. Would you like to choose a different flight?"
        )
        state = state.model_copy(update={
            "workflow_step":       WorkflowStep.FLIGHT_SELECTION,
            "awaiting_user_input": True,
            "ui_action":           "show_flights",
        })
        return _dump(state)

    prebook = _flight_provider.prebook(
        flight         = state.selected_flight,
        num_passengers = state.trip_requirements.num_travelers or 1,
    )

    state = state.add_assistant_message(
        f"✅ **Flight Pre-booked!**\n\n"
        f"Booking ID: `{prebook.prebook_id}`\n"
        f"Flight: {prebook.flight.airline} {prebook.flight.flight_number}\n"
        f"Total Charged: **₹{prebook.total_charged:,.0f}**\n\n"
        "Now generating your **Draft Itinerary**… 📋"
    )
    state = state.model_copy(update={
        "flight_prebook": prebook,
        "workflow_step":  WorkflowStep.DRAFT_ITINERARY,
        "ui_action":      "show_message",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 9 — Draft Itinerary
# ---------------------------------------------------------------------------

def node_draft_itinerary(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Generate and display the draft itinerary, then ask about hotel search."""
    state = _load(state_dict)
    draft = _itinerary_agent.generate_draft_itinerary(state)

    # Save as Version 1 (immutable snapshot) via the versioning service
    from backend.services.itinerary_versioning import save_itinerary_version, set_active_itinerary
    state = save_itinerary_version(state, draft, label="Original")
    state = set_active_itinerary(state, 1)

    state = state.add_assistant_message(
        "📋 **Your Draft Itinerary is ready!**\n\n"
        + draft.markdown
        + "\n\n---\nWould you like to **search for hotels** to complete your booking? *(yes / no)*"
    )
    state = state.model_copy(update={
        "workflow_step":       WorkflowStep.HOTEL_SEARCH,
        "awaiting_user_input": True,
        "ui_action":           "show_draft_itinerary",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 10 — Hotel Search
# ---------------------------------------------------------------------------

def node_hotel_search(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle yes / no from the user, then search for hotels via the provider.
    """
    state = _load(state_dict)
    msg   = state.current_user_message.lower().strip()

    if msg in ("no", "n", "cancel", "skip"):
        state = state.add_assistant_message(
            "Okay! Generating your **Final Itinerary** without hotel bookings. 📄"
        )
        state = state.model_copy(update={
            "workflow_step":       WorkflowStep.FINAL_ITINERARY,
            "awaiting_user_input": False,
            "ui_action":           "show_message",
        })
        return _dump(state)

    req  = state.trip_requirements
    days = state.num_trip_days()

    params = HotelSearchParams(
        destination         = req.destination   or "",
        check_in            = req.departure_date or "",
        check_out           = req.return_date    or "",
        num_guests          = req.num_travelers  or 1,
        max_price_per_night = (req.budget / max(days, 1) * 0.40) if req.budget else None,
    )
    results = _hotel_provider.search(params)

    state = state.model_copy(update={
        "hotel_search_results": results,
        "workflow_step":        WorkflowStep.HOTEL_RANKING,
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 11 — Hotel Ranking
# ---------------------------------------------------------------------------

def node_hotel_ranking(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Rank hotels by best_value and present them to the user."""
    from backend.agents.hotel_agent import HotelAgent
    _ha    = HotelAgent()
    state  = _load(state_dict)
    ranked = _ha.rank_hotels(state.hotel_search_results, RankingCriteria.BEST_VALUE)
    days   = state.num_trip_days()

    state = state.add_assistant_message(
        f"I found **{len(ranked)} hotels** in {state.trip_requirements.destination}! 🏨\n\n"
        f"Your trip is **{days} night(s)**. Please select a hotel for **each day**.\n"
        "You can choose the same hotel for all nights, or mix and match."
    )
    state = state.model_copy(update={
        "hotel_search_results": ranked,
        "workflow_step":        WorkflowStep.HOTEL_SELECTION,
        "awaiting_user_input":  True,
        "ui_action":            "show_hotels",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 12 — Hotel Selection
# ---------------------------------------------------------------------------

def node_hotel_selection(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Record day-by-day hotel selections (populated by the API layer in
    state.selected_hotels) and ask for bulk pre-book confirmation.
    """
    state    = _load(state_dict)
    selected = state.selected_hotels
    days     = state.num_trip_days()

    if len(selected) < days:
        remaining = days - len(selected)
        state = state.add_assistant_message(
            f"Please select hotels for the remaining **{remaining} night(s)**."
        )
        state = state.model_copy(update={
            "awaiting_user_input": True,
            "ui_action":           "show_hotels",
        })
        return _dump(state)

    hotel_lines = "\n".join(
        f"- Night {d}: **{h.name}** @ ₹{h.price_per_night:,.0f}/night"
        for d, h in sorted(selected.items(), key=lambda x: int(x[0]))
    )
    state = state.add_assistant_message(
        f"You've selected the following hotels:\n\n{hotel_lines}\n\n"
        "Shall I **pre-book all hotels**? *(yes / no)*"
    )
    state = state.model_copy(update={
        "workflow_step":       WorkflowStep.HOTEL_PREBOOK,
        "awaiting_user_input": True,
        "ui_action":           "show_hotel_confirmation",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 13 — Hotel Pre-book
# ---------------------------------------------------------------------------

def node_hotel_prebook(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Pre-book all selected hotels via the hotel provider interface."""
    state = _load(state_dict)
    msg   = state.current_user_message.lower().strip()

    if msg in ("no", "n", "cancel"):
        state = state.add_assistant_message(
            "Hotel booking cancelled. Would you like to choose different hotels?"
        )
        state = state.model_copy(update={
            "workflow_step":       WorkflowStep.HOTEL_SELECTION,
            "awaiting_user_input": True,
            "ui_action":           "show_hotels",
        })
        return _dump(state)

    req      = state.trip_requirements
    prebooks = {}
    conf_lines: list = []

    for day_str, hotel in sorted(state.selected_hotels.items(), key=lambda x: int(x[0])):
        day_num = int(day_str)
        pb = _hotel_provider.prebook(
            hotel      = hotel,
            check_in   = req.departure_date or "",
            check_out  = req.return_date    or "",
            num_guests = req.num_travelers  or 1,
            day_number = day_num,
        )
        prebooks[day_str] = pb
        conf_lines.append(
            f"- Night {day_num}: **{hotel.name}** | "
            f"ID: `{pb.prebook_id}` | ₹{pb.total_charged:,.0f}"
        )

    state = state.model_copy(update={"hotel_prebooks": prebooks})
    state = state.add_assistant_message(
        "✅ **All Hotels Pre-booked!**\n\n"
        + "\n".join(conf_lines)
        + "\n\nGenerating your **Final Itinerary** now… 🎉"
    )
    state = state.model_copy(update={
        "workflow_step":       WorkflowStep.FINAL_ITINERARY,
        "awaiting_user_input": False,
        "ui_action":           "show_message",
    })
    return _dump(state)


# ---------------------------------------------------------------------------
# Node 14 — Final Itinerary
# ---------------------------------------------------------------------------

def node_final_itinerary(state_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Generate and display the complete final itinerary."""
    state = _load(state_dict)
    final = _itinerary_agent.generate_final_itinerary(state)

    state = state.model_copy(update={"final_itinerary": final})
    state = state.add_assistant_message(
        "🎉 **Your Complete Travel Itinerary is Ready!**\n\n"
        + final.markdown
        + "\n\n---\n"
        "Have a fantastic trip! ✈️🌍 "
        "To plan a new trip, just say **'new trip'**."
    )
    state = state.model_copy(update={
        "workflow_step":       WorkflowStep.COMPLETED,
        "awaiting_user_input": False,
        "ui_action":           "show_final_itinerary",
    })
    return _dump(state)
