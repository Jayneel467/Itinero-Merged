"""
Business logic + response normalization for travel data.

Tools in llm/tools.py are thin - they just call these functions and return
plain strings for the LLM. All the "what do we do with a hotel search
result" parsing/formatting logic lives here, not in the tool layer, so it
can be reused outside the LangChain tool-calling path later (a future API
endpoint, a different agent framework, etc.) without duplicating logic.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from general_agent.exceptions import ProviderRequestError

from providers import (
    bus_provider,
    erail_provider,
    flight_track_provider,
    frankfurter_provider,
    google_maps_provider,
    railyatri_live,
    ticketmaster_provider,
    weather_provider,
)


# ---------------------------------------------------------------------------
# Exchange rates (Frankfurter)
# ---------------------------------------------------------------------------
def get_exchange_rate_summary(
    amount: float = 1,
    from_currency: str = "USD",
    to_currency: str = "INR",
) -> str:
    src = (from_currency or "USD").upper()
    dst = (to_currency or "INR").upper()
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return "Need a numeric amount to convert."
    if amt <= 0:
        return "Amount must be greater than zero."
    try:
        data = frankfurter_provider.convert_amount(amt, src, dst)
    except ProviderRequestError as e:
        return f"Could not fetch a live rate for {src}→{dst}: {e}"

    rate = data["rate"]
    result = data["result"]
    date = data.get("date") or "latest"
    if dst == "JPY":
        shown = f"{result:,.0f}"
    elif result >= 100:
        shown = f"{result:,.2f}"
    else:
        shown = f"{result:,.4f}".rstrip("0").rstrip(".")
    rate_s = f"{rate:,.6f}".rstrip("0").rstrip(".")
    return (
        f"Live mid-market rate ({date}): 1 {src} = {rate_s} {dst}. "
        f"{amt:g} {src} ≈ {shown} {dst}. "
        "Central-bank / official mid-market — not a booth or card markup. "
        "Do not invent a different rate."
    )


# ---------------------------------------------------------------------------
# Weather
# ---------------------------------------------------------------------------
def get_weather_summary(city: str) -> str:
    try:
        data = weather_provider.get_current_weather(city)
    except ProviderRequestError as e:
        return f"Could not fetch weather for '{city}': {e}"

    desc = data["weather"][0]["description"]
    temp = data["main"]["temp"]
    feels_like = data["main"]["feels_like"]
    humidity = data["main"]["humidity"]
    return (
        f"Weather in {city}: {desc}, {temp}°C (feels like {feels_like}°C), "
        f"humidity {humidity}%."
    )


# ---------------------------------------------------------------------------
# NOTE: the old direct search_hotels()/search_flights() tool implementations
# that used to live here were removed — general_agent/llm/tools.py's
# search_flights/search_hotels tools now call
# services/quick_search_service.py instead (which reuses ITINERARY_AGENT's
# own FlightAgent/HotelAgent search code, plus resolves city names to the
# IATA/country codes LiteAPI's real endpoints require — see
# services/location_resolver.py). The helpers below (_format_hhmm,
# _format_duration, _parse_journey) are kept: ITINERARY_AGENT's own
# flight_agent.py imports _parse_journey directly from this module, so it
# must stay even though this file's own former callers are gone.
# ---------------------------------------------------------------------------

def _format_hhmm(iso_time: str) -> str:
    """Extract HH:MM from an ISO datetime string like '2026-08-15T23:35:00'."""
    try:
        return iso_time[11:16]
    except (IndexError, TypeError):
        return iso_time or "?"


def _format_duration(minutes: int) -> str:
    """Convert total minutes to a readable string like '2h 10m'."""
    if not minutes:
        return ""
    h, m = divmod(int(minutes), 60)
    if h and m:
        return f"{h}h {m}m"
    return f"{h}h" if h else f"{m}m"


def _parse_journey(journey: dict, currency: str) -> Optional[dict]:
    """
    Parse one journey object from the real LiteAPI response shape:
      journey.cheapestOffer.pricing.display.total  -> price
      journey.segments[]                           -> airline, times, stops
      journey.totalDuration.minutes                -> flight duration
    Returns None if the journey can't be parsed (missing price).
    """
    cheapest = journey.get("cheapestOffer") or {}
    display = cheapest.get("pricing", {}).get("display", {})
    price = display.get("total")
    if price is None:
        return None

    segments = journey.get("segments") or []
    if not segments:
        return None

    first = segments[0]
    last = segments[-1]
    carrier = first.get("carrier", {})
    flight = first.get("flight", {})

    airline_name = carrier.get("marketingName", "")
    airline_code = carrier.get("marketingCode", "")
    flight_number = flight.get("marketingNumber", "")
    flight_code = f"{airline_code}{flight_number}".strip()
    fake_air = re.search(
        r"nuit[eé]e|nuitee|\bsandbox\b|test\s*air|dummy\s*air",
        f"{airline_name} {airline_code}",
        re.I,
    )
    if fake_air or str(airline_code).upper() == "ND" or str(flight_code).upper().startswith("ND"):
        return None

    dep_time = _format_hhmm(first.get("departureTime", ""))
    arr_time = _format_hhmm(last.get("arrivalTime", ""))
    origin_code = first.get("originCode", "")
    dest_code = last.get("destinationCode", "")

    duration_mins = journey.get("totalDuration", {}).get("minutes")
    duration_str = _format_duration(duration_mins)

    stops = len(segments) - 1
    stops_str = "Direct" if stops == 0 else f"{stops} stop{'s' if stops > 1 else ''}"

    baggage = cheapest.get("baggage", {})
    has_checked = baggage.get("hasCheckedBag", False)

    terms = cheapest.get("terms", {})
    refundable = terms.get("refundable")

    fare_family = cheapest.get("fare", {}).get("family", "")

    return {
        "price": price,
        "currency": display.get("currency", currency),
        "airline": airline_name,
        "flight_code": flight_code,
        "dep_time": dep_time,
        "arr_time": arr_time,
        "origin": origin_code,
        "dest": dest_code,
        "duration": duration_str,
        "stops": stops_str,
        "has_checked_bag": has_checked,
        "refundable": refundable,
        "fare_family": fare_family,
        "offer_id": cheapest.get("offerId") or cheapest.get("id") or journey.get("id"),
    }


# ---------------------------------------------------------------------------
# Route / distance (Google Routes API — drive + full public transit)
# ---------------------------------------------------------------------------
_CITY_TZ = {
    "mumbai": "Asia/Kolkata", "bombay": "Asia/Kolkata", "delhi": "Asia/Kolkata",
    "new delhi": "Asia/Kolkata", "bangalore": "Asia/Kolkata", "bengaluru": "Asia/Kolkata",
    "hyderabad": "Asia/Kolkata", "chennai": "Asia/Kolkata", "kolkata": "Asia/Kolkata",
    "calcutta": "Asia/Kolkata", "pune": "Asia/Kolkata", "ahmedabad": "Asia/Kolkata",
    "surat": "Asia/Kolkata", "jaipur": "Asia/Kolkata", "goa": "Asia/Kolkata",
    "kochi": "Asia/Kolkata", "cochin": "Asia/Kolkata", "lucknow": "Asia/Kolkata",
    "india": "Asia/Kolkata", "gujarat": "Asia/Kolkata", "maharashtra": "Asia/Kolkata",
    "dubai": "Asia/Dubai", "abu dhabi": "Asia/Dubai", "uae": "Asia/Dubai",
    "doha": "Asia/Qatar", "qatar": "Asia/Qatar",
    "riyadh": "Asia/Riyadh", "jeddah": "Asia/Riyadh",
    "singapore": "Asia/Singapore", "bangkok": "Asia/Bangkok", "thailand": "Asia/Bangkok",
    "bali": "Asia/Makassar", "jakarta": "Asia/Jakarta",
    "hong kong": "Asia/Hong_Kong", "tokyo": "Asia/Tokyo", "osaka": "Asia/Tokyo",
    "seoul": "Asia/Seoul", "beijing": "Asia/Shanghai", "shanghai": "Asia/Shanghai",
    "new york": "America/New_York", "nyc": "America/New_York", "boston": "America/New_York",
    "state college": "America/New_York", "penn state": "America/New_York",
    "washington": "America/New_York", "miami": "America/New_York", "atlanta": "America/New_York",
    "chicago": "America/Chicago", "dallas": "America/Chicago", "houston": "America/Chicago",
    "austin": "America/Chicago", "denver": "America/Denver",
    "los angeles": "America/Los_Angeles", "san francisco": "America/Los_Angeles",
    "seattle": "America/Los_Angeles", "las vegas": "America/Los_Angeles",
    "london": "Europe/London", "manchester": "Europe/London", "uk": "Europe/London",
    "paris": "Europe/Paris", "berlin": "Europe/Berlin", "munich": "Europe/Berlin",
    "frankfurt": "Europe/Berlin", "amsterdam": "Europe/Amsterdam",
    "rome": "Europe/Rome", "milan": "Europe/Rome",
    "madrid": "Europe/Madrid", "barcelona": "Europe/Madrid",
    "lisbon": "Europe/Lisbon", "dublin": "Europe/Dublin",
    "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne",
    "auckland": "Pacific/Auckland",
    "toronto": "America/Toronto", "vancouver": "America/Vancouver", "montreal": "America/Toronto",
}

_MODE_ALIAS = {
    "DRIVE": ("DRIVE", None),
    "DRIVING": ("DRIVE", None),
    "CAR": ("DRIVE", None),
    "TAXI": ("DRIVE", None),
    "ROAD": ("DRIVE", None),
    "WALK": ("WALK", None),
    "WALKING": ("WALK", None),
    "BICYCLE": ("BICYCLE", None),
    "BIKE": ("BICYCLE", None),
    "TRANSIT": ("TRANSIT", None),
    "PUBLIC": ("TRANSIT", None),
    "PUBLIC_TRANSIT": ("TRANSIT", None),
    "BUS": ("TRANSIT", ["BUS"]),
    "SUBWAY": ("TRANSIT", ["SUBWAY"]),
    "METRO": ("TRANSIT", ["SUBWAY"]),
    "TUBE": ("TRANSIT", ["SUBWAY"]),
    "TRAIN": ("TRANSIT", ["TRAIN", "RAIL"]),
    "RAIL": ("TRANSIT", ["RAIL"]),
    "COMMUTER": ("TRANSIT", ["TRAIN", "RAIL"]),
    "LIGHT_RAIL": ("TRANSIT", ["LIGHT_RAIL"]),
    "TRAM": ("TRANSIT", ["LIGHT_RAIL"]),
    "FERRY": ("TRANSIT", None),
}


def _guess_tz(place: str) -> str:
    raw = place or ""
    if re.search(r"[\u0900-\u097F\u0A80-\u0AFF]", raw):
        return "Asia/Kolkata"
    p = raw.lower()
    try:
        parent = bus_provider.parent_city(raw)
        if parent:
            p = f"{p} {parent.lower()}"
    except Exception:
        pass
    best, tz = "", ""
    for city, zone in _CITY_TZ.items():
        if city in p and len(city) > len(best):
            best, tz = city, zone
    if tz:
        return tz
    if any(x in p for x in ("india", "bharat", "gujarat", "kerala", "rajasthan", "tamil")):
        return "Asia/Kolkata"
    return "UTC"


def _region_code(origin: str, destination: str, tz_name: str) -> str | None:
    blob = f"{origin} {destination} {tz_name}".lower()
    if "kolkata" in tz_name.lower() or any(
        x in blob for x in ("india", "mumbai", "delhi", "surat", "bengaluru", "ahmedabad")
    ):
        return "IN"
    if "london" in tz_name.lower() or " united kingdom" in blob or blob.endswith(" uk"):
        return "GB"
    return None


def _to_rfc3339(when: str, origin: str) -> tuple[str | None, str]:
    text = (when or "").strip()
    if not text or text.lower() in ("now", "asap", "immediately"):
        return None, "using current time" if text else ""
    try:
        from dateutil import parser as date_parser

        dt = date_parser.parse(text, fuzzy=True)
    except Exception:
        return None, f"could not parse '{text}' — Google used now"

    tz_name = _guess_tz(origin)
    if dt.tzinfo is None:
        try:
            dt = dt.replace(tzinfo=ZoneInfo(tz_name))
            note = f"naive time as {tz_name}"
        except Exception:
            dt = dt.replace(tzinfo=timezone.utc)
            note = "naive time as UTC"
    else:
        note = ""

    utc = dt.astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if utc < now - timedelta(days=7):
        return None, f"{text} is >7 days past — Google transit used now"
    if utc > now + timedelta(days=100):
        return None, f"{text} is >100 days ahead — Google transit used now"
    rfc = utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    local = dt.strftime("%Y-%m-%d %H:%M %Z")
    extra = f"{note}; " if note else ""
    return rfc, f"{extra}sending {rfc} (local {local})"


def _duration_label(obj: dict[str, Any] | None) -> str:
    if not isinstance(obj, dict):
        return ""
    loc = ((obj.get("localizedValues") or {}).get("duration") or {}).get("text")
    if loc:
        return str(loc)
    raw = str(obj.get("duration") or obj.get("staticDuration") or "")
    if raw.endswith("s"):
        try:
            secs = int(float(raw[:-1]))
        except ValueError:
            return raw
        if secs < 60:
            return f"{secs}s"
        mins, _ = divmod(secs, 60)
        hours, minutes = divmod(mins, 60)
        if hours and minutes:
            return f"{hours}h {minutes}m"
        if hours:
            return f"{hours}h"
        return f"{minutes} min"
    return raw


def _distance_label(obj: dict[str, Any] | None) -> str:
    if not isinstance(obj, dict):
        return ""
    loc = ((obj.get("localizedValues") or {}).get("distance") or {}).get("text")
    if loc:
        return str(loc)
    meters = obj.get("distanceMeters")
    try:
        m = float(meters)
    except (TypeError, ValueError):
        return ""
    if m <= 0:
        return ""
    if m < 1000:
        return f"{int(m)} m"
    return f"{m / 1000:.1f} km"


def _fare_label(route: dict[str, Any]) -> str:
    loc = ((route.get("localizedValues") or {}).get("transitFare") or {}).get("text")
    if loc:
        return str(loc)
    fare = (route.get("travelAdvisory") or {}).get("transitFare") or {}
    if not isinstance(fare, dict):
        return ""
    code = str(fare.get("currencyCode") or "").upper()
    try:
        units = float(fare.get("units") or 0)
    except (TypeError, ValueError):
        units = 0.0
    try:
        nanos = int(fare.get("nanos") or 0)
    except (TypeError, ValueError):
        nanos = 0
    amount = units + nanos / 1_000_000_000
    if amount <= 0 and not code:
        return ""
    if code == "INR":
        return f"₹{amount:,.0f}" if amount >= 10 else f"₹{amount:,.2f}"
    if code:
        return f"{code} {amount:,.2f}".rstrip("0").rstrip(".")
    return ""


def _format_transit_step(step: dict[str, Any]) -> str | None:
    travel = str(step.get("travelMode") or "").upper()
    dur = _duration_label(step)
    dist = _distance_label(step)
    inst = str(
        ((step.get("navigationInstruction") or {}).get("instructions") or "")
    ).strip()
    td = step.get("transitDetails") if isinstance(step.get("transitDetails"), dict) else None

    if td:
        stops = td.get("stopDetails") or {}
        locv = td.get("localizedValues") or {}
        dep_stop = str(((stops.get("departureStop") or {}).get("name") or "")).strip()
        arr_stop = str(((stops.get("arrivalStop") or {}).get("name") or "")).strip()
        dep_t = str(((locv.get("departureTime") or {}).get("time") or {}).get("text") or "").strip()
        arr_t = str(((locv.get("arrivalTime") or {}).get("time") or {}).get("text") or "").strip()
        line = td.get("transitLine") or {}
        vehicle = str(((line.get("vehicle") or {}).get("name") or {}).get("text") or "").strip()
        vtype = str((line.get("vehicle") or {}).get("type") or "").replace("_", " ").title()
        name = str(line.get("name") or line.get("nameShort") or "").strip()
        headsign = str(td.get("headsign") or "").strip()
        stop_count = td.get("stopCount")
        agency = ""
        ags = line.get("agencies") or []
        if ags and isinstance(ags[0], dict):
            agency = str(ags[0].get("name") or "").strip()
        label = " · ".join(p for p in ((vtype or vehicle), name) if p) or "Transit"
        if headsign:
            label += f" toward {headsign}"
        lines = [f"  {label}"]
        if dep_stop or arr_stop or dep_t or arr_t:
            when = f"{dep_t}→{arr_t}" if (dep_t or arr_t) else ""
            lines.append(
                f"    {dep_stop or '?'} → {arr_stop or '?'}"
                + (f" · {when}" if when else "")
            )
        extra = []
        if stop_count:
            try:
                n_stops = int(stop_count)
            except (TypeError, ValueError):
                n_stops = 0
            extra.append("1 stop" if n_stops == 1 else f"{n_stops} stops")
        if dur:
            extra.append(dur)
        if agency:
            extra.append(agency)
        if extra:
            lines.append(f"    {' · '.join(extra)}")
        return "\n".join(lines)

    if travel in {"WALK", "WALKING"}:
        bits = [p for p in (dur, dist) if p]
        head = "  Walk" + (f" {' · '.join(bits)}" if bits else "")
        if inst and inst.lower() not in {"walk", "walking"}:
            return f"{head} · {inst}" if bits else f"  Walk · {inst}"
        return head if bits else None

    if inst or dur:
        mode_l = (travel or "Leg").replace("_", " ").title()
        return f"  {mode_l}" + (f" {dur}" if dur else "") + (f" · {inst}" if inst else "")
    return None


_WALK_KEEP = re.compile(r"entrance|exit|station|stop|destination|take |walk to", re.I)


def _coalesce_steps(steps: list) -> list[dict[str, Any]]:
    """Merge micro walk-turn steps; keep entrance/exit + transit legs."""
    out: list[dict[str, Any]] = []
    walk_inst: list[str] = []

    def flush_walk() -> None:
        nonlocal walk_inst
        if not walk_inst:
            return
        useful = [i for i in walk_inst if _WALK_KEEP.search(i)]
        text = useful[-1] if useful else walk_inst[-1]
        out.append({"travelMode": "WALK", "navigationInstruction": {"instructions": text}})
        walk_inst = []

    for step in steps:
        if not isinstance(step, dict):
            continue
        mode = str(step.get("travelMode") or "").upper()
        if mode in {"WALK", "WALKING"} and not step.get("transitDetails"):
            inst = str(
                ((step.get("navigationInstruction") or {}).get("instructions") or "")
            ).strip()
            if inst:
                walk_inst.append(inst.split("\n")[0].strip())
            continue
        flush_walk()
        out.append(step)
    flush_walk()
    return out


def _format_one_route(route: dict[str, Any], index: int, total: int) -> str:
    dur = _duration_label(route)
    dist = _distance_label(route)
    fare = _fare_label(route)
    prefix = f"Option {index}" if total > 1 else "Route"
    head = f"{prefix} — {dist or '?'} · {dur or '?'}"
    if fare:
        head += f" · fare {fare} (Google, when all legs priced)"
    lines = [head]
    step_lines: list[str] = []
    for leg in route.get("legs") or []:
        if not isinstance(leg, dict):
            continue
        for step in _coalesce_steps(leg.get("steps") or []):
            formatted = _format_transit_step(step)
            if formatted:
                step_lines.append(formatted)
    if step_lines:
        lines.extend(step_lines[:14])
        if len(step_lines) > 14:
            lines.append(f"  … +{len(step_lines) - 14} more steps")
    return "\n".join(lines)


_DAY_SUN_FIRST = ("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")


def _hhmm_label(raw: str) -> str:
    text = (raw or "").strip().replace(".", ":")
    if re.fullmatch(r"\d{1,2}:\d{2}", text):
        h, m = text.split(":")
        return f"{int(h):02d}:{m}"
    return text or "?"


def _dur_label(raw: str) -> str:
    text = (raw or "").strip().replace(":", ".")
    m = re.fullmatch(r"(\d{1,2})\.(\d{2})", text)
    if not m:
        return text
    h, mins = int(m.group(1)), int(m.group(2))
    if h and mins:
        return f"{h}h {mins}m"
    if h:
        return f"{h}h"
    return f"{mins} min"


def _rundays_label(mask: str) -> str:
    m = (mask or "")[:7]
    if len(m) < 7:
        return ""
    if m == "1111111":
        return "Daily"
    days = [name for bit, name in zip(m, _DAY_SUN_FIRST) if bit == "1"]
    return ",".join(days)


def _dep_minutes(raw: str) -> int | None:
    text = _hhmm_label(raw)
    if not re.fullmatch(r"\d{2}:\d{2}", text):
        return None
    h, m = text.split(":")
    return int(h) * 60 + int(m)


def _runs_on_weekday(mask: str, weekday_sun0: int) -> bool:
    m = (mask or "")[:7]
    if len(m) < 7 or weekday_sun0 < 0 or weekday_sun0 > 6:
        return True
    return m[weekday_sun0] == "1"


_TRAIN_WINDOWS = {
    "morning": (5 * 60, 12 * 60),
    "afternoon": (12 * 60, 17 * 60),
    "evening": (17 * 60, 21 * 60),
    "night": None,
}

_WINDOW_RE = [
    (re.compile(r"\b(afternoon|after\s*noon|dopahar|dupahar|बपोर|बपौर|બપોર|lunch)\b", re.I), "afternoon"),
    (re.compile(r"\b(evening|sanj|saanj|સાંજ|शाम|shaam)\b", re.I), "evening"),
    (re.compile(r"\b(morning|savar|સવારે?|सुबह|subah)\b", re.I), "morning"),
    (re.compile(r"\b(night|late\s*night|raat|રાત્ર?ે?|रात)\b", re.I), "night"),
]


def _parse_train_when(when: str, window: str = "") -> tuple[datetime, str, str | None]:
    """Return (travel_day IST, day_note, window_id)."""
    ist = ZoneInfo("Asia/Kolkata")
    travel_day = datetime.now(ist)
    day_note = "today"
    blob = f"{when or ''} {window or ''}".strip().lower()
    win: str | None = None
    for rx, label in _WINDOW_RE:
        if rx.search(blob):
            win = label
            break
    explicit = (window or "").strip().lower()
    if explicit in ("morning", "afternoon", "evening", "night"):
        win = explicit

    when_l = (when or "").strip().lower()
    when_l = re.sub(
        r"\b(afternoon|after\s*noon|evening|morning|night|dopahar|dupahar|"
        r"સવારે?|બપોર|સાંજ|રાત્ર?ે?|सुबह|शाम|रात|lunch)\b",
        " ",
        when_l,
        flags=re.I,
    ).strip()
    if when_l in ("tomorrow", "tommorow", "kal", "kaal", "કાલે", "कल"):
        travel_day = travel_day + timedelta(days=1)
        day_note = travel_day.strftime("%a %d %b")
    elif when_l and when_l not in ("now", "today", "tonight", ""):
        try:
            from dateutil import parser as date_parser

            parsed = date_parser.parse(when_l, fuzzy=True, default=datetime.now(ist).replace(tzinfo=None))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=ist)
            travel_day = parsed.astimezone(ist)
            day_note = travel_day.strftime("%a %d %b")
        except Exception:
            day_note = "today"
    return travel_day, day_note, win


def _in_train_window(mins: int | None, window: str | None) -> bool:
    if mins is None or not window:
        return True
    if window == "night":
        return mins >= 21 * 60 or mins < 5 * 60
    bounds = _TRAIN_WINDOWS.get(window)
    if not bounds:
        return True
    lo, hi = bounds
    return lo <= mins < hi


def _irctc_book_url(number: str, src: str, dst: str, ymd: str = "", klass: str = "") -> str:
    """IRCTC search fallback. NGET ignores most query params — prefer partner checkout URL."""
    params: dict[str, str] = {}
    if number:
        params["trainNo"] = number
    if src:
        params["fromStnCode"] = src
        params["from"] = src
    if dst:
        params["toStnCode"] = dst
        params["to"] = dst
    ymd = str(ymd or "").strip()[:10]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", ymd):
        y, m, d = ymd.split("-")
        params["doj"] = f"{d}/{m}/{y}"
        params["journeyDate"] = f"{d}-{m}-{y}"
    if klass:
        params["classType"] = str(klass).upper()
    q = urlencode(params)
    return f"https://www.irctc.co.in/nget/train-search?{q}" if q else "https://www.irctc.co.in/nget/train-search"


def _railyatri_book_url(number: str, src: str, dst: str, ymd: str = "", klass: str = "") -> str:
    """Partner checkout for this corridor + train. Do not name the partner in UI."""
    src_c = str(src or "").strip().upper()
    dst_c = str(dst or "").strip().upper()
    ymd = str(ymd or "").strip()[:10]
    dmy = ""
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", ymd):
        y, m, d = ymd.split("-")
        dmy = f"{d}-{m}-{y}"
    if src_c and dst_c and dmy and number and klass:
        qta = "GN"
        return (
            f"https://www.confirmtkt.com/rbooking/seat-availability/"
            f"{number}/{src_c}/{dst_c}/{str(klass).upper()}/{qta}/{dmy}"
        )
    if src_c and dst_c and dmy:
        return f"https://www.confirmtkt.com/rbooking/trains/from/{src_c}/to/{dst_c}/{dmy}"
    if not number:
        return ""
    params = {}
    if src_c:
        params["from"] = src_c
    if dst_c:
        params["to"] = dst_c
    if dmy:
        params["date"] = dmy
    q = urlencode(params)
    return f"https://www.railyatri.in/seat-availability/{number}" + (f"?{q}" if q else "")


def _station_code(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    m = re.search(r"\(([A-Za-z]{2,5})\)\s*$", raw)
    if m:
        return m.group(1).upper()
    if re.fullmatch(r"[A-Za-z]{2,5}", raw):
        return raw.upper()
    return ""


def _irctc_food_url(number: str = "", station: str = "", pnr: str = "", ymd: str = "") -> str:
    """Official IRCTC eCatering (Food on Track)."""
    params: dict[str, str] = {}
    digits = re.sub(r"\D", "", str(pnr or ""))
    if re.fullmatch(r"\d{10}", digits):
        params["pnr"] = digits
    num = re.sub(r"\D", "", str(number or ""))
    if num:
        params["trainNo"] = num
    stn = _station_code(station) or str(station or "").strip().upper()
    if re.fullmatch(r"[A-Z]{2,5}", stn):
        params["stnCode"] = stn
    ymd = str(ymd or "").strip()[:10]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", ymd):
        y, m, d = ymd.split("-")
        dmy = f"{d}-{m}-{y}"
        params["doj"] = dmy
        params["date"] = dmy
    q = urlencode(params)
    return f"https://www.ecatering.irctc.co.in/?{q}" if q else "https://www.ecatering.irctc.co.in/"


def _train_food_url(number: str = "", src: str = "", dst: str = "", ymd: str = "", pnr: str = "") -> str:
    """Food-on-train handoff. PNR → partner kitchens; otherwise IRCTC eCatering."""
    digits = re.sub(r"\D", "", str(pnr or ""))
    if re.fullmatch(r"\d{10}", digits):
        return f"https://www.railyatri.in/link-food-in-train?pnr={digits}"
    return _irctc_food_url(number=number, station=src or dst, pnr="", ymd=ymd)


def _row_to_train(
    row: dict[str, Any],
    src_code: str,
    dst_code: str,
    *,
    in_window: bool,
    date_ymd: str = "",
) -> dict[str, Any]:
    dep = _hhmm_label(str(row.get("dep") or ""))
    arr = _hhmm_label(str(row.get("arr") or ""))
    number = str(row.get("number") or "").strip()
    src = str(row.get("from_code") or src_code).upper()
    dst = str(row.get("to_code") or dst_code).upper()
    rundays = str(row.get("rundays") or "")[:7]
    return {
        "number": number,
        "name": str(row.get("name") or f"Train {number}").strip(),
        "from_code": src,
        "to_code": dst,
        "from_name": str(row.get("from_name") or ""),
        "to_name": str(row.get("to_name") or ""),
        "dep": dep,
        "arr": arr,
        "duration": _dur_label(str(row.get("duration") or "")),
        "days": _rundays_label(rundays),
        "rundays": rundays,
        "kind": str(row.get("kind") or "").strip(),
        "in_window": in_window,
        "date": date_ymd or "",
        "book_url": _railyatri_book_url(number, src, dst, date_ymd),
        "live_url": f"https://www.railyatri.in/live-train-status/{number}" if number else "",
        "irctc_url": _irctc_book_url(number, src, dst, date_ymd),
        "schedule_url": (
            f"https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.html?trainNo={number}"
            if number
            else ""
        ),
        "erail_url": f"https://erail.in/train-enquiry/{number}" if number else "",
        "food_url": _train_food_url(number, src, dst, date_ymd),
        "irctc_food_url": _irctc_food_url(number, src),
    }


def search_india_trains_structured(
    origin: str,
    destination: str,
    when: str = "",
    window: str = "",
    limit: int = 6,
) -> dict[str, Any]:
    """Live IRCTC trains via eRail. Returns {text, trains, cards}.

    `limit=6` is for Vero voice/chat. The left /trains page passes a high
    limit so the full corridor timetable can render.
    """
    from services.card_mapping import train_cards
    from services.india_ground import resolve_rail_station

    origin = (origin or "").strip()
    destination = (destination or "").strip()
    empty: dict[str, Any] = {"text": "", "trains": [], "cards": None}
    if not origin or not destination:
        return {**empty, "text": "Need origin and destination for trains (e.g. Surat → Baroda)."}

    src = resolve_rail_station(origin)
    dst = resolve_rail_station(destination)
    if not src or not dst:
        missing = origin if not src else destination
        return {
            **empty,
            "text": (
                f"Could not map '{missing}' to an Indian Rail station code. "
                "Type the city or code (Surat, Barmer, Baroda/Vadodara, Ahmedabad/ADI). "
                "Do not invent a train number."
            ),
        }
    if src[0] == dst[0]:
        return {
            **empty,
            "text": f"{src[1]} ({src[0]}) is the same station as the destination — not an intercity train.",
        }

    travel_day, day_note, win = _parse_train_when(when, window)
    try:
        rows = erail_provider.trains_between(src[0], dst[0])
    except ProviderRequestError as exc:
        return {**empty, "text": f"Train lookup failed: {exc}. Do not invent train numbers."}

    if not rows:
        return {
            **empty,
            "text": (
                f"No trains found {src[1]} ({src[0]}) → {dst[1]} ({dst[0]}). "
                "Do not invent a train."
            ),
        }

    weekday = (travel_day.weekday() + 1) % 7
    is_today = day_note == "today" or str(day_note).startswith("today")
    now_mins = travel_day.hour * 60 + travel_day.minute if is_today else -1
    running = [r for r in rows if _runs_on_weekday(str(r.get("rundays") or ""), weekday)]
    pool = running or rows

    def sort_key(row: dict[str, Any]) -> tuple[int, str]:
        mins = _dep_minutes(str(row.get("dep") or ""))
        return (mins if mins is not None else 99_999, str(row.get("number") or ""))

    pool_sorted = sorted(pool, key=sort_key)
    if now_mins >= 0:
        later = [
            r for r in pool_sorted if (_dep_minutes(str(r.get("dep") or "")) or -1) >= now_mins - 20
        ]
        pool_sorted = later or pool_sorted

    matched = [
        r for r in pool_sorted if _in_train_window(_dep_minutes(str(r.get("dep") or "")), win)
    ]
    full_list = isinstance(limit, int) and (limit <= 0 or limit > 12)
    if not win and not full_list:
        daytime = []
        for r in pool_sorted:
            m = _dep_minutes(str(r.get("dep") or ""))
            if m is not None and 6 * 60 <= m < 22 * 60:
                daytime.append(r)
        matched = daytime or pool_sorted

    if full_list:
        show_rows = matched if win else pool_sorted
        if limit and limit > 0:
            show_rows = show_rows[:limit]
    else:
        show_rows = matched[: max(1, int(limit or 6))]
        if win and not show_rows:
            lo, hi = _TRAIN_WINDOWS.get(win) or (12 * 60, 17 * 60)
            mid = 23 * 60 if win == "night" else (lo + hi) // 2

            def dist(row: dict[str, Any]) -> int:
                m = _dep_minutes(str(row.get("dep") or ""))
                if m is None:
                    return 99_999
                if win == "night":
                    return min(abs(m - 23 * 60), abs((m + 24 * 60) - 23 * 60), abs(m - 2 * 60))
                return abs(m - mid)

            show_rows = sorted(pool_sorted, key=dist)[:3]

    date_ymd = travel_day.strftime("%Y-%m-%d")
    trains = [
        _row_to_train(
            r,
            src[0],
            dst[0],
            in_window=_in_train_window(_dep_minutes(str(r.get("dep") or "")), win) if win else True,
            date_ymd=date_ymd,
        )
        for r in show_rows
    ]
    corridor = (
        f"{src[1]} ({src[0]}) → {dst[1]} ({dst[0]})"
        f"{' · Baroda = Vadodara Jn' if dst[0] == 'BRC' else ''}"
    )
    win_label = {
        "morning": "morning (05:00–12:00)",
        "afternoon": "afternoon (12:00–17:00)",
        "evening": "evening (17:00–21:00)",
        "night": "night (21:00–05:00)",
    }.get(win or "", "")

    speak = ", ".join(f"{t['name']} at {t['dep']}" for t in trains[:2]) or "none nearby"
    if win and not matched:
        text = (
            f"No {win} trains {corridor} · {day_note} IST. Nearest: {speak}. "
            "Left page opens the timetable — do NOT dump trains in chat. "
            "Speak 1 sentence + ask if morning/evening is ok. Book on IRCTC. Never invent a number."
        )
    else:
        extra = f" ({win_label})" if win_label else ""
        text = (
            f"{len(trains)} train(s){extra} {corridor} · {day_note} IST. Best to mention: {speak}. "
            "Left Itinero trains page shows the list — do NOT re-list them in chat. "
            "Voice: 1–2 names + times only. Not waitlist. Never invent a number."
        )

    cards = train_cards(
        trains,
        title=f"Trains {src[0]} → {dst[0]}",
        subtitle=f"{day_note} IST" + (f" · {win}" if win else ""),
    )
    left_nav = {
        "type": "search_trains",
        "origin": src[1],
        "destination": dst[1],
        "from_code": src[0],
        "to_code": dst[0],
        "when": when or day_note,
        "window": win or "",
        "date": travel_day.strftime("%Y-%m-%d"),
    }
    return {
        "text": text,
        "trains": trains,
        "cards": cards,
        "left_nav": left_nav,
        "from_code": src[0],
        "to_code": dst[0],
        "from_name": src[1],
        "to_name": dst[1],
        "date": date_ymd,
        "total_found": len(pool_sorted),
    }


def search_india_trains_summary(
    origin: str,
    destination: str,
    when: str = "",
    window: str = "",
) -> str:
    """String wrapper for get_route / older callers."""
    return search_india_trains_structured(origin, destination, when, window)["text"]


def search_india_buses_structured(
    origin: str,
    destination: str,
    when: str = "",
    window: str = "",
    limit: int = 8,
) -> dict[str, Any]:
    """Live buses. Intercity coaches OR same-city Sitilink. Never invent operator or fare."""
    from services.card_mapping import bus_cards

    o_raw = bus_provider.normalize_place(origin)
    d_raw = bus_provider.normalize_place(destination)
    local = bus_provider.is_local_city_bus(o_raw, d_raw)
    if d_raw and not o_raw:
        inferred = bus_provider.default_local_origin(d_raw)
        if inferred:
            o_raw = inferred
            local = True
    o = o_raw if local else bus_provider.canonical_city(o_raw)
    d = d_raw if local else bus_provider.canonical_city(d_raw)
    empty: dict[str, Any] = {"text": "", "buses": [], "cards": None, "local": local}
    if not o or not d:
        return {
            **empty,
            "text": (
                "Need origin and destination for buses. "
                "City/campus: name the stop or building (HUB → Pollock Commons, Adajan → Surat station). "
                "Intercity: Surat → Vadodara or New York → State College."
            ),
        }
    if not local and o.lower() == d.lower():
        return {
            **empty,
            "text": (
                f"{o} is the same city as the destination — not an intercity bus. "
                "For Sitilink / city bus name the neighborhood and station "
                "(e.g. Adajan → Surat Railway Station)."
            ),
        }

    travel_day, day_note, win = _parse_train_when(when, window)
    try:
        rows = bus_provider.search_intercity_buses(o_raw if local else o, d_raw if local else d, travel_day, window=win or "")
    except ProviderRequestError as exc:
        return {**empty, "text": f"Bus lookup failed: {exc}. Do not invent an operator or fare."}

    if win:
        rows = [
            r
            for r in rows
            if _in_train_window(_dep_minutes(str(r.get("dep") or "")), win)
        ] or rows

    cap = len(rows) if isinstance(limit, int) and (limit <= 0 or limit > 40) else max(1, int(limit or 8))
    buses = []
    for r in rows[:cap]:
        item = dict(r)
        item["in_window"] = _in_train_window(_dep_minutes(str(r.get("dep") or "")), win) if win else True
        buses.append(item)

    date_ymd = travel_day.strftime("%Y-%m-%d")
    region = bus_provider.route_region(o, d)
    tz_note = {"IN": "IST", "US": "ET", "EU": "local"}.get(region, "local")
    nearby = next((b.get("from_stop") for b in buses if b.get("from_stop")), "")
    other_stops = []
    for b in buses:
        st = (b.get("from_stop") or "").strip()
        if st and st.lower() != nearby.lower() and st not in other_stops:
            other_stops.append(st)
    def _line(b: dict[str, Any]) -> str:
        return str(b.get("name") or b.get("operator") or "Bus").strip()

    speak_ops = ", ".join(
        f"{_line(b)} at {b.get('dep')}"
        + (f" from {b.get('from_stop')}" if b.get("from_stop") else "")
        + (
            f" ₹{int(b['fare'])}"
            if isinstance(b.get("fare"), (int, float)) and str(b.get("fare_currency") or b.get("currency") or "").upper() == "INR"
            else (f" {b.get('fare')} {b.get('fare_currency') or ''}".strip() if isinstance(b.get("fare"), (int, float)) else "")
        )
        for b in buses[:2]
        if b.get("dep")
    ) or "none nearby"
    upcoming = [str(b.get("dep")) for b in buses[:4] if b.get("dep")]
    user_message = ""
    if not buses:
        user_message = (
            f"No live public transit found for {o} → {d} right now."
            if local
            else f"No live coaches found for {o} → {d} on this date. Open partner checkout for this corridor."
        )
        text = (
            f"No live transit found {o} → {d} · {day_note} {tz_note}"
            + (f" ({win})" if win else "")
            + ". Do not invent an operator, stop name, or fare. Left Buses page can still open this corridor."
        )
    elif local:
        extra = f" · {win}" if win else ""
        hood = "Adajan Gam" if str(o).lower().startswith("adajan") else o
        walk = next((b.get("walk_to_stop") for b in buses if b.get("walk_to_stop")), "")
        first = next((b for b in buses if b.get("dep")), buses[0])
        line = _line(first)
        vtype = str(first.get("vehicle_type") or "").upper()
        walk_only = vtype == "WALK"
        ferryish = vtype in {"FERRY", "BOAT"} or "ferry" in str(first.get("vehicle") or "").lower()
        if walk_only:
            lead = f"SPEAK FIRST — about a {first.get('duration') or 'short'} walk {o} → {d}. "
        elif ferryish and not first.get("dep"):
            lead = (
                f"SPEAK FIRST — take the ferry toward {first.get('to_stop') or d}. "
                "Live boat times are on Google Maps — do not invent a sailing. "
            )
        elif not first.get("dep"):
            lead = f"SPEAK FIRST — open live transit to {first.get('to_stop') or d} on Google Maps. "
        else:
            lead = (
                f"SPEAK FIRST — take {line} from {first.get('from_stop') or nearby or hood} "
                f"at {first.get('dep')}. "
            )
        text = (
            lead
            + (f"Upcoming: {', '.join(upcoming[1:4])}. " if len(upcoming) > 1 else "")
            + f"Ride to {first.get('to_stop') or d}. "
            f"{len(buses)} transit option(s){extra} {o} → {d} · {day_note} {tz_note}. "
            f"Best to mention: {speak_ops}. "
            + (f"Walk to stop: {walk}. " if walk else "")
            + "This is Google Maps public transit (bus / metro / tram / rail / ferry) — not an intercity Volvo. "
            "Left Itinero buses page shows the list. Voice: say the EXACT line name + stop + time. "
            "Never invent a fare or bus number. Never say you cannot search buses. "
            "If they ask 'near my home / nearby / which bus', repeat that line and stop."
        )
    else:
        extra = f" · {win}" if win else ""
        coaches = sum(1 for b in buses if str(b.get("kind") or "") == "coach" or str(b.get("vehicle_type") or "").upper() == "COACH")
        text = (
            f"{len(buses)} bus(es){extra} {o} → {d} · {day_note} {tz_note}"
            + (f" · {coaches} live coach fare(s)" if coaches else "")
            + f". Best to mention: {speak_ops}. "
            "Left Itinero Transits page shows the list — do NOT dump them in chat. "
            "Voice: 1–2 operators + times + ₹ fare when listed. Never invent a fare. Booking finishes on partner checkout."
        )

    cards = bus_cards(
        buses,
        title=f"Buses {o} → {d}",
        subtitle=("City bus · " if local else "") + f"{day_note} {tz_note}" + (f" · {win}" if win else ""),
    )
    left_nav = {
        "type": "search_buses",
        "origin": o,
        "destination": d,
        "when": when or day_note,
        "window": win or "",
        "date": date_ymd,
        "local": local,
    }
    return {
        "text": text,
        "buses": buses,
        "cards": cards,
        "left_nav": left_nav,
        "from_name": o,
        "to_name": d,
        "date": date_ymd,
        "region": region,
        "local": local,
        "user_message": user_message,
        "total_found": len(rows),
    }


def track_india_train_structured(train_number: str, start_day: int = 0) -> dict[str, Any]:
    """Operational running-status. NOT GPS. Never infer position from timetable + clock."""
    from services.card_mapping import train_track_cards

    number = re.sub(r"\D", "", str(train_number or ""))
    empty = {
        "text": "",
        "track": None,
        "cards": None,
        "left_nav": {"type": "track_train", "number": number or "", "start_day": start_day or 0},
    }
    if not re.fullmatch(r"\d{4,5}", number):
        return {
            **empty,
            "text": (
                "Need a 4–5 digit train number to track (e.g. 20901, 12952). "
                "If they only said Vande Bharat, call search_trains first, then track_train with the number. "
                "Do NOT invent a live position from a timetable."
            ),
        }
    try:
        data = railyatri_live.live_status(number, start_day=start_day or 0)
    except ProviderRequestError as exc:
        return {
            **empty,
            "text": (
                f"Live running-status lookup failed for {number}: {exc}. "
                "I cannot verify this train's current position. "
                "Do NOT guess from scheduled times."
            ),
        }

    name = data.get("train_name") or f"Train {number}"
    bits = [f"**{number} {name}** — operational running status (NOT GPS / not a live map pin)."]
    if data.get("start_date"):
        bits.append(f"Start date: {data['start_date']}.")
    if data.get("status_as_of"):
        bits.append(data["status_as_of"].rstrip(".") + ".")
    for msg in data.get("location_messages") or []:
        bits.append(str(msg).rstrip(".") + ".")
    if data.get("title") and data["title"] not in (data.get("location_messages") or []):
        bits.append(f"Status: {data['title']}.")
    if data.get("message"):
        bits.append(data["message"])
    if data.get("at_source"):
        bits.append("Feed says it is still at / hasn't left the origin.")
    if data.get("at_destination"):
        bits.append("Feed says it has reached the destination.")
    if data.get("next_station_name"):
        nxt = data["next_station_name"]
        if data.get("next_station_code"):
            nxt += f" ({data['next_station_code']})"
        if data.get("next_in"):
            nxt += f", {data['next_in']}"
        bits.append(f"Next stop on this feed: {nxt}.")
    if data.get("ahead_text"):
        bits.append(data["ahead_text"].rstrip(".") + ".")
    if data.get("current_station"):
        bits.append(f"Last reported point: {data['current_station']}.")
    if data.get("platform") not in (None, "", 0, "0"):
        bits.append(f"Platform on this feed: {data['platform']} (station boards win if they disagree).")
    if data.get("delay_minutes") is not None:
        bits.append(
            "On time on this feed."
            if data.get("on_time")
            else f"Delay on this feed: {data['delay_minutes']} min."
        )
    else:
        bits.append("Delay minutes: **unknown** on this feed — do not invent.")
    if data.get("gps_unable"):
        bits.append("GPS/physical location: **unavailable**. Do not say where the train is on the map.")
    if data.get("pantry") in (True, "true", 1, "1"):
        bits.append("This feed lists a pantry car.")
    food_stops = sum(1 for s in (data.get("stations") or []) if s.get("food") and s.get("is_stop") is not False)
    if food_stops:
        bits.append(f"{food_stops} halt{'s' if food_stops != 1 else ''} on this feed show food.")
    bits.append(
        "Food on train: IRCTC eCatering delivers to the berth when the corridor is live "
        "(PNR helps the kitchen find them). Left /trains?mode=food has PNR | TRAIN + boarding date. "
        "Never invent a menu or price."
    )
    bits.append(
        "Full station timeline with scheduled vs actual/ETA is on the left Trains → Live track page. "
        "UNKNOWN unless this feed stated it: speed, why stopped, whether delay will recover, "
        "exact GPS, platform change vs station display. "
        "A timetable is not a live vehicle position."
    )
    text = " ".join(bits)
    cards = train_track_cards(data)
    left_nav = {
        "type": "track_train",
        "number": number,
        "start_day": start_day or 0,
        "name": name,
    }
    return {"text": text, "track": data, "cards": cards, "left_nav": left_nav}


def track_india_train_summary(train_number: str, start_day: int = 0) -> str:
    return track_india_train_structured(train_number, start_day)["text"]


def track_airport_structured(airport: str) -> dict[str, Any]:
    """Live airport board. Never invent times, gates, or pins."""
    from services.card_mapping import airport_board_cards

    code = re.sub(r"[^A-Za-z0-9]", "", str(airport or "")).upper()
    empty_nav = {"type": "track_airport", "airport": code}
    empty = {"text": "", "airport": None, "cards": None, "left_nav": empty_nav}
    if len(code) < 3:
        return {
            **empty,
            "text": "Need an airport code (STV, BOM, DEL). Do NOT invent a board.",
        }
    try:
        res = flight_track_provider.track_airport(code)
    except ProviderRequestError as exc:
        return {
            **empty,
            "text": f"Airport board failed for {code}: {exc}. Do NOT invent departures.",
        }
    board = res.get("airport") if isinstance(res, dict) else None
    if not board:
        msg = str((res or {}).get("message") or f"No live board for {code}.")
        return {
            **empty,
            "text": f"{msg} Airport screens win.",
            "left_nav": {**empty_nav, "airport": (res or {}).get("iata") or code},
        }
    iata = str(board.get("iata") or code).upper()
    deps = board.get("departures") or []
    arrs = board.get("arrivals") or []
    bits = [
        f"**{board.get('name') or ''} {iata}** live board "
        f"({len(deps)} departures, {len(arrs)} arrivals). Not a booking search."
    ]
    for row in (deps[:3] + arrs[:2]):
        if not isinstance(row, dict):
            continue
        bits.append(
            f"{row.get('flight_iata') or row.get('ident')} "
            f"{row.get('status_label') or ''} "
            f"{row.get('other_iata') or ''} "
            f"{row.get('dep_time') or row.get('arr_time') or ''}".strip()
        )
    bits.append("Full board is on the left Flight track → Airport. Never invent a missing time.")
    return {
        "text": " ".join(bits),
        "airport": board,
        "cards": airport_board_cards(board),
        "left_nav": {"type": "track_airport", "airport": iata},
    }


def track_flight_structured(flight: str, date: str = "") -> dict[str, Any]:
    """Live flight operational status + optional ADS-B. Never invent gate/delay/pin."""
    from services.card_mapping import flight_track_cards

    parsed = flight_track_provider.parse_flight_code(flight)
    label = parsed.get("flight_iata") or re.sub(r"\s+", "", str(flight or "")).upper()
    empty_nav = {"type": "track_flight", "flight": label, "date": str(date or "").strip()}
    empty = {"text": "", "track": None, "cards": None, "left_nav": empty_nav}
    if not parsed:
        return {
            **empty,
            "text": (
                "Need a flight number to track (e.g. AI 131, 6E 2341). "
                "Do NOT invent gate, delay, or a live map pin."
            ),
        }
    try:
        res = flight_track_provider.track_flight(flight, date=date or "")
    except ProviderRequestError as exc:
        return {
            **empty,
            "text": (
                f"Live flight status failed for {label}: {exc}. "
                "I cannot verify this flight's position or times. Do NOT guess."
            ),
        }

    track = res.get("track") if isinstance(res, dict) else None
    if not track:
        msg = str((res or {}).get("message") or f"No live status for {label}.")
        return {
            **empty,
            "text": f"{msg} Airport screens win. Do not invent times or gates.",
            "left_nav": {**empty_nav, "flight": res.get("flight_iata") or label, "date": res.get("date") or date},
        }

    bits = [
        f"**{track.get('airline_name') or track.get('airline_iata') or ''} {track.get('flight_iata') or label}**".strip()
        + f" — {track.get('status_label') or 'live status'} (operational feed, not a guaranteed GPS pin)."
    ]
    route = " → ".join([x for x in (track.get("origin"), track.get("destination")) if x])
    if route:
        bits.append(f"Route: {route}.")
    if track.get("date"):
        bits.append(f"Date: {track['date']}.")
    if track.get("delay_minutes") is not None:
        bits.append(
            "On time on this feed."
            if int(track["delay_minutes"] or 0) <= 0
            else f"Delay on this feed: {track['delay_minutes']} min."
        )
    else:
        bits.append("Delay minutes: **unknown** on this feed — do not invent.")
    dep_bits = []
    if track.get("dep_actual"):
        dep_bits.append(f"actual {track['dep_actual']}")
    elif track.get("dep_estimated"):
        dep_bits.append(f"est {track['dep_estimated']}")
    elif track.get("dep_scheduled"):
        dep_bits.append(f"sched {track['dep_scheduled']}")
    if track.get("dep_terminal"):
        dep_bits.append(f"T{track['dep_terminal']}" if not str(track["dep_terminal"]).upper().startswith("T") else str(track["dep_terminal"]))
    if track.get("dep_gate"):
        dep_bits.append(f"gate {track['dep_gate']}")
    if dep_bits:
        bits.append("Departure: " + ", ".join(dep_bits) + ".")
    arr_bits = []
    if track.get("arr_actual"):
        arr_bits.append(f"actual {track['arr_actual']}")
    elif track.get("arr_estimated"):
        arr_bits.append(f"est {track['arr_estimated']}")
    elif track.get("arr_scheduled"):
        arr_bits.append(f"sched {track['arr_scheduled']}")
    if track.get("arr_terminal"):
        arr_bits.append(f"T{track['arr_terminal']}" if not str(track["arr_terminal"]).upper().startswith("T") else str(track["arr_terminal"]))
    if track.get("arr_gate"):
        arr_bits.append(f"gate {track['arr_gate']}")
    if arr_bits:
        bits.append("Arrival: " + ", ".join(arr_bits) + ".")
    if track.get("aircraft_type") or track.get("registration"):
        bits.append(
            "Aircraft: "
            + " · ".join([x for x in (track.get("aircraft_type"), track.get("registration")) if x])
            + "."
        )
    pos = track.get("position") if isinstance(track.get("position"), dict) else None
    if pos and pos.get("lat") is not None and pos.get("lon") is not None:
        extra = []
        if pos.get("altitude_ft") is not None:
            extra.append(f"{pos['altitude_ft']} ft")
        if pos.get("speed_kts") is not None:
            extra.append(f"{pos['speed_kts']} kt")
        bits.append(
            f"Last reported position: {pos['lat']}, {pos['lon']}"
            + (f" ({', '.join(extra)})" if extra else "")
            + ". ADS-B / tracker last-seen — not a guaranteed map pin."
        )
    elif track.get("gps_unable") is not False:
        bits.append("Live map position: **unavailable**. Do not invent where the aircraft is.")
    bits.append(
        "Full tracker is on the left nav → Flight track page. "
        "UNKNOWN unless this feed stated it: why delayed, new gate vs airport display, exact GPS. "
        "Airport screens win if they disagree."
    )
    left_nav = {
        "type": "track_flight",
        "flight": track.get("flight_iata") or label,
        "date": track.get("date") or date or "",
    }
    return {
        "text": " ".join(bits),
        "track": track,
        "cards": flight_track_cards(track),
        "left_nav": left_nav,
    }


def check_india_pnr_structured(pnr: str) -> dict[str, Any]:
    digits = re.sub(r"\D", "", str(pnr or ""))
    empty = {
        "text": "",
        "user_message": "",
        "pnr": None,
        "left_nav": {"type": "check_pnr", "pnr": digits},
    }
    if not re.fullmatch(r"\d{10}", digits):
        msg = "PNR must be exactly 10 digits."
        return {
            **empty,
            "text": f"{msg} Do not invent CNF / RAC / WL.",
            "user_message": msg,
        }
    try:
        data = railyatri_live.pnr_status(digits)
    except ProviderRequestError:
        user = "Couldn't verify this PNR. IRCTC remains official — we never invent CNF / RAC / WL."
        return {
            **empty,
            "text": (
                f"{user} Do not invent a waitlist or berth. "
                "Left /trains PNR tab can retry; traveller can check IRCTC."
            ),
            "user_message": user,
        }
    bits = [f"PNR **{digits}** (partner status feed — not IRCTC official)."]
    if data.get("train_number"):
        bits.append(f"Train {data['train_number']} {data.get('train_name') or ''}".strip() + ".")
    route_from = data.get("from_code") or data.get("from_name") or "?"
    route_to = data.get("to_code") or data.get("to_name") or "?"
    if route_from != "?" or route_to != "?":
        bits.append(f"{route_from} → {route_to}.")
    if data.get("journey_date"):
        bits.append(f"Date: {data['journey_date']}.")
    if data.get("class_name") or data.get("class_code"):
        bits.append(f"Class: {data.get('class_name') or data.get('class_code')}.")
    if data.get("overall_status"):
        bits.append(f"Current status: {data['overall_status']}.")
    if data.get("quota_label") or data.get("quota"):
        bits.append(f"Quota: {data.get('quota_label') or data.get('quota')}.")
    if data.get("chart_status"):
        bits.append(f"Chart: {data['chart_status']}.")
    if data.get("confirm_level") or data.get("confirm_pct") is not None:
        pct = data.get("confirm_pct")
        bits.append(
            f"Partner confirmation estimate: {data.get('confirm_level') or ''}"
            + (f" ~{pct}%" if pct is not None else "")
            + " — not IRCTC official."
        )
    pax = data.get("passengers") or []
    if pax:
        bits.append("Passengers:")
        for row in pax[:6]:
            seat = " ".join(x for x in (row.get("coach"), row.get("berth")) if x)
            wl = ""
            if row.get("wl_booked") is not None or row.get("wl_current") is not None:
                wl = f" WL {row.get('wl_booked') or '?'}→{row.get('wl_current') or '?'}"
            bits.append(
                f"  {row.get('index')}. booking {row.get('booking_status') or '?'} → "
                f"current {row.get('current_code') or row.get('current_status') or row.get('status_code') or '?'}"
                f"{wl} {seat}".strip()
            )
    else:
        bits.append("Passenger statuses: unknown on this feed.")
    data["food_url"] = _train_food_url(
        str(data.get("train_number") or ""),
        str(data.get("from_code") or ""),
        str(data.get("to_code") or ""),
        str(data.get("journey_ymd") or ""),
        digits,
    )
    data["irctc_food_url"] = _irctc_food_url(
        str(data.get("train_number") or ""),
        str(data.get("from_code") or ""),
        digits,
    )
    bits.append(
        "Food on train: IRCTC eCatering (PNR prefilled) or left /trains?mode=food (PNR tab). "
        "Never invent a menu or price."
    )
    bits.append("Never invent waitlist movement.")
    return {
        "text": "\n".join(bits),
        "user_message": "",
        "pnr": data,
        "left_nav": {"type": "check_pnr", "pnr": digits},
    }


def order_train_food_structured(
    pnr: str = "",
    train_number: str = "",
    boarding_station: str = "",
    date: str = "",
) -> dict[str, Any]:
    """Open left Food on train. Never invent a menu or price."""
    digits = re.sub(r"\D", "", str(pnr or ""))
    number = re.sub(r"\D", "", str(train_number or ""))
    boarding = str(boarding_station or "").strip()
    boarding_code = boarding.upper() if re.fullmatch(r"[A-Za-z]{2,5}", boarding) else boarding
    ymd = str(date or "").strip()[:10]
    if ymd.lower() in ("today", "tonight", "aaj"):
        ymd = datetime.now().strftime("%Y-%m-%d")
    elif ymd.lower() in ("tomorrow", "kal"):
        ymd = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
    elif not re.fullmatch(r"\d{4}-\d{2}-\d{2}", ymd):
        ymd = ""
    tab = "pnr" if re.fullmatch(r"\d{10}", digits) else "train"
    left_nav = {
        "type": "order_train_food",
        "tab": tab,
        "pnr": digits if re.fullmatch(r"\d{10}", digits) else "",
        "number": number,
        "boarding": boarding_code,
        "from_code": boarding_code if re.fullmatch(r"[A-Z]{2,5}", str(boarding_code).upper()) else "",
        "date": ymd,
    }
    bits = [
        "Food on train is on the left — PNR tab or TRAIN tab (train number + boarding station + date). "
        "We do not invent a menu or price. IRCTC eCatering is official; partner kitchens deliver to the "
        "berth when the corridor is live. Never name the partner."
    ]
    if re.fullmatch(r"\d{10}", digits):
        bits.append(f"PNR {digits} prefilled.")
    if number:
        bits.append(f"Train {number} prefilled.")
    if boarding_code:
        bits.append(f"Boarding {boarding_code}.")
    if ymd:
        bits.append(f"Date {ymd}.")
    if number:
        try:
            track = railyatri_live.live_status(number, start_day=0)
        except ProviderRequestError:
            track = None
        if isinstance(track, dict):
            halts = [
                f"{s.get('name') or s.get('code')} ({s.get('code')})"
                if s.get("code")
                else str(s.get("name") or "")
                for s in (track.get("stations") or [])
                if isinstance(s, dict)
                and s.get("food")
                and s.get("is_stop") is not False
                and (s.get("name") or s.get("code"))
            ][:8]
            if halts:
                bits.append(
                    "This feed marks food at: "
                    + ", ".join(halts)
                    + ". Delivery only if the kitchen covers that halt — do not invent a restaurant list."
                )
    bits.append(f"IRCTC eCatering: {_irctc_food_url(number, boarding_code if tab == 'train' else '', digits)}.")
    return {"text": " ".join(bits), "left_nav": left_nav}


def get_route_summary(
    origin: str,
    destination: str,
    mode: str = "DRIVE",
    *,
    departure_time: str = "",
    arrival_time: str = "",
    routing_preference: str = "",
    transit_modes: str = "",
    alternatives: bool | None = None,
) -> str:
    origin = (origin or "").strip()
    destination = (destination or "").strip()
    if destination and not origin:
        origin = bus_provider.default_local_origin(destination)
    if not origin or not destination:
        return "Need both origin and destination for a route."
    try:
        origin = bus_provider.google_place_address(origin) or origin
        destination = bus_provider.google_place_address(destination) or destination
    except Exception:
        try:
            o_parent = bus_provider.parent_city(origin)
            d_parent = bus_provider.parent_city(destination)
            if o_parent and o_parent.lower() not in origin.lower():
                origin = f"{origin}, {o_parent}"
            if d_parent and d_parent.lower() not in destination.lower():
                destination = f"{destination}, {d_parent}"
        except Exception:
            pass

    raw_mode = (mode or "DRIVE").upper().replace(" ", "_").replace("-", "_")
    travel_mode, implied_modes = _MODE_ALIAS.get(raw_mode, ("DRIVE", None))
    requested = [
        p.strip().upper().replace(" ", "_").replace("-", "_")
        for p in (transit_modes or "").split(",")
        if p.strip()
    ]
    requested = ["SUBWAY" if p == "METRO" else p for p in requested]
    allowed = requested or implied_modes

    from services.india_ground import resolve_rail_station

    rail_o = resolve_rail_station(origin)
    rail_d = resolve_rail_station(destination)
    india_rail = bool(rail_o and rail_d and rail_o[0] != rail_d[0])
    wants_train = raw_mode in {"TRAIN", "RAIL", "COMMUTER"} or any(
        m in {"TRAIN", "RAIL"} for m in (allowed or [])
    )
    if india_rail and wants_train:
        return search_india_trains_summary(
            origin, destination, when=departure_time or arrival_time or ""
        )

    dep_rfc, dep_note = _to_rfc3339(departure_time, origin) if departure_time else (None, "")
    arr_rfc, arr_note = (None, "")
    if arrival_time and not departure_time:
        arr_rfc, arr_note = _to_rfc3339(arrival_time, origin)
    elif arrival_time and departure_time:
        arr_note = "ignored arrival_time (leave-at wins; Google allows only one)"

    tz_name = _guess_tz(origin)
    region = _region_code(origin, destination, tz_name)
    pref = (routing_preference or "").upper().replace(" ", "_")
    if pref not in {"LESS_WALKING", "FEWER_TRANSFERS"}:
        pref = ""

    try:
        body = google_maps_provider.compute_route(
            origin,
            destination,
            travel_mode,
            departure_time=dep_rfc,
            arrival_time=arr_rfc,
            transit_routing=pref or None,
            allowed_transit_modes=allowed,
            alternatives=alternatives,
            region_code=region,
        )
    except ProviderRequestError as e:
        return f"Route lookup failed: {e}"

    routes = [r for r in (body.get("routes") or []) if isinstance(r, dict)]
    meta_bits = [travel_mode]
    if pref:
        meta_bits.append(pref.lower().replace("_", " "))
    if allowed:
        meta_bits.append("+".join(allowed).lower())
    if dep_rfc:
        meta_bits.append("leave-at")
    elif arr_rfc:
        meta_bits.append("arrive-by")
    header = f"{origin} → {destination} ({', '.join(meta_bits)})"
    notes = [n for n in (dep_note, arr_note) if n]

    if not routes:
        if travel_mode == "TRANSIT":
            extra = " ".join(notes)
            local = False
            try:
                local = bus_provider.is_local_city_bus(origin, destination)
            except Exception:
                local = False
            bits = [
                f"{header}. Google has no one-seat public-transit itinerary for this exact pin."
            ]
            if extra:
                bits.append(extra)
            if local:
                try:
                    bus_res = search_india_buses_structured(
                        origin, destination, when=departure_time or ""
                    )
                    if bus_res.get("buses") and bus_res.get("text"):
                        bits.append(bus_res["text"])
                except Exception:
                    pass
                try:
                    walk_body = google_maps_provider.compute_route(
                        origin, destination, "WALK", region_code=region
                    )
                    walk_routes = [r for r in (walk_body.get("routes") or []) if isinstance(r, dict)]
                    if walk_routes:
                        bits.append("Walk (honest, not invented): " + _format_one_route(walk_routes[0], 1, 1))
                except Exception:
                    pass
                bits.append(
                    "Campus/city: speak any CATA/Sitilink line + stop if listed; "
                    "otherwise say the walk time. Never invent a bus number."
                )
                return "\n".join(bits)
            return (
                f"{header}. Google has no public-transit itinerary for this pair "
                "(coverage varies; India intercity rail/bus is often missing). "
                "Do not invent a bus number, metro line, or timetable. "
                "Try mode=DRIVE for road time, or destination_search for IRCTC / state-bus sites."
                + (f" ({extra})" if extra else "")
            )
        return f"Could not find a route from {origin} to {destination}."

    blocks = [_format_one_route(r, i, len(routes)) for i, r in enumerate(routes[:3], start=1)]
    board: list[str] = []
    for r in routes[:3]:
        if not isinstance(r, dict):
            continue
        for leg in r.get("legs") or []:
            if not isinstance(leg, dict):
                continue
            for step in leg.get("steps") or []:
                if not isinstance(step, dict):
                    continue
                td = step.get("transitDetails") if isinstance(step.get("transitDetails"), dict) else None
                if not td:
                    continue
                stop = str(((td.get("stopDetails") or {}).get("departureStop") or {}).get("name") or "").strip()
                if stop and stop not in board:
                    board.append(stop)
                break
    out = [header]
    if travel_mode == "TRANSIT" and board:
        extra = f" Also: {', '.join(board[1:3])}." if len(board) > 1 else ""
        out.append(
            f"SPEAK FIRST — nearby boarding stop: {board[0]}.{extra} "
            "Voice must say this stop name out loud (e.g. Adajan Gam). Do not skip it."
        )
    out.extend(blocks)
    if notes:
        out.append("Time: " + "; ".join(notes))
    if travel_mode == "TRANSIT":
        out.append(
            "Live transit — legs/stops/headsigns/walk are confirmed this turn. "
            "Fares only when every transit step is priced; otherwise fare is unknown. "
            "Schedules change; do not invent a different line."
        )
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Place search (Google Places API New)
# ---------------------------------------------------------------------------
_PRICE_LEVEL = {
    "PRICE_LEVEL_FREE": "Free",
    "PRICE_LEVEL_INEXPENSIVE": "₹",
    "PRICE_LEVEL_MODERATE": "₹₹",
    "PRICE_LEVEL_EXPENSIVE": "₹₹₹",
    "PRICE_LEVEL_VERY_EXPENSIVE": "₹₹₹₹",
}


def _place_type_label(raw: Optional[str]) -> str:
    if not raw:
        return ""
    return str(raw).replace("_", " ").strip().title()


def search_places_structured(query: str, max_results: int = 5) -> dict:
    """Return {text, places, cards} from Google Places. Never invent venues."""
    from services.card_mapping import place_cards

    try:
        body = google_maps_provider.search_places_text(query, max_results)
    except ProviderRequestError as e:
        return {"text": f"Place search failed: {e}", "places": [], "cards": None}

    raw = body.get("places") or []
    if not raw:
        return {
            "text": f"No places found for '{query}'. Try the parent city (e.g. Adajan → Surat).",
            "places": [],
            "cards": None,
        }

    places: list[dict] = []
    lines = [f"Places for '{query}':"]
    for p in raw[:max_results]:
        name = (p.get("displayName") or {}).get("text") or "Unknown"
        address = p.get("formattedAddress") or ""
        rating = p.get("rating")
        rating_count = p.get("userRatingCount")
        open_now = (p.get("currentOpeningHours") or {}).get("openNow")
        primary = _place_type_label(p.get("primaryType"))
        price = _PRICE_LEVEL.get(str(p.get("priceLevel") or ""), "")
        editorial = ((p.get("editorialSummary") or {}).get("text") or "").strip()
        photos = google_maps_provider.place_photo_urls(p, limit=1, max_px=640)
        photo_url = photos[0] if photos else ""
        item = {
            "name": name,
            "address": address,
            "area": address.split(",")[0].strip() if address else "",
            "rating": rating,
            "rating_count": rating_count,
            "open_now": open_now,
            "type": primary,
            "price": price,
            "maps_url": p.get("googleMapsUri") or "",
            "website_url": p.get("websiteUri") or "",
            "summary": editorial,
            "photo_url": photo_url,
            "image": photo_url,
            "photos": photos,
        }
        places.append(item)
        rating_str = f", {rating}★ ({rating_count} reviews)" if rating else ""
        open_str = " · open now" if open_now is True else (" · closed now" if open_now is False else "")
        extra = f" · {primary}" if primary else ""
        price_str = f" · {price}" if price else ""
        note = f" — {editorial}" if editorial else ""
        lines.append(
            f"- {name}{rating_str}{open_str}{extra}{price_str}"
            f"{(' — ' + address) if address else ''}{note}"
        )

    return {
        "text": "\n".join(lines),
        "places": places,
        "cards": place_cards(places, title="Places", subtitle=query),
    }


def search_places_summary(query: str, max_results: int = 5) -> str:
    return search_places_structured(query, max_results)["text"]


# ---------------------------------------------------------------------------
# Live events (Ticketmaster Discovery) — search only, never purchase
# ---------------------------------------------------------------------------
_CLASS_MAP = {
    "music": "Music",
    "concert": "Music",
    "concerts": "Music",
    "sports": "Sports",
    "sport": "Sports",
    "game": "Sports",
    "theatre": "Arts & Theatre",
    "theater": "Arts & Theatre",
    "arts": "Arts & Theatre",
    "broadway": "Arts & Theatre",
    "comedy": "Arts & Theatre",
    "family": "Family",
    "film": "Film",
    "movie": "Film",
}


def _tm_datetime(day: str, end_of_day: bool = False) -> str:
    d = (day or "").strip()
    if not d:
        return ""
    if "T" in d:
        return d if d.endswith("Z") else f"{d}Z"
    return f"{d}T23:59:59Z" if end_of_day else f"{d}T00:00:00Z"


def _event_price(raw: dict) -> tuple[str, float | None, float | None, str]:
    ranges = raw.get("priceRanges") or []
    if not ranges:
        return "", None, None, ""
    r0 = ranges[0] if isinstance(ranges[0], dict) else {}
    cur = str(r0.get("currency") or "").upper()
    lo, hi = r0.get("min"), r0.get("max")
    try:
        lo_f = float(lo) if lo is not None else None
        hi_f = float(hi) if hi is not None else None
    except (TypeError, ValueError):
        return "", None, None, cur
    if lo_f is None and hi_f is None:
        return "", None, None, cur
    if lo_f is not None and hi_f is not None and abs(hi_f - lo_f) > 0.5:
        return f"{cur} {lo_f:,.0f}–{hi_f:,.0f}".strip(), lo_f, hi_f, cur
    amt = hi_f if hi_f is not None else lo_f
    return f"{cur} {amt:,.0f}".strip(), lo_f, hi_f, cur


def search_events_structured(
    city: str,
    *,
    start_date: str = "",
    end_date: str = "",
    keyword: str = "",
    classification: str = "",
    country_code: str = "",
    max_results: int = 8,
) -> dict:
    """Return {text, events, cards} from Ticketmaster. Never invent shows."""
    from services.card_mapping import event_cards

    city = (city or "").strip()
    if not city and not keyword:
        return {
            "text": "Need a city (or artist/team keyword) to search events.",
            "events": [],
            "cards": None,
        }

    klass = _CLASS_MAP.get((classification or "").strip().lower(), (classification or "").strip())
    try:
        body = ticketmaster_provider.search_events(
            city=city,
            country_code=country_code,
            keyword=keyword,
            classification=klass,
            start_datetime=_tm_datetime(start_date, False) if start_date else "",
            end_datetime=_tm_datetime(end_date, True) if end_date else "",
            size=max_results,
        )
    except ProviderRequestError as e:
        return {"text": f"Event search failed: {e}", "events": [], "cards": None}

    raw_events = ((body.get("_embedded") or {}).get("events")) or []
    if not raw_events:
        inferred = ticketmaster_provider.infer_country_code(city, country_code)
        thin = (
            " Event coverage is thin in India / much of Asia — "
            "don't invent a concert. Use search_places for local venues, "
            "or search a US/UK/AU/EU city."
            if inferred == "IN"
            else " Don't invent events. Try another city, date, or keyword."
        )
        where = city or keyword or "that search"
        return {
            "text": f"No events found for {where}.{thin}",
            "events": [],
            "cards": None,
        }

    events: list[dict] = []
    lines = [f"Events in {city or keyword}:"]
    for raw in raw_events[:max_results]:
        if not isinstance(raw, dict):
            continue
        venues = (raw.get("_embedded") or {}).get("venues") or []
        venue = venues[0] if venues and isinstance(venues[0], dict) else {}
        start = (raw.get("dates") or {}).get("start") or {}
        status = ((raw.get("dates") or {}).get("status") or {}).get("code") or ""
        classes = raw.get("classifications") or []
        c0 = classes[0] if classes and isinstance(classes[0], dict) else {}
        segment = ((c0.get("segment") or {}) or {}).get("name") or ""
        genre = ((c0.get("genre") or {}) or {}).get("name") or ""
        klass_label = " · ".join(p for p in (segment, genre) if p)
        when = " ".join(
            p for p in (start.get("localDate"), start.get("localTime")) if p
        )
        venue_name = venue.get("name") or ""
        vcity = ((venue.get("city") or {}) or {}).get("name") or city
        vstate = ((venue.get("state") or {}) or {}).get("stateCode") or ""
        loc = ", ".join(p for p in (vcity, vstate) if p)
        price, lo, hi, cur = _event_price(raw)
        url = raw.get("url") or ""
        images = raw.get("images") or []
        image = ""
        for im in images:
            if isinstance(im, dict) and im.get("url") and str(im.get("ratio") or "") == "16_9":
                image = im["url"]
                break
        if not image and images and isinstance(images[0], dict):
            image = images[0].get("url") or ""
        item = {
            "id": raw.get("id") or "",
            "name": raw.get("name") or "Event",
            "venue": venue_name,
            "city": vcity,
            "address": ", ".join(p for p in (venue_name, loc) if p),
            "when": when,
            "classification": klass_label or "Event",
            "price": price,
            "priceMin": lo,
            "priceMax": hi,
            "currency": cur,
            "status": status,
            "url": url,
            "image": image,
        }
        events.append(item)
        price_bit = f" · {price}" if price else ""
        status_bit = f" · {status}" if status and status.lower() != "onsale" else ""
        lines.append(
            f"- {item['name']} — {when or 'date TBA'} @ {venue_name or loc or 'venue TBA'}"
            f"{price_bit}{status_bit}"
            + (f" · {url}" if url else "")
        )

    lines.append(
        "Search only — do not claim you booked or bought tickets. "
        "Send the ticket URL if they want to purchase. "
        "Prices above are listed ranges when returned; otherwise unknown. "
        "Never name the ticketing vendor."
    )
    subtitle = " · ".join(p for p in (city, start_date or "upcoming", klass or keyword) if p)
    return {
        "text": "\n".join(lines),
        "events": events,
        "cards": event_cards(events, title="Events", subtitle=subtitle),
    }


# ---------------------------------------------------------------------------
# Geocoding (Google Geocoding API)
# ---------------------------------------------------------------------------
def geocode_summary(place: str) -> str:
    try:
        body = google_maps_provider.geocode(place)
    except ProviderRequestError as e:
        return f"Geocoding failed: {e}"

    results = body.get("results") or []
    if not results:
        return f"Could not geocode '{place}'."

    top = results[0]
    location = top.get("geometry", {}).get("location", {})
    return (
        f"{top.get('formatted_address', place)} "
        f"(lat {location.get('lat')}, lng {location.get('lng')})"
    )
