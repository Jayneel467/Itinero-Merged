"""
Quick, search-only flight/hotel lookups for Vero (general_agent).

Reuses the EXACT same search code ITINERARY_AGENT's booking flow already
uses — FlightAgent.search_flights() / HotelAgent.search_hotels(), which try
real LiteAPI data first and fall back to LLM-generated data only if that
fails. No separate search implementation, no ITINERARY_AGENT changes.

Search-only: nothing here ever prebooks anything. When the user commits to a
specific result, llm/tools.py's select_searched_flight/select_searched_hotel
looks it up (by id, from the cache this module writes into trip_context) and
hands the exact structured option to the itinerary escalation flow — see
itinerary_bridge.py::_apply_preselected_flight.
"""
from __future__ import annotations

import logging
import os
import sys
from datetime import date
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ── Resolve ITINERARY_AGENT package path (same pattern as itinerary_bridge.py) ──
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_GA_DIR = os.path.dirname(_THIS_DIR)
_PROJECT_ROOT = os.path.dirname(_GA_DIR)
_ITINERARY_PKG = os.path.join(_PROJECT_ROOT, "ITINERARY_AGENT")
for _p in [_PROJECT_ROOT, _GA_DIR, _ITINERARY_PKG]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

from ai_travel_planner.state.models import (
    CabinClass,
    FlightSearchParams,
    HotelSearchParams,
    MealPlan,
    TripType,
)
from ai_travel_planner.agents.flight_agent import FlightAgent
from ai_travel_planner.agents.hotel_agent import HotelAgent

from services.card_mapping import flight_cards, hotel_cards
from services import location_resolver

# ── Lazy singletons — mirrors ai_travel_planner/graph/nodes.py's own pattern,
# avoids constructing a fresh LLM client on every search call. ──────────────
_flight_agent: FlightAgent | None = None
_hotel_agent: HotelAgent | None = None


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


_CABIN_MAP = {
    "economy": CabinClass.ECONOMY,
    "premium economy": CabinClass.PREMIUM_ECONOMY,
    "business": CabinClass.BUSINESS,
    "first": CabinClass.FIRST,
}

_MEAL_MAP = {
    "room only": MealPlan.ROOM_ONLY,
    "breakfast": MealPlan.BREAKFAST,
    "breakfast included": MealPlan.BREAKFAST,
    "half board": MealPlan.HALF_BOARD,
    "full board": MealPlan.FULL_BOARD,
    "all inclusive": MealPlan.ALL_INCLUSIVE,
}


def run_flight_search(
    origin: str,
    destination: str,
    departure_date: str,
    return_date: Optional[str] = None,
    adults: int = 1,
    cabin_class: str = "Economy",
    max_budget_per_person: Optional[float] = None,
    nonstop_preferred: bool = False,
    max_results: int = 5,
) -> dict[str, Any]:
    """Returns {"text": str, "cards": dict|None, "flights": list[dict]}."""
    # LiteAPI's real flight search requires a 3-letter IATA code, not a
    # plain city name ("Mumbai" -> 400 "invalid IATA airport code") -
    # resolve it here so real data gets a real chance instead of an
    # near-guaranteed 400 that silently falls back to LLM-generated data.
    # Falls back to the original string if resolution fails - never worse
    # than before.
    resolved_origin = location_resolver.resolve_airport_code(origin) or origin
    resolved_destination = location_resolver.resolve_airport_code(destination) or destination

    params = FlightSearchParams(
        origin=resolved_origin,
        destination=resolved_destination,
        departure_date=date.fromisoformat(departure_date),
        return_date=date.fromisoformat(return_date) if return_date else None,
        adults=adults,
        cabin_class=_CABIN_MAP.get((cabin_class or "economy").lower(), CabinClass.ECONOMY),
        trip_type=TripType.ROUND_TRIP if return_date else TripType.ONE_WAY,
        max_budget_per_person=max_budget_per_person,
        nonstop_preferred=nonstop_preferred,
    )
    instruction = (
        f"Search flights {origin} -> {destination} on {departure_date}"
        + (f", returning {return_date}" if return_date else "")
        + f" for {adults} adult(s)."
        + (f" Max budget per person: {max_budget_per_person}." if max_budget_per_person else "")
        + (" Nonstop preferred." if nonstop_preferred else "")
    )

    response = _get_flight_agent().search_flights(instruction=instruction, search_params=params)

    if not response.flights:
        return {
            "text": f"No flights found from {origin} to {destination} on {departure_date}.",
            "cards": None,
            "flights": [],
        }

    flights = [f.model_dump(mode="json") for f in response.flights[:max_results]]

    lines = [
        f"Flights: {origin} -> {destination} ({departure_date}"
        + (f", return {return_date}" if return_date else "") + f"), {adults} passenger(s):"
    ]
    for i, f in enumerate(flights, 1):
        dep = str(f["departure_time"])[11:16]
        arr = str(f["arrival_time"])[11:16]
        stops_str = "Nonstop" if f["stops"] == 0 else f"{f['stops']} stop(s)"
        lines.append(
            f"{i}. {f['airline']} {f['flight_number']} | {dep} -> {arr} | "
            f"{f['duration_minutes']}min | {stops_str} | Rs.{f['price_per_adult']:.0f}/adult "
            f"| id={f['flight_id']}"
        )

    cards = flight_cards(
        flights,
        title=f"Flights: {origin} -> {destination}",
        subtitle=f"Departure: {departure_date}" + (f" · Return: {return_date}" if return_date else "") + f" · {adults} passenger(s)",
    )

    return {"text": "\n".join(lines), "cards": cards, "flights": flights}


def run_hotel_search(
    location: str,
    check_in: str,
    check_out: str,
    adults: int = 2,
    max_budget_per_night: Optional[float] = None,
    min_star_rating: Optional[float] = None,
    meal_plan: Optional[str] = None,
    free_cancellation: bool = False,
    room_type_preference: Optional[str] = None,
    max_results: int = 5,
) -> dict[str, Any]:
    """Returns {"text": str, "cards": dict|None, "hotels": list[dict]}."""
    # LiteAPI's real hotel search requires a resolvable location - country
    # code, lat/lng, placeId, IATA code, or hotelIds. HotelAgent's own
    # parsing (untouched) expects "City, XX" and takes the LAST comma
    # segment literally as the ISO country code, so a bare city name
    # ("Goa") always 400s. Resolve and reformat here; falls back to the
    # original string if resolution fails - never worse than before.
    resolved_location = location
    country_code = location_resolver.resolve_country_code(location)
    if country_code:
        city_part = location.split(",")[0].strip()
        resolved_location = f"{city_part}, {country_code}"

    params = HotelSearchParams(
        location=resolved_location,
        check_in=date.fromisoformat(check_in),
        check_out=date.fromisoformat(check_out),
        adults=adults,
        max_budget_per_night=max_budget_per_night,
        min_star_rating=min_star_rating if min_star_rating is not None else 3.0,
        meal_plan=_MEAL_MAP.get((meal_plan or "breakfast").lower(), MealPlan.BREAKFAST),
        free_cancellation=free_cancellation,
        room_type_preference=room_type_preference,
    )
    instruction = (
        f"Search hotels in {location} for {check_in} to {check_out}, {adults} adult(s)."
        + (f" Max budget per night: {max_budget_per_night}." if max_budget_per_night else "")
        + (f" Minimum {min_star_rating} star rating." if min_star_rating else "")
        + (" Free cancellation required." if free_cancellation else "")
        + (f" Room type preference: {room_type_preference}." if room_type_preference else "")
    )

    response = _get_hotel_agent().search_hotels(instruction=instruction, search_params=params, day_label="quick")

    if not response.hotels:
        return {
            "text": f"No hotels found in {location} for {check_in} to {check_out}.",
            "cards": None,
            "hotels": [],
        }

    hotels = [h.model_dump(mode="json") for h in response.hotels[:max_results]]

    lines = [f"Hotels in {location} ({check_in} to {check_out}, {adults} adult(s)):"]
    for i, h in enumerate(hotels, 1):
        lines.append(
            f"{i}. {h['name']} ({h['star_rating']}*) | {h['room_type']} | {h['meal_plan']} "
            f"| Rs.{h['price_per_night']:.0f}/night | {h['cancellation_policy']} | id={h['hotel_id']}"
        )

    cards = hotel_cards(
        hotels,
        title=f"Hotels in {location}",
        subtitle=f"{check_in} to {check_out} · {adults} adult(s)",
    )

    return {"text": "\n".join(lines), "cards": cards, "hotels": hotels}
