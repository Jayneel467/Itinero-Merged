from __future__ import annotations

from typing import Any, Dict, List, Optional

from langgraph.types import interrupt

from backend.models.state import (
    AppState,
    FlightSearchParams,
    HotelSearchParams,
    ItineraryVersion,
    RankingCriteria,
    TripType,
    WorkflowStep,
)
from backend.agents.flight_agent import FlightAgent
from backend.agents.hotel_agent import HotelAgent
from backend.agents.itinerary_agent import ItineraryAgent
from backend.services.itinerary_versioning import (
    save_itinerary_version,
    set_active_itinerary,
    compare_itineraries,
    build_comparison,
)


# ---------------------------------------------------------------------------
# Shared instances (stateless — safe to reuse)
# ---------------------------------------------------------------------------

_itinerary_agent = ItineraryAgent()
_flight_agent    = FlightAgent()
_hotel_agent     = HotelAgent()


# ===========================================================================
# SUPERVISOR NODE
# ===========================================================================

def node_supervisor(state: AppState) -> AppState:
    """
    Supervisor node — validates state, handles errors, and passes through.
    Routing to the next worker is driven by the conditional edge function.
    """
    if state.error_message:
        print(f"\n[ERROR] {state.error_message}")
        state = state.model_copy(update={"error_message": None})
    return state


# ===========================================================================
# 1. COLLECT REQUIREMENTS
# ===========================================================================

def node_collect_requirements(state: AppState) -> AppState:
    agent = _itinerary_agent

    if not state.current_user_message:
        welcome = agent.generate_welcome_message()
        user_input = interrupt(welcome)
        state = state.add_user_message(user_input)

    updated_req = agent.extract_requirements(
        user_message=state.current_user_message,
        existing=state.trip_requirements,
        conversation_history=[m.model_dump() for m in state.conversation_history],
    )

    return state.model_copy(update={
        "trip_requirements": updated_req,
        "workflow_step":     WorkflowStep.CHECK_MISSING_INFO,
    })


# ===========================================================================
# 2. CHECK MISSING INFO
# ===========================================================================

def node_check_missing_info(state: AppState) -> AppState:
    missing = state.trip_requirements.missing_fields()
    next_step = (
        WorkflowStep.ASK_MISSING_QUESTIONS
        if missing
        else WorkflowStep.USER_CONFIRMATION
    )
    return state.model_copy(update={
        "missing_fields": missing,
        "workflow_step":  next_step,
    })


# ===========================================================================
# 3. ASK MISSING QUESTIONS
# ===========================================================================

def node_ask_missing_questions(state: AppState) -> AppState:
    agent = _itinerary_agent
    question = agent.generate_missing_fields_question(state.missing_fields)

    user_input = interrupt(question)
    state = state.add_user_message(user_input)

    return state.model_copy(update={
        "workflow_step": WorkflowStep.COLLECT_REQUIREMENTS,
    })


# ===========================================================================
# 4. USER CONFIRMATION
# ===========================================================================

def node_user_confirmation(state: AppState) -> AppState:
    agent = _itinerary_agent
    prompt = agent.generate_confirmation_prompt(state)

    user_input = interrupt(prompt)
    msg = user_input.lower().strip()

    if msg in ("yes", "y", "sure", "ok", "okay", "proceed", "go ahead", "search"):
        state = state.add_assistant_message("Great! Searching for flights now... ✈️")
        return state.model_copy(update={
            "user_confirmed": True,
            "workflow_step":  WorkflowStep.FLIGHT_SEARCH,
        })

    if msg in ("no", "n", "cancel", "stop", "not yet"):
        state = state.add_assistant_message(
            "No problem! Let me know whenever you'd like to search for flights."
        )
        return state.model_copy(update={
            "user_confirmed":      False,
            "workflow_step":       WorkflowStep.COLLECT_REQUIREMENTS,
        })

    state = state.add_assistant_message(
        "Please answer **yes** to search for flights or **no** to make changes."
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.USER_CONFIRMATION,
    })


# ===========================================================================
# 5. FLIGHT SEARCH
# ===========================================================================

def node_flight_search(state: AppState) -> AppState:
    req = state.trip_requirements
    params = FlightSearchParams(
        origin         = req.departure_city or "",
        destination    = req.destination    or "",
        departure_date = req.departure_date or "",
        num_passengers = req.num_travelers  or 1,
        max_price      = req.budget,
    )
    results = _flight_agent.search_flights(params)
    return state.model_copy(update={
        "flight_search_results": results,
        "workflow_step":         WorkflowStep.FLIGHT_RANKING,
    })


# ===========================================================================
# 6. FLIGHT RANKING + SELECTION
# ===========================================================================

def node_flight_ranking(state: AppState) -> AppState:
    ranked = _flight_agent.rank_flights(
        state.flight_search_results, RankingCriteria.BEST_VALUE
    )

    lines: List[str] = []
    for i, f in enumerate(ranked):
        stops_str = "Non-stop" if f.stops == 0 else f"{f.stops} stop(s)"
        lines.append(
            f"  {i+1}. **{f.airline} {f.flight_number}** | "
            f"{f.departure_airport} → {f.arrival_airport}\n"
            f"     ⏱ {f.duration_display} | 🛑 {stops_str} | "
            f"💺 {_clean_enum(f.cabin, 'Economy').title()}\n"
            f"     💰 ₹{f.total_price:,.0f} | "
            f"{'🛄 Baggage incl.' if f.baggage_included else 'No baggage'} | "
            f"{'🔄 Refundable' if f.refundable else 'Non-refundable'}"
        )

    display = (
        f"I found **{len(ranked)} flights** for your trip!\n\n"
        + "\n".join(lines)
        + f"\n\nEnter the **number** of the flight you prefer (1–{len(ranked)}):"
    )

    choice = interrupt(display)
    try:
        idx = int(choice.strip()) - 1
        selected = ranked[idx]
    except (ValueError, IndexError):
        state = state.add_assistant_message(
            f"Invalid selection. Please enter a number between 1 and {len(ranked)}."
        )
        return state.model_copy(update={
            "flight_search_results": ranked,
            "workflow_step":         WorkflowStep.FLIGHT_RANKING,
        })

    state = state.add_assistant_message(
        f"You selected **{selected.airline} {selected.flight_number}** "
        f"({selected.departure_airport} → {selected.arrival_airport}) "
        f"at **₹{selected.total_price:,.0f}**."
    )
    return state.model_copy(update={
        "flight_search_results": ranked,
        "selected_flight":       selected,
        "workflow_step":         WorkflowStep.FLIGHT_SELECTION,
    })


# ===========================================================================
# 7. FLIGHT SELECTION
# ===========================================================================

def node_flight_selection(state: AppState) -> AppState:
    selected = state.selected_flight
    if selected is None:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_RANKING,
        })
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FLIGHT_PREBOOK,
    })


# ===========================================================================
# 8. FLIGHT PREBOOK
# ===========================================================================

def node_flight_prebook(state: AppState) -> AppState:
    choice = interrupt(
        f"Shall I **pre-book** the selected flight "
        f"({state.selected_flight.airline} {state.selected_flight.flight_number})? *(yes / no)*"
    )
    msg = choice.lower().strip()

    if msg in ("no", "n", "cancel", "skip"):
        state = state.add_assistant_message(
            "Flight booking cancelled. Would you like to choose a different flight? *(yes / no)*"
        )
        retry = interrupt("")
        if retry.lower().strip() in ("yes", "y"):
            return state.model_copy(update={
                "selected_flight": None,
                "workflow_step":   WorkflowStep.FLIGHT_RANKING,
            })
        return state.model_copy(update={
            "workflow_step": WorkflowStep.COLLECT_REQUIREMENTS,
        })

    prebook = _flight_agent.prebook_flight(
        flight         = state.selected_flight,
        num_passengers = state.trip_requirements.num_travelers or 1,
    )
    state = state.model_copy(update={
        "flight_prebook": prebook,
        "workflow_step":  WorkflowStep.FLIGHT_PREBOOKED,
    })
    state = state.add_assistant_message(
        f"✅ **Flight Pre-booked!**\n\n"
        f"Booking ID: `{prebook.prebook_id}`\n"
        f"Flight: {prebook.flight.airline} {prebook.flight.flight_number}\n"
        f"Total Charged: **₹{prebook.total_charged:,.0f}**"
    )
    return state


# ===========================================================================
# 9. FLIGHT PREBOOKED — wait for draft trigger
# ===========================================================================

def node_flight_prebooked(state: AppState) -> AppState:
    choice = interrupt(
        f"✅ Flight **{state.flight_prebook.flight.airline} {state.flight_prebook.flight.flight_number}** "
        f"pre-booked! ID: `{state.flight_prebook.prebook_id}`\n\n"
        "Ready to generate your draft itinerary?"
    )
    cmd = choice.lower().strip()
    if cmd in ("yes", "y", "sure", "ok", "generate", "go"):
        state = state.add_assistant_message(
            "Generating your **Draft Itinerary** now... 📋"
        )
        return state.model_copy(update={
            "workflow_step": WorkflowStep.DRAFT_ITINERARY,
        })
    state = state.add_assistant_message(
        "Draft generation postponed. Let me know when you're ready!"
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FLIGHT_PREBOOKED,
    })


# ===========================================================================
# 10. EDIT TRIP DETAILS
# ===========================================================================

def node_edit_trip_details(state: AppState) -> AppState:
    req = state.trip_requirements

    dep   = req.departure_city or "Not set"
    dest  = req.destination    or "Not set"
    cin   = req.departure_date or "Not set"
    cout  = req.return_date    or "Not set"
    adults = str(req.num_travelers) if req.num_travelers else "Not set"
    budget = f"₹{req.budget:,.0f}" if req.budget else "Not set"
    ttype = req.trip_type      or "Not set"

    display = (
        "📝 **Edit Trip Details**\n\n"
        "Current trip details:\n\n"
        f"  **1.** 🛫 **Departure:** {dep}\n"
        f"  **2.** 🛬 **Destination:** {dest}\n"
        f"  **3.** 📅 **Check-in:** {cin}\n"
        f"  **4.** 📅 **Check-out:** {cout}\n"
        f"  **5.** 👥 **Adults:** {adults}\n"
        f"  **6.** 💰 **Budget:** {budget}\n"
        f"  **7.** 🎯 **Travel Type:** {ttype}\n\n"
        "Enter the **number** of the field you want to edit, "
        "or type **done** to confirm and regenerate:"
    )

    choice = interrupt(display)
    choice = choice.strip()

    if choice.lower() in ("done", "d", "confirm", "finish", "yes", "regenerate"):
        state = state.add_assistant_message(
            "✅ Trip details confirmed. Regenerating your itinerary..."
        )
        state = state.model_copy(update={
            "workflow_step": WorkflowStep.DRAFT_ITINERARY,
        })
        return state

    field_map = {
        "1": ("departure_city", "Departure City"),
        "2": ("destination", "Destination"),
        "3": ("departure_date", "Check-in Date (YYYY-MM-DD)"),
        "4": ("return_date", "Check-out Date (YYYY-MM-DD)"),
        "5": ("num_travelers", "Number of Adults"),
        "6": ("budget", "Budget (in INR)"),
        "7": ("trip_type", "Travel Type"),
    }

    if choice not in field_map:
        state = state.add_assistant_message(
            "❌ Invalid choice. Please enter a number **1–7** or **done**."
        )
        return state.model_copy(update={
            "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
        })

    field_name, field_prompt = field_map[choice]

    prompt_text = field_prompt
    if field_name == "trip_type":
        prompt_text += (
            " (leisure / business / adventure / honeymoon / family / solo)"
        )

    new_value = interrupt(f"Enter new value for **{prompt_text}**: ")
    new_value = new_value.strip()

    if not new_value:
        state = state.add_assistant_message("❌ No value entered. Please try again.")
        return state.model_copy(update={
            "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
        })

    update_dict: Dict[str, Any] = {}

    if field_name == "departure_city":
        update_dict["departure_city"] = new_value
    elif field_name == "destination":
        update_dict["destination"] = new_value
    elif field_name == "departure_date":
        update_dict["departure_date"] = new_value
    elif field_name == "return_date":
        update_dict["return_date"] = new_value
    elif field_name == "num_travelers":
        try:
            update_dict["num_travelers"] = int(new_value)
        except ValueError:
            state = state.add_assistant_message(
                "❌ Invalid number. Please enter a valid integer."
            )
            return state.model_copy(update={
                "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
            })
    elif field_name == "budget":
        try:
            update_dict["budget"] = float(new_value.replace(",", ""))
        except ValueError:
            state = state.add_assistant_message(
                "❌ Invalid budget. Please enter a valid number."
            )
            return state.model_copy(update={
                "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
            })
    elif field_name == "trip_type":
        normalized = new_value.lower()
        valid = [t.value for t in TripType]
        if normalized in valid:
            update_dict["trip_type"] = TripType(normalized)
        else:
            state = state.add_assistant_message(
                f"❌ Invalid trip type. Choose from: {', '.join(valid)}."
            )
            return state.model_copy(update={
                "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
            })

    updated_req = req.model_copy(update=update_dict)
    display_val = new_value
    if field_name == "budget":
        try:
            display_val = f"₹{float(new_value.replace(',', '')):,.0f}"
        except ValueError:
            pass

    state = state.add_assistant_message(
        f"✅ **{field_prompt}** updated to **{display_val}**."
    )
    return state.model_copy(update={
        "trip_requirements": updated_req,
        "workflow_step":     WorkflowStep.EDIT_TRIP_DETAILS,
    })


# ===========================================================================
# 10. DRAFT ITINERARY
# ===========================================================================

def node_draft_itinerary(state: AppState) -> AppState:
    draft = _itinerary_agent.generate_draft_itinerary(state)

    state = save_itinerary_version(state, draft, label="Original")
    state = set_active_itinerary(state, 1)

    return state.model_copy(update={
        "workflow_step": WorkflowStep.DRAFT_CONFIRM,
    })


# ===========================================================================
# 10b. DRAFT CONFIRM — ask about hotels after draft is committed
# ===========================================================================

def node_draft_confirm(state: AppState) -> AppState:
    draft = state.draft_itinerary
    markdown = draft.markdown if draft else ""

    msg = (
        "📋 **Your Draft Itinerary is ready!**\n\n"
        + markdown
        + "\n\n---\nWould you like to **search for hotels** to complete your booking? *(yes / no / edit)*"
    )

    choice = interrupt(msg)
    cmd = choice.lower().strip()

    if cmd in ("yes", "y", "sure", "ok", "hotels", "search"):
        state = state.add_assistant_message("Great! Searching for hotels now... 🏨")
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })

    if cmd in ("edit", "change", "modify", "regenerate"):
        return state.model_copy(update={
            "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
            "ui_action":     "edit_itinerary",
        })

    state = state.add_assistant_message(
        "Okay! Generating your **Final Itinerary** without hotel bookings."
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FINAL_ITINERARY,
    })


# ===========================================================================
# 11. HOTEL SEARCH
# ===========================================================================

def node_hotel_search(state: AppState) -> AppState:
    req  = state.trip_requirements
    days = state.num_trip_days()

    params = HotelSearchParams(
        destination         = req.destination   or "",
        check_in            = req.departure_date or "",
        check_out           = req.return_date    or "",
        num_guests          = req.num_travelers  or 1,
        max_price_per_night = (req.budget / max(days, 1) * 0.40) if req.budget else None,
    )
    results = _hotel_agent.search_hotels(params)
    return state.model_copy(update={
        "hotel_search_results": results,
        "workflow_step":        WorkflowStep.HOTEL_RANKING,
    })


# ===========================================================================
# 12. HOTEL RANKING + SELECTION (day-by-day)
# ===========================================================================

def node_hotel_ranking(state: AppState) -> AppState:
    ranked = _hotel_agent.rank_hotels(
        state.hotel_search_results, RankingCriteria.BEST_VALUE
    )
    days = state.num_trip_days()
    dest = state.trip_requirements.destination or "destination"

    hotels_display_lines: List[str] = []
    for i, h in enumerate(ranked):
        stars = "⭐" * int(round(h.rating))
        amenities = ", ".join(h.amenities[:4])
        hotels_display_lines.append(
            f"  {i+1}. **{h.name}** {stars} ({h.rating}/5)\n"
            f"     💰 ₹{h.price_per_night:,.0f}/night | 📍 {h.address}\n"
            f"     🛏️ {h.room_type} | 🏊 {amenities}"
        )
    hotels_display = "\n".join(hotels_display_lines)

    selected: Dict[str, Any] = {}
    for day in range(1, days + 1):
        prompt = (
            f"\n---\n**Night {day} of {days}**\n\n"
            f"Available hotels in {dest.title()}:\n\n"
            f"{hotels_display}\n\n"
            f"Select a hotel for Night {day} (enter number 1–{len(ranked)}):"
        )
        choice = interrupt(prompt)
        try:
            idx = int(choice.strip()) - 1
            selected[str(day)] = ranked[idx]
            state = state.add_assistant_message(
                f"✅ Night {day}: **{ranked[idx].name}** selected "
                f"(⭐ {ranked[idx].rating} | ₹{ranked[idx].price_per_night:,.0f}/night)."
            )
        except (ValueError, IndexError):
            state = state.add_assistant_message(
                f"Invalid selection for Night {day}. Please try again."
            )
            return state.model_copy(update={
                "hotel_search_results": ranked,
                "selected_hotels":      selected,
                "workflow_step":        WorkflowStep.HOTEL_RANKING,
            })

    state = state.add_assistant_message(
        "✅ **All nights selected!**"
    )
    return state.model_copy(update={
        "hotel_search_results": ranked,
        "selected_hotels":      selected,
        "workflow_step":        WorkflowStep.HOTEL_PREBOOK,
    })


# ===========================================================================
# 13. HOTEL SELECTION (pass-through — already handled in ranking)
# ===========================================================================

def node_hotel_selection(state: AppState) -> AppState:
    if not state.selected_hotels:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_RANKING,
        })
    return state.model_copy(update={
        "workflow_step": WorkflowStep.HOTEL_PREBOOK,
    })


# ===========================================================================
# 14. HOTEL PREBOOK
# ===========================================================================

def node_hotel_prebook(state: AppState) -> AppState:
    choice = interrupt("Shall I **pre-book all selected hotels**? *(yes / no)*")
    msg = choice.lower().strip()

    if msg in ("no", "n", "cancel", "skip"):
        state = state.add_assistant_message(
            "Hotel booking cancelled. You can choose different hotels if you'd like."
        )
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_RANKING,
        })

    req      = state.trip_requirements
    prebooks = {}
    conf_lines: List[str] = []

    for day_str, hotel in sorted(state.selected_hotels.items(), key=lambda x: int(x[0])):
        day_num = int(day_str)
        pb = _hotel_agent.prebook_hotel(
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
        + "\n\nGenerating your **Final Itinerary** now... 🎉"
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FINAL_ITINERARY,
    })


# ===========================================================================
# 15. FINAL ITINERARY
# ===========================================================================

def node_final_itinerary(state: AppState) -> AppState:
    final = _itinerary_agent.generate_final_itinerary(state)
    state = state.model_copy(update={"final_itinerary": final})
    state = state.add_assistant_message(
        "🎉 **Your Complete Travel Itinerary is Ready!**\n\n"
        + final.markdown
        + "\n\n---\n"
        "Have a fantastic trip! ✈️🌍\n"
        "To plan a new trip, just run the planner again."
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.COMPLETED,
    })


# ===========================================================================
# ROUTING TABLE
# ===========================================================================

WORKER_NODES: Dict[WorkflowStep, str] = {
    WorkflowStep.COLLECT_REQUIREMENTS:  "collect_requirements",
    WorkflowStep.CHECK_MISSING_INFO:    "check_missing_info",
    WorkflowStep.ASK_MISSING_QUESTIONS: "ask_missing_questions",
    WorkflowStep.USER_CONFIRMATION:     "user_confirmation",
    WorkflowStep.FLIGHT_SEARCH:         "flight_search",
    WorkflowStep.FLIGHT_RANKING:        "flight_ranking",
    WorkflowStep.FLIGHT_SELECTION:      "flight_selection",
    WorkflowStep.FLIGHT_PREBOOK:        "flight_prebook",
    WorkflowStep.FLIGHT_PREBOOKED:      "flight_prebooked",
    WorkflowStep.DRAFT_ITINERARY:       "draft_itinerary",
    WorkflowStep.DRAFT_CONFIRM:         "draft_confirm",
    WorkflowStep.EDIT_TRIP_DETAILS:     "edit_trip_details",
    WorkflowStep.HOTEL_SEARCH:          "hotel_search",
    WorkflowStep.HOTEL_RANKING:         "hotel_ranking",
    WorkflowStep.HOTEL_SELECTION:       "hotel_selection",
    WorkflowStep.HOTEL_PREBOOK:         "hotel_prebook",
    WorkflowStep.FINAL_ITINERARY:       "final_itinerary",
}


def step_to_node(step: WorkflowStep) -> str:
    return WORKER_NODES.get(step, "collect_requirements")


# ===========================================================================
# Helpers
# ===========================================================================

def _clean_enum(val: Any, default: str = "") -> str:
    if val is None:
        return default
    s = str(val)
    if "." in s:
        s = s.split(".")[-1]
    return s.lower()
