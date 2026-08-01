"""
Flight Agent — LiteAPI Implementation.

Searches flights via LiteAPI and returns typed Pydantic models.
Supports ranking, filtering, and pre-booking workflows (real LiteAPI API).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import List, Optional

import requests

from backend.config import settings
from backend.models.state import (
    CabinClass,
    ContactDetails,
    Flight,
    FlightPrebook,
    FlightSearchParams,
    Passenger,
    PassengerGender,
    PassengerType,
    RankingCriteria,
)
from realtime_flight_search import extract_flight_results

_LITEAPI_PREBOOK_URL = "https://api.liteapi.travel/v3.0/flights/prebooks"


class FlightPrebookError(RuntimeError):
    """Raised when the LiteAPI pre-booking call fails."""

    def __init__(self, message: str, status_code: Optional[int] = None, detail: Optional[str] = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail

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
        self._api_key = settings.liteapi_api_key or ""

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
        contact: ContactDetails,
        passengers: List[Passenger],
        use_payment_sdk: bool = False,
    ) -> FlightPrebook:
        """
        Pre-book a flight via the real LiteAPI `/flights/prebooks` endpoint.

        *contact* and *passengers* must be validated Pydantic models
        (e.g. from the Passenger Details form). Returns a typed
        FlightPrebook that stores the complete LiteAPI response.
        """
        if not self._api_key:
            raise FlightPrebookError(
                "LITEAPI_API_KEY is not configured. Add it to the .env file."
            )
        if not flight.offer_id:
            raise FlightPrebookError(
                "The selected flight has no offerId. Please re-search flights and try again."
            )

        payload = {
            "offerId": flight.offer_id,
            "usePaymentSdk": bool(use_payment_sdk),
            "contact": {
                "firstName":        contact.first_name,
                "lastName":         contact.last_name,
                "email":            contact.email,
                "phoneNumber":      contact.phone,
                "phoneCountryCode": contact.phone_country_code,
            },
            "passengers": [self._passenger_payload(p) for p in passengers],
        }

        headers = {
            "X-API-Key": self._api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        try:
            response = requests.post(
                _LITEAPI_PREBOOK_URL,
                headers=headers,
                json=payload,
                timeout=60,
            )
        except requests.RequestException as exc:
            raise FlightPrebookError(
                f"Network error while pre-booking flight: {exc}"
            ) from exc

        if response.status_code >= 400:
            detail = _extract_api_error(response)
            raise FlightPrebookError(
                f"LiteAPI pre-booking failed: {detail}", 
                status_code=response.status_code,
                detail=detail,
            )

        data = response.json()
        return self._parse_prebook(data, flight, contact, passengers)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _passenger_payload(p: Passenger) -> dict:
        """Convert a Passenger model into the LiteAPI payload shape."""
        payload = {
            "type":      p.type.value,
            "firstName": p.first_name,
            "lastName":  p.last_name,
            "gender":    p.gender.value,
            "birthday":  p.birthday,
        }
        if p.nationality:
            payload["nationality"] = p.nationality
        if p.document_type:
            payload["documentType"] = p.document_type.lower()
        if p.document_issue_country:
            payload["documentIssueCountry"] = p.document_issue_country
        if p.document_number:
            payload["documentNumber"] = p.document_number
        if p.document_expiry:
            payload["documentExpiry"] = p.document_expiry
        if p.document is not None:
            payload["document"] = {
                "number":         p.document.number,
                "expiryDate":     p.document.expiry_date,
                "issuingCountry": p.document.issuing_country,
                "nationality":    p.document.nationality,
                "type":           p.document.type,
            }
        return payload

    @staticmethod
    def _parse_prebook(
        data: dict,
        flight: Flight,
        contact: ContactDetails,
        passengers: List[Passenger],
    ) -> FlightPrebook:
        """Extract a typed FlightPrebook from the raw LiteAPI response."""
        item = (data.get("data") or [{}])[0] if isinstance(data.get("data"), list) else data

        booking   = item.get("booking") or {}
        pricing   = booking.get("pricing") or {}
        currency  = item.get("currency") or pricing.get("currency")
        total     = (
            item.get("price")
            or pricing.get("totalAmount")
            or pricing.get("total")
            or flight.total_price
        )
        status    = item.get("status") or booking.get("status") or "confirmed"
        pax_raw   = booking.get("passengers") or []

        passenger_details: List[Passenger] = []
        for i, raw in enumerate(pax_raw):
            fallback = passengers[i] if i < len(passengers) else None
            passenger_details.append(
                Passenger(
                    type=PassengerType(
                        (raw.get("type") or (fallback.type.value if fallback else "ADULT")).upper()
                    ),
                    first_name=raw.get("firstName") or (fallback.first_name if fallback else ""),
                    last_name=raw.get("lastName") or (fallback.last_name if fallback else ""),
                    gender=PassengerGender(raw.get("gender") or (fallback.gender.value if fallback else "M")),
                    birthday=raw.get("birthday") or (fallback.birthday if fallback else ""),
                    nationality=raw.get("nationality"),
                    document_type=raw.get("documentType"),
                    document_issue_country=raw.get("documentIssueCountry"),
                    document_number=raw.get("documentNumber"),
                    document_expiry=raw.get("documentExpiry"),
                )
            )

        return FlightPrebook(
            prebook_id        = item.get("prebookId") or item.get("id")
                                  or f"FLT-{uuid.uuid4().hex[:8].upper()}",
            flight            = flight,
            passengers        = len(passenger_details) or len(passengers),
            total_charged     = round(float(total or flight.total_price), 2),
            status            = str(status).lower(),
            offer_id          = item.get("offerId") or flight.offer_id,
            contact           = contact,
            passenger_details = passenger_details or passengers,
            booking_status    = str(status),
            hold_expiry       = item.get("holdExpiry") or item.get("expiresAt"),
            bookable          = item.get("bookable"),
            currency          = currency,
            raw_response      = data,
        )

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
                    offer_id=entry.get("offer_id"),
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


# ---------------------------------------------------------------------------
# Module helpers
# ---------------------------------------------------------------------------

def _extract_api_error(response: requests.Response) -> str:
    """Best-effort extraction of a human-readable error from a LiteAPI response."""
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            for key in ("description", "message", "error"):
                if err.get(key):
                    code = err.get("code")
                    detail = str(err[key])
                    return f"{code}: {detail}" if code else detail
        message = (
            body.get("message")
            or body.get("error")
            or body.get("errorMessage")
            or body.get("detail")
        )
        if message:
            return str(message)
        if body.get("errors"):
            return json.dumps(body["errors"])
    return response.text or f"HTTP {response.status_code}"
