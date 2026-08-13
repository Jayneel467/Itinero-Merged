"""Public transit via Google Routes TRANSIT (all modes).

Bus, metro/subway, tram, light rail, commuter/rail, ferry — same coverage as
Google Maps. Intercity coaches still use this feed. Never invent an operator,
timetable, or fare. Booking is a partner handoff — do not name the partner in UI.
"""
from __future__ import annotations

import difflib
import logging
import math
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any
from urllib.parse import quote, urlencode
from zoneinfo import ZoneInfo

from general_agent.exceptions import ProviderRequestError
from providers import google_maps_provider

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_PIN_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL = 12 * 60
_PIN_TTL = 60 * 60

_SLUG_FIX = {
    "baroda": "baroda",
    "vadodara": "baroda",
    "vadodara jn": "baroda",
    "vadodara junction": "baroda",
    "bombay": "mumbai",
    "bengaluru": "bangalore",
    "madras": "chennai",
    "calcutta": "kolkata",
    "gurugram": "gurgaon",
    "new delhi": "delhi",
}

_CITY_ID = {
    "surat": "473",
    "ahmedabad": "551",
    "baroda": "1003",
    "vadodara": "1003",
    "mumbai": "462",
    "pune": "130",
    "delhi": "733",
    "new delhi": "733",
    "chennai": "123",
    "bangalore": "122",
    "bengaluru": "122",
    "hyderabad": "124",
    "bhopal": "979",
    "indore": "313",
    "agra": "1290",
    "manali": "757",
    "goa": "210",
    "mahabaleshwar": "445",
}

_WINDOW_HOURS = {
    "morning": (6, 7, 8, 9, 10, 11),
    "afternoon": (12, 13, 14, 15, 16, 17),
    "evening": (18, 19, 20, 21, 22, 23),
    "night": (0, 1, 2, 3, 4, 5),
}
_ALL_HOURS = (0, 2, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23)

_CITY_CANON = {
    "baroda": "Vadodara",
    "vadodara": "Vadodara",
    "vadodara jn": "Vadodara",
    "vadodara junction": "Vadodara",
    "bombay": "Mumbai",
    "mumbai": "Mumbai",
    "bengaluru": "Bengaluru",
    "bangalore": "Bengaluru",
    "madras": "Chennai",
    "chennai": "Chennai",
    "calcutta": "Kolkata",
    "kolkata": "Kolkata",
    "amdavad": "Ahmedabad",
    "ahmedabad": "Ahmedabad",
    "new delhi": "Delhi",
    "delhi": "Delhi",
    "gurugram": "Gurugram",
    "gurgaon": "Gurugram",
    "surat": "Surat",
    "pune": "Pune",
    "jaipur": "Jaipur",
    "hyderabad": "Hyderabad",
    "indore": "Indore",
    "bhopal": "Bhopal",
    "goa": "Goa",
    "panaji": "Goa",
    "new york": "New York",
    "nyc": "New York",
    "manhattan": "New York",
    "state college": "State College",
    "penn state": "State College",
    "boston": "Boston",
    "philadelphia": "Philadelphia",
    "philly": "Philadelphia",
    "washington": "Washington",
    "washington dc": "Washington",
    "chicago": "Chicago",
    "los angeles": "Los Angeles",
    "san francisco": "San Francisco",
    "seattle": "Seattle",
    "miami": "Miami",
    "atlanta": "Atlanta",
    "pittsburgh": "Pittsburgh",
    "baltimore": "Baltimore",
    "newark": "Newark",
    "albany": "Albany",
    "buffalo": "Buffalo",
    "ithaca": "Ithaca",
    "harrisburg": "Harrisburg",
    "hershey": "Hershey",
    "toronto": "Toronto",
    "montreal": "Montreal",
    "vancouver": "Vancouver",
    "london": "London",
    "paris": "Paris",
    "berlin": "Berlin",
    "amsterdam": "Amsterdam",
    "rome": "Rome",
    "milan": "Milan",
    "barcelona": "Barcelona",
    "madrid": "Madrid",
    "lisbon": "Lisbon",
    "prague": "Prague",
    "vienna": "Vienna",
    "munich": "Munich",
    "brussels": "Brussels",
    "zurich": "Zurich",
}

_US_KEYS = {
    "new york", "nyc", "manhattan", "state college", "penn state", "boston",
    "philadelphia", "philly", "washington", "washington dc", "chicago",
    "los angeles", "san francisco", "seattle", "miami", "atlanta", "pittsburgh",
    "baltimore", "newark", "albany", "buffalo", "ithaca", "harrisburg", "hershey",
    "toronto", "montreal", "vancouver",
}
_EU_KEYS = {
    "london", "paris", "berlin", "amsterdam", "rome", "milan", "barcelona",
    "madrid", "lisbon", "prague", "vienna", "munich", "brussels", "zurich",
}
_EU_COUNTRY = {
    "london": "UK",
    "paris": "France",
    "berlin": "Germany",
    "amsterdam": "Netherlands",
    "rome": "Italy",
    "milan": "Italy",
    "barcelona": "Spain",
    "madrid": "Spain",
    "lisbon": "Portugal",
    "prague": "Czechia",
    "vienna": "Austria",
    "munich": "Germany",
    "brussels": "Belgium",
    "zurich": "Switzerland",
}
_US_STATE = {
    "new york": "NY",
    "nyc": "NY",
    "manhattan": "NY",
    "state college": "PA",
    "penn state": "PA",
    "boston": "MA",
    "philadelphia": "PA",
    "philly": "PA",
    "washington": "DC",
    "washington dc": "DC",
    "chicago": "IL",
    "los angeles": "CA",
    "san francisco": "CA",
    "seattle": "WA",
    "miami": "FL",
    "atlanta": "GA",
    "pittsburgh": "PA",
    "baltimore": "MD",
    "newark": "NJ",
    "albany": "NY",
    "buffalo": "NY",
    "ithaca": "NY",
    "harrisburg": "PA",
    "hershey": "PA",
    "toronto": "ON",
    "montreal": "QC",
    "vancouver": "BC",
}
_IN_KEYS = {
    "baroda", "vadodara", "bombay", "mumbai", "bengaluru", "bangalore", "madras",
    "chennai", "calcutta", "kolkata", "amdavad", "ahmedabad", "delhi", "new delhi",
    "gurugram", "gurgaon", "surat", "pune", "jaipur", "hyderabad", "indore",
    "bhopal", "goa", "panaji", "rajkot", "udaipur", "jodhpur", "ajmer", "bikaner",
    "nashik", "nagpur", "kochi", "cochin", "lucknow", "varanasi", "agra", "manali",
    "shimla", "amritsar", "chandigarh", "barmer", "dwarka", "shirdi",
}
_REGION_TZ = {
    "IN": "Asia/Kolkata",
    "US": "America/New_York",
    "EU": "Europe/Berlin",
    "INTL": "UTC",
}
_REGION_CURRENCY = {"IN": "INR", "US": "USD", "EU": "EUR", "GB": "GBP", "JP": "JPY", "KR": "KRW", "AU": "AUD", "CA": "CAD", "SG": "SGD", "AE": "AED", "CN": "CNY"}
_REGION_CODE = {"IN": "IN", "US": "US", "EU": "DE"}
_EU_ISO = {
    "GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "CZ", "IE", "PL", "SE",
    "DK", "FI", "GR", "HU", "RO", "BG", "HR", "SK", "SI", "LT", "LV", "EE", "LU",
    "MT", "CY", "CH", "NO",
}
_TZ_BY_COUNTRY = {
    "IN": "Asia/Kolkata",
    "US": "America/New_York",
    "GB": "Europe/London",
    "DE": "Europe/Berlin",
    "FR": "Europe/Paris",
    "IT": "Europe/Rome",
    "ES": "Europe/Madrid",
    "NL": "Europe/Amsterdam",
    "JP": "Asia/Tokyo",
    "KR": "Asia/Seoul",
    "CN": "Asia/Shanghai",
    "HK": "Asia/Hong_Kong",
    "TW": "Asia/Taipei",
    "SG": "Asia/Singapore",
    "MY": "Asia/Kuala_Lumpur",
    "TH": "Asia/Bangkok",
    "ID": "Asia/Jakarta",
    "PH": "Asia/Manila",
    "VN": "Asia/Ho_Chi_Minh",
    "AU": "Australia/Sydney",
    "NZ": "Pacific/Auckland",
    "AE": "Asia/Dubai",
    "SA": "Asia/Riyadh",
    "QA": "Asia/Qatar",
    "TR": "Europe/Istanbul",
    "EG": "Africa/Cairo",
    "ZA": "Africa/Johannesburg",
    "BR": "America/Sao_Paulo",
    "MX": "America/Mexico_City",
    "CA": "America/Toronto",
    "AR": "America/Argentina/Buenos_Aires",
}

_RTC_RE = re.compile(
    r"\b(gsrtc|msrtc|ksrtc|rsrtc|upsrtc|hrtc|apsrtc|tsrtc|osrtc|sbstc|wbtc|pepsu|sitilink|smts|best|nmmb|dtc)\b|state road",
    re.I,
)

_STATION_RE = re.compile(
    r"\b(railway\s+station|rail\s+station|train\s+station|bus\s+stand|bus\s+station|st\s+station|junction|\bjn\b|\bstation\b)\b",
    re.I,
)
_STATION_STRIP = re.compile(
    r"\b(railway\s+station|rail\s+station|train\s+station|bus\s+stand|bus\s+station|st\s+station|junction|\bjn\b|\bstation\b)\b",
    re.I,
)
# Places often attaches the access street (ferry dock, parking) not the POI pin.
_STREETISH = re.compile(
    r"\b(street|st\.?|ave\.?|avenue|rd\.?|road|blvd\.?|boulevard|drive|dr\.?|way|quay|"
    r"lane|ln\.?|parkway|pkwy\.?|highway|hwy\.?|crescent|circle|cir\.?)\b",
    re.I,
)


def _poi_query(label: str) -> str:
    """Keep POI name + city/region; drop middle street tokens so island ferries resolve."""
    raw = str(label or "").strip()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if len(parts) < 3:
        return raw
    name = parts[0]
    geo = [p for p in parts[1:] if not _STREETISH.search(p)]
    if len(geo) < 2:
        geo = parts[-2:]
    return ", ".join([name] + geo)


_WATER_HINT = re.compile(
    r"\b(island|isle|islands|ferry|ferries|quay|pier|jetty|harbour|harbor|waterfront|"
    r"harbourfront|harborfront|archipelago|causeway)\b",
    re.I,
)


def _water_transit_hint(*texts: str) -> bool:
    return bool(_WATER_HINT.search(" ".join(str(t or "") for t in texts)))


def _maps_transit_row(
    origin: str,
    destination: str,
    date_ymd: str,
    region: str,
    *,
    ferry: bool,
    km: float | None = None,
) -> dict[str, Any]:
    """When Routes TRANSIT omits boats, still surface a Maps-backed ferry/transit card."""
    o_short = str(origin or "").split(",")[0].strip() or str(origin or "").strip()
    d_short = str(destination or "").split(",")[0].strip() or str(destination or "").strip()
    maps = maps_directions_url(origin, destination, transit=True)
    vehicle = "Ferry" if ferry else "Transit"
    dist = f"{km:.1f} km" if isinstance(km, (int, float)) and km > 0 else ""
    return {
        "id": f"maps-transit-{_slug(o_short)}-{_slug(d_short)}-{date_ymd}",
        "operator": "Public transit",
        "name": "Ferry + connecting transit" if ferry else "All transit modes",
        "vehicle": vehicle,
        "vehicle_type": "FERRY" if ferry else "TRANSIT",
        "headsign": d_short,
        "from_name": origin,
        "to_name": destination,
        "from_stop": o_short,
        "to_stop": d_short,
        "dep": "",
        "arr": "",
        "duration": "Live on Maps",
        "duration_mins": None,
        "stops": 0,
        "via": [],
        "legs": [
            {
                "kind": "transit",
                "agency": "",
                "agency_uri": maps,
                "agency_phone": "",
                "name": vehicle,
                "name_short": "F" if ferry else "T",
                "color": "#0f4c81",
                "text_color": "#ffffff",
                "vehicle": vehicle,
                "vehicle_type": "FERRY" if ferry else "TRANSIT",
                "dep": "",
                "arr": "",
                "timezone": "",
                "from_stop": o_short,
                "to_stop": d_short,
                "stop_count": 0,
                "headsign": d_short,
                "duration": "",
                "duration_mins": None,
                "distance": dist,
                "distance_m": int(km * 1000) if isinstance(km, (int, float)) and km > 0 else 0,
                "instruction": "Live boat and connecting times open in Google Maps. We never invent a ferry timetable.",
            }
        ],
        "transfers": 0,
        "rtc": False,
        "fare": None,
        "fare_label": "Pay on the system",
        "fare_currency": _REGION_CURRENCY.get(region, ""),
        "currency": _REGION_CURRENCY.get(region, ""),
        "name_short": "F" if ferry else "T",
        "color": "#0f4c81",
        "text_color": "#ffffff",
        "agency_uri": maps,
        "agency_phone": "",
        "timezone": "",
        "distance": dist,
        "region": region,
        "date": date_ymd,
        "local": True,
        "walk_to_stop": "",
        "book_url": maps,
        "maps_url": maps,
        "bus_type": vehicle,
        "ac": False,
        "non_ac": False,
        "sleeper": False,
        "seater": False,
        "volvo": False,
        "amenities": [vehicle, "Maps live times"],
    }

# Prefer the actual Sitilink / CATA pin Google knows, not a random ward pin.
_HOOD_GOOGLE = {
    "adajan": "Adajan Gam, Surat, Gujarat, India",
    "adajan gam": "Adajan Gam, Surat, Gujarat, India",
    "chowk bazar": "Chowk Bazar, Surat, Gujarat, India",
    "chowk": "Chowk Bazar, Surat, Gujarat, India",
    "times square": "Times Square, Manhattan, New York, NY, USA",
    "jfk": "John F. Kennedy International Airport, Queens, NY, USA",
    "jfk airport": "John F. Kennedy International Airport, Queens, NY, USA",
    "pollock": "Pollock Dining Commons, Penn State University, University Park, PA, USA",
    "hub": "HUB-Robeson Center, Penn State University, University Park, PA, USA",
    "pattee paterno": "Pattee and Paterno Library, Penn State University, University Park, PA, USA",
    "im building": "Intramural Building, Penn State University, University Park, PA, USA",
    "ist building": "IST Building, Penn State University, University Park, PA, USA",
    "rec hall": "Rec Hall, Penn State University, University Park, PA, USA",
    "east halls": "East Halls, Penn State University, University Park, PA, USA",
    "west halls": "West Halls, Penn State University, University Park, PA, USA",
    "findlay commons": "Findlay Dining Commons, Penn State University, University Park, PA, USA",
    "university park": "Penn State University Park, State College, PA, USA",
    "penn state": "Penn State University Park, State College, PA, USA",
}

_HOOD_LABEL = {
    "pollock": "Pollock Commons",
    "hub": "HUB-Robeson Center",
    "pattee paterno": "Pattee Paterno Library",
    "im building": "IM Building",
    "ist building": "IST Building",
    "rec hall": "Rec Hall",
    "east halls": "East Halls",
    "west halls": "West Halls",
    "findlay commons": "Findlay Commons",
    "adajan": "Adajan",
    "adajan gam": "Adajan Gam",
    "chowk bazar": "Chowk Bazar",
    "chowk": "Chowk Bazar",
    "times square": "Times Square",
    "jfk": "JFK Airport",
    "jfk airport": "JFK Airport",
}

# Typos + short names → canon key in _HOOD_GOOGLE / _NEIGHBORHOOD.
_HOOD_ALIASES = {
    "pollock commons": "pollock",
    "pollock dining": "pollock",
    "pollock dining commons": "pollock",
    "pollock": "pollock",
    "polok commons": "pollock",
    "polok": "pollock",
    "hub robeson": "hub",
    "hub robeson center": "hub",
    "robeson center": "hub",
    "hub": "hub",
    "pattee": "pattee paterno",
    "paterno": "pattee paterno",
    "pattee library": "pattee paterno",
    "paterno library": "pattee paterno",
    "pattee paterno": "pattee paterno",
    "pattee and paterno": "pattee paterno",
    "pattee paterno library": "pattee paterno",
    "petty paterno": "pattee paterno",
    "patty paterno": "pattee paterno",
    "patty pattern": "pattee paterno",
    "petty pattern": "pattee paterno",
    "patty paterno library": "pattee paterno",
    "im building": "im building",
    "iim building": "im building",
    "intramural": "im building",
    "intramural building": "im building",
    "im bldg": "im building",
    "ist building": "ist building",
    "ist": "ist building",
    "rec hall": "rec hall",
    "recreation hall": "rec hall",
    "east halls": "east halls",
    "west halls": "west halls",
    "findlay commons": "findlay commons",
    "findlay": "findlay commons",
    "adajan gam": "adajan",
    "adajan": "adajan",
    "chowk bazar": "chowk bazar",
    "chowk": "chowk bazar",
    "times square": "times square",
    "time square": "times square",
    "jfk": "jfk",
    "jfk airport": "jfk",
    "kennedy airport": "jfk",
}

_CAMPUS_TAIL = re.compile(
    r"\b(state college|university park|penn state|psu|pa usa|united states)\b",
    re.I,
)

# Neighborhood / landmark → parent city (local Sitilink / BEST, not intercity).
_NEIGHBORHOOD = {
    "adajan": "Surat",
    "adajan gam": "Surat",
    "chowk bazar": "Surat",
    "chowk": "Surat",
    "vesu": "Surat",
    "athwa": "Surat",
    "athwa lines": "Surat",
    "piplod": "Surat",
    "city light": "Surat",
    "varachha": "Surat",
    "mota varachha": "Surat",
    "katargam": "Surat",
    "rander": "Surat",
    "pal": "Surat",
    "palanpur": "Surat",
    "palanpur patia": "Surat",
    "althan": "Surat",
    "udhna": "Surat",
    "sachin": "Surat",
    "dumbhal": "Surat",
    "magdalla": "Surat",
    "dumas": "Surat",
    "olpad": "Surat",
    "kamrej": "Surat",
    "parle point": "Surat",
    "ghod dod": "Surat",
    "nanpura": "Surat",
    "lal darwaja": "Surat",
    "majura gate": "Surat",
    "sahara darwaja": "Surat",
    "lp savani": "Surat",
    "yogi chowk": "Surat",
    "sarthana": "Surat",
    "amroli": "Surat",
    "pandesara": "Surat",
    "bhestan": "Surat",
    "kapodra": "Surat",
    "hirabaug": "Surat",
    "andheri": "Mumbai",
    "andheri west": "Mumbai",
    "andheri east": "Mumbai",
    "bandra": "Mumbai",
    "bandra west": "Mumbai",
    "juhu": "Mumbai",
    "worli": "Mumbai",
    "dadar": "Mumbai",
    "colaba": "Mumbai",
    "powai": "Mumbai",
    "goregaon": "Mumbai",
    "malad": "Mumbai",
    "borivali": "Mumbai",
    "chembur": "Mumbai",
    "ghatkopar": "Mumbai",
    "kurla": "Mumbai",
    "sion": "Mumbai",
    "lower parel": "Mumbai",
    "parel": "Mumbai",
    "churchgate": "Mumbai",
    "csmt": "Mumbai",
    "cst": "Mumbai",
    "vashi": "Mumbai",
    "nerul": "Mumbai",
    "thane": "Mumbai",
    "satellite": "Ahmedabad",
    "bopal": "Ahmedabad",
    "vastrapur": "Ahmedabad",
    "navrangpura": "Ahmedabad",
    "maninagar": "Ahmedabad",
    "thaltej": "Ahmedabad",
    "prahlad nagar": "Ahmedabad",
    "motera": "Ahmedabad",
    "sg highway": "Ahmedabad",
    "pollock commons": "State College",
    "pollock dining": "State College",
    "pollock dining commons": "State College",
    "pollock": "State College",
    "times square": "New York",
    "jfk": "New York",
    "jfk airport": "New York",
    "findlay commons": "State College",
    "redifer commons": "State College",
    "waring commons": "State College",
    "warnock commons": "State College",
    "hub robeson": "State College",
    "hub": "State College",
    "robeson center": "State College",
    "east halls": "State College",
    "west halls": "State College",
    "north halls": "State College",
    "south halls": "State College",
    "beaver stadium": "State College",
    "rec hall": "State College",
    "pattee library": "State College",
    "paterno library": "State College",
    "pattee paterno": "State College",
    "im building": "State College",
    "ist building": "State College",
    "college avenue": "State College",
    "beaver avenue": "State College",
    "university park": "State College",
    "penn state": "State College",
    "psu": "State College",
}


def _strip_campus_tail(key: str) -> str:
    cleaned = _CAMPUS_TAIL.sub(" ", key or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def _fuzzy_psu_hood(key: str) -> str:
    """Patty Pattern / Petty Paterno / Polok Commons → campus canon."""
    blob = (key or "").strip()
    if len(blob) < 4:
        return ""
    best, score = "", 0.0
    for alias, canon in _HOOD_ALIASES.items():
        if _NEIGHBORHOOD.get(canon) != "State College" and canon not in (
            "pollock",
            "hub",
            "pattee paterno",
            "im building",
            "ist building",
        ):
            continue
        ratio = difflib.SequenceMatcher(None, blob, alias).ratio()
        kt, at = blob.split(), alias.split()
        if kt and at and len(kt) == len(at):
            token = sum(difflib.SequenceMatcher(None, a, b).ratio() for a, b in zip(kt, at)) / len(kt)
            ratio = max(ratio, token)
        if ratio > score:
            score, best = ratio, canon
    return best if score >= 0.72 else ""


def _resolve_hood_canon(name: str) -> str:
    key = _city_key(name)
    if not key:
        return ""
    stripped = _strip_campus_tail(key)
    for candidate in (key, stripped):
        if not candidate:
            continue
        if candidate in _HOOD_GOOGLE:
            return candidate
        if candidate in _HOOD_ALIASES:
            return _HOOD_ALIASES[candidate]
        if candidate in _NEIGHBORHOOD and candidate in _HOOD_GOOGLE:
            return candidate
        parts = candidate.split()
        for n in range(min(4, len(parts)), 0, -1):
            chunk = " ".join(parts[:n])
            if chunk in _HOOD_ALIASES:
                return _HOOD_ALIASES[chunk]
            if chunk in _HOOD_GOOGLE:
                return chunk
        for n in range(min(4, len(parts)), 0, -1):
            chunk = " ".join(parts[-n:])
            if chunk in _HOOD_ALIASES:
                return _HOOD_ALIASES[chunk]
            if chunk in _HOOD_GOOGLE:
                return chunk
    return _fuzzy_psu_hood(stripped or key)


def normalize_place(name: str) -> str:
    """Friendly campus / hood label after typo fix."""
    raw = (name or "").strip()
    canon = _resolve_hood_canon(raw)
    if not canon:
        return raw
    return _HOOD_LABEL.get(canon) or canon.title()


def google_place_address(place: str) -> str:
    """Google-ready pin for a neighborhood / campus building."""
    label = (place or "").strip()
    if not label:
        return ""
    parent = parent_city(label)
    region = classify_city(parent or label) or ""
    if region not in ("IN", "US", "EU"):
        region = "US" if (parent or "").lower() == "state college" else "IN"
    return _poi_query(_place_google_address(label, region))


def _slug(city: str) -> str:
    raw = re.sub(r"[^a-z0-9]+", "-", (city or "").strip().lower()).strip("-")
    return _SLUG_FIX.get(raw, raw) or "city"


def _city_key(name: str) -> str:
    key = re.sub(r"[^a-z0-9]+", " ", (name or "").lower()).strip()
    key = re.sub(r"\b(jn|junction|bus stand)\b", "", key).strip()
    if key != "state college":
        key = re.sub(r"\bcity\b", "", key).strip()
    key = re.sub(r"\b(pa|ny|nj|ma|md|va|dc|ca|tx|fl|il|wa|ga|on|qc|bc)\b$", "", key).strip()
    if key.endswith(" dc"):
        key = key[:-3].strip()
    return key


def canonical_city(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return ""
    key = _city_key(raw)
    hit = _CITY_CANON.get(key)
    if hit:
        return hit
    return raw.title() if raw.islower() else raw


def parent_city(name: str) -> str:
    """Surat for Adajan / Surat Railway Station; State College for campus buildings."""
    key = _city_key(name)
    if not key:
        return ""
    canon = _resolve_hood_canon(key)
    if canon and _NEIGHBORHOOD.get(canon):
        return _NEIGHBORHOOD[canon]
    if key in _NEIGHBORHOOD:
        return _NEIGHBORHOOD[key]
    stripped = _strip_campus_tail(key)
    if stripped in _NEIGHBORHOOD:
        return _NEIGHBORHOOD[stripped]
    parts = key.split()
    for n in (3, 2, 1):
        if len(parts) >= n:
            hit = _NEIGHBORHOOD.get(" ".join(parts[:n]))
            if hit:
                return hit
    for n in (3, 2):
        if len(parts) >= n:
            hit = _NEIGHBORHOOD.get(" ".join(parts[-n:]))
            if hit:
                return hit
    if "state college" in key or "penn state" in key or "university park" in key:
        return "State College"
    station = _city_key(_STATION_STRIP.sub(" ", name or ""))
    if station in _NEIGHBORHOOD:
        return _NEIGHBORHOOD[station]
    if station in _CITY_CANON:
        return _CITY_CANON[station]
    if station in _IN_KEYS:
        return canonical_city(station)
    if key in _CITY_CANON:
        return _CITY_CANON[key]
    if key in _IN_KEYS:
        return canonical_city(key)
    return ""


def is_local_city_bus(origin: str, destination: str) -> bool:
    """Same-city public transit (Maps-style), not an intercity coach corridor."""
    o = normalize_place(origin) if (origin or "").strip() else ""
    d = normalize_place(destination) if (destination or "").strip() else ""
    if not d:
        return False
    if not o:
        p = parent_city(d)
        return bool(p) and _city_key(d) != _city_key(p)
    po, pd = parent_city(o), parent_city(d)
    if po and pd and po.lower() == pd.lower():
        return _city_key(o) != _city_key(d) or bool(_STATION_RE.search(o) or _STATION_RE.search(d))
    if (po and not pd) or (pd and not po):
        return True
    station = bool(_STATION_RE.search(o) or _STATION_RE.search(d))
    hood_o = bool(po) and _city_key(o) != _city_key(po) and not _STATION_RE.search(o)
    hood_d = bool(pd) and _city_key(d) != _city_key(pd) and not _STATION_RE.search(d)
    if station or hood_o or hood_d:
        return True
    try:
        pin_o = resolve_place_pin(o)
        pin_d = resolve_place_pin(d)
    except ProviderRequestError:
        return False
    km = _haversine_km(pin_o, pin_d)
    if km is None:
        return False
    co = str(pin_o.get("country") or "").upper()
    cd = str(pin_d.get("country") or "").upper()
    if co and cd and co != cd:
        return False
    loc_o = str(pin_o.get("locality") or "").strip().lower()
    loc_d = str(pin_d.get("locality") or "").strip().lower()
    if loc_o and loc_d and loc_o == loc_d and km <= 150:
        return True
    if (co or cd) == "IN":
        return km <= 45
    return km <= 120


def default_local_origin(destination: str) -> str:
    """Campus / city hub when they only named the destination (Pollock Commons)."""
    dest = (destination or "").strip()
    parent = parent_city(dest)
    key = _city_key(parent or dest)
    if key == "state college":
        return "Penn State University Park, State College, PA, USA"
    if parent and classify_city(parent) == "US":
        return _google_address(parent, "US")
    if parent and classify_city(parent) == "IN":
        return f"{parent}, India"
    return ""


def classify_city(name: str) -> str:
    key = _city_key(parent_city(name) or name)
    if key in _US_KEYS:
        return "US"
    if key in _EU_KEYS:
        return "EU"
    if key in _IN_KEYS or key in _CITY_ID or _slug(parent_city(name) or name) in _CITY_ID:
        return "IN"
    return "UNK"


def route_region(origin: str, destination: str) -> str:
    a, b = classify_city(origin), classify_city(destination)
    if a == "IN" and b == "IN":
        return "IN"
    if a == "US" and b == "US":
        return "US"
    if a == "EU" and b == "EU":
        return "EU"
    if "IN" in (a, b) and {"US", "EU"} & {a, b}:
        return "INTL"
    if a == "US" or b == "US":
        return "US"
    if a == "EU" or b == "EU":
        return "EU"
    if a == "IN" or b == "IN":
        return "IN"
    return "INTL"


def _google_address(city: str, region: str) -> str:
    c = canonical_city(city)
    if region == "IN":
        return f"{c}, India"
    if region == "US":
        st = _US_STATE.get(_city_key(c), "")
        return f"{c}, {st}, USA" if st else f"{c}, USA"
    if region == "EU":
        country = _EU_COUNTRY.get(_city_key(c), "")
        return f"{c}, {country}" if country else c
    return c


def _place_google_address(place: str, region: str) -> str:
    """Keep neighborhood + station + campus building words."""
    label = (place or "").strip()
    canon = _resolve_hood_canon(label)
    if canon and canon in _HOOD_GOOGLE:
        return _HOOD_GOOGLE[canon]
    key = _city_key(label)
    if key in _HOOD_GOOGLE:
        return _HOOD_GOOGLE[key]
    parent = parent_city(label) or canonical_city(label)
    if region == "IN":
        if parent and parent.lower() not in label.lower():
            return f"{label}, {parent}, India"
        return f"{label}, India" if label else f"{parent}, India"
    if region == "US":
        st = _US_STATE.get(_city_key(parent), "")
        if parent and parent.lower() not in label.lower():
            return f"{label}, {parent}, {st}, USA".replace(" ,", ",") if st else f"{label}, {parent}, USA"
        if st and st.lower() not in label.lower():
            return f"{label}, {st}, USA"
        return f"{label}, USA" if label else f"{parent}, USA"
    if parent and parent.lower() not in label.lower():
        return f"{label}, {parent}"
    return label or parent


def _haversine_km(a: dict[str, Any], b: dict[str, Any]) -> float | None:
    try:
        lat1, lon1 = float(a["lat"]), float(a["lng"])
        lat2, lon2 = float(b["lat"]), float(b["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _region_from_country(country: str) -> str:
    c = (country or "").upper()
    if c == "IN":
        return "IN"
    if c == "US":
        return "US"
    if c in _EU_ISO:
        return "EU"
    return "INTL"


def resolve_place_pin(place: str, region_hint: str = "") -> dict[str, Any]:
    """Geocode once: lat/lng + country + IANA tz. No India bias for unknown cities."""
    label = (place or "").strip()
    if not label:
        raise ProviderRequestError("bus_search", "Need a place to geocode.")
    hint = (region_hint or "").upper().strip()
    if hint not in ("IN", "US", "EU"):
        hint = ""
    cache_key = f"{label.lower()}|{hint}"
    hit = _PIN_CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _PIN_TTL:
        return hit[1]
    canon = _resolve_hood_canon(label)
    if canon and canon in _HOOD_GOOGLE:
        query = _HOOD_GOOGLE[canon]
    elif _city_key(label) in _HOOD_GOOGLE:
        query = _HOOD_GOOGLE[_city_key(label)]
    elif hint:
        query = _poi_query(_place_google_address(label, hint))
    else:
        query = _poi_query(label)
    geo = google_maps_provider.geocode_place(query)
    tz = ""
    try:
        tz = google_maps_provider.timezone_id(geo["lat"], geo["lng"])
    except ProviderRequestError:
        tz = _TZ_BY_COUNTRY.get(geo.get("country") or "", "") or _REGION_TZ.get(
            _region_from_country(str(geo.get("country") or "")), "UTC"
        )
    pin = {
        **geo,
        "tz": tz or "UTC",
        "query": query,
        "region": _region_from_country(str(geo.get("country") or "")),
    }
    _PIN_CACHE[cache_key] = (time.time(), pin)
    return pin


def _norm_op(operator: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (operator or "").lower().replace("®", "")).strip()


def _operator_op_ids(operator: str) -> str:
    n = _norm_op(operator)
    if not n:
        return ""
    if re.search(r"ankit\s+shrinath", n):
        return "34182"
    if re.search(r"shrinath\s+solitaire", n):
        return "5621"
    if "shrinath" in n and "agency" in n:
        return "8674"
    if "shrinath" in n:
        return "8674,5621,34182"
    if re.search(r"samay\s+travels", n):
        return "31489"
    if re.search(r"shivay\s+travels", n):
        return "22035"
    if re.search(r"raj\s+ratan", n):
        return "4251"
    if re.search(r"patel\s+travels", n):
        return "24533"
    if "shihori" in n:
        return "31898"
    if re.search(r"babaraj", n):
        return "23379"
    if re.search(r"gujarat\s+travels", n):
        return "35026,34965"
    if re.search(r"\bgsrtc\b|gujarat state road", n):
        return "34300"
    if re.search(r"\brsrtc\b", n):
        return "15499"
    return ""


def _bus_type_param(meta: dict[str, Any] | None = None) -> str:
    meta = meta or {}
    blob = f"{meta.get('bus_type') or ''} {'volvo' if meta.get('volvo') else ''} {'ac' if meta.get('ac') else ''} {'sleeper' if meta.get('sleeper') else ''}".lower()
    if "volvo" in blob:
        return "AC"
    if "sleeper" in blob:
        return "SLEEPER"
    if re.search(r"\bac\b", blob):
        return "AC"
    if "seater" in blob:
        return "SEATER"
    return "Any"


def _gsrtc_type_slug(meta: dict[str, Any] | None = None) -> str:
    meta = meta or {}
    blob = str(meta.get("bus_type") or "").lower()
    if meta.get("volvo") or "volvo" in blob:
        return "volvo-ac-sleeper-2-2" if (meta.get("sleeper") or "sleeper" in blob) else "volvo-ac"
    if meta.get("sleeper") or "sleeper" in blob:
        return "sleeper" if meta.get("ac") is False else "ac-sleeper"
    if meta.get("ac") or re.search(r"\bac\b", blob):
        return "ac"
    return "express"


def maps_directions_url(
    origin: str,
    destination: str,
    *,
    from_stop: str = "",
    to_stop: str = "",
    transit: bool = True,
) -> str:
    o = (from_stop or origin or "").strip() or canonical_city(origin)
    d = (to_stop or destination or "").strip() or canonical_city(destination)
    params = {
        "api": "1",
        "origin": o,
        "destination": d,
        "travelmode": "transit" if transit else "driving",
    }
    return f"https://www.google.com/maps/dir/?{urlencode(params)}"


def partner_book_url(
    origin: str,
    destination: str,
    date_ymd: str,
    dep: str = "",
    operator: str = "",
    meta: dict[str, Any] | None = None,
    region: str | None = None,
    local: bool = False,
    from_stop: str = "",
    to_stop: str = "",
) -> str:
    """Coach handoff. Do not name the partner in UI."""
    if local or is_local_city_bus(origin, destination):
        return maps_directions_url(origin, destination, from_stop=from_stop, to_stop=to_stop)
    region = region or route_region(origin, destination)
    o_name = canonical_city(origin)
    d_name = canonical_city(destination)
    ymd = (date_ymd or "")[:10]
    if region == "US":
        qs = urlencode({"departDate": ymd} if ymd else {})
        base = f"https://www.wanderu.com/en-us/depart/{quote(o_name)}/{quote(d_name)}"
        return f"{base}?{qs}" if qs else base
    if region == "EU":
        try:
            ride = datetime.strptime(ymd, "%Y-%m-%d").strftime("%d.%m.%Y")
        except ValueError:
            ride = ""
        params = {
            "departureCity": o_name,
            "arrivalCity": d_name,
            "adult": "1",
        }
        if ride:
            params["rideDate"] = ride
        return f"https://shop.flixbus.com/search?{urlencode(params)}"
    if region != "IN":
        params = {"api": "1", "origin": o_name, "destination": d_name, "travelmode": "transit"}
        return f"https://www.google.com/maps/dir/?{urlencode(params)}"

    o = _slug(origin)
    d = _slug(destination)
    try:
        dt = datetime.strptime(ymd, "%Y-%m-%d")
        onward = dt.strftime("%d-%b-%Y")
    except ValueError:
        onward = ""
    meta = meta or {}
    params = {
        "onward": onward,
        "doj": onward,
        "fromCityName": o_name,
        "toCityName": d_name,
        "srcCountry": "IND",
        "destCountry": "IND",
        "busType": _bus_type_param(meta),
        "opId": str((meta or {}).get("operator_id") or "") or _operator_op_ids(operator) or "0",
    }
    fid = _CITY_ID.get(o) or _CITY_ID.get((origin or "").strip().lower())
    tid = _CITY_ID.get(d) or _CITY_ID.get((destination or "").strip().lower())
    if fid:
        params["fromCityId"] = fid
    if tid:
        params["toCityId"] = tid
    qs = urlencode({k: v for k, v in params.items() if v})
    if re.search(r"gsrtc|gujarat state road", operator or "", re.I) and o and d:
        kind = _gsrtc_type_slug(meta)
        return f"https://www.redbus.in/online-booking/gsrtc/{kind}-bus-{o}-to-{d}?{qs}"
    return f"https://www.redbus.in/bus-tickets/{o}-to-{d}?{qs}"


def _hhmm(text: str) -> str:
    m = re.search(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", str(text or ""), re.I)
    if not m:
        return ""
    h, mi = int(m.group(1)), int(m.group(2))
    ap = (m.group(3) or "").upper()
    if ap == "PM" and h < 12:
        h += 12
    if ap == "AM" and h == 12:
        h = 0
    return f"{h:02d}:{mi:02d}"


def _mins(hhmm: str) -> int | None:
    m = re.fullmatch(r"(\d{2}):(\d{2})", hhmm or "")
    if not m:
        return None
    return int(m.group(1)) * 60 + int(m.group(2))


def _infer_type(blob: str) -> dict[str, Any]:
    t = (blob or "").lower()
    ac = bool(re.search(r"\bac\b|a/c|air.?cond", t)) and not re.search(r"non[\s-]?ac|ordinary", t)
    non_ac = bool(re.search(r"non[\s-]?ac|ordinary|express\b", t)) and not ac
    sleeper = bool(re.search(r"sleeper|bunk", t))
    seater = bool(re.search(r"seater|chair|semi.?sleeper", t))
    volvo = bool(re.search(r"volvo|multi.?axle|b11r|9400", t))
    if volvo:
        kind = "Volvo AC" if ac or not non_ac else "Volvo"
    elif sleeper and ac:
        kind = "AC Sleeper"
    elif sleeper:
        kind = "Sleeper"
    elif ac:
        kind = "AC Seater" if seater else "AC"
    elif seater:
        kind = "Seater"
    elif non_ac:
        kind = "Non-AC"
    else:
        kind = "Bus"
    amenities = []
    if ac:
        amenities.append("AC")
    if sleeper:
        amenities.append("Sleeper")
    elif seater or kind == "Bus":
        amenities.append("Seater")
    if volvo:
        amenities.append("Volvo")
    return {
        "bus_type": kind,
        "ac": ac,
        "non_ac": non_ac,
        "sleeper": sleeper,
        "seater": seater or not sleeper,
        "volvo": volvo,
        "amenities": amenities,
    }


_FARE_CC = (
    (r"CA\$|C\$|\bCAD\b", "CAD"),
    (r"A\$|\bAUD\b", "AUD"),
    (r"HK\$|\bHKD\b", "HKD"),
    (r"S\$|\bSGD\b", "SGD"),
    (r"NZ\$|\bNZD\b", "NZD"),
    (r"£|\bGBP\b", "GBP"),
    (r"€|\bEUR\b", "EUR"),
    (r"¥|\bJPY\b", "JPY"),
    (r"₹|\bINR\b", "INR"),
    (r"د\.?إ|\bAED\b", "AED"),
    (r"\bUSD\b|US\$", "USD"),
    (r"\$", "USD"),
)


def _fare_currency_from_label(label: str) -> str:
    t = str(label or "")
    for pat, code in _FARE_CC:
        if re.search(pat, t, re.I):
            return code
    return ""


_TAP_TYPES = {
    "BUS",
    "INTERCITY_BUS",
    "TROLLEYBUS",
    "SUBWAY",
    "METRO_RAIL",
    "TRAM",
    "LIGHT_RAIL",
    "FERRY",
    "BOAT",
    "CABLE_CAR",
    "GONDOLA_LIFT",
    "FUNICULAR",
    "MONORAIL",
    "SHARE_TAXI",
}
_TICKET_TYPES = {
    "HEAVY_RAIL",
    "COMMUTER_TRAIN",
    "HIGH_SPEED_TRAIN",
    "LONG_DISTANCE_TRAIN",
    "RAIL",
}


def _fare_amount(route: dict[str, Any]) -> tuple[float | None, str, str]:
    loc_node = ((route.get("localizedValues") or {}).get("transitFare") or {})
    loc = str((loc_node.get("text") if isinstance(loc_node, dict) else "") or "").strip()
    fare = (route.get("travelAdvisory") or {}).get("transitFare") or {}
    amount = None
    currency = ""
    if isinstance(fare, dict) and (fare.get("currencyCode") or fare.get("units") or fare.get("nanos")):
        currency = str(fare.get("currencyCode") or "").upper()
        try:
            units = float(fare.get("units") or 0)
            nanos = int(fare.get("nanos") or 0)
            val = units + nanos / 1_000_000_000
            if val > 0:
                amount = round(val, 2)
        except (TypeError, ValueError):
            amount = None
    if amount is None and loc:
        m = re.search(r"(\d[\d,]*(?:\.\d+)?)", loc.replace(",", ""))
        if m:
            try:
                amount = round(float(m.group(1).replace(",", "")), 2)
            except ValueError:
                amount = None
    if not currency:
        currency = _fare_currency_from_label(loc)
    return amount, currency, loc


def _fare_hint(legs: list[dict[str, Any]], local: bool) -> str:
    rides = [b for b in legs if isinstance(b, dict) and b.get("kind") != "walk"]
    types = {str(b.get("vehicle_type") or "").upper() for b in rides}
    blob = " ".join(
        f"{b.get('vehicle_type') or ''} {b.get('vehicle') or ''} {b.get('agency') or ''} {b.get('name') or ''}"
        for b in rides
    ).lower()
    tap = bool(types & _TAP_TYPES) or any(t.endswith("BUS") or "SUBWAY" in t for t in types)
    ticket = bool(types & _TICKET_TYPES) or bool(
        re.search(r"\b(lirr|long island|amtrak|railroad|commuter|irctc|rail)\b", blob)
    )
    if tap and ticket:
        return "Fare not listed · tap + ticket"
    if ticket:
        return "Ticket fare not listed"
    if tap or local:
        return "Pay on board / tap"
    return "Fare not listed"


def _duration_text(route: dict[str, Any], step: dict[str, Any]) -> str:
    loc = ((route.get("localizedValues") or {}).get("duration") or {}).get("text") or ""
    if loc:
        return str(loc)
    loc = ((step.get("localizedValues") or {}).get("duration") or {}).get("text") or ""
    return str(loc)


def _duration_mins(dep: str, arr: str, text: str = "") -> int | None:
    dm, am = _mins(dep), _mins(arr)
    if dm is not None and am is not None:
        delta = am - dm
        if delta < 0:
            delta += 24 * 60
        return delta
    d = re.search(r"(\d+)\s*d", text or "", re.I)
    h = re.search(r"(\d+)\s*h", text or "", re.I)
    m = re.search(r"(\d+)\s*m", text or "", re.I)
    if not d and not h and not m:
        return None
    return (
        (int(d.group(1)) if d else 0) * 1440
        + (int(h.group(1)) if h else 0) * 60
        + (int(m.group(1)) if m else 0)
    )


_VEHICLE_LABEL = {
    "BUS": "Bus",
    "INTERCITY_BUS": "Coach",
    "TROLLEYBUS": "Trolleybus",
    "SUBWAY": "Metro",
    "METRO_RAIL": "Metro",
    "TRAM": "Tram",
    "LIGHT_RAIL": "Light rail",
    "HEAVY_RAIL": "Rail",
    "COMMUTER_TRAIN": "Commuter rail",
    "HIGH_SPEED_TRAIN": "High-speed rail",
    "LONG_DISTANCE_TRAIN": "Train",
    "RAIL": "Rail",
    "FERRY": "Ferry",
    "BOAT": "Ferry",
    "CABLE_CAR": "Cable car",
    "GONDOLA_LIFT": "Gondola",
    "FUNICULAR": "Funicular",
    "MONORAIL": "Monorail",
    "SHARE_TAXI": "Share taxi",
}


def _text_duration(step: dict[str, Any]) -> str:
    loc = step.get("localizedValues") if isinstance(step.get("localizedValues"), dict) else {}
    return str((loc.get("staticDuration") or loc.get("duration") or {}).get("text") or "").strip()


def _text_distance(step: dict[str, Any]) -> str:
    loc = step.get("localizedValues") if isinstance(step.get("localizedValues"), dict) else {}
    return str((loc.get("distance") or {}).get("text") or "").strip()


def _distance_m(text: str) -> int:
    raw = str(text or "")
    km = re.search(r"([\d.]+)\s*km", raw, re.I)
    if km:
        try:
            return int(round(float(km.group(1)) * 1000))
        except ValueError:
            return 0
    metres = re.search(r"([\d.]+)\s*m\b", raw, re.I)
    if metres:
        try:
            return int(round(float(metres.group(1))))
        except ValueError:
            return 0
    return 0


def _fmt_mins(mins: int) -> str:
    mins = max(0, int(mins or 0))
    if mins >= 60:
        h, m = divmod(mins, 60)
        return f"{h} hour {m} mins" if m else f"{h} hour"
    return f"{mins} min" if mins == 1 else f"{mins} mins"


def _fmt_m(metres: int) -> str:
    metres = max(0, int(metres or 0))
    if metres >= 1000:
        km = metres / 1000.0
        return f"{km:.1f} km" if km < 10 else f"{int(round(km))} km"
    return f"{metres} m"


def _duration_seconds(raw: str) -> int:
    m = re.fullmatch(r"(\d+(?:\.\d+)?)s", str(raw or "").strip())
    if not m:
        return 0
    try:
        return max(0, int(round(float(m.group(1)))))
    except ValueError:
        return 0


def _headway_text(raw: str) -> str:
    secs = _duration_seconds(raw)
    if secs < 30:
        return ""
    mins = max(1, int(round(secs / 60.0)))
    if mins >= 60:
        h, m = divmod(mins, 60)
        if m:
            return f"Every {h}h {m} min"
        return "Every 1 hour" if h == 1 else f"Every {h} hours"
    return f"Every {mins} min"


def _latlng(loc: Any) -> list[float] | None:
    if not isinstance(loc, dict):
        return None
    ll = loc.get("latLng") if isinstance(loc.get("latLng"), dict) else loc
    if not isinstance(ll, dict):
        return None
    try:
        lat = float(ll.get("latitude"))
        lng = float(ll.get("longitude"))
    except (TypeError, ValueError):
        return None
    if abs(lat) > 90 or abs(lng) > 180:
        return None
    return [round(lat, 6), round(lng, 6)]


def _hhmm_iso(iso: str, tz_name: str = "") -> str:
    raw = str(iso or "").strip()
    if not raw:
        return ""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return _hhmm(raw)
    if tz_name:
        try:
            dt = dt.astimezone(ZoneInfo(tz_name))
        except Exception:
            dt = dt.astimezone()
    else:
        dt = dt.astimezone()
    return f"{dt.hour:02d}:{dt.minute:02d}"


def _ymd_iso(iso: str, tz_name: str = "") -> str:
    raw = str(iso or "").strip()
    if not raw:
        return ""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if tz_name:
        try:
            dt = dt.astimezone(ZoneInfo(tz_name))
        except Exception:
            dt = dt.astimezone()
    else:
        dt = dt.astimezone()
    return dt.strftime("%Y-%m-%d")


def _localized_text(blob: Any, *keys: str) -> str:
    loc = blob if isinstance(blob, dict) else {}
    for key in keys:
        node = loc.get(key)
        if isinstance(node, dict) and node.get("text"):
            return str(node.get("text") or "").strip()
        if isinstance(node, str) and node.strip():
            return node.strip()
    return ""


def _vehicle_name(vehicle: dict[str, Any]) -> str:
    name = vehicle.get("name")
    if isinstance(name, dict):
        return str(name.get("text") or "").strip()
    return str(name or "").strip()


def _bus_step(step: dict[str, Any]) -> dict[str, Any] | None:
    """Any Google Maps transit leg — bus, metro, tram, rail, ferry."""
    td = step.get("transitDetails") if isinstance(step.get("transitDetails"), dict) else None
    if not td:
        return None
    line = td.get("transitLine") if isinstance(td.get("transitLine"), dict) else {}
    vehicle = line.get("vehicle") if isinstance(line.get("vehicle"), dict) else {}
    vtype = str(vehicle.get("type") or "").upper().replace(" ", "_")
    vname = _vehicle_name(vehicle)
    kind = _VEHICLE_LABEL.get(vtype) or (vname or vtype.replace("_", " ").title() or "Transit")
    agencies: list[dict[str, str]] = []
    for ag in line.get("agencies") or []:
        if not isinstance(ag, dict):
            continue
        name_ag = str(ag.get("name") or "").strip()
        if not name_ag:
            continue
        agencies.append(
            {
                "name": name_ag,
                "uri": str(ag.get("uri") or "").strip(),
                "phone": str(ag.get("phoneNumber") or "").strip(),
            }
        )
    agency = agencies[0]["name"] if agencies else ""
    agency_uri = next((a["uri"] for a in agencies if a.get("uri")), "")
    agency_phone = next((a["phone"] for a in agencies if a.get("phone")), "")
    name = str(line.get("name") or "").strip()
    name_short = str(line.get("nameShort") or "").strip()
    locv = td.get("localizedValues") if isinstance(td.get("localizedValues"), dict) else {}
    dep_loc = _localized_text(locv.get("departureTime") if isinstance(locv.get("departureTime"), dict) else {}, "time") or str(
        ((locv.get("departureTime") or {}).get("time") or {}).get("text") or ""
    )
    arr_loc = _localized_text(locv.get("arrivalTime") if isinstance(locv.get("arrivalTime"), dict) else {}, "time") or str(
        ((locv.get("arrivalTime") or {}).get("time") or {}).get("text") or ""
    )
    tz = str(((locv.get("departureTime") or {}).get("timeZone") or "") or "").strip()
    arr_tz = str(((locv.get("arrivalTime") or {}).get("timeZone") or "") or "").strip() or tz
    stops = td.get("stopDetails") if isinstance(td.get("stopDetails"), dict) else {}
    dep_stop_obj = stops.get("departureStop") if isinstance(stops.get("departureStop"), dict) else {}
    arr_stop_obj = stops.get("arrivalStop") if isinstance(stops.get("arrivalStop"), dict) else {}
    dep_iso = str(stops.get("departureTime") or "").strip()
    arr_iso = str(stops.get("arrivalTime") or "").strip()
    dep = _hhmm(dep_loc) or _hhmm_iso(dep_iso, tz)
    arr = _hhmm(arr_loc) or _hhmm_iso(arr_iso, arr_tz)
    dep_stop = str(dep_stop_obj.get("name") or "").strip()
    arr_stop = str(arr_stop_obj.get("name") or "").strip()
    try:
        stop_count = int(td.get("stopCount") or 0)
    except (TypeError, ValueError):
        stop_count = 0
    duration = _text_duration(step)
    if not duration:
        dm = _duration_mins(dep, arr)
        duration = _fmt_mins(dm) if dm else ""
    distance = _text_distance(step)
    inst = str(((step.get("navigationInstruction") or {}).get("instructions") or "")).strip()
    maneuver = str(((step.get("navigationInstruction") or {}).get("maneuver") or "")).strip()
    trip_short = str(td.get("tripShortText") or "").strip()
    headway = _headway_text(str(td.get("headway") or ""))
    icon_uri = str(
        line.get("iconUri") or vehicle.get("localIconUri") or vehicle.get("iconUri") or ""
    ).strip()
    return {
        "kind": "transit",
        "agency": agency,
        "agency_uri": agency_uri or str(line.get("uri") or "").strip(),
        "agency_phone": agency_phone,
        "agencies": agencies,
        "name": name or name_short or kind,
        "name_short": name_short,
        "color": str(line.get("color") or "").strip(),
        "text_color": str(line.get("textColor") or "").strip(),
        "vehicle": kind,
        "vehicle_type": vtype or "TRANSIT",
        "vehicle_name": vname,
        "dep": dep,
        "arr": arr,
        "dep_iso": dep_iso,
        "arr_iso": arr_iso,
        "dep_date": _ymd_iso(dep_iso, tz),
        "arr_date": _ymd_iso(arr_iso, arr_tz),
        "timezone": tz,
        "arrival_timezone": arr_tz,
        "from_stop": dep_stop,
        "to_stop": arr_stop,
        "from_latlng": _latlng(dep_stop_obj.get("location")),
        "to_latlng": _latlng(arr_stop_obj.get("location")),
        "stop_count": stop_count,
        "headsign": str(td.get("headsign") or "").strip(),
        "headway": headway,
        "trip_short": trip_short,
        "line_uri": str(line.get("uri") or "").strip(),
        "icon_uri": icon_uri,
        "duration": duration,
        "duration_mins": _duration_mins(dep, arr, duration),
        "distance": distance,
        "distance_m": _distance_m(distance),
        "instruction": inst.split("\n")[0].strip() if inst else "",
        "maneuver": maneuver,
    }


def _walk_step(step: dict[str, Any]) -> dict[str, Any] | None:
    mode = str(step.get("travelMode") or "").upper()
    if mode not in {"WALK", "WALKING"}:
        return None
    inst = str(((step.get("navigationInstruction") or {}).get("instructions") or "")).strip()
    maneuver = str(((step.get("navigationInstruction") or {}).get("maneuver") or "")).strip()
    duration = _text_duration(step)
    distance = _text_distance(step)
    name = inst.split("\n")[0].strip() if inst else "Walk"
    start = _latlng((step.get("startLocation") or {}).get("latLng") or step.get("startLocation"))
    end = _latlng((step.get("endLocation") or {}).get("latLng") or step.get("endLocation"))
    return {
        "kind": "walk",
        "agency": "",
        "agency_uri": "",
        "agency_phone": "",
        "agencies": [],
        "name": name,
        "name_short": "",
        "color": "",
        "text_color": "",
        "vehicle": "Walk",
        "vehicle_type": "WALK",
        "vehicle_name": "",
        "dep": "",
        "arr": "",
        "dep_iso": "",
        "arr_iso": "",
        "dep_date": "",
        "arr_date": "",
        "timezone": "",
        "arrival_timezone": "",
        "from_stop": "",
        "to_stop": "",
        "from_latlng": start,
        "to_latlng": end,
        "stop_count": 0,
        "headsign": "",
        "headway": "",
        "trip_short": "",
        "line_uri": "",
        "icon_uri": "",
        "duration": duration,
        "duration_mins": _duration_mins("", "", duration) or 0,
        "distance": distance,
        "distance_m": _distance_m(distance),
        "instruction": name,
        "maneuver": maneuver,
    }


def _merge_walk(prev: dict[str, Any], walk: dict[str, Any]) -> dict[str, Any]:
    mins = int(prev.get("duration_mins") or 0) + int(walk.get("duration_mins") or 0)
    metres = int(prev.get("distance_m") or 0) + int(walk.get("distance_m") or 0)
    prev["duration_mins"] = mins
    prev["distance_m"] = metres
    prev["duration"] = _fmt_mins(mins) if mins else (prev.get("duration") or walk.get("duration") or "")
    prev["distance"] = _fmt_m(metres) if metres else (prev.get("distance") or walk.get("distance") or "")
    inst = str(walk.get("instruction") or walk.get("name") or "").strip()
    if inst and re.search(r"\b(to|towards|entrance|exit|destination|station|stop)\b", inst, re.I):
        prev["name"] = inst
        prev["instruction"] = inst
        prev["to_stop"] = inst
    return prev


def _route_legs(route: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for leg in route.get("legs") or []:
        if not isinstance(leg, dict):
            continue
        for step in leg.get("steps") or []:
            if not isinstance(step, dict):
                continue
            transit = _bus_step(step)
            if transit:
                out.append(transit)
                continue
            walk = _walk_step(step)
            if walk:
                if out and out[-1].get("kind") == "walk":
                    _merge_walk(out[-1], walk)
                    continue
                out.append(walk)
    return out


def _walk_to_stop(route: dict[str, Any]) -> str:
    mins = 0
    last_walk = ""
    for leg in route.get("legs") or []:
        if not isinstance(leg, dict):
            continue
        for step in leg.get("steps") or []:
            if not isinstance(step, dict):
                continue
            if step.get("transitDetails"):
                if last_walk and mins:
                    return f"Walk {_fmt_mins(mins)} · {last_walk}"
                return last_walk
            mode = str(step.get("travelMode") or "").upper()
            if mode in {"WALK", "WALKING"}:
                inst = str(
                    ((step.get("navigationInstruction") or {}).get("instructions") or "")
                ).strip()
                if inst:
                    last_walk = inst.split("\n")[0].strip()
                mins += _duration_mins("", "", _text_duration(step)) or 0
    if last_walk and mins:
        return f"Walk {_fmt_mins(mins)} · {last_walk}"
    return last_walk


def _walk_off_stop(route: dict[str, Any]) -> str:
    after = False
    mins = 0
    last_walk = ""
    for leg in route.get("legs") or []:
        if not isinstance(leg, dict):
            continue
        for step in leg.get("steps") or []:
            if not isinstance(step, dict):
                continue
            if step.get("transitDetails"):
                after = True
                mins = 0
                last_walk = ""
                continue
            if not after:
                continue
            mode = str(step.get("travelMode") or "").upper()
            if mode not in {"WALK", "WALKING"}:
                continue
            inst = str(((step.get("navigationInstruction") or {}).get("instructions") or "")).strip()
            if inst:
                last_walk = inst.split("\n")[0].strip()
            mins += _duration_mins("", "", _text_duration(step)) or 0
    if last_walk and mins:
        return f"Walk {_fmt_mins(mins)} · {last_walk}"
    return last_walk


def _modes_from_legs(legs: list[dict[str, Any]]) -> list[str]:
    out: list[str] = []
    for leg in legs:
        if not isinstance(leg, dict):
            continue
        if leg.get("kind") == "walk":
            label = "Walk"
        else:
            label = str(leg.get("name_short") or leg.get("vehicle") or leg.get("name") or "Transit").strip()
        if label and (not out or out[-1] != label):
            out.append(label)
    return out


def _collect_agencies(legs: list[dict[str, Any]]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    for leg in legs:
        if not isinstance(leg, dict) or leg.get("kind") == "walk":
            continue
        rows = list(leg.get("agencies") or [])
        if not rows and (leg.get("agency") or leg.get("agency_uri") or leg.get("agency_phone")):
            rows = [
                {
                    "name": str(leg.get("agency") or "").strip(),
                    "uri": str(leg.get("agency_uri") or "").strip(),
                    "phone": str(leg.get("agency_phone") or "").strip(),
                }
            ]
        for ag in rows:
            if not isinstance(ag, dict):
                continue
            key = (
                str(ag.get("name") or "").strip(),
                str(ag.get("uri") or "").strip(),
                str(ag.get("phone") or "").strip(),
            )
            if not any(key) or key in seen:
                continue
            seen.add(key)
            out.append({"name": key[0], "uri": key[1], "phone": key[2]})
    return out


def _route_warnings(route: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for w in route.get("warnings") or []:
        text = str(w or "").strip()
        if text and text not in out:
            out.append(text)
    return out


def _route_distance(route: dict[str, Any]) -> tuple[str, int]:
    loc = _localized_text(route.get("localizedValues") or {}, "distance")
    try:
        metres = int(route.get("distanceMeters") or 0)
    except (TypeError, ValueError):
        metres = 0
    if not loc and metres:
        loc = _fmt_m(metres)
    return loc, metres


def _parse_route(
    route: dict[str, Any],
    origin: str,
    destination: str,
    date_ymd: str,
    region: str = "IN",
    local: bool = False,
) -> dict[str, Any] | None:
    bus_legs: list[dict[str, Any]] = []
    for leg in route.get("legs") or []:
        if not isinstance(leg, dict):
            continue
        for step in leg.get("steps") or []:
            if not isinstance(step, dict):
                continue
            parsed = _bus_step(step)
            if parsed:
                bus_legs.append(parsed)
    if not bus_legs:
        if not local:
            return None
        duration = _duration_text(route, {})
        if not duration:
            return None
        walk_mins = _duration_mins("", "", duration)
        if walk_mins is not None and walk_mins > 180:
            return None
        if re.search(r"\bday", duration, re.I):
            return None
        maps = maps_directions_url(origin, destination)
        return {
            "id": f"walk-{_slug(origin)}-{_slug(destination)}-{date_ymd}",
            "operator": "Walk",
            "name": "Walk",
            "vehicle": "Walk",
            "vehicle_type": "WALK",
            "from_name": origin,
            "to_name": destination,
            "from_stop": origin,
            "to_stop": destination,
            "dep": "",
            "arr": "",
            "duration": duration,
            "duration_mins": _duration_mins("", "", duration),
            "stops": 0,
            "via": [],
            "legs": _route_legs(route) or [{"kind": "walk", "vehicle": "Walk", "name": "Walk", "duration": duration}],
            "headsign": "",
            "transfers": 0,
            "rtc": False,
            "fare": None,
            "fare_label": "",
            "fare_currency": "",
            "currency": _REGION_CURRENCY.get(region, ""),
            "region": region,
            "date": date_ymd,
            "local": True,
            "walk_to_stop": _walk_to_stop(route),
            "book_url": maps,
            "maps_url": maps,
            "bus_type": "Walk",
            "ac": False,
            "non_ac": False,
            "sleeper": False,
            "seater": False,
            "volvo": False,
            "amenities": ["Walk"],
        }
    primary = dict(bus_legs[0])
    if len(bus_legs) > 1:
        via = [b.get("to_stop") or b.get("name") for b in bus_legs[:-1] if b.get("to_stop") or b.get("name")]
        primary["via"] = [v for v in via if v]
        primary["arr"] = bus_legs[-1].get("arr") or primary.get("arr")
        primary["to_stop"] = bus_legs[-1].get("to_stop") or primary.get("to_stop")
    blob = " ".join(
        str(primary.get(k) or "")
        for k in ("agency", "name", "vehicle", "headsign")
    )
    vtype = str(primary.get("vehicle_type") or "").upper()
    coach = vtype in {"", "BUS", "INTERCITY_BUS", "TROLLEYBUS"} and not local
    meta = _infer_type(blob) if coach else {
        "bus_type": primary.get("vehicle") or "Transit",
        "ac": False,
        "non_ac": False,
        "sleeper": False,
        "seater": False,
        "volvo": False,
        "amenities": [x for x in (primary.get("vehicle"),) if x],
    }
    fare, fare_cc, fare_label = _fare_amount(route)
    if not fare and not fare_label:
        fare_label = _fare_hint(bus_legs, local)
    operator = primary.get("agency") or primary.get("name") or primary.get("vehicle") or "Bus"
    dep = primary.get("dep") or ""
    duration = _duration_text(route, {})
    from_stop = primary.get("from_stop") or origin
    to_stop = primary.get("to_stop") or destination
    legs = _route_legs(route)
    agencies = _collect_agencies(bus_legs or legs)
    warnings = _route_warnings(route)
    distance, distance_m = _route_distance(route)
    if not distance:
        distance = next((str(b.get("distance") or "") for b in bus_legs if b.get("distance")), "")
        distance_m = next((int(b.get("distance_m") or 0) for b in bus_legs if b.get("distance_m")), 0)
    trip_short = next((str(b.get("trip_short") or "") for b in bus_legs if b.get("trip_short")), "") or str(
        primary.get("trip_short") or ""
    )
    headway = str(primary.get("headway") or "") or next(
        (str(b.get("headway") or "") for b in bus_legs if b.get("headway")), ""
    )
    arr = primary.get("arr") or ""
    overnight = bool(dep and arr and (_mins(arr) or 0) < (_mins(dep) or 0))
    maps = maps_directions_url(origin, destination, from_stop=from_stop, to_stop=to_stop, transit=True)
    book = partner_book_url(
        origin,
        destination,
        date_ymd,
        dep,
        operator,
        meta,
        region=region,
        local=local,
        from_stop=from_stop,
        to_stop=to_stop,
    )
    row = {
        "id": f"{_slug(operator)}-{dep.replace(':', '')}-{_slug(from_stop)}",
        "operator": operator,
        "name": primary.get("name") or operator,
        "vehicle": primary.get("vehicle") or "Transit",
        "vehicle_type": vtype or "TRANSIT",
        "headsign": primary.get("headsign") or "",
        "from_name": origin,
        "to_name": destination,
        "from_stop": from_stop,
        "to_stop": to_stop,
        "dep": dep,
        "arr": arr,
        "dep_iso": primary.get("dep_iso") or "",
        "arr_iso": bus_legs[-1].get("arr_iso") or primary.get("arr_iso") or "",
        "dep_date": primary.get("dep_date") or date_ymd,
        "arr_date": bus_legs[-1].get("arr_date") or primary.get("arr_date") or "",
        "overnight": overnight,
        "duration": duration,
        "duration_mins": _duration_mins(dep, arr, duration),
        "stops": sum(int(b.get("stop_count") or 0) for b in bus_legs) or primary.get("stop_count") or 0,
        "via": primary.get("via") or [],
        "legs": legs,
        "modes": _modes_from_legs(legs),
        "transfers": max(0, len(bus_legs) - 1),
        "rtc": bool(_RTC_RE.search(operator)),
        "fare": fare,
        "fare_label": fare_label,
        "fare_currency": fare_cc or _REGION_CURRENCY.get(region, ""),
        "currency": fare_cc or _REGION_CURRENCY.get(region, ""),
        "name_short": primary.get("name_short") or "",
        "color": primary.get("color") or "",
        "text_color": primary.get("text_color") or "",
        "agency_uri": primary.get("agency_uri") or (agencies[0]["uri"] if agencies else ""),
        "agency_phone": primary.get("agency_phone") or (agencies[0]["phone"] if agencies else ""),
        "agencies": agencies,
        "timezone": primary.get("timezone") or "",
        "arrival_timezone": bus_legs[-1].get("arrival_timezone") or primary.get("arrival_timezone") or "",
        "distance": distance,
        "distance_m": distance_m,
        "headway": headway,
        "trip_short": trip_short,
        "line_uri": primary.get("line_uri") or "",
        "icon_uri": primary.get("icon_uri") or "",
        "warnings": warnings,
        "description": str(route.get("description") or "").strip(),
        "region": region,
        "date": date_ymd,
        "local": bool(local),
        "walk_to_stop": _walk_to_stop(route),
        "walk_off_stop": _walk_off_stop(route),
        "book_url": book,
        "maps_url": maps,
        **meta,
    }
    return row


def _one_departure(
    origin: str,
    destination: str,
    travel_day: datetime,
    hour: int,
    region: str,
    tz_name: str,
    *,
    origin_addr: str = "",
    dest_addr: str = "",
    origin_latlng: tuple[float, float] | None = None,
    dest_latlng: tuple[float, float] | None = None,
    region_code: str | None = None,
    transit_routing: str | None = None,
    local: bool = False,
    minute: int = 0,
) -> list[dict[str, Any]]:
    tz = ZoneInfo(tz_name)
    naive = travel_day.replace(tzinfo=None) if travel_day.tzinfo else travel_day
    leave = naive.replace(hour=hour, minute=minute, second=0, microsecond=0, tzinfo=tz)
    rfc = leave.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        body = google_maps_provider.compute_route(
            origin_addr or _google_address(origin, region),
            dest_addr or _google_address(destination, region),
            "TRANSIT",
            departure_time=rfc,
            # Do not restrict modes — FERRY/boat is not in Google's filter enum;
            # locking to BUS/RAIL drops Toronto Islands, Staten Island, etc.
            allowed_transit_modes=None,
            alternatives=True,
            transit_routing=transit_routing,
            region_code=(region_code or _REGION_CODE.get(region) or None),
            origin_latlng=origin_latlng,
            dest_latlng=dest_latlng,
        )
    except ProviderRequestError as exc:
        logger.debug("bus route %s→%s @%s failed: %s", origin, destination, hour, exc)
        return []
    date_ymd = naive.strftime("%Y-%m-%d")
    out: list[dict[str, Any]] = []
    for route in body.get("routes") or []:
        if not isinstance(route, dict):
            continue
        row = _parse_route(route, origin, destination, date_ymd, region=region, local=local)
        if row and (row.get("dep") or row.get("vehicle_type") == "WALK" or row.get("duration")):
            out.append(row)
    return out


def search_local_city_buses(
    origin: str,
    destination: str,
    travel_day: datetime,
    window: str = "",
) -> list[dict[str, Any]]:
    """Same-city public transit (Google Maps: bus/metro/tram/rail). Keep place labels."""
    o_label = (origin or "").strip() or default_local_origin(destination)
    d_label = (destination or "").strip()
    if not o_label or not d_label:
        raise ProviderRequestError("bus_search", "Need origin and destination for city bus.")
    hint = route_region(o_label, d_label)
    if hint not in ("IN", "US", "EU"):
        hint = ""
    pin_o = resolve_place_pin(o_label, hint)
    pin_d = resolve_place_pin(d_label, hint)
    country = str(pin_d.get("country") or pin_o.get("country") or "").upper()
    region = _region_from_country(country) if country else (hint or "INTL")
    tz_name = str(pin_d.get("tz") or pin_o.get("tz") or _REGION_TZ.get(region, "UTC"))
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz_name = _REGION_TZ.get(region, "UTC")
        tz = ZoneInfo(tz_name)
    naive = travel_day.replace(tzinfo=None) if travel_day.tzinfo else travel_day
    now_local = datetime.now(tz)
    is_today = naive.date() == now_local.date()
    win = (window or "").strip().lower()
    if win and win in _WINDOW_HOURS:
        hours = list(_WINDOW_HOURS[win][:3])
        minute = 0
    elif is_today:
        hours = list(
            dict.fromkeys(
                [now_local.hour, (now_local.hour + 1) % 24, 8, 12, 17]
            )
        )
        minute = now_local.minute
    else:
        hours = [7, 9, 12, 15, 18]
        minute = 0
    o_addr = _poi_query(str(pin_o.get("query") or pin_o.get("formatted") or o_label))
    d_addr = _poi_query(str(pin_d.get("query") or pin_d.get("formatted") or d_label))
    origin_latlng = None
    dest_latlng = None
    cache_key = f"local|vehicles|{o_addr.lower()}|{d_addr.lower()}|{naive.strftime('%Y-%m-%d')}|{win}|{hours}|{minute}|{tz_name}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]

    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [
            pool.submit(
                _one_departure,
                o_label,
                d_label,
                naive,
                h,
                region,
                tz_name,
                origin_addr=o_addr,
                dest_addr=d_addr,
                origin_latlng=origin_latlng,
                dest_latlng=dest_latlng,
                region_code=country or _REGION_CODE.get(region),
                transit_routing=None,
                local=True,
                minute=minute if h == hours[0] and is_today else 0,
            )
            for h in hours
        ]
        for fut in as_completed(futs):
            for row in fut.result() or []:
                key = f"{row.get('operator')}|{row.get('dep')}|{row.get('from_stop')}"
                if key in seen:
                    continue
                seen.add(key)
                found.append(row)

    token = (_city_key(o_label).split() or [""])[0]

    def _sort_key(row: dict[str, Any]) -> tuple[int, int, int, int]:
        stop = _city_key(row.get("from_stop") or "")
        v = str(row.get("vehicle_type") or "").upper()
        walkish = 1 if v in {"", "WALK"} else 0
        transfers = 1 if row.get("via") else 0
        nearby = 0 if token and len(token) >= 4 and token in stop else 1
        return (walkish, transfers, nearby, _mins(row.get("dep") or "") or 99_999)

    found.sort(key=_sort_key)
    has_vehicle = any(
        str(r.get("vehicle_type") or "") not in {"", "WALK"} and r.get("dep") for r in found
    )
    if not has_vehicle:
        hub = default_local_origin(d_label)
        hub_pin = None
        if hub:
            try:
                hub_pin = resolve_place_pin(hub, hint or region)
            except ProviderRequestError:
                hub_pin = None
        hub_addr = str((hub_pin or {}).get("query") or (hub_pin or {}).get("formatted") or "")
        hub_ll = None
        if hub and hub_addr and hub_addr.lower() != o_addr.lower():
            for h in hours[:2]:
                for row in _one_departure(
                    hub,
                    d_label,
                    naive,
                    h,
                    region,
                    tz_name,
                    origin_addr=hub_addr,
                    dest_addr=d_addr,
                    origin_latlng=hub_ll,
                    dest_latlng=dest_latlng,
                    region_code=country or _REGION_CODE.get(region),
                    transit_routing=None,
                    local=True,
                    minute=minute if h == hours[0] and is_today else 0,
                ):
                    key = f"{row.get('operator')}|{row.get('dep')}|{row.get('from_stop')}"
                    if key in seen:
                        continue
                    seen.add(key)
                    found.append(row)
            found.sort(key=_sort_key)
            has_vehicle = any(
                str(r.get("vehicle_type") or "") not in {"", "WALK"} and r.get("dep") for r in found
            )
    if not has_vehicle:
        km = _haversine_km(pin_o, pin_d)
        ferry = _water_transit_hint(
            o_label,
            d_label,
            pin_o.get("formatted"),
            pin_d.get("formatted"),
            pin_o.get("query"),
            pin_d.get("query"),
        )
        if ferry or (km is not None and km >= 2.0):
            found.insert(
                0,
                _maps_transit_row(
                    o_label,
                    d_label,
                    naive.strftime("%Y-%m-%d"),
                    region,
                    ferry=bool(ferry),
                    km=km,
                ),
            )
            has_vehicle = True
    if not any(str(r.get("vehicle_type") or "") == "WALK" for r in found):
        try:
            walk_body = google_maps_provider.compute_route(
                o_addr,
                d_addr,
                "WALK",
                region_code=country or _REGION_CODE.get(region),
                origin_latlng=origin_latlng,
                dest_latlng=dest_latlng,
            )
            for route in walk_body.get("routes") or []:
                if not isinstance(route, dict):
                    continue
                row = _parse_route(route, o_label, d_label, naive.strftime("%Y-%m-%d"), region=region, local=True)
                if not row:
                    continue
                row["vehicle_type"] = "WALK"
                row["operator"] = row.get("operator") or "Walk"
                row["vehicle"] = "Walk"
                key = f"walk|{row.get('duration')}"
                if key not in seen:
                    seen.add(key)
                    found.append(row)
                break
        except ProviderRequestError:
            pass
        found.sort(key=_sort_key)
    _CACHE[cache_key] = (time.time(), found)
    return found


def search_intercity_buses(
    origin: str,
    destination: str,
    travel_day: datetime,
    window: str = "",
) -> list[dict[str, Any]]:
    if is_local_city_bus(origin, destination):
        return search_local_city_buses(origin, destination, travel_day, window=window)
    o = canonical_city(origin)
    d = canonical_city(destination)
    if not o or not d or o.lower() == d.lower():
        raise ProviderRequestError("bus_search", "Need different origin and destination cities.")
    region = route_region(o, d)
    hint = region if region in ("IN", "US", "EU") else ""
    try:
        pin_o = resolve_place_pin(o, hint)
        pin_d = resolve_place_pin(d, hint)
    except ProviderRequestError:
        pin_o = pin_d = {}
    country = str((pin_d or {}).get("country") or (pin_o or {}).get("country") or "").upper()
    if country:
        region = _region_from_country(country) if region == "INTL" else region
    tz_name = str((pin_d or {}).get("tz") or (pin_o or {}).get("tz") or _REGION_TZ.get(region, "UTC"))
    try:
        ZoneInfo(tz_name)
    except Exception:
        tz_name = _REGION_TZ.get(region, "UTC")
    win = (window or "").strip().lower()
    hours = _WINDOW_HOURS.get(win) or _ALL_HOURS
    cache_key = f"{region}|vehicles|{o.lower()}|{d.lower()}|{travel_day.strftime('%Y-%m-%d')}|{win}|{','.join(map(str, hours))}|{tz_name}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]

    if region == "IN":
        try:
            from providers import india_coach

            coaches = india_coach.search_india_coaches(o, d, travel_day, limit=80)
        except Exception:
            logger.info("india coach feed unavailable", exc_info=True)
            coaches = []
        if coaches:
            if win and win in _WINDOW_HOURS:
                lo, hi = _WINDOW_HOURS[win][0], _WINDOW_HOURS[win][-1]
                filtered = []
                for row in coaches:
                    hm = _mins(row.get("dep") or "")
                    if hm is None:
                        continue
                    hour = hm // 60
                    if lo <= hour <= hi or (win == "night" and hour <= 5):
                        filtered.append(row)
                coaches = filtered or coaches
            _CACHE[cache_key] = (time.time(), coaches)
            return coaches

    o_addr = str((pin_o or {}).get("query") or (pin_o or {}).get("formatted") or _google_address(o, region))
    d_addr = str((pin_d or {}).get("query") or (pin_d or {}).get("formatted") or _google_address(d, region))
    o_ll = None
    d_ll = None
    found: list[dict[str, Any]] = []
    seen: set[str] = set()
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = [
            pool.submit(
                _one_departure,
                o,
                d,
                travel_day,
                h,
                region,
                tz_name,
                origin_addr=o_addr,
                dest_addr=d_addr,
                origin_latlng=o_ll,
                dest_latlng=d_ll,
                region_code=country or _REGION_CODE.get(region),
            )
            for h in hours
        ]
        for fut in as_completed(futs):
            for row in fut.result() or []:
                key = f"{row.get('operator')}|{row.get('dep')}|{row.get('from_stop')}"
                if key in seen:
                    continue
                seen.add(key)
                found.append(row)

    found.sort(key=lambda r: _mins(r.get("dep") or "") or 99_999)
    _CACHE[cache_key] = (time.time(), found)
    return found
