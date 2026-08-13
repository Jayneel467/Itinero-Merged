"""Ticketmaster Discovery API — live events search. Search only, never purchase."""
from __future__ import annotations

import logging
from typing import Any, Optional

import requests

from general_agent.config import TICKETMASTER_API_KEY
from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

# Discovery inventory is strongest here. India/most of Asia is often empty.
_CITY_COUNTRY = {
    "new york": "US", "nyc": "US", "los angeles": "US", "la": "US",
    "chicago": "US", "miami": "US", "orlando": "US", "philadelphia": "US",
    "philly": "US", "boston": "US", "seattle": "US", "austin": "US",
    "houston": "US", "dallas": "US", "atlanta": "US", "denver": "US",
    "las vegas": "US", "vegas": "US", "san francisco": "US", "sf": "US",
    "washington": "US", "dc": "US", "nashville": "US", "new orleans": "US",
    "toronto": "CA", "vancouver": "CA", "montreal": "CA",
    "london": "GB", "manchester": "GB", "edinburgh": "GB", "birmingham": "GB",
    "dublin": "IE",
    "sydney": "AU", "melbourne": "AU", "brisbane": "AU",
    "auckland": "NZ",
    "mexico city": "MX",
    "paris": "FR", "lyon": "FR",
    "berlin": "DE", "munich": "DE",
    "amsterdam": "NL",
    "madrid": "ES", "barcelona": "ES",
    "rome": "IT", "milan": "IT",
    "mumbai": "IN", "delhi": "IN", "new delhi": "IN", "bangalore": "IN",
    "bengaluru": "IN", "hyderabad": "IN", "chennai": "IN", "pune": "IN",
    "surat": "IN", "ahmedabad": "IN", "kolkata": "IN", "jaipur": "IN",
    "goa": "IN",
}


def infer_country_code(city: str, explicit: str = "") -> str:
    if (explicit or "").strip():
        return explicit.strip().upper()[:2]
    key = (city or "").strip().lower()
    return _CITY_COUNTRY.get(key, "")


def search_events(
    *,
    city: str = "",
    country_code: str = "",
    keyword: str = "",
    classification: str = "",
    start_datetime: str = "",
    end_datetime: str = "",
    size: int = 8,
    latlong: str = "",
    radius: str = "",
) -> dict[str, Any]:
    """GET /discovery/v2/events.json. Raises ProviderRequestError on HTTP failure."""
    if not (TICKETMASTER_API_KEY or "").strip():
        raise ProviderRequestError(
            "Ticketmaster",
            "TICKETMASTER_API_KEY is not configured on the server.",
        )

    params: dict[str, Any] = {
        "apikey": TICKETMASTER_API_KEY.strip(),
        "size": max(1, min(int(size or 8), 20)),
        "sort": "date,asc",
        "includeTBA": "no",
        "includeTBD": "no",
    }
    if city:
        params["city"] = city.strip()
    cc = infer_country_code(city, country_code)
    if cc:
        params["countryCode"] = cc
    if keyword:
        params["keyword"] = keyword.strip()
    if classification:
        params["classificationName"] = classification.strip()
    if start_datetime:
        params["startDateTime"] = start_datetime
    if end_datetime:
        params["endDateTime"] = end_datetime
    if latlong:
        params["latlong"] = latlong
        params["radius"] = radius or "40"
        params["unit"] = "km"

    try:
        response = requests.get(EVENTS_URL, params=params, timeout=20)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("Ticketmaster events search failed city=%s: %s", city, e)
        detail = ""
        if getattr(e, "response", None) is not None:
            try:
                detail = (e.response.text or "")[:240]
            except Exception:
                detail = str(e.response.status_code)
        raise ProviderRequestError("Ticketmaster", detail or str(e)) from e


def event_id_lookup(event_id: str) -> dict[str, Any]:
    if not (TICKETMASTER_API_KEY or "").strip():
        raise ProviderRequestError("Ticketmaster", "TICKETMASTER_API_KEY is not configured.")
    url = f"https://app.ticketmaster.com/discovery/v2/events/{event_id}.json"
    try:
        response = requests.get(
            url,
            params={"apikey": TICKETMASTER_API_KEY.strip()},
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        raise ProviderRequestError("Ticketmaster", str(e)) from e
