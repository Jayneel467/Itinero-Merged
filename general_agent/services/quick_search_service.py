"""
Quick, search-only flight/hotel lookups for Vero (general_agent).

Reuses the EXACT same search code ITINERARY_AGENT's booking flow already
uses — FlightAgent.search_flights() / HotelAgent.search_hotels(), live
LiteAPI only (no dummy fares). No separate search implementation.

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
    max_results: int = 12,
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

    left_nav = {
        "type": "search_flights",
        "origin": resolved_origin,
        "destination": resolved_destination,
        "depart_date": departure_date,
        "return_date": return_date,
        "trip": "return" if return_date else "oneway",
        "adults": adults,
        "cabin": cabin_class or "Economy",
    }

    if not response.flights:
        # Never tell the LLM the route "doesn't exist". Left page (supervisor +
        # hub pairing) often has inventory the agent preview missed.
        return {
            "text": (
                f"Live preview for {origin} → {destination} on {departure_date} came back thin. "
                "Do NOT say there are no flights. Open the left Itinero flights page for the "
                "same route/date and tell the user results are loading there. "
                "Offer ±1 day only if the left list is also empty."
            ),
            "cards": None,
            "flights": [],
            "left_nav": left_nav,
        }

    dumped = [f.model_dump(mode="json") for f in response.flights]
    # Drop consolidator shells that duplicate real marketing carriers.
    from services.card_mapping import _GDS_SHELL_RE, _airline_label

    cleaned = []
    seen_sched: set[str] = set()
    for f in dumped:
        raw_airline = f.get("airline")
        raw_name = (
            str(raw_airline.get("name") or "")
            if isinstance(raw_airline, dict)
            else str(raw_airline or "")
        )
        # Drop pure consolidator shells (APG / Hahn Air / …) — they duplicate real carriers.
        if _GDS_SHELL_RE.search(raw_name):
            continue
        label = _airline_label(f)
        key = "|".join(
            [
                str(f.get("flight_number") or ""),
                str(f.get("departure_time") or "")[:16],
                str(f.get("arrival_time") or "")[:16],
                str(f.get("price_per_adult") or ""),
            ]
        )
        if key in seen_sched:
            continue
        seen_sched.add(key)
        f = {**f, "airline": label}
        cleaned.append(f)
    dumped = cleaned or dumped
    by_airline: dict[str, list] = {}
    for f in dumped:
        name = str(f.get("airline") or f.get("airline_code") or "Airline")
        by_airline.setdefault(name, []).append(f)
    diversified: list = []
    queues = [list(v) for v in by_airline.values()]
    added = True
    while added and len(diversified) < max_results:
        added = False
        for q in queues:
            if q and len(diversified) < max_results:
                diversified.append(q.pop(0))
                added = True
    flights = diversified or dumped[:max_results]

    cards = flight_cards(
        flights,
        title=f"Flights: {origin} -> {destination}",
        subtitle=f"Departure: {departure_date}"
        + (f" · Return: {return_date}" if return_date else "")
        + f" · {adults} passenger(s)",
    )

    # Keep tool text short — UI renders selectable cards. Do not number options.
    text = (
        f"Found {len(flights)} flights {origin} → {destination} on {departure_date}"
        + (f" (return {return_date})" if return_date else "")
        + f". Cards are shown in the UI — do NOT re-list them as numbered text. "
        f"One short line + ask which to pick (or more options)."
    )

    return {"text": text, "cards": cards, "flights": flights, "left_nav": left_nav}


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

    left_nav = {
        "type": "search_hotels",
        "city": location.split(",")[0].strip() or location,
        "check_in": check_in,
        "check_out": check_out,
        "guests": adults,
    }

    if not response.hotels:
        return {
            "text": (
                f"Live hotel preview for {location} ({check_in} → {check_out}) came back thin. "
                "Do NOT say there are no hotels. Open the left hotels page and let the user browse."
            ),
            "cards": None,
            "hotels": [],
            "left_nav": left_nav,
        }

    hotels = [h.model_dump(mode="json") for h in response.hotels[:max_results]]

    cards = hotel_cards(
        hotels,
        title=f"Hotels in {location}",
        subtitle=f"{check_in} to {check_out} · {adults} adult(s)",
    )

    # Keep tool text short — UI renders selectable cards. Do not number options.
    text = (
        f"Found {len(hotels)} hotels in {location} ({check_in} → {check_out}). "
        f"Cards are shown in the UI — do NOT re-list them as numbered text. "
        f"One short line + ask which to pick (or more options)."
    )

    return {"text": text, "cards": cards, "hotels": hotels, "left_nav": left_nav}
