"""
Travel Data Providers — Abstract interfaces + Dummy implementations.

Architecture
============
FlightProvider (ABC)
├── DummyFlightProvider   ← current (no API key needed)
└── RealFlightProvider    ← future (Amadeus / Skyscanner / etc.)

HotelProvider (ABC)
├── DummyHotelProvider    ← current (no API key needed)
└── RealHotelProvider     ← future (Booking.com / Expedia / etc.)

WeatherProvider (ABC)
├── DummyWeatherProvider  ← current (rule-based seasonal mock)
└── RealWeatherProvider   ← future (OpenWeatherMap / WeatherAPI)

The itinerary generator depends ONLY on the abstract interfaces.
Swapping from dummy to real providers requires changing ONE line:
    get_flight_provider() / get_hotel_provider() / get_weather_provider()
"""

from __future__ import annotations

import random
import uuid
from abc import ABC, abstractmethod
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from backend.models.state import (
    CabinClass,
    Flight,
    FlightPrebook,
    FlightSearchParams,
    Hotel,
    HotelPrebook,
    HotelSearchParams,
    RankingCriteria,
)


# ===========================================================================
# Weather data model  (not in state.py to keep it provider-internal)
# ===========================================================================

class WeatherEntry:
    """A single day's weather forecast."""

    __slots__ = ("date_str", "temperature_c", "condition", "humidity_pct", "advice")

    def __init__(
        self,
        date_str: str,
        temperature_c: int,
        condition: str,
        humidity_pct: int,
        advice: str,
    ) -> None:
        self.date_str      = date_str        # "24 Jul 2026"
        self.temperature_c = temperature_c
        self.condition     = condition       # "Sunny", "Light Rain", etc.
        self.humidity_pct  = humidity_pct
        self.advice        = advice


# ===========================================================================
# ABSTRACT BASE CLASSES
# ===========================================================================

class FlightProvider(ABC):
    """Interface every flight provider must implement."""

    @abstractmethod
    def search(self, params: FlightSearchParams) -> List[Flight]:
        """Return a list of available flights for the given parameters."""

    @abstractmethod
    def prebook(self, flight: Flight, num_passengers: int) -> FlightPrebook:
        """Pre-book a flight and return a confirmation object."""


class HotelProvider(ABC):
    """Interface every hotel provider must implement."""

    @abstractmethod
    def search(self, params: HotelSearchParams) -> List[Hotel]:
        """Return a list of available hotels for the given parameters."""

    @abstractmethod
    def prebook(
        self,
        hotel: Hotel,
        check_in: str,
        check_out: str,
        num_guests: int,
        day_number: Optional[int] = None,
    ) -> HotelPrebook:
        """Pre-book a hotel room and return a confirmation object."""


class WeatherProvider(ABC):
    """Interface every weather provider must implement."""

    @abstractmethod
    def forecast(
        self,
        destination: str,
        start_date: str,
        num_days: int,
    ) -> List[WeatherEntry]:
        """Return a day-by-day weather forecast."""


# ===========================================================================
# DUMMY IMPLEMENTATIONS
# ===========================================================================

# ---------------------------------------------------------------------------
# Shared lookup tables
# ---------------------------------------------------------------------------

_CITY_AIRPORT: Dict[str, str] = {
    "new york":       "JFK",  "los angeles":    "LAX",  "chicago":        "ORD",
    "london":         "LHR",  "paris":          "CDG",  "dubai":          "DXB",
    "tokyo":          "NRT",  "singapore":      "SIN",  "sydney":         "SYD",
    "toronto":        "YYZ",  "frankfurt":      "FRA",  "amsterdam":      "AMS",
    "bangkok":        "BKK",  "istanbul":       "IST",  "delhi":          "DEL",
    "mumbai":         "BOM",  "hong kong":      "HKG",  "barcelona":      "BCN",
    "rome":           "FCO",  "miami":          "MIA",  "san francisco":  "SFO",
    "seattle":        "SEA",  "boston":         "BOS",  "madrid":         "MAD",
    "zurich":         "ZRH",  "bali":           "DPS",  "maldives":       "MLE",
    "cairo":          "CAI",  "cape town":      "CPT",  "rio de janeiro": "GIG",
    "goa":            "GOI",  "kolkata":        "CCU",  "hyderabad":      "HYD",
    "bangalore":      "BLR",  "chennai":        "MAA",  "jaipur":         "JAI",
    "pune":           "PNQ",  "ahmedabad":      "AMD",  "kochi":          "COK",
    "phuket":         "HKT",  "kathmandu":      "KTM",  "colombo":        "CMB",
    "kuala lumpur":   "KUL",  "jakarta":        "CGK",  "ho chi minh":    "SGN",
    "hanoi":          "HAN",  "beijing":        "PEK",  "shanghai":       "PVG",
    "seoul":          "ICN",  "taipei":         "TPE",  "osaka":          "KIX",
}

_AIRLINES: List[Dict[str, str]] = [
    {"name": "IndiGo",             "iata": "6E"},
    {"name": "Air India",          "iata": "AI"},
    {"name": "SpiceJet",           "iata": "SG"},
    {"name": "Vistara",            "iata": "UK"},
    {"name": "GoAir",              "iata": "G8"},
    {"name": "Emirates",           "iata": "EK"},
    {"name": "Singapore Airlines", "iata": "SQ"},
    {"name": "Qatar Airways",      "iata": "QR"},
    {"name": "Lufthansa",          "iata": "LH"},
    {"name": "British Airways",    "iata": "BA"},
    {"name": "Air France",         "iata": "AF"},
    {"name": "Turkish Airlines",   "iata": "TK"},
    {"name": "Delta Airlines",     "iata": "DL"},
    {"name": "United Airlines",    "iata": "UA"},
]

_HOTEL_TEMPLATES: List[Dict[str, Any]] = [
    {"prefix": "Grand",     "brand": "Hyatt",       "base_ppn": 7500,  "base_rating": 4.7, "stars": 5,
     "amenities": ["Rooftop Pool", "Spa & Wellness", "Gym", "Free Wi-Fi", "Concierge", "Room Service", "Fine Dining Restaurant"]},
    {"prefix": "The",       "brand": "Marriott",    "base_ppn": 5200,  "base_rating": 4.4, "stars": 5,
     "amenities": ["Gym", "Free Wi-Fi", "Business Centre", "All-Day Dining", "Bar", "Laundry"]},
    {"prefix": "Royal",     "brand": "Hilton",      "base_ppn": 6800,  "base_rating": 4.6, "stars": 5,
     "amenities": ["Infinity Pool", "Spa", "Gym", "Free Wi-Fi", "Airport Shuttle", "Multi-Cuisine Restaurant"]},
    {"prefix": "Sea Breeze","brand": "Resort",      "base_ppn": 4500,  "base_rating": 4.4, "stars": 4,
     "amenities": ["Beach Access", "Pool", "Water Sports", "Free Wi-Fi", "Restaurant", "Bar"]},
    {"prefix": "Heritage",  "brand": "Boutique",    "base_ppn": 3800,  "base_rating": 4.3, "stars": 4,
     "amenities": ["Free Wi-Fi", "Rooftop Bar", "Heritage Tour Desk", "Concierge", "Café"]},
    {"prefix": "City",      "brand": "Comfort Inn", "base_ppn": 2200,  "base_rating": 3.8, "stars": 3,
     "amenities": ["Free Wi-Fi", "Complimentary Breakfast", "Parking", "24h Reception"]},
    {"prefix": "Palace",    "brand": "Four Seasons","base_ppn": 14000, "base_rating": 4.9, "stars": 5,
     "amenities": ["Butler Service", "Private Pool", "Spa", "Free Wi-Fi", "Helipad", "Signature Fine Dining"]},
    {"prefix": "Sunrise",   "brand": "Holiday Inn", "base_ppn": 3200,  "base_rating": 4.1, "stars": 4,
     "amenities": ["Pool", "Free Wi-Fi", "Restaurant", "Bar", "Conference Rooms", "Parking"]},
]

_ROOM_TYPES = [
    "Deluxe Double Room", "Superior King Room", "Premium Sea View Room",
    "Junior Suite", "Executive Suite", "Family Room", "Garden View Room",
    "Penthouse Suite", "Classic Twin Room", "Pool Access Room",
]

_AREAS: Dict[str, List[str]] = {
    "goa":          ["Calangute", "Baga", "Anjuna", "Panaji", "Colva", "Palolem"],
    "mumbai":       ["Bandra", "Colaba", "Juhu", "Andheri", "Nariman Point"],
    "delhi":        ["Connaught Place", "Karol Bagh", "Aerocity", "Paharganj", "Dwarka"],
    "bangalore":    ["MG Road", "Koramangala", "Whitefield", "Indiranagar", "Jayanagar"],
    "jaipur":       ["MI Road", "Civil Lines", "C Scheme", "Vaishali Nagar", "Tonk Road"],
    "bali":         ["Seminyak", "Ubud", "Kuta", "Nusa Dua", "Canggu", "Uluwatu"],
    "bangkok":      ["Sukhumvit", "Silom", "Khao San Road", "Siam", "Asok"],
    "dubai":        ["Downtown", "Marina", "Deira", "Palm Jumeirah", "JBR"],
    "singapore":    ["Marina Bay", "Orchard Road", "Sentosa", "Clarke Quay", "Bugis"],
    "london":       ["Mayfair", "Kensington", "Covent Garden", "Shoreditch", "Chelsea"],
    "paris":        ["Saint-Germain", "Marais", "Champs-Élysées", "Montmartre", "Opera"],
}

_WEATHER_PROFILES: Dict[str, Dict[str, Any]] = {
    # month (1-12) → conditions per destination cluster
    "tropical": {   # Goa, Bali, Bangkok, Phuket, Maldives
        (12, 1, 2, 3): ("Sunny & Clear",     32, 65, "Perfect beach weather. Apply sunscreen."),
        (4, 5):         ("Hot & Humid",       35, 75, "Stay hydrated. Visit early mornings."),
        (6, 7, 8, 9):   ("Monsoon / Rain",    28, 90, "Carry an umbrella. Expect heavy showers."),
        (10, 11):       ("Partly Cloudy",     30, 70, "Good weather. Occasional showers possible."),
    },
    "north_india": {   # Delhi, Jaipur, Agra
        (12, 1, 2):     ("Cool & Foggy",      15, 70, "Carry warm layers. Morning fog likely."),
        (3, 4):         ("Pleasant",          28, 40, "Ideal sightseeing weather."),
        (5, 6):         ("Very Hot",          42, 30, "Avoid outdoor activities 11 AM–4 PM."),
        (7, 8, 9):      ("Monsoon",           33, 80, "Carry an umbrella. Roads may flood."),
        (10, 11):       ("Pleasant & Sunny",  28, 45, "Best time to visit. Comfortable all day."),
    },
    "coastal_india": {   # Mumbai, Kochi, Chennai, Goa (dry season)
        (11, 12, 1, 2): ("Sunny",             30, 60, "Great beach weather."),
        (3, 4, 5):      ("Hot & Humid",       36, 70, "Stay hydrated."),
        (6, 7, 8, 9):   ("Heavy Monsoon",     27, 95, "Outdoor plans may be disrupted."),
        (10):           ("Post-Monsoon",      29, 75, "Getting better. Carry an umbrella."),
    },
    "europe": {   # London, Paris, Rome, Barcelona
        (6, 7, 8):      ("Warm & Sunny",      26, 50, "Great outdoors weather. Light layers at night."),
        (3, 4, 5):      ("Mild & Breezy",     16, 60, "Carry a light jacket."),
        (9, 10):        ("Mild",              18, 65, "Comfortable sightseeing weather."),
        (11, 12, 1, 2): ("Cold & Overcast",   8,  75, "Dress in warm layers. Short daylight hours."),
    },
    "southeast_asia": {   # Singapore, KL, Ho Chi Minh, Hanoi, Jakarta
        (12, 1, 2, 3):  ("Warm & Sunny",      31, 70, "Pleasant. Occasional afternoon showers."),
        (4, 5):         ("Hot & Humid",       34, 80, "Stay indoors during peak afternoon heat."),
        (6, 7, 8, 9):   ("Partly Cloudy",     30, 75, "Comfortable with occasional rain."),
        (10, 11):       ("Rainy Season",      28, 85, "Carry an umbrella."),
    },
    "default": {
        (1, 2, 3):      ("Cool & Pleasant",   22, 55, "Comfortable travel weather."),
        (4, 5, 6):      ("Warm & Sunny",      30, 50, "Great outdoor conditions."),
        (7, 8, 9):      ("Warm",              28, 60, "Good weather. Stay hydrated."),
        (10, 11, 12):   ("Mild",              20, 55, "Pleasant conditions for sightseeing."),
    },
}

_DEST_CLUSTER: Dict[str, str] = {
    "goa": "tropical", "bali": "tropical", "bangkok": "tropical",
    "phuket": "tropical", "maldives": "tropical", "colombo": "tropical",
    "delhi": "north_india", "jaipur": "north_india", "agra": "north_india",
    "mumbai": "coastal_india", "kochi": "coastal_india", "chennai": "coastal_india",
    "london": "europe", "paris": "europe", "rome": "europe",
    "barcelona": "europe", "madrid": "europe", "amsterdam": "europe",
    "zurich": "europe", "frankfurt": "europe",
    "singapore": "southeast_asia", "kuala lumpur": "southeast_asia",
    "ho chi minh": "southeast_asia", "hanoi": "southeast_asia",
    "jakarta": "southeast_asia",
}


def _city_to_airport(city: str) -> str:
    return _CITY_AIRPORT.get(city.lower().strip(), city.upper()[:3])


def _parse_date(date_str: str) -> datetime:
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return datetime.today()


def _get_weather_profile(destination: str, month: int) -> tuple:
    cluster = _DEST_CLUSTER.get(destination.lower().strip(), "default")
    profile = _WEATHER_PROFILES.get(cluster, _WEATHER_PROFILES["default"])
    for months_tuple, data in profile.items():
        if month in months_tuple:
            return data
    # fallback: first entry
    return next(iter(profile.values()))


# ---------------------------------------------------------------------------
# DummyFlightProvider
# ---------------------------------------------------------------------------

class DummyFlightProvider(FlightProvider):
    """
    Generates realistic dummy flights for any city pair.

    Uses Indian domestic/international carriers by default.
    Replace this class with RealFlightProvider when the API is ready.
    """

    _STATUS_TAG = "✈ Demo Flight"

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)

    def search(self, params: FlightSearchParams) -> List[Flight]:
        origin_code = _city_to_airport(params.origin)
        dest_code   = _city_to_airport(params.destination)
        dep_dt      = _parse_date(params.departure_date)

        cabin_multiplier = {
            CabinClass.ECONOMY:         1.0,
            CabinClass.PREMIUM_ECONOMY: 1.8,
            CabinClass.BUSINESS:        3.5,
            CabinClass.FIRST:           6.0,
        }
        base_price_inr = self._rng.uniform(3500, 12000) * cabin_multiplier.get(
            params.cabin_class or CabinClass.ECONOMY, 1.0
        )

        flights: List[Flight] = []
        for _ in range(self._rng.randint(5, 8)):
            airline    = self._rng.choice(_AIRLINES)
            stops      = self._rng.choices([0, 1, 2], weights=[55, 35, 10])[0]
            duration   = self._rng.randint(60, 720) + stops * self._rng.randint(45, 90)
            dep_hour   = self._rng.randint(4, 22)
            dep_minute = self._rng.choice([0, 15, 30, 45])
            dep_time   = dep_dt.replace(hour=dep_hour, minute=dep_minute, second=0, microsecond=0)
            arr_time   = dep_time + timedelta(minutes=duration)
            price_pp   = round(base_price_inr * self._rng.uniform(0.75, 1.30), 0)
            total      = round(price_pp * params.num_passengers, 0)
            flight_num = f"{airline['iata']}-{self._rng.randint(100, 9999)}"

            flights.append(Flight(
                flight_id         = f"fl_{uuid.uuid4().hex[:6]}",
                airline           = airline["name"],
                flight_number     = flight_num,
                departure_airport = origin_code,
                arrival_airport   = dest_code,
                departure_time    = dep_time.strftime("%Y-%m-%dT%H:%M:%S"),
                arrival_time      = arr_time.strftime("%Y-%m-%dT%H:%M:%S"),
                duration_minutes  = duration,
                stops             = stops,
                price_per_person  = price_pp,
                total_price       = total,
                cabin             = params.cabin_class or CabinClass.ECONOMY,
                refundable        = self._rng.choice([True, False]),
                baggage_included  = self._rng.choice([True, False]),
            ))

        # Respect filters — but always return at least 3
        filtered = [f for f in flights
                    if (params.max_price is None or f.total_price <= params.max_price)]
        return filtered if len(filtered) >= 3 else sorted(flights, key=lambda f: f.total_price)[:5]

    def prebook(self, flight: Flight, num_passengers: int) -> FlightPrebook:
        return FlightPrebook(
            prebook_id    = f"FLT-{uuid.uuid4().hex[:8].upper()}",
            flight        = flight,
            passengers    = num_passengers,
            total_charged = round(flight.price_per_person * num_passengers, 0),
            status        = "confirmed",
        )


# ---------------------------------------------------------------------------
# DummyHotelProvider
# ---------------------------------------------------------------------------

class DummyHotelProvider(HotelProvider):
    """
    Generates realistic dummy hotels for any destination.

    Includes destination-aware area names.
    Replace with RealHotelProvider when a booking API is ready.
    """

    _STATUS_TAG = "🏨 Demo Hotel"

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)

    def search(self, params: HotelSearchParams) -> List[Hotel]:
        nights      = self._calc_nights(params.check_in, params.check_out)
        dest_title  = params.destination.title()
        dest_key    = params.destination.lower().strip()
        areas       = _AREAS.get(dest_key, [f"City Centre", "Old Town", "Tourist District",
                                             "Beachfront", "Downtown", "Heritage Quarter"])

        hotels: List[Hotel] = []
        num_options = self._rng.randint(6, 9)
        templates   = self._rng.sample(_HOTEL_TEMPLATES, min(num_options, len(_HOTEL_TEMPLATES)))

        for tmpl in templates:
            area       = self._rng.choice(areas)
            ppn        = round(tmpl["base_ppn"] * self._rng.uniform(0.80, 1.25), 0)
            rating     = round(min(5.0, tmpl["base_rating"] + self._rng.uniform(-0.2, 0.2)), 1)
            room_type  = self._rng.choice(_ROOM_TYPES)
            amenities  = list(tmpl["amenities"])
            self._rng.shuffle(amenities)
            amenities  = amenities[:self._rng.randint(4, len(amenities))]
            total      = round(ppn * nights, 0)
            hotel_name = f"{tmpl['prefix']} {dest_title} {tmpl['brand']}"

            hotels.append(Hotel(
                hotel_id                = f"htl_{uuid.uuid4().hex[:6]}",
                name                    = hotel_name,
                rating                  = rating,
                address                 = f"{area}, {dest_title}",
                distance_from_center_km = round(self._rng.uniform(0.3, 7.5), 1),
                price_per_night         = ppn,
                amenities               = amenities,
                room_type               = room_type,
                check_in                = params.check_in,
                check_out               = params.check_out,
                total_price             = total,
            ))

        filtered = [h for h in hotels
                    if (params.max_price_per_night is None or h.price_per_night <= params.max_price_per_night)
                    and (params.min_rating is None or h.rating >= params.min_rating)]
        return filtered if len(filtered) >= 3 else sorted(hotels, key=lambda h: h.rating, reverse=True)[:5]

    def prebook(
        self,
        hotel: Hotel,
        check_in: str,
        check_out: str,
        num_guests: int,
        day_number: Optional[int] = None,
    ) -> HotelPrebook:
        nights = self._calc_nights(check_in, check_out)
        return HotelPrebook(
            prebook_id    = f"HTL-{uuid.uuid4().hex[:8].upper()}",
            hotel         = hotel,
            check_in      = check_in,
            check_out     = check_out,
            guests        = num_guests,
            total_charged = round(hotel.price_per_night * nights, 0),
            status        = "confirmed",
            day_number    = day_number,
        )

    @staticmethod
    def _calc_nights(check_in: str, check_out: str) -> int:
        try:
            d1 = date.fromisoformat(check_in)
            d2 = date.fromisoformat(check_out)
            return max(1, (d2 - d1).days)
        except ValueError:
            return 1


# ---------------------------------------------------------------------------
# DummyWeatherProvider
# ---------------------------------------------------------------------------

class DummyWeatherProvider(WeatherProvider):
    """
    Generates realistic rule-based weather forecasts.

    Based on destination cluster + month seasonality.
    No API key required. Replace with RealWeatherProvider for live data.
    """

    _CONDITIONS_VARIATION = [
        ("Sunny & Clear",      2),
        ("Partly Cloudy",      1),
        ("Light Clouds",       1),
        ("Breezy",             1),
        ("Warm & Humid",       1),
    ]

    def __init__(self, seed: Optional[int] = None) -> None:
        self._rng = random.Random(seed)

    def forecast(
        self,
        destination: str,
        start_date: str,
        num_days: int,
    ) -> List[WeatherEntry]:
        try:
            start = date.fromisoformat(start_date)
        except ValueError:
            start = date.today()

        entries: List[WeatherEntry] = []
        for i in range(num_days):
            day     = start + timedelta(days=i)
            month   = day.month
            cond, temp_c, humidity, advice = _get_weather_profile(destination, month)

            # Add slight day-to-day variation
            temp_c    = temp_c + self._rng.randint(-2, 2)
            humidity  = min(99, humidity + self._rng.randint(-5, 5))

            entries.append(WeatherEntry(
                date_str      = day.strftime("%d %b %Y"),
                temperature_c = temp_c,
                condition     = cond,
                humidity_pct  = humidity,
                advice        = advice,
            ))
        return entries


# ===========================================================================
# Provider factory — change ONE line here to go live
# ===========================================================================

def get_flight_provider() -> FlightProvider:
    """Return the active flight provider. Swap DummyFlightProvider → RealFlightProvider here."""
    return DummyFlightProvider()


def get_hotel_provider() -> HotelProvider:
    """Return the active hotel provider. Swap DummyHotelProvider → RealHotelProvider here."""
    return DummyHotelProvider()


def get_weather_provider() -> WeatherProvider:
    """Return the active weather provider. Swap DummyWeatherProvider → RealWeatherProvider here."""
    return DummyWeatherProvider()
