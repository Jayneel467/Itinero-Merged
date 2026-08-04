"""
Compatibility shim — re-exports the LiteAPI hotel helpers from
`backend.services.hotel_service` (the consolidated hotel module).
"""
from backend.services.hotel_service import (
    DEFAULT_CURRENCY,
    DEFAULT_NATIONALITY,
    HOTEL_DATA_URL,
    PREBOOK_URL,
    RATES_URL,
    HotelPrebookError,
    create_occupancies,
    enrich_hotel_with_details,
    enrich_room_offers_with_details,
    fetch_hotel_details,
    guest_nationality_code,
    prebook_hotel_room,
    search_country_code,
    search_hotel_rates,
    search_hotel_rates_per_hotel,
)

__all__ = [
    "DEFAULT_CURRENCY",
    "DEFAULT_NATIONALITY",
    "HOTEL_DATA_URL",
    "PREBOOK_URL",
    "RATES_URL",
    "HotelPrebookError",
    "create_occupancies",
    "enrich_hotel_with_details",
    "enrich_room_offers_with_details",
    "fetch_hotel_details",
    "guest_nationality_code",
    "prebook_hotel_room",
    "search_country_code",
    "search_hotel_rates",
    "search_hotel_rates_per_hotel",
]