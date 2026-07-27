"""
Itinerary Agent — Main Orchestrator
=====================================
The brain of the AI Travel Planner.  This agent:
  - Holds the entire conversation with the user
  - Collects and validates trip requirements
  - Decides what workflow step to execute next
  - Builds detailed instructions for Flight Agent and Hotel Agent
  - Generates the draft and final itineraries
  - Enforces the confirmation-before-action rule

The agent is driven by a single LLM (itinerary_agent_model) and exposes one
primary method per workflow stage.  The LangGraph nodes call these methods and
write results back into AppState.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ai_travel_planner.state.models import (
    AgentResponseStatus,
    AppState,
    CabinClass,
    DietaryPreference,
    DraftItinerary,
    FinalItinerary,
    FlightOption,
    FlightSearchParams,
    HotelOption,
    HotelPrebook,
    HotelSearchParams,
    ItineraryActivity,
    ItineraryDay,
    MealPlan,
    PendingAction,
    TripSummary,
    TripType,
    UserPreferences,
    WorkflowStage,
)
from ai_travel_planner.utils.config import get_settings
from ai_travel_planner.utils.logger import get_logger

logger = get_logger("agents.itinerary_agent")


# ─────────────────────────────────────────────────────────────────────────────
# System Prompts
# ─────────────────────────────────────────────────────────────────────────────

_REQUIREMENT_COLLECTION_PROMPT = """\
You are Vero — the AI travel buddy on Itinero — helping plan a trip together.
Think conversational friend, not a multi-agent console. Never mention
supervisors, specialists, routing, or internal systems.

Your job is to collect trip details from the user and extract all information from what they say — including anything they mention voluntarily.

== VOICE ==
- Friendly, curious, concise. Acknowledge what they said in one short line, then ask.
- Ask only for the most critical missing fields — max 2 at a time (never a checklist dump).
- Plain language. No "As an AI…", "Certainly!", corporate filler, or emoji spam.
- Mirror light Hinglish if they use it; otherwise clear English.
- India context when relevant: ₹, cities like Mumbai/Delhi/Bengaluru, practical tips.
- Never invent bookings or confirmations.

== EXTRACTION RULES ==
You will receive:
  - "Already known": fields already collected in previous turns
  - "User said": the user's latest message

From "User said", extract EVERY piece of travel information mentioned, even if you didn't ask for it:
  - origin, destination, dates, number of people, budget, cabin class, interests,
    hotel preferences, hotel board plan, dietary/cuisine preference (veg etc.), trip vibe, etc.

Then produce TWO things:

1. A JSON block (between <EXTRACT> and </EXTRACT>) with ONLY the fields you could confidently extract from this message.
   Use null for fields not mentioned. Use these exact keys:
   {
     "origin": null,
     "destination": null,
     "departure_date": "YYYY-MM-DD or null",
     "return_date": "YYYY-MM-DD or null",
     "trip_type": "one_way or round_trip or null",
     "adults": null,
     "children": null,
     "cabin_class": "Economy or Premium Economy or Business or First or null",
     "max_budget_per_person": null,
     "nonstop_preferred": null,
     "hotel_preference": null,
     "meal_preference": "Room Only or Breakfast Included or Half Board or Full Board or All Inclusive or null",
     "dietary_preference": "veg or non_veg or jain or eggetarian or no_preference or null",
     "trip_vibe": "relaxing or exploring or adventure or mix or null",
     "sightseeing_interests": [],
     "free_cancellation": null
   }

2. A conversational reply to the user that:
   - Acknowledges what you understood from their message (briefly, 1 line).
   - Asks ONLY for the most critical missing required fields — max 2 at a time.
   - Required fields: origin, destination, departure_date, and return_date (if round-trip).
   - Once required fields are known, ask ONE clear question about dietary preference if
     dietary_preference is still unknown: veg / non-veg / Jain / eggetarian / no preference.
     Ask this early — before deep day planning — so food stops match them.
   - Once you have all required fields (and you've asked dietary once if still missing),
     end your reply with the exact token: [READY_TO_SEARCH]
   - Do NOT ask for other optional fields (budget, cabin class, interests) unless all
     required fields are already known.
   - Never ask for something the user already told you.
   - Be warm, concise, and natural. No markdown.

== FORMAT ==
<EXTRACT>
{ ... json ... }
</EXTRACT>
<REPLY>
your conversational message here
</REPLY>

Current date context and known fields will be provided.
"""

_CONFIRMATION_INTERPRETER_PROMPT = """\
You are an intent classifier for a travel planning chatbot.

Classify the user's message as one of:
  - "yes"   → user confirms / agrees / wants to proceed
  - "no"    → user declines / cancels / does not want to proceed
  - "modify" → user wants to change or update something
  - "select" → user is selecting a numbered option (e.g. "option 2", "the second one", "flight 3")
  - "other"  → anything else

Also extract:
  - selection_number: integer if the user selected a numbered item, else null
  - modification_request: string describing what the user wants to change, else null

Respond with valid JSON only. No markdown. No extra text.

Schema:
{
  "intent": "yes" | "no" | "modify" | "select" | "other",
  "selection_number": <int | null>,
  "modification_request": <string | null>,
  "confidence": <float 0-1>
}
"""

_DRAFT_ITINERARY_PROMPT = """\
You are Vero's itinerary planner on Itinero — practical, realistic, traveler-first.

Generate a trip that starts with a concise SUMMARY, then an in-depth day-by-day plan.

Inputs you may receive:
  - Origin, destination, travel dates, outbound arrival / return departure times
  - Number of travel days, user interests, trip vibe
  - dietary_preference: veg | non_veg | jain | eggetarian | no_preference
  - Budget ballpark if known

== OUTPUT STRUCTURE (required) ==
1) summary — trip overview BEFORE deep days
2) days — each day with morning / afternoon / evening + timed activities

== SUMMARY RULES ==
- cities, dates, nights, vibe
- budget_ballpark if known (else null) — label as estimate, never invent fake totals
- dietary_preference echoed clearly
- hotels: leave empty or "TBD — hotels next" (hotels are added later)
- transport_style: flights + realistic local (cab / metro / auto / walk for India cities)
- highlights: 3–5 bullets of the trip's best bits

== DAY RULES ==
- Day 1: arrival — airport transfer, light hotel-area explore, early dinner. No overpacking.
- Last day: checkout + airport transfer; morning only if departure is late.
- Middle days: full but paced — leave buffers; don't stack more than ~4–5 main stops.
- Meal times: breakfast ~08:00, lunch ~13:00, dinner ~20:00, optional evening snack ~17:00.
- For EVERY day include meal activities matching dietary_preference + local specialties
  (e.g. Surat: locho, undhiyu, Gujarati thali — veg-friendly when pref is veg/Jain).
  Prefer real-sounding local dish + area guidance ("locho near Station Road") rather than
  inventing fake restaurant brand names or booking IDs. If unsure of a specific place name,
  say the dish + neighborhood and note "confirm on Maps".
- Between stops: set travel_mode (cab|rideshare|metro|auto|walk) and travel_minutes
  realistic for the city (Surat/Ahmedabad-style: auto/cab/walk; metros only where they exist).
- practical_tips: best time to visit, tickets/bookings needed, temple dress code if relevant.
- DO NOT invent hotel names, flight numbers, booking IDs, or confirmation codes.
- Activity descriptions should read naturally.

Respond with valid JSON only. No markdown.

Schema:
{
  "trip_title": "<string>",
  "summary": {
    "cities": "<origin → destination or multi-city>",
    "dates": "<readable date range>",
    "nights": <int>,
    "vibe": "<string or null>",
    "budget_ballpark": "<string or null>",
    "dietary_preference": "<veg|non_veg|jain|eggetarian|no_preference|null>",
    "hotels": [],
    "transport_style": "<flights + local modes>",
    "highlights": ["...", "...", "..."]
  },
  "days": [
    {
      "day_number": <int>,
      "date": "YYYY-MM-DD",
      "title": "<day theme>",
      "morning": "<short narrative block>",
      "afternoon": "<short narrative block>",
      "evening": "<short narrative block>",
      "food_suggestions": ["Breakfast: ...", "Lunch: ...", "Dinner: ..."],
      "transport_notes": "<how the day moves around>",
      "practical_tips": "<bookings, dress, timing>",
      "hotel_name": null,
      "activities": [
        {
          "time": "HH:MM",
          "description": "<activity description>",
          "category": "transport|flight|check-in|check-out|meal|sightseeing|leisure",
          "duration_minutes": <int>,
          "location": "<place or area>",
          "notes": "<optional tip>",
          "travel_mode": "cab|rideshare|metro|auto|walk|null",
          "travel_minutes": <int or null>
        }
      ],
      "notes": "<optional day notes>"
    }
  ],
  "notes": "<overall trip notes>"
}
"""

_FINAL_ITINERARY_PROMPT = """\
You are Vero's itinerary finalizer on Itinero — polish the plan so it feels ready to travel.

Merge the draft itinerary with hotel check-in/check-out information and
produce a complete plan: SUMMARY first, then in-depth day-by-day.

Rules:
  - Keep / refresh the summary: cities, dates, nights, vibe, dietary_preference,
    budget_ballpark if known, transport_style, 3–5 highlights.
  - Put real hotel names into summary.hotels as
    "Hotel Name (check-in HH:MM / check-out HH:MM)" — use prebook data; never invent IDs.
  - Add hotel check-in on Day 1 (after airport transfer) at hotel check-in time.
  - Add hotel check-out on the last day before airport transfer.
  - Multi-hotel: check-out old / check-in new on transition days.
  - Each day: hotel_name for that night; morning / afternoon / evening blocks;
    food_suggestions matching dietary preference + local specialties;
    transport_notes with cab/metro/auto/walk and rough times;
    practical_tips (timing, tickets, temple dress if relevant).
  - Keep sightseeing; ensure times don't overlap; keep buffers — don't overpack.
  - Never invent booking confirmations or PNRs. Recommendations only for restaurants.

Respond with valid JSON only. No markdown.

Use the same schema as the draft itinerary JSON, plus:
  - "hotel_name" and "hotel_prebook_id" on each day (from real prebooks only)
  - Updated summary.hotels and activities with check-in/check-out events
"""


# ─────────────────────────────────────────────────────────────────────────────
# ItineraryAgent class
# ─────────────────────────────────────────────────────────────────────────────


class ItineraryAgent:
    """
    The main orchestrator agent.

    Responsibilities:
      - User conversation (requirement collection, confirmations, summaries)
      - Building detailed instructions for Flight Agent and Hotel Agent
      - Generating draft and final itineraries via LLM
      - All state mutation decisions (what happens next)

    This class contains NO flight or hotel business logic — it only delegates.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._llm = ChatOpenAI(
            model=settings.itinerary_agent_model,
            temperature=settings.itinerary_agent_temperature,
            api_key=settings.openai_api_key,
        )
        logger.info(
            "ItineraryAgent initialised with model=%s", settings.itinerary_agent_model
        )

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Requirement Collection
    # ──────────────────────────────────────────────────────────────────────────

    def collect_requirements(self, state: AppState) -> AppState:
        """
        Continue the requirement-collection conversation.

        Single LLM call: the prompt returns both a structured <EXTRACT> JSON block
        (all fields the user mentioned) and a <REPLY> conversational message.
        This replaces the old two-call pattern (converse + separate extraction pass).
        """
        logger.info("ItineraryAgent.collect_requirements")

        known = self._known_params_summary(state)
        today = date.today().isoformat()

        user_msg = (
            f"Today's date: {today}\n\n"
            f"Already known:\n{known}\n\n"
            f"User said: \"{state.last_user_input}\""
        )

        raw = self._call_llm(_REQUIREMENT_COLLECTION_PROMPT, user_msg)

        # ── Parse <EXTRACT> block ─────────────────────────────────────────────
        extracted: dict[str, Any] = {}
        if "<EXTRACT>" in raw and "</EXTRACT>" in raw:
            try:
                json_str = raw.split("<EXTRACT>")[1].split("</EXTRACT>")[0].strip()
                extracted = json.loads(json_str)
            except (json.JSONDecodeError, IndexError) as exc:
                logger.warning("EXTRACT parse failed: %s", exc)

        # ── Parse <REPLY> block ───────────────────────────────────────────────
        clean_reply = ""
        if "<REPLY>" in raw and "</REPLY>" in raw:
            clean_reply = raw.split("<REPLY>")[1].split("</REPLY>")[0].strip()
        else:
            # Fallback: strip tags and use whatever text remains
            clean_reply = raw.replace("<EXTRACT>", "").replace("</EXTRACT>", "")
            if "<REPLY>" in clean_reply:
                clean_reply = clean_reply.split("<REPLY>", 1)[-1]
            # Remove the JSON blob if it leaked into the reply
            import re as _re
            clean_reply = _re.sub(r"\{[^}]+\}", "", clean_reply).strip()

        # ── Apply extracted fields to state ───────────────────────────────────
        if extracted:
            state = self._apply_extracted(state, extracted)

        # ── Check ready signal ────────────────────────────────────────────────
        ready = "[READY_TO_SEARCH]" in clean_reply
        clean_reply = clean_reply.replace("[READY_TO_SEARCH]", "").strip()

        if ready:
            state.set_stage(WorkflowStage.FLIGHT_SEARCH_CONFIRMATION)
            state.set_pending_action(PendingAction.SEARCH_FLIGHTS)
            clean_reply = (
                clean_reply
                + f"\n\nHere's what I have:\n{self._trip_summary(state)}\n\n"
                "Shall I search for the best available flights now?"
            )

        state.add_assistant_message(clean_reply)
        return state

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Intent / Confirmation Interpretation
    # ──────────────────────────────────────────────────────────────────────────

    def interpret_user_intent(self, user_message: str) -> dict[str, Any]:
        """
        Classify user intent: yes / no / modify / select / other.
        Returns a dict with keys: intent, selection_number, modification_request, confidence.
        """
        logger.debug("ItineraryAgent.interpret_user_intent: %s", user_message[:80])
        raw = self._call_llm(_CONFIRMATION_INTERPRETER_PROMPT, user_message)
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback heuristics
            low = user_message.lower().strip()
            if any(w in low for w in ["yes", "sure", "ok", "proceed", "go ahead", "confirm", "yeah", "yep"]):
                result = {"intent": "yes", "selection_number": None, "modification_request": None, "confidence": 0.9}
            elif any(w in low for w in ["no", "cancel", "stop", "don't", "nope"]):
                result = {"intent": "no", "selection_number": None, "modification_request": None, "confidence": 0.9}
            else:
                # Check for digit selection
                import re
                m = re.search(r'\b([1-9])\b', low)
                if m:
                    result = {"intent": "select", "selection_number": int(m.group(1)), "modification_request": None, "confidence": 0.7}
                else:
                    result = {"intent": "other", "selection_number": None, "modification_request": None, "confidence": 0.5}
        return result

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Flight Instruction Builder
    # ──────────────────────────────────────────────────────────────────────────

    def build_flight_search_instruction(self, state: AppState) -> str:
        """Build a rich natural-language instruction for the Flight Agent."""
        p = state.trip.search_params
        pref = state.preferences

        budget_str = f"Maximum budget ₹{p.max_budget_per_person:,.0f} per passenger." if p.max_budget_per_person else ""
        nonstop_str = "Prefer nonstop flights." if p.nonstop_preferred else "Nonstop preferred but one stop acceptable."
        airlines_str = f"Preferred airlines: {', '.join(p.preferred_airlines)}." if p.preferred_airlines else ""

        instruction = (
            f"Search flights from {p.origin} to {p.destination} "
            f"for {p.adults} adult(s) and {p.children} child(ren) "
            f"departing on {p.departure_date}. "
            f"Trip type: {p.trip_type.value}. "
            f"Cabin class: {p.cabin_class.value}. "
            f"{budget_str} "
            f"{nonstop_str} "
            f"{airlines_str} "
            "Baggage included preferred. "
            "Return the 5 best options ranked by value (price, duration, stops). "
            "Provide a clear recommendation with reason."
        )

        if p.trip_type == TripType.ROUND_TRIP and p.return_date:
            instruction += (
                f" Also search return flights from {p.destination} to {p.origin} "
                f"on {p.return_date}."
            )

        return instruction.strip()

    def build_flight_prebook_instruction(self, state: AppState) -> str:
        """Build a pre-booking instruction for the Flight Agent."""
        flight = state.flights.selected_flight
        p = state.trip.search_params
        if not flight:
            return "Pre-book the previously selected flight."
        return (
            f"Pre-book flight {flight.airline} {flight.flight_number} "
            f"({flight.origin} → {flight.destination}, "
            f"departing {flight.departure_time.strftime('%d %b %Y %H:%M')}) "
            f"for {p.adults} adult(s) and {p.children} child(ren). "
            f"Cabin: {flight.cabin_class.value}. "
            f"Total price: ₹{flight.total_price:,.0f}."
        )

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Hotel Instruction Builder
    # ──────────────────────────────────────────────────────────────────────────

    def build_hotel_search_instructions(self, state: AppState) -> list[dict[str, Any]]:
        """
        Build a list of per-day hotel search instructions based on the draft itinerary.
        Returns a list of dicts: {day_label, instruction, search_params}
        """
        draft = state.itinerary.draft
        if not draft:
            return []

        pref = state.preferences
        p = state.trip.search_params
        instructions = []

        # Group consecutive days by area/hotel zone from the draft
        day_groups = self._group_days_by_area(draft.days)

        for group in day_groups:
            day_label = group["day_label"]
            area = group["area"]
            check_in = group["check_in"]
            check_out = group["check_out"]
            nights = (check_out - check_in).days

            budget_str = (
                f"Budget ₹{p.max_budget_per_person:,.0f} per night per room."
                if p.max_budget_per_person
                else "No strict budget."
            )
            meal_str = pref.meal_preference.value if pref.meal_preference else "Breakfast Included"
            amenities_str = (
                f"Required amenities: {', '.join(pref.amenities_wanted)}."
                if pref.amenities_wanted
                else ""
            )
            cancel_str = "Free cancellation required." if pref.free_cancellation else ""

            instruction = (
                f"Search hotels in {area}, {p.destination} "
                f"for {nights} night(s) "
                f"(check-in {check_in}, check-out {check_out}). "
                f"Guests: {p.adults} adult(s), {p.children} child(ren). "
                f"Minimum 4-star rating. "
                f"Meal plan: {meal_str}. "
                f"{budget_str} "
                f"{amenities_str} "
                f"{cancel_str} "
                "Return the 5 best options ranked by value."
            )

            search_params = HotelSearchParams(
                location=f"{area}, {p.destination}",
                check_in=check_in,
                check_out=check_out,
                adults=p.adults,
                children=p.children,
                max_budget_per_night=p.max_budget_per_person,
                min_star_rating=4.0,
                meal_plan=pref.meal_preference,
                free_cancellation=pref.free_cancellation,
                amenities_required=pref.amenities_wanted,
            )

            instructions.append({
                "day_label": day_label,
                "instruction": instruction.strip(),
                "search_params": search_params,
                "check_in": check_in,
                "check_out": check_out,
            })

        return instructions

    def build_hotel_prebook_instruction(
        self, hotel: HotelOption, check_in: date, check_out: date, day_label: str
    ) -> str:
        """Build a pre-booking instruction for a single hotel."""
        nights = max((check_out - check_in).days, 1)
        return (
            f"Pre-book {hotel.name} ({hotel.star_rating}★) in {hotel.area} "
            f"for {nights} night(s), check-in {check_in}, check-out {check_out}. "
            f"Room: {hotel.room_type}. Meal plan: {hotel.meal_plan.value}. "
            f"Total: ₹{hotel.price_per_night * nights:,.0f}. "
            f"This is for {day_label} of the itinerary."
        )

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Draft Itinerary Generation
    # ──────────────────────────────────────────────────────────────────────────

    def generate_draft_itinerary(self, state: AppState) -> AppState:
        """Generate the draft itinerary after flight pre-booking."""
        logger.info("ItineraryAgent.generate_draft_itinerary")

        p = state.trip.search_params
        flight = state.flights.selected_flight
        prebook = state.flights.prebook
        pref = state.preferences

        arrival_time = flight.arrival_time.strftime("%H:%M") if flight else "morning"
        return_date = p.return_date.isoformat() if p.return_date else "N/A"
        total_days = (
            (p.return_date - p.departure_date).days + 1
            if p.return_date
            else 3
        )

        interests_str = (
            f"User interests: {', '.join(pref.sightseeing_interests)}."
            if pref.sightseeing_interests
            else ""
        )
        dietary = pref.dietary_preference.value if pref.dietary_preference else "no_preference"
        vibe = pref.trip_vibe or "not specified"
        budget = (
            f"₹{p.max_budget_per_person:,.0f}/person"
            if p.max_budget_per_person
            else "not specified"
        )

        context = (
            f"Trip: {p.origin} → {p.destination}\n"
            f"Departure date: {p.departure_date}\n"
            f"Return date: {return_date}\n"
            f"Total days: {total_days}\n"
            f"Outbound flight arrival time: {arrival_time}\n"
            f"Adults: {p.adults}, Children: {p.children}\n"
            f"dietary_preference: {dietary}\n"
            f"trip_vibe: {vibe}\n"
            f"budget_ballpark: {budget}\n"
            f"{interests_str}\n"
            "Generate SUMMARY first, then day-by-day. "
            "Weave meal stops matching dietary_preference and local specialties. "
            "Include travel_mode between stops. Do NOT invent hotel names — hotels come next."
        )

        raw = self._call_llm(_DRAFT_ITINERARY_PROMPT, context)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("Draft itinerary JSON parse error: %s", exc)
            state.error_message = "Failed to generate draft itinerary."
            state.set_stage(WorkflowStage.ERROR)
            return state

        days = self._parse_itinerary_days(data.get("days", []), p.departure_date)
        summary = self._parse_trip_summary(
            data.get("summary"),
            origin=p.origin or "",
            destination=p.destination or "",
            departure_date=p.departure_date,
            return_date=p.return_date,
            total_days=total_days,
            dietary=dietary,
            vibe=pref.trip_vibe,
            budget=budget if p.max_budget_per_person else None,
        )

        draft = DraftItinerary(
            trip_title=data.get("trip_title", f"{p.origin} to {p.destination}"),
            origin=p.origin or "",
            destination=p.destination or "",
            departure_date=p.departure_date or date.today(),
            return_date=p.return_date,
            total_days=total_days,
            days=days,
            summary=summary,
            notes=data.get("notes", ""),
        )

        state.itinerary.draft = draft
        state.set_stage(WorkflowStage.DRAFT_ITINERARY_REVIEW)
        state.set_pending_action(PendingAction.APPROVE_DRAFT_ITINERARY)

        reply = self._format_draft_itinerary_message(draft)
        state.add_assistant_message(reply)
        return state

    # ──────────────────────────────────────────────────────────────────────────
    # 6. Final Itinerary Generation
    # ──────────────────────────────────────────────────────────────────────────

    def generate_final_itinerary(self, state: AppState) -> AppState:
        """Merge flight + hotel prebooks into the final day-by-day itinerary."""
        logger.info("ItineraryAgent.generate_final_itinerary")

        draft = state.itinerary.draft
        p = state.trip.search_params
        flight = state.flights.selected_flight
        prebooks = state.hotels.prebooks

        hotel_summary = "\n".join(
            f"  {label}: {pb.hotel.name} ({pb.hotel.area}), "
            f"check-in {pb.check_in}, check-out {pb.check_out}, "
            f"prebook_id {pb.prebook_id}"
            for label, pb in prebooks.items()
        )

        draft_json = json.dumps(
            {
                "summary": draft.summary.model_dump(mode="json") if draft and draft.summary else None,
                "days": [d.model_dump(mode="json") for d in (draft.days if draft else [])],
            },
            default=str,
        )
        dietary = (
            state.preferences.dietary_preference.value
            if state.preferences.dietary_preference
            else "no_preference"
        )

        context = (
            f"Draft itinerary:\n{draft_json}\n\n"
            f"Hotel pre-bookings:\n{hotel_summary}\n\n"
            f"Outbound flight: {flight.airline if flight else 'N/A'} "
            f"{flight.flight_number if flight else ''} "
            f"arriving {flight.arrival_time.strftime('%H:%M') if flight else 'N/A'}\n"
            f"dietary_preference: {dietary}\n"
            "Merge hotels into SUMMARY + day-by-day. Add check-in / check-out. "
            "Keep food matching dietary preference. Keep all sightseeing. "
            "Never invent booking IDs."
        )

        raw = self._call_llm(_FINAL_ITINERARY_PROMPT, context)

        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("Final itinerary JSON parse error: %s", exc)
            # Fall back to draft-based final itinerary
            data = {
                "summary": draft.summary.model_dump(mode="json") if draft and draft.summary else None,
                "days": [d.model_dump(mode="json") for d in (draft.days if draft else [])],
            }

        days = self._parse_itinerary_days(
            data.get("days", []),
            p.departure_date,
            prebooks=prebooks,
        )

        hotel_lines = [
            f"{pb.hotel.name} (check-in {pb.check_in}, check-out {pb.check_out})"
            for pb in prebooks.values()
        ]
        summary = self._parse_trip_summary(
            data.get("summary"),
            origin=p.origin or "",
            destination=p.destination or "",
            departure_date=p.departure_date,
            return_date=p.return_date,
            total_days=len(days) or (draft.total_days if draft else 0),
            dietary=dietary,
            vibe=state.preferences.trip_vibe,
            hotels=hotel_lines,
        )

        total_hotel_cost = sum(pb.total_price for pb in prebooks.values())
        flight_prebook = state.flights.prebook

        final = FinalItinerary(
            trip_title=draft.trip_title if draft else f"Trip to {p.destination}",
            origin=p.origin or "",
            destination=p.destination or "",
            departure_date=p.departure_date or date.today(),
            return_date=p.return_date,
            outbound_flight=flight,
            flight_prebook_id=flight_prebook.prebook_id if flight_prebook else None,
            hotel_prebook_ids=[pb.prebook_id for pb in prebooks.values()],
            hotel_names=[pb.hotel.name for pb in prebooks.values()],
            total_days=len(days),
            days=days,
            summary=summary,
            total_flight_cost=flight_prebook.total_price if flight_prebook else 0.0,
            total_hotel_cost=total_hotel_cost,
            grand_total=(flight_prebook.total_price if flight_prebook else 0.0) + total_hotel_cost,
        )

        state.itinerary.final = final
        state.set_stage(WorkflowStage.COMPLETED)

        reply = self._format_final_itinerary_message(final)
        state.add_assistant_message(reply)
        return state

    # ──────────────────────────────────────────────────────────────────────────
    # 7. Display Formatters
    # ──────────────────────────────────────────────────────────────────────────

    def format_flight_results_message(self, state: AppState) -> str:
        """Return a formatted string listing all flight options for the user."""
        flights = state.flights.search_results
        if not flights:
            return "I couldn't find any flights matching your criteria. Would you like to adjust the search?"

        lines = ["Here are the best available flights I found:\n"]
        for i, f in enumerate(flights, 1):
            rec = " ⭐ Recommended" if f.recommended else ""
            stops = "Nonstop" if f.stops == 0 else f"{f.stops} stop(s) via {', '.join(f.stopover_cities)}"
            lines.append(
                f"  {i}. {f.airline} {f.flight_number}{rec}\n"
                f"     {f.origin} → {f.destination} | "
                f"{f.departure_time.strftime('%d %b, %H:%M')} → {f.arrival_time.strftime('%H:%M')} | "
                f"{f.duration_display} | {stops}\n"
                f"     {f.cabin_class.value} | ₹{f.price_per_adult:,.0f}/adult | "
                f"{f.baggage_included} | {f.refund_policy} | {f.seats_available} seats left\n"
            )

        recommended = state.flights.recommended_flight
        if recommended:
            lines.append(
                f"\n💡 My recommendation: Option {next((i for i,f in enumerate(flights,1) if f.flight_id == recommended.flight_id), 1)} "
                f"— {recommended.airline} {recommended.flight_number} "
                f"(best value for price and duration)."
            )

        lines.append("\nWhich flight would you like to select? (Enter the option number)")
        return "\n".join(lines)

    def format_flight_selected_message(self, state: AppState) -> str:
        """Summarise the user's selected flight and ask for pre-book confirmation."""
        f = state.flights.selected_flight
        if not f:
            return "No flight selected."
        p = state.trip.search_params
        adults = p.adults
        children = p.children
        total = f.price_per_adult * adults + (f.price_per_child or 0) * children
        stops = "Nonstop" if f.stops == 0 else f"{f.stops} stop(s)"

        return (
            f"Great choice! Here's a summary of your selected flight:\n\n"
            f"  ✈  {f.airline} {f.flight_number}\n"
            f"  Route: {f.origin} → {f.destination}\n"
            f"  Departure: {f.departure_time.strftime('%d %b %Y, %H:%M')}\n"
            f"  Arrival: {f.arrival_time.strftime('%d %b %Y, %H:%M')}\n"
            f"  Duration: {f.duration_display} | {stops}\n"
            f"  Class: {f.cabin_class.value}\n"
            f"  Baggage: {f.baggage_included}\n"
            f"  Refund: {f.refund_policy}\n"
            f"  Price: ₹{f.price_per_adult:,.0f}/adult × {adults} = ₹{total:,.0f} total\n\n"
            "Would you like me to pre-book this flight? (yes / no)"
        )

    def format_flight_prebook_message(self, state: AppState) -> str:
        """Confirm successful flight pre-booking."""
        pb = state.flights.prebook
        if not pb:
            return "Flight pre-booking failed."
        return (
            f"✅ Flight pre-booked successfully!\n\n"
            f"  Prebook ID: {pb.prebook_id}\n"
            f"  Flight: {pb.flight.airline} {pb.flight.flight_number}\n"
            f"  Route: {pb.flight.origin} → {pb.flight.destination}\n"
            f"  Departure: {pb.flight.departure_time.strftime('%d %b %Y, %H:%M')}\n"
            f"  Total Price: ₹{pb.total_price:,.0f}\n"
            f"  Status: {pb.booking_status}\n"
            f"  Hold Expires: {pb.booking_expiry.strftime('%d %b %Y, %H:%M')}\n\n"
            "Now let me create a draft itinerary for your trip..."
        )

    def format_hotel_results_message(
        self, hotels: list[HotelOption], day_label: str
    ) -> str:
        """Format hotel search results for a specific day."""
        if not hotels:
            return f"No hotels found for {day_label}. Would you like to adjust the filters?"

        lines = [f"Here are the best hotels for {day_label}:\n"]
        for i, h in enumerate(hotels, 1):
            stars = "★" * int(h.star_rating) + ("½" if h.star_rating % 1 else "")
            rec = " ⭐ Recommended" if h.recommended else ""
            amenities_preview = ", ".join(h.amenities[:4])
            lines.append(
                f"  {i}. {h.name} {stars}{rec}\n"
                f"     {h.area} | {h.distance_from_center_km:.1f} km from center\n"
                f"     {h.room_type} | {h.meal_plan.value} | ₹{h.price_per_night:,.0f}/night\n"
                f"     {h.cancellation_policy}\n"
                f"     Amenities: {amenities_preview}\n"
            )

        recommended = next((h for h in hotels if h.recommended), None)
        if recommended:
            lines.append(
                f"\n💡 My recommendation: Option {next((i for i,h in enumerate(hotels,1) if h.hotel_id == recommended.hotel_id), 1)} "
                f"— {recommended.name} (best value for location and amenities)."
            )

        lines.append(f"\nWhich hotel would you like for {day_label}? (Enter the option number)")
        return "\n".join(lines)

    def format_hotel_prebook_summary_message(self, state: AppState) -> str:
        """Show all selected hotels and ask for bulk pre-book confirmation."""
        selected = state.hotels.selected_hotels
        if not selected:
            return "No hotels selected yet."

        lines = ["Here's a summary of all selected hotels:\n"]
        total = 0.0
        for day_label, hotel in selected.items():
            draft = state.itinerary.draft
            nights = 1
            if draft:
                for group in self._group_days_by_area(draft.days):
                    if group["day_label"] == day_label:
                        nights = max((group["check_out"] - group["check_in"]).days, 1)
                        break
            cost = hotel.price_per_night * nights
            total += cost
            stars = "★" * int(hotel.star_rating)
            lines.append(
                f"  {day_label}: {hotel.name} {stars}\n"
                f"    {hotel.area} | {hotel.room_type} | {hotel.meal_plan.value}\n"
                f"    ₹{hotel.price_per_night:,.0f}/night × {nights} night(s) = ₹{cost:,.0f}\n"
                f"    {hotel.cancellation_policy}\n"
            )

        lines.append(f"\n  Total Hotel Cost: ₹{total:,.0f}")
        lines.append(
            "\nWould you like me to pre-book all these hotels? (yes / no)"
        )
        return "\n".join(lines)

    def format_hotel_prebooks_done_message(self, state: AppState) -> str:
        """Confirm all hotel pre-bookings and prompt final itinerary generation."""
        prebooks = state.hotels.prebooks
        lines = ["✅ All hotels pre-booked successfully!\n"]
        for label, pb in prebooks.items():
            lines.append(
                f"  {label}: {pb.hotel.name}\n"
                f"    Prebook ID: {pb.prebook_id}\n"
                f"    {pb.check_in} → {pb.check_out} | ₹{pb.total_price:,.0f}\n"
                f"    Status: {pb.booking_status}\n"
            )
        lines.append("\nGenerating your complete final itinerary now... 🗺️")
        return "\n".join(lines)

    # ──────────────────────────────────────────────────────────────────────────
    # 8. Private Helpers
    # ──────────────────────────────────────────────────────────────────────────

    def _call_llm(self, system_prompt: str, user_message: str) -> str:
        """Invoke the LLM and return stripped text content."""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ]
        try:
            response = self._llm.invoke(messages)
            content = str(response.content).strip()
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            return content.strip()
        except Exception as exc:
            logger.error("ItineraryAgent LLM call failed: %s", exc)
            raise

    def _known_params_summary(self, state: AppState) -> str:
        """Build a human-readable summary of what trip parameters we already know."""
        p = state.trip.search_params
        pref = state.preferences
        parts = []
        if p.origin:
            parts.append(f"Origin: {p.origin}")
        if p.destination:
            parts.append(f"Destination: {p.destination}")
        if p.departure_date:
            parts.append(f"Departure: {p.departure_date}")
        if p.return_date:
            parts.append(f"Return: {p.return_date}")
        if p.adults != 1 or p.children:
            parts.append(f"Passengers: {p.adults} adult(s), {p.children} child(ren)")
        if p.cabin_class != CabinClass.ECONOMY:
            parts.append(f"Cabin: {p.cabin_class.value}")
        if p.max_budget_per_person:
            parts.append(f"Budget: ₹{p.max_budget_per_person:,.0f}/person")
        if pref.meal_preference != MealPlan.BREAKFAST:
            parts.append(f"Hotel board: {pref.meal_preference.value}")
        if pref.dietary_preference != DietaryPreference.NO_PREFERENCE:
            parts.append(f"Dietary: {pref.dietary_preference.value}")
        if pref.trip_vibe:
            parts.append(f"Vibe: {pref.trip_vibe}")
        if pref.hotel_preference:
            parts.append(f"Hotel area: {pref.hotel_preference}")
        return "\n".join(f"  - {p}" for p in parts) if parts else "  (nothing collected yet)"

    def _trip_summary(self, state: AppState) -> str:
        """One-paragraph trip summary shown before asking flight search confirmation."""
        p = state.trip.search_params
        return (
            f"  📍 {p.origin} → {p.destination}\n"
            f"  📅 {p.departure_date}"
            + (f" → {p.return_date}" if p.return_date else "") + "\n"
            f"  👤 {p.adults} adult(s), {p.children} child(ren)\n"
            f"  💺 {p.cabin_class.value}"
            + (f" | Budget ₹{p.max_budget_per_person:,.0f}/person" if p.max_budget_per_person else "")
        )

    def _apply_extracted(self, state: AppState, data: dict[str, Any]) -> AppState:
        """
        Apply a dict of extracted travel fields (from the <EXTRACT> block) directly
        onto state.trip.search_params and state.preferences.
        Silently ignores null / missing values.
        """
        p = state.trip.search_params
        pref = state.preferences

        if data.get("origin"):
            p.origin = data["origin"]
        if data.get("destination"):
            p.destination = data["destination"]
        if data.get("departure_date"):
            try:
                p.departure_date = date.fromisoformat(str(data["departure_date"]))
            except (ValueError, TypeError):
                pass
        if data.get("return_date"):
            try:
                p.return_date = date.fromisoformat(str(data["return_date"]))
            except (ValueError, TypeError):
                pass
        if data.get("adults") is not None:
            try:
                p.adults = max(1, int(data["adults"]))
            except (ValueError, TypeError):
                pass
        if data.get("children") is not None:
            try:
                p.children = max(0, int(data["children"]))
            except (ValueError, TypeError):
                pass
        if data.get("cabin_class"):
            try:
                p.cabin_class = CabinClass(data["cabin_class"])
            except ValueError:
                pass
        if data.get("max_budget_per_person") is not None:
            try:
                p.max_budget_per_person = float(data["max_budget_per_person"])
            except (ValueError, TypeError):
                pass
        if data.get("nonstop_preferred") is not None:
            p.nonstop_preferred = bool(data["nonstop_preferred"])
        if data.get("trip_type"):
            try:
                p.trip_type = TripType(data["trip_type"])
                state.trip.trip_type = p.trip_type
            except ValueError:
                pass
        if data.get("hotel_preference"):
            pref.hotel_preference = data["hotel_preference"]
        if data.get("meal_preference"):
            try:
                pref.meal_preference = MealPlan(data["meal_preference"])
            except ValueError:
                pass
        if data.get("dietary_preference"):
            raw_diet = str(data["dietary_preference"]).strip().lower().replace("-", "_").replace(" ", "_")
            aliases = {
                "vegetarian": "veg",
                "veggie": "veg",
                "nonveg": "non_veg",
                "nonvegetarian": "non_veg",
                "egg": "eggetarian",
                "none": "no_preference",
                "any": "no_preference",
                "no_pref": "no_preference",
            }
            raw_diet = aliases.get(raw_diet, raw_diet)
            try:
                pref.dietary_preference = DietaryPreference(raw_diet)
            except ValueError:
                pass
        if data.get("trip_vibe"):
            pref.trip_vibe = str(data["trip_vibe"]).strip()
        if data.get("sightseeing_interests"):
            pref.sightseeing_interests = list(data["sightseeing_interests"])
        if data.get("free_cancellation") is not None:
            pref.free_cancellation = bool(data["free_cancellation"])

        state.trip.search_params = p
        state.preferences = pref
        return state

    def _extract_params_from_conversation(self, state: AppState) -> AppState:
        """
        Deprecated — kept for backward-compatibility only.
        collect_requirements() now extracts params inline via _apply_extracted().
        """
        return state

    @staticmethod
    def _group_days_by_area(days: list[ItineraryDay]) -> list[dict[str, Any]]:
        """
        Group consecutive itinerary days by area/hotel zone.
        Returns list of {day_label, area, check_in, check_out}.
        Simple heuristic: one hotel group per 2-3 days, shifting area based on
        day title keywords (beach, city, hill, etc.).
        """
        if not days:
            return []

        area_keywords = {
            "beach": "Beach Area",
            "city": "City Center",
            "hill": "Hill Station",
            "airport": "Airport Area",
            "heritage": "Heritage District",
            "market": "Market Area",
            "resort": "Resort Area",
        }

        groups: list[dict[str, Any]] = []
        current_area: str | None = None
        group_start_idx = 0

        def detect_area(title: str) -> str:
            title_lower = title.lower()
            for kw, area in area_keywords.items():
                if kw in title_lower:
                    return area
            return "City Center"

        for i, day in enumerate(days):
            area = detect_area(day.title)
            if current_area is None:
                current_area = area
                group_start_idx = i
            elif area != current_area or (i - group_start_idx) >= 3:
                # Close current group
                groups.append({
                    "day_label": f"Day {days[group_start_idx].day_number}–{days[i - 1].day_number}"
                    if i - 1 > group_start_idx
                    else f"Day {days[group_start_idx].day_number}",
                    "area": current_area,
                    "check_in": days[group_start_idx].date,
                    "check_out": days[i].date,
                })
                current_area = area
                group_start_idx = i

        # Close the last group (leave last day for checkout)
        last_i = len(days) - 1
        checkout_day = days[last_i].date
        groups.append({
            "day_label": f"Day {days[group_start_idx].day_number}–{days[last_i].day_number}"
            if last_i > group_start_idx
            else f"Day {days[group_start_idx].day_number}",
            "area": current_area or "City Center",
            "check_in": days[group_start_idx].date,
            "check_out": checkout_day,
        })

        return groups

    @staticmethod
    def _parse_itinerary_days(
        raw_days: list[dict[str, Any]],
        base_date: date | None,
        prebooks: dict[str, HotelPrebook] | None = None,
    ) -> list[ItineraryDay]:
        """Parse raw LLM day objects into ItineraryDay models."""
        parsed: list[ItineraryDay] = []
        base = base_date or date.today()
        prebooks = prebooks or {}

        for raw in raw_days:
            day_num = raw.get("day_number", len(parsed) + 1)

            # Resolve date
            raw_date = raw.get("date")
            if raw_date:
                try:
                    day_date = date.fromisoformat(str(raw_date))
                except ValueError:
                    day_date = base + timedelta(days=day_num - 1)
            else:
                day_date = base + timedelta(days=day_num - 1)

            # Parse activities
            activities: list[ItineraryActivity] = []
            for raw_act in raw.get("activities", []):
                try:
                    # Tolerate extra keys from LLM
                    allowed = {
                        "time",
                        "description",
                        "category",
                        "duration_minutes",
                        "location",
                        "notes",
                        "travel_mode",
                        "travel_minutes",
                    }
                    cleaned = {k: v for k, v in raw_act.items() if k in allowed}
                    if "time" in cleaned and "description" in cleaned:
                        activities.append(ItineraryActivity(**cleaned))
                except Exception:
                    pass

            # Resolve hotel info from prebooks
            hotel_name: str | None = raw.get("hotel_name")
            hotel_prebook_id: str | None = raw.get("hotel_prebook_id")
            if not hotel_name:
                for label, pb in prebooks.items():
                    if pb.check_in <= day_date < pb.check_out:
                        hotel_name = pb.hotel.name
                        hotel_prebook_id = pb.prebook_id
                        break

            food = raw.get("food_suggestions") or []
            if not isinstance(food, list):
                food = [str(food)]

            parsed.append(ItineraryDay(
                day_number=day_num,
                date=day_date,
                title=raw.get("title", f"Day {day_num}"),
                hotel_name=hotel_name,
                hotel_prebook_id=hotel_prebook_id,
                activities=activities,
                notes=raw.get("notes", "") or "",
                morning=raw.get("morning"),
                afternoon=raw.get("afternoon"),
                evening=raw.get("evening"),
                food_suggestions=[str(x) for x in food],
                transport_notes=raw.get("transport_notes", "") or "",
                practical_tips=raw.get("practical_tips", "") or "",
            ))

        return parsed

    @staticmethod
    def _parse_trip_summary(
        raw: dict[str, Any] | None,
        *,
        origin: str,
        destination: str,
        departure_date: date | None,
        return_date: date | None,
        total_days: int,
        dietary: str | None = None,
        vibe: str | None = None,
        budget: str | None = None,
        hotels: list[str] | None = None,
    ) -> TripSummary:
        """Build TripSummary from LLM JSON with sensible fallbacks."""
        raw = raw if isinstance(raw, dict) else {}
        nights = raw.get("nights")
        if nights is None and total_days:
            nights = max(0, total_days - 1)
        dates = raw.get("dates") or ""
        if not dates and departure_date:
            dates = departure_date.isoformat()
            if return_date:
                dates = f"{departure_date.isoformat()} → {return_date.isoformat()}"
        highlights = raw.get("highlights") or []
        if not isinstance(highlights, list):
            highlights = [str(highlights)]
        hotel_list = raw.get("hotels") if isinstance(raw.get("hotels"), list) else []
        if hotels:
            hotel_list = hotels
        return TripSummary(
            cities=raw.get("cities") or f"{origin} → {destination}",
            dates=dates,
            nights=int(nights) if nights is not None else None,
            vibe=raw.get("vibe") or vibe,
            budget_ballpark=raw.get("budget_ballpark") or budget,
            dietary_preference=raw.get("dietary_preference") or dietary,
            hotels=[str(h) for h in hotel_list],
            transport_style=raw.get("transport_style")
            or "Flights + local cab / auto / walk (confirm on Maps)",
            highlights=[str(h) for h in highlights][:5],
        )

    def _format_summary_block(self, summary: TripSummary | None, title: str) -> list[str]:
        """Markdown ## Trip summary section for chat."""
        lines = [
            f"## Trip summary",
            f"**{title}**",
        ]
        if not summary:
            return lines
        if summary.cities:
            lines.append(f"- **Where:** {summary.cities}")
        if summary.dates:
            night_bit = f" · {summary.nights} night(s)" if summary.nights is not None else ""
            lines.append(f"- **When:** {summary.dates}{night_bit}")
        if summary.vibe:
            lines.append(f"- **Vibe:** {summary.vibe}")
        if summary.budget_ballpark:
            lines.append(f"- **Budget (ballpark):** {summary.budget_ballpark}")
        if summary.dietary_preference:
            lines.append(f"- **Meals:** {summary.dietary_preference}")
        if summary.hotels:
            lines.append("- **Hotels:** " + "; ".join(summary.hotels))
        elif summary.hotels is not None:
            lines.append("- **Hotels:** TBD — picking stays next")
        if summary.transport_style:
            lines.append(f"- **Getting around:** {summary.transport_style}")
        if summary.highlights:
            lines.append("- **Highlights:**")
            for h in summary.highlights:
                lines.append(f"  - {h}")
        return lines

    def _format_day_block(self, day: ItineraryDay) -> list[str]:
        """Markdown ## Day N section for chat."""
        lines = [
            f"\n## Day {day.day_number} — {day.date.strftime('%d %b %Y')} | {day.title}",
        ]
        if day.hotel_name:
            lines.append(f"**Stay:** {day.hotel_name}")
        if day.morning:
            lines.append(f"**Morning:** {day.morning}")
        if day.afternoon:
            lines.append(f"**Afternoon:** {day.afternoon}")
        if day.evening:
            lines.append(f"**Evening:** {day.evening}")
        if day.food_suggestions:
            lines.append("**Food:**")
            for f in day.food_suggestions:
                lines.append(f"- {f}")
        if day.transport_notes:
            lines.append(f"**Getting around:** {day.transport_notes}")
        if day.practical_tips:
            lines.append(f"**Good to know:** {day.practical_tips}")
        if day.activities:
            lines.append("**Schedule:**")
            for act in day.activities:
                travel = ""
                if act.travel_mode:
                    mins = f" ~{act.travel_minutes} min" if act.travel_minutes else ""
                    travel = f" _(via {act.travel_mode}{mins})_"
                lines.append(f"- {act.time} — {act.description}{travel}")
                if act.notes:
                    lines.append(f"  - {act.notes}")
        if day.notes:
            lines.append(f"_{day.notes}_")
        return lines

    def _format_draft_itinerary_message(self, draft: DraftItinerary) -> str:
        """Format the draft itinerary: summary first, then day-by-day."""
        lines = self._format_summary_block(draft.summary, draft.trip_title)
        lines.append("")
        for day in draft.days:
            lines.extend(self._format_day_block(day))
        if draft.notes:
            lines.append(f"\n**Trip notes:** {draft.notes}")
        lines.append(
            "\n\nWant any changes, or shall I search hotels next? "
            "(approve / suggest changes)"
        )
        return "\n".join(lines)

    def _format_final_itinerary_message(self, final: FinalItinerary) -> str:
        """Format the complete final itinerary: summary then days."""
        lines = self._format_summary_block(final.summary, final.trip_title)
        if final.outbound_flight:
            lines.append(
                f"- **Outbound flight:** {final.outbound_flight.airline} "
                f"{final.outbound_flight.flight_number or ''}".rstrip()
            )
        if final.grand_total:
            lines.append(
                f"- **Estimated total:** ₹{final.grand_total:,.0f} {final.currency} "
                "(flights + hotels — restaurants not included)"
            )
        lines.append("")
        for day in final.days:
            lines.extend(self._format_day_block(day))
        lines.append("\nYour plan is ready — have a great trip.")
        return "\n".join(lines)
