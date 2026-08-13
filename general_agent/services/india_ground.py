"""Grounded India surface / pilgrimage routes — not LiteAPI flights.

Temple towns like Ambaji have no commercial airport. Mapping them to the
nearest IATA (UDR for Ambaji) books the wrong city and confuses elders.
"""
from __future__ import annotations

import re
from typing import Optional

# key = lowercase ascii-ish aliases
_PLACES: dict[str, dict] = {
    "ambaji": {
        "name": "Ambaji",
        "state": "Gujarat",
        "aliases": ("ambaji", "અંબાજી", "ambaaji", "ambaji temple"),
        "has_airport": False,
        "nearest_rail": "Abu Road (ABR)",
        "nearest_airport": "Udaipur (UDR) — 1.5–2h road; NOT the usual Surat/Ahmedabad path",
        "how": (
            "Ambaji has no airport and no railway station. Families from South Gujarat "
            "take a train to Abu Road (ABR), then taxi/bus (~20–40 km, ~45 min) to the temple. "
            "Do NOT search or sell a flight to Udaipur as 'Ambaji'."
        ),
        "from_hint": {
            "surat": "Surat (ST) → Abu Road (ABR) train, then taxi/bus to Ambaji.",
            "ahmedabad": "Ahmedabad (ADI) → Abu Road train, or direct bus/car (~180 km).",
            "vadodara": "Vadodara → Abu Road train, then taxi to Ambaji.",
            "mumbai": "Mumbai → Abu Road train (longer), then taxi to Ambaji.",
            "rajkot": "Rajkot → Abu Road via Ahmedabad, or bus; no useful Ambaji flight.",
        },
    },
    "somnath": {
        "name": "Somnath",
        "state": "Gujarat",
        "aliases": ("somnath", "સોમનાથ", "prabhas patan"),
        "has_airport": False,
        "nearest_rail": "Veraval (VRL) / Somnath (SMNH)",
        "nearest_airport": "Diu (DIU) or Rajkot (RAJ) + road",
        "how": "Train to Veraval/Somnath or fly Diu/Rajkot then road. Temple town — prefer train/bus unless they ask to fly.",
    },
    "dwarka": {
        "name": "Dwarka",
        "state": "Gujarat",
        "aliases": ("dwarka", "દ્વારકા", "dwarkadhish"),
        "has_airport": False,
        "nearest_rail": "Dwarka (DWK)",
        "nearest_airport": "Jamnagar (JGA) + ~150 km road",
        "how": "Train to Dwarka station is the normal route. Flight only if they explicitly want Jamnagar + taxi.",
    },
    "palitana": {
        "name": "Palitana",
        "state": "Gujarat",
        "aliases": ("palitana", "પાલીતાણા", "shatrunjaya"),
        "has_airport": False,
        "nearest_rail": "Palitana (PIT) / Sihor",
        "nearest_airport": "Bhavnagar (BHU) + road",
        "how": "Train/bus to Palitana. No airport in town.",
    },
    "pavagadh": {
        "name": "Pavagadh",
        "state": "Gujarat",
        "aliases": ("pavagadh", "પાવાગઢ", "kalika"),
        "has_airport": False,
        "nearest_rail": "Vadodara (BRC) / Champaner Road",
        "nearest_airport": "Vadodara (BDQ)",
        "how": "From Vadodara by road (~50 km). Do not invent a Pavagadh airport.",
    },
    "shirdi": {
        "name": "Shirdi",
        "state": "Maharashtra",
        "aliases": ("shirdi", "शिर्डी", "saibaba"),
        "has_airport": True,
        "nearest_rail": "Sainagar Shirdi (SNSI)",
        "nearest_airport": "Shirdi (SAG)",
        "how": "Train to SNSI or fly SAG if they ask for flight. Many families still prefer train.",
    },
    "tirupati": {
        "name": "Tirupati",
        "state": "Andhra Pradesh",
        "aliases": ("tirupati", "tirumala", "తిరుపతి"),
        "has_airport": True,
        "nearest_rail": "Tirupati (TPTY)",
        "nearest_airport": "Tirupati (TIR)",
        "how": "Train or fly TIR. Ask which they prefer — do not assume flight.",
    },
}

# Indian Rail station codes — Baroda is Vadodara (BRC). Used by search_trains / eRail.
_RAIL_STATIONS: dict[str, tuple[str, str]] = {
    "surat": ("ST", "Surat"),
    "સુરત": ("ST", "Surat"),
    "udhna": ("UDN", "Udhna Jn"),
    "baroda": ("BRC", "Vadodara Jn"),
    "vadodara": ("BRC", "Vadodara Jn"),
    "vadodra": ("BRC", "Vadodara Jn"),
    "વડોદરા": ("BRC", "Vadodara Jn"),
    "બરોડા": ("BRC", "Vadodara Jn"),
    "ahmedabad": ("ADI", "Ahmedabad Jn"),
    "amdavad": ("ADI", "Ahmedabad Jn"),
    "અમદાવાદ": ("ADI", "Ahmedabad Jn"),
    "mumbai": ("MMCT", "Mumbai Central"),
    "bombay": ("MMCT", "Mumbai Central"),
    "mumbai central": ("MMCT", "Mumbai Central"),
    "mumbai cst": ("CSMT", "Mumbai CSMT"),
    "csmt": ("CSMT", "Mumbai CSMT"),
    "bandra": ("BDTS", "Bandra Terminus"),
    "pune": ("PUNE", "Pune Jn"),
    "delhi": ("NDLS", "New Delhi"),
    "new delhi": ("NDLS", "New Delhi"),
    "jaipur": ("JP", "Jaipur Jn"),
    "udaipur": ("UDZ", "Udaipur City"),
    "indore": ("INDB", "Indore Jn"),
    "ujjain": ("UJN", "Ujjain Jn"),
    "bhopal": ("BPL", "Bhopal Jn"),
    "nagpur": ("NGP", "Nagpur"),
    "goa": ("MAO", "Madgaon"),
    "madgaon": ("MAO", "Madgaon"),
    "bangalore": ("SBC", "KSR Bengaluru"),
    "bengaluru": ("SBC", "KSR Bengaluru"),
    "chennai": ("MAS", "Chennai Central"),
    "hyderabad": ("HYB", "Hyderabad Deccan"),
    "kolkata": ("HWH", "Howrah"),
    "howrah": ("HWH", "Howrah"),
    "lucknow": ("LKO", "Lucknow Nr"),
    "kanpur": ("CNB", "Kanpur Central"),
    "patna": ("PNBE", "Patna Jn"),
    "varanasi": ("BSB", "Varanasi Jn"),
    "amritsar": ("ASR", "Amritsar Jn"),
    "jamnagar": ("JAM", "Jamnagar"),
    "rajkot": ("RJT", "Rajkot Jn"),
    "bhavnagar": ("BVC", "Bhavnagar Trm"),
    "veraval": ("VRL", "Veraval"),
    "somnath": ("SMNH", "Somnath"),
    "dwarka": ("DWK", "Dwarka"),
    "abu road": ("ABR", "Abu Road"),
    "ambaji": ("ABR", "Abu Road"),
    "shirdi": ("SNSI", "Sainagar Shirdi"),
    "nashik": ("NK", "Nashik Road"),
    "nasik": ("NK", "Nashik Road"),
    "anand": ("ANND", "Anand Jn"),
    "bharuch": ("BH", "Bharuch Jn"),
    "broach": ("BH", "Bharuch Jn"),
    "vapi": ("VAPI", "Vapi"),
    "valsad": ("BL", "Valsad"),
    "navsari": ("NVS", "Navsari"),
    "barmer": ("BME", "Barmer"),
    "bikaner": ("BKN", "Bikaner Jn"),
    "jodhpur": ("JU", "Jodhpur Jn"),
    "ajmer": ("AII", "Ajmer Jn"),
    "kota": ("KOTA", "Kota Jn"),
    "udaipur city": ("UDZ", "Udaipur City"),
    "gwalior": ("GWL", "Gwalior"),
    "agra": ("AGC", "Agra Cantt"),
    "agra cantt": ("AGC", "Agra Cantt"),
    "haridwar": ("HW", "Haridwar"),
    "rishikesh": ("RKSH", "Rishikesh"),
    "dehradun": ("DDN", "Dehradun"),
    "chandigarh": ("CDG", "Chandigarh"),
    "amritsar jn": ("ASR", "Amritsar Jn"),
    "guwahati": ("GHY", "Guwahati"),
    "bhubaneswar": ("BBS", "Bhubaneswar"),
    "visakhapatnam": ("VSKP", "Visakhapatnam"),
    "vizag": ("VSKP", "Visakhapatnam"),
    "coimbatore": ("CBE", "Coimbatore Jn"),
    "madurai": ("MDU", "Madurai Jn"),
    "thiruvananthapuram": ("TVC", "Thiruvananthapuram Ctrl"),
    "trivandrum": ("TVC", "Thiruvananthapuram Ctrl"),
    "kochi": ("ERS", "Ernakulam Jn"),
    "ernakulam": ("ERS", "Ernakulam Jn"),
    "mysore": ("MYS", "Mysuru Jn"),
    "mysuru": ("MYS", "Mysuru Jn"),
    "suratgarh": ("SOG", "Suratgarh Jn"),
}


def _fold(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def match_place(name: str) -> Optional[dict]:
    q = _fold(name)
    if not q:
        return None
    for rec in _PLACES.values():
        for alias in rec.get("aliases") or ():
            if _fold(alias) in q or q in _fold(alias):
                return rec
        if rec["name"].lower() in q:
            return rec
    return None


def resolve_rail_station(place: str) -> Optional[tuple[str, str]]:
    """Map 'Baroda' / 'Barmer' / ST → (code, display). None if unknown."""
    raw = (place or "").strip()
    if not raw:
        return None
    if re.fullmatch(r"[A-Z]{2,5}", raw):
        code = raw.upper()
        for rec in _RAIL_STATIONS.values():
            if rec[0] == code:
                return rec
        try:
            from services.ir_stations import catalog_station

            cat = catalog_station(code)
            if cat:
                return cat["code"], cat["name"]
        except Exception:
            pass
        return (code, code)
    q = _fold(raw)
    best = ""
    hit: Optional[tuple[str, str]] = None
    for alias, rec in _RAIL_STATIONS.items():
        a = _fold(alias)
        if not a:
            continue
        if a == q:
            return rec
        if len(a) <= 3:
            if re.search(rf"(^|\s){re.escape(a)}(\s|$)", q):
                if len(a) >= len(best):
                    best, hit = a, rec
            continue
        # Query may include extra words ("vadodara jn") — alias must be a whole token,
        # never a prefix of a different city (surat ≠ suratgarh).
        if re.search(rf"(^|\s){re.escape(a)}(\s|$)", q):
            if len(a) > len(best):
                best, hit = a, rec
    if hit:
        return hit
    try:
        from services.ir_stations import resolve_from_catalog

        return resolve_from_catalog(raw)
    except Exception:
        return None


def describe_route(origin: str, destination: str) -> str:
    dest = match_place(destination)
    orig = _fold(origin)
    rail_o = resolve_rail_station(origin)
    rail_d = resolve_rail_station(destination)
    if not dest:
        if rail_o and rail_d and rail_o[0] != rail_d[0]:
            return (
                f"India rail: {rail_o[1]} ({rail_o[0]}) → {rail_d[1]} ({rail_d[0]}). "
                "Baroda = Vadodara Jn (BRC). Call search_trains NOW. "
                "Do not search_flights. Do not answer with Google private buses."
            )
        return (
            f"No special pilgrimage note for '{destination}'. "
            "If they asked for train, call search_trains. Do not invent an airport."
        )
    lines = [
        f"{dest['name']} ({dest['state']})",
        dest["how"],
        f"Nearest rail: {dest['nearest_rail']}.",
        f"Nearest airport: {dest['nearest_airport']}.",
    ]
    for city, hint in (dest.get("from_hint") or {}).items():
        if city in orig:
            lines.append(f"From {origin}: {hint}")
            break
    lines.append(
        "If they said train / bus / car: do NOT call search_flights. "
        "Call search_trains for IRCTC numbers. get_route TRANSIT is last-mile metro/bus only."
    )
    return "\n".join(lines)


def flight_search_guard(destination: str, origin: str = "", transport_mode: str = "") -> Optional[str]:
    """Return a block message if flight search would mislead, else None."""
    mode = _fold(transport_mode)
    if mode in ("train", "rail", "bus", "car", "road", "taxi", "drive"):
        extra = describe_route(origin, destination)
        return (
            f"BLOCKED: transport_mode={mode}. Do not search_flights. "
            f"Use search_trains for IRCTC. lookup_india_route for pilgrimage/no-airport.\n{extra}"
        )
    if origin and destination:
        oa, da = _fold(origin), _fold(destination)
        if oa and da and oa == da:
            return (
                "BLOCKED: origin and destination are the same place. "
                "Do not search_flights. Use search_places / get_route."
            )
        try:
            from services.location_resolver import local_airport_key
            ca, cd = local_airport_key(origin), local_airport_key(destination)
            if ca and cd and ca == cd:
                return (
                    "BLOCKED: origin and destination are the same city/airport. "
                    "Not a flight search. Within-city day → search_places/get_route. "
                    "Comparing countries → eliminate constraints, pick ONE dest, then search."
                )
        except Exception:
            pass
    dest = match_place(destination)
    if dest and not dest.get("has_airport"):
        extra = describe_route(origin, destination)
        return (
            f"BLOCKED: {dest['name']} has no useful commercial airport for this trip. "
            f"Do not map it to {dest['nearest_airport']} as a 'direct flight'.\n{extra}"
        )
    return None
