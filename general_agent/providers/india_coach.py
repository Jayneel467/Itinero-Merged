"""India intercity coach inventory (operator, type, ₹ fare, rating, seats).

Partner feed only — never invent a fare or operator, and never name the
partner in user-facing copy. Falls back to empty so Google TRANSIT can run.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import datetime
from typing import Any
from urllib.parse import urlencode

try:
    from curl_cffi import requests as http
except ImportError:
    import requests as http

from providers import bus_provider

logger = logging.getLogger(__name__)

_BASE = "https://www.redbus.in"
_SEARCH = f"{_BASE}/rpw/api/searchResults"
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_LOGO_BASE = "https://origin-st.redbus.in/buslogos/country"
_TTL = 8 * 60
_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_ID_CACHE: dict[str, tuple[float, tuple[str, str]]] = {}
_ID_TTL = 6 * 60 * 60

# Only IDs already used for partner checkout. Wrong IDs would show another city.
_CITY_ID = dict(bus_provider._CITY_ID)


def _headers(origin: str, destination: str, doj: str) -> dict[str, str]:
    o = bus_provider._slug(origin)
    d = bus_provider._slug(destination)
    referer = (
        f"{_BASE}/bus-tickets/{o}-to-{d}"
        f"?fromCityName={origin}&toCityName={destination}&onward={doj}&doj={doj}"
    )
    return {
        "User-Agent": _UA,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-IN,en;q=0.9",
        "Content-Type": "application/json",
        "Origin": _BASE,
        "Referer": referer,
        "X-Requested-With": "XMLHttpRequest",
    }


def _session(origin: str, destination: str, doj: str):
    try:
        s = http.Session(impersonate="chrome")
    except TypeError:
        s = http.Session()
    s.headers.update(_headers(origin, destination, doj))
    return s


def _city_id(name: str) -> tuple[str, str]:
    label = bus_provider.canonical_city(name)
    key = bus_provider._city_key(label or name)
    slug = bus_provider._slug(label or name)
    hit = _ID_CACHE.get(key)
    if hit and time.time() - hit[0] < _ID_TTL:
        return hit[1]
    cid = _CITY_ID.get(key) or _CITY_ID.get(slug) or bus_provider._CITY_ID.get(key) or ""
    pair = (str(cid), label or name)
    if cid:
        _ID_CACHE[key] = (time.time(), pair)
    return pair


def _hhmm(raw: str) -> str:
    m = re.search(r"(\d{1,2}):(\d{2})", str(raw or ""))
    if not m:
        return ""
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _num(raw: Any) -> float | None:
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    return val if val > 0 else None


def _int(raw: Any) -> int | None:
    try:
        val = int(float(raw))
    except (TypeError, ValueError):
        return None
    return val if val > 0 else None


def _fare_list(item: dict[str, Any]) -> list[float]:
    out: list[float] = []
    for n in item.get("fareList") or []:
        val = _num(n)
        if val:
            out.append(val)
    by_type = item.get("fareDetailsBySeatType") or {}
    if isinstance(by_type, dict):
        for rows in by_type.values():
            if not isinstance(rows, list):
                continue
            for row in rows:
                if not isinstance(row, dict):
                    continue
                val = _num(row.get("originalPrice") or row.get("price") or row.get("fare"))
                if val:
                    out.append(val)
    return out


def _search_page(
    session: requests.Session,
    from_id: str,
    to_id: str,
    doj: str,
    *,
    limit: int = 40,
    offset: int = 0,
    group_id: int = 0,
) -> dict[str, Any]:
    qs = urlencode(
        {
            "fromCity": from_id,
            "toCity": to_id,
            "DOJ": doj,
            "limit": int(limit),
            "offset": int(offset),
            "meta": "true",
            "groupId": int(group_id),
            "sectionId": 0,
            "sort": 0,
            "sortOrder": 0,
            "bT": 1,
            "getUuid": "true",
        }
    )
    body = {
        "fromCity": str(from_id),
        "toCity": str(to_id),
        "DOJ": doj,
        "limit": int(limit),
        "offset": int(offset),
        "meta": True,
        "groupId": int(group_id),
        "sectionId": 0,
        "sort": 0,
        "sortOrder": 0,
        "bT": 1,
    }
    try:
        r = session.post(f"{_SEARCH}?{qs}", json=body, timeout=12)
        r.raise_for_status()
        payload = r.json()
    except Exception as exc:
        logger.info("india coach search failed: %s", exc)
        return {}
    if not isinstance(payload, dict) or not payload.get("success"):
        return {}
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def _parse_inv(
    item: dict[str, Any],
    origin: str,
    destination: str,
    date_ymd: str,
    logo_base: str = "",
) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    operator = str(item.get("travelsName") or "").strip()
    if not operator:
        return None
    bus_type_raw = str(item.get("busType") or "").strip()
    blob = f"{operator} {bus_type_raw} {item.get('serviceName') or ''}"
    meta = bus_provider._infer_type(blob)
    if item.get("isAc") is True:
        meta["ac"] = True
        meta["non_ac"] = False
    elif item.get("isAc") is False or re.search(r"non[\s-]?a/?c", bus_type_raw, re.I):
        meta["ac"] = False
        meta["non_ac"] = True
    if item.get("isSleeper") is True:
        meta["sleeper"] = True
    if re.search(r"\bseater\b", bus_type_raw, re.I):
        meta["seater"] = True
    if bus_type_raw:
        meta["bus_type"] = bus_type_raw
    fares = _fare_list(item)
    fare = min(fares) if fares else None
    currency = str(item.get("vendorCurrency") or "INR").upper() or "INR"
    dep = _hhmm(str(item.get("departureTime") or item.get("firstBpTime") or ""))
    arr = _hhmm(str(item.get("arrivalTime") or ""))
    dur_min = _int(item.get("journeyDurationMin"))
    duration = bus_provider._fmt_mins(dur_min) if dur_min else ""
    loc = item.get("locationSearchParams") if isinstance(item.get("locationSearchParams"), dict) else {}
    from_stop = str(item.get("standardBpName") or loc.get("sourceBp") or origin).strip() or origin
    to_stop = str(item.get("standardDpName") or loc.get("destinationDp") or destination).strip() or destination
    rating = _num(item.get("totalRatings"))
    if rating and rating > 5:
        rating = round(rating / 10.0, 1) if rating <= 50 else None
    reviews = _int(item.get("numberOfReviews"))
    seats = _int(item.get("availableSeats"))
    single = _int(item.get("availableSingleSeats"))
    total_seats = _int(item.get("totalSeats"))
    live = bool(item.get("isLiveTrackingAvailable"))
    programs = item.get("programList") or []
    campaigns = item.get("campaignType") or []
    primo = bool(item.get("rs555") or 3 in programs or 555 in campaigns)
    op_id = str(item.get("operatorId") or "").strip()
    service_id = str(item.get("serviceId") or "").strip()
    route_id = str(item.get("routeId") or "").strip()
    logo_path = str(item.get("operatorLogoPath") or "").lstrip("/")
    icon = f"{(logo_base or _LOGO_BASE).rstrip('/')}/{logo_path}" if logo_path else ""
    overnight = bool(dep and arr and (bus_provider._mins(arr) or 0) < (bus_provider._mins(dep) or 0))
    amenities = list(meta.get("amenities") or [])
    if live and "Live tracking" not in amenities:
        amenities.append("Live tracking")
    if primo and "Primo" not in amenities:
        amenities.append("Primo")
    if item.get("isPartialCancellationAllowed") and "Free cancellation" not in amenities:
        amenities.append("Free cancellation")
    meta["operator_id"] = op_id
    book = bus_provider.partner_book_url(
        origin,
        destination,
        date_ymd,
        dep,
        operator,
        meta,
        region="IN",
        from_stop=from_stop,
        to_stop=to_stop,
    )
    maps = bus_provider.maps_directions_url(origin, destination, from_stop=from_stop, to_stop=to_stop)
    fare_label = ""
    if fare and currency == "INR":
        fare_label = f"₹{int(fare)}" if fare == int(fare) else f"₹{fare:.0f}"
    elif fare:
        fare_label = f"{fare:.0f} {currency}"
    legs = [
        {
            "kind": "transit",
            "agency": operator,
            "agency_uri": "",
            "agency_phone": "",
            "agencies": [{"name": operator, "uri": "", "phone": ""}],
            "name": bus_type_raw or operator,
            "name_short": (operator.split()[0] if operator else "BUS")[:4],
            "color": "#b91c1c" if bus_provider._RTC_RE.search(operator) else "#001438",
            "text_color": "#ffffff",
            "vehicle": "Coach",
            "vehicle_type": "COACH",
            "dep": dep,
            "arr": arr,
            "from_stop": from_stop,
            "to_stop": to_stop,
            "stop_count": 0,
            "headsign": destination,
            "duration": duration,
            "duration_mins": dur_min,
            "instruction": str(item.get("serviceName") or "").strip(),
        }
    ]
    return {
        "id": f"coach-{op_id or 'op'}-{service_id or route_id or dep.replace(':', '')}-{bus_provider._slug(operator)}",
        "kind": "coach",
        "operator": operator,
        "name": operator,
        "service_name": str(item.get("serviceName") or "").strip(),
        "vehicle": "Coach",
        "vehicle_type": "COACH",
        "headsign": destination,
        "from_name": origin,
        "to_name": destination,
        "from_stop": from_stop,
        "to_stop": to_stop,
        "dep": dep,
        "arr": arr,
        "overnight": overnight,
        "duration": duration,
        "duration_mins": dur_min,
        "stops": 0,
        "via": [],
        "legs": legs,
        "modes": ["Coach"],
        "transfers": 0,
        "rtc": bool(bus_provider._RTC_RE.search(operator)),
        "fare": fare,
        "fare_label": fare_label,
        "fare_currency": currency,
        "currency": currency,
        "rating": round(rating, 1) if rating else None,
        "rating_count": reviews,
        "seats": seats,
        "single_seats": single,
        "total_seats": total_seats,
        "live_tracking": live,
        "primo": primo,
        "free_cancellation": bool(item.get("isPartialCancellationAllowed")),
        "operator_id": op_id,
        "service_id": service_id,
        "route_id": route_id,
        "name_short": (operator.split()[0] if operator else "BUS")[:4],
        "color": "#b91c1c" if bus_provider._RTC_RE.search(operator) else "#001438",
        "text_color": "#ffffff",
        "icon_uri": icon,
        "agencies": [{"name": operator, "uri": "", "phone": ""}],
        "region": "IN",
        "date": date_ymd,
        "local": False,
        "book_url": book,
        "maps_url": maps,
        **meta,
        "amenities": amenities,
    }


def search_india_coaches(
    origin: str,
    destination: str,
    travel_day: datetime,
    *,
    limit: int = 80,
) -> list[dict[str, Any]]:
    """Live intercity coaches. Empty list on miss — caller may fall back to Google."""
    o = bus_provider.canonical_city(origin)
    d = bus_provider.canonical_city(destination)
    if not o or not d or o.lower() == d.lower():
        return []
    from_id, o_name = _city_id(o)
    to_id, d_name = _city_id(d)
    if not from_id or not to_id or from_id == to_id:
        return []
    naive = travel_day.replace(tzinfo=None) if travel_day.tzinfo else travel_day
    doj = naive.strftime("%d-%b-%Y")
    date_ymd = naive.strftime("%Y-%m-%d")
    cap = max(20, min(120, int(limit or 80)))
    cache_key = f"in-coach|{from_id}|{to_id}|{date_ymd}|{cap}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]

    session = _session(o_name, d_name, doj)
    page_size = 40
    first = _search_page(session, from_id, to_id, doj, limit=page_size, offset=0, group_id=0)
    inv: list[dict[str, Any]] = [x for x in (first.get("inventories") or []) if isinstance(x, dict)]
    if not inv and not first:
        return []
    meta = first.get("metaData") if isinstance(first.get("metaData"), dict) else {}
    logo_base = str(meta.get("busLogoBaseUrl") or _LOGO_BASE).rstrip("/")
    groups: list[dict[str, Any]] = []
    for sec in meta.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        for g in sec.get("groups") or []:
            if isinstance(g, dict) and g.get("operatorId"):
                groups.append(g)
    from concurrent.futures import ThreadPoolExecutor, as_completed

    def _group_page(gid: int) -> list[dict[str, Any]]:
        extra = min(page_size, max(16, cap // max(1, len(groups))))
        gpage = _search_page(session, from_id, to_id, doj, limit=extra, offset=0, group_id=gid)
        return [x for x in (gpage.get("inventories") or []) if isinstance(x, dict)]

    gids: list[int] = []
    for g in groups[:3]:
        try:
            gids.append(int(g.get("operatorId")))
        except (TypeError, ValueError):
            continue
    if gids:
        with ThreadPoolExecutor(max_workers=min(3, len(gids))) as pool:
            futs = [pool.submit(_group_page, gid) for gid in gids]
            for fut in as_completed(futs):
                try:
                    inv.extend(fut.result() or [])
                except Exception:
                    continue

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in inv:
        row = _parse_inv(item, o_name, d_name, date_ymd, logo_base=logo_base)
        if not row:
            continue
        key = row.get("id") or ""
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append(row)
    rows.sort(key=lambda r: bus_provider._mins(r.get("dep") or "") or 99_999)
    out = rows[:cap]
    _CACHE[cache_key] = (time.time(), out)
    return out
