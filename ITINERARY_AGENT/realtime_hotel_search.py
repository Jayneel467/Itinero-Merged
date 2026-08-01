import json
import requests
from typing import Any, Dict, List
import os
from dotenv import load_dotenv

load_dotenv()

liteapi_key = os.getenv("LITEAPI_API_KEY")


def search_hotels(
    city_name: str,
    country_code: str,
    checkin: str,
    checkout: str,
    adults: int = 2,
    children_ages: List[int] | None = None,
    currency: str = "INR",
    guest_nationality: str = "IN",
    max_rates_per_hotel: int = 1,
    timeout: int = 10,
) -> List[Dict[str, Any]]:

    url = "https://api.liteapi.travel/v3.0/hotels/rates"

    headers = {
        "X-API-Key": liteapi_key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    occupancies = [
        {
            "adults": adults,
            "children": children_ages or []
        }
    ]

    payload = {
        "cityName": city_name,
        "countryCode": country_code,
        "checkin": checkin,
        "checkout": checkout,
        "currency": currency,
        "guestNationality": guest_nationality,
        "occupancies": occupancies,
        "includeHotelData": True,
        "maxRatesPerHotel": max_rates_per_hotel,
        "timeout": timeout,
    }

    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=60,
    )

    if not response.ok:
        raise Exception(
            f"{response.status_code}\n{response.text}"
        )

    result = response.json()

    hotels = []

    hotel_lookup = {
        h["id"]: h
        for h in result.get("hotels", [])
    }

    for item in result.get("data", []):

        hotel = hotel_lookup.get(item["hotelId"], {})

        room_types = item.get("roomTypes", [])

        if not room_types:
            continue

        room = room_types[0]

        rates = room.get("rates", [])

        if not rates:
            continue

        rate = rates[0]

        retail = rate.get("retailRate", {})

        total = {}

        if retail.get("total"):
            total = retail["total"][0]

        cancellation = rate.get(
            "cancellationPolicies",
            {}
        )

        hotels.append({

            "hotel_id": item.get("hotelId"),

            "offer_id": room.get("offerId"),

            "hotel_name": hotel.get("name"),

            "rating": hotel.get("rating"),

            "address": hotel.get("address"),

            "main_photo": hotel.get("main_photo"),

            "room_name": rate.get("name"),

            "board_name": rate.get("boardName"),

            "price": total.get("amount"),

            "currency": total.get("currency"),

            "refundable": cancellation.get("refundableTag"),

            "cancel_policy": cancellation.get(
                "cancelPolicyInfos",
                []
            ),
        })

    return hotels


def search_hotels_with_offers(
    city_name: str,
    country_code: str,
    checkin: str,
    checkout: str,
    adults: int = 2,
    children_ages: List[int] | None = None,
    currency: str = "INR",
    guest_nationality: str = "IN",
    max_rates_per_hotel: int = 10,
    timeout: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search hotels via LiteAPI and return EVERY bookable room offer per hotel.

    Unlike `search_hotels` (which keeps only the cheapest single rate per
    hotel), this returns one entry per hotel:

        [{
          "hotel_id": ..., "hotel_name": ..., "rating": ..., "address": ...,
          "main_photo": ...,
          "offers": [
            {"offer_id", "room_name", "board_name", "price", "currency",
             "refundable", "cancel_policy"}
          ]
        }, ...]

    Each offer carries the LiteAPI `offerId` required for pre-booking.
    """

    url = "https://api.liteapi.travel/v3.0/hotels/rates"

    headers = {
        "X-API-Key": liteapi_key,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

    occupancies = [
        {
            "adults": adults,
            "children": children_ages or []
        }
    ]

    payload = {
        "cityName": city_name,
        "countryCode": country_code,
        "checkin": checkin,
        "checkout": checkout,
        "currency": currency,
        "guestNationality": guest_nationality,
        "occupancies": occupancies,
        "includeHotelData": True,
        "maxRatesPerHotel": max_rates_per_hotel,
        "timeout": timeout,
    }

    response = requests.post(
        url,
        headers=headers,
        json=payload,
        timeout=60,
    )

    if not response.ok:
        raise Exception(
            f"{response.status_code}\n{response.text}"
        )

    result = response.json()

    hotel_lookup = {
        h["id"]: h
        for h in result.get("hotels", [])
    }

    grouped: Dict[str, Dict[str, Any]] = {}

    for item in result.get("data", []):

        hotel_id = item.get("hotelId")
        if not hotel_id:
            continue

        hotel = hotel_lookup.get(hotel_id, {})

        entry = grouped.setdefault(
            hotel_id,
            {
                "hotel_id": hotel_id,
                "hotel_name": hotel.get("name"),
                "rating": hotel.get("rating"),
                "address": hotel.get("address"),
                "main_photo": hotel.get("main_photo"),
                "offers": [],
            },
        )

        for room in item.get("roomTypes", []):

            offer_id = room.get("offerId")
            rates = room.get("rates", [])

            if not offer_id or not rates:
                continue

            rate = rates[0]

            retail = rate.get("retailRate", {})

            total = {}

            if retail.get("total"):
                total = retail["total"][0]

            cancellation = rate.get(
                "cancellationPolicies",
                {}
            )

            entry["offers"].append({
                "offer_id": offer_id,
                "room_name": rate.get("name"),
                "board_name": rate.get("boardName"),
                "price": total.get("amount"),
                "currency": total.get("currency"),
                "refundable": cancellation.get("refundableTag"),
                "cancel_policy": cancellation.get(
                    "cancelPolicyInfos",
                    []
                ),
            })

    return list(grouped.values())


if __name__ == "__main__":

    hotels = search_hotels(
        city_name="Mumbai",
        country_code="IN",
        checkin="2026-08-15",
        checkout="2026-08-17",
        adults=2,
    )

    print(json.dumps(hotels, indent=4))