"""
Shared UI "card" mapping — converts ITINERARY_AGENT's FlightOption/HotelOption
data (as plain JSON-dumped dicts) into the card JSON shape the React UI's
CardsDeck component expects.

Used by BOTH:
  - itinerary_bridge.py (cards produced mid-booking-flow, from the real
    ITINERARY_AGENT node results)
  - quick_search_service.py (cards produced by Vero's own quick, search-only
    lookups)

Kept in exactly one place so a flight/hotel card looks identical regardless
of which path produced it, and so `flight_id`/`hotel_id` (needed by
select_searched_flight/select_searched_hotel for deterministic hand-off) are
always present.
"""
from __future__ import annotations

import re
from typing import Any

# Consolidator / GDS shells that show up as "airline" in LiteAPI dumps.
_GDS_SHELL_RE = re.compile(
    r"(?i)\b("
    r"a\s*p\s*g|hahn\s*air|distribution\s*system|consolidator|"
    r"gds|farelogix|travelfusion|pkfare"
    r")\b"
)

# Common IATA → display name when the marketing carrier is buried under a GDS shell.
_IATA_AIRLINE = {
    "6E": "IndiGo",
    "AI": "Air India",
    "UK": "Vistara",
    "SG": "SpiceJet",
    "QP": "Akasa Air",
    "VJ": "VietJet Air",
    "VN": "Vietnam Airlines",
    "SQ": "Singapore Airlines",
    "TG": "Thai Airways",
    "MH": "Malaysia Airlines",
    "OD": "Batik Air Malaysia",
    "CX": "Cathay Pacific",
    "EK": "Emirates",
    "QR": "Qatar Airways",
    "EY": "Etihad Airways",
    "SV": "Saudia",
    "GA": "Garuda Indonesia",
    "QF": "Qantas",
    "BA": "British Airways",
    "LH": "Lufthansa",
    "AF": "Air France",
    "KL": "KLM",
    "TK": "Turkish Airlines",
}


def _airline_label(f: dict[str, Any]) -> str:
    raw = f.get("airline")
    if isinstance(raw, dict):
        name = str(raw.get("name") or raw.get("code") or "").strip()
        code = str(raw.get("code") or "").strip().upper()
    else:
        name = str(raw or "").strip()
        code = ""
    flight_code = str(f.get("flight_number") or f.get("flight_code") or "").strip().upper()
    if not code and len(flight_code) >= 2 and flight_code[:2].isalpha():
        code = flight_code[:2]
    if name and not _GDS_SHELL_RE.search(name):
        return name
    if code and code in _IATA_AIRLINE:
        return _IATA_AIRLINE[code]
    if code and code.isalpha():
        return code
    return name or "Airline"


def _duration_label(f: dict[str, Any]) -> str:
    mins = int(f.get("duration_minutes") or 0)
    # Prefer elapsed time from dep→arr when the stored duration looks absurd
    # relative to clock times (common with bad layover math).
    dep = str(f.get("departure_time") or "")
    arr = str(f.get("arrival_time") or "")
    try:
        dep_hm = dep[11:16] if "T" in dep or len(dep) >= 16 else dep[:5]
        arr_hm = arr[11:16] if "T" in arr or len(arr) >= 16 else arr[:5]
        dh, dm = map(int, dep_hm.split(":"))
        ah, am = map(int, arr_hm.split(":"))
        clock = (ah * 60 + am) - (dh * 60 + dm)
        if clock < 0:
            clock += 24 * 60
        # If stored duration is > 20h longer than same-calendar clock span,
        # trust multi-day only when stops imply it; else clamp to clock+1d.
        if mins <= 0:
            mins = clock
        elif clock > 0 and mins > clock + 20 * 60:
            # Likely bad parse — use clock (+1 day already handled)
            mins = clock
    except Exception:
        pass
    mins = max(1, int(mins))
    return f"{mins // 60}h {mins % 60}m"


def flight_option_to_card_item(f: dict[str, Any], *, index: int = 0) -> dict[str, Any]:
    baggage = str(f.get("baggage_included") or "")
    return {
        "flight_id": f.get("flight_id", ""),
        "index": index or f.get("index") or 0,
        "airline": _airline_label(f),
        "flight_code": f.get("flight_number", ""),
        "refundable": (
            True if "refundable" in str(f.get("refund_policy") or "").lower()
            and "non" not in str(f.get("refund_policy") or "").lower()
            else False if "non-refundable" in str(f.get("refund_policy") or "").lower()
            else None
        ),
        "dep_time": str(f.get("departure_time", ""))[11:16],
        "origin": f.get("origin", ""),
        "duration": _duration_label(f),
        "stops": f.get("stops", 0),
        "arr_time": str(f.get("arrival_time", ""))[11:16],
        "dest": f.get("destination", ""),
        "has_checked_bag": "check-in" in baggage.lower(),
        "fare_family": f.get("cabin_class") or "Economy",
        "currency": "INR",
        "price": f.get("price_per_adult", 0),
        "offer_id": f.get("offer_id") or None,
    }


def flight_cards(flights: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    if not flights:
        return None
    return {
        "type": "flights",
        "title": title,
        "subtitle": subtitle,
        "items": [flight_option_to_card_item(f, index=i + 1) for i, f in enumerate(flights)],
    }


def hotel_option_to_card_item(h: dict[str, Any], *, index: int = 0) -> dict[str, Any]:
    images = []
    for key in ("image_url", "main_photo", "thumbnail"):
        url = h.get(key)
        if url and str(url).strip() and str(url) not in images:
            images.append(str(url).strip())
    for url in h.get("hotel_images") or h.get("images") or []:
        u = str(url or "").strip()
        if u and u not in images:
            images.append(u)
    return {
        "hotel_id": h.get("hotel_id", ""),
        "index": index or h.get("index") or 0,
        "rating": h.get("star_rating", 0),
        "refundable": "free cancellation" in str(h.get("cancellation_policy", "")).lower(),
        "name": h.get("name", ""),
        "address": f"{h.get('area', '')}, {h.get('location', '')}".strip(", "),
        "room_name": h.get("room_type", ""),
        "board": h.get("meal_plan", ""),
        "currency": "INR",
        "price": h.get("price_per_night", 0),
        "image": images[0] if images else None,
        "images": images[:6],
        "offer_id": h.get("offer_id") or None,
    }


def place_cards(places: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    if not places:
        return None
    items = []
    for i, p in enumerate(places, start=1):
        items.append({
            "index": i,
            "name": p.get("name") or "",
            "address": p.get("address") or "",
            "area": p.get("area") or "",
            "rating": p.get("rating"),
            "rating_count": p.get("rating_count"),
            "open_now": p.get("open_now"),
            "type": p.get("type") or "",
            "price": p.get("price") or "",
            "maps_url": p.get("maps_url") or "",
            "website_url": p.get("website_url") or "",
            "summary": p.get("summary") or "",
            "photo_url": p.get("photo_url") or p.get("image") or "",
            "image": p.get("image") or p.get("photo_url") or "",
        })
    return {"type": "places", "title": title, "subtitle": subtitle, "items": items}


def event_cards(events: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    """Place-shaped cards so the existing Vero chat UI can render Ticketmaster hits."""
    if not events:
        return None
    items = []
    for i, e in enumerate(events, start=1):
        items.append({
            "index": i,
            "name": e.get("name") or "",
            "address": e.get("address") or e.get("venue") or "",
            "area": e.get("venue") or e.get("city") or "",
            "rating": None,
            "rating_count": None,
            "open_now": None,
            "type": e.get("classification") or "Event",
            "price": e.get("price") or "",
            "priceMin": e.get("priceMin"),
            "priceMax": e.get("priceMax"),
            "currency": e.get("currency") or "",
            "maps_url": "",
            "website_url": e.get("url") or "",
            "summary": e.get("when") or "",
            "when": e.get("when") or "",
            "event_id": e.get("id") or "",
            "status": e.get("status") or "",
        })
    return {"type": "events", "title": title, "subtitle": subtitle, "items": items}


def bus_cards(buses: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    """Intercity bus payload (left /buses page; not bookable in-app)."""
    if not buses:
        return None
    items = []
    for i, b in enumerate(buses, start=1):
        items.append({
            "index": i,
            "id": b.get("id") or "",
            "operator": b.get("operator") or "",
            "name": b.get("name") or b.get("operator") or "",
            "kind": b.get("kind") or "",
            "bus_type": b.get("bus_type") or "",
            "from_name": b.get("from_name") or "",
            "to_name": b.get("to_name") or "",
            "from_stop": b.get("from_stop") or "",
            "to_stop": b.get("to_stop") or "",
            "dep": b.get("dep") or "",
            "arr": b.get("arr") or "",
            "duration": b.get("duration") or "",
            "distance": b.get("distance") or "",
            "headway": b.get("headway") or "",
            "trip_short": b.get("trip_short") or "",
            "headsign": b.get("headsign") or "",
            "vehicle": b.get("vehicle") or "",
            "name_short": b.get("name_short") or "",
            "modes": b.get("modes") or [],
            "fare": b.get("fare"),
            "fare_currency": b.get("fare_currency") or b.get("currency") or "",
            "rating": b.get("rating"),
            "rating_count": b.get("rating_count"),
            "seats": b.get("seats"),
            "single_seats": b.get("single_seats"),
            "live_tracking": bool(b.get("live_tracking")),
            "primo": bool(b.get("primo")),
            "rtc": bool(b.get("rtc")),
            "date": b.get("date") or "",
            "book_url": b.get("book_url") or "",
            "amenities": b.get("amenities") or [],
            "local": bool(b.get("local")),
            "walk_to_stop": b.get("walk_to_stop") or "",
        })
    return {"type": "buses", "title": title, "subtitle": subtitle, "items": items}


def train_cards(trains: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    """IRCTC timetable payload (left /trains page; not bookable in-app)."""
    if not trains:
        return None
    items = []
    for i, t in enumerate(trains, start=1):
        items.append({
            "index": i,
            "number": t.get("number") or "",
            "name": t.get("name") or "",
            "from_code": t.get("from_code") or "",
            "to_code": t.get("to_code") or "",
            "dep": t.get("dep") or "",
            "arr": t.get("arr") or "",
            "duration": t.get("duration") or "",
            "days": t.get("days") or "",
            "kind": t.get("kind") or "",
            "in_window": bool(t.get("in_window", True)),
            "date": t.get("date") or "",
            "book_url": t.get("book_url") or "",
            "live_url": t.get("live_url") or "",
            "irctc_url": t.get("irctc_url") or "https://www.irctc.co.in/nget/train-search",
            "schedule_url": t.get("schedule_url") or "",
            "erail_url": t.get("erail_url") or "",
            "food_url": t.get("food_url") or "",
            "irctc_food_url": t.get("irctc_food_url") or "https://www.ecatering.irctc.co.in/",
        })
    return {"type": "trains", "title": title, "subtitle": subtitle, "items": items}


def train_track_cards(track: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(track, dict) or not (track.get("train_number") or track.get("ok")):
        return None
    number = str(track.get("train_number") or "")
    items = [
        {
            "index": 1,
            "number": number,
            "name": track.get("train_name") or f"Train {number}",
            "title": track.get("title") or "",
            "message": track.get("message") or "",
            "next_station": track.get("next_station_name") or "",
            "next_code": track.get("next_station_code") or "",
            "current_station": track.get("current_station") or "",
            "platform": track.get("platform"),
            "delay_minutes": track.get("delay_minutes"),
            "on_time": track.get("on_time"),
            "gps_unable": bool(track.get("gps_unable", True)),
            "is_gps": False,
            "start_date": track.get("start_date") or "",
            "status_as_of": track.get("status_as_of") or "",
            "ahead_text": track.get("ahead_text") or "",
            "next_in": track.get("next_in") or "",
            "track_path": f"/trains?mode=track&number={number}" if number else "/trains?mode=track",
            "live_url": f"https://www.railyatri.in/live-train-status/{number}" if number else "",
            "book_url": f"https://www.railyatri.in/seat-availability/{number}" if number else "",
            "food_url": (
                f"https://www.railyatri.in/buy-food-in-train?trainNo={number}&train_no={number}&train={number}"
                + (f"&from={track.get('source_code')}" if track.get("source_code") else "")
                if number
                else ""
            ),
            "irctc_food_url": (
                f"https://www.ecatering.irctc.co.in/?trainNo={number}" if number else "https://www.ecatering.irctc.co.in/"
            ),
            "pantry": bool(track.get("pantry")),
        }
    ]
    for i, stn in enumerate((track.get("stations") or [])[:40], start=2):
        items.append(
            {
                "index": i,
                "number": number,
                "name": stn.get("name") or stn.get("code") or "",
                "code": stn.get("code") or "",
                "sta": stn.get("sta") or "",
                "std": stn.get("std") or "",
                "eta": stn.get("eta") or "",
                "etd": stn.get("etd") or "",
                "delay_minutes": stn.get("delay_minutes"),
                "arrival_delay": stn.get("arrival_delay"),
                "departure_delay": stn.get("departure_delay"),
                "status": stn.get("status") or stn.get("phase") or "",
                "phase": stn.get("phase") or "",
                "platform": stn.get("platform"),
                "distance_km": stn.get("distance_km"),
                "food": bool(stn.get("food")),
                "halt": stn.get("halt"),
                "is_stop": stn.get("is_stop") is not False,
                "kind": "stop" if stn.get("is_stop") is not False else "pass",
            }
        )
    delay = track.get("delay_minutes")
    sub = "Running status · not GPS"
    if track.get("on_time"):
        sub = "On time · not GPS"
    elif delay is not None:
        sub = f"{delay}m late · not GPS"
    return {
        "type": "train_track",
        "title": f"{number} {track.get('train_name') or ''}".strip(),
        "subtitle": sub,
        "items": items,
    }


def airport_board_cards(board: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(board, dict):
        return None
    iata = str(board.get("iata") or board.get("icao") or "").upper()
    if not iata:
        return None
    deps = [r for r in (board.get("departures") or []) if isinstance(r, dict)]
    arrs = [r for r in (board.get("arrivals") or []) if isinstance(r, dict)]
    items: list[dict[str, Any]] = []
    for i, row in enumerate((deps + arrs)[:8], start=1):
        items.append(
            {
                "index": i,
                "flight_iata": row.get("flight_iata") or row.get("ident") or "",
                "airline": row.get("airline_name") or "",
                "status_label": row.get("status_label") or "",
                "other_iata": row.get("other_iata") or "",
                "dep_time": row.get("dep_time") or "",
                "arr_time": row.get("arr_time") or "",
                "date": row.get("date") or "",
                "board": "departure" if row in deps else "arrival",
            }
        )
    return {
        "type": "airport_board",
        "title": f"{board.get('name') or ''} {iata}".strip(),
        "subtitle": f"{len(deps)} dep · {len(arrs)} arr",
        "items": items or [{"index": 1, "flight_iata": iata, "airport": iata}],
        "track_path": f"/flights/track?airport={iata}",
    }


def flight_track_cards(track: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(track, dict) or not (track.get("flight_iata") or track.get("ok")):
        return None
    code = str(track.get("flight_iata") or "").upper()
    delay = track.get("delay_minutes")
    sub = track.get("status_label") or "Live status"
    if delay is not None and int(delay or 0) > 0:
        sub = f"{sub} · {delay}m late"
    route = " → ".join([x for x in (track.get("origin"), track.get("destination")) if x])
    if route:
        sub = f"{route} · {sub}"
    day = str(track.get("date") or "")
    path = f"/flights/track?flight={code}" if code else "/flights/track"
    if day:
        path += f"&date={day}"
    pos = track.get("position") if isinstance(track.get("position"), dict) else {}
    return {
        "type": "flight_track",
        "title": f"{track.get('airline_name') or track.get('airline_iata') or ''} {code}".strip(),
        "subtitle": sub,
        "items": [
            {
                "index": 1,
                "flight_iata": code,
                "flight_icao": track.get("flight_icao") or "",
                "airline": track.get("airline_name") or track.get("airline_iata") or "",
                "status": track.get("status") or "",
                "status_label": track.get("status_label") or "",
                "origin": track.get("origin") or "",
                "destination": track.get("destination") or "",
                "date": day,
                "delay_minutes": delay,
                "dep_scheduled": track.get("dep_scheduled") or "",
                "dep_estimated": track.get("dep_estimated") or "",
                "dep_actual": track.get("dep_actual") or "",
                "arr_scheduled": track.get("arr_scheduled") or "",
                "arr_estimated": track.get("arr_estimated") or "",
                "arr_actual": track.get("arr_actual") or "",
                "dep_gate": track.get("dep_gate") or "",
                "arr_gate": track.get("arr_gate") or "",
                "gps_unable": bool(track.get("gps_unable", True)),
                "lat": pos.get("lat"),
                "lon": pos.get("lon"),
                "track_path": path,
            }
        ],
    }


def route_cards(
    origin: str,
    destination: str,
    mode: str,
    items: list[dict[str, Any]],
    subtitle: str = "",
) -> dict[str, Any] | None:
    if not items:
        return None
    return {
        "type": "routes",
        "title": f"{origin} → {destination}",
        "subtitle": subtitle or mode,
        "mode": mode,
        "items": items,
    }


def hotel_cards(hotels: list[dict[str, Any]], title: str, subtitle: str) -> dict[str, Any] | None:
    if not hotels:
        return None
    return {
        "type": "hotels",
        "title": title,
        "subtitle": subtitle,
        "items": [hotel_option_to_card_item(h, index=i + 1) for i, h in enumerate(hotels)],
    }

