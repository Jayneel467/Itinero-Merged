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
searches live LiteAPI fares, and returns a structured FlightAgentResponse.
"""

from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timedelta
from typing import Any

# ── Resolve general_agent package so we can reach the real LiteAPI provider ──
# ITINERARY_AGENT lives at: <root>/ITINERARY_AGENT/
# general_agent lives at:   <root>/general_agent/
# We need to add <root>/ to sys.path so `from general_agent.xxx` imports work.
_ITINERARY_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_PROJECT_ROOT = os.path.dirname(_ITINERARY_ROOT)
for _p in [_PROJECT_ROOT, _ITINERARY_ROOT]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

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
2. Work only with live fare data already provided — never invent prices.
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
        kwargs = {
            "model": settings.flight_agent_model,
            "temperature": settings.flight_agent_temperature,
            "api_key": settings.openai_api_key,
        }
        if getattr(settings, "openai_base_url", None):
            kwargs["base_url"] = settings.openai_base_url
        self._llm = ChatOpenAI(**kwargs)
        logger.info("FlightAgent initialised with model=%s", settings.flight_agent_model)

    # ── Public interface ──────────────────────────────────────────────────────

    def search_flights(
        self,
        instruction: str,
        search_params: FlightSearchParams | None = None,
    ) -> FlightAgentResponse:
        """
        Search flights based on a natural-language instruction.

        Tries real LiteAPI data first (via general_agent's travel_service).
        Returns an honest empty response if LiteAPI fails — never invents fares.
        """
        logger.info("FlightAgent.search_flights called")
        logger.debug("Instruction: %s", instruction)

        # ── Attempt real LiteAPI fetch ─────────────────────────────────────────
        if search_params is not None:
            real_flights = self._fetch_real_flights(search_params)
            if real_flights:
                logger.info("FlightAgent: using real LiteAPI data (%d results)", len(real_flights))
                return self._build_response_from_flights(real_flights, instruction)
            logger.warning("FlightAgent: real LiteAPI returned no results — no dummy fallback")

        # Honest empty — never LLM-fabricate prices for the user
        return FlightAgentResponse(
            status=AgentResponseStatus.NOT_FOUND,
            action_performed="search_flights",
            summary=(
                "I couldn't find live flight rates for that search right now. "
                "Try different dates or airports — I won't invent fares."
            ),
            flights=[],
            total_results=0,
            errors=["No live LiteAPI results"],
            suggested_next_action="Retry with different dates or airports",
            raw_instruction=instruction,
        )

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
        *,
        allowed_offer_ids: set[str] | list[str] | None = None,
    ) -> FlightPrebookResponse:
        """Verify the live LiteAPI offer. Never invent a fake FPB- hold.

        ``allowed_offer_ids`` must contain the offer — only IDs from this
        session's LiteAPI search (or verified quick-search cache) may be verified.
        """
        logger.info("FlightAgent.prebook_flight: %s", flight.flight_id)

        adults = passengers.get("adults", 1)
        children = passengers.get("children", 0)
        total = flight.price_per_adult * adults + flight.price_per_child * children
        offer_id = (getattr(flight, "offer_id", None) or "").strip()

        allowed = {
            str(x).strip()
            for x in (allowed_offer_ids or [])
            if str(x).strip()
        }
        if not offer_id:
            return FlightPrebookResponse(
                status=AgentResponseStatus.ERROR,
                action_performed="prebook_flight",
                summary=(
                    f"I couldn't hold {flight.airline} {flight.flight_number} — "
                    "missing a live offer id from search."
                ),
                errors=["Missing offer_id"],
                suggested_next_action="Search flights again",
            )
        if not allowed or offer_id not in allowed:
            logger.warning(
                "FlightAgent: rejecting unbound offer_id=%s (allowed=%s)",
                offer_id[:24],
                len(allowed),
            )
            return FlightPrebookResponse(
                status=AgentResponseStatus.ERROR,
                action_performed="prebook_flight",
                summary=(
                    "That flight offer is not from this search session. "
                    "Please search again and pick a listed option."
                ),
                errors=["offer_id not bound to session search"],
                suggested_next_action="Search flights again",
            )

        try:
            from general_agent.providers import liteapi_provider
            body = liteapi_provider.verify_flight_offer({"offerId": offer_id})
            data = body.get("data") if isinstance(body, dict) else {}
            if not isinstance(data, dict):
                data = {}
            verified_id = str(data.get("offerId") or data.get("id") or offer_id)
            expiry = datetime.now() + timedelta(minutes=30)
            prebook = FlightPrebook(
                prebook_id=verified_id,
                flight=flight,
                passengers=passengers,
                total_price=total,
                currency="INR",
                booking_status="Fare verified — complete passenger details to confirm",
                booking_expiry=expiry,
            )
            return FlightPrebookResponse(
                status=AgentResponseStatus.SUCCESS,
                action_performed="prebook_flight",
                summary=(
                    f"{flight.airline} {flight.flight_number} fare is live. "
                    f"Offer id: {prebook.prebook_id}."
                ),
                prebook=prebook,
                suggested_next_action="Review draft itinerary",
            )
        except Exception as exc:
            logger.warning("FlightAgent: live fare verify failed: %s", exc)

        return FlightPrebookResponse(
            status=AgentResponseStatus.ERROR,
            action_performed="prebook_flight",
            summary=(
                f"I couldn't hold {flight.airline} {flight.flight_number} just now. "
                "Complete booking on the left with passenger details — I won't invent a fake hold."
            ),
            errors=["Live fare verify unavailable"],
            suggested_next_action="Book on the flights page or retry",
        )

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

    # ── Real LiteAPI integration ──────────────────────────────────────────────

    def _fetch_real_flights(self, params: FlightSearchParams) -> list[FlightOption]:
        """
        Call the real LiteAPI via general_agent's travel_service and map the
        results to FlightOption Pydantic models.

        Returns an empty list on any failure so the caller can fall back.
        """
        try:
            from general_agent.services.travel_service import _parse_journey
        except ImportError as exc:
            logger.warning("FlightAgent: could not import _parse_journey: %s", exc)
            return []

        try:
            from general_agent.providers import liteapi_provider
            from general_agent.exceptions import ProviderRequestError
            try:
                from general_agent.services import location_resolver
            except ImportError:
                from services import location_resolver

            origin = str(params.origin or "").strip().upper()
            destination = str(params.destination or "").strip().upper()
            if not origin or not destination or not params.departure_date:
                return []
            if not re.fullmatch(r"[A-Z]{3}", origin):
                resolved_o = location_resolver.resolve_airport_code(origin)
                if resolved_o:
                    origin = resolved_o
            if not re.fullmatch(r"[A-Z]{3}", destination):
                resolved_d = location_resolver.resolve_airport_code(destination)
                if resolved_d:
                    destination = resolved_d

            cabin_map = {
                "Economy": "ECONOMY",
                "Premium Economy": "PREMIUM_ECONOMY",
                "Business": "BUSINESS",
                "First": "FIRST",
            }
            cabin = cabin_map.get(params.cabin_class.value if params.cabin_class else "Economy", "ECONOMY")

            dest_alts = {
                "DXB": ["DWC"],
                "DWC": ["DXB"],
                "JFK": ["EWR"],
                "EWR": ["JFK"],
                "LGA": ["JFK", "EWR"],
                "LHR": ["LGW"],
                "LGW": ["LHR"],
                "GOI": ["GOX"],
                "GOX": ["GOI"],
                "CDG": ["ORY"],
                "ORY": ["CDG"],
            }
            dest_try = [destination] + [c for c in dest_alts.get(destination, []) if c != destination]

            parsed: list[dict] = []
            used_dest = destination
            for dest in dest_try:
                legs = [
                    {
                        "origin": origin,
                        "destination": dest,
                        "date": str(params.departure_date),
                        "direction": "OUTBOUND",
                    }
                ]
                if params.return_date and params.trip_type and params.trip_type.value == "round_trip":
                    legs.append({
                        "origin": dest,
                        "destination": origin,
                        "date": str(params.return_date),
                        "direction": "INBOUND",
                    })
                payload = {
                    "legs": legs,
                    "adults": params.adults or 1,
                    "currency": "INR",
                    "cabinClass": cabin,
                }
                logger.info("FlightAgent LiteAPI search %s → %s on %s", origin, dest, params.departure_date)
                body = liteapi_provider.search_flight_rates(payload)
                batch: list[dict] = []
                for item in (body.get("data") or []):
                    for journey in (item.get("journeys") or []):
                        result = _parse_journey(journey, "INR")
                        if result:
                            batch.append(result)
                if batch:
                    parsed = batch
                    used_dest = dest
                    destination = used_dest
                    break

            if not parsed:
                return []

            # Collapse fare-family duplicates, then diversify so LCCs aren't buried.
            by_sched: dict[str, dict] = {}
            for f in parsed:
                key = "|".join(
                    [
                        str(f.get("airline_code") or f.get("airline") or "").upper(),
                        str(f.get("flight_number") or "").upper(),
                        str(f.get("dep_time") or ""),
                        str(f.get("arr_time") or ""),
                    ]
                )
                prev = by_sched.get(key)
                if prev is None or float(f.get("price") or 0) < float(prev.get("price") or 0):
                    by_sched[key] = f
            parsed = sorted(by_sched.values(), key=lambda x: float(x.get("price") or 0))

            by_airline: dict[str, list] = {}
            for f in parsed:
                name = str(f.get("airline") or f.get("airline_code") or "Airline")
                by_airline.setdefault(name, []).append(f)
            diversified: list[dict] = []
            queues = [list(v) for v in by_airline.values()]
            added = True
            while added and len(diversified) < 12:
                added = False
                for q in queues:
                    if q and len(diversified) < 12:
                        diversified.append(q.pop(0))
                        added = True
            parsed = diversified or parsed[:12]

            return self._map_liteapi_to_flight_options(parsed, params)

        except Exception as exc:
            logger.warning("FlightAgent: real flight fetch failed: %s", exc)
            return []

    def _map_liteapi_to_flight_options(
        self,
        parsed_flights: list[dict],
        params: FlightSearchParams,
    ) -> list[FlightOption]:
        """
        Map the parsed journey dicts (from travel_service._parse_journey) to
        FlightOption Pydantic models.
        """
        options: list[FlightOption] = []
        dep_date = params.departure_date

        for i, f in enumerate(parsed_flights):
            # Build realistic departure/arrival datetimes from HH:MM strings
            dep_str = f.get("dep_time", "08:00")
            arr_str = f.get("arr_time", "10:00")
            try:
                dep_h, dep_m = map(int, dep_str.split(":"))
                arr_h, arr_m = map(int, arr_str.split(":"))
            except (ValueError, AttributeError):
                dep_h, dep_m, arr_h, arr_m = 8, 0, 10, 0

            departure_dt = datetime(
                dep_date.year, dep_date.month, dep_date.day, dep_h, dep_m
            ) if dep_date else datetime.now()

            # Duration from string like "2h 30m" or "2h"
            duration_str = f.get("duration", "")
            duration_mins = 0
            if duration_str:
                import re
                h_m = re.search(r"(\d+)h", duration_str)
                m_m = re.search(r"(\d+)m", duration_str)
                duration_mins = (int(h_m.group(1)) * 60 if h_m else 0) + (int(m_m.group(1)) if m_m else 0)
            if duration_mins == 0:
                duration_mins = (arr_h * 60 + arr_m) - (dep_h * 60 + dep_m)
                if duration_mins < 0:
                    duration_mins += 24 * 60

            arrival_dt = departure_dt.replace(
                hour=arr_h % 24, minute=arr_m
            )
            if arr_h < dep_h:  # overnight flight
                from datetime import timedelta as _td
                arrival_dt = arrival_dt + _td(days=1)

            stops_str = f.get("stops", "Direct")
            stops_count = 0 if stops_str.lower() == "direct" else int(
                stops_str.split()[0]
            ) if stops_str[0].isdigit() else 1

            price = float(f.get("price", 0))
            adults = params.adults or 1
            children = params.children or 0
            total = price * adults + (price * 0.75 * children)

            baggage = "15 kg check-in + 7 kg cabin" if f.get("has_checked_bag") else "7 kg cabin only"
            if f.get("refundable") is True:
                refund = "Fully Refundable"
            elif f.get("refundable") is False:
                refund = "Non-refundable"
            else:
                refund = ""

            # Rank by price (cheaper = better score), capped 0-10
            max_price = max(p.get("price", 1) for p in parsed_flights) or 1
            rank_score = round(10 * (1 - price / max_price), 2)

            flight_number = f.get("flight_code", f"XX{100 + i}")
            airline = f.get("airline", "Airline")

            options.append(FlightOption(
                airline=airline,
                flight_number=flight_number,
                origin=f.get("origin", params.origin or ""),
                destination=f.get("dest", params.destination or ""),
                departure_time=departure_dt,
                arrival_time=arrival_dt,
                duration_minutes=max(duration_mins, 1),
                stops=stops_count,
                stopover_cities=[],
                cabin_class=params.cabin_class or CabinClass.ECONOMY,
                price_per_adult=price,
                price_per_child=round(price * 0.75, 2),
                total_price=round(total, 2),
                baggage_included=baggage,
                refund_policy=refund,
                seats_available=int(f.get("seats_available") or 0),
                offer_id=f.get("offer_id"),
                rank_score=rank_score,
                recommended=(i == 0),
            ))

        return options

    def _build_response_from_flights(
        self,
        flights: list[FlightOption],
        instruction: str,
    ) -> FlightAgentResponse:
        """Build a FlightAgentResponse directly from a list of FlightOption objects."""
        if not flights:
            return FlightAgentResponse(
                status=AgentResponseStatus.NOT_FOUND,
                action_performed="search_flights",
                summary="No flights found.",
                errors=["No results from real API."],
                raw_instruction=instruction,
            )
        recommended = max(flights, key=lambda f: f.rank_score)
        flights_with_rec = [
            f.model_copy(update={"recommended": f.flight_id == recommended.flight_id})
            for f in flights
        ]
        return FlightAgentResponse(
            status=AgentResponseStatus.SUCCESS,
            action_performed="search_flights",
            summary=f"Found {len(flights_with_rec)} real flights.",
            flights=flights_with_rec,
            recommended_flight=recommended,
            total_results=len(flights_with_rec),
            suggested_next_action="Present options to user",
            raw_instruction=instruction,
        )

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
