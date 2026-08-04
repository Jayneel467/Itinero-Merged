from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from langgraph.types import interrupt
from pydantic import ValidationError

from backend.config import settings
from backend.models.state import (
    AppState,
    FlightSearchParams,
    Hotel,
    HotelNightSelection,
    HotelPrebook,
    HotelSearchParams,
    HotelWithOffers,
    ItineraryVersion,
    PassengerFormData,
    RankingCriteria,
    RoomOffer,
    TripType,
    WorkflowStep,
    build_night_segments,
)
from backend.agents.flight_agent import FlightAgent
from backend.agents.itinerary_agent import ItineraryAgent
from backend.services.itinerary_versioning import (
    save_itinerary_version,
    set_active_itinerary,
    compare_itineraries,
    build_comparison,
)
from backend.services.hotel_service import (
    HotelAgent,
    enrich_hotel_with_details,
    enrich_room_offers_with_details,
    fetch_hotel_details,
    prebook_hotel_room,
    search_hotel_offers_for_hotel,
)
from backend.services.distance_service import (
    build_reuse_payload,
    max_activity_distance_km,
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
        state = state.add_assistant_message(
            "Great! Generating your draft itinerary now... 📋"
        )
        return state.model_copy(update={
            "user_confirmed": True,
            "workflow_step":  WorkflowStep.DRAFT_ITINERARY,
        })

    if msg in ("no", "n", "cancel", "stop", "not yet"):
        state = state.add_assistant_message(
            "No problem! Let me know whenever you'd like to generate your itinerary."
        )
        return state.model_copy(update={
            "user_confirmed":      False,
            "workflow_step":       WorkflowStep.COLLECT_REQUIREMENTS,
        })

    state = state.add_assistant_message(
        "Please answer **yes** to generate your itinerary or **no** to make changes."
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
    if state.selected_flight is None:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_RANKING,
        })
    # Selected — ask the frontend to collect passenger details (HITL pause).
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FLIGHT_PASSENGER_DETAILS,
    })


# ===========================================================================
# 7b. FLIGHT PASSENGER DETAILS — collect LiteAPI booking form data
# ===========================================================================

def node_flight_passenger_details(state: AppState) -> AppState:
    """
    Pause the workflow and ask the frontend to open the Passenger Details
    form. Resumes with the validated form payload; the real LiteAPI
    pre-booking call happens in the NEXT node (flight_prebook).
    """
    flight = state.selected_flight
    if flight is None:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_RANKING,
        })

    num_passengers = state.trip_requirements.num_travelers or 1

    base_payload: Dict[str, Any] = {
        "type": "flight_passenger_details",
        "message": (
            f"✈️ **{flight.airline} {flight.flight_number}** selected!\n\n"
            f"{flight.departure_airport} → {flight.arrival_airport} · "
            f"{flight.duration_display}\n"
            f"Total price: **₹{flight.total_price:,.0f}**\n\n"
            "Please fill in the **Passenger Details form** to continue "
            "with pre-booking."
        ),
        "flight": flight.model_dump(),
        "num_passengers": num_passengers,
    }

    user_input = interrupt(base_payload)

    # User cancelled via chat / terminal
    if isinstance(user_input, str):
        cmd = user_input.strip().lower()
        if cmd in ("cancel", "no", "back", "skip"):
            state = state.add_assistant_message(
                "Flight selection cancelled. You can choose a different flight."
            )
            return state.model_copy(update={
                "selected_flight": None,
                "passenger_form":  None,
                "workflow_step":   WorkflowStep.FLIGHT_RANKING,
            })
        state = state.add_assistant_message(
            "Please use the **Passenger Details form** to continue."
        )
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_PASSENGER_DETAILS,
        })

    # Validate the submitted form (loop re-pauses on invalid data)
    while isinstance(user_input, dict):
        try:
            form = PassengerFormData(**user_input)
        except ValidationError as exc:
            errors = _format_validation_errors(exc)
            payload_with_errors = {
                **base_payload,
                "errors": errors,
                "message": (
                    "❌ **Some passenger details are invalid.** "
                    "Please fix the highlighted fields and submit again."
                ),
            }
            user_input = interrupt(payload_with_errors)
            if isinstance(user_input, str) and user_input.strip().lower() in (
                "cancel", "no", "back",
            ):
                state = state.add_assistant_message(
                    "Flight selection cancelled. You can choose a different flight."
                )
                return state.model_copy(update={
                    "selected_flight": None,
                    "passenger_form":  None,
                    "workflow_step":   WorkflowStep.FLIGHT_RANKING,
                })
            continue

        state = state.model_copy(update={
            "passenger_form": form,
            "workflow_step":  WorkflowStep.FLIGHT_PREBOOK,
        })
        return state

    # Unknown input shape
    state = state.add_assistant_message(
        "Please use the **Passenger Details form** to continue."
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FLIGHT_PASSENGER_DETAILS,
    })


# ===========================================================================
# 8. FLIGHT PREBOOK — real LiteAPI pre-booking
# ===========================================================================

def node_flight_prebook(state: AppState) -> AppState:
    form = state.passenger_form
    if form is None:
        # No passenger data — go back and ask for it.
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_PASSENGER_DETAILS,
        })

    try:
        prebook = _flight_agent.prebook_flight(
            flight    = state.selected_flight,
            contact   = form.contact,
            passengers = form.passengers,
        )
    except Exception as exc:
        state = state.add_assistant_message(
            f"❌ **Flight pre-booking failed.**\n\n`{exc}`"
        )
        choice = interrupt({
            "type": "flight_prebook_error",
            "message": (
                f"❌ **Flight pre-booking failed.**\n\n"
                f"`{exc}`\n\n"
                "Would you like to **retry** or choose a **different flight**?"
            ),
            "retryable": True,
        })
        cmd = choice.strip().lower() if isinstance(choice, str) else ""
        if cmd in ("retry", "try again", "yes", "y"):
            return state.model_copy(update={
                "workflow_step": WorkflowStep.FLIGHT_PREBOOK,
            })
        state = state.add_assistant_message(
            "Pre-booking cancelled. Choose a different flight if you'd like."
        )
        return state.model_copy(update={
            "selected_flight": None,
            "passenger_form":  None,
            "workflow_step":   WorkflowStep.FLIGHT_RANKING,
        })

    state = state.model_copy(update={
        "flight_prebook": prebook,
        "workflow_step":  WorkflowStep.FLIGHT_PREBOOKED,
    })
    state = state.add_assistant_message(
        f"✅ **Flight Pre-booked!**\n\n"
        f"Prebook ID: `{prebook.prebook_id}`\n"
        f"Status: **{prebook.booking_status or prebook.status}**\n"
        f"Flight: {prebook.flight.airline} {prebook.flight.flight_number}\n"
        f"Total: **₹{prebook.total_charged:,.0f}**"
    )
    return state


# ===========================================================================
# 9. FLIGHT PREBOOKED — confirmation page, wait for hotel-search trigger
# ===========================================================================

def node_flight_prebooked(state: AppState) -> AppState:
    pb = state.flight_prebook
    if pb is None:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_PREBOOK,
        })
    flight = pb.flight
    passenger_names = ", ".join(
        f"{p.first_name} {p.last_name}" for p in (pb.passenger_details or [])
    ) or f"{pb.passengers} passenger(s)"

    payload = {
        "type": "flight_prebooked",
        "message": (
            f"✅ **Flight Pre-booked!**\n\n"
            f"Prebook ID: `{pb.prebook_id}`\n"
            f"Status: **{pb.booking_status or pb.status}**\n"
            f"Flight: {flight.airline} {flight.flight_number}\n"
            f"Passengers: {passenger_names}\n"
            f"Total: **₹{pb.total_charged:,.0f}**\n\n"
            "Ready to search for hotels?"
        ),
        "prebook": pb.model_dump(),
        "flight": flight.model_dump(),
        "passenger_names": passenger_names,
    }

    choice = interrupt(payload)
    cmd = choice.strip().lower() if isinstance(choice, str) else ""
    if cmd in ("yes", "y", "sure", "ok", "hotels", "go", "continue"):
        state = state.add_assistant_message(
            "Great! Searching for hotels now... 🏨"
        )
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })
    state = state.add_assistant_message(
        "Hotel search postponed. Let me know when you're ready!"
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
# 10b. DRAFT CONFIRM — ask about flights after draft is committed
# ===========================================================================

def node_draft_confirm(state: AppState) -> AppState:
    draft = state.draft_itinerary
    markdown = draft.markdown if draft else ""

    msg = (
        "📋 **Your Draft Itinerary is ready!**\n\n"
        + markdown
        + "\n\n---\nWould you like to **search for flights** to complete your booking? *(yes / no / edit)*"
    )

    choice = interrupt(msg)
    cmd = choice.lower().strip()

    if cmd in ("yes", "y", "sure", "ok", "flights", "search"):
        state = state.add_assistant_message("Great! Searching for flights now... ✈️")
        return state.model_copy(update={
            "workflow_step": WorkflowStep.FLIGHT_SEARCH,
        })

    if cmd in ("edit", "change", "modify", "regenerate"):
        return state.model_copy(update={
            "workflow_step": WorkflowStep.EDIT_TRIP_DETAILS,
            "ui_action":     "edit_itinerary",
        })

    state = state.add_assistant_message(
        "Okay! Generating your **Final Itinerary** without any bookings."
    )
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FINAL_ITINERARY,
    })


# ===========================================================================
# 11. HOTEL SEARCH — one search per night (nightly check-in/check-out)
# ===========================================================================

def node_hotel_search(state: AppState) -> AppState:
    req = state.trip_requirements

    # ── Split the stay into nightly segments (rebuilt when dates change) ──
    segments = state.hotel_night_segments
    expected_start = req.departure_date or ""
    expected_end   = req.return_date or ""
    if (
        not segments
        or segments[0].check_in != expected_start
        or segments[-1].check_out != expected_end
    ):
        segments = build_night_segments(expected_start, expected_end)
        state = state.model_copy(update={"hotel_night_segments": segments})

    total_nights = len(segments)
    night        = min(max(state.current_night, 1), total_nights)
    segment      = segments[night - 1]

    max_price_per_night = (
        round(req.budget / max(total_nights, 1) * 0.40, 0)
        if req.budget else None
    )

    # Drop results from any earlier night so a failed/empty search can never
    # leave stale hotel cards behind (the API only shows the current list).
    state = state.model_copy(update={
        "hotel_search_results":     [],
        "hotel_search_with_offers": [],
    })

    # Interrupt-driven retry / relax / skip loop (state is only committed
    # when this node returns — safe to loop with interrupts here).
    while True:
        params = HotelSearchParams(
            destination         = req.destination or "",
            check_in            = segment.check_in,
            check_out           = segment.check_out,
            num_guests          = req.num_travelers or 1,
            max_price_per_night = max_price_per_night,
        )
        try:
            results = _hotel_agent.search_hotels_with_offers(params)
        except Exception as exc:
            choice = interrupt({
                "type": "hotel_search_error",
                "night": night,
                "total_nights": total_nights,
                "message": (
                    f"❌ **Hotel search failed for Night {night}** "
                    f"({segment.check_in} → {segment.check_out}).\n\n"
                    f"Reason: `{exc}`\n\n"
                    "Reply **retry** to try again, **relax** to increase the "
                    "budget, **skip** to skip this night, or **cancel**."
                ),
            })
            cmd = _parse_choice(choice)
            if cmd == "retry":
                continue
            if cmd == "relax":
                max_price_per_night = round((max_price_per_night or 5000) * 1.5, 0)
                continue
            if cmd == "skip":
                return _skip_night(state, night, total_nights,
                                   reason="Hotel search failed.")
            state = state.add_assistant_message(
                "Hotel search cancelled. No hotels were selected."
            )
            return _finish_night_loop(state, total_nights)

        if not results:
            choice = interrupt({
                "type": "hotel_no_results",
                "night": night,
                "total_nights": total_nights,
                "message": (
                    f"😕 **No hotels found for Night {night}** "
                    f"({segment.check_in} → {segment.check_out}).\n\n"
                    "Reply **retry** to try again, **relax** to increase the "
                    "budget, **skip** to skip this night, or **cancel**."
                ),
            })
            cmd = _parse_choice(choice)
            if cmd == "retry":
                continue
            if cmd == "relax":
                max_price_per_night = round((max_price_per_night or 5000) * 1.5, 0)
                continue
            if cmd == "skip":
                return _skip_night(state, night, total_nights,
                                   reason="No hotels available.")
            state = state.add_assistant_message(
                "Hotel search cancelled. No hotels were selected."
            )
            return _finish_night_loop(state, total_nights)

        break

    hotels   = [r.hotel for r in results]
    with_off = results
    state    = state.model_copy(update={
        "hotel_search_results":      hotels,
        "hotel_search_with_offers":  with_off,
        "hotel_room_offers":         [],
        "selected_night_hotel":      None,
        "hotel_search_error":        None,
        "workflow_step":             WorkflowStep.HOTEL_RANKING,
    })
    return state


# ===========================================================================
# 12. HOTEL RANKING + SELECTION (current night only)
# ===========================================================================

def node_hotel_ranking(state: AppState) -> AppState:
    hotels = state.hotel_search_results
    night  = state.current_night
    total  = len(state.hotel_night_segments) or 1

    if not hotels:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })

    ranked = _hotel_agent.rank_hotels(hotels, RankingCriteria.BEST_VALUE)
    dest   = state.trip_requirements.destination or "destination"

    lines: List[str] = []
    for i, h in enumerate(ranked):
        stars = "⭐" * int(round(h.rating))
        amenities = ", ".join(h.amenities[:4])
        lines.append(
            f"  {i+1}. **{h.name}** {stars} ({h.rating}/5)\n"
            f"     💰 ₹{h.price_per_night:,.0f}/night | 📍 {h.address}\n"
            f"     🛏️ {h.room_type} | 🏊 {amenities}"
        )
    display = (
        f"\n---\n**Night {night} of {total}** "
        f"({_fmt_date(state.hotel_night_segments[night-1].check_in) if state.hotel_night_segments else ''} "
        f"→ {_fmt_date(state.hotel_night_segments[night-1].check_out) if state.hotel_night_segments else ''})\n\n"
        f"Available hotels in {dest.title()}:\n\n"
        + "\n".join(lines)
        + f"\n\nSelect a hotel for Night {night} (enter number 1–{len(ranked)}):"
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
            "hotel_search_results": ranked,
            "workflow_step":        WorkflowStep.HOTEL_RANKING,
        })

    # ── Look up the room offers for the selected hotel ──
    offers = _offers_for_hotel(state.hotel_search_with_offers, selected.hotel_id)
    if not offers:
        state = state.add_assistant_message(
            f"**{selected.name}** has no bookable rooms for these dates."
        )
        choice = interrupt({
            "type": "hotel_no_rooms",
            "night": night,
            "hotel_name": selected.name,
            "message": (
                f"❌ **{selected.name}** has no available rooms for "
                f"Night {night}. Please choose a different hotel."
            ),
        })
        return state.model_copy(update={
            "hotel_search_results": ranked,
            "workflow_step":        WorkflowStep.HOTEL_RANKING,
        })

    # ── Attach images / details for the selected hotel & its rooms ──
    # (search-time enrichment is best-effort; retry here for the chosen
    # hotel so the room cards always have photos + "Details More" data)
    if (not selected.hotel_images
            or not any(o.room_images for o in offers)):
        try:
            detail = fetch_hotel_details(selected.hotel_id)
        except Exception:
            detail = {}
        if detail:
            selected = enrich_hotel_with_details(selected, detail)
            offers   = enrich_room_offers_with_details(offers, detail)

    state = state.add_assistant_message(
        f"✅ Night {night}: **{selected.name}** selected "
        f"(⭐ {selected.rating} | ₹{selected.price_per_night:,.0f}/night). "
        f"Now pick a room type."
    )
    return state.model_copy(update={
        "hotel_search_results": ranked,
        "hotel_room_offers":    offers,
        "selected_night_hotel": selected,
        "workflow_step":        WorkflowStep.HOTEL_SELECTION,
    })


# ===========================================================================
# 13. HOTEL SELECTION (pass-through — selection already recorded)
# ===========================================================================

def node_hotel_selection(state: AppState) -> AppState:
    if not state.hotel_room_offers:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_RANKING,
        })
    return state.model_copy(update={
        "workflow_step": WorkflowStep.HOTEL_ROOM_SELECTION,
    })


# ===========================================================================
# 13b. ROOM SELECTION — pick a room offer for the current night's hotel
# ===========================================================================

def node_hotel_room_selection(state: AppState) -> AppState:
    night   = state.current_night
    total   = len(state.hotel_night_segments) or 1
    offers  = state.hotel_room_offers
    selected_hotel = state.selected_night_hotel

    if not offers:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_RANKING,
        })

    hotel_label = selected_hotel.name if selected_hotel else "your hotel"

    while True:
        lines: List[str] = []
        for i, o in enumerate(offers):
            lines.append(
                f"  {i+1}. **{o.room_type}** — {o.board_name or 'Room Only'}\n"
                f"     💰 ₹{o.price_per_night:,.0f}/night "
                f"(₹{o.total_price:,.0f} total) | "
                f"{'🔄 Refundable' if o.refundable else 'Non-refundable'}"
            )
        message = (
            f"🛏️ **Room options at {hotel_label}** — Night {night} of {total} "
            f"({state.hotel_night_segments[night-1].check_in} → "
            f"{state.hotel_night_segments[night-1].check_out})\n\n"
            + "\n".join(lines)
            + f"\n\nSelect a room (enter number 1–{len(offers)}):"
        )

        choice = interrupt({
            "type":   "hotel_room_offers",
            "message": message,
            "night":  night,
            "hotel":  selected_hotel.model_dump() if selected_hotel else None,
            "offers": [o.model_dump() for o in offers],
        })

        idx = _parse_offer_index(choice)
        if idx is not None and 0 <= idx < len(offers):
            offer = offers[idx]
            break

        state = state.add_assistant_message(
            f"Invalid room selection. Please enter a number between 1 and {len(offers)}."
        )

    selection = HotelNightSelection(
        night           = night,
        check_in        = state.hotel_night_segments[night-1].check_in,
        check_out       = state.hotel_night_segments[night-1].check_out,
        hotel_id        = selected_hotel.hotel_id if selected_hotel else "",
        hotel_name      = selected_hotel.name if selected_hotel else hotel_label,
        room_type       = offer.room_type,
        offer_id        = offer.offer_id,
        price_per_night = offer.price_per_night,
        total_price     = offer.total_price,
        currency        = offer.currency,
        hotel           = selected_hotel,
    )

    existing = state.hotel_night_selections
    selections = [s for s in existing if s.night != night] + [selection]
    selections.sort(key=lambda s: s.night)

    state = state.add_assistant_message(
        f"✅ Night {night}: **{selection.hotel_name}** — **{offer.room_type}** "
        f"at **₹{offer.total_price:,.0f}**."
    )

    if night < total:
        return state.model_copy(update={
            "hotel_night_selections": selections,
            "hotel_room_offers":      [],
            "selected_night_hotel":   None,
            "current_night":          night + 1,
            "workflow_step":          WorkflowStep.HOTEL_REUSE_CHECK,
        })

    return state.model_copy(update={
        "hotel_night_selections": selections,
        "hotel_room_offers":      [],
        "selected_night_hotel":   None,
        "workflow_step":          WorkflowStep.HOTEL_SUMMARY,
    })


# ===========================================================================
# 13c. HOTEL REUSE CHECK — reuse the previous night's hotel when the next
#      day's activities are nearby; otherwise ask the user for a decision.
# ===========================================================================

_REUSE_KEEP_WORDS   = ("keep", "reuse", "same", "stay", "yes", "y")
_REUSE_SKIP_WORDS   = ("skip", "s", "continue", "next", "cancel")


def node_hotel_reuse_check(state: AppState) -> AppState:
    """
    Compare the selected hotel for the PREVIOUS night with the CURRENT
    night's activities (Day N activities ↔ Day N-1 hotel).

    - Within the configured distance threshold → auto-reuse the same hotel
      (no new hotel options shown) and advance to the next night.
    - Far away / ungeocodable → ask the user whether to search a new hotel,
      keep the same hotel, or skip the night.
    - No comparable hotel or itinerary → fall back to a plain search.

    The same logic runs for every night, so it scales to any trip length.
    """
    total   = len(state.hotel_night_segments)
    night   = min(max(state.current_night, 1), total)
    segment = state.hotel_night_segments[night - 1]

    previous = _previous_night_selection(state)
    previous_hotel = _hotel_for_selection(previous)

    # No baseline hotel (e.g. previous night was skipped) → normal search.
    if previous_hotel is None:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })

    # No itinerary to compare against → plain search.
    day = _day_activities(state, night)
    if day is None:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })

    distance = max_activity_distance_km(
        previous_hotel,
        day,
        state.trip_requirements.destination or "",
    )
    threshold = settings.hotel_reuse_max_distance_km

    if distance is not None and distance <= threshold:
        return _reuse_hotel_for_night(
            state, previous_hotel, night, total, segment, distance,
        )

    # Far away or unknown → ask the user how to proceed.
    distance_desc = (
        f"📍 Next day's activities are about **{distance:.1f} km** away "
        f"({'beyond the ' if distance is not None else ''}"
        f"{threshold:.0f} km threshold)."
        if distance is not None else
        f"📍 Next day's activities couldn't be pinned down precisely."
    )

    while True:
        message = (
            f"{distance_desc}\n\n"
            f"**{previous_hotel.name}** works well for Night {night - 1}, but "
            f"Night {night}'s activities may be far from it. Would you like to:\n\n"
            f"  🔍 **search** — show new hotel options for Night {night}\n"
            f"  ✅ **keep** — reuse **{previous_hotel.name}** for Night {night}\n"
            f"  ⏭️  **skip** — skip booking a hotel for Night {night}"
        )
        choice = interrupt(build_reuse_payload(
            night=night,
            hotel_name=previous_hotel.name,
            distance_km=distance,
            message=message,
        ))
        cmd = _parse_choice(choice)

        if cmd in _REUSE_KEEP_WORDS:
            break  # keep same hotel → reuse path below
        if cmd in _REUSE_SKIP_WORDS:
            return _skip_night(state, night, total,
                               reason="You chose to skip this night.")
        # "search", "new", "show", "hotels", or anything unrecognised → search.
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })

    return _reuse_hotel_for_night(
        state, previous_hotel, night, total, segment, distance,
    )


def _reuse_hotel_for_night(
    state: AppState,
    hotel: Hotel,
    night: int,
    total: int,
    segment: Any,
    distance: Optional[float],
) -> AppState:
    """
    Reuse *hotel* for the given night: fetch fresh room offers for the new
    dates, auto-pick the cheapest, record the selection and advance.
    """
    adults          = state.trip_requirements.num_travelers or 1
    offers          = search_hotel_offers_for_hotel(
        hotel.hotel_id, segment.check_in, segment.check_out, adults,
    )

    if not offers:
        # No bookable rooms for the reused hotel on the new dates — the
        # user has to fall back to searching or skipping.
        while True:
            message = (
                f"⚠️ **{hotel.name}** has no bookable rooms for Night {night} "
                f"({segment.check_in} → {segment.check_out}).\n\n"
                f"Reply **search** to pick a new hotel, or **skip** to "
                f"skip this night."
            )
            choice = interrupt(build_reuse_payload(
                night=night,
                hotel_name=hotel.name,
                distance_km=distance,
                message=message,
            ))
            cmd = _parse_choice(choice)
            if cmd in _REUSE_SKIP_WORDS:
                return _skip_night(state, night, total,
                                   reason="No room available for reuse.")
            # default → search a new hotel
            break
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SEARCH,
        })

    best = min(offers, key=lambda o: o.total_price)
    selection = HotelNightSelection(
        night           = night,
        check_in        = segment.check_in,
        check_out       = segment.check_out,
        hotel_id        = hotel.hotel_id,
        hotel_name      = hotel.name,
        room_type       = best.room_type,
        offer_id        = best.offer_id,
        price_per_night = best.price_per_night,
        total_price     = best.total_price,
        currency        = best.currency,
        hotel           = hotel,
    )

    selections = _upsert_selection(state.hotel_night_selections, selection)
    state = state.model_copy(update={"hotel_night_selections": selections})
    state = state.add_assistant_message(
        f"✅ Night {night}: staying at the **same hotel** — {hotel.name} "
        f"({best.room_type} @ ₹{best.total_price:,.0f}) — it's close to "
        f"your activities."
    )

    if night < total:
        return state.model_copy(update={
            "hotel_room_offers":    [],
            "selected_night_hotel": None,
            "current_night":        night + 1,
            "workflow_step":        WorkflowStep.HOTEL_REUSE_CHECK,
        })
    return state.model_copy(update={
        "hotel_room_offers":    [],
        "selected_night_hotel": None,
        "workflow_step":        WorkflowStep.HOTEL_SUMMARY,
    })


def _previous_night_selection(state: AppState) -> Optional[HotelNightSelection]:
    """Return the selection for the night before the current one."""
    previous_night = state.current_night - 1
    for sel in state.hotel_night_selections:
        if sel.night == previous_night:
            return sel
    return None


def _hotel_for_selection(
    selection: Optional[HotelNightSelection],
) -> Optional[Hotel]:
    """Full Hotel snapshot for a selection, or a fallback when not stored."""
    if selection is None:
        return None
    if selection.hotel is not None:
        return selection.hotel
    if selection.hotel_id and selection.hotel_name:
        return _selection_fallback_hotel(selection)
    return None


def _day_activities(state: AppState, night: int) -> Any:
    """DayActivity (or None) for the given night's day number."""
    draft = state.draft_itinerary
    if draft is None or not draft.days:
        return None
    idx = night - 1
    if idx < 0 or idx >= len(draft.days):
        return None
    return draft.days[idx]


def _upsert_selection(
    selections: List[HotelNightSelection],
    selection: HotelNightSelection,
) -> List[HotelNightSelection]:
    out = [s for s in selections if s.night != selection.night] + [selection]
    out.sort(key=lambda s: s.night)
    return out


# ===========================================================================
# 13d. HOTEL SUMMARY — combined night-by-night summary + confirmation
# ===========================================================================

def node_hotel_summary(state: AppState) -> AppState:
    selections = _ordered_selections(state)
    total      = sum(s.total_price for s in selections)

    lines: List[str] = ["**Your hotel selections:**", ""]
    for s in selections:
        if s.offer_id:
            lines.append(
                f"  🛏️ **Night {s.night}** — {s.hotel_name} | "
                f"{s.room_type} | ₹{s.total_price:,.0f}"
            )
        else:
            lines.append(
                f"  ⚠️ **Night {s.night}** — no hotel selected "
                f"({s.prebook_error or 'skipped'})"
            )
    lines += ["", f"  💰 **Grand Total: ₹{total:,.0f}**", "",
              "Proceed with pre-booking? *(yes / no)*"]

    message = "\n".join(lines)
    payload = {
        "type":       "hotel_summary",
        "message":    message,
        "selections": [s.model_dump() for s in selections],
        "grand_total": total,
        "total_nights": len(selections),
    }

    choice = interrupt(payload)
    cmd = _parse_choice(choice)

    if cmd in ("yes", "y", "confirm", "proceed", "prebook"):
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_PREBOOK,
        })

    state = state.add_assistant_message(
        "Pre-booking cancelled. Restarting hotel selection from Night 1 — "
        "you can pick different hotels."
    )
    return state.model_copy(update={
        "hotel_night_selections": [],
        "hotel_room_offers":      [],
        "current_night":          1,
        "workflow_step":          WorkflowStep.HOTEL_SEARCH,
    })


# ===========================================================================
# 14. HOTEL PREBOOK — sequential real pre-book for every selected hotel
# ===========================================================================

def node_hotel_prebook(state: AppState) -> AppState:
    selections = _ordered_selections(state)

    # ── Resume path: apply the retry/skip/abort decision made earlier ──
    pending = state.hotel_prebook_pending
    if pending:
        decision = str(pending.get("decision") or "").strip().lower()
        state = state.model_copy(update={"hotel_prebook_pending": None})
        selections = _apply_prebook_decision(selections, pending, decision)
        if decision in ("abort", "cancel", "stop"):
            state = state.model_copy(update={"hotel_night_selections": selections})
            return _complete_hotel_prebooks(state, selections)

    # ── Sequential pre-book loop (real LiteAPI) ──
    updated: List[HotelNightSelection] = []
    processed: set = set()
    failed:  Optional[HotelNightSelection] = None
    failure_reason = ""

    for sel in selections:
        if sel.prebook_id or sel.prebook_status in ("confirmed", "skipped", "failed"):
            updated.append(sel)
            processed.add(sel.night)
            continue

        try:
            prebook_id = prebook_hotel_room(sel.offer_id)
            sel = sel.model_copy(update={
                "prebook_id":     prebook_id,
                "prebook_status": "confirmed",
                "prebook_error":  None,
            })
        except Exception as exc:
            sel = sel.model_copy(update={
                "prebook_status": "failed",
                "prebook_error":  str(exc),
            })
            failed = sel
            failure_reason = str(exc)
            updated.append(sel)
            processed.add(sel.night)
            break

        updated.append(sel)
        processed.add(sel.night)

    # Preserve any nights the loop did not reach (kept for the retry resume)
    for sel in selections:
        if sel.night not in processed:
            updated.append(sel)

    state = state.model_copy(update={"hotel_night_selections": updated})

    if failed is not None:
        # Commit the successful pre-books now, then hand over to the retry
        # node, which owns the interrupt (interrupting here would roll back
        # everything committed by this node).
        return state.model_copy(update={
            "hotel_night_selections": updated,
            "hotel_prebook_pending":  {
                "night":      failed.night,
                "hotel_name": failed.hotel_name,
                "reason":     failure_reason,
                "decision":   None,   # set by node_hotel_prebook_retry
            },
            "workflow_step": WorkflowStep.HOTEL_PREBOOK_RETRY,
        })

    return _complete_hotel_prebooks(state, updated)


# ===========================================================================
# 14b. HOTEL PREBOOK RETRY — confirm retry/skip/abort for a failed night
# ===========================================================================

def node_hotel_prebook_retry(state: AppState) -> AppState:
    pending = state.hotel_prebook_pending
    if not pending:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_PREBOOK,
        })

    payload = {
        "type": "hotel_prebook_error",
        "night": pending.get("night"),
        "hotel_name": pending.get("hotel_name"),
        "reason": pending.get("reason"),
        "message": (
            f"❌ **Pre-booking failed for Night {pending.get('night')}** — "
            f"**{pending.get('hotel_name')}**.\n\n"
            f"Reason: `{pending.get('reason')}`\n\n"
            "Reply **retry** to try again, **skip** to continue with the "
            "next night, or **abort** to stop pre-booking."
        ),
    }

    choice = interrupt(payload)
    cmd = _parse_choice(choice)

    if cmd in ("retry", "try again", "yes", "y"):
        pending["decision"] = "retry"
    elif cmd in ("skip", "continue", "next", "s"):
        pending["decision"] = "skip"
    else:
        pending["decision"] = "abort"

    return state.model_copy(update={
        "hotel_prebook_pending": pending,
        "workflow_step":         WorkflowStep.HOTEL_PREBOOK,
    })


# ===========================================================================
# Hotel pre-book helpers
# ===========================================================================

def _apply_prebook_decision(
    selections: List[HotelNightSelection],
    pending: Dict[str, Any],
    decision: str,
) -> List[HotelNightSelection]:
    """Apply retry/skip/abort to the night that previously failed."""
    pending_night = int(pending.get("night") or 0)
    updated: List[HotelNightSelection] = []

    for sel in selections:
        if sel.night == pending_night and sel.prebook_status == "failed":
            if decision in ("retry", "try again", "yes"):
                updated.append(sel.model_copy(update={
                    "prebook_status": None,
                    "prebook_error":  None,
                }))
            elif decision in ("skip", "continue", "next"):
                updated.append(sel.model_copy(update={
                    "prebook_status": "skipped",
                }))
            else:
                updated.append(sel.model_copy(update={
                    "prebook_status": "aborted",
                }))
        elif decision in ("abort", "cancel", "stop") and not sel.prebook_id:
            updated.append(sel.model_copy(update={
                "prebook_status": "aborted",
            }))
        else:
            updated.append(sel)

    return updated


def _complete_hotel_prebooks(
    state: AppState,
    selections: List[HotelNightSelection],
) -> AppState:
    """Build the legacy hotel_prebooks map and announce the results."""
    prebooks: Dict[str, HotelPrebook] = {}
    conf_lines: List[str] = []
    failed_lines: List[str] = []

    for sel in selections:
        if sel.prebook_id and sel.prebook_status == "confirmed":
            prebooks[str(sel.night)] = HotelPrebook(
                prebook_id    = sel.prebook_id,
                hotel         = sel.hotel or _selection_fallback_hotel(sel),
                check_in      = sel.check_in,
                check_out     = sel.check_out,
                guests        = state.trip_requirements.num_travelers or 1,
                total_charged = sel.total_price,
                status        = "confirmed",
                day_number    = sel.night,
            )
            conf_lines.append(
                f"- ✅ Night {sel.night}: **{sel.hotel_name}** | "
                f"ID: `{sel.prebook_id}` | ₹{sel.total_price:,.0f}"
            )
        elif sel.prebook_status in ("failed", "skipped", "aborted"):
            failed_lines.append(
                f"- ⚠️ Night {sel.night}: **{sel.hotel_name}** — "
                f"{sel.prebook_status} ({sel.prebook_error or 'no offer selected'})"
            )

    msg_lines = []
    if conf_lines:
        msg_lines.append("✅ **Hotel Pre-booking Results:**\n" + "\n".join(conf_lines))
    if failed_lines:
        msg_lines.append("⚠️ **Not pre-booked:**\n" + "\n".join(failed_lines))
    if not msg_lines:
        msg_lines.append("No hotels were pre-booked.")
    msg_lines.append("\nGenerating your **Final Itinerary** now... 🎉")

    state = state.model_copy(update={"hotel_prebooks": prebooks})
    state = state.add_assistant_message("\n\n".join(msg_lines))
    return state.model_copy(update={
        "workflow_step": WorkflowStep.FINAL_ITINERARY,
    })


def _selection_fallback_hotel(sel: HotelNightSelection) -> Hotel:
    """Minimal Hotel snapshot when the full model was not persisted."""
    return Hotel(
        hotel_id                = sel.hotel_id,
        name                    = sel.hotel_name,
        rating                  = 0.0,
        address                 = "",
        distance_from_center_km = 0.0,
        price_per_night         = sel.price_per_night,
        amenities               = [],
        room_type               = sel.room_type,
        check_in                = sel.check_in,
        check_out               = sel.check_out,
        total_price             = sel.total_price,
        offer_id                = sel.offer_id,
    )


def _skip_night(
    state: AppState,
    night: int,
    total_nights: int,
    reason: str,
) -> AppState:
    """Record a night as skipped (no hotel) and advance the loop."""
    skipped = HotelNightSelection(
        night           = night,
        check_in        = state.hotel_night_segments[night-1].check_in
                          if state.hotel_night_segments else "",
        check_out       = state.hotel_night_segments[night-1].check_out
                          if state.hotel_night_segments else "",
        hotel_id        = "",
        hotel_name      = "No hotel selected",
        room_type       = "",
        offer_id        = "",
        price_per_night = 0.0,
        total_price     = 0.0,
        prebook_status  = "skipped",
        prebook_error   = reason,
    )
    existing = state.hotel_night_selections
    selections = [s for s in existing if s.night != night] + [skipped]
    selections.sort(key=lambda s: s.night)

    state = state.add_assistant_message(
        f"⚠️ Night {night} skipped — {reason}"
    )

    if night < total_nights:
        return state.model_copy(update={
            "hotel_night_selections": selections,
            "hotel_room_offers":      [],
            "selected_night_hotel":   None,
            "current_night":          night + 1,
            "workflow_step":          WorkflowStep.HOTEL_SEARCH,
        })
    return state.model_copy(update={
        "hotel_night_selections": selections,
        "hotel_room_offers":      [],
        "selected_night_hotel":   None,
        "workflow_step":          WorkflowStep.HOTEL_SUMMARY,
    })


def _finish_night_loop(state: AppState, total_nights: int) -> AppState:
    """Cancel path — go to the summary with whatever nights were completed."""
    if state.current_night < total_nights:
        return state.model_copy(update={
            "workflow_step": WorkflowStep.HOTEL_SUMMARY,
        })
    return state.model_copy(update={
        "workflow_step": WorkflowStep.HOTEL_SUMMARY,
    })


def _ordered_selections(state: AppState) -> List[HotelNightSelection]:
    return sorted(state.hotel_night_selections, key=lambda s: s.night)


def _offers_for_hotel(
    results: List[HotelWithOffers],
    hotel_id: str,
) -> List[RoomOffer]:
    for result in results:
        if result.hotel.hotel_id == hotel_id:
            return result.offers
    return []


def _parse_offer_index(choice: Any) -> Optional[int]:
    """Accept plain "2", "option 2", or a dict {"offer_index": 2}."""
    if isinstance(choice, dict):
        for key in ("offer_index", "index", "offer", "room_index"):
            val = choice.get(key)
            if val is not None:
                try:
                    return int(val) - 1
                except (ValueError, TypeError):
                    return None
        return None
    text = str(choice or "").strip().lower()
    text = re.sub(r"^(option|room|offer|no|number)\s*", "", text)
    try:
        return int(text) - 1
    except ValueError:
        return None


def _parse_choice(choice: Any) -> str:
    if isinstance(choice, dict):
        choice = choice.get("choice") or choice.get("response") or ""
    return str(choice or "").strip().lower()


def _fmt_date(iso_date: str) -> str:
    try:
        from datetime import date as _date
        return _date.fromisoformat(iso_date).strftime("%d %b")
    except (ValueError, TypeError):
        return iso_date or ""


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
    WorkflowStep.FLIGHT_PASSENGER_DETAILS: "flight_passenger_details",
    WorkflowStep.FLIGHT_PREBOOK:        "flight_prebook",
    WorkflowStep.FLIGHT_PREBOOKED:      "flight_prebooked",
    WorkflowStep.DRAFT_ITINERARY:       "draft_itinerary",
    WorkflowStep.DRAFT_CONFIRM:         "draft_confirm",
    WorkflowStep.EDIT_TRIP_DETAILS:     "edit_trip_details",
    WorkflowStep.HOTEL_SEARCH:          "hotel_search",
    WorkflowStep.HOTEL_RANKING:         "hotel_ranking",
    WorkflowStep.HOTEL_SELECTION:       "hotel_selection",
    WorkflowStep.HOTEL_ROOM_SELECTION:  "hotel_room_selection",
    WorkflowStep.HOTEL_REUSE_CHECK:     "hotel_reuse_check",
    WorkflowStep.HOTEL_SUMMARY:         "hotel_summary",
    WorkflowStep.HOTEL_PREBOOK:         "hotel_prebook",
    WorkflowStep.HOTEL_PREBOOK_RETRY:   "hotel_prebook_retry",
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


def _format_validation_errors(exc: ValidationError) -> List[str]:
    """Convert a Pydantic ValidationError into a list of readable messages."""
    errors: List[str] = []
    for err in exc.errors():
        loc = ".".join(str(x) for x in err["loc"])
        field = loc or "form"
        errors.append(f"{field}: {err['msg']}")
    return errors
