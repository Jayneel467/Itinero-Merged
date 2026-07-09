"""Build itinerary-ready payloads from Flight Agent session state."""

from __future__ import annotations

from typing import Any

from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from travel_agent.models import ItineraryFlightPayload, TravelTask


def _flight_status(session: SessionContext, flight_intent: FlightIntent) -> str:
    if session.booking_id:
        return "booked"
    if session.prebook_id:
        return "prebooked"
    if session.verified_offer_id:
        return "verified"
    if session.last_search_results:
        return "search_results"
    if flight_intent in {FlightIntent.PREBOOK, FlightIntent.COMPLETE_BOOKING}:
        return "in_progress"
    return "in_progress"


def _route_summary(session: SessionContext) -> dict[str, Any]:
    search = session.search_context or {}
    return {
        "origin": search.get("origin"),
        "destination": search.get("destination"),
        "departure_date": search.get("departure_date"),
        "return_date": search.get("return_date"),
        "cabin_class": search.get("cabin_class"),
        "adults": search.get("adults"),
        "children": search.get("children"),
        "infants": search.get("infants"),
    }


def _offer_summary(offer: dict[str, Any]) -> dict[str, Any]:
    segs = offer.get("segments_summary") or [{}]
    first = segs[0] if segs else {}
    return {
        "index": offer.get("index"),
        "airline": first.get("airline"),
        "from": first.get("from"),
        "to": first.get("to"),
        "departure": first.get("departure"),
        "arrival": first.get("arrival"),
        "cabin_class": offer.get("cabin_class"),
        "fare_family": offer.get("fare_family"),
        "price": offer.get("total_price"),
        "currency": offer.get("currency"),
        "stops": offer.get("stops"),
    }


def build_itinerary_payload(
    session: SessionContext,
    flight_intent: FlightIntent,
    *,
    response: str = "",
    operation_result: dict[str, Any] | None = None,
) -> ItineraryFlightPayload | None:
    """Convert flight session into data the Itinerary Agent can consume."""
    if not (
        session.last_search_results
        or session.verified_offer_id
        or session.prebook_id
        or session.booking_id
    ):
        return None

    status = _flight_status(session, flight_intent)
    route = _route_summary(session)
    offers = [_offer_summary(o) for o in (session.last_search_results or [])[:8]]

    verified = session.last_verified_offer
    booking = None
    if session.booking_id or session.last_booking:
        booking = {
            "booking_id": session.booking_id,
            "airline_pnr": (session.last_booking or {}).get("airline_pnr"),
            "status": (session.last_booking or {}).get("status"),
        }

    summary_parts = []
    if route.get("origin") and route.get("destination"):
        summary_parts.append(f"{route['origin']} → {route['destination']}")
    if route.get("departure_date"):
        summary_parts.append(f"on {route['departure_date']}")
    if session.selected_offer_index:
        summary_parts.append(f"option {session.selected_offer_index} selected")
    if status == "booked" and booking:
        summary_parts.append(f"PNR {booking.get('airline_pnr') or booking.get('booking_id')}")

    return ItineraryFlightPayload(
        status=status,
        route=route,
        selected_option=session.selected_offer_index,
        offers=offers,
        verified_offer=verified,
        booking=booking,
        summary=" · ".join(summary_parts) or response[:200],
    )


def map_flight_intent_to_travel_task(flight_intent: FlightIntent) -> TravelTask:
    """Map low-level flight intent to General Agent travel task."""
    if flight_intent in {FlightIntent.SEARCH_FLIGHTS, FlightIntent.VERIFY_OFFER}:
        return TravelTask.TRAVEL_SEARCH
    if flight_intent in {
        FlightIntent.PREBOOK,
        FlightIntent.ATTACH_SERVICES,
        FlightIntent.COMPLETE_BOOKING,
        FlightIntent.GET_BOOKING,
        FlightIntent.LIST_BOOKINGS,
        FlightIntent.BOOKING_STATUS,
        FlightIntent.CANCEL_BOOKING,
    }:
        return TravelTask.TRAVEL_BOOKING
    return TravelTask.GENERAL
