"""Coach-wise IRCTC fare + availability via RailYatri SA API.

Never invent a fare. Empty/missing class → omit it.
"""
from __future__ import annotations

import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import requests

from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_URL = (
    "https://sa.railyatri.in/api/v3/seat/availability/"
    "{number}/{date}/{src}/{dst}/{cls}/{quota}.json"
)
_CLASSES = ("EC", "EA", "1A", "2A", "3A", "3E", "CC", "SL", "2S")
_CLASS_NAME = {
    "EC": "Exec. Chair",
    "EA": "Anubhuti",
    "1A": "1st AC",
    "2A": "2nd AC",
    "3A": "3rd AC",
    "3E": "AC 3E",
    "CC": "Chair Car",
    "SL": "Sleeper",
    "2S": "2nd Sitting",
}
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_TTL = 90


def _dmy(date_ymd: str) -> str:
    text = (date_ymd or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        y, m, d = text.split("-")
        return f"{d}-{m}-{y}"
    if re.fullmatch(r"\d{2}-\d{2}-\d{4}", text):
        return text
    ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    if text.lower() in ("tomorrow", "kal", "કાલે"):
        ist = ist + timedelta(days=1)
    return ist.strftime("%d-%m-%Y")


def _ymd(date_raw: str) -> str:
    dmy = _dmy(date_raw)
    d, m, y = dmy.split("-")
    return f"{y}-{m}-{d}"


def _one_class(number: str, dmy: str, src: str, dst: str, cls: str, quota: str) -> dict[str, Any] | None:
    url = _URL.format(number=number, date=dmy, src=src, dst=dst, cls=cls, quota=quota)
    try:
        resp = requests.get(
            url,
            params={"device_type_id": "6", "utm_source": "itinero_sa"},
            headers={
                "User-Agent": _UA,
                "Accept": "application/json",
                "Origin": "https://www.railyatri.in",
                "Referer": f"https://www.railyatri.in/seat-availability/{number}",
            },
            timeout=12,
        )
        resp.raise_for_status()
        body = resp.json() if resp.content else {}
    except (requests.exceptions.RequestException, ValueError) as exc:
        logger.debug("fare %s %s failed: %s", number, cls, exc)
        return None
    if not isinstance(body, dict):
        return None
    err = str(body.get("error") or "").strip().lower()
    if "class does not exist" in err or "invalid journey" in err:
        return None
    rows = body.get("seat_availibility") or body.get("seat_availability") or []
    if not isinstance(rows, list) or not rows:
        return None
    row = rows[0] if isinstance(rows[0], dict) else None
    if not row:
        return None
    fare = _int(row.get("total_fare") or row.get("ticket_fare"))
    status = str(row.get("availablity_status") or row.get("availability_status") or row.get("seat_avl_text") or "").strip()
    book_url = str(row.get("ticket_link") or "").strip()
    return {
        "code": cls,
        "name": _CLASS_NAME.get(cls, cls),
        "fare": fare,
        "currency": "INR",
        "status": status,
        "status_text": str(row.get("seat_avl_text") or status).strip(),
        "waitlist": _int(row.get("seat_avl")) if re.search(r"WL|RAC", status, re.I) else None,
        "available": _int(row.get("seat_avl")) if re.search(r"\bAVL\b", status, re.I) else None,
        "bookable": bool(row.get("show_book_button")),
        "book_url": book_url,
        "confirm_chance": str(row.get("cp_perc") or "").strip(),
    }


def _int(val: Any) -> int | None:
    try:
        n = int(val)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def coach_fares(
    train_number: str,
    src: str,
    dst: str,
    date: str = "",
    quota: str = "GN",
) -> dict[str, Any]:
    number = re.sub(r"\D", "", str(train_number or ""))
    src = str(src or "").strip().upper()
    dst = str(dst or "").strip().upper()
    quota = (quota or "GN").strip().upper() or "GN"
    if not re.fullmatch(r"\d{4,5}", number) or not src or not dst:
        raise ProviderRequestError("railyatri_sa", "Need train number, from and to station codes.")
    dmy = _dmy(date)
    ymd = _ymd(date)
    cache_key = f"{number}:{src}:{dst}:{dmy}:{quota}"
    hit = _CACHE.get(cache_key)
    if hit and time.time() - hit[0] < _TTL:
        return hit[1]

    classes: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futs = {
            pool.submit(_one_class, number, dmy, src, dst, cls, quota): cls
            for cls in _CLASSES
        }
        by_code: dict[str, dict[str, Any]] = {}
        for fut in as_completed(futs):
            item = fut.result()
            if item and item.get("code"):
                by_code[item["code"]] = item
    for cls in _CLASSES:
        if cls in by_code:
            classes.append(by_code[cls])

    out = {
        "ok": bool(classes),
        "train_number": number,
        "from_code": src,
        "to_code": dst,
        "date": ymd,
        "quota": quota,
        "classes": classes,
        "source": "railyatri_sa",
    }
    _CACHE[cache_key] = (time.time(), out)
    return out
