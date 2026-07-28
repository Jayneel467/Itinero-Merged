"""
Hotel Agent — Dummy Implementation.

Provides realistic dummy hotel data for:
  - Hotel Search
  - Hotel Search with Filters
  - Hotel Ranking  (rating / price / distance)
  - Hotel Pre-book

Designed so the real API can be dropped in by replacing the
_fetch_raw_hotels() method without touching any other code.
"""

from __future__ import annotations

import random
import uuid
from datetime import date
from typing import List, Optional

from backend.models.state import (
    Hotel,
    HotelPrebook,
    HotelSearchParams,
    RankingCriteria,
)


# ---------------------------------------------------------------------------
# Dummy hotel data catalogue
# ---------------------------------------------------------------------------

_HOTEL_TEMPLATES: List[dict] = [
    {
        "name_prefix": "Grand",
        "brand": "Hyatt",
        "type": "luxury",
        "base_price": 320,
        "base_rating": 4.7,
        "amenities": ["Pool", "Spa", "Gym", "Free WiFi", "Concierge", "Room Service", "Restaurant"],
    },
    {
        "name_prefix": "The",
        "brand": "Marriott",
        "type": "business",
        "base_price": 210,
        "base_rating": 4.4,
        "amenities": ["Gym", "Free WiFi", "Business Center", "Restaurant", "Bar"],
    },
    {
        "name_prefix": "Royal",
        "brand": "Hilton",
        "type": "luxury",
        "base_price": 290,
        "base_rating": 4.6,
        "amenities": ["Pool", "Spa", "Gym", "Free WiFi", "Airport Shuttle", "Restaurant"],
    },
    {
        "name_prefix": "City",
        "brand": "Comfort Inn",
        "type": "budget",
        "base_price": 95,
        "base_rating": 3.8,
        "amenities": ["Free WiFi", "Breakfast Included", "Parking"],
    },
    {
        "name_prefix": "Boutique",
        "brand": "Design Hotel",
        "type": "boutique",
        "base_price": 175,
        "base_rating": 4.3,
        "amenities": ["Free WiFi", "Bar", "Rooftop", "Concierge"],
    },
    {
        "name_prefix": "Harbour",
        "brand": "Sheraton",
        "type": "resort",
        "base_price": 260,
        "base_rating": 4.5,
        "amenities": ["Beach Access", "Pool", "Spa", "Free WiFi", "Water Sports", "Restaurant"],
    },
    {
        "name_prefix": "Palace",
        "brand": "Four Seasons",
        "type": "ultra-luxury",
        "base_price": 550,
        "base_rating": 4.9,
        "amenities": ["Pool", "Spa", "Butler Service", "Free WiFi", "Helipad", "Fine Dining"],
    },
    {
        "name_prefix": "Urban",
        "brand": "ibis",
        "type": "budget",
        "base_price": 75,
        "base_rating": 3.5,
        "amenities": ["Free WiFi", "24h Reception", "Breakfast Available"],
    },
]

_ROOM_TYPES = [
    "Standard Double",
    "Deluxe King",
    "Superior Twin",
    "Junior Suite",
    "Executive Room",
    "Family Room",
    "Ocean View Room",
    "Penthouse Suite",
]

_STREET_NAMES = [
    "Main Street", "Ocean Drive", "Park Avenue", "Central Boulevard",
    "Harbour Road", "Garden Lane", "Royal Mile", "Beach Road",
    "Heritage Walk", "Sunset Strip",
]


# ---------------------------------------------------------------------------
# HotelAgent class
# ---------------------------------------------------------------------------

class HotelAgent:
    """
    Dummy Hotel Agent.

    All public methods return typed Pydantic objects.
    Replace _fetch_raw_hotels() with a real API call (e.g. Booking.com,
    Expedia) to go live.
    """

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def search_hotels(self, params: HotelSearchParams) -> List[Hotel]:
        """Return available hotels matching *params*, unranked."""
        raw = self._fetch_raw_hotels(params)
        return self._apply_filters(raw, params)

    def search_and_rank(
        self,
        params: HotelSearchParams,
        criteria: RankingCriteria = RankingCriteria.RATING,
    ) -> List[Hotel]:
        """Search, filter, and rank in one call."""
        hotels = self.search_hotels(params)
        return self.rank_hotels(hotels, criteria)

    def rank_hotels(
        self,
        hotels: List[Hotel],
        criteria: RankingCriteria = RankingCriteria.RATING,
    ) -> List[Hotel]:
        """
        Rank hotels by the given criteria.

        ranking_score is normalised to 0-100 (higher = better).
        """
        if not hotels:
            return []

        scored = []

        if criteria == RankingCriteria.PRICE:
            prices = [h.total_price for h in hotels]
            min_p, max_p = min(prices), max(prices)
            span = max_p - min_p or 1
            for h in hotels:
                score = 100 - ((h.total_price - min_p) / span * 100)
                scored.append(h.model_copy(update={"ranking_score": round(score, 1)}))

        elif criteria == RankingCriteria.DISTANCE:
            dists = [h.distance_from_center_km for h in hotels]
            min_d, max_d = min(dists), max(dists)
            span = max_d - min_d or 1
            for h in hotels:
                score = 100 - ((h.distance_from_center_km - min_d) / span * 100)
                scored.append(h.model_copy(update={"ranking_score": round(score, 1)}))

        elif criteria == RankingCriteria.RATING:
            for h in hotels:
                score = (h.rating / 5.0) * 100
                scored.append(h.model_copy(update={"ranking_score": round(score, 1)}))

        else:  # BEST_VALUE composite
            prices    = [h.total_price                for h in hotels]
            dists     = [h.distance_from_center_km   for h in hotels]
            min_p, max_p = min(prices), max(prices)
            min_d, max_d = min(dists), max(dists)
            p_span = max_p - min_p or 1
            d_span = max_d - min_d or 1
            for h in hotels:
                rating_score    = (h.rating / 5.0) * 100
                price_score     = 100 - ((h.total_price - min_p) / p_span * 100)
                distance_score  = 100 - ((h.distance_from_center_km - min_d) / d_span * 100)
                amenity_bonus   = min(len(h.amenities) * 2, 10)
                score = (rating_score * 0.4 + price_score * 0.35
                         + distance_score * 0.2 + amenity_bonus)
                scored.append(h.model_copy(update={"ranking_score": round(min(score, 100), 1)}))

        return sorted(scored, key=lambda h: h.ranking_score, reverse=True)

    def prebook_hotel(
        self,
        hotel: Hotel,
        check_in: str,
        check_out: str,
        num_guests: int,
        day_number: Optional[int] = None,
    ) -> HotelPrebook:
        """
        Pre-book a hotel room and return a booking confirmation.

        Replace with real API call to go live.
        """
        prebook_id  = f"HTL-{uuid.uuid4().hex[:8].upper()}"
        nights      = self._calc_nights(check_in, check_out)
        total       = round(hotel.price_per_night * nights, 2)
        return HotelPrebook(
            prebook_id   = prebook_id,
            hotel        = hotel,
            check_in     = check_in,
            check_out    = check_out,
            guests       = num_guests,
            total_charged= total,
            status       = "confirmed",
            day_number   = day_number,
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_raw_hotels(self, params: HotelSearchParams) -> List[Hotel]:
        """
        Generate realistic dummy hotels for the given search parameters.

        Replace this method with a real Booking.com / Expedia API call
        without changing any other part of the agent.
        """
        nights = self._calc_nights(params.check_in, params.check_out)
        destination_title = params.destination.title()
        num_options = self._rng.randint(6, 10)

        hotels: List[Hotel] = []
        templates_used = self._rng.sample(_HOTEL_TEMPLATES, min(num_options, len(_HOTEL_TEMPLATES)))

        for tmpl in templates_used:
            street    = self._rng.choice(_STREET_NAMES)
            num       = self._rng.randint(1, 200)
            address   = f"{num} {street}, {destination_title}"
            distance  = round(self._rng.uniform(0.3, 8.5), 1)
            ppn       = round(tmpl["base_price"] * self._rng.uniform(0.8, 1.25), 2)
            rating    = round(min(5.0, tmpl["base_rating"] + self._rng.uniform(-0.3, 0.3)), 1)
            room_type = self._rng.choice(_ROOM_TYPES)
            # Shuffle amenities list slightly
            amenities = list(tmpl["amenities"])
            self._rng.shuffle(amenities)
            amenities = amenities[:self._rng.randint(3, len(amenities))]
            total     = round(ppn * nights, 2)
            hotel_name = (
                f"{tmpl['name_prefix']} {destination_title} {tmpl['brand']}"
            )

            hotels.append(
                Hotel(
                    hotel_id                = f"htl_{uuid.uuid4().hex[:6]}",
                    name                    = hotel_name,
                    rating                  = rating,
                    address                 = address,
                    distance_from_center_km = distance,
                    price_per_night         = ppn,
                    amenities               = amenities,
                    room_type               = room_type,
                    check_in                = params.check_in,
                    check_out               = params.check_out,
                    total_price             = total,
                )
            )

        return hotels

    def _apply_filters(
        self,
        hotels: List[Hotel],
        params: HotelSearchParams,
    ) -> List[Hotel]:
        """Filter by max_price_per_night and min_rating if provided."""
        result = hotels

        if params.max_price_per_night is not None:
            result = [h for h in result if h.price_per_night <= params.max_price_per_night]

        if params.min_rating is not None:
            result = [h for h in result if h.rating >= params.min_rating]

        # Always return at least 3 options
        if len(result) < 3:
            result = sorted(hotels, key=lambda h: h.rating, reverse=True)[:5]

        return result

    @staticmethod
    def _calc_nights(check_in: str, check_out: str) -> int:
        """Return the number of nights between two ISO date strings."""
        try:
            d1 = date.fromisoformat(check_in)
            d2 = date.fromisoformat(check_out)
            return max(1, (d2 - d1).days)
        except ValueError:
            return 1
