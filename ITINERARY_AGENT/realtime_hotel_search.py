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


if __name__ == "__main__":

    hotels = search_hotels(
        city_name="Mumbai",
        country_code="IN",
        checkin="2026-08-15",
        checkout="2026-08-17",
        adults=2,
    )

    print(json.dumps(hotels, indent=4))