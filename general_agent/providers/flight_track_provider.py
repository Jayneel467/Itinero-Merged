"""Live flight status + optional ADS-B position.

Schedule/gate/times: live operational feed (no key), then AirLabs/Aviationstack if keyed.
Airborne position: feed track, then OpenSky / ADS-B callsign.

Never invent times, gates, delay, or a map pin. Airport screens win.
"""
from __future__ import annotations

import json
import logging
import math
import re
import time
from datetime import datetime, timezone
from html import unescape as _unescape
from typing import Any
from zoneinfo import ZoneInfo

import requests

from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL_STATUS = 45
_TTL_ADSB = 20
_TTL_OPENSKY = 25
_TTL_AIRPORT = 50
_FA_URL = "https://www.flightaware.com/live/flight/{ident}"
_FA_AIRPORT_URL = "https://www.flightaware.com/live/airport/{ident}"
_ADSB_NEAR_URL = "https://api.adsb.lol/v2/lat/{lat}/lon/{lon}/dist/{nm}"
_OPENSKY_URL = "https://opensky-network.org/api/states/all"
_OPENSKY_SNAP: tuple[float, list[tuple[str, float, float, int | None, int | None, int | None]]] | None = None

# IATA → ICAO for ADS-B callsigns (AI101 → AIC101). Unknown codes still try IATA.
IATA_TO_ICAO = {
    "AI": "AIC",
    "IX": "AXB",
    "6E": "IGO",
    "SG": "SEJ",
    "QP": "AKJ",
    "UK": "VTI",
    "G8": "GOW",
    "I5": "IAD",
    "EK": "UAE",
    "EY": "ETD",
    "QR": "QTR",
    "FZ": "FDB",
    "G9": "ABY",
    "WY": "OMA",
    "SV": "SVA",
    "GF": "GFA",
    "BA": "BAW",
    "LH": "DLH",
    "AF": "AFR",
    "KL": "KLM",
    "TK": "THY",
    "LX": "SWR",
    "OS": "AUA",
    "SN": "BEL",
    "IB": "IBE",
    "VY": "VLG",
    "U2": "EZY",
    "FR": "RYR",
    "W6": "WZZ",
    "AA": "AAL",
    "UA": "UAL",
    "DL": "DAL",
    "WN": "SWA",
    "B6": "JBU",
    "AS": "ASA",
    "AC": "ACA",
    "NH": "ANA",
    "JL": "JAL",
    "KE": "KAL",
    "OZ": "AAR",
    "CX": "CPA",
    "SQ": "SIA",
    "QF": "QFA",
    "NZ": "ANZ",
    "VA": "VOZ",
    "TG": "THA",
    "MH": "MAS",
    "GA": "GIA",
    "VN": "HVN",
    "CI": "CAL",
    "BR": "EVA",
    "CZ": "CSN",
    "MU": "CES",
    "CA": "CCA",
    "ET": "ETH",
    "MS": "MSR",
    "SA": "SAA",
    "LA": "LAN",
    "AM": "AMX",
    "AV": "AVA",
    "CM": "CMP",
}

ICAO_TO_IATA = {v: k for k, v in IATA_TO_ICAO.items()}

STATUS_LABELS = {
    "scheduled": "Scheduled",
    "delayed": "Delayed",
    "departed": "Departed",
    "en-route": "In air",
    "landed": "Landed",
    "cancelled": "Cancelled",
    "diverted": "Diverted",
    "incident": "Incident",
    "unknown": "Status unknown",
}


def parse_flight_code(raw: str) -> dict[str, Any]:
    s = re.sub(r"[^A-Za-z0-9]", "", str(raw or "")).upper()
    if not s:
        return {}
    m = re.search(r"(\d{1,4}[A-Z]?)$", s)
    if not m:
        return {}
    prefix = s[: m.start()]
    number = m.group(1)
    if not prefix or not number:
        return {}
    iata = ""
    icao = ""
    if len(prefix) == 2:
        iata = prefix
        icao = IATA_TO_ICAO.get(prefix, "")
    elif len(prefix) == 3:
        icao = prefix
        iata = ICAO_TO_IATA.get(prefix, "")
    else:
        return {}
    flight_iata = f"{iata}{number}" if iata else ""
    flight_icao = f"{icao}{number}" if icao else ""
    callsigns = []
    if flight_icao:
        callsigns.append(flight_icao)
    if flight_iata and flight_iata not in callsigns:
        callsigns.append(flight_iata)
    return {
        "airline_iata": iata,
        "airline_icao": icao,
        "number": number,
        "flight_iata": flight_iata,
        "flight_icao": flight_icao,
        "callsigns": callsigns,
    }


def _today_utc() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _tz(name: str):
    n = str(name or "").lstrip(":").strip() or "UTC"
    try:
        return ZoneInfo(n)
    except Exception:
        return timezone.utc


def _unix_hhmm(ts: Any, tzname: str = "") -> str:
    if ts in (None, "", 0, "0"):
        return ""
    try:
        dt = datetime.fromtimestamp(int(ts), tz=_tz(tzname))
        return dt.strftime("%H:%M")
    except (TypeError, ValueError, OSError):
        return ""


def _unix_ymd(ts: Any, tzname: str = "") -> str:
    if ts in (None, "", 0, "0"):
        return ""
    try:
        dt = datetime.fromtimestamp(int(ts), tz=_tz(tzname))
        return dt.strftime("%Y-%m-%d")
    except (TypeError, ValueError, OSError):
        return ""


def _delay_from_times(times: dict[str, Any] | None) -> int | None:
    if not isinstance(times, dict):
        return None
    sch = times.get("scheduled")
    live = times.get("actual") if times.get("actual") not in (None, "", 0) else times.get("estimated")
    if sch in (None, "", 0) or live in (None, "", 0):
        return None
    try:
        return int(round((int(live) - int(sch)) / 60))
    except (TypeError, ValueError):
        return None


def _fa_latlon(raw: Any) -> tuple[float, float] | None:
    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
        return None
    try:
        a, b = float(raw[0]), float(raw[1])
    except (TypeError, ValueError):
        return None
    # Feed stores [lon, lat]. If first value looks like latitude, swap.
    if abs(a) <= 90 and abs(b) <= 180 and abs(a) < abs(b):
        return round(a, 4), round(b, 4)
    if abs(b) <= 90:
        return round(b, 4), round(a, 4)
    return None


# Published airport locations — not a live aircraft pin. Used for origin/dest markers.
_IATA_LL: dict[str, tuple[float, float]] = {
    "AMD": (23.0772, 72.6347),
    "PNQ": (18.5822, 73.9197),
    "BOM": (19.0896, 72.8656),
    "DEL": (28.5562, 77.1000),
    "BLR": (13.1986, 77.7066),
    "HYD": (17.2403, 78.4294),
    "MAA": (12.9941, 80.1709),
    "CCU": (22.6547, 88.4467),
    "GOI": (15.3808, 73.8314),
    "GOX": (15.7336, 73.8600),
    "COK": (10.1520, 76.4019),
    "TRV": (8.4821, 76.9200),
    "GAU": (26.1061, 91.5859),
    "PAT": (25.5913, 85.0880),
    "LKO": (26.7606, 80.8893),
    "JAI": (26.8242, 75.8122),
    "IXC": (30.6735, 76.7885),
    "NAG": (21.0922, 79.0472),
    "IDR": (22.7218, 75.8011),
    "BDQ": (22.3362, 73.2263),
    "STV": (21.1141, 72.7418),
    "CJB": (11.0300, 77.0434),
    "VTZ": (17.7211, 83.2245),
    "DXB": (25.2532, 55.3657),
    "AUH": (24.4330, 54.6511),
    "DOH": (25.2731, 51.6080),
    "BAH": (26.2708, 50.6336),
    "MCT": (23.5933, 58.2844),
    "JED": (21.6796, 39.1565),
    "RUH": (24.9576, 46.6988),
    "LHR": (51.4700, -0.4543),
    "SIN": (1.3644, 103.9915),
    "BKK": (13.6900, 100.7501),
    "HKG": (22.3080, 113.9185),
    "JFK": (40.6413, -73.7781),
}


def _haversine_km(a: dict[str, Any] | None, b: dict[str, Any] | None) -> float | None:
    if not a or not b:
        return None
    try:
        lat1, lon1 = math.radians(float(a["lat"])), math.radians(float(a["lon"]))
        lat2, lon2 = math.radians(float(b["lat"])), math.radians(float(b["lon"]))
    except (KeyError, TypeError, ValueError):
        return None
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return round(6371.0088 * 2 * math.asin(min(1.0, math.sqrt(h))), 1)


def _trail_from_row(row: dict[str, Any]) -> list[dict[str, float]]:
    pts: list[dict[str, float]] = []
    for pt in row.get("track") if isinstance(row.get("track"), list) else []:
        if not isinstance(pt, dict):
            continue
        ll = _fa_latlon(pt.get("coord"))
        if not ll:
            continue
        if pts and abs(pts[-1]["lat"] - ll[0]) < 1e-5 and abs(pts[-1]["lon"] - ll[1]) < 1e-5:
            continue
        pts.append({"lat": ll[0], "lon": ll[1]})
    if len(pts) > 180:
        step = max(1, len(pts) // 180)
        slim = pts[::step]
        if slim[-1] != pts[-1]:
            slim.append(pts[-1])
        pts = slim
    return pts


def _airport_coord(airport: dict[str, Any], iata: str = "") -> dict[str, float] | None:
    ll = _fa_latlon(airport.get("coord") or airport.get("location"))
    if not ll:
        lat = _float_or_none(airport.get("latitude") or airport.get("lat"))
        lon = _float_or_none(airport.get("longitude") or airport.get("lon") or airport.get("lng"))
        if lat is not None and lon is not None:
            ll = (round(lat, 4), round(lon, 4))
    if not ll:
        code = re.sub(r"[^A-Z]", "", str(iata or airport.get("iata") or airport.get("altIdent") or "").upper())[:3]
        known = _IATA_LL.get(code)
        if known:
            ll = (known[0], known[1])
    if not ll:
        return None
    return {"lat": ll[0], "lon": ll[1]}


def _progress_fields(
    trail: list[dict[str, float]],
    origin: dict[str, float] | None,
    dest: dict[str, float] | None,
    position: dict[str, Any] | None,
) -> dict[str, Any]:
    here = None
    if position and position.get("lat") is not None and position.get("lon") is not None:
        here = {"lat": float(position["lat"]), "lon": float(position["lon"])}
    elif trail:
        here = trail[-1]
    flown = None
    if len(trail) >= 2:
        acc = 0.0
        ok = True
        for i in range(1, len(trail)):
            seg = _haversine_km(trail[i - 1], trail[i])
            if seg is None:
                ok = False
                break
            acc += seg
        flown = round(acc, 1) if ok else None
    if flown is None and origin and here:
        flown = _haversine_km(origin, here)
    remaining = _haversine_km(here, dest) if here and dest else None
    great = _haversine_km(origin, dest) if origin and dest else None
    pct = None
    if flown is not None and remaining is not None and (flown + remaining) > 0.2:
        pct = round(100.0 * flown / (flown + remaining), 1)
    elif great and flown is not None and great > 0.2:
        pct = round(min(100.0, 100.0 * flown / great), 1)
    return {
        "flown_km": flown,
        "remaining_km": remaining,
        "distance_km": great,
        "progress_pct": pct,
    }


def _geocode_airport(iata: str, name: str = "") -> dict[str, float] | None:
    code = re.sub(r"[^A-Z]", "", str(iata or "").upper())[:3]
    if not code:
        return None
    known = _IATA_LL.get(code)
    if known:
        return {"lat": known[0], "lon": known[1]}
    try:
        from general_agent.providers.google_maps_provider import geocode_place

        hit = geocode_place(f"{code} airport {name}".strip())
        return {"lat": round(float(hit["lat"]), 4), "lon": round(float(hit["lng"]), 4)}
    except Exception as exc:
        logger.info("Airport geocode skipped %s: %s", code, exc)
        return None


def _nm_km(n: Any) -> float | None:
    v = _float_or_none(n)
    if v is None:
        return None
    return round(v * 1.852, 1)


def _city_from_loc(raw: Any, fallback: str = "") -> str:
    s = str(raw or "").strip()
    if not s:
        return fallback
    return s.split(",")[0].strip() or fallback


def _alt_change_label(raw: Any) -> str:
    s = str(raw or "").strip().upper()
    if s == "C":
        return "Climbing"
    if s == "D":
        return "Descending"
    if s in ("", "L", "-", "0"):
        return "Level"
    return ""


def _aircraft_photo(row: dict[str, Any]) -> str:
    thumbs = row.get("relatedThumbnails")
    if isinstance(thumbs, list):
        for item in thumbs:
            if not isinstance(item, dict):
                continue
            url = str(item.get("thumbnail") or item.get("imageUrl") or "").strip()
            if url.startswith("http"):
                return url
    thumb = row.get("thumbnail") if isinstance(row.get("thumbnail"), dict) else {}
    url = str(thumb.get("imageUrl") or "").strip()
    if url.startswith("http") and "airline_logos" not in url:
        return url
    return ""


def _ete_minutes(remaining_km: float | None, speed_kts: int | None) -> int | None:
    """Live remaining time from last-seen speed + remaining distance. Not filed block time."""
    if remaining_km is None or not speed_kts or speed_kts < 40:
        return None
    mins = (remaining_km / 1.852) / speed_kts * 60
    if mins <= 0:
        return None
    return max(1, int(round(mins)))


def _alt_ft(raw: Any, speed_kts: int | None = None) -> int | None:
    n = _int_or_none(raw)
    if n is None:
        return None
    if 1 <= n <= 600 and (speed_kts or 0) >= 80:
        return n * 100
    return n


def _hhmm(raw: Any) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    if not s:
        return ""
    m = re.search(r"T?(\d{2}):(\d{2})", s)
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    m = re.search(r"\b(\d{1,2}):(\d{2})\b", s)
    if m:
        return f"{int(m.group(1)):02d}:{m.group(2)}"
    return ""


def _int_or_none(raw: Any) -> int | None:
    try:
        if raw is None or raw == "":
            return None
        return int(float(raw))
    except (TypeError, ValueError):
        return None


def _float_or_none(raw: Any) -> float | None:
    try:
        if raw is None or raw == "":
            return None
        return float(raw)
    except (TypeError, ValueError):
        return None


def _cache_get(key: str, ttl: float) -> dict[str, Any] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > ttl:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict[str, Any]) -> dict[str, Any]:
    _CACHE[key] = (time.time(), payload)
    return payload


def _keys() -> tuple[str, str]:
    try:
        from general_agent import config as cfg
    except Exception:
        import config as cfg  # type: ignore

    airlabs = str(getattr(cfg, "AIRLABS_API_KEY", "") or "").strip()
    stack = str(getattr(cfg, "AVIATIONSTACK_API_KEY", "") or "").strip()
    return airlabs, stack


def _normalize_status(raw: str, *, delay_minutes: int | None, dep_actual: str, arr_actual: str) -> str:
    s = str(raw or "").strip().lower().replace("_", "-").replace(" ", "-")
    if s in ("canceled",):
        s = "cancelled"
    if s in ("active", "inflight", "in-flight", "airborne"):
        s = "en-route"
    if s in ("arrived", "arrival"):
        s = "landed"
    if s in ("departed", "departure"):
        s = "departed"
    if arr_actual:
        return "landed"
    if s in ("cancelled", "diverted", "incident"):
        return s
    if s == "en-route":
        return "en-route"
    if dep_actual and s in ("", "scheduled", "delayed", "unknown", "departed"):
        return "departed" if s != "en-route" else "en-route"
    if delay_minutes is not None and delay_minutes > 0 and s in ("", "scheduled", "unknown"):
        return "delayed"
    if s in STATUS_LABELS:
        return s
    return "unknown" if not s else s


def _opensky_position(callsigns: list[str]) -> dict[str, Any] | None:
    global _OPENSKY_SNAP
    want = {re.sub(r"[^A-Z0-9]", "", str(c or "").upper()) for c in callsigns if c}
    want.discard("")
    if not want:
        return None
    now = time.time()
    snap = _OPENSKY_SNAP
    if not snap or now - snap[0] > _TTL_OPENSKY:
        try:
            resp = requests.get(
                _OPENSKY_URL,
                headers={"User-Agent": _UA, "Accept": "application/json"},
                timeout=18,
            )
            resp.raise_for_status()
            payload = resp.json() if resp.content else {}
        except requests.exceptions.RequestException as exc:
            logger.info("OpenSky states failed: %s", exc)
            return None
        rows = []
        for st in payload.get("states") or []:
            if not isinstance(st, list) or len(st) < 7:
                continue
            cs = re.sub(r"[^A-Z0-9]", "", str(st[1] or "").upper())
            if not cs:
                continue
            lat, lon = _float_or_none(st[6]), _float_or_none(st[5])
            if lat is None or lon is None:
                continue
            rows.append(
                (
                    cs,
                    lat,
                    lon,
                    _int_or_none(st[7]),
                    _int_or_none(st[9]),
                    _int_or_none(st[10]),
                )
            )
        _OPENSKY_SNAP = (now, rows)
        snap = _OPENSKY_SNAP
    for cs, lat, lon, alt, gs, hdg in snap[1]:
        if cs in want:
            return {
                "lat": round(lat, 4),
                "lon": round(lon, 4),
                "altitude_ft": alt,
                "speed_kts": gs,
                "heading": hdg,
                "registration": "",
                "aircraft_type": "",
                "callsign": cs,
                "updated": "",
                "source": "adsb",
            }
    return None


def _adsb_position(callsigns: list[str]) -> dict[str, Any] | None:
    for cs in callsigns:
        code = re.sub(r"[^A-Z0-9]", "", str(cs or "").upper())
        if not code:
            continue
        cache_key = f"adsb:{code}"
        hit = _cache_get(cache_key, _TTL_ADSB)
        if hit is not None:
            return hit or None
        try:
            resp = requests.get(
                f"https://api.adsb.lol/v2/callsign/{code}",
                headers={"User-Agent": _UA, "Accept": "application/json"},
                timeout=10,
            )
            if resp.status_code == 404:
                _cache_set(cache_key, {})
                continue
            resp.raise_for_status()
            data = resp.json() if resp.content else {}
        except requests.exceptions.RequestException as exc:
            logger.info("ADS-B lookup failed %s: %s", code, exc)
            continue
        rows = data.get("ac") if isinstance(data, dict) else None
        if not isinstance(rows, list) or not rows:
            _cache_set(cache_key, {})
            continue
        ac = rows[0] if isinstance(rows[0], dict) else {}
        lat = _float_or_none(ac.get("lat"))
        lon = _float_or_none(ac.get("lon"))
        if lat is None or lon is None:
            _cache_set(cache_key, {})
            continue
        pos = {
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "altitude_ft": _int_or_none(ac.get("alt_baro") if ac.get("alt_baro") != "ground" else 0),
            "speed_kts": _int_or_none(ac.get("gs")),
            "heading": _int_or_none(ac.get("track")),
            "registration": str(ac.get("r") or "").strip(),
            "aircraft_type": str(ac.get("t") or "").strip(),
            "callsign": str(ac.get("flight") or code).strip(),
            "updated": "",
            "source": "adsb",
        }
        return _cache_set(cache_key, pos)
    return None


def _from_airlabs(parsed: dict[str, str]) -> dict[str, Any] | None:
    key, _ = _keys()
    if not key:
        return None
    iata = parsed.get("flight_iata") or ""
    icao = parsed.get("flight_icao") or ""
    cache_key = f"airlabs:{iata or icao}"
    hit = _cache_get(cache_key, _TTL_STATUS)
    if hit is not None:
        return hit or None
    params = {"api_key": key}
    if iata:
        params["flight_iata"] = iata
    elif icao:
        params["flight_icao"] = icao
    else:
        return None
    try:
        resp = requests.get(
            "https://airlabs.co/api/v9/flight",
            params=params,
            headers={"User-Agent": _UA, "Accept": "application/json"},
            timeout=14,
        )
        resp.raise_for_status()
        payload = resp.json() if resp.content else {}
    except requests.exceptions.RequestException as exc:
        logger.warning("AirLabs flight failed %s: %s", iata or icao, exc)
        raise ProviderRequestError("flight_status", str(exc)) from exc
    err = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(err, dict) and err:
        msg = str(err.get("message") or err.get("code") or "lookup failed")
        raise ProviderRequestError("flight_status", msg)
    row = payload.get("response") if isinstance(payload, dict) else None
    if not isinstance(row, dict) or not row:
        _cache_set(cache_key, {})
        return None
    delay = _int_or_none(row.get("delayed") or row.get("dep_delayed"))
    dep_actual = _hhmm(row.get("dep_actual") or row.get("dep_actual_ts"))
    arr_actual = _hhmm(row.get("arr_actual") or row.get("arr_actual_ts"))
    status = _normalize_status(
        str(row.get("status") or ""),
        delay_minutes=delay,
        dep_actual=dep_actual,
        arr_actual=arr_actual,
    )
    live_lat = _float_or_none(row.get("lat"))
    live_lng = _float_or_none(row.get("lng"))
    position = None
    if live_lat is not None and live_lng is not None:
        position = {
            "lat": round(live_lat, 4),
            "lon": round(live_lng, 4),
            "altitude_ft": _int_or_none(row.get("alt")),
            "speed_kts": _int_or_none(row.get("speed")),
            "heading": _int_or_none(row.get("dir")),
            "registration": str(row.get("reg_number") or "").strip(),
            "aircraft_type": str(row.get("aircraft_icao") or "").strip(),
            "callsign": str(row.get("flight_icao") or row.get("flight_iata") or "").strip(),
            "updated": str(row.get("updated") or ""),
            "source": "status",
        }
    out = {
        "ok": True,
        "flight_iata": str(row.get("flight_iata") or iata).upper(),
        "flight_icao": str(row.get("flight_icao") or icao).upper(),
        "airline_iata": str(row.get("airline_iata") or parsed.get("airline_iata") or "").upper(),
        "airline_icao": str(row.get("airline_icao") or parsed.get("airline_icao") or "").upper(),
        "airline_name": str(row.get("airline_name") or "").strip(),
        "number": str(row.get("flight_number") or parsed.get("number") or "").strip(),
        "status": status,
        "status_label": STATUS_LABELS.get(status, status.replace("-", " ").title() or "Status unknown"),
        "origin": str(row.get("dep_iata") or "").upper(),
        "origin_name": str(row.get("dep_name") or row.get("dep_city") or "").strip(),
        "destination": str(row.get("arr_iata") or "").upper(),
        "destination_name": str(row.get("arr_name") or row.get("arr_city") or "").strip(),
        "dep_terminal": str(row.get("dep_terminal") or "").strip(),
        "dep_gate": str(row.get("dep_gate") or "").strip(),
        "arr_terminal": str(row.get("arr_terminal") or "").strip(),
        "arr_gate": str(row.get("arr_gate") or "").strip(),
        "dep_scheduled": _hhmm(row.get("dep_time")),
        "dep_estimated": _hhmm(row.get("dep_estimated")),
        "dep_actual": dep_actual,
        "arr_scheduled": _hhmm(row.get("arr_time")),
        "arr_estimated": _hhmm(row.get("arr_estimated")),
        "arr_actual": arr_actual,
        "delay_minutes": delay,
        "aircraft_type": str(row.get("aircraft_icao") or "").strip(),
        "registration": str(row.get("reg_number") or "").strip(),
        "position": position,
        "source": "status",
    }
    return _cache_set(cache_key, out)


def _from_aviationstack(parsed: dict[str, str], date: str) -> dict[str, Any] | None:
    _, key = _keys()
    if not key:
        return None
    iata = parsed.get("flight_iata") or ""
    if not iata:
        return None
    day = date or _today_utc()
    cache_key = f"avstack:{iata}:{day}"
    hit = _cache_get(cache_key, _TTL_STATUS)
    if hit is not None:
        return hit or None
    try:
        resp = requests.get(
            "https://api.aviationstack.com/v1/flights",
            params={"access_key": key, "flight_iata": iata, "flight_date": day},
            headers={"User-Agent": _UA, "Accept": "application/json"},
            timeout=14,
        )
        resp.raise_for_status()
        payload = resp.json() if resp.content else {}
    except requests.exceptions.RequestException as exc:
        logger.warning("Aviationstack flight failed %s: %s", iata, exc)
        raise ProviderRequestError("flight_status", str(exc)) from exc
    err = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(err, dict) and err:
        raise ProviderRequestError("flight_status", str(err.get("info") or err.get("code") or "lookup failed"))
    rows = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        _cache_set(cache_key, {})
        return None
    row = rows[0] if isinstance(rows[0], dict) else {}
    dep = row.get("departure") if isinstance(row.get("departure"), dict) else {}
    arr = row.get("arrival") if isinstance(row.get("arrival"), dict) else {}
    airline = row.get("airline") if isinstance(row.get("airline"), dict) else {}
    flight = row.get("flight") if isinstance(row.get("flight"), dict) else {}
    aircraft = row.get("aircraft") if isinstance(row.get("aircraft"), dict) else {}
    live = row.get("live") if isinstance(row.get("live"), dict) else {}
    delay = _int_or_none(dep.get("delay") if dep.get("delay") not in (None, "") else arr.get("delay"))
    dep_actual = _hhmm(dep.get("actual") or dep.get("actual_runway"))
    arr_actual = _hhmm(arr.get("actual") or arr.get("actual_runway"))
    status = _normalize_status(
        str(row.get("flight_status") or ""),
        delay_minutes=delay,
        dep_actual=dep_actual,
        arr_actual=arr_actual,
    )
    position = None
    lat = _float_or_none(live.get("latitude"))
    lon = _float_or_none(live.get("longitude"))
    if lat is not None and lon is not None:
        position = {
            "lat": round(lat, 4),
            "lon": round(lon, 4),
            "altitude_ft": _int_or_none(live.get("altitude")),
            "speed_kts": _int_or_none(live.get("speed_horizontal")),
            "heading": _int_or_none(live.get("direction")),
            "registration": str(aircraft.get("registration") or "").strip(),
            "aircraft_type": str(aircraft.get("icao") or aircraft.get("iata") or "").strip(),
            "callsign": str(flight.get("icao") or flight.get("iata") or "").strip(),
            "updated": str(live.get("updated") or ""),
            "source": "status",
        }
    out = {
        "ok": True,
        "flight_iata": str(flight.get("iata") or iata).upper(),
        "flight_icao": str(flight.get("icao") or parsed.get("flight_icao") or "").upper(),
        "airline_iata": str(airline.get("iata") or parsed.get("airline_iata") or "").upper(),
        "airline_icao": str(airline.get("icao") or parsed.get("airline_icao") or "").upper(),
        "airline_name": str(airline.get("name") or "").strip(),
        "number": str(flight.get("number") or parsed.get("number") or "").strip(),
        "status": status,
        "status_label": STATUS_LABELS.get(status, status.replace("-", " ").title() or "Status unknown"),
        "origin": str(dep.get("iata") or "").upper(),
        "origin_name": str(dep.get("airport") or "").strip(),
        "destination": str(arr.get("iata") or "").upper(),
        "destination_name": str(arr.get("airport") or "").strip(),
        "dep_terminal": str(dep.get("terminal") or "").strip(),
        "dep_gate": str(dep.get("gate") or "").strip(),
        "arr_terminal": str(arr.get("terminal") or "").strip(),
        "arr_gate": str(arr.get("gate") or "").strip(),
        "dep_scheduled": _hhmm(dep.get("scheduled")),
        "dep_estimated": _hhmm(dep.get("estimated")),
        "dep_actual": dep_actual,
        "arr_scheduled": _hhmm(arr.get("scheduled")),
        "arr_estimated": _hhmm(arr.get("estimated")),
        "arr_actual": arr_actual,
        "delay_minutes": delay,
        "aircraft_type": str(aircraft.get("icao") or aircraft.get("iata") or "").strip(),
        "registration": str(aircraft.get("registration") or "").strip(),
        "position": position,
        "source": "status",
    }
    return _cache_set(cache_key, out)


def _fa_bootstrap(ident: str) -> dict[str, Any] | None:
    code = re.sub(r"[^A-Z0-9]", "", str(ident or "").upper())
    if not code:
        return None
    cache_key = f"fa:{code}"
    hit = _cache_get(cache_key, _TTL_STATUS)
    if hit is not None:
        return hit or None
    try:
        resp = requests.get(
            _FA_URL.format(ident=code),
            headers={
                "User-Agent": _UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-IN,en;q=0.9",
                "Referer": "https://www.flightaware.com/live/",
            },
            timeout=18,
        )
        resp.raise_for_status()
        html = resp.text or ""
    except requests.exceptions.RequestException as exc:
        logger.info("Live flight page failed %s: %s", code, exc)
        _cache_set(cache_key, {})
        return None
    idx = html.find("var trackpollBootstrap")
    if idx < 0:
        _cache_set(cache_key, {})
        return None
    chunk = html[idx : idx + 120_000]
    start = chunk.find("{")
    if start < 0:
        _cache_set(cache_key, {})
        return None
    try:
        data, _end = json.JSONDecoder().raw_decode(chunk[start:])
    except json.JSONDecodeError:
        _cache_set(cache_key, {})
        return None
    if not isinstance(data, dict) or not data.get("flights"):
        _cache_set(cache_key, {})
        return None
    return _cache_set(cache_key, data)


def _fa_pick(payload: dict[str, Any], day: str) -> dict[str, Any] | None:
    flights = payload.get("flights") if isinstance(payload, dict) else None
    if not isinstance(flights, dict) or not flights:
        return None
    current = next(iter(flights.values()))
    if not isinstance(current, dict):
        return None
    logs = ((current.get("activityLog") or {}).get("flights") or []) if isinstance(current.get("activityLog"), dict) else []

    def row_day(row: dict[str, Any]) -> str:
        tz = str((row.get("origin") or {}).get("TZ") or "")
        times = row.get("takeoffTimes") or row.get("gateDepartureTimes") or {}
        return _unix_ymd(times.get("scheduled") or times.get("estimated") or times.get("actual"), tz)

    if day:
        cur_day = row_day(current)
        if cur_day == day:
            return current
        for row in logs:
            if isinstance(row, dict) and row_day(row) == day:
                if row.get("flightId") and row.get("flightId") == current.get("flightId"):
                    return current
                return row
        # Prefer the live instance over an empty tracker when the date filter misses.
        return current
    return current


def _from_live_page(idents: list[str], parsed: dict[str, Any], day: str) -> dict[str, Any] | None:
    seen: set[str] = set()
    payload = None
    used = ""
    for ident in idents:
        code = re.sub(r"[^A-Z0-9]", "", str(ident or "").upper())
        if not code or code in seen:
            continue
        seen.add(code)
        payload = _fa_bootstrap(code)
        if payload:
            used = code
            break
    if not payload:
        return None
    row = _fa_pick(payload, day)
    if not row:
        return None
    origin = row.get("origin") if isinstance(row.get("origin"), dict) else {}
    dest = row.get("destination") if isinstance(row.get("destination"), dict) else {}
    airline = row.get("airline") if isinstance(row.get("airline"), dict) else {}
    codeshare = row.get("codeShare") if isinstance(row.get("codeShare"), dict) else {}
    aircraft = row.get("aircraft") if isinstance(row.get("aircraft"), dict) else {}
    tz_o = str(origin.get("TZ") or "")
    tz_d = str(dest.get("TZ") or tz_o)
    takeoff = row.get("takeoffTimes") if isinstance(row.get("takeoffTimes"), dict) else {}
    landing = row.get("landingTimes") if isinstance(row.get("landingTimes"), dict) else {}
    gate_out = row.get("gateDepartureTimes") if isinstance(row.get("gateDepartureTimes"), dict) else {}
    gate_in = row.get("gateArrivalTimes") if isinstance(row.get("gateArrivalTimes"), dict) else {}
    dep_actual = _unix_hhmm(takeoff.get("actual") or gate_out.get("actual"), tz_o)
    arr_actual = _unix_hhmm(landing.get("actual") or gate_in.get("actual"), tz_d)
    delay = _delay_from_times(takeoff) if takeoff.get("actual") or takeoff.get("estimated") else _delay_from_times(gate_out)
    status = _normalize_status(
        str(row.get("flightStatus") or ""),
        delay_minutes=delay,
        dep_actual=dep_actual,
        arr_actual=arr_actual,
    )
    if row.get("cancelled"):
        status = "cancelled"
    if row.get("diverted"):
        status = "diverted"
    gs = _int_or_none(row.get("groundspeed"))
    position = None
    alt_raw = row.get("altitude")
    latlon = _fa_latlon(row.get("coord"))
    if not latlon:
        for pt in reversed(row.get("track") if isinstance(row.get("track"), list) else []):
            if not isinstance(pt, dict):
                continue
            latlon = _fa_latlon(pt.get("coord"))
            if latlon:
                gs = _int_or_none(pt.get("gs")) or gs
                alt_raw = pt.get("alt", alt_raw)
                break
    if latlon:
        position = {
            "lat": latlon[0],
            "lon": latlon[1],
            "altitude_ft": _alt_ft(alt_raw, gs),
            "speed_kts": gs,
            "heading": _int_or_none(row.get("heading")),
            "registration": str(aircraft.get("tail") or "").strip(),
            "aircraft_type": str(aircraft.get("type") or "").strip(),
            "callsign": str(row.get("ident") or used).strip(),
            "updated": str(row.get("timestamp") or ""),
            "source": "status",
        }
    iata = (
        str(parsed.get("flight_iata") or "").upper()
        or str(row.get("iataIdent") or "").upper()
        or str((codeshare.get("iataIdent") if isinstance(codeshare, dict) else "") or "").upper()
    )
    icao = (
        str(parsed.get("flight_icao") or "").upper()
        or str(codeshare.get("ident") or "").upper()
        or str(row.get("ident") or used).upper()
    )
    ac_type = str(aircraft.get("friendlyType") or aircraft.get("type") or "").strip()
    type_details = aircraft.get("typeDetails") if isinstance(aircraft.get("typeDetails"), dict) else {}
    origin_iata = str(origin.get("iata") or origin.get("altIdent") or "").upper()
    dest_iata = str(dest.get("iata") or dest.get("altIdent") or "").upper()
    origin_name = str(origin.get("friendlyName") or origin.get("friendlyLocation") or "").strip()
    dest_name = str(dest.get("friendlyName") or dest.get("friendlyLocation") or "").strip()
    origin_city = _city_from_loc(origin.get("friendlyLocation"), origin_iata)
    dest_city = _city_from_loc(dest.get("friendlyLocation"), dest_iata)
    trail = _trail_from_row(row)
    origin_coord = _airport_coord(origin, origin_iata) or _geocode_airport(origin_iata, origin_name)
    dest_coord = _airport_coord(dest, dest_iata) or _geocode_airport(dest_iata, dest_name)
    progress = _progress_fields(trail, origin_coord, dest_coord, position)
    dist = row.get("distance") if isinstance(row.get("distance"), dict) else {}
    fa_flown = _nm_km(dist.get("elapsed"))
    fa_remain = _nm_km(dist.get("remaining"))
    plan = row.get("flightPlan") if isinstance(row.get("flightPlan"), dict) else {}
    fuel = plan.get("fuelBurn") if isinstance(plan.get("fuelBurn"), dict) else {}
    if fa_flown is not None:
        progress["flown_km"] = fa_flown
    if fa_remain is not None:
        progress["remaining_km"] = fa_remain
    plan_km = _nm_km(plan.get("directDistance") or plan.get("plannedDistance"))
    if plan_km:
        progress["distance_km"] = plan_km
    if progress["flown_km"] is not None and progress["remaining_km"] is not None:
        tot = progress["flown_km"] + progress["remaining_km"]
        if tot > 0.2:
            progress["progress_pct"] = round(100.0 * progress["flown_km"] / tot, 1)
    vert = _alt_change_label(row.get("altitudeChange"))
    if position and vert:
        position["vertical"] = vert
    ete = _ete_minutes(progress["remaining_km"], gs or (position or {}).get("speed_kts"))
    operating_iata = str(row.get("iataIdent") or "").upper()
    return {
        "ok": True,
        "flight_iata": iata or icao,
        "flight_icao": icao,
        "operating_iata": operating_iata,
        "airline_iata": str(airline.get("iata") or parsed.get("airline_iata") or "").upper(),
        "airline_icao": str(airline.get("icao") or parsed.get("airline_icao") or "").upper(),
        "airline_name": str(airline.get("fullName") or airline.get("shortName") or "").strip(),
        "airline_callsign": str(airline.get("callsign") or "").strip(),
        "number": str(parsed.get("number") or "").strip(),
        "callsign": str(row.get("ident") or used).upper(),
        "status": status,
        "status_label": STATUS_LABELS.get(status, status.replace("-", " ").title() or "Status unknown"),
        "vertical": vert,
        "origin": origin_iata,
        "origin_icao": str(origin.get("icao") or "").upper(),
        "origin_name": origin_name,
        "origin_city": origin_city,
        "destination": dest_iata,
        "destination_icao": str(dest.get("icao") or "").upper(),
        "destination_name": dest_name,
        "destination_city": dest_city,
        "origin_coord": origin_coord,
        "destination_coord": dest_coord,
        "trail": trail,
        "flown_km": progress["flown_km"],
        "remaining_km": progress["remaining_km"],
        "distance_km": progress["distance_km"],
        "progress_pct": progress["progress_pct"],
        "ete_minutes": ete,
        "filed_speed_kts": _int_or_none(plan.get("speed")),
        "fuel_lb": _int_or_none(fuel.get("pounds")),
        "dep_terminal": str(origin.get("terminal") or "").strip(),
        "dep_gate": str(origin.get("gate") or "").strip(),
        "arr_terminal": str(dest.get("terminal") or "").strip(),
        "arr_gate": str(dest.get("gate") or "").strip(),
        "dep_scheduled": _unix_hhmm(takeoff.get("scheduled") or gate_out.get("scheduled"), tz_o),
        "dep_estimated": _unix_hhmm(takeoff.get("estimated") or gate_out.get("estimated"), tz_o),
        "dep_actual": dep_actual,
        "arr_scheduled": _unix_hhmm(landing.get("scheduled") or gate_in.get("scheduled"), tz_d),
        "arr_estimated": _unix_hhmm(landing.get("estimated") or gate_in.get("estimated"), tz_d),
        "arr_actual": arr_actual,
        "delay_minutes": delay,
        "aircraft_type": ac_type,
        "aircraft_code": str(aircraft.get("type") or "").strip(),
        "aircraft_manufacturer": str(type_details.get("manufacturer") or "").strip(),
        "aircraft_model": str(type_details.get("model") or "").strip(),
        "engines": str(type_details.get("engCount") or "").strip(),
        "aircraft_image": _aircraft_photo(row),
        "registration": str(aircraft.get("tail") or "").strip(),
        "position": position,
        "source": "status",
        "operating_ident": str(row.get("ident") or "").upper(),
    }


def _strip_tags(raw: str) -> str:
    s = _unescape(re.sub(r"<[^>]+>", " ", raw or ""))
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def _ident_marketing(ident: str) -> tuple[str, str]:
    code = re.sub(r"[^A-Z0-9]", "", str(ident or "")).upper()
    m = re.match(r"^([A-Z]{2,3})(\d{1,4}[A-Z]?)$", code)
    if not m:
        return code, ""
    prefix, num = m.group(1), m.group(2)
    if len(prefix) == 3 and prefix in ICAO_TO_IATA:
        iata_al = ICAO_TO_IATA[prefix]
        return f"{iata_al}{num}", iata_al
    if len(prefix) == 2:
        return code, prefix
    return code, ""


def _board_time(cell: str) -> dict[str, Any]:
    estimated = bool(re.search(r"<i\b", cell or "", re.I))
    unknown = "result unknown" in (cell or "").lower()
    text = _strip_tags(cell)
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    hhmm = ""
    if m:
        hhmm = f"{int(m.group(1)):02d}:{m.group(2)}"
    tz = ""
    tm = re.search(r"\b(IST|UTC|GMT|EST|PST|CET|GST|MSK)\b", text)
    if tm:
        tz = tm.group(1)
    return {"time": hhmm, "estimated": estimated, "unknown": unknown, "tz": tz}


def _board_other_airport(cell: str) -> dict[str, str]:
    hint = ""
    hm = re.search(r'title="([^"]+)"', cell or "")
    if hm:
        hint = _unescape(hm.group(1))
    iata = ""
    icao = ""
    m = re.search(r"-\s*([A-Z]{3})(?:\s*/\s*([A-Z]{4}))?\s*$", hint)
    if m:
        iata, icao = m.group(1), m.group(2) or ""
    if not iata:
        lm = re.search(r"/live/airport/([A-Z0-9]{3,4})", cell or "")
        code = (lm.group(1) if lm else "").upper()
        if len(code) == 3:
            iata = code
        elif len(code) == 4:
            icao = code
    left = hint.split(" - ")[0].strip() if hint else _strip_tags(cell)
    city = ""
    cm = re.search(r"\(([^)]+)\)\s*$", left)
    if cm:
        city = cm.group(1).strip()
    name = re.sub(r"\s+\([^)]*\)\s*$", "", left).strip() or left
    return {"iata": iata, "icao": icao, "name": name, "city": city}


def _board_status(
    board: str, dep: dict[str, Any], arr: dict[str, Any], prog: int | None
) -> tuple[str, str]:
    if board == "arrivals":
        if arr.get("unknown"):
            return "unknown", "Status unknown"
        if arr.get("time") and not arr.get("estimated"):
            return "landed", "Landed"
        if dep.get("time") and not dep.get("estimated"):
            return "en-route", "In air"
        return "scheduled", "Scheduled"
    if board == "departures":
        if prog is not None and prog >= 95:
            return "departed", "Departed"
        if dep.get("time") and not dep.get("estimated"):
            return "departed", "Departed"
        return "scheduled", "Scheduled"
    if board == "enroute":
        if dep.get("time") and not dep.get("estimated"):
            return "en-route", "In air"
        return "scheduled", "Scheduled"
    return "scheduled", "Scheduled"


def _parse_board_row(row_html: str, board: str) -> dict[str, Any] | None:
    href_m = re.search(r'href="(/live/flight/([^"/]+)[^"]*)"', row_html)
    if not href_m:
        return None
    path = href_m.group(1)
    ident = re.sub(r"[^A-Z0-9]", "", href_m.group(2).upper())
    if not ident:
        return None
    date = ""
    hist = re.search(r"/history/(\d{8})/", path)
    if hist:
        ymd = hist.group(1)
        date = f"{ymd[:4]}-{ymd[4:6]}-{ymd[6:8]}"
    title_m = re.search(r'class="\s*flight-ident[\s\S]*?title="([^"]+)"', row_html)
    airline_name = ""
    if title_m:
        airline_name = _unescape(title_m.group(1)).split('"')[0].split("(")[0].strip()
    type_m = re.search(r"/live/aircrafttype/([A-Z0-9]+)", row_html)
    ac_code = type_m.group(1) if type_m else ""
    type_title = ""
    tt = re.search(
        r'title="((?:Airbus|Boeing|Embraer|ATR|Bombardier|De Havilland)[^"]{0,80})"',
        row_html,
        re.I,
    )
    if tt:
        type_title = _unescape(tt.group(1))
    tds = re.findall(r"<td\b[^>]*>([\s\S]*?)</td>", row_html, re.I)
    other = _board_other_airport(tds[2] if len(tds) > 2 else "")
    dep = _board_time(tds[3] if len(tds) > 3 else "")
    arr = _board_time(tds[5] if len(tds) > 5 else "")
    prog = None
    pm = re.search(r'track-panel-progress-fill"[^>]*width:\s*([\d.]+)%', row_html)
    if pm:
        try:
            prog = int(round(float(pm.group(1))))
        except ValueError:
            prog = None
    marketing, airline_iata = _ident_marketing(ident)
    status, status_label = _board_status(board, dep, arr, prog)
    return {
        "ident": ident,
        "flight_iata": marketing,
        "flight_icao": ident,
        "airline_iata": airline_iata,
        "airline_name": airline_name,
        "aircraft_code": ac_code,
        "aircraft_type": type_title or ac_code,
        "other_iata": other["iata"],
        "other_icao": other["icao"],
        "other_name": other["name"],
        "other_city": other["city"],
        "dep_time": dep["time"],
        "arr_time": arr["time"],
        "dep_estimated": bool(dep["estimated"]),
        "arr_estimated": bool(arr["estimated"]),
        "tz": dep["tz"] or arr["tz"],
        "progress_pct": prog,
        "date": date,
        "status": status,
        "status_label": status_label,
    }


def _parse_airport_boards(page_html: str) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {
        "arrivals": [],
        "departures": [],
        "enroute": [],
        "scheduled": [],
    }
    for key in ("arrivals", "departures", "enroute", "scheduled"):
        m = re.search(rf'data-type="{key}"[\s\S]*?</table>', page_html, re.I)
        if not m:
            continue
        chunk = m.group(0)
        for row in re.findall(r'<tr\b[^>]*id="Row_[^"]+"[^>]*>[\s\S]*?</tr>', chunk, re.I):
            parsed = _parse_board_row(row, key)
            if parsed:
                out[key].append(parsed)
    return out


def _parse_airport_meta(page_html: str, requested: str) -> dict[str, Any]:
    icao = ""
    iata = ""
    bundle = re.search(
        r'"airport"\s*:\s*"([A-Z0-9]{3,4})".{0,120}"icao"\s*:\s*"([A-Z0-9]{4})".{0,80}"iata"\s*:\s*"([A-Z]{3})"',
        page_html,
    )
    if bundle:
        icao, iata = bundle.group(2), bundle.group(3)
    if not icao:
        im = re.search(r"var airport_id\s*=\s*'([A-Z0-9]+)'", page_html)
        if im:
            icao = im.group(1).upper()
    title = ""
    hm = re.search(r"<h1[^>]*airportTrackerTitle[^>]*>\s*([^<]+)", page_html, re.I)
    if hm:
        title = hm.group(1).strip()
    if not iata:
        tm = re.search(r"\b([A-Z]{3})\s*$", title)
        if tm:
            iata = tm.group(1)
    if not iata and len(requested) == 3:
        iata = requested
    if not icao and len(requested) == 4:
        icao = requested
    name = re.sub(r"\s+[A-Z]{3}\s*$", "", title).strip()
    name = re.sub(r"\s+\([^)]*\)\s*$", "", name).strip()
    coord = None
    cm = re.search(
        r'"airportCoords"\s*:\s*\[\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)',
        page_html,
    )
    if cm:
        a, b = float(cm.group(1)), float(cm.group(2))
        if abs(a) <= 90 and abs(b) <= 180 and abs(a) < abs(b):
            coord = {"lat": round(a, 4), "lon": round(b, 4)}
        else:
            coord = {"lat": round(b, 4), "lon": round(a, 4)}
    if not coord and iata:
        coord = _geocode_airport(iata, name)
    return {"iata": iata, "icao": icao, "name": name, "coord": coord}


def _nearby_aircraft(coord: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not coord:
        return []
    lat, lon = _float_or_none(coord.get("lat")), _float_or_none(coord.get("lon"))
    if lat is None or lon is None:
        return []
    cache_key = f"near:{round(lat, 2)}:{round(lon, 2)}"
    hit = _cache_get(cache_key, _TTL_ADSB)
    if isinstance(hit, dict) and "rows" in hit:
        return list(hit.get("rows") or [])
    try:
        resp = requests.get(
            _ADSB_NEAR_URL.format(lat=lat, lon=lon, nm=80),
            headers={"User-Agent": _UA, "Accept": "application/json"},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json() if resp.content else {}
    except requests.exceptions.RequestException as exc:
        logger.info("Nearby ADS-B failed: %s", exc)
        _cache_set(cache_key, {"rows": []})
        return []
    rows: list[dict[str, Any]] = []
    here = {"lat": lat, "lon": lon}
    for ac in data.get("ac") or []:
        if not isinstance(ac, dict):
            continue
        alat, alon = _float_or_none(ac.get("lat")), _float_or_none(ac.get("lon"))
        if alat is None or alon is None:
            continue
        alt_raw = ac.get("alt_baro")
        on_ground = str(alt_raw).lower() == "ground" or _int_or_none(alt_raw) == 0
        gs = _int_or_none(ac.get("gs"))
        dist = _haversine_km(here, {"lat": alat, "lon": alon})
        if not on_ground and gs is not None and gs < 40 and dist is not None and dist < 8:
            on_ground = True
        cs = re.sub(r"\s+", "", str(ac.get("flight") or "").strip().upper())
        rows.append(
            {
                "lat": round(alat, 4),
                "lon": round(alon, 4),
                "altitude_ft": 0 if on_ground else _int_or_none(alt_raw),
                "speed_kts": gs,
                "heading": _int_or_none(ac.get("track")),
                "callsign": cs,
                "registration": str(ac.get("r") or "").strip(),
                "aircraft_type": str(ac.get("t") or "").strip(),
                "on_ground": bool(on_ground),
                "distance_km": dist,
            }
        )
    rows.sort(key=lambda r: (not r.get("on_ground"), r.get("distance_km") if r.get("distance_km") is not None else 9e9))
    _cache_set(cache_key, {"rows": rows})
    return rows


def track_airport(airport: str) -> dict[str, Any]:
    """Live departures / arrivals / nearby for one airport. Never invent times or pins."""
    raw = re.sub(r"[^A-Za-z0-9]", "", str(airport or "")).upper()
    if not raw or len(raw) < 3:
        return {
            "ok": False,
            "mode": "empty",
            "message": "Need an airport code like STV, BOM, or VASU.",
            "airport": None,
        }
    cache_key = f"apt:{raw}"
    hit = _cache_get(cache_key, _TTL_AIRPORT)
    if isinstance(hit, dict) and "ok" in hit:
        return hit
    try:
        resp = requests.get(
            _FA_AIRPORT_URL.format(ident=raw),
            headers={
                "User-Agent": _UA,
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "en-IN,en;q=0.9",
                "Referer": "https://www.flightaware.com/live/",
            },
            timeout=20,
            allow_redirects=True,
        )
        resp.raise_for_status()
        page_html = resp.text or ""
    except requests.exceptions.RequestException as exc:
        logger.info("Airport board failed %s: %s", raw, exc)
        return {
            "ok": False,
            "mode": "empty",
            "message": f"Could not load a live board for {raw}. Try another airport.",
            "airport": None,
        }
    if "Just a moment" in page_html or len(page_html) < 4000:
        return {
            "ok": False,
            "mode": "empty",
            "message": f"Live board for {raw} isn’t available right now.",
            "airport": None,
        }
    meta = _parse_airport_meta(page_html, raw)
    boards = _parse_airport_boards(page_html)
    nearby = _nearby_aircraft(meta.get("coord") if isinstance(meta.get("coord"), dict) else None)
    on_ground = [n for n in nearby if n.get("on_ground")]
    airborne = [n for n in nearby if not n.get("on_ground")]
    total = sum(len(v) for v in boards.values())
    label = " ".join(x for x in (meta.get("name"), meta.get("iata") or meta.get("icao") or raw) if x)
    if total == 0 and not nearby:
        msg = f"No live board rows for {label}. Airport screens still win."
    else:
        msg = (
            f"{label}: {len(boards['departures'])} departures, {len(boards['arrivals'])} arrivals, "
            f"{len(boards['enroute'])} inbound, {len(boards['scheduled'])} scheduled"
            + (f", {len(nearby)} nearby on radar" if nearby else "")
            + "."
        )
    return _cache_set(
        cache_key,
        {
            "ok": True,
            "mode": "ok",
            "message": msg,
            "airport": {
                **meta,
                "requested": raw,
                "departures": boards["departures"],
                "arrivals": boards["arrivals"],
                "enroute": boards["enroute"],
                "scheduled": boards["scheduled"],
                "nearby": nearby,
                "on_ground": on_ground,
                "airborne_nearby": airborne,
            },
        },
    )


def track_flight(flight: str, date: str = "") -> dict[str, Any]:
    parsed = parse_flight_code(flight)
    if not parsed:
        return {
            "ok": False,
            "mode": "empty",
            "message": "Need a flight number like AI 131, 6E 2341, or AKJ359W.",
            "track": None,
            "gps_unable": True,
        }
    day = str(date or "").strip()
    if day and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        day = ""
    if not day:
        day = _today_utc()

    airlabs_key, stack_key = _keys()
    status_err = ""
    track: dict[str, Any] | None = None
    try:
        if airlabs_key:
            track = _from_airlabs(parsed)
        if track is None and stack_key:
            track = _from_aviationstack(parsed, day)
    except ProviderRequestError as exc:
        status_err = str(exc)
        track = None

    callsigns = list(parsed.get("callsigns") or [])
    raw = re.sub(r"[^A-Z0-9]", "", str(flight or "")).upper()
    if raw and raw not in callsigns:
        callsigns.insert(0, raw)
    if track is None:
        try:
            track = _from_live_page(callsigns, parsed, day)
        except Exception as exc:
            logger.info("Live status page parse failed: %s", exc)
            track = None
    if track:
        extra = [track.get("flight_icao"), track.get("flight_iata"), track.get("operating_ident")]
        for c in extra:
            cs = re.sub(r"[^A-Z0-9]", "", str(c or "").upper())
            if cs and cs not in callsigns:
                callsigns.append(cs)

    adsb = None
    airborne = bool(track and track.get("status") in ("en-route", "departed"))
    if not (track and track.get("position")) and (track is None or airborne):
        adsb = _opensky_position(callsigns) or _adsb_position(callsigns)
    if track is None and adsb:
        track = {
            "ok": True,
            "flight_iata": parsed.get("flight_iata") or "",
            "flight_icao": parsed.get("flight_icao") or adsb.get("callsign") or "",
            "airline_iata": parsed.get("airline_iata") or "",
            "airline_icao": parsed.get("airline_icao") or "",
            "airline_name": "",
            "number": parsed.get("number") or "",
            "status": "en-route",
            "status_label": "In air",
            "origin": "",
            "origin_name": "",
            "destination": "",
            "destination_name": "",
            "dep_terminal": "",
            "dep_gate": "",
            "arr_terminal": "",
            "arr_gate": "",
            "dep_scheduled": "",
            "dep_estimated": "",
            "dep_actual": "",
            "arr_scheduled": "",
            "arr_estimated": "",
            "arr_actual": "",
            "delay_minutes": None,
            "aircraft_type": adsb.get("aircraft_type") or "",
            "registration": adsb.get("registration") or "",
            "position": adsb,
            "source": "adsb",
        }
    elif track and adsb and not track.get("position"):
        track = {**track, "position": adsb}
        if not track.get("registration") and adsb.get("registration"):
            track["registration"] = adsb["registration"]
        if not track.get("aircraft_type") and adsb.get("aircraft_type"):
            track["aircraft_type"] = adsb["aircraft_type"]
        if track.get("status") in ("scheduled", "delayed", "departed", "unknown"):
            track["status"] = "en-route"
            track["status_label"] = "In air"

    if not track:
        if status_err:
            msg = (
                f"Live status lookup failed for {parsed.get('flight_iata') or flight}. "
                "Do not invent gate, delay, or position."
            )
        else:
            msg = (
                f"No live status for {parsed.get('flight_iata') or flight} on {day}. "
                "It may not have departed yet, or the feed has no row. Airport screens win."
            )
        return {
            "ok": False,
            "mode": "empty",
            "message": msg,
            "track": None,
            "gps_unable": True,
            "flight_iata": parsed.get("flight_iata") or "",
            "date": day,
        }

    track["date"] = day
    track["gps_unable"] = not bool(track.get("position") and track["position"].get("lat") is not None)
    sources = []
    if track.get("source") == "status" or (airlabs_key or stack_key):
        sources.append("status")
    if track.get("position") and track["position"].get("source") == "adsb":
        sources.append("adsb")
    track["source"] = "+".join(sources) or track.get("source") or "status"
    return {
        "ok": True,
        "mode": "ok",
        "message": "",
        "track": track,
        "gps_unable": bool(track.get("gps_unable")),
        "flight_iata": track.get("flight_iata") or parsed.get("flight_iata") or "",
        "date": day,
    }
