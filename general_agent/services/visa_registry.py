"""Official immigration source registry — URLs and authorities, never hard rules."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

_DATA = Path(__file__).resolve().parent.parent / "data" / "visa_sources.json"

_SCHENGEN_MEMBERS = {
    "AT", "BE", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
    "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "SE",
    "SI", "SK", "CH",
}

_NAME_TO_CC: dict[str, str] = {
    "india": "IN", "indian": "IN", "bharat": "IN",
    "united states": "US", "usa": "US", "america": "US", "american": "US",
    "uk": "GB", "united kingdom": "GB", "britain": "GB", "british": "GB",
    "england": "GB", "scotland": "GB", "wales": "GB", "great britain": "GB",
    "canada": "CA", "canadian": "CA",
    "australia": "AU", "australian": "AU",
    "new zealand": "NZ", "nz": "NZ",
    "ireland": "IE", "irish": "IE",
    "switzerland": "CH", "swiss": "CH",
    "france": "FR", "french": "FR",
    "germany": "DE", "german": "DE",
    "italy": "IT", "italian": "IT",
    "spain": "ES", "spanish": "ES",
    "netherlands": "NL", "holland": "NL", "dutch": "NL",
    "portugal": "PT", "portuguese": "PT",
    "greece": "GR", "greek": "GR",
    "austria": "AT",
    "belgium": "BE", "belgian": "BE",
    "sweden": "SE", "swedish": "SE",
    "norway": "NO", "norwegian": "NO",
    "denmark": "DK", "danish": "DK",
    "finland": "FI", "finnish": "FI",
    "poland": "PL", "polish": "PL",
    "czechia": "CZ", "czech": "CZ", "czech republic": "CZ",
    "croatia": "HR",
    "hungary": "HU",
    "japan": "JP", "japanese": "JP",
    "south korea": "KR", "korea": "KR", "korean": "KR",
    "china": "CN", "chinese": "CN",
    "hong kong": "HK",
    "taiwan": "TW",
    "singapore": "SG",
    "malaysia": "MY", "malaysian": "MY",
    "thailand": "TH", "thai": "TH",
    "vietnam": "VN", "vietnamese": "VN",
    "indonesia": "ID", "indonesian": "ID", "bali": "ID",
    "philippines": "PH",
    "cambodia": "KH",
    "sri lanka": "LK",
    "maldives": "MV",
    "nepal": "NP",
    "uae": "AE", "dubai": "AE", "abu dhabi": "AE", "emirates": "AE",
    "saudi": "SA", "saudi arabia": "SA",
    "qatar": "QA", "doha": "QA",
    "bahrain": "BH",
    "oman": "OM",
    "kuwait": "KW",
    "turkey": "TR", "türkiye": "TR", "turkiye": "TR",
    "egypt": "EG",
    "kenya": "KE",
    "tanzania": "TZ", "zanzibar": "TZ",
    "south africa": "ZA",
    "rwanda": "RW",
    "morocco": "MA",
    "mexico": "MX", "mexican": "MX",
    "brazil": "BR", "brazilian": "BR",
    "argentina": "AR",
    "chile": "CL",
    "peru": "PE",
    "colombia": "CO",
    "schengen": "SCHENGEN", "europe": "SCHENGEN", "eu": "SCHENGEN",
}

_CITY_TO_CC: dict[str, str] = {
    "london": "GB", "heathrow": "GB", "gatwick": "GB", "manchester": "GB",
    "edinburgh": "GB", "birmingham": "GB",
    "new york": "US", "nyc": "US", "los angeles": "US", "san francisco": "US",
    "chicago": "US", "miami": "US", "boston": "US", "seattle": "US",
    "washington": "US", "orlando": "US", "las vegas": "US", "houston": "US",
    "toronto": "CA", "vancouver": "CA", "montreal": "CA",
    "sydney": "AU", "melbourne": "AU", "brisbane": "AU", "perth": "AU",
    "auckland": "NZ", "queenstown": "NZ",
    "dublin": "IE",
    "zurich": "CH", "geneva": "CH",
    "paris": "FR", "lyon": "FR", "nice": "FR",
    "berlin": "DE", "munich": "DE", "frankfurt": "DE",
    "rome": "IT", "milan": "IT", "venice": "IT", "florence": "IT",
    "madrid": "ES", "barcelona": "ES",
    "amsterdam": "NL",
    "lisbon": "PT",
    "athens": "GR",
    "vienna": "AT",
    "brussels": "BE",
    "stockholm": "SE",
    "oslo": "NO",
    "copenhagen": "DK",
    "helsinki": "FI",
    "warsaw": "PL",
    "prague": "CZ",
    "zagreb": "HR", "dubrovnik": "HR", "split": "HR",
    "budapest": "HU",
    "tokyo": "JP", "osaka": "JP", "kyoto": "JP",
    "seoul": "KR",
    "beijing": "CN", "shanghai": "CN",
    "hong kong": "HK",
    "taipei": "TW",
    "singapore": "SG",
    "kuala lumpur": "MY", "penang": "MY", "langkawi": "MY",
    "bangkok": "TH", "phuket": "TH", "chiang mai": "TH", "pattaya": "TH",
    "hanoi": "VN", "ho chi minh": "VN", "saigon": "VN", "da nang": "VN",
    "bali": "ID", "jakarta": "ID", "denpasar": "ID",
    "manila": "PH", "cebu": "PH",
    "siem reap": "KH", "phnom penh": "KH",
    "mumbai": "IN", "delhi": "IN", "bangalore": "IN", "bengaluru": "IN",
    "hyderabad": "IN", "chennai": "IN", "kolkata": "IN", "pune": "IN",
    "ahmedabad": "IN", "surat": "IN", "goa": "IN", "jaipur": "IN",
    "colombo": "LK",
    "male": "MV", "malé": "MV",
    "kathmandu": "NP",
    "dubai": "AE", "abu dhabi": "AE",
    "riyadh": "SA", "jeddah": "SA",
    "doha": "QA",
    "istanbul": "TR",
    "cairo": "EG",
    "nairobi": "KE",
    "zanzibar": "TZ", "dar es salaam": "TZ",
    "cape town": "ZA", "johannesburg": "ZA",
    "kigali": "RW",
    "marrakech": "MA", "casablanca": "MA",
    "mexico city": "MX", "cancun": "MX", "cancún": "MX",
    "rio": "BR", "sao paulo": "BR", "são paulo": "BR",
    "buenos aires": "AR",
    "santiago": "CL",
    "lima": "PE",
    "bogota": "CO", "bogotá": "CO",
}

_IATA_TO_CC: dict[str, str] = {
    "LHR": "GB", "LGW": "GB", "STN": "GB", "MAN": "GB", "EDI": "GB",
    "JFK": "US", "EWR": "US", "LAX": "US", "SFO": "US", "ORD": "US",
    "MIA": "US", "BOS": "US", "SEA": "US", "IAD": "US", "MCO": "US",
    "LAS": "US", "IAH": "US", "ATL": "US", "DFW": "US",
    "YYZ": "CA", "YVR": "CA", "YUL": "CA",
    "SYD": "AU", "MEL": "AU", "BNE": "AU", "PER": "AU",
    "AKL": "NZ",
    "DUB": "IE",
    "ZRH": "CH", "GVA": "CH",
    "CDG": "FR", "ORY": "FR", "NCE": "FR",
    "FRA": "DE", "MUC": "DE", "BER": "DE",
    "FCO": "IT", "MXP": "IT", "VCE": "IT",
    "MAD": "ES", "BCN": "ES",
    "AMS": "NL",
    "LIS": "PT",
    "ATH": "GR",
    "VIE": "AT",
    "BRU": "BE",
    "ARN": "SE",
    "OSL": "NO",
    "CPH": "DK",
    "HEL": "FI",
    "WAW": "PL",
    "PRG": "CZ",
    "ZAG": "HR", "DBV": "HR",
    "BUD": "HU",
    "NRT": "JP", "HND": "JP", "KIX": "JP",
    "ICN": "KR",
    "PEK": "CN", "PVG": "CN",
    "HKG": "HK",
    "TPE": "TW",
    "SIN": "SG",
    "KUL": "MY",
    "BKK": "TH", "HKT": "TH", "CNX": "TH",
    "HAN": "VN", "SGN": "VN", "DAD": "VN",
    "DPS": "ID", "CGK": "ID",
    "MNL": "PH",
    "BOM": "IN", "DEL": "IN", "BLR": "IN", "HYD": "IN", "MAA": "IN",
    "CCU": "IN", "AMD": "IN", "STV": "IN", "GOI": "IN", "PNQ": "IN", "JAI": "IN",
    "CMB": "LK",
    "MLE": "MV",
    "KTM": "NP",
    "DXB": "AE", "AUH": "AE", "SHJ": "AE",
    "RUH": "SA", "JED": "SA",
    "DOH": "QA",
    "BAH": "BH",
    "MCT": "OM",
    "KWI": "KW",
    "IST": "TR", "SAW": "TR",
    "CAI": "EG",
    "NBO": "KE",
    "ZNZ": "TZ", "DAR": "TZ",
    "CPT": "ZA", "JNB": "ZA",
    "KGL": "RW",
    "CMN": "MA", "RAK": "MA",
    "MEX": "MX", "CUN": "MX",
    "GRU": "BR", "GIG": "BR",
    "EZE": "AR",
    "SCL": "CL",
    "LIM": "PE",
    "BOG": "CO",
}

_L1_HOST_HINTS = (
    ".gov", ".gob.", ".go.", ".gouv.", ".govt.", ".admin.ch", ".gc.ca",
    "europa.eu", "gov.uk", "gov.au", "govt.nz", "gov.sg", "gov.ae", "gov.sa",
    "mofa.", "mfa.", "immigration.", "immi.", "homeaffairs.", "ica.gov",
    "cbp.gov", "state.gov", "uscis.gov", "sem.admin", "ind.nl",
)
_L2_HOST_HINTS = (
    "iata.org", "iatatravelcentre.com", "airline", "airport",
    "heathrow.com", "changiairport.com", "schiphol.nl",
)


@lru_cache(maxsize=1)
def load_registry() -> dict[str, Any]:
    raw = json.loads(_DATA.read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if not str(k).startswith("_meta")}


def _fold(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def resolve_country_code(place: str) -> str:
    """Map nationality / country / city / IATA → ISO-2 or SCHENGEN. Empty if unknown."""
    raw = (place or "").strip()
    if not raw:
        return ""
    if re.fullmatch(r"[A-Za-z]{2}", raw):
        code = raw.upper()
        if code == "UK":
            return "GB"
        return code
    if re.fullmatch(r"[A-Za-z]{3}", raw):
        return _IATA_TO_CC.get(raw.upper(), "")
    q = _fold(raw)
    if q in _NAME_TO_CC:
        return _NAME_TO_CC[q]
    if q in _CITY_TO_CC:
        return _CITY_TO_CC[q]
    best = ""
    hit = ""
    for alias, code in list(_NAME_TO_CC.items()) + list(_CITY_TO_CC.items()):
        if len(alias) < 4:
            continue
        if alias in q and len(alias) > len(best):
            best, hit = alias, code
    return hit


def is_schengen(code: str) -> bool:
    return (code or "").upper() in _SCHENGEN_MEMBERS or (code or "").upper() == "SCHENGEN"


def entry_for(code: str) -> dict[str, Any] | None:
    reg = load_registry()
    key = (code or "").upper()
    if key == "UK":
        key = "GB"
    rec = reg.get(key)
    return rec if isinstance(rec, dict) else None


def sources_for_countries(codes: list[str]) -> list[dict[str, Any]]:
    """Deduped registry rows for dest + transits, including Schengen overlay."""
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    expanded: list[str] = []
    for raw in codes:
        cc = (raw or "").upper()
        if not cc:
            continue
        if cc == "UK":
            cc = "GB"
        expanded.append(cc)
        if is_schengen(cc) and cc != "SCHENGEN":
            expanded.append("SCHENGEN")
    expanded.append("_GLOBAL")
    for cc in expanded:
        if cc in seen:
            continue
        rec = entry_for(cc) if cc != "_GLOBAL" else load_registry().get("_GLOBAL")
        if not isinstance(rec, dict):
            seen.add(cc)
            continue
        seen.add(cc)
        row = dict(rec)
        row["code"] = cc
        row["level"] = int(row.get("level") or (2 if cc == "_GLOBAL" else 1))
        out.append(row)
    return out


def official_urls(rec: dict[str, Any]) -> list[tuple[str, str]]:
    """(kind, url) from a registry row."""
    pairs = []
    for kind in ("visa_url", "transit_url", "eta_url", "entry_url"):
        url = str(rec.get(kind) or "").strip()
        if url.startswith("http"):
            pairs.append((kind.replace("_url", ""), url))
    return pairs


def official_domains(codes: list[str]) -> list[str]:
    domains: list[str] = []
    seen: set[str] = set()
    for rec in sources_for_countries(codes):
        for d in rec.get("domains") or []:
            host = str(d).strip().lower().lstrip(".")
            if host and host not in seen:
                seen.add(host)
                domains.append(host)
    return domains


def classify_url_level(url: str, official_hosts: list[str] | None = None) -> int:
    host = (urlparse(url or "").hostname or "").lower()
    if not host:
        return 4
    for oh in official_hosts or []:
        if host == oh or host.endswith("." + oh) or oh in host:
            return 1
    if any(h in host for h in _L1_HOST_HINTS):
        return 1
    if any(h in host for h in _L2_HOST_HINTS):
        return 2
    if any(x in host for x in ("timatic", "sherpa", "visahq", "passportindex", "cibtvisas")):
        return 3
    return 4
