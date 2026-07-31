"""
Itinerary Agent — Main Orchestrator.

Responsibilities:
  - Parse trip requirements from free-text via GPT-4o-mini.
  - Detect missing required fields.
  - Search destination info via Tavily (enriches LLM prompts — never shown raw).
  - Generate Draft Itinerary (rich markdown) after flight booking.
  - Generate Final Itinerary (rich markdown) after hotel booking.
  - Delegate flight/hotel/weather data to provider interfaces (never calls APIs directly).

Output quality target: Google Travel / TripAdvisor / Expedia level.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from tavily import TavilyClient

from backend.models.state import (
    AppState,
    BudgetBreakdown,
    DailyCost,
    DayActivity,
    DraftItinerary,
    FinalItinerary,
    RestaurantRecommendation,
    TravelDetail,
    TripRequirements,
    TripType,
    WeatherInfo,
    WorkflowStep,
)
from backend.services.providers import (
    DummyHotelProvider,
    WeatherEntry,
    get_hotel_provider,
    get_weather_provider,
)

load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"),
    override=False,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# LLM singleton
# ---------------------------------------------------------------------------

def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.7,
        api_key=os.getenv("OPENAI_API_KEY", ""),
    )


# ---------------------------------------------------------------------------
# Destination Search Agent (Tavily) — enriches LLM prompt, never shown raw
# ---------------------------------------------------------------------------

class DestinationSearchAgent:
    """
    Fetches destination intelligence via Tavily.
    Results are ONLY used to build the LLM context block.
    They are NEVER rendered directly in the final markdown output.
    """

    def __init__(self) -> None:
        api_key = os.getenv("TAVILY_API_KEY", "").strip().strip('"').strip("'")
        if not api_key or api_key.startswith("tvly-your"):
            logger.warning("Tavily not configured — web search disabled.")
            self._client: Optional[TavilyClient] = None
        else:
            try:
                self._client = TavilyClient(api_key=api_key)
                logger.info("Tavily web search enabled.")
            except Exception as exc:
                logger.error("Failed to init TavilyClient: %s", exc)
                self._client = None

    def search_destination(
        self,
        destination: str,
        trip_type: str = "leisure",
        days: int = 3,
    ) -> Dict[str, Any]:
        if self._client is None:
            return self._empty()

        queries = [
            (f"top tourist attractions must visit places {destination}", "top_places"),
            (f"current events festivals things happening {destination} 2026", "events"),
            (f"{trip_type} activities things to do {destination}", "activities"),
            (f"best local restaurants food to eat {destination}", "restaurants"),
            (f"travel tips visiting {destination} tourists", "tips"),
        ]

        results: Dict[str, Any] = {
            k: [] for k in ("top_places", "events", "activities", "restaurants", "tips")
        }
        results["raw_context"] = ""
        all_snippets: List[str] = []

        for query, category in queries:
            try:
                resp = self._client.search(
                    query=query, search_depth="basic",
                    max_results=5, include_answer=True,
                )
                snippets = self._extract(resp)
                results[category] = snippets
                all_snippets.extend(snippets)
            except Exception as exc:
                logger.error("Tavily [%s] failed: %s", category, exc)

        results["raw_context"] = "\n".join(all_snippets)
        return results

    @staticmethod
    def _extract(response: Dict[str, Any]) -> List[str]:
        out: List[str] = []
        if response.get("answer"):
            out.append(response["answer"])
        for r in response.get("results", []):
            title   = r.get("title", "").strip()
            content = r.get("content", "").strip()
            if content:
                out.append(f"{title}: {content[:300]}" if title else content[:300])
        return out

    @staticmethod
    def _empty() -> Dict[str, Any]:
        return {k: [] for k in ("top_places", "events", "activities", "restaurants", "tips", "raw_context")}


# ---------------------------------------------------------------------------
# ItineraryAgent
# ---------------------------------------------------------------------------

class ItineraryAgent:
    """
    Main planning agent.
    - GPT-4o-mini for all text generation.
    - Tavily for destination research (context only — never raw output).
    - WeatherProvider for day-by-day forecasts.
    """

    def __init__(self) -> None:
        self._llm          = _get_llm()
        self._search       = DestinationSearchAgent()
        self._weather      = get_weather_provider()
        self._hotel_prov   = get_hotel_provider()

    # ------------------------------------------------------------------
    # 1. Requirement extraction
    # ------------------------------------------------------------------

    def extract_requirements(
        self,
        user_message: str,
        existing: TripRequirements,
        conversation_history: List[Dict[str, str]],
    ) -> TripRequirements:
        existing_json = existing.model_dump_json(indent=2)
        system_prompt = (
            "You are a travel assistant extracting trip details from user messages.\n\n"
            f"Current known trip requirements (JSON):\n{existing_json}\n\n"
            "Extract ANY of the following fields that the user mentions and return a JSON object "
            "with ONLY those fields. Do not include fields not mentioned.\n\n"
            "Fields:\n"
            "- departure_city: string\n"
            "- destination: string\n"
            "- departure_date: YYYY-MM-DD\n"
            "- return_date: YYYY-MM-DD\n"
            "- num_travelers: integer\n"
            "- budget: float (total INR)\n"
            "- trip_type: leisure|business|adventure|honeymoon|family|solo\n"
            "- special_requests: string\n\n"
            f"Today: {date.today().isoformat()}\n"
            "Convert relative dates to YYYY-MM-DD. Return ONLY valid JSON, no markdown fences."
        )
        response = self._llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_message),
        ])
        raw = re.sub(r"^```[a-z]*\n?", "", response.content.strip())
        raw = re.sub(r"\n?```$", "", raw)
        try:
            extracted: Dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            extracted = {}

        current = existing.model_dump()
        for key, val in extracted.items():
            if val is not None and val != "":
                current[key] = val

        if current.get("trip_type") and isinstance(current["trip_type"], str):
            try:
                current["trip_type"] = TripType(current["trip_type"].lower())
            except ValueError:
                current["trip_type"] = TripType.LEISURE

        return TripRequirements(**current)

    # ------------------------------------------------------------------
    # 2. Conversational helpers
    # ------------------------------------------------------------------

    def generate_welcome_message(self) -> str:
        return (
            "✈️ **Welcome to AI Travel Planner!**\n\n"
            "I'm here to plan your perfect trip — flights, hotels, and a day-by-day itinerary.\n\n"
            "To get started, tell me:\n"
            "- Where are you travelling **from** and **to**?\n"
            "- What are your **travel dates**?\n"
            "- How many **travellers**?\n"
            "- What's your **budget** (total INR)?\n"
            "- Trip type: *leisure / adventure / business / honeymoon / family / solo*\n\n"
            "Feel free to share everything at once, or go step by step! 😊"
        )

    def generate_missing_fields_question(self, missing: List[str]) -> str:
        field_questions: Dict[str, str] = {
            "departure_city": "Which city will you be **departing from**?",
            "destination":    "Where would you like to **travel to**?",
            "departure_date": "What is your **departure date**? *(e.g. 2026-07-24)*",
            "return_date":    "When do you plan to **return**? *(e.g. 2026-07-27)*",
            "num_travelers":  "How many **travellers** will be going?",
            "budget":         "What is your **total budget** in INR?",
            "trip_type":      "What type of trip? *(leisure / adventure / business / honeymoon / family / solo)*",
        }
        questions = [field_questions[f] for f in missing if f in field_questions]
        if len(questions) == 1:
            return f"Just one more thing — {questions[0]}"
        return "I still need a few details:\n\n" + "\n".join(f"- {q}" for q in questions)

    def generate_confirmation_prompt(self, state: AppState) -> str:
        req  = state.trip_requirements
        days = state.num_trip_days()
        rows = (
            f"| 🛫 From | {req.departure_city} |\n"
            f"| 🛬 To | {req.destination} |\n"
            f"| 📅 Departure | {req.departure_date} |\n"
            f"| 📅 Return | {req.return_date} |\n"
            f"| 👥 Travellers | {req.num_travelers} |\n"
            f"| 💰 Budget | ₹{req.budget:,.0f} |\n"
            f"| 🎯 Trip Type | {req.trip_type} |\n"
            f"| 🌙 Duration | {days} night(s) |\n"
        )
        if req.special_requests:
            rows += f"| 📝 Notes | {req.special_requests} |\n"
        return (
            "Here's your trip summary:\n\n"
            "| Field | Value |\n|-------|-------|\n"
            + rows
            + "\nShall I **search for flights** now? *(yes / no)*"
        )

    def generate_hotel_prompt(self) -> str:
        return (
            "✅ **Flight booked!** Your draft itinerary is ready above.\n\n"
            "Would you like me to **search for hotels** to complete your trip? *(yes / no)*"
        )

    # ------------------------------------------------------------------
    # 3. Draft Itinerary
    # ------------------------------------------------------------------

    def generate_draft_itinerary(self, state: AppState) -> DraftItinerary:
        req    = state.trip_requirements
        flight = state.selected_flight
        days   = state.num_trip_days()
        dest   = req.destination or "destination"

        trip_type_str = _clean_enum(req.trip_type, "leisure")

        # --- Weather forecast ---
        weather_entries = self._weather.forecast(dest, req.departure_date or date.today().isoformat(), days)
        weather_list    = [
            WeatherInfo(
                date_str=e.date_str, temperature_c=e.temperature_c,
                condition=e.condition, humidity_pct=e.humidity_pct, advice=e.advice,
            )
            for e in weather_entries
        ]

        # --- Destination research (context only — never rendered raw) ---
        web_data = self._search.search_destination(dest, trip_type_str, days)
        web_ctx  = _format_web_context_for_llm(web_data, dest)

        # --- Flight context string ---
        flight_ctx    = ""
        flight_arr_dt = None
        if flight:
            from datetime import datetime as _dt
            try:
                dep_fmt      = _dt.fromisoformat(flight.departure_time).strftime("%d %b %Y, %I:%M %p")
                arr_fmt      = _dt.fromisoformat(flight.arrival_time).strftime("%d %b %Y, %I:%M %p")
                flight_arr_dt = _dt.fromisoformat(flight.arrival_time)
            except ValueError:
                dep_fmt, arr_fmt = flight.departure_time, flight.arrival_time
            flight_ctx = (
                f"Flight: {flight.airline} {flight.flight_number} | "
                f"{flight.departure_airport} → {flight.arrival_airport} | "
                f"Departs: {dep_fmt} | Arrives: {arr_fmt} | "
                f"Duration: {flight.duration_display} | "
                f"₹{flight.total_price:,.0f} total"
            )

        # --- Budget estimate (keep flight cost out of remaining pool when known) ---
        budget        = req.budget or 30000.0
        known_flight  = flight.total_price if flight else 0.0
        breakdown     = _estimate_budget(budget, days, flight_cost=known_flight)

        # --- Get a realistic dummy hotel for draft display ---
        from backend.models.state import HotelSearchParams
        hotel_params = HotelSearchParams(
            destination         = dest,
            check_in            = req.departure_date or date.today().isoformat(),
            check_out           = req.return_date    or (date.today() + timedelta(days=days)).isoformat(),
            num_guests          = req.num_travelers  or 1,
            max_price_per_night = round(breakdown.hotel / max(days, 1) * 1.5),
        )
        draft_hotels  = self._hotel_prov.search(hotel_params)
        draft_hotel   = draft_hotels[0] if draft_hotels else None

        # --- LLM day-plan generation ---
        day_data = self._generate_day_plans(
            req, days, trip_type_str, web_ctx, flight_ctx, weather_list, flight_arr_dt
        )

        # Build DayActivity list — inject draft hotel name instead of "Hotel TBD"
        hotel_label = (
            f"{draft_hotel.name} — {draft_hotel.room_type} | 📍 {draft_hotel.address}"
            if draft_hotel else f"Hotel to be selected in {dest.title()}"
        )
        day_activities = _build_day_activities(
            day_data, req, days, breakdown, weather_list, hotel_label
        )

        dest_title = dest.title()
        draft = DraftItinerary(
            trip_summary     = (
                f"{days}-day {trip_type_str.title()} trip to {dest_title} "
                f"for {req.num_travelers} traveller(s)"
            ),
            flight_info      = flight_ctx,
            days             = day_activities,
            estimated_budget = breakdown.total,
            budget_breakdown = breakdown,
            weather          = weather_list,
            notes            = _default_notes(req),
            web_data         = web_data,
            draft_hotel      = draft_hotel.model_dump() if draft_hotel else None,
            travel_tips      = [],
            trip_title       = f"✈️ {dest_title} Travel Itinerary",
        )
        draft.markdown = _render_draft_markdown(draft, state, web_data, draft_hotel)
        return draft

    # ------------------------------------------------------------------
    # 4. Final Itinerary
    # ------------------------------------------------------------------

    def generate_final_itinerary(self, state: AppState) -> FinalItinerary:
        req     = state.trip_requirements
        flight  = state.selected_flight
        prebook = state.flight_prebook
        draft   = state.draft_itinerary
        days    = state.num_trip_days()
        dest    = req.destination or "destination"

        trip_type_str = _clean_enum(req.trip_type, "leisure")

        # --- Weather ---
        weather_entries = self._weather.forecast(dest, req.departure_date or date.today().isoformat(), days)
        weather_list    = [
            WeatherInfo(
                date_str=e.date_str, temperature_c=e.temperature_c,
                condition=e.condition, humidity_pct=e.humidity_pct, advice=e.advice,
            )
            for e in weather_entries
        ]

        # --- Research (context for LLM only) ---
        web_data = self._search.search_destination(dest, trip_type_str, days)

        # --- Flight display string ---
        flight_str = ""
        if flight and prebook:
            from datetime import datetime as _dt
            try:
                dep_fmt = _dt.fromisoformat(flight.departure_time).strftime("%d %b %Y, %I:%M %p")
                arr_fmt = _dt.fromisoformat(flight.arrival_time).strftime("%d %b %Y, %I:%M %p")
            except ValueError:
                dep_fmt, arr_fmt = flight.departure_time, flight.arrival_time
            flight_str = (
                f"{flight.airline} | {flight.flight_number} | "
                f"{flight.departure_airport} → {flight.arrival_airport} | "
                f"{dep_fmt} → {arr_fmt} | {flight.duration_display} | "
                f"{flight.cabin} | ₹{prebook.total_charged:,.0f} | "
                f"Booking ID: `{prebook.prebook_id}`"
            )

        # --- Hotel display string ---
        hotel_lines = []
        for day_num, pb in sorted(state.hotel_prebooks.items(), key=lambda x: int(x[0])):
            h = pb.hotel
            hotel_lines.append(
                f"Night {day_num}: **{h.name}** | ⭐ {h.rating} | "
                f"₹{h.price_per_night:,.0f}/night | 📍 {h.address} | "
                f"ID: `{pb.prebook_id}`"
            )
        hotel_str = "\n".join(hotel_lines) if hotel_lines else "Hotel has not been selected yet."

        # --- Enrich days with actual hotel names ---
        enriched_days: List[DayActivity] = []
        source_days = draft.days if draft else []
        for day in source_days:
            pb_for_day = state.hotel_prebooks.get(str(day.day_number))
            hotel_stay = (
                f"{pb_for_day.hotel.name} — {pb_for_day.hotel.room_type} | "
                f"📍 {pb_for_day.hotel.address}"
                if pb_for_day else day.hotel_stay
            )
            enriched_days.append(day.model_copy(update={"hotel_stay": hotel_stay}))

        # --- Budget breakdown ---
        flight_cost = prebook.total_charged if prebook else 0.0
        hotel_cost  = sum(pb.total_charged for pb in state.hotel_prebooks.values())
        budget      = req.budget or (flight_cost + hotel_cost + 20000)
        breakdown   = _estimate_budget(budget, days, flight_cost=flight_cost, hotel_cost=hotel_cost)
        total_cost  = breakdown.total

        # --- Travel tips ---
        web_tips  = _distil_tips(web_data.get("tips", []))
        all_tips  = web_tips + _default_travel_tips(dest)

        dest_title = dest.title()
        final = FinalItinerary(
            trip_title      = f"✈️ {dest_title} — {days}-Day {trip_type_str.title()} Trip",
            trip_summary    = (
                f"{days}-day {trip_type_str.title()} trip from {req.departure_city} to {dest_title} "
                f"for {req.num_travelers} traveller(s) · "
                f"{req.departure_date} → {req.return_date}"
            ),
            flight_details  = flight_str,
            hotel_details   = hotel_str,
            days            = enriched_days,
            total_cost      = total_cost,
            budget_breakdown= breakdown,
            weather         = weather_list,
            travel_tips     = all_tips,
            important_notes = _default_notes(req),
            web_data        = web_data,
        )
        final.markdown = _render_final_markdown(final, state, web_data)
        return final

    # ------------------------------------------------------------------
    # LLM day-plan helper
    # ------------------------------------------------------------------

    def _generate_day_plans(
        self,
        req: TripRequirements,
        days: int,
        trip_type_str: str,
        web_ctx: str,
        flight_ctx: str,
        weather_list: List[WeatherInfo],
        flight_arr_dt: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Ask GPT-4o-mini to produce structured day-by-day plans. Returns raw list."""

        weather_ctx = "\n".join(
            f"Day {i+1} ({w.date_str}): {w.temperature_c}°C, {w.condition} — {w.advice}"
            for i, w in enumerate(weather_list)
        )

        # Build arrival-time constraint hint for the LLM
        arrival_hint = ""
        if flight_arr_dt:
            arr_hour = flight_arr_dt.hour
            if arr_hour < 12:
                arrival_hint = (
                    f"Flight arrives at {flight_arr_dt.strftime('%I:%M %p')}. "
                    "Day 1 morning = airport arrival + taxi to hotel + check-in. "
                    "First sightseeing activity on Day 1 must start AFTER 11:00 AM."
                )
            elif arr_hour < 16:
                arrival_hint = (
                    f"Flight arrives at {flight_arr_dt.strftime('%I:%M %p')}. "
                    "Day 1: check in and rest. Sightseeing starts only in the evening or Day 2."
                )
            else:
                arrival_hint = (
                    f"Flight arrives late at {flight_arr_dt.strftime('%I:%M %p')}. "
                    "Day 1 is ARRIVAL ONLY — no sightseeing. Evening dinner near hotel only."
                )

        # ── Budget-proportional counts ──────────────────────────────────────
        per_person_per_day = req.budget / max(req.num_travelers, 1) / max(days, 1)

        # Restaurants per day based on budget
        if per_person_per_day >= 5000:
            rest_per_day = "4–5"
            rest_note = "Include fine dining, rooftop restaurants, and specialty cuisine. Mix luxury with local gems."
        elif per_person_per_day >= 3000:
            rest_per_day = "3–4"
            rest_note = "Include a mix of premium and mid-range restaurants. Try specialty dining and local favourites."
        elif per_person_per_day >= 1500:
            rest_per_day = "2–3"
            rest_note = "Mix of mid-range and budget-friendly restaurants."
        else:
            rest_per_day = "2"
            rest_note = "Focus on authentic local budget-friendly eateries and street food."

        # Activity slots per day based on budget
        if per_person_per_day >= 5000:
            extra_activities = "Add premium experiences: private tours, helicopter rides, yacht cruises, spa sessions, wine tasting, adventure sports."
            timeline_entries = "10–12"
            activity_note = "Pack the day with diverse premium experiences. Include at least one exclusive/luxury activity per day."
        elif per_person_per_day >= 3000:
            extra_activities = "Include guided tours, water sports, cultural shows, and special experiences alongside standard sightseeing."
            timeline_entries = "9–11"
            activity_note = "Mix of standard and premium activities. Include at least one special experience per day."
        elif per_person_per_day >= 1500:
            extra_activities = "Focus on popular attractions and standard activities."
            timeline_entries = "8–10"
            activity_note = "Standard sightseeing with good variety."
        else:
            extra_activities = "Focus on free/low-cost attractions, parks, beaches, temples, and walking tours."
            timeline_entries = "7–9"
            activity_note = "Budget-friendly activities with maximum value."

        system_prompt = (
            "You are a world-class travel planner. Generate a detailed, realistic day-by-day itinerary.\n"
            "Return ONLY a valid JSON array — no markdown fences, no extra text.\n\n"
            + (f"ARRIVAL CONSTRAINT: {arrival_hint}\n\n" if arrival_hint else "")
            +
            "Each element must follow this exact structure:\n"
            "{\n"
            '  "day_number": 1,\n'
            '  "date": "YYYY-MM-DD",\n'
            '  "morning": "Arrival narrative + check-in note",\n'
            '  "breakfast": "Specific restaurant name + dish recommendation",\n'
            '  "mid_morning": "Activity description",\n'
            '  "sightseeing": "Named landmark or attraction with brief description",\n'
            '  "travel_time": "e.g. 20 min by taxi from hotel",\n'
            '  "lunch": "Named restaurant + local dish",\n'
            '  "afternoon_activities": "Named attraction or activity",\n'
            '  "evening_activities": "Named show, beach, market or sunset spot",\n'
            '  "dinner": "Named restaurant + signature dish",\n'
            '  "night": "Night market / bar / early rest note",\n'
            '  "hotel_stay": "Hotel TBD",\n'
            '  "timeline": [\n'
            '    {"time": "07:30 AM", "activity": "Wake up. Freshen up."},\n'
            '    {"time": "08:00 AM", "activity": "Breakfast at [name]"},\n'
            '    {"time": "09:30 AM", "activity": "Visit [landmark]"},\n'
            '    {"time": "01:00 PM", "activity": "Lunch at [restaurant]"},\n'
            '    {"time": "02:30 PM", "activity": "[Afternoon activity]"},\n'
            '    {"time": "05:00 PM", "activity": "[Evening spot]"},\n'
            '    {"time": "07:30 PM", "activity": "Dinner at [restaurant]"},\n'
            '    {"time": "09:30 PM", "activity": "Return to hotel"}\n'
            '  ],\n'
            '  "restaurants": [\n'
            '    {"name": "...", "cuisine": "...", "approx_cost": "₹500-₹800/person", "why": "..."}\n'
            '  ],\n'
            '  "travel_details": [\n'
            '    {"from_place": "Hotel", "to_place": "Beach", "distance": "3 km", "est_time": "10 min", "transport": "Auto-rickshaw"}\n'
            '  ],\n'
            '  "daily_cost": {"food": 1200, "transport": 400, "tickets": 300, "shopping": 500}\n'
            "}\n\n"
            "STRICT RULES:\n"
            f"- Generate exactly {days} day objects.\n"
            "- TRAVEL LOGIC: Never schedule sightseeing before the flight has landed and travellers have reached the hotel.\n"
            "- Use NAMED, SPECIFIC attractions, restaurants, and activities — no generic placeholders.\n"
            "- No duplicate activities across days. No duplicate meals within a day.\n"
            "- Group nearby attractions on the same day to minimise criss-crossing.\n"
            "- Do NOT alternate between distant areas (e.g. North and South Goa) on the same day.\n"
            "- Respect realistic opening hours: temples 6–10 AM, beaches 6–8 AM or 5–7 PM best.\n"
            f"- Timeline must have {timeline_entries} entries per day with realistic, consecutive times.\n"
            f"- Restaurants array: {rest_per_day} per day, different across days. {rest_note}\n"
            f"- {extra_activities}\n"
            f"- {activity_note}\n"
            "- Travel details: 2–3 segments per day.\n"
            "- All cost values are INR integers.\n"
        )

        user_prompt = (
            f"Trip: {days}-day {trip_type_str} trip\n"
            f"From: {req.departure_city}  →  To: {req.destination}\n"
            f"Departure: {req.departure_date}  |  Return: {req.return_date}\n"
            f"Travellers: {req.num_travelers}  |  Budget: ₹{req.budget:,.0f}\n"
        )
        if flight_ctx:
            user_prompt += f"Flight info: {flight_ctx}\n"
        if arrival_hint:
            user_prompt += f"Arrival note: {arrival_hint}\n"
        if req.special_requests:
            user_prompt += f"Special requests: {req.special_requests}\n"
        user_prompt += f"\nWeather forecast:\n{weather_ctx}\n\n{web_ctx}\n\nGenerate the itinerary array now."

        response = self._llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ])
        raw = re.sub(r"^```[a-z]*\n?", "", response.content.strip())
        raw = re.sub(r"\n?```$", "", raw)

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return _fallback_day_data(req, days)


# ===========================================================================
# Module-level pure helpers (no self — easier to test in isolation)
# ===========================================================================

def _clean_enum(val: Any, default: str = "") -> str:
    """Convert TripType/CabinClass enum values to clean title-case strings."""
    if val is None:
        return default
    s = str(val)
    # Strip module prefix e.g. "TripType.leisure" → "leisure"
    if "." in s:
        s = s.split(".")[-1]
    return s.lower()


def _format_web_context_for_llm(web_data: Dict[str, Any], destination: str) -> str:
    """
    Convert raw Tavily snippets into a clean context block for the LLM.
    This text is injected into the LLM system prompt ONLY — never rendered
    in the final markdown output.
    """
    if not web_data or not any(web_data.get(k) for k in ("top_places", "activities", "restaurants")):
        return ""

    lines = [f"=== DESTINATION RESEARCH: {destination.upper()} ==="]

    if web_data.get("top_places"):
        lines.append("\nTOP ATTRACTIONS & LANDMARKS:")
        for item in web_data["top_places"][:6]:
            lines.append(f"  - {item[:220]}")

    if web_data.get("events"):
        lines.append("\nCURRENT EVENTS & FESTIVALS:")
        for item in web_data["events"][:4]:
            lines.append(f"  - {item[:220]}")

    if web_data.get("activities"):
        lines.append("\nACTIVITIES & EXPERIENCES:")
        for item in web_data["activities"][:6]:
            lines.append(f"  - {item[:220]}")

    if web_data.get("restaurants"):
        lines.append("\nDINING & LOCAL FOOD:")
        for item in web_data["restaurants"][:5]:
            lines.append(f"  - {item[:220]}")

    if web_data.get("tips"):
        lines.append("\nTRAVEL TIPS:")
        for item in web_data["tips"][:4]:
            lines.append(f"  - {item[:220]}")

    lines.append("=== END RESEARCH ===")
    return "\n".join(lines)


def _distil_tips(raw_tips: List[str]) -> List[str]:
    """
    Convert raw Tavily tip snippets into clean, concise tip sentences.
    Strips URLs, metadata, and overly long sentences.
    """
    clean: List[str] = []
    seen: set = set()
    for tip in raw_tips:
        # Strip URLs
        tip = re.sub(r"https?://\S+", "", tip).strip()
        # Keep first sentence only
        first_sentence = re.split(r"[.!?]", tip)[0].strip()
        if len(first_sentence) < 20 or len(first_sentence) > 200:
            continue
        key = first_sentence.lower()[:60]
        if key not in seen:
            seen.add(key)
            clean.append(first_sentence + ".")
    return clean[:4]


def _estimate_budget(
    total_budget: float,
    days: int,
    flight_cost: float = 0.0,
    hotel_cost: float = 0.0,
) -> BudgetBreakdown:
    """
    Produce a realistic itemised budget breakdown from the total budget.
    If flight and hotel costs are known (final itinerary), use them directly.
    """
    remaining = max(0.0, total_budget - flight_cost - hotel_cost)
    daily     = remaining / max(days, 1)

    food_total      = round(daily * 0.35 * days, 0)
    transport_total = round(daily * 0.20 * days, 0)
    activities      = round(daily * 0.20 * days, 0)
    shopping        = round(daily * 0.10 * days, 0)
    buffer          = round(daily * 0.15 * days, 0)

    # If flight/hotel not yet confirmed, estimate from budget allocation
    if flight_cost == 0:
        flight_cost = round(total_budget * 0.30, 0)
    if hotel_cost == 0:
        hotel_cost  = round(total_budget * 0.25 * days / max(days, 1), 0)

    return BudgetBreakdown(
        flights    = flight_cost,
        hotel      = hotel_cost,
        food       = food_total,
        transport  = transport_total,
        activities = activities,
        shopping   = shopping,
        buffer     = buffer,
    )


def _build_day_activities(
    day_data: List[Dict[str, Any]],
    req: TripRequirements,
    days: int,
    breakdown: BudgetBreakdown,
    weather_list: List[WeatherInfo],
    hotel_label: str = "",
) -> List[DayActivity]:
    """Convert LLM JSON day objects into typed DayActivity instances."""
    try:
        start = date.fromisoformat(req.departure_date or date.today().isoformat())
    except ValueError:
        start = date.today()

    per_day_food      = round(breakdown.food      / max(days, 1), 0)
    per_day_transport = round(breakdown.transport / max(days, 1), 0)
    per_day_tickets   = round(breakdown.activities / max(days, 1), 0)
    per_day_shopping  = round(breakdown.shopping  / max(days, 1), 0)

    result: List[DayActivity] = []
    for i, d in enumerate(day_data[:days]):
        day_date = (start + timedelta(days=i)).isoformat()

        # Daily cost — prefer LLM value, fall back to estimated split
        dc_raw = d.get("daily_cost", {})
        daily_cost = DailyCost(
            food      = float(dc_raw.get("food",      per_day_food)),
            transport = float(dc_raw.get("transport", per_day_transport)),
            tickets   = float(dc_raw.get("tickets",   per_day_tickets)),
            shopping  = float(dc_raw.get("shopping",  per_day_shopping)),
        )

        # Restaurants
        restaurants: List[RestaurantRecommendation] = []
        for r in d.get("restaurants", []):
            try:
                restaurants.append(RestaurantRecommendation(
                    name        = r.get("name", "Local Restaurant"),
                    cuisine     = r.get("cuisine", "Local"),
                    approx_cost = r.get("approx_cost", "₹400–₹800/person"),
                    why         = r.get("why", "Highly recommended by locals"),
                ))
            except Exception:
                pass

        # Travel details
        travel_details: List[TravelDetail] = []
        for t in d.get("travel_details", []):
            try:
                travel_details.append(TravelDetail(
                    from_place = t.get("from_place", "Hotel"),
                    to_place   = t.get("to_place",   "Attraction"),
                    distance   = t.get("distance",   "N/A"),
                    est_time   = t.get("est_time",   "N/A"),
                    transport  = t.get("transport",  "Taxi"),
                ))
            except Exception:
                pass

        result.append(DayActivity(
            day_number           = i + 1,
            date                 = d.get("date", day_date),
            morning              = d.get("morning", "Morning exploration"),
            breakfast            = d.get("breakfast", "Breakfast at hotel"),
            mid_morning          = d.get("mid_morning", ""),
            sightseeing          = d.get("sightseeing", f"Explore {req.destination}"),
            travel_time          = d.get("travel_time", "30 min by taxi"),
            lunch                = d.get("lunch", "Lunch at a local restaurant"),
            afternoon_activities = d.get("afternoon_activities", "Afternoon sightseeing"),
            evening_activities   = d.get("evening_activities", "Evening leisure"),
            dinner               = d.get("dinner", "Dinner at a local restaurant"),
            night                = d.get("night", "Return to hotel"),
            # Use real hotel label; ignore whatever the LLM put in hotel_stay
            hotel_stay           = hotel_label or d.get("hotel_stay", f"Hotel in {req.destination}"),
            timeline             = d.get("timeline", []),
            daily_cost           = daily_cost,
            travel_details       = travel_details,
            restaurants          = restaurants,
        ))

    return result


def _default_travel_tips(destination: str) -> List[str]:
    return [
        f"Purchase travel insurance before departing for {destination}.",
        "Keep digital and physical copies of your passport and all booking IDs.",
        "Exchange some local currency before you leave — not all vendors accept cards.",
        "Download offline maps (Google Maps / Maps.me) before your trip.",
        "Notify your bank of travel dates to prevent card blocks.",
        "Carry a power bank — long sightseeing days drain your phone quickly.",
        "Book popular attractions in advance to avoid long queues.",
        "Check visa requirements and entry guidelines at least 2 weeks before travel.",
    ]


def _default_notes(req: TripRequirements) -> List[str]:
    notes = [
        "All prices are estimates and subject to change without notice.",
        "Pre-book IDs are provisional until full payment is completed.",
        "Check-in times vary — contact hotels directly to confirm early check-in.",
        "Flight and hotel data shown are for planning purposes only.",
    ]
    if req.special_requests:
        notes.append(f"Special request on file: {req.special_requests}")
    return notes


def _fallback_day_data(req: TripRequirements, days: int) -> List[Dict[str, Any]]:
    """Minimal valid day data returned when LLM response cannot be parsed."""
    try:
        start = date.fromisoformat(req.departure_date or date.today().isoformat())
    except ValueError:
        start = date.today()

    dest = req.destination or "destination"
    result = []
    for i in range(days):
        d = start + timedelta(days=i)
        result.append({
            "day_number": i + 1,
            "date": d.isoformat(),
            "morning": "Arrive and settle in" if i == 0 else "Morning at leisure",
            "breakfast": f"Breakfast at hotel café",
            "mid_morning": f"Explore the neighbourhood around your hotel",
            "sightseeing": f"Visit the main attractions of {dest}",
            "travel_time": "20–30 min by taxi",
            "lunch": f"Lunch at a well-reviewed local restaurant",
            "afternoon_activities": f"Afternoon sightseeing in {dest}",
            "evening_activities": f"Sunset stroll at a popular viewpoint",
            "dinner": f"Dinner at a local specialty restaurant",
            "night": "Return to hotel. Rest.",
            "hotel_stay": "Hotel TBD",
            "timeline": [
                {"time": "07:30 AM", "activity": "Wake up. Get ready."},
                {"time": "08:00 AM", "activity": "Breakfast at hotel"},
                {"time": "09:30 AM", "activity": f"Explore {dest}"},
                {"time": "01:00 PM", "activity": "Lunch at local restaurant"},
                {"time": "02:30 PM", "activity": "Afternoon sightseeing"},
                {"time": "05:30 PM", "activity": "Evening leisure / sunset spot"},
                {"time": "07:30 PM", "activity": "Dinner"},
                {"time": "09:30 PM", "activity": "Return to hotel"},
            ],
            "restaurants": [
                {"name": "Local Favourite", "cuisine": "Regional", "approx_cost": "₹400–₹700/person", "why": "Popular with locals and tourists"},
            ],
            "travel_details": [
                {"from_place": "Hotel", "to_place": "City Centre", "distance": "5 km", "est_time": "15 min", "transport": "Taxi / Ola"},
            ],
            "daily_cost": {"food": 1200, "transport": 500, "tickets": 400, "shopping": 600},
        })
    return result


# ===========================================================================
# Markdown Renderers
# ===========================================================================

def _render_draft_markdown(
    draft: DraftItinerary,
    state: AppState,
    web_data: Optional[Dict[str, Any]] = None,
    draft_hotel: Optional[Any] = None,
) -> str:
    req  = state.trip_requirements
    dest = req.destination or "destination"
    lines: List[str] = []

    # ── TRIP HEADER ────────────────────────────────────────────────────────
    lines += [
        f"# ✈️ {dest.title()} Travel Itinerary",
        "",
        "| | |",
        "|---|---|",
        f"| 📍 **Destination** | {dest.title()} |",
        f"| 📅 **Dates** | {req.departure_date} → {req.return_date} |",
        f"| 🌙 **Duration** | {state.num_trip_days()} days |",
        f"| 👥 **Travellers** | {req.num_travelers} |",
        f"| 🎯 **Trip Type** | {_clean_enum(req.trip_type, 'Leisure').title()} |",
        f"| 💰 **Budget** | ₹{req.budget:,.0f} |",
        "",
        f"> {draft.trip_summary}",
        "",
        "---",
    ]

    # ── FLIGHT INFORMATION ────────────────────────────────────────────────
    lines += ["", "## ✈️ Flight Information", ""]
    if draft.flight_info and state.selected_flight:
        f = state.selected_flight
        from datetime import datetime as _dt
        try:
            dep_fmt = _dt.fromisoformat(f.departure_time).strftime("%d %b %Y, %I:%M %p")
            arr_fmt = _dt.fromisoformat(f.arrival_time).strftime("%d %b %Y, %I:%M %p")
        except ValueError:
            dep_fmt, arr_fmt = f.departure_time, f.arrival_time

        stops_str = "Non-stop" if f.stops == 0 else f"{f.stops} stop(s)"
        lines += [
            "| Detail | Info |",
            "|--------|------|",
            f"| ✈️ **Airline** | {f.airline} |",
            f"| 🔢 **Flight Number** | {f.flight_number} |",
            f"| 🛫 **Departure** | {f.departure_airport} — {dep_fmt} |",
            f"| 🛬 **Arrival** | {f.arrival_airport} — {arr_fmt} |",
            f"| ⏱️ **Duration** | {f.duration_display} |",
            f"| 🛑 **Stops** | {stops_str} |",
            f"| 💺 **Cabin** | {_clean_enum(f.cabin, 'Economy').title()} |",
            f"| 💵 **Total Fare** | ₹{f.total_price:,.0f} |",
            f"| 🎒 **Baggage** | {'Included' if f.baggage_included else 'Not included'} |",
            f"| 🔄 **Refundable** | {'Yes' if f.refundable else 'No'} |",
            f"| 📋 **Status** | Demo Flight — For Planning Only |",
        ]
    else:
        lines.append("*Flight details will appear here after selection.*")
    lines += ["", "---"]

    # ── HOTEL PLACEHOLDER ────────────────────────────────────────────────
    lines += ["", "## 🏨 Hotel Information", ""]
    if draft_hotel:
        stars_str = "⭐" * int(round(draft_hotel.rating))
        amenities_str = " · ".join(draft_hotel.amenities[:4])
        lines += [
            "| Detail | Info |",
            "|--------|------|",
            f"| 🏨 **Hotel Name** | {draft_hotel.name} |",
            f"| ⭐ **Rating** | {stars_str} ({draft_hotel.rating}/5) |",
            f"| 📍 **Location** | {draft_hotel.address} |",
            f"| 🛏️ **Room Type** | {draft_hotel.room_type} |",
            f"| 💵 **Price** | ₹{draft_hotel.price_per_night:,.0f}/night |",
            f"| 🏊 **Amenities** | {amenities_str} |",
            f"| ✅ **Status** | Suggested Hotel — Confirm during booking |",
        ]
    else:
        lines.append("> Hotel will be selected after this draft is confirmed.")
    lines += ["", "---"]

    # ── BUDGET BREAKDOWN ─────────────────────────────────────────────────
    if draft.budget_breakdown:
        b = draft.budget_breakdown
        lines += [
            "", "## 💰 Budget Breakdown", "",
            "| Category | Estimated Cost |",
            "|----------|---------------|",
            f"| ✈️ Flights | ₹{b.flights:,.0f} |",
            f"| 🏨 Hotel | ₹{b.hotel:,.0f} |",
            f"| 🍽️ Food & Dining | ₹{b.food:,.0f} |",
            f"| 🚗 Local Transport | ₹{b.transport:,.0f} |",
            f"| 🎡 Activities & Tickets | ₹{b.activities:,.0f} |",
            f"| 🛍️ Shopping | ₹{b.shopping:,.0f} |",
            f"| 🛡️ Buffer / Misc | ₹{b.buffer:,.0f} |",
            f"| **💳 Total Estimated** | **₹{b.total:,.0f}** |",
            "", "---",
        ]

    # ── WEATHER ──────────────────────────────────────────────────────────
    if draft.weather:
        lines += ["", "## 🌤️ Weather Forecast", "",
                  "| Date | 🌡️ Temp | ☁️ Condition | 💧 Humidity | 💡 Travel Advice |",
                  "|------|--------|------------|----------|----------------|"]
        for w in draft.weather:
            lines.append(
                f"| {w.date_str} | {w.temperature_c}°C | {w.condition} | {w.humidity_pct}% | {w.advice} |"
            )
        lines += ["", "---"]

    # ── DESTINATION HIGHLIGHTS (summarised — never raw snippets) ─────────
    if web_data and any(web_data.get(k) for k in ("top_places", "activities", "restaurants")):
        lines += ["", "## 🌟 Destination Highlights", ""]
        lines += _render_highlights(web_data)
        lines += ["", "---"]

    # ── DAY PLANS ────────────────────────────────────────────────────────
    for day in draft.days:
        lines += _render_day(day)

    # ── TRAVEL TIPS ──────────────────────────────────────────────────────
    lines += [
        "", "## 💡 Travel Tips & Recommendations", "",
        "**Things to Carry:**",
        "- Valid photo ID / passport and visa documents",
        "- Travel insurance documents",
        "- Portable charger and universal adapter",
        "- Lightweight rain jacket or umbrella",
        "- Comfortable walking shoes",
        "",
        "**Safety Tips:**",
        "- Keep emergency contacts saved offline",
        "- Avoid displaying expensive jewellery in crowded areas",
        "- Use registered taxis or ride-hailing apps",
        "",
        f"**Local Transport in {dest.title()}:**",
        "- Ride-hailing apps (Ola / Uber) are reliable and affordable",
        "- Auto-rickshaws are great for short distances",
        "- Negotiate fares before boarding metered autos",
        "",
        "---",
    ]

    # ── NOTES ────────────────────────────────────────────────────────────
    if draft.notes:
        lines += ["", "## ⚠️ Important Notes", ""]
        for note in draft.notes:
            lines.append(f"- {note}")

    return "\n".join(lines)


def _render_final_markdown(
    final: FinalItinerary,
    state: AppState,
    web_data: Optional[Dict[str, Any]] = None,
) -> str:
    req   = state.trip_requirements
    dest  = req.destination or "destination"
    days  = state.num_trip_days()
    lines: List[str] = []

    # ── TRIP HEADER ────────────────────────────────────────────────────────
    lines += [
        f"# {final.trip_title}",
        "",
        "| | |",
        "|---|---|",
        f"| 📍 **Destination** | {dest.title()} |",
        f"| 📅 **Dates** | {req.departure_date} → {req.return_date} |",
        f"| 🌙 **Duration** | {days} days |",
        f"| 👥 **Travellers** | {req.num_travelers} |",
        f"| 🎯 **Trip Type** | {_clean_enum(req.trip_type, 'Leisure').title()} |",
        f"| 💰 **Total Cost** | ₹{final.total_cost:,.0f} |",
        "",
        f"> {final.trip_summary}",
        "",
        "---",
    ]

    # ── FLIGHT INFORMATION ────────────────────────────────────────────────
    lines += ["", "## ✈️ Flight Information", ""]
    if state.selected_flight and state.flight_prebook:
        f  = state.selected_flight
        pb = state.flight_prebook
        from datetime import datetime as _dt
        try:
            dep_fmt = _dt.fromisoformat(f.departure_time).strftime("%d %b %Y, %I:%M %p")
            arr_fmt = _dt.fromisoformat(f.arrival_time).strftime("%d %b %Y, %I:%M %p")
        except ValueError:
            dep_fmt, arr_fmt = f.departure_time, f.arrival_time

        stops_str = "Non-stop" if f.stops == 0 else f"{f.stops} stop(s)"
        lines += [
            "| Detail | Info |",
            "|--------|------|",
            f"| ✈️ **Airline** | {f.airline} |",
            f"| 🔢 **Flight Number** | {f.flight_number} |",
            f"| 🛫 **Departure** | {f.departure_airport} — {dep_fmt} |",
            f"| 🛬 **Arrival** | {f.arrival_airport} — {arr_fmt} |",
            f"| ⏱️ **Duration** | {f.duration_display} |",
            f"| 🛑 **Stops** | {stops_str} |",
            f"| 💺 **Cabin** | {_clean_enum(f.cabin, 'Economy').title()} |",
            f"| 💵 **Total Fare** | ₹{pb.total_charged:,.0f} |",
            f"| 🎒 **Baggage** | {'Included' if f.baggage_included else 'Not included'} |",
            f"| 🔄 **Refundable** | {'Yes' if f.refundable else 'No'} |",
            f"| 📋 **Booking ID** | `{pb.prebook_id}` |",
            f"| ✅ **Status** | {pb.status.title()} — Demo Flight |",
        ]
    else:
        lines.append("*No flight booked.*")
    lines += ["", "---"]

    # ── HOTEL INFORMATION ─────────────────────────────────────────────────
    lines += ["", "## 🏨 Hotel Information", ""]
    if state.hotel_prebooks:
        # Show first prebook as the primary hotel card (most trips use one hotel)
        first_pb = next(iter(state.hotel_prebooks.values()))
        h = first_pb.hotel
        stars = "⭐" * int(round(h.rating))
        amenities_str = " · ".join(h.amenities[:5])
        lines += [
            "| Detail | Info |",
            "|--------|------|",
            f"| 🏨 **Hotel Name** | {h.name} |",
            f"| ⭐ **Rating** | {stars} ({h.rating}/5) |",
            f"| 📍 **Location** | {h.address} |",
            f"| 🛏️ **Room Type** | {h.room_type} |",
            f"| 📅 **Check-in** | {first_pb.check_in} |",
            f"| 📅 **Check-out** | {first_pb.check_out} |",
            f"| 💵 **Price** | ₹{h.price_per_night:,.0f}/night |",
            f"| 🏊 **Amenities** | {amenities_str} |",
            f"| 📋 **Booking ID** | `{first_pb.prebook_id}` |",
            f"| ✅ **Status** | {first_pb.status.title()} — Demo Hotel |",
        ]
        # Multi-night breakdown if different hotels per night
        if len(state.hotel_prebooks) > 1:
            lines += ["", "**Night-by-Night Breakdown:**", ""]
            lines += [
                "| Night | Hotel | Price/Night | Booking ID |",
                "|-------|-------|------------|------------|",
            ]
            for day_str, pb in sorted(state.hotel_prebooks.items(), key=lambda x: int(x[0])):
                lines.append(
                    f"| Night {day_str} | {pb.hotel.name} | "
                    f"₹{pb.hotel.price_per_night:,.0f} | `{pb.prebook_id}` |"
                )
    else:
        lines.append("Hotel has not been selected yet.")
    lines += ["", "---"]

    # ── BUDGET BREAKDOWN ─────────────────────────────────────────────────
    if final.budget_breakdown:
        b = final.budget_breakdown
        lines += [
            "", "## 💰 Budget Breakdown", "",
            "| Category | Estimated Cost |",
            "|----------|---------------|",
            f"| ✈️ Flights | ₹{b.flights:,.0f} |",
            f"| 🏨 Hotel | ₹{b.hotel:,.0f} |",
            f"| 🍽️ Food & Dining | ₹{b.food:,.0f} |",
            f"| 🚗 Local Transport | ₹{b.transport:,.0f} |",
            f"| 🎡 Activities & Tickets | ₹{b.activities:,.0f} |",
            f"| 🛍️ Shopping | ₹{b.shopping:,.0f} |",
            f"| 🛡️ Buffer / Misc | ₹{b.buffer:,.0f} |",
            f"| **💳 Total Estimated** | **₹{b.total:,.0f}** |",
            "", "---",
        ]

    # ── WEATHER ──────────────────────────────────────────────────────────
    if final.weather:
        lines += ["", "## 🌤️ Weather Forecast", "",
                  "| Date | 🌡️ Temp | ☁️ Condition | 💧 Humidity | 💡 Travel Advice |",
                  "|------|--------|------------|----------|----------------|"]
        for w in final.weather:
            lines.append(
                f"| {w.date_str} | {w.temperature_c}°C | {w.condition} | {w.humidity_pct}% | {w.advice} |"
            )
        lines += ["", "---"]

    # ── DESTINATION HIGHLIGHTS ───────────────────────────────────────────
    if web_data and any(web_data.get(k) for k in ("top_places", "activities", "restaurants")):
        lines += ["", "## 🌟 Destination Highlights", ""]
        lines += _render_highlights(web_data)
        lines += ["", "---"]

    # ── DAY PLANS ────────────────────────────────────────────────────────
    for day in final.days:
        lines += _render_day(day)

    # ── TRAVEL TIPS ──────────────────────────────────────────────────────
    lines += ["", "## 💡 Travel Tips & Recommendations", ""]

    if final.travel_tips:
        lines += ["**General Tips:**", ""]
        for tip in final.travel_tips[:4]:
            lines.append(f"- {tip}")
        lines.append("")

    lines += [
        "**Things to Carry:**",
        "- Valid photo ID / passport and visa documents",
        "- Travel insurance documents",
        "- Portable charger and universal adapter",
        "- Lightweight rain jacket or umbrella",
        "- Comfortable walking shoes",
        "",
        "**Safety Tips:**",
        "- Keep emergency contacts saved offline",
        "- Avoid displaying expensive jewellery in crowded areas",
        "- Use registered taxis or ride-hailing apps (Ola / Uber)",
        "- Keep a photocopy of your passport in a separate bag",
        "",
        f"**Local Transport in {dest.title()}:**",
        "- Ride-hailing apps are the most reliable option",
        "- Auto-rickshaws for short distances — negotiate before boarding",
        "- Pre-paid taxi counters available at most airports",
        "",
        "**Best Time to Visit Attractions:**",
        "- Major temples and monuments: 7 AM – 10 AM (before crowds)",
        "- Beaches: early morning (6–8 AM) or late evening (5–7 PM)",
        "- Markets and bazaars: afternoon onwards",
        "",
        "---",
    ]

    # ── TRIP SUMMARY ─────────────────────────────────────────────────────
    flight_booking = (
        f"{state.selected_flight.airline} {state.selected_flight.flight_number} — "
        f"`{state.flight_prebook.prebook_id}`"
        if state.selected_flight and state.flight_prebook
        else "Not booked"
    )
    hotel_booking = (
        ", ".join(pb.hotel.name for pb in list(state.hotel_prebooks.values())[:2])
        if state.hotel_prebooks else "Not booked"
    )
    activities_count = sum(
        len([x for x in [
            d.sightseeing, d.mid_morning, d.afternoon_activities, d.evening_activities
        ] if x]) for d in final.days
    )
    lines += [
        "", "## 📋 Trip Summary", "",
        "| | |",
        "|---|---|",
        f"| 📍 **Destination** | {dest.title()} |",
        f"| 🌙 **Duration** | {days} days |",
        f"| ✈️ **Flight** | {flight_booking} |",
        f"| 🏨 **Hotel** | {hotel_booking} |",
        f"| 🎡 **Activities Planned** | {activities_count} activities across {days} days |",
        f"| 💰 **Approx Budget** | ₹{final.total_cost:,.0f} |",
        f"| 📋 **Booking Status** | {'Fully Booked (Demo)' if state.hotel_prebooks else 'Flights Booked (Demo)'} |",
        "",
        f"> **Overall Recommendation:** {dest.title()} is an excellent choice for a "
        f"{_clean_enum(req.trip_type, 'leisure')} trip. "
        "Make sure to pre-book popular attractions and restaurants for a seamless experience.",
        "",
        "---",
        "",
        "*✨ Have a wonderful trip! For a new plan, type **new trip**.*",
    ]

    # ── IMPORTANT NOTES ──────────────────────────────────────────────────
    if final.important_notes:
        lines += ["", "## ⚠️ Important Notes", ""]
        for note in final.important_notes:
            lines.append(f"- {note}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Shared section renderers
# ---------------------------------------------------------------------------

def _render_highlights(web_data: Dict[str, Any]) -> List[str]:
    """
    Render destination highlights from research data.
    All items are truncated and cleaned — no raw snippets, no URLs.
    """
    lines: List[str] = []

    def _clean(text: str, max_len: int = 120) -> str:
        text = re.sub(r"https?://\S+", "", text).strip()
        text = re.sub(r"\s+", " ", text)
        # Keep only the first sentence if too long
        if len(text) > max_len:
            first = re.split(r"[.!?]", text)[0].strip()
            return first if len(first) > 20 else text[:max_len] + "…"
        return text

    if web_data.get("top_places"):
        lines += ["### 🗺️ Top Attractions", ""]
        seen: set = set()
        for item in web_data["top_places"][:5]:
            cleaned = _clean(item)
            key = cleaned.lower()[:50]
            if key not in seen and len(cleaned) > 15:
                seen.add(key)
                lines.append(f"- {cleaned}")
        lines.append("")

    if web_data.get("activities"):
        lines += ["### 🎯 Must-Try Experiences", ""]
        seen = set()
        for item in web_data["activities"][:5]:
            cleaned = _clean(item)
            key = cleaned.lower()[:50]
            if key not in seen and len(cleaned) > 15:
                seen.add(key)
                lines.append(f"- {cleaned}")
        lines.append("")

    if web_data.get("restaurants"):
        lines += ["### 🍽️ Food & Dining", ""]
        seen = set()
        for item in web_data["restaurants"][:5]:
            cleaned = _clean(item)
            key = cleaned.lower()[:50]
            if key not in seen and len(cleaned) > 15:
                seen.add(key)
                lines.append(f"- {cleaned}")
        lines.append("")

    if web_data.get("events"):
        lines += ["### 🎭 Events & Festivals", ""]
        seen = set()
        for item in web_data["events"][:4]:
            cleaned = _clean(item)
            key = cleaned.lower()[:50]
            if key not in seen and len(cleaned) > 15:
                seen.add(key)
                lines.append(f"- {cleaned}")
        lines.append("")

    return lines


def _render_day(day: DayActivity) -> List[str]:
    """Render a single day's plan as structured, professional markdown."""
    lines: List[str] = [
        f"---",
        f"",
        f"## 📅 Day {day.day_number} — {day.date}",
        "",
    ]

    # Morning block
    lines += [
        "### 🌅 Morning",
        "",
        f"**Overview:** {day.morning}",
        "",
        f"🍳 **Breakfast:** {day.breakfast}",
        "",
    ]
    if day.mid_morning:
        lines += [f"🚶 **Mid-Morning:** {day.mid_morning}", ""]

    # Sightseeing
    lines += [
        "### 🗺️ Sightseeing",
        "",
        f"{day.sightseeing}",
        "",
    ]
    if day.travel_time:
        lines += [f"🚗 **Travel:** {day.travel_time}", ""]

    # Afternoon block
    lines += [
        "### ☀️ Afternoon",
        "",
        f"🍽️ **Lunch:** {day.lunch}",
        "",
        f"🎯 **Activities:** {day.afternoon_activities}",
        "",
    ]

    # Evening block
    lines += [
        "### 🌆 Evening",
        "",
        f"🌇 **Evening:** {day.evening_activities}",
        "",
        f"🍴 **Dinner:** {day.dinner}",
        "",
    ]
    if day.night:
        lines += [f"🌙 **Night:** {day.night}", ""]

    # Accommodation
    lines += [
        f"🏨 **Accommodation:** {day.hotel_stay}",
        "",
    ]

    # Timeline table
    if day.timeline:
        lines += [
            "### 🕐 Daily Timeline",
            "",
            "| Time | Activity |",
            "|------|----------|",
        ]
        for entry in day.timeline:
            t = entry.get("time", "").strip()
            a = entry.get("activity", "").strip()
            if t and a:
                lines.append(f"| {t} | {a} |")
        lines.append("")

    # Travel details
    if day.travel_details:
        lines += [
            "### 🚌 Travel Details",
            "",
            "| From | To | Distance | Time | Transport |",
            "|------|----|----------|------|-----------|",
        ]
        for td in day.travel_details:
            lines.append(
                f"| {td.from_place} | {td.to_place} | "
                f"{td.distance} | {td.est_time} | {td.transport} |"
            )
        lines.append("")

    # Restaurant recommendations
    if day.restaurants:
        lines += [
            "### 🍽️ Restaurant Recommendations",
            "",
            "| Restaurant | Cuisine | Approx Cost | Why Visit |",
            "|------------|---------|-------------|-----------|",
        ]
        for r in day.restaurants:
            lines.append(
                f"| **{r.name}** | {r.cuisine} | {r.approx_cost} | {r.why} |"
            )
        lines.append("")

    # Daily cost
    if day.daily_cost:
        dc = day.daily_cost
        lines += [
            "### 💸 Estimated Daily Cost",
            "",
            "| Category | Amount |",
            "|----------|--------|",
            f"| 🍽️ Food | ₹{dc.food:,.0f} |",
            f"| 🚗 Transport | ₹{dc.transport:,.0f} |",
            f"| 🎟️ Tickets & Entries | ₹{dc.tickets:,.0f} |",
            f"| 🛍️ Shopping | ₹{dc.shopping:,.0f} |",
            f"| **Total** | **₹{dc.total:,.0f}** |",
            "",
        ]

    return lines
