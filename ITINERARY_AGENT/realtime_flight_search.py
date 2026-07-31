import json
import requests
from typing import List, Dict, Any
import os
from dotenv import load_dotenv

load_dotenv()

liteapi_key = os.getenv("LITEAPI_API_KEY")


def _sg(
    segment: dict,
    *paths,
) -> Any:
    """Safely get a field from segment, trying flat key first then nested paths.

    Examples:
        _sg(seg, "destinationName", ("destination", "name"))
          → tries seg["destinationName"], then seg["destination"]["name"]

        _sg(seg, "marketingName", ("carrier", "marketing", "name"))
          → tries seg["marketingName"], then seg["carrier"]["marketing"]["name"]
    """
    flat = paths[0]
    if isinstance(flat, str) and flat in segment:
        return segment[flat]
    for path in paths:
        if isinstance(path, str):
            if path in segment:
                return segment[path]
            continue
        val = segment
        for key in path:
            if isinstance(val, dict):
                val = val.get(key)
            else:
                val = None
                break
        if val is not None:
            return val
    return None


def extract_flight_results(
    origin: str,
    destination: str,
    date: str,
    adults: int = 1,
    children: int = 0,
    infants: int = 0,
    cabin_class: str = "ECONOMY",
    currency: str = "INR",
) -> List[Dict[str, Any]]:
    """
    Search flights from LiteAPI and return extracted flight details.
    """

    url = "https://api.liteapi.travel/v3.0/flights/rates"

    headers = {
        "X-Api-Key": liteapi_key,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    payload = {
        "legs": [
            {
                "origin": origin,
                "destination": destination,
                "date": date,
            }
        ],
        "adults": adults,
        "children": children,
        "infants": infants,
        "cabinClass": cabin_class,
        "currency": currency,
    }

    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=60,
    )

    response.raise_for_status()

    data = response.json()

    flights = [][:5]

    journeys = data.get("data", [])

    if journeys:
        journeys = journeys[0].get("journeys", [])

    for journey in journeys:

        if not journey.get("segments"):
            continue

        segment = journey["segments"][0]
        offer = journey.get("cheapestOffer", {})

        baggage = offer.get("baggage", {})
        fare = offer.get("fare", {})
        seat = offer.get("seats", {}).get("seatReservation", {})
        terms = offer.get("terms", {})
        pricing = offer.get("pricing", {}).get("display", {})

        cabin_bag = None
        checked_bag = None

        for bag in baggage.get("included", []):

            if bag.get("bagType") == "cabin":
                cabin_bag = {
                    "pieces": bag.get("pieces"),
                    "weightKg": bag.get("weightKg"),
                    "description": bag.get("description"),
                }

            elif bag.get("bagType") == "checked":
                checked_bag = {
                    "pieces": bag.get("pieces"),
                    "weightKg": bag.get("weightKg"),
                    "description": bag.get("description"),
                }

        amenities = []

        for group in offer.get("segmentAmenities", []):
            for amenity in group.get("amenities", []):

                amenities.append(
                    {
                        "name": amenity.get("name"),
                        "available": amenity.get("available"),
                        "chargeable": amenity.get("chargeable", False),
                    }
                )

        segment_fare = {}

        if journey.get("offers"):
            fares = journey["offers"][0].get("segmentFares", [])
            if fares:
                segment_fare = fares[0]

        flights.append(
            {
                "journey_key": journey.get("journeyKey"),
                "offer_id": offer.get("offerId"),

                "airline": _sg(segment, "marketingName", ("carrier", "marketingName"), ("carrier", "marketing", "name")),
                "airline_code": _sg(segment, "marketingCode", ("carrier", "marketingCode"), ("carrier", "marketing", "code")),
                "flight_number": _sg(segment, "marketingNumber", ("flight", "marketingNumber"), ("flight", "number")),

                "origin": _sg(segment, "originCode", ("origin", "code"), ("departure", "airport", "code")),
                "destination": _sg(segment, "destinationCode", ("destination", "code"), ("arrival", "airport", "code")),
                "origin_airport": _sg(segment, "originName", ("origin", "name"), ("departure", "airport", "name")),
                "destination_airport": _sg(segment, "destinationName", ("destination", "name"), ("arrival", "airport", "name")),

                "departure": _sg(segment, "departureTime", ("departure", "at")),
                "arrival": _sg(segment, "arrivalTime", ("arrival", "at")),
                "duration_minutes": segment.get("duration", {}).get("minutes"),
                "stops": len(journey.get("segments", [])) - 1,

                "currency": pricing.get("currency"),
                "total_price": pricing.get("total"),
                "base_price": pricing.get("base"),
                "taxes": pricing.get("taxes"),

                "cabin": segment_fare.get("cabin"),
                "booking_code": segment_fare.get("bookingCode"),
                "fare_family": fare.get("family"),

                "seats_remaining": fare.get("seatsRemaining"),
                "seat_selection": seat.get("description"),

                "cabin_bag": cabin_bag,
                "checked_bag": checked_bag,

                "refundable": terms.get("refundable"),
                "changeable": terms.get("changeable"),

                "change_fee": (
                    terms.get("changeFee", {})
                    .get("pricing", {})
                    .get("display", {})
                    .get("amount")
                ),

                "refund_fee": (
                    terms.get("refundFee", {})
                    .get("pricing", {})
                    .get("display", {})
                    .get("amount")
                ),

                "offer_expiration": offer.get("expiration"),

                "amenities": amenities,
            }
        )

    return flights


if __name__ == "__main__":

    flights = extract_flight_results(
        origin="DEL",
        destination="BOM",
        date="2026-08-15",
        adults=1,
    )

    print(json.dumps(flights, indent=4))

