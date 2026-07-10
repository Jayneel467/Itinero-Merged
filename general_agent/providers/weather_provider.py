"""
Raw HTTP client for OpenWeather's current-weather endpoint.

No formatting or business logic here - see services/travel_service.py for
how this raw JSON gets turned into the string the agent hands back to the
user.
"""
import logging

import requests

from general_agent.config import OPENWEATHER_API_KEY
from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

BASE_URL = "https://api.openweathermap.org/data/2.5/weather"


def get_current_weather(city: str) -> dict:
    """Fetch raw current-weather JSON for a city from OpenWeather."""
    params = {"q": city, "appid": OPENWEATHER_API_KEY, "units": "metric"}
    try:
        response = requests.get(BASE_URL, params=params, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.warning("OpenWeather request failed for city=%s: %s", city, e)
        raise ProviderRequestError("OpenWeather", str(e)) from e
