"""
Flight Agent
============
An independent LLM-powered agent that handles all flight-related operations:
  - search_flights()
  - filter_flights()
  - recommend_flights()
  - select_flight()
  - prebook_flight()

Architecture
------------
The Flight Agent is a *worker* agent.  It never speaks to the user directly.
It receives a rich natural-language instruction from the Itinerary Agent,
reasons about it, generates realistic dummy flight data, applies filters and
ranking, and returns a structured FlightAgentResponse / FlightPrebookResponse.

Replacing the dummy data layer with a real API (e.g. Duffel) requires only
swapping out the `_generate_dummy_flights()` and `_call_prebook_api()` methods.
"""

from __future__ import annotations

import json
import random
import uuid
from datetime import datetime, timedelta
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from ai_travel_planner.state.models import (
    AgentResponseStatus,
    CabinClass,
    FlightAgentResponse,
    FlightOption,
    FlightPrebook,
    FlightPrebookResponse,
    FlightSearchParams,
    TripType,
)
from ai_travel_planner.utils.config import get_settings
from ai_travel_planner.utils.logger import get_logger

logger = get_logger("agents.flight_agent")


# ─────────────────────────────────────────────────────────────────────────────
# Prompt Templates
# ─────────────────────────────────────────────────────────────────────────────

_FLIGHT_AGENT_SYSTEM_PROMPT = """\
You are an expert Flight Search Agent for an AI Travel Planning system.

Your responsibilities:
1. Parse the natural-language instruction you receive from the Itinerary Agent.
2. Generate realistic dummy flight data that matches the request.
3. Apply the requested filters (budget, stops, time-of-day, airline, cabin class).
4. Rank results by value score (price + duration + stops + user preference).
5. Identify the single best-value recommendation.
6. Return a structured JSON response conforming EXACTLY to the schema provided.

Flight Data Generation Rules:
- Generate between 6 and 10 flight options.
- Use real airline names operating on the requested route.
- Generate realistic flight numbers (e.g., "AI 204", "6E 716", "SG 112").
- Departure times spread across early-morning (05:00–08:00), morning (08:00–12:00),
  afternoon (12:00–17:00), and evening (17:00–22:00) slots.
- Duration must be realistic for the route distance.
- Price variation: ±30 % around a realistic base fare for the route.
- Stops: 70 % nonstop, 30 % one-stop for domestic; 40 % nonstop, 60 % one-stop for international.
- Baggage: economy gets 15 kg check-in + 7 kg cabin; business gets 30 kg + 7 kg.
- Seats available: random between 2 and 18.
- Rank score: 0–10 float; higher = better value.
- Mark exactly one flight as recommended=true (the highest-ranked one).

Always respond with valid JSON only. No markdown fences, no extra text.

Response schema:
{
  "status": "success" | "not_found" | "error",
  "action_performed": "<string>",
  "summary": "<one-sentence human-readable summary>",
  "flights": [ <FlightOption objects> ],
  "recommended_flight_id": "<flight_id of best option>",
  "total_results": <int>,
  "filters_applied": { <key: value> },
  "errors": [],
  "suggested_next_action": "<string>"
}

FlightOption schema:
{
  "flight_id": "FL-XXXXXXXX",
  "airline": "<name>",
  "flight_number": "<code number>",
  "origin": "<city or IATA>",
  "destination": "<city or IATA>",
  "departure_time": "YYYY-MM-DDTHH:MM:SS",
  "arrival_time": "YYYY-MM-DDTHH:MM:SS",
  "duration_minutes": <int>,
  "stops": <int>,
  "stopover_cities": [],
  "cabin_class": "Economy" | "Premium Economy" | "Business" | "First",
  "price_per_adult": <float>,
  "price_per_child": <float>,
  "total_price": <float>,
  "baggage_included": "<string>",
  "refund_policy": "Non-refundable" | "Partially Refundable" | "Fully Refundable",
  "seats_available": <int>,
  "rank_score": <float 0-10>,
  "recommended": <bool>
}
"""

_PREBOOK_SYSTEM_PROMPT = """\
You are an expert Flight Pre-Booking Agent.

You receive a pre-booking instruction containing the selected flight details and
passenger information.  Generate a realistic pre-booking confirmation record.

Rules:
- Generate a unique prebook_id in the format "FPB-XXXXXXXXXX" (10 hex chars, uppercase).
- booking_expiry = instruction_timestamp + 30 minutes.
- booking_status = "Pre-booked (Pending Confirmation)".
- Confirm total_price = price_per_adult * adults + price_per_child * children.

Always respond with valid JSON only. No markdown fences, no extra text.

Response schema:
{
  "status": "success" | "error",
  "action_performed": "prebook_flight",
  "summary": "<human-readable confirmation sentence>",
  "prebook": {
    "prebook_id": "FPB-XXXXXXXXXX",
    "flight_id": "<flight_id>",
    "passengers": { "adults": <int>, "children": <int> },
    "total_price": <float>,
    "currency": "INR",
    "booking_status": "Pre-booked (Pending Confirmation)",
    "booking_expiry": "YYYY-MM-DDTHH:MM:SS"
  },
  "errors": [],
  "suggested_next_action": "Review draft itinerary"
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# Flight Agent
# ─────────────────────────────────────────────────────────────────────────────


class FlightAgent:
    """
    LLM-powered Flight Agent.

    All public methods accept a natural-language instruction string (as sent by
    the Itinerary Agent) plus optional structured hints, and return Pydantic
    models so the Itinerary Agent always gets type-safe data.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._llm = ChatOpenAI(
            model=settings.flight_agent_model,
            temperature=settings.flight_agent_temperature,
            api_key=settings.openai_api_key,
        )
        logger.info("FlightAgent initialised with model=%s", settings.flight_agent_model)

    # ── Public interface ──────────────────────────────────────────────────────

    def search_flights(
        self,
        instruction: str,
        search_params: FlightSearchParams | None = None,
    ) -> FlightAgentResponse:
        """
        Search flights based on a natural-language instruction.

        The instruction is the primary input; search_params provides optional
        structured context to help the LLM generate more accurate dummy data.
        """
        logger.info("FlightAgent.search_flights called")
        logger.debug("Instruction: %s", instruction)

        enriched_instruction = self._enrich_search_instruction(instruction, search_params)
        raw_json = self._call_llm(_FLIGHT_AGENT_SYSTEM_PROMPT, enriched_instruction)
        return self._parse_search_response(raw_json, instruction)

    def filter_flights(
        self,
        instruction: str,
        existing_flights: list[FlightOption],
    ) -> FlightAgentResponse:
        """Apply filters to an existing list of flight options."""
        logger.info("FlightAgent.filter_flights called (%d options)", len(existing_flights))

        flights_json = json.dumps(
            [f.model_dump(mode="json") for f in existing_flights], default=str
        )
        full_instruction = (
            f"{instruction}\n\n"
            f"Apply the filters to the following flights and return only matching ones:\n"
            f"{flights_json}"
        )
        raw_json = self._call_llm(_FLIGHT_AGENT_SYSTEM_PROMPT, full_instruction)
        return self._parse_search_response(raw_json, instruction)

    def recommend_flights(
        self,
        instruction: str,
        flights: list[FlightOption],
    ) -> FlightAgentResponse:
        """Rank flights and identify the single best recommendation."""
        logger.info("FlightAgent.recommend_flights called (%d options)", len(flights))

        flights_json = json.dumps(
            [f.model_dump(mode="json") for f in flights], default=str
        )
        full_instruction = (
            f"{instruction}\n\n"
            f"Rank these flights and identify the best recommendation:\n"
            f"{flights_json}"
        )
        raw_json = self._call_llm(_FLIGHT_AGENT_SYSTEM_PROMPT, full_instruction)
        return self._parse_search_response(raw_json, instruction)

    def select_flight(
        self,
        flight: FlightOption,
        passengers: dict[str, int],
    ) -> FlightAgentResponse:
        """Confirm a user-selected flight and calculate total price."""
        logger.info("FlightAgent.select_flight: %s", flight.flight_id)

        adults = passengers.get("adults", 1)
        children = passengers.get("children", 0)
        total = flight.price_per_adult * adults + flight.price_per_child * children

        updated_flight = flight.model_copy(
            update={"total_price": total, "recommended": True}
        )

        return FlightAgentResponse(
            status=AgentResponseStatus.SUCCESS,
            action_performed="select_flight",
            summary=(
                f"Flight {flight.airline} {flight.flight_number} selected. "
                f"Total price for {adults} adult(s) and {children} child(ren): "
                f"₹{total:,.0f}."
            ),
            flights=[updated_flight],
            recommended_flight=updated_flight,
            selected_flight=updated_flight,
            total_results=1,
            suggested_next_action="Confirm pre-booking",
            raw_instruction="select_flight",
        )

    def prebook_flight(
        self,
        instruction: str,
        flight: FlightOption,
        passengers: dict[str, int],
    ) -> FlightPrebookResponse:
        """Pre-book the selected flight and return a pre-booking record."""
        logger.info("FlightAgent.prebook_flight: %s", flight.flight_id)

        adults = passengers.get("adults", 1)
        children = passengers.get("children", 0)
        total = flight.price_per_adult * adults + flight.price_per_child * children

        prebook_instruction = (
            f"{instruction}\n\n"
            f"Pre-book the following flight for {adults} adult(s) and {children} child(ren).\n"
            f"Flight details: {json.dumps(flight.model_dump(mode='json'), default=str)}\n"
            f"Total price: ₹{total:,.0f}\n"
            f"Current timestamp: {datetime.now().isoformat()}"
        )

        raw_json = self._call_llm(_PREBOOK_SYSTEM_PROMPT, prebook_instruction)
        return self._parse_prebook_response(raw_json, flight, passengers, total)

    # ── LLM call ─────────────────────────────────────────────────────────────

    def _call_llm(self, system_prompt: str, user_instruction: str) -> str:
        """Invoke the LLM and return the raw text response."""
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_instruction),
        ]
        try:
            response = self._llm.invoke(messages)
            content = str(response.content).strip()
            # Strip markdown fences if the model wraps them anyway
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            logger.debug("FlightAgent LLM raw response (first 300 chars): %s", content[:300])
            return content
        except Exception as exc:
            logger.error("FlightAgent LLM call failed: %s", exc)
            raise

    # ── Instruction enrichment ────────────────────────────────────────────────

    @staticmethod
    def _enrich_search_instruction(
        instruction: str,
        params: FlightSearchParams | None,
    ) -> str:
        """Append structured hints to the natural-language instruction."""
        if params is None:
            return instruction
        hints = (
            f"\n\nStructured parameters for accuracy:\n"
            f"  Origin: {params.origin}\n"
            f"  Destination: {params.destination}\n"
            f"  Departure Date: {params.departure_date}\n"
            f"  Return Date: {params.return_date}\n"
            f"  Adults: {params.adults}\n"
            f"  Children: {params.children}\n"
            f"  Cabin Class: {params.cabin_class.value}\n"
            f"  Trip Type: {params.trip_type.value}\n"
            f"  Max Budget Per Person: {params.max_budget_per_person}\n"
            f"  Nonstop Preferred: {params.nonstop_preferred}\n"
        )
        return instruction + hints

    # ── Response parsers ──────────────────────────────────────────────────────

    def _parse_search_response(
        self,
        raw_json: str,
        original_instruction: str,
    ) -> FlightAgentResponse:
        """Parse raw LLM JSON into a validated FlightAgentResponse."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            logger.error("FlightAgent JSON parse error: %s\nRaw: %s", exc, raw_json[:500])
            return FlightAgentResponse(
                status=AgentResponseStatus.ERROR,
                action_performed="search_flights",
                summary="Failed to parse flight search response.",
                errors=[str(exc)],
                suggested_next_action="Retry the search",
                raw_instruction=original_instruction,
            )

        # Build FlightOption list
        flights: list[FlightOption] = []
        recommended_flight: FlightOption | None = None
        recommended_id = data.get("recommended_flight_id", "")

        for raw_flight in data.get("flights", []):
            try:
                flight = FlightOption(**raw_flight)
                # Ensure total_price is set
                if not flight.total_price:
                    flight = flight.model_copy(
                        update={"total_price": flight.price_per_adult}
                    )
                flights.append(flight)
                if flight.flight_id == recommended_id:
                    recommended_flight = flight
            except Exception as e:
                logger.warning("Skipping malformed flight record: %s", e)

        # Fallback: if recommended_id didn't match, pick highest rank_score
        if not recommended_flight and flights:
            recommended_flight = max(flights, key=lambda f: f.rank_score)
            recommended_flight = recommended_flight.model_copy(update={"recommended": True})
            flights = [
                (f.model_copy(update={"recommended": True}) if f.flight_id == recommended_flight.flight_id else f)
                for f in flights
            ]

        status_str = data.get("status", "success")
        try:
            status = AgentResponseStatus(status_str)
        except ValueError:
            status = AgentResponseStatus.SUCCESS

        return FlightAgentResponse(
            status=status if flights else AgentResponseStatus.NOT_FOUND,
            action_performed=data.get("action_performed", "search_flights"),
            summary=data.get("summary", f"Found {len(flights)} flights."),
            flights=flights,
            recommended_flight=recommended_flight,
            total_results=len(flights),
            filters_applied=data.get("filters_applied", {}),
            errors=data.get("errors", []),
            suggested_next_action=data.get("suggested_next_action", "Present options to user"),
            raw_instruction=original_instruction,
        )

    def _parse_prebook_response(
        self,
        raw_json: str,
        flight: FlightOption,
        passengers: dict[str, int],
        total_price: float,
    ) -> FlightPrebookResponse:
        """Parse raw LLM JSON into a validated FlightPrebookResponse."""
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            logger.error("FlightAgent prebook JSON parse error: %s", exc)
            return FlightPrebookResponse(
                status=AgentResponseStatus.ERROR,
                summary="Pre-booking failed — invalid response.",
                errors=[str(exc)],
            )

        prebook_data = data.get("prebook", {})

        # Build the expiry datetime
        expiry_str = prebook_data.get("booking_expiry")
        if expiry_str:
            try:
                expiry = datetime.fromisoformat(expiry_str)
            except ValueError:
                expiry = datetime.now() + timedelta(minutes=30)
        else:
            expiry = datetime.now() + timedelta(minutes=30)

        prebook = FlightPrebook(
            prebook_id=prebook_data.get(
                "prebook_id", f"FPB-{uuid.uuid4().hex[:10].upper()}"
            ),
            flight=flight,
            passengers=passengers,
            total_price=total_price,
            currency=prebook_data.get("currency", "INR"),
            booking_status=prebook_data.get(
                "booking_status", "Pre-booked (Pending Confirmation)"
            ),
            booking_expiry=expiry,
        )

        status_str = data.get("status", "success")
        try:
            status = AgentResponseStatus(status_str)
        except ValueError:
            status = AgentResponseStatus.SUCCESS

        return FlightPrebookResponse(
            status=status,
            action_performed="prebook_flight",
            summary=data.get(
                "summary",
                f"Flight {flight.airline} {flight.flight_number} pre-booked. "
                f"Prebook ID: {prebook.prebook_id}.",
            ),
            prebook=prebook,
            errors=data.get("errors", []),
            suggested_next_action=data.get(
                "suggested_next_action", "Review draft itinerary"
            ),
        )
