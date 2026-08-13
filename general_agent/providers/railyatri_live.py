"""Public RailYatri live-running page → structured status. Not GPS.

This is an operational status feed (station message / next stop), NOT a
physical live location of an IRCTC train. Never invent coordinates or
"between X and Y" from a timetable + clock.
"""
from __future__ import annotations

import html as html_lib
import json
import logging
import re
import time
from typing import Any
from urllib.parse import parse_qs, unquote

import requests

from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_URL = "https://www.railyatri.in/live-train-status/{number}"
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL = 45
_NEXT = re.compile(
    r'<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)</script>',
)


def live_status(train_number: str, start_day: int = 0) -> dict[str, Any]:
    number = re.sub(r"\D", "", str(train_number or ""))
    if not re.fullmatch(r"\d{4,5}", number):
        raise ProviderRequestError("railyatri", "Need a 4–5 digit train number.")
    day = 0 if start_day not in (0, 1, 2) else int(start_day)
    cache_key = f"{number}:{day}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]

    url = _URL.format(number=number)
    params = {"start_day": str(day)} if day else None
    try:
        resp = requests.get(
            url,
            params=params,
            headers={"User-Agent": _UA, "Accept": "text/html", "Referer": "https://www.railyatri.in/"},
            timeout=16,
        )
        resp.raise_for_status()
        html = resp.text or ""
    except requests.exceptions.RequestException as exc:
        logger.warning("RailYatri live failed %s: %s", number, exc)
        raise ProviderRequestError("railyatri", str(exc)) from exc

    match = _NEXT.search(html)
    if not match:
        raise ProviderRequestError("railyatri", "Live page had no status payload.")
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ProviderRequestError("railyatri", "Live page JSON invalid.") from exc

    props = ((payload.get("props") or {}).get("pageProps") or {})
    lts = props.get("ltsData") if isinstance(props.get("ltsData"), dict) else {}
    timetable = props.get("timeTableData")
    schedule = _route_from_timetable(timetable)
    live_stops = _live_stop_rows(lts)
    stations = _merge_route_with_live(schedule, lts, live_stops) or live_stops
    loc_info = lts.get("current_location_info") if isinstance(lts.get("current_location_info"), list) else []
    loc_msgs = [
        str(x.get("message") or "").strip()
        for x in loc_info
        if isinstance(x, dict) and x.get("message")
    ]
    next_stop = lts.get("next_stoppage_info") if isinstance(lts.get("next_stoppage_info"), dict) else {}
    bubble = lts.get("bubble_message") if isinstance(lts.get("bubble_message"), dict) else {}
    delay = _first_int(lts, "delay", "delay_minutes", "late_by")
    title = str(lts.get("title") or "").strip() or (loc_msgs[0] if loc_msgs else "")
    out = {
        "ok": bool(lts.get("success", True)) and bool(lts or stations),
        "source": "railyatri_running_status",
        "source_url": url if not day else f"{url}?start_day={day}",
        "is_gps": False,
        "gps_unable": bool(lts.get("gps_unable", True)),
        "train_number": str(lts.get("train_number") or number),
        "train_name": str(lts.get("train_name") or "").strip(),
        "title": title,
        "message": str(lts.get("new_message") or lts.get("disclaimer") or "").strip(),
        "status_as_of": str(lts.get("status_as_of") or "").strip(),
        "updated_at": str(lts.get("update_time") or "").strip(),
        "start_date": str(lts.get("train_start_date") or props.get("trainStartDate") or "").strip(),
        "std": str(lts.get("std") or "").strip(),
        "source_code": str(lts.get("source") or "").strip(),
        "source_name": str(lts.get("source_stn_name") or "").strip(),
        "dest_code": str(lts.get("destination") or "").strip(),
        "dest_name": str(lts.get("dest_stn_name") or "").strip(),
        "at_source": bool(lts.get("at_src")),
        "at_destination": bool(lts.get("at_dstn")),
        "is_run_day": lts.get("is_run_day"),
        "next_station_code": str(
            lts.get("next_station_code") or next_stop.get("next_stoppage") or ""
        ).strip(),
        "next_station_name": str(
            lts.get("next_station_name") or next_stop.get("next_stoppage") or ""
        ).strip(),
        "next_in": str(next_stop.get("next_stoppage_time_diff") or "").strip(),
        "platform": lts.get("platform_number"),
        "run_days": str(lts.get("run_days") or "").strip(),
        "pantry": lts.get("pantry_available"),
        "journey_minutes": lts.get("journey_time"),
        "refresh_seconds": lts.get("cur_refresh_interval") or lts.get("refresh_interval") or 60,
        "delay_minutes": delay,
        "on_time": delay == 0 if delay is not None else None,
        "current_station": str(
            lts.get("current_station_name")
            or lts.get("current_station")
            or lts.get("cur_stn")
            or ""
        ).strip(),
        "current_station_code": str(lts.get("current_station_code") or "").strip(),
        "current_eta": str(lts.get("eta") or "").strip(),
        "current_etd": str(lts.get("etd") or "").strip(),
        "ahead_text": str(lts.get("ahead_distance_text") or "").strip(),
        "distance_km": _first_int(lts, "distance_from_source"),
        "total_km": _first_int(lts, "total_distance"),
        "avg_speed": _first_int(lts, "avg_speed"),
        "location_messages": loc_msgs[:4],
        "bubble": {
            "station": str(bubble.get("station_name") or "").strip(),
            "text": str(bubble.get("message_type") or "").strip(),
            "hint": str(bubble.get("station_time") or "").strip(),
        }
        if bubble
        else None,
        "stations": stations,
        "schedule_stops": len([s for s in schedule if s.get("is_stop")]),
        "schedule_points": len(schedule),
        "pass_points": len([s for s in stations if not s.get("is_stop")]),
    }
    _CACHE[cache_key] = (time.time(), out)
    return out


def _first_int(data: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        val = data.get(key)
        if val is None or val == "":
            continue
        try:
            return int(float(val))
        except (TypeError, ValueError):
            continue
    return None


_PNR_URL = "https://www.railyatri.in/pnr-status/{pnr}"
_PNR_TTL = 90
_QUOTA_LABEL = {
    "PQWL": "Pooled quota waitlist",
    "GNWL": "General waitlist",
    "RLWL": "Remote-location waitlist",
    "TQWL": "Tatkal waitlist",
    "RSWL": "Roadside waitlist",
    "RAC": "Reservation against cancellation",
    "CNF": "Confirmed",
    "WL": "Waitlist",
    "W/L": "Waitlist",
}
_CLASS_CODE = {
    "ac first class": "1A",
    "ac first": "1A",
    "first class": "FC",
    "ac 2 tier": "2A",
    "ac 3 tier": "3A",
    "ac 3 economy": "3E",
    "ac 3e": "3E",
    "3a": "3A",
    "2a": "2A",
    "1a": "1A",
    "3e": "3E",
    "sleeper": "SL",
    "sl": "SL",
    "chair car": "CC",
    "ac chair car": "CC",
    "executive chair car": "EC",
    "exec chair": "EC",
    "second sitting": "2S",
    "2s": "2S",
}


def pnr_status(pnr: str) -> dict[str, Any]:
    digits = re.sub(r"\D", "", str(pnr or ""))
    if not re.fullmatch(r"\d{10}", digits):
        raise ProviderRequestError("pnr", "PNR must be 10 digits.")
    cache_key = f"pnr:{digits}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _PNR_TTL:
        return hit[1]

    url = _PNR_URL.format(pnr=digits)
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": _UA, "Accept": "text/html", "Referer": "https://www.railyatri.in/pnr-status"},
            timeout=18,
        )
        resp.raise_for_status()
        page = resp.text or ""
    except requests.exceptions.RequestException as exc:
        logger.warning("PNR lookup failed %s: %s", digits, exc)
        raise ProviderRequestError("pnr", str(exc)) from exc

    parsed = _parse_pnr_next_blob(page, digits, url)
    if not parsed or not parsed.get("ok"):
        html_parsed = _parse_ry_pnr_html(page, digits, url)
        if html_parsed.get("ok") or not parsed:
            parsed = html_parsed
    if parsed and parsed.get("ok"):
        _CACHE[cache_key] = (time.time(), parsed)
        return parsed
    err = (parsed or {}).get("error") or "PNR not found or chart not available."
    raise ProviderRequestError("pnr", err)


def _html_text(blob: str) -> str:
    text = re.sub(r"(?is)<script.*?</script>", " ", blob or "")
    text = re.sub(r"(?is)<style.*?</style>", " ", text)
    text = re.sub(r"(?is)<br\s*/?>", " ", text)
    text = html_lib.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"\s+", " ", text).strip()


def _pnr_field(page: str, label: str) -> str:
    m = re.search(
        rf'(?is)pnr-normal-font[^>]*>\s*{re.escape(label)}\s*</p>\s*<p[^>]*>(.*?)</p>',
        page,
    )
    return _html_text(m.group(1)) if m else ""


def _station_block(page: str, label: str) -> tuple[str, str, str]:
    m = re.search(
        rf'(?is)pnr-normal-font[^>]*>\s*{re.escape(label)}\s*</p>\s*'
        r'<p class="pnr-bold-txt">\s*(.*?)</p>\s*(?:<p>\s*(.*?)</p>)?',
        page,
    )
    if not m:
        return "", "", ""
    place = _html_text(m.group(1))
    when = _html_text(m.group(2) or "")
    name, code = place, ""
    if "|" in place:
        name, code = [p.strip() for p in place.split("|", 1)]
    return name.title() if name else "", code.upper(), when


def _class_code(label: str) -> str:
    key = re.sub(r"\s+", " ", (label or "").lower()).strip()
    return _CLASS_CODE.get(key, "")


def _quota_code(text: str) -> str:
    blob = (text or "").upper().replace(" ", "")
    m = re.search(r"\b(PQWL|GNWL|RLWL|TQWL|RSWL|RAC|CNF)\b", (text or "").upper())
    if m:
        return m.group(1)
    if blob in {"W/L", "WL"} or re.search(r"\bWAITLIST\b", (text or "").upper()):
        return "WL"
    return ""


def _wl_number(text: str) -> int | None:
    m = re.search(r"(?:PQWL|GNWL|RLWL|TQWL|RSWL|WL)\s*/\s*(\d+)", text or "", re.I)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    m = re.search(r"(\d+)\s*waitlist", text or "", re.I)
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def _looks_like_seat(raw: str) -> bool:
    text = (raw or "").strip()
    if not text or re.search(r"waitlist|\bwl\b|\brac\b|probability|confirm", text, re.I):
        return False
    return bool(re.match(r"^[A-Z]{1,2}\d{1,3}\s*[/,-]\s*\d", text, re.I) or re.match(r"^[A-Z]{1,2}\d{1,3}$", text, re.I))


def _split_coach_berth(raw: str) -> tuple[str, str]:
    text = (raw or "").strip()
    if not text:
        return "", ""
    m = re.match(r"^([A-Z]{1,2}\d{1,3})\s*[/,-]\s*(\d{1,3}[A-Z]?)$", text, re.I)
    if m:
        return m.group(1).upper(), m.group(2).upper()
    m = re.match(r"^([A-Z]{1,2}\d{1,3})\s+(\d{1,3}[A-Z]?)$", text, re.I)
    if m:
        return m.group(1).upper(), m.group(2).upper()
    return "", text


def _enrich_from_passenger_query(page: str, passengers: list[dict[str, Any]]) -> dict[str, Any]:
    extra: dict[str, Any] = {}
    m = re.search(r"get-passenger-details\?([^\"'\s>]+)", page, re.I)
    if not m:
        return extra
    qs = parse_qs(unquote(html_lib.unescape(m.group(1).replace("&amp;", "&"))))
    travel = (qs.get("travel_date") or [""])[0]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", travel or ""):
        extra["journey_ymd"] = travel
    for i, row in enumerate(passengers):
        def take(*keys: str) -> str:
            for key in keys:
                vals = qs.get(f"passenger_details[][{key}]") or qs.get(f"passenger_details[{i}][{key}]")
                if vals and str(vals[0]).strip() and str(vals[0]).strip() not in {"--", "-"}:
                    return str(vals[0]).replace("+", " ").strip()
            return ""

        current_code = take("current_booking_status")
        if current_code:
            row["current_code"] = current_code.upper()
        booked = take("booking_status")
        if booked and not row.get("booking_status"):
            row["booking_status"] = booked
        code = take("status")
        if code:
            row["status_code"] = code.upper()
        pct = take("conf_percentage")
        level = take("conf_probability")
        msg = take("conf_message")
        if pct or level:
            try:
                pct_n = int(float(pct)) if pct else None
            except ValueError:
                pct_n = None
            row["confirm_pct"] = pct_n
            row["confirm_level"] = (level or "").upper()
            row["confirm_note"] = msg
        berth_type = take("berth_type")
        if berth_type and re.search(r"[A-Za-z]{2,}", berth_type):
            row["berth_type"] = berth_type
        coach = take("coach_position")
        if coach and _looks_like_seat(coach):
            row["coach"] = coach.upper()
        seat = take("seat_number")
        if seat and _looks_like_seat(seat.replace(",", "/").replace(" ", "")):
            c, b = _split_coach_berth(seat.replace(",", "/"))
            if c:
                row["coach"] = c
                row["berth"] = b or row.get("berth") or ""
        quota = _quota_code(row.get("current_code") or row.get("booking_status") or row.get("status_code") or "")
        if quota:
            row["quota"] = quota
            row["wl_booked"] = _wl_number(row.get("booking_status") or "")
            row["wl_current"] = _wl_number(row.get("current_code") or row.get("current_status") or "")
    return extra


def _parse_ry_pnr_html(page: str, pnr: str, url: str) -> dict[str, Any]:
    low = (page or "").lower()
    if re.search(r"flushed pnr|pnr not yet generated|invalid pnr|incorrect pnr", low):
        return {"ok": False, "error": "PNR not found or flushed.", "pnr": pnr, "source": "partner_pnr"}

    overall = _pnr_field(page, "CURRENT STATUS")
    chart = _pnr_field(page, "CHART STATUS")
    journey_date = _pnr_field(page, "DAY OF BOARDING")
    class_name = _pnr_field(page, "CLASS")
    platform = _pnr_field(page, "PF# (TENTATIVE)") or _pnr_field(page, "PF#")
    from_name, from_code, dep = _station_block(page, "FROM")
    to_name, to_code, arr = _station_block(page, "TO")

    train_no = ""
    train_name = ""
    tm = re.search(
        r"(?is)TRAIN NAME\s*:.*?<span[^>]*>\s*(\d{4,5})\s*<span>\s*"
        r"(?:&#8210;|&ndash;|&mdash;|–|—|-)\s*(.*?)</span>",
        page,
    )
    if tm:
        train_no = tm.group(1)
        train_name = _html_text(tm.group(2))
    if not train_no:
        tm = re.search(r"(?is)time-table/(\d{4,5})-", page)
        if tm:
            train_no = tm.group(1)

    passengers: list[dict[str, Any]] = []
    for i, li in enumerate(re.finditer(r'(?is)<li class="PNRPasList">(.*?)</li>', page), start=1):
        block = li.group(1)
        vals = [_html_text(x) for x in re.findall(r'(?is)<p class="[^"]*statusType[^"]*"[^>]*>(.*?)</p>', block)]
        booking = vals[0] if len(vals) > 0 else ""
        current = vals[1] if len(vals) > 1 else ""
        third = vals[2] if len(vals) > 2 else ""
        coach, berth, coach_berth = "", "", ""
        if _looks_like_seat(third):
            coach_berth = third
            coach, berth = _split_coach_berth(third)
        cp = re.search(
            r"cp_cnf\(\s*'[^']*'\s*,\s*'(\d+)'\s*,\s*'([A-Z]+)'\s*,\s*'([^']*)'",
            block,
            re.I,
        )
        quota = _quota_code(f"{booking} {current} {overall}")
        row = {
            "index": i,
            "booking_status": booking,
            "current_status": current,
            "current_code": booking if re.search(r"WL|RAC|CNF", booking, re.I) else "",
            "coach": coach,
            "berth": berth,
            "coach_berth": coach_berth,
            "status_code": quota or overall,
            "quota": quota,
            "wl_booked": _wl_number(booking),
            "wl_current": _wl_number(current) or _wl_number(booking),
        }
        if cp:
            try:
                row["confirm_pct"] = int(cp.group(1))
            except ValueError:
                row["confirm_pct"] = None
            row["confirm_level"] = cp.group(2).upper()
            row["confirm_note"] = html_lib.unescape(cp.group(3)).replace("</br>", " ").strip()
        passengers.append(row)
    query_extra = _enrich_from_passenger_query(page, passengers)

    if not train_no and not overall and not passengers:
        if re.search(r"please wait while we are fetching|retry after", low):
            return {"ok": False, "error": "Partner feed has no status yet. Try again shortly.", "pnr": pnr, "source": "partner_pnr"}
        return {"ok": False, "error": "PNR page had no status payload.", "pnr": pnr, "source": "partner_pnr"}

    duration = ""
    dm = re.search(r"(?is)JOURNEY TIME.*?<span class='pnr-bold-txt'>(.*?)</span>\s*<span class='pnr-bold-txt'>(.*?)</span>", page)
    if dm:
        duration = f"{_html_text(dm.group(1))} {_html_text(dm.group(2))}".strip()

    quota = next((p.get("quota") for p in passengers if p.get("quota")), _quota_code(overall))
    confirm = next((p for p in passengers if p.get("confirm_level") or p.get("confirm_pct") is not None), {})
    cancel = re.search(
        r"(?is)Cancellation<br\s*/?>\s*Probability.*?data-count=(\d+).*?<strong>\s*(Low|Medium|High)",
        page,
    )
    resched = re.search(
        r"(?is)Reschedule<br\s*/?>\s*Probability.*?data-count=(\d+).*?<strong>\s*(Low|Medium|High)",
        page,
    )
    chart_prepared = bool(re.search(r"\bprepared\b", chart or "", re.I)) and not re.search(r"\bnot\b", chart or "", re.I)

    out = {
        "ok": True,
        "source": "partner_pnr",
        "source_url": url,
        "pnr": pnr,
        "train_number": train_no,
        "train_name": train_name,
        "from_code": from_code,
        "from_name": from_name,
        "to_code": to_code,
        "to_name": to_name,
        "dep": dep,
        "arr": arr,
        "duration": duration,
        "journey_date": journey_date,
        "journey_ymd": query_extra.get("journey_ymd") or "",
        "chart_status": chart,
        "chart_prepared": chart_prepared,
        "class_code": _class_code(class_name) or class_name,
        "class_name": class_name,
        "overall_status": overall,
        "quota": quota,
        "quota_label": _QUOTA_LABEL.get(quota or "", ""),
        "platform": platform,
        "passenger_count": len(passengers),
        "confirm_pct": confirm.get("confirm_pct"),
        "confirm_level": confirm.get("confirm_level") or "",
        "confirm_note": confirm.get("confirm_note") or "",
        "cancel_risk": (cancel.group(2).title() if cancel else ""),
        "cancel_count": int(cancel.group(1)) if cancel else None,
        "reschedule_risk": (resched.group(2).title() if resched else ""),
        "reschedule_count": int(resched.group(1)) if resched else None,
        "passengers": passengers,
    }
    return out


def _parse_pnr_next_blob(page: str, pnr: str, url: str) -> dict[str, Any] | None:
    match = _NEXT.search(page or "")
    if not match:
        return None
    try:
        payload = json.loads(match.group(1).strip())
    except json.JSONDecodeError:
        return None
    blob = ((payload.get("props") or {}).get("pageProps") or {})
    data = None
    for key in ("pnrData", "pnrDetails", "pnr_details", "data", "pnr"):
        val = blob.get(key)
        if isinstance(val, dict) and val:
            data = val
            break
    if data is None and isinstance(blob, dict) and (blob.get("trainNumber") or blob.get("train_number")):
        data = blob
    if not isinstance(data, dict):
        return None

    passengers = []
    raw_pax = data.get("passengerList") or data.get("passengers") or data.get("passenger_list") or []
    if isinstance(raw_pax, list):
        for i, row in enumerate(raw_pax, start=1):
            if not isinstance(row, dict):
                continue
            coach_berth = str(row.get("currentStatusDetails") or row.get("seat") or "").strip()
            coach = str(row.get("coach") or row.get("coachNumber") or "").strip()
            berth = str(row.get("berth") or row.get("berthNo") or "").strip()
            if not coach and coach_berth:
                coach, berth = _split_coach_berth(coach_berth)
            passengers.append(
                {
                    "index": i,
                    "booking_status": str(row.get("bookingStatus") or row.get("booking_status") or row.get("status") or "").strip(),
                    "current_status": str(row.get("currentStatus") or row.get("current_status") or "").strip(),
                    "coach": coach,
                    "berth": berth,
                    "coach_berth": coach_berth,
                    "status_code": str(row.get("statusCode") or row.get("status") or "").strip().upper(),
                }
            )
    train_no = str(data.get("trainNumber") or data.get("train_number") or data.get("trainNo") or "").strip()
    class_name = str(data.get("class") or data.get("journeyClass") or data.get("class_code") or "").strip()
    out = {
        "ok": True,
        "source": "partner_pnr",
        "source_url": url,
        "pnr": pnr,
        "train_number": re.sub(r"\D", "", train_no),
        "train_name": str(data.get("trainName") or data.get("train_name") or "").strip(),
        "from_code": str(data.get("boardingPoint") or data.get("from") or data.get("from_station") or "").strip(),
        "from_name": str(data.get("fromName") or data.get("from_name") or "").strip(),
        "to_code": str(data.get("reservationUpto") or data.get("to") or data.get("to_station") or "").strip(),
        "to_name": str(data.get("toName") or data.get("to_name") or "").strip(),
        "dep": str(data.get("departure") or data.get("std") or "").strip(),
        "arr": str(data.get("arrival") or data.get("sta") or "").strip(),
        "duration": "",
        "journey_date": str(data.get("journeyDate") or data.get("date") or data.get("doj") or "").strip(),
        "chart_status": str(data.get("chartStatus") or data.get("chart_status") or data.get("chartPrepared") or "").strip(),
        "class_code": _class_code(class_name) or class_name,
        "class_name": class_name,
        "overall_status": str(data.get("currentStatus") or data.get("status") or "").strip(),
        "platform": str(data.get("platform") or data.get("platformNumber") or "").strip(),
        "passengers": passengers,
    }
    if not out["train_number"] and not out["chart_status"] and not out["overall_status"] and not passengers:
        return {"ok": False, "error": "PNR not found or chart not available.", "pnr": pnr, "source": "partner_pnr"}
    return out


_INFRA_NAME = re.compile(
    r"\b(CABIN|YARD|OUTER|BLOCK(?:\s+HUT)?|BY-?PASS|LOOP|SIDING)\b",
    re.I,
)


def _mins_hhmm(raw: Any) -> str:
    try:
        mins = int(raw)
    except (TypeError, ValueError):
        return ""
    if mins < 0:
        return ""
    h, m = divmod(mins % (24 * 60), 60)
    return f"{h:02d}:{m:02d}"


def _hhmm_from_row(row: dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = row.get(key)
        if isinstance(val, str) and ":" in val.strip():
            return val.strip()
    for key in keys:
        hhmm = _mins_hhmm(row.get(key))
        if hhmm and hhmm != "00:00":
            return hhmm
    return ""


def _shift_hhmm(hhmm: str, delay: int | None) -> str:
    if not hhmm or delay in (None, 0):
        return hhmm or ""
    try:
        h, m = [int(x) for x in hhmm.split(":")[:2]]
    except (TypeError, ValueError):
        return hhmm
    total = (h * 60 + m + int(delay)) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}"


def _pretty_stn(name: str) -> str:
    text = str(name or "").replace("~", "").strip()
    if not text:
        return ""
    if text.isupper() or any(ch.isdigit() for ch in text):
        return text.title()
    return text


def _is_infra_point(name: str, code: str) -> bool:
    blob = f"{name} {code}"
    return bool(_INFRA_NAME.search(blob))


def _route_from_timetable(timetable: Any) -> list[dict[str, Any]]:
    rows: list[Any] = []
    if isinstance(timetable, list) and timetable and isinstance(timetable[0], dict) and isinstance(timetable[0].get("route"), list):
        rows = timetable[0]["route"]
    elif isinstance(timetable, dict) and isinstance(timetable.get("route"), list):
        rows = timetable["route"]
    elif isinstance(timetable, list):
        rows = timetable
    out: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("station_name") or row.get("name") or "").strip()
        code = str(row.get("station_code") or row.get("code") or "").strip().upper()
        if not name and not code:
            continue
        is_stop = row.get("stop")
        if is_stop is None:
            is_stop = True
        sta = _hhmm_from_row(row, "sta", "sta_min", "today_sta")
        std = _hhmm_from_row(row, "std", "std_min")
        if not sta and std:
            sta = std
        if not std and sta:
            std = sta
        out.append(
            {
                "name": _pretty_stn(name),
                "code": code,
                "sta": sta,
                "std": std,
                "eta": "",
                "etd": "",
                "delay_minutes": None,
                "platform": row.get("platform_number") or row.get("platform"),
                "halt": _first_int(row, "halt"),
                "distance_km": _first_int(row, "distance_from_source", "distance", "distance_km"),
                "food": bool(row.get("food_available") or (row.get("food_data") or {}).get("food_available")),
                "day": _first_int(row, "day", "d_day", "a_day"),
                "is_stop": bool(is_stop),
                "phase": "",
            }
        )
    return out


def _live_row(row: dict[str, Any], phase: str) -> dict[str, Any] | None:
    code = str(row.get("station_code") or "").strip().upper()
    name = str(row.get("station_name") or "").strip()
    if not code and not name:
        return None
    arr_delay = _first_int(row, "arrival_delay", "delay_minutes", "delay")
    dep_delay = _first_int(row, "departure_delay")
    halt = _first_int(row, "halt")
    stop_flag = row.get("stop")
    is_stop = bool(stop_flag) if stop_flag is not None else True
    return {
        "name": _pretty_stn(name),
        "code": code,
        "sta": str(row.get("sta") or "").strip(),
        "std": str(row.get("std") or "").strip(),
        "eta": str(row.get("eta") or "").strip(),
        "etd": str(row.get("etd") or "").strip(),
        "delay_minutes": arr_delay if arr_delay is not None else dep_delay,
        "arrival_delay": arr_delay,
        "departure_delay": dep_delay,
        "platform": row.get("platform_number") or row.get("platform"),
        "halt": halt,
        "distance_km": _first_int(row, "distance_from_source", "distance"),
        "food": bool(row.get("food_available") or (row.get("food_data") or {}).get("food_available")),
        "day": _first_int(row, "a_day", "day"),
        "is_stop": is_stop,
        "phase": phase,
        "hint": str(row.get("distance_from_current_station_txt") or "").strip(),
    }


def _live_stop_rows(lts: dict[str, Any]) -> list[dict[str, Any]]:
    prev = lts.get("previous_stations") if isinstance(lts.get("previous_stations"), list) else []
    upcoming = lts.get("upcoming_stations") if isinstance(lts.get("upcoming_stations"), list) else []
    out: list[dict[str, Any]] = []
    for row in prev:
        if isinstance(row, dict):
            item = _live_row(row, "departed")
            if item:
                out.append(item)
    next_marked = False
    for row in upcoming:
        if not isinstance(row, dict):
            continue
        item = _live_row(row, "upcoming")
        if not item:
            continue
        if not next_marked:
            item["phase"] = "next"
            next_marked = True
        out.append(item)
    if lts.get("at_src") and out:
        out[0]["phase"] = "current"
    if lts.get("at_dstn") and out:
        out[-1]["phase"] = "arrived"
    return out


def _merge_route_with_live(
    schedule: list[dict[str, Any]],
    lts: dict[str, Any],
    live_stops: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Full route (halts + passenger no-halts) with live eta/etd overlaid.

    Cabins/yards stay hidden unless the feed's current point is one of them.
    Never invent a current station from the clock — only the live feed.
    """
    if not schedule:
        return live_stops
    live_by = {str(s.get("code") or "").upper(): s for s in live_stops if s.get("code")}
    cur_code = str(lts.get("current_station_code") or "").strip().upper()
    delay = _first_int(lts, "delay", "delay_minutes", "late_by")
    cur_eta = str(lts.get("eta") or "").strip()
    cur_etd = str(lts.get("etd") or "").strip()

    rows: list[dict[str, Any]] = []
    for base in schedule:
        code = str(base.get("code") or "").upper()
        name = str(base.get("name") or "")
        keep = bool(base.get("is_stop")) or not _is_infra_point(name, code) or code == cur_code
        if not keep:
            continue
        item = dict(base)
        live = live_by.get(code)
        if live:
            for key in (
                "sta",
                "std",
                "eta",
                "etd",
                "delay_minutes",
                "arrival_delay",
                "departure_delay",
                "platform",
                "halt",
                "hint",
                "food",
                "day",
                "distance_km",
            ):
                if live.get(key) not in (None, ""):
                    item[key] = live[key]
            if live.get("is_stop") is False:
                item["is_stop"] = False
        if code == cur_code:
            item["phase"] = "current"
            if cur_eta:
                item["eta"] = cur_eta
            if cur_etd:
                item["etd"] = cur_etd
            if delay is not None:
                item["delay_minutes"] = delay
                item["arrival_delay"] = delay
                item["departure_delay"] = delay
        if not item.get("eta"):
            item["eta"] = _shift_hhmm(item.get("sta") or "", delay)
        if not item.get("etd"):
            item["etd"] = _shift_hhmm(item.get("std") or item.get("sta") or "", delay)
        if not item.get("is_stop"):
            item["halt"] = 0
            if not item.get("std"):
                item["std"] = item.get("sta") or ""
            if not item.get("etd"):
                item["etd"] = item.get("eta") or item.get("sta") or ""
        rows.append(item)

    codes = [str(s.get("code") or "").upper() for s in rows]
    ci = codes.index(cur_code) if cur_code and cur_code in codes else -1
    if ci < 0 and live_stops:
        last_prev = next((s for s in reversed(live_stops) if s.get("phase") == "departed" and s.get("code") in codes), None)
        if last_prev:
            ci = codes.index(str(last_prev["code"]).upper())
    next_marked = False
    for i, item in enumerate(rows):
        if lts.get("at_src") and i == 0:
            item["phase"] = "current"
            continue
        if lts.get("at_dstn") and i == len(rows) - 1:
            item["phase"] = "arrived"
            continue
        if ci >= 0:
            if i < ci:
                item["phase"] = "departed" if item.get("is_stop") else "passed"
            elif i == ci:
                item["phase"] = "current"
            elif item.get("is_stop") and not next_marked:
                item["phase"] = "next"
                next_marked = True
            else:
                item["phase"] = "upcoming"
        elif not item.get("phase"):
            item["phase"] = "upcoming"
    return rows
