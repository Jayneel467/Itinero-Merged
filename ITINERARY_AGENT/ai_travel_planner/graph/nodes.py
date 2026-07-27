"""
LangGraph Nodes
================
Each function here is a self-contained LangGraph node.
Nodes receive the full AppState dict, call the appropriate agent method,
mutate state, and return the updated state dict.

Node naming follows the workflow stages:
  node_greeting
  node_collect_requirements
  node_flight_search_confirmation
  node_flight_search
  node_flight_selection
  node_flight_prebook_confirmation
  node_flight_prebook
  node_draft_itinerary
  node_draft_itinerary_review
  node_hotel_search
  node_hotel_selection
  node_hotel_prebook_confirmation
  node_hotel_prebook
  node_final_itinerary
  node_error

All nodes are pure functions: (dict) -> dict.
They instantiate agents lazily so the graph can be imported without hitting
the OpenAI API at import time.
"""
from __future__ import annotations

from typing import Any

from ai_travel_planner.agents.flight_agent import FlightAgent
from ai_travel_planner.agents.hotel_agent import HotelAgent
from ai_travel_planner.agents.itinerary_agent import ItineraryAgent
from ai_travel_planner.state.models import (
    AgentResponseStatus,
    AppState,
    PendingAction,
    WorkflowStage,
)
from ai_travel_planner.utils.logger import get_logger

logger = get_logger("graph.nodes")

# ── Lazy agent singletons ────────────────────────────────────────────────────
# Agents are expensive to construct (they hold an LLM client).
# We create them once and reuse across node invocations.
_itinerary_agent: ItineraryAgent | None = None
_flight_agent: FlightAgent | None = None
_hotel_agent: HotelAgent | None = None


def _get_itinerary_agent() -> ItineraryAgent:
    global _itinerary_agent
    if _itinerary_agent is None:
        _itinerary_agent = ItineraryAgent()
    return _itinerary_agent


def _get_flight_agent() -> FlightAgent:
    global _flight_agent
    if _flight_agent is None:
        _flight_agent = FlightAgent()
    return _flight_agent


def _get_hotel_agent() -> HotelAgent:
    global _hotel_agent
    if _hotel_agent is None:
        _hotel_agent = HotelAgent()
    return _hotel_agent


def _load(state_dict: dict[str, Any]) -> AppState:
    """Deserialise the LangGraph state dict into an AppState model."""
    return AppState.model_validate(state_dict)


def _dump(state: AppState) -> dict[str, Any]:
    """Serialise AppState back to a plain dict for LangGraph."""
    return state.model_dump(mode="json")


# ─────────────────────────────────────────────────────────────────────────────
# Node: Greeting
# ─────────────────────────────────────────────────────────────────────────────

def node_greeting(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Entry point. Send a single rich opening question designed to capture
    as much info as possible in the user's first reply.
    Only fires once at the start of the session.
    """
    logger.info("NODE: greeting")
    state = _load(state_dict)

    greeting = (
        "Hey — I'm **Vero**. Happy to plan this trip with you.\n\n"
        "Tell me the basics in one go if you like — for example:\n"
        "  \"Delhi to Goa, 15th to 20th August, 2 adults\"\n\n"
        "Budget, vibe (beach, food, history), or hotel preferences help too — "
        "I'll pick them up as we go.\n\n"
        "Where are you headed, and roughly when?"
    )

    state.add_assistant_message(greeting)
    state.set_stage(WorkflowStage.REQUIREMENT_COLLECTION)
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Requirement Collection
# ─────────────────────────────────────────────────────────────────────────────

def node_collect_requirements(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Conversationally collect trip details.
    Loops until the ItineraryAgent signals [READY_TO_SEARCH].
    """
    logger.info("NODE: collect_requirements")
    state = _load(state_dict)
    agent = _get_itinerary_agent()
    state = agent.collect_requirements(state)
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Flight Search Confirmation Gate
# ─────────────────────────────────────────────────────────────────────────────

def node_flight_search_confirmation(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Interpret the user's yes/no response to the flight search prompt.
    Routes to flight search (yes) or back to requirement collection (no/modify).
    """
    logger.info("NODE: flight_search_confirmation")
    state = _load(state_dict)
    agent = _get_itinerary_agent()

    intent = agent.interpret_user_intent(state.last_user_input)
    logger.debug("Intent: %s", intent)

    if intent["intent"] == "yes":
        state.confirm_pending_action()
        state.set_stage(WorkflowStage.FLIGHT_SEARCH)
        state.add_assistant_message(
            "Perfect! Searching for the best available flights now... ✈️\n"
            "(This may take a moment.)"
        )
    elif intent["intent"] in ("no", "cancel"):
        state.clear_pending_action()
        state.set_stage(WorkflowStage.REQUIREMENT_COLLECTION)
        state.add_assistant_message(
            "No problem! Let's adjust the details. What would you like to change?"
        )
    elif intent["intent"] == "modify":
        state.clear_pending_action()
        state.set_stage(WorkflowStage.REQUIREMENT_COLLECTION)
        mod = intent.get("modification_request", "")
        state.add_assistant_message(
            f"Sure, let's update that. {mod or 'What would you like to change?'}"
        )
    else:
        # Re-ask
        state.add_assistant_message(
            "Would you like me to search for flights? Please reply with yes or no."
        )

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Flight Search
# ─────────────────────────────────────────────────────────────────────────────

def node_flight_search(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Delegate flight search to FlightAgent.
    Stores results in state.flights and presents them to the user.
    """
    logger.info("NODE: flight_search")
    state = _load(state_dict)
    itinerary_agent = _get_itinerary_agent()
    flight_agent = _get_flight_agent()

    instruction = itinerary_agent.build_flight_search_instruction(state)
    logger.debug("Flight instruction: %s", instruction[:120])

    response = flight_agent.search_flights(
        instruction=instruction,
        search_params=state.trip.search_params,
    )

    state.flights.last_agent_response = response
    state.flights.search_performed = True

    if response.status == AgentResponseStatus.ERROR or not response.flights:
        state.set_stage(WorkflowStage.ERROR)
        state.error_message = (
            f"Flight search failed: {'; '.join(response.errors) or 'No flights found.'}"
        )
        state.add_assistant_message(
            "I'm sorry, I couldn't find any flights matching your criteria. "
            "Would you like to adjust the dates or budget?"
        )
    else:
        state.flights.search_results = response.flights
        state.flights.recommended_flight = response.recommended_flight
        state.set_stage(WorkflowStage.FLIGHT_SELECTION)
        reply = itinerary_agent.format_flight_results_message(state)
        state.add_assistant_message(reply)

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Flight Selection
# ─────────────────────────────────────────────────────────────────────────────

def node_flight_selection(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Capture the user's flight selection by number.
    Calls FlightAgent.select_flight() to confirm price, then asks for pre-book confirmation.
    """
    logger.info("NODE: flight_selection")
    state = _load(state_dict)
    itinerary_agent = _get_itinerary_agent()
    flight_agent = _get_flight_agent()

    intent = itinerary_agent.interpret_user_intent(state.last_user_input)

    if intent["intent"] != "select" or intent.get("selection_number") is None:
        state.add_assistant_message(
            "Please enter the number of the flight you'd like to select "
            f"(1–{len(state.flights.search_results)})."
        )
        return _dump(state)

    idx = intent["selection_number"] - 1
    flights = state.flights.search_results

    if idx < 0 or idx >= len(flights):
        state.add_assistant_message(
            f"That number isn't valid. Please choose between 1 and {len(flights)}."
        )
        return _dump(state)

    selected = flights[idx]
    passengers = {
        "adults": state.trip.search_params.adults,
        "children": state.trip.search_params.children,
    }
    response = flight_agent.select_flight(selected, passengers)

    state.flights.selected_flight = response.selected_flight
    state.flights.selection_made = True
    state.set_stage(WorkflowStage.FLIGHT_PREBOOK_CONFIRMATION)
    state.set_pending_action(PendingAction.PREBOOK_FLIGHT)

    reply = itinerary_agent.format_flight_selected_message(state)
    state.add_assistant_message(reply)
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Flight Pre-book Confirmation Gate
# ─────────────────────────────────────────────────────────────────────────────

def node_flight_prebook_confirmation(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Interpret yes/no for flight pre-booking."""
    logger.info("NODE: flight_prebook_confirmation")
    state = _load(state_dict)
    agent = _get_itinerary_agent()

    intent = agent.interpret_user_intent(state.last_user_input)

    if intent["intent"] == "yes":
        state.confirm_pending_action()
        state.set_stage(WorkflowStage.FLIGHT_PREBOOK)
        state.add_assistant_message("Pre-booking your flight now... 🔖")
    elif intent["intent"] in ("no",):
        state.clear_pending_action()
        state.set_stage(WorkflowStage.FLIGHT_SELECTION)
        state.add_assistant_message(
            "No problem. Here are the flights again — would you like to pick a different one?"
        )
        reply = agent.format_flight_results_message(state)
        state.add_assistant_message(reply)
    else:
        state.add_assistant_message(
            "Would you like me to pre-book this flight? Please reply yes or no."
        )
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Flight Pre-book
# ─────────────────────────────────────────────────────────────────────────────

def node_flight_prebook(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Delegate flight pre-booking to FlightAgent and store the prebook record."""
    logger.info("NODE: flight_prebook")
    state = _load(state_dict)
    itinerary_agent = _get_itinerary_agent()
    flight_agent = _get_flight_agent()

    if not state.flights.selected_flight:
        state.set_stage(WorkflowStage.FLIGHT_SELECTION)
        state.add_assistant_message("No flight selected. Let's go back and pick one.")
        return _dump(state)

    instruction = itinerary_agent.build_flight_prebook_instruction(state)
    passengers = {
        "adults": state.trip.search_params.adults,
        "children": state.trip.search_params.children,
    }

    response = flight_agent.prebook_flight(
        instruction=instruction,
        flight=state.flights.selected_flight,
        passengers=passengers,
    )

    if response.status == AgentResponseStatus.ERROR or not response.prebook:
        state.set_stage(WorkflowStage.ERROR)
        state.error_message = f"Flight pre-booking failed: {'; '.join(response.errors)}"
        state.add_assistant_message(
            "Sorry, the flight pre-booking failed. Would you like to try again?"
        )
    else:
        state.flights.prebook = response.prebook
        state.flights.prebook_done = True
        state.clear_pending_action()
        state.set_stage(WorkflowStage.DRAFT_ITINERARY)
        reply = itinerary_agent.format_flight_prebook_message(state)
        state.add_assistant_message(reply)

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Draft Itinerary Generation
# ─────────────────────────────────────────────────────────────────────────────

def node_draft_itinerary(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Generate the draft itinerary via ItineraryAgent."""
    logger.info("NODE: draft_itinerary")
    state = _load(state_dict)
    agent = _get_itinerary_agent()
    state = agent.generate_draft_itinerary(state)
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Draft Itinerary Review
# ─────────────────────────────────────────────────────────────────────────────

def node_draft_itinerary_review(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Interpret user's response to the draft itinerary:
      - approve  → proceed to hotel search
      - modify   → apply changes and regenerate
    """
    logger.info("NODE: draft_itinerary_review")
    state = _load(state_dict)
    agent = _get_itinerary_agent()

    intent = agent.interpret_user_intent(state.last_user_input)

    if intent["intent"] == "yes":
        # User approves the draft
        state.itinerary.draft_approved = True
        state.clear_pending_action()
        state.set_stage(WorkflowStage.HOTEL_SEARCH)
        state.add_assistant_message(
            "Great! Your draft itinerary is approved. 🎉\n"
            "Now let me search for the best hotels for each part of your trip..."
        )
    elif intent["intent"] == "modify":
        mod = intent.get("modification_request") or state.last_user_input
        state.itinerary.modification_requests.append(mod)
        # Regenerate with the modification note baked into the context
        state.set_stage(WorkflowStage.DRAFT_ITINERARY)
        state.add_assistant_message(
            f"Sure! I'll update the itinerary with your change: \"{mod}\"\n"
            "Regenerating..."
        )
    elif intent["intent"] in ("no",):
        # Treat as "make changes"
        state.set_stage(WorkflowStage.DRAFT_ITINERARY)
        state.add_assistant_message(
            "No problem! What changes would you like to make to the itinerary?"
        )
    else:
        # Could be a freeform modification request
        state.itinerary.modification_requests.append(state.last_user_input)
        state.set_stage(WorkflowStage.DRAFT_ITINERARY)
        state.add_assistant_message(
            f"Got it — I'll apply that change and regenerate the itinerary."
        )

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Hotel Search (iterates day-by-day)
# ─────────────────────────────────────────────────────────────────────────────

def node_hotel_search(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Search hotels for each day group in the itinerary, one group at a time.
    On first entry, searches the first day group and presents results.
    Subsequent calls (after user selects a hotel) search the next group.
    When all groups are searched, advances to hotel selection summary.
    """
    logger.info("NODE: hotel_search")
    state = _load(state_dict)
    itinerary_agent = _get_itinerary_agent()
    hotel_agent = _get_hotel_agent()

    # Build the full list of day-group search instructions
    all_instructions = itinerary_agent.build_hotel_search_instructions(state)

    if not all_instructions:
        state.set_stage(WorkflowStage.HOTEL_PREBOOK_CONFIRMATION)
        state.add_assistant_message(
            "No hotel search instructions could be generated. "
            "Please check the itinerary."
        )
        return _dump(state)

    # Find which day groups have not been searched yet
    searched_labels = set(state.hotels.search_results_by_day.keys())
    remaining = [
        instr for instr in all_instructions
        if instr["day_label"] not in searched_labels
    ]

    if not remaining:
        # All day groups searched
        state.hotels.all_days_searched = True
        state.set_stage(WorkflowStage.HOTEL_SELECTION)
        state.add_assistant_message(
            "I've found hotels for all days. Let me show you the selections."
        )
        return _dump(state)

    # Search the next un-searched day group
    current = remaining[0]
    day_label = current["day_label"]
    state.hotels.current_search_day = day_label

    logger.info("Searching hotels for: %s", day_label)

    response = hotel_agent.search_hotels(
        instruction=current["instruction"],
        search_params=current["search_params"],
        day_label=day_label,
    )

    state.hotels.last_agent_responses.append(response)

    if response.status == AgentResponseStatus.ERROR or not response.hotels:
        # Skip this day and move on — non-fatal
        logger.warning("No hotels found for %s — skipping.", day_label)
        state.hotels.search_results_by_day[day_label] = []
        state.hotels.recommended_by_day[day_label] = response.recommended_hotel  # type: ignore[assignment]
        state.add_assistant_message(
            f"I couldn't find hotels for {day_label}. "
            "Would you like to adjust the filters or skip this night?"
        )
    else:
        state.hotels.search_results_by_day[day_label] = response.hotels
        if response.recommended_hotel:
            state.hotels.recommended_by_day[day_label] = response.recommended_hotel
        state.set_stage(WorkflowStage.HOTEL_SELECTION)
        reply = itinerary_agent.format_hotel_results_message(response.hotels, day_label)
        state.add_assistant_message(reply)

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Hotel Selection
# ─────────────────────────────────────────────────────────────────────────────

def node_hotel_selection(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Capture the user's hotel selection for the current search day.
    After selection, checks if more days still need searching and loops back,
    or advances to the pre-book confirmation screen once all hotels are chosen.
    """
    logger.info("NODE: hotel_selection")
    state = _load(state_dict)
    itinerary_agent = _get_itinerary_agent()
    hotel_agent = _get_hotel_agent()

    current_day = state.hotels.current_search_day
    if not current_day:
        state.set_stage(WorkflowStage.HOTEL_PREBOOK_CONFIRMATION)
        return _dump(state)

    hotels = state.hotels.search_results_by_day.get(current_day, [])
    intent = itinerary_agent.interpret_user_intent(state.last_user_input)

    if intent["intent"] != "select" or intent.get("selection_number") is None:
        state.add_assistant_message(
            f"Please enter the hotel number for {current_day} "
            f"(1–{len(hotels)})."
        )
        return _dump(state)

    idx = intent["selection_number"] - 1
    if idx < 0 or idx >= len(hotels):
        state.add_assistant_message(
            f"Invalid choice. Please pick a number between 1 and {len(hotels)}."
        )
        return _dump(state)

    selected_hotel = hotels[idx]

    # Find check_in / check_out for this day group
    all_instructions = itinerary_agent.build_hotel_search_instructions(state)
    check_in = state.trip.search_params.departure_date
    check_out = state.trip.search_params.return_date or check_in
    for instr in all_instructions:
        if instr["day_label"] == current_day:
            check_in = instr["check_in"]
            check_out = instr["check_out"]
            break

    guests = {
        "adults": state.trip.search_params.adults,
        "children": state.trip.search_params.children,
    }
    select_response = hotel_agent.select_hotel(selected_hotel, check_in, check_out, guests)
    final_hotel = select_response.selected_hotel or selected_hotel
    state.hotels.selected_hotels[current_day] = final_hotel

    # Acknowledge selection
    nights = max((check_out - check_in).days, 1)
    state.add_assistant_message(
        f"✅ Selected: **{final_hotel.name}** ({final_hotel.star_rating}★) "
        f"for {current_day} — {nights} night(s), ₹{final_hotel.price_per_night * nights:,.0f} total."
    )

    # Determine next step: search remaining days or show summary
    all_labels = {instr["day_label"] for instr in all_instructions}
    selected_labels = set(state.hotels.selected_hotels.keys())

    if all_labels - selected_labels:
        # Still have day groups that need searching + selection
        state.hotels.current_search_day = None
        state.set_stage(WorkflowStage.HOTEL_SEARCH)
    else:
        # All hotels selected
        state.hotels.all_hotels_selected = True
        state.set_stage(WorkflowStage.HOTEL_PREBOOK_CONFIRMATION)
        summary = itinerary_agent.format_hotel_prebook_summary_message(state)
        state.add_assistant_message(summary)

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Hotel Pre-book Confirmation Gate
# ─────────────────────────────────────────────────────────────────────────────

def node_hotel_prebook_confirmation(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Interpret yes/no for bulk hotel pre-booking."""
    logger.info("NODE: hotel_prebook_confirmation")
    state = _load(state_dict)
    agent = _get_itinerary_agent()

    intent = agent.interpret_user_intent(state.last_user_input)

    if intent["intent"] == "yes":
        state.confirm_pending_action()
        state.set_stage(WorkflowStage.HOTEL_PREBOOK)
        state.add_assistant_message("Pre-booking all selected hotels... 🔖")
    elif intent["intent"] == "no":
        state.clear_pending_action()
        state.set_stage(WorkflowStage.HOTEL_SELECTION)
        state.add_assistant_message(
            "No problem. Would you like to change any of the selected hotels?"
        )
    elif intent["intent"] == "modify":
        mod = intent.get("modification_request", "")
        state.set_stage(WorkflowStage.HOTEL_SEARCH)
        state.hotels.selected_hotels.clear()
        state.hotels.search_results_by_day.clear()
        state.hotels.current_search_day = None
        state.add_assistant_message(
            f"Sure! Let me redo the hotel search with your preferences: {mod or 'updated filters'}."
        )
    else:
        state.add_assistant_message(
            "Would you like me to pre-book all selected hotels? Please reply yes or no."
        )

    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Hotel Pre-book (bulk)
# ─────────────────────────────────────────────────────────────────────────────

def node_hotel_prebook(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Pre-book all selected hotels via HotelAgent and store all prebook records."""
    logger.info("NODE: hotel_prebook")
    state = _load(state_dict)
    itinerary_agent = _get_itinerary_agent()
    hotel_agent = _get_hotel_agent()

    all_instructions = itinerary_agent.build_hotel_search_instructions(state)
    # Build a map: day_label -> (check_in, check_out)
    dates_by_label: dict[str, tuple] = {
        instr["day_label"]: (instr["check_in"], instr["check_out"])
        for instr in all_instructions
    }

    guests = {
        "adults": state.trip.search_params.adults,
        "children": state.trip.search_params.children,
    }
    errors: list[str] = []

    for day_label, hotel in state.hotels.selected_hotels.items():
        dates = dates_by_label.get(day_label)
        if not dates:
            logger.warning("No dates found for %s — skipping prebook.", day_label)
            continue

        check_in, check_out = dates
        instruction = itinerary_agent.build_hotel_prebook_instruction(
            hotel, check_in, check_out, day_label
        )

        response = hotel_agent.prebook_hotel(
            instruction=instruction,
            hotel=hotel,
            check_in=check_in,
            check_out=check_out,
            guests=guests,
            day_label=day_label,
        )

        if response.status == AgentResponseStatus.ERROR or not response.prebook:
            errors.append(f"{day_label}: {'; '.join(response.errors)}")
            logger.error("Hotel prebook failed for %s: %s", day_label, response.errors)
        else:
            state.hotels.prebooks[day_label] = response.prebook
            logger.info(
                "Hotel pre-booked: %s — %s", day_label, response.prebook.prebook_id
            )

    if errors:
        state.add_assistant_message(
            f"⚠️ Some hotels could not be pre-booked:\n"
            + "\n".join(f"  • {e}" for e in errors)
            + "\nPre-booking the rest and continuing..."
        )

    state.hotels.prebook_done = True
    state.clear_pending_action()
    state.set_stage(WorkflowStage.FINAL_ITINERARY)

    reply = itinerary_agent.format_hotel_prebooks_done_message(state)
    state.add_assistant_message(reply)
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Final Itinerary
# ─────────────────────────────────────────────────────────────────────────────

def node_final_itinerary(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Generate and present the complete final itinerary."""
    logger.info("NODE: final_itinerary")
    state = _load(state_dict)
    agent = _get_itinerary_agent()
    state = agent.generate_final_itinerary(state)
    return _dump(state)


# ─────────────────────────────────────────────────────────────────────────────
# Node: Error Handler
# ─────────────────────────────────────────────────────────────────────────────

def node_error(state_dict: dict[str, Any]) -> dict[str, Any]:
    """Gracefully handle errors and offer recovery options."""
    logger.error("NODE: error — %s", state_dict.get("error_message", "unknown error"))
    state = _load(state_dict)

    error_msg = state.error_message or "An unexpected error occurred."
    state.add_assistant_message(
        f"⚠️ Oops! Something went wrong:\n  {error_msg}\n\n"
        "Would you like to:\n"
        "  1. Try again\n"
        "  2. Go back to the beginning\n"
        "  3. Modify your search criteria"
    )

    # Reset to a recoverable stage
    state.set_stage(WorkflowStage.REQUIREMENT_COLLECTION)
    state.error_message = None
    return _dump(state)
