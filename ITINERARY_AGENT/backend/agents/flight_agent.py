"""
Flight Agent — LiteAPI Implementation.

Searches flights via LiteAPI and returns typed Pydantic models.
Supports ranking, filtering, and pre-booking workflows.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from backend.models.state import (
    CabinClass,
    Flight,
    FlightPrebook,
    FlightSearchParams,
    RankingCriteria,
)
from realtime_flight_search import extract_flight_results

_CITY_AIRPORT: dict = {
    # ---------------- Major metros ----------------
    "delhi": "DEL", "new delhi": "DEL",
    "mumbai": "BOM", "bombay": "BOM",
    "bengaluru": "BLR", "bangalore": "BLR",
    "chennai": "MAA", "madras": "MAA",
    "kolkata": "CCU", "calcutta": "CCU",
    "hyderabad": "HYD", "secunderabad": "HYD",
    "ahmedabad": "AMD",
    "pune": "PNQ",
 
    # ---------------- Goa ----------------
    "goa": "GOI", "dabolim": "GOI", "panaji": "GOI", "panjim": "GOI",
    "north goa": "GOX", "mopa": "GOX", "manohar international airport": "GOX",
 
    # ---------------- Kerala (God's Own Country) ----------------
    "kochi": "COK", "cochin": "COK", "ernakulam": "COK",
    "thiruvananthapuram": "TRV", "trivandrum": "TRV",
    "kozhikode": "CCJ", "calicut": "CCJ",
    "kannur": "CNN",
    "munnar": "COK", "alleppey": "COK", "alappuzha": "COK",
    "kumarakom": "COK", "varkala": "TRV", "kovalam": "TRV",
    "wayanad": "CNN", "thekkady": "MAA", "periyar": "MAA",
 
    # ---------------- Tamil Nadu ----------------
    "madurai": "IXM",
    "coimbatore": "CJB",
    "tiruchirapalli": "TRZ", "trichy": "TRZ",
    "salem": "SXV",
    "tuticorin": "TCR", "thoothukudi": "TCR",
    "ooty": "CJB", "udhagamandalam": "CJB", "kodaikanal": "IXM",
    "rameswaram": "MDU", "kanyakumari": "TRV",
    "pondicherry": "PNY", "puducherry": "PNY",
    "mahabalipuram": "MAA", "mamallapuram": "MAA",
 
    # ---------------- Karnataka ----------------
    "mysore": "MYQ", "mysuru": "MYQ",
    "mangalore": "IXE", "mangaluru": "IXE",
    "hubli": "HBX", "hubballi": "HBX",
    "belgaum": "IXG", "belagavi": "IXG",
    "hampi": "HBX", "coorg": "IXE", "madikeri": "IXE",
    "chikmagalur": "IXE",
 
    # ---------------- Andhra Pradesh / Telangana ----------------
    "vijayawada": "VGA",
    "visakhapatnam": "VTZ", "vizag": "VTZ",
    "tirupati": "TIR",
    "rajahmundry": "RJA",
    "kurnool": "KJB",
 
    # ---------------- Maharashtra ----------------
    "nagpur": "NAG",
    "nashik": "ISK",
    "aurangabad": "IXU", "ajanta ellora": "IXU",
    "kolhapur": "KLH",
    "shirdi": "SAG",
    "lonavala": "PNQ", "mahabaleshwar": "PNQ",
    "alibaug": "BOM",
 
    # ---------------- Rajasthan (desert & forts) ----------------
    "jaipur": "JAI", "pink city": "JAI", "pushkar": "JAI",
    "udaipur": "UDR", "city of lakes": "UDR",
    "jodhpur": "JDH", "blue city": "JDH",
    "jaisalmer": "JSA", "golden city": "JSA",
    "bikaner": "BKB",
    "kota": "KTU",
    "ajmer": "JAI",
    "mount abu": "UDR",
    "ranthambore": "JAI",
 
    # ---------------- Gujarat ----------------
    "vadodara": "BDQ", "baroda": "BDQ",
    "surat": "STV",
    "rajkot": "RAJ",
    "bhuj": "BHJ", "rann of kutch": "BHJ", "kutch": "BHJ",
    "porbandar": "PBD",
    "jamnagar": "JGA",
    "diu": "DIU",
    "somnath": "DIU", "dwarka": "JGA",
    "gir": "RAJ", "gir forest": "RAJ",
 
    # ---------------- Punjab / Haryana / Chandigarh ----------------
    "amritsar": "ATQ", "golden temple": "ATQ",
    "chandigarh": "IXC",
    "ludhiana": "LUH",
    "kullu": "KUU", "manali": "KUU", "bhuntar": "KUU", "kasol": "KUU",
 
    # ---------------- Himachal Pradesh ----------------
    "shimla": "SLV",
    "dharamshala": "DHM", "mcleodganj": "DHM", "mcleod ganj": "DHM",
    "spiti": "KUU", "spiti valley": "KUU",
    "kangra": "DHM",
 
    # ---------------- Uttarakhand ----------------
    "dehradun": "DED",
    "rishikesh": "DED", "haridwar": "DED",
    "mussoorie": "DED",
    "nainital": "PGH", "pantnagar": "PGH",
    "jim corbett": "PGH", "corbett national park": "PGH",
    "auli": "DED", "badrinath": "DED", "kedarnath": "DED",
 
    # ---------------- Uttar Pradesh ----------------
    "lucknow": "LKO",
    "varanasi": "VNS", "benares": "VNS", "kashi": "VNS",
    "agra": "AGR", "taj mahal": "AGR",
    "kanpur": "KNU",
    "prayagraj": "IXD", "allahabad": "IXD",
    "gorakhpur": "GOP",
    "ayodhya": "AYJ",
 
    # ---------------- Madhya Pradesh ----------------
    "bhopal": "BHO",
    "indore": "IDR",
    "gwalior": "GWL",
    "jabalpur": "JLR",
    "khajuraho": "HJR",
    "pachmarhi": "BHO",
 
    # ---------------- Bihar / Jharkhand ----------------
    "patna": "PAT",
    "gaya": "GAY", "bodh gaya": "GAY", "bodhgaya": "GAY",
    "ranchi": "IXR",
    "jamshedpur": "IXW",
    "deoghar": "DGH",
 
    # ---------------- West Bengal / Sikkim / North East ----------------
    "bagdogra": "IXB", "darjeeling": "IXB", "siliguri": "IXB",
    "gangtok": "PYG", "pakyong": "PYG",
    "guwahati": "GAU",
    "shillong": "SHL",
    "imphal": "IMF",
    "agartala": "IXA",
    "aizawl": "AJL",
    "dimapur": "DMU", "kohima": "DMU",
    "dibrugarh": "DIB",
    "jorhat": "JRH", "kaziranga": "JRH",
    "silchar": "IXS",
    "tezpur": "TEZ",
    "itanagar": "HGI",
 
    # ---------------- Odisha ----------------
    "bhubaneswar": "BBI",
    "puri": "BBI", "konark": "BBI",
 
    # ---------------- Chhattisgarh ----------------
    "raipur": "RPR",
    "bilaspur": "PAB",
    "jagdalpur": "JGB",
 
    # ---------------- Jammu & Kashmir / Ladakh ----------------
    "srinagar": "SXR", "kashmir": "SXR", "gulmarg": "SXR", "pahalgam": "SXR",
    "jammu": "IXJ", "vaishno devi": "IXJ",
    "leh": "IXL", "ladakh": "IXL",
 
    # ---------------- Andaman & Nicobar / Lakshadweep ----------------
    "port blair": "IXZ", "andaman": "IXZ", "havelock island": "IXZ",
    "agatti": "AGX", "lakshadweep": "AGX",
 
    # ---------------- Small / regional airports ----------------
    "hisar": "HSS",
    "bareilly": "BEK",
    "moradabad": "DEL",
    "bhavnagar": "BHU",
    "kandla": "IXY",
    "satna": "TNI",
    "bellary": "BEP",
    "hubali": "HBX",
    "tezu": "TEI",
    "along": "IXV", "aalo": "IXV",
    "pasighat": "IXT",
    "cooch behar": "COH",
    "bhatinda": "BUP", "bathinda": "BUP",
    "pathankot": "IXP",
    "gaggal": "DHM",
    "kishangarh": "KQH",
    "sindhudurg": "SDW", "chipi": "SDW",
    "kannur international": "CNN",
    "durgapur": "RDP",
    "cuddapah": "CDP", "kadapa": "CDP",
    "puttaparthi": "PUT",
    "warangal": "HYD",
    "vidyanagar": "VDY", "bellary steel city": "VDY",
    "salem international": "SXV",
    "hirasar": "RAJ",
    "adampur": "AIP",
    "gondia": "GDB",
    "khowai": "IXA",
    "rupsi": "RUP",
    "lilabari": "IXI", "north lakhimpur": "IXI",
    "mizoram": "AJL",
 
    # ---------------- Common misspellings / aliases ----------------
    "banglore": "BLR", "bengalooru": "BLR",
    "dilli": "DEL",
    "bombai": "BOM",
    "kolkatta": "CCU",
    "chenai": "MAA",
    "hyderbad": "HYD",
    "vizag city": "VTZ",
    "cochi": "COK",
 
    # ---------------- Popular international (for a general agent) ----------------
    "dubai": "DXB", "abu dhabi": "AUH", "sharjah": "SHJ",
    "singapore": "SIN", "kuala lumpur": "KUL", "bangkok": "BKK",
    "london": "LHR", "new york": "JFK", "paris": "CDG",
    "tokyo": "HND", "hong kong": "HKG", "doha": "DOH",
    "muscat": "MCT", "colombo": "CMB", "kathmandu": "KTM",
    "male": "MLE", "maldives": "MLE",
}


def _city_to_airport(city: str) -> str:
    """Best-effort city → IATA code lookup."""
    key = city.lower().strip()
    direct = _CITY_AIRPORT.get(key)
    if direct:
        return direct
    # try partial match (e.g. "new delhi" → "DEL")
    for name, code in _CITY_AIRPORT.items():
        if name in key or key in name:
            return code
    return city.upper()[:3]


def _parse_date(date_str: str) -> datetime:
    """Parse an ISO date string into a datetime object."""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    raise ValueError(f"Unrecognised date format: {date_str}")


# ---------------------------------------------------------------------------
# FlightAgent class
# ---------------------------------------------------------------------------

class FlightAgent:
    """
    Flight Agent backed by LiteAPI.

    All public methods return typed Pydantic objects so the rest of the
    application never has to deal with raw dicts.
    """

    def __init__(self) -> None:
        pass

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def search_flights(self, params: FlightSearchParams) -> List[Flight]:
        """
        Search for available flights matching *params*.

        Returns a list of up to 8 flights, unranked.
        """
        raw = self._fetch_raw_flights(params)
        return self._apply_filters(raw, params)

    def search_and_rank(
        self,
        params: FlightSearchParams,
        criteria: RankingCriteria = RankingCriteria.BEST_VALUE,
    ) -> List[Flight]:
        """
        Search, filter, and rank flights in one call.

        Returns a list ordered by *criteria* (best first).
        """
        flights = self.search_flights(params)
        return self.rank_flights(flights, criteria)

    def rank_flights(
        self,
        flights: List[Flight],
        criteria: RankingCriteria = RankingCriteria.BEST_VALUE,
    ) -> List[Flight]:
        """
        Rank *flights* according to *criteria* and attach a ranking_score.

        ranking_score is normalised to 0-100 (higher = better).
        """
        if not flights:
            return []

        scored = []
        if criteria == RankingCriteria.PRICE:
            prices = [f.total_price for f in flights]
            min_p, max_p = min(prices), max(prices)
            span = max_p - min_p or 1
            for f in flights:
                score = 100 - ((f.total_price - min_p) / span * 100)
                scored.append(f.model_copy(update={"ranking_score": round(score, 1)}))

        elif criteria == RankingCriteria.DURATION:
            durations = [f.duration_minutes for f in flights]
            min_d, max_d = min(durations), max(durations)
            span = max_d - min_d or 1
            for f in flights:
                score = 100 - ((f.duration_minutes - min_d) / span * 100)
                scored.append(f.model_copy(update={"ranking_score": round(score, 1)}))

        else:  # BEST_VALUE — weighted composite
            prices    = [f.total_price      for f in flights]
            durations = [f.duration_minutes for f in flights]
            min_p, max_p = min(prices), max(prices)
            min_d, max_d = min(durations), max(durations)
            p_span = max_p - min_p or 1
            d_span = max_d - min_d or 1
            for f in flights:
                price_score    = 100 - ((f.total_price      - min_p) / p_span * 100)
                duration_score = 100 - ((f.duration_minutes - min_d) / d_span * 100)
                # bonus for non-stop and refundable
                stop_bonus      = 10 if f.stops == 0 else 0
                refund_bonus    = 5  if f.refundable else 0
                baggage_bonus   = 3  if f.baggage_included else 0
                score = (price_score * 0.5 + duration_score * 0.35
                         + stop_bonus + refund_bonus + baggage_bonus)
                scored.append(f.model_copy(update={"ranking_score": round(min(score, 100), 1)}))

        return sorted(scored, key=lambda f: f.ranking_score, reverse=True)

    def prebook_flight(
        self,
        flight: Flight,
        num_passengers: int,
    ) -> FlightPrebook:
        """
        Pre-book a flight and return a booking confirmation.
        """
        prebook_id = f"FLT-{uuid.uuid4().hex[:8].upper()}"
        total = round(flight.price_per_person * num_passengers, 2)
        return FlightPrebook(
            prebook_id=prebook_id,
            flight=flight,
            passengers=num_passengers,
            total_charged=total,
            status="confirmed",
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _fetch_raw_flights(self, params: FlightSearchParams) -> List[Flight]:
        raw = extract_flight_results(
            origin=_city_to_airport(params.origin),
            destination=_city_to_airport(params.destination),
            date=params.departure_date,
            adults=params.num_passengers,
            cabin_class=params.cabin_class.value if params.cabin_class else "ECONOMY",
        )

        flights: List[Flight] = []
        for entry in raw:
            cabin_str = entry.get("cabin", "Economy")
            cabin = next(
                (c for c in CabinClass if c.value == cabin_str),
                CabinClass.ECONOMY,
            )
            price_pp = round(entry["total_price"] / params.num_passengers, 2)
            baggage_included = (
                entry.get("checked_bag") is not None
                or entry.get("cabin_bag") is not None
            )

            flights.append(
                Flight(
                    flight_id=f"fl_{uuid.uuid4().hex[:6]}",
                    airline=entry["airline"],
                    flight_number=entry["flight_number"],
                    departure_airport=entry["origin"],
                    arrival_airport=entry["destination"],
                    departure_time=entry["departure"],
                    arrival_time=entry["arrival"],
                    duration_minutes=entry["duration_minutes"],
                    stops=entry.get("stops", 0),
                    price_per_person=price_pp,
                    total_price=entry["total_price"],
                    cabin=cabin,
                    refundable=bool(entry.get("refundable", False)),
                    baggage_included=baggage_included,
                )
            )

        return flights

    def _apply_filters(
        self,
        flights: List[Flight],
        params: FlightSearchParams,
    ) -> List[Flight]:
        """Filter the raw list to respect max_price and max_stops constraints."""
        result = flights

        if params.max_price is not None:
            result = [f for f in result if f.total_price <= params.max_price]

        if params.max_stops is not None:
            result = [f for f in result if f.stops <= params.max_stops]

        return result
