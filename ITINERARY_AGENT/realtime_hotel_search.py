"""
Compatibility shim — re-exports the city-based LiteAPI hotel search helpers
from `backend.services.hotel_service` (the consolidated hotel module).
"""
from backend.services.hotel_service import (
    search_hotels,
    search_hotels_with_offers,
)

__all__ = ["search_hotels", "search_hotels_with_offers"]