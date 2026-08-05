"""
Shared UI "card" mapping — converts ITINERARY_AGENT's FlightOption/HotelOption
data (as plain JSON-dumped dicts) into the card JSON shape the React UI's
CardsDeck component expects.

Used by BOTH:
  - itinerary_bridge.py (cards produced mid-booking-flow, from the real
    ITINERARY_AGENT node results)
  - quick_search_service.py (cards produced by Vero's own quick, search-only
    lookups)

Kept in exactly one place so a flight/hotel card looks identical regardless
of which path produced it, and so `flight_id`/`hotel_id` (needed by
select_searched_flight/select_searched_hotel for deterministic hand-off) are
always present.
"""
from __future__ import annotations

from typing import Any


def flight_option_to_card_item(f: dict[str, Any]) -> dict[str, Any]:
    baggage = str(f.get("baggage_included") or "")
    duration_mins = f.get("duration_minutes") or 0
    return {
        "flight_id": f.get("flight_id", ""),
        "airline": f.get("airline", ""),
        "flight_code": f.get("flight_number", ""),
        "refundable": (f.get("refund_policy") or "").lower() != "non-refundable",
        "dep_time": str(f.get("departure_time", ""))[11:16],
        "origin": f.get("origin", ""),
        "duration": f"{duration_mins // 60}h {duration_mins % 60}m",
        "stops": f.get("stops", 0),
        "arr_time": str(f.get("arrival_time", ""))[11:16],
        "dest": f.get("destination", ""),
        "has_checked_bag": "check-in" in baggage.lower(),
        "fare_family": f.get("cabin_class") or "Economy",
        "currency": "INR",
        "price": f.get("price_per_adult", 0),
    }


def flight_cards(flights: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    if not flights:
        return None
    return {
        "type": "flights",
        "title": title,
        "subtitle": subtitle,
        "items": [flight_option_to_card_item(f) for f in flights],
    }


def hotel_option_to_card_item(h: dict[str, Any]) -> dict[str, Any]:
    return {
        "hotel_id": h.get("hotel_id", ""),
        "rating": h.get("star_rating", 0),
        "refundable": "free cancellation" in str(h.get("cancellation_policy", "")).lower(),
        "name": h.get("name", ""),
        "address": f"{h.get('area', '')}, {h.get('location', '')}".strip(", "),
        "room_name": h.get("room_type", ""),
        "board": h.get("meal_plan", ""),
        "currency": "INR",
        "price": h.get("price_per_night", 0),
    }


def hotel_cards(hotels: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    if not hotels:
        return None
    return {
        "type": "hotels",
        "title": title,
        "subtitle": subtitle,
        "items": [hotel_option_to_card_item(h) for h in hotels],
    }
