"""Indian Railways trains-between-stations via eRail (no API key).

Google Routes TRANSIT does not cover IRCTC on most India corridors
(Surat→Vadodara returns private buses). eRail lists real train numbers.
Search only — never invent waitlist or book.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any

import requests

from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

ERAIL_TRAINS_URL = "https://erail.in/rail/getTrains.aspx"
_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 30 * 60
_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TRAIN_NO = re.compile(r"^\d{4,5}$")


def _cache_get(key: str) -> list[dict[str, Any]] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, rows = hit
    if time.time() - ts > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return rows


def trains_between(stn_from: str, stn_to: str) -> list[dict[str, Any]]:
    src = (stn_from or "").strip().upper()
    dst = (stn_to or "").strip().upper()
    if not src or not dst or src == dst:
        raise ProviderRequestError("eRail", "from and to station codes are required")
    cache_key = f"{src}:{dst}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        resp = requests.get(
            ERAIL_TRAINS_URL,
            params={
                "Station_From": src,
                "Station_To": dst,
                "DataSource": "0",
                "Language": "0",
            },
            headers={"User-Agent": _UA, "Accept": "*/*", "Referer": "https://erail.in/"},
            timeout=18,
        )
        resp.raise_for_status()
        text = resp.text or ""
    except requests.exceptions.RequestException as exc:
        logger.warning("eRail trains failed %s→%s: %s", src, dst, exc)
        raise ProviderRequestError("eRail", str(exc)) from exc

    rows = _parse_trains(text, src, dst)
    _CACHE[cache_key] = (time.time(), rows)
    return rows


def _parse_trains(raw: str, src: str, dst: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for chunk in (raw or "").split("^")[1:]:
        fields = chunk.split("~")
        if len(fields) < 14:
            continue
        number = str(fields[0] or "").strip()
        if not _TRAIN_NO.match(number) or number in seen:
            continue
        seen.add(number)
        kind = ""
        for idx in (32, 50):
            if idx < len(fields) and str(fields[idx] or "").strip():
                kind = str(fields[idx]).strip()
                break
        out.append(
            {
                "number": number,
                "name": str(fields[1] or "").strip().title() or f"Train {number}",
                "from_name": str(fields[6] or "").strip(),
                "from_code": str(fields[7] or src).strip().upper(),
                "to_name": str(fields[8] or "").strip(),
                "to_code": str(fields[9] or dst).strip().upper(),
                "dep": str(fields[10] or "").strip(),
                "arr": str(fields[11] or "").strip(),
                "duration": str(fields[12] or "").strip(),
                "rundays": re.sub(r"[^01]", "", str(fields[13] or ""))[:7],
                "kind": kind,
                "source": "erail",
            }
        )
    return out
