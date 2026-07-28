"""
Flight Agent — Dummy Implementation.

Provides realistic dummy flight data for:
  - Flight Search
  - Flight Search with Filters
  - Flight Ranking  (price / duration / best_value)
  - Flight Pre-book

Designed so the real API can be dropped in by replacing the
_fetch_raw_flights() method without touching any other code.
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

from backend.models.state import (
    CabinClass,
    Flight,
    FlightPrebook,
    FlightSearchParams,
    RankingCriteria,
)


# ---------------------------------------------------------------------------
# Internal dummy-data catalogue
# ---------------------------------------------------------------------------

_AIRLINES: List[dict] = [
    {"name": "Delta Airlines",      "code": "DL", "iata": "DL"},
    {"name": "American Airlines",   "code": "AA", "iata": "AA"},
    {"name": "United Airlines",     "code": "UA", "iata": "UA"},
    {"name": "Emirates",            "code": "EK", "iata": "EK"},
    {"name": "Lufthansa",           "code": "LH", "iata": "LH"},
    {"name": "British Airways",     "code": "BA", "iata": "BA"},
    {"name": "Air France",          "code": "AF", "iata": "AF"},
    {"name": "Singapore Airlines",  "code": "SQ", "iata": "SQ"},
    {"name": "Qatar Airways",       "code": "QR", "iata": "QR"},
    {"name": "Turkish Airlines",    "code": "TK", "iata": "TK"},
]

# Airport codes keyed by popular city names (lower-case)
_CITY_AIRPORT: dict = {
    "new york":       "JFK",
    "los angeles":    "LAX",
    "chicago":        "ORD",
    "london":         "LHR",
    "paris":          "CDG",
    "dubai":          "DXB",
    "tokyo":          "NRT",
    "singapore":      "SIN",
    "sydney":         "SYD",
    "toronto":        "YYZ",
    "frankfurt":      "FRA",
    "amsterdam":      "AMS",
    "bangkok":        "BKK",
    "istanbul":       "IST",
    "delhi":          "DEL",
    "mumbai":         "BOM",
    "hong kong":      "HKG",
    "barcelona":      "BCN",
    "rome":           "FCO",
    "miami":          "MIA",
    "san francisco":  "SFO",
    "seattle":        "SEA",
    "boston":         "BOS",
    "madrid":         "MAD",
    "zurich":         "ZRH",
    "bali":           "DPS",
    "maldives":       "MLE",
    "cairo":          "CAI",
    "cape town":      "CPT",
    "rio de janeiro": "GIG",
}


def _city_to_airport(city: str) -> str:
    """Best-effort city → IATA code lookup."""
    return _CITY_AIRPORT.get(city.lower().strip(), city.upper()[:3])


def _parse_date(date_str: str) -> datetime:
    """Parse an ISO date string into a datetime object."""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {date_str}")


# ---------------------------------------------------------------------------
# FlightAgent class
# ---------------------------------------------------------------------------

class FlightAgent:
    """
    Dummy Flight Agent.

    All public methods return typed Pydantic objects so the rest of the
    application never has to deal with raw dicts.
    """

    def __init__(self, seed: Optional[int] = None) -> None:
        # Optionally fix the random seed for reproducible demos
        self._rng = random.Random(seed)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def search_flights(self, params: FlightSearchParams) -> List[Flight]:
        """
        Search for available flights matching *params*.

        Returns a list of up to 8 flights, unranked.
        """
        raw = self._fetch_raw_flights(params)
        return self._apply_filters(raw, params)

    def search_and_rank(
        self,
        params: FlightSearchParams,
        criteria: RankingCriteria = RankingCriteria.BEST_VALUE,
    ) -> List[Flight]:
        """
        Search, filter, and rank flights in one call.

        Returns a list ordered by *criteria* (best first).
        """
        flights = self.search_flights(params)
        return self.rank_flights(flights, criteria)

    def rank_flights(
        self,
        flights: List[Flight],
        criteria: RankingCriteria = RankingCriteria.BEST_VALUE,
    ) -> List[Flight]:
        """
        Rank *flights* according to *criteria* and attach a ranking_score.

        ranking_score is normalised to 0-100 (higher = better).
        """
        if not flights:
            return []

        scored = []
        if criteria == RankingCriteria.PRICE:
            prices = [f.total_price for f in flights]
            min_p, max_p = min(prices), max(prices)
            span = max_p - min_p or 1
            for f in flights:
                score = 100 - ((f.total_price - min_p) / span * 100)
                scored.append(f.model_copy(update={"ranking_score": round(score, 1)}))

        elif criteria == RankingCriteria.DURATION:
            durations = [f.duration_minutes for f in flights]
            min_d, max_d = min(durations), max(durations)
            span = max_d - min_d or 1
            for f in flights:
                score = 100 - ((f.duration_minutes - min_d) / span * 100)
                scored.append(f.model_copy(update={"ranking_score": round(score, 1)}))

        else:  # BEST_VALUE — weighted composite
            prices    = [f.total_price      for f in flights]
            durations = [f.duration_minutes for f in flights]
            min_p, max_p = min(prices), max(prices)
            min_d, max_d = min(durations), max(durations)
            p_span = max_p - min_p or 1
            d_span = max_d - min_d or 1
            for f in flights:
                price_score    = 100 - ((f.total_price      - min_p) / p_span * 100)
                duration_score = 100 - ((f.duration_minutes - min_d) / d_span * 100)
                # bonus for non-stop and refundable
                stop_bonus      = 10 if f.stops == 0 else 0
                refund_bonus    = 5  if f.refundable else 0
                baggage_bonus   = 3  if f.baggage_included else 0
                score = (price_score * 0.5 + duration_score * 0.35
                         + stop_bonus + refund_bonus + baggage_bonus)
                scored.append(f.model_copy(update={"ranking_score": round(min(score, 100), 1)}))

        return sorted(scored, key=lambda f: f.ranking_score, reverse=True)

    def prebook_flight(
        self,
        flight: Flight,
        num_passengers: int,
    ) -> FlightPrebook:
        """
        Pre-book a flight and return a booking confirmation.

        In a real implementation this would call the airline API.
        """
        prebook_id = f"FLT-{uuid.uuid4().hex[:8].upper()}"
        total = round(flight.price_per_person * num_passengers, 2)
        return FlightPrebook(
            prebook_id=prebook_id,
            flight=flight,
            passengers=num_passengers,
            total_charged=total,
            status="confirmed",
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_raw_flights(self, params: FlightSearchParams) -> List[Flight]:
        """
        Generate realistic dummy flights for the given search parameters.

        Replace this method with a real API call (e.g. Amadeus, Skyscanner)
        to go live without changing anything else.
        """
        origin_code = _city_to_airport(params.origin)
        dest_code   = _city_to_airport(params.destination)
        dep_dt      = _parse_date(params.departure_date)

        cabin_price_multiplier = {
            CabinClass.ECONOMY:         1.0,
            CabinClass.PREMIUM_ECONOMY: 1.8,
            CabinClass.BUSINESS:        3.5,
            CabinClass.FIRST:           6.0,
        }

        # Estimate realistic base price from "distance bucket" (dummy heuristic)
        base_price = self._rng.uniform(180, 420) * cabin_price_multiplier.get(
            params.cabin_class or CabinClass.ECONOMY, 1.0
        )

        flights: List[Flight] = []
        num_options = self._rng.randint(5, 8)

        for i in range(num_options):
            airline     = self._rng.choice(_AIRLINES)
            flight_num  = f"{airline['iata']}{self._rng.randint(100, 9999)}"
            stops       = self._rng.choices([0, 1, 2], weights=[50, 35, 15])[0]
            duration    = self._rng.randint(90, 780) + stops * self._rng.randint(60, 90)
            hour_offset = self._rng.randint(0, 20)
            dep_time    = dep_dt.replace(hour=hour_offset, minute=self._rng.choice([0, 15, 30, 45]))
            arr_time    = dep_time + timedelta(minutes=duration)
            price_pp    = round(base_price * self._rng.uniform(0.75, 1.35), 2)
            total_price = round(price_pp * params.num_passengers, 2)
            cabin       = params.cabin_class or CabinClass.ECONOMY
            refundable  = self._rng.choice([True, False])
            baggage     = self._rng.choice([True, False])

            flights.append(
                Flight(
                    flight_id       = f"fl_{uuid.uuid4().hex[:6]}",
                    airline         = airline["name"],
                    flight_number   = flight_num,
                    departure_airport = origin_code,
                    arrival_airport   = dest_code,
                    departure_time  = dep_time.strftime("%Y-%m-%dT%H:%M:%S"),
                    arrival_time    = arr_time.strftime("%Y-%m-%dT%H:%M:%S"),
                    duration_minutes= duration,
                    stops           = stops,
                    price_per_person= price_pp,
                    total_price     = total_price,
                    cabin           = cabin,
                    refundable      = refundable,
                    baggage_included= baggage,
                )
            )

        return flights

    def _apply_filters(
        self,
        flights: List[Flight],
        params: FlightSearchParams,
    ) -> List[Flight]:
        """Filter the raw list to respect max_price and max_stops constraints."""
        result = flights

        if params.max_price is not None:
            result = [f for f in result if f.total_price <= params.max_price]

        if params.max_stops is not None:
            result = [f for f in result if f.stops <= params.max_stops]

        # Always return at least 3 options even if filters are too strict
        if len(result) < 3:
            result = sorted(flights, key=lambda f: f.total_price)[:5]

        return result
