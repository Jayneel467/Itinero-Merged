"""
Hotel Agent — LiteAPI Implementation.

Searches hotels via LiteAPI and returns typed Pydantic models.
Supports ranking, filtering, and pre-booking workflows.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import List, Optional

from backend.models.state import (
    Hotel,
    HotelPrebook,
    HotelSearchParams,
    RankingCriteria,
)
from realtime_hotel_search import search_hotels


# ---------------------------------------------------------------------------
# HotelAgent class
# ---------------------------------------------------------------------------

class HotelAgent:
    """
    Hotel Agent backed by LiteAPI.

    All public methods return typed Pydantic objects.
    """

    def __init__(self) -> None:
        pass

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
        nights = self._calc_nights(params.check_in, params.check_out)

        raw_hotels = search_hotels(
            city_name=params.destination,
            country_code="IN",
            checkin=params.check_in,
            checkout=params.check_out,
            adults=params.num_guests,
        )

        hotels: List[Hotel] = []
        for raw in raw_hotels:
            rating = (raw["rating"] or 0) / 2.0
            total_price = raw["price"] or 0.0
            price_per_night = round(total_price / nights, 2) if nights else total_price

            hotels.append(
                Hotel(
                    hotel_id                = raw["hotel_id"],
                    name                    = raw["hotel_name"],
                    rating                  = round(min(rating, 5.0), 1),
                    address                 = raw["address"] or "",
                    distance_from_center_km = 0.0,
                    price_per_night         = price_per_night,
                    amenities               = [raw["board_name"]] if raw["board_name"] else [],
                    room_type               = raw["room_name"] or "",
                    check_in                = params.check_in,
                    check_out               = params.check_out,
                    total_price             = total_price,
                    image_placeholder       = raw.get("main_photo") or "🏨",
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
