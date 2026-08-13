"""Explore destinations catalog - supervisor source of truth."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_DATA_PATH = Path(__file__).resolve().parent / "data" / "explore_destinations.json"

_FLIGHT_HOURS = {
    "india": 2.5,
    "asia": 6,
    "middle_east": 4.5,
    "europe": 10,
    "americas": 16,
    "africa": 10,
    "oceania": 12,
}


def _infer_markets(dest: dict[str, Any]) -> list[str]:
    explicit = dest.get("markets")
    if isinstance(explicit, list) and explicit:
        return [str(m).strip().upper() for m in explicit if str(m).strip()]
    continent = str(dest.get("continent") or "").lower()
    country = str(dest.get("country") or "")
    if continent == "india" or country == "India":
        return ["IN", "*"]
    if country == "USA":
        return ["US", "*"]
    if country == "Canada":
        return ["CA", "*"]
    if country == "UK":
        return ["GB", "*"]
    if country == "UAE":
        return ["AE", "*"]
    if country in ("Australia", "New Zealand", "Fiji"):
        return ["AU", "*"]
    if country == "Singapore":
        return ["SG", "*"]
    if country == "Japan":
        return ["JP", "*"]
    return ["*"]


def _visible_in_market(dest: dict[str, Any], market: str | None) -> bool:
    """Explore stays browsable globally; market only boosts affinity.

    Still hide pure IN-only rows from non-IN default feeds when markets=["IN"]
    without "*". Rows with "*" remain visible everywhere.
    """
    market_s = (market or "").strip().upper()
    if not market_s or market_s in ("ANY", "ALL", "GLOBAL"):
        return True
    markets = _infer_markets(dest)
    if "*" in markets or "GLOBAL" in markets:
        return True
    if market_s in markets:
        return True
    # Non-home single-market destinations (e.g. IN-only) stay hidden from other homes
    # unless they opted into "*".
    return False


def _card_view(dest: dict[str, Any]) -> dict[str, Any]:
    image_id = str(dest.get("imageId") or "").strip()
    image = str(dest.get("image") or "").strip()
    if not image and image_id:
        image = (
            f"https://images.unsplash.com/{image_id}"
            "?ixlib=rb-4.0.3&auto=format&fit=crop&w=900&q=80"
        )
    continent = str(dest.get("continent") or "")
    return {
        "id": dest.get("id"),
        "slug": dest.get("slug") or dest.get("id"),
        "city": dest.get("city"),
        "country": dest.get("country"),
        "continent": continent,
        "iata": dest.get("iata") or "",
        "themes": list(dest.get("themes") or []),
        "image": image,
        "imageId": image_id or None,
        "blurb": dest.get("blurb") or "",
        "trendingScore": int(dest.get("trendingScore") or 70),
        "minTripDays": int(dest.get("minTripDays") or 3),
        "lat": dest.get("lat"),
        "lng": dest.get("lng"),
        "flightHoursApprox": float(
            dest.get("flightHoursApprox") or _FLIGHT_HOURS.get(continent, 8)
        ),
        "markets": _infer_markets(dest),
    }


def _load() -> list[dict[str, Any]]:
    if not _DATA_PATH.exists():
        return []
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        item = dict(row)
        item["markets"] = _infer_markets(item)
        out.append(item)
    return out


def find_destination(dest_id: str) -> dict[str, Any] | None:
    needle = str(dest_id or "").strip().lower()
    if not needle:
        return None
    for dest in _load():
        if str(dest.get("id") or "").lower() == needle:
            return dest
        if str(dest.get("slug") or "").lower() == needle:
            return dest
    return None


def list_destinations(
    *,
    market: str | None = None,
    continent: str | None = None,
    theme: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    rows = _load()
    continent_s = (continent or "").strip().lower()
    theme_s = (theme or "").strip().lower()
    q_s = (q or "").strip().lower()
    market_s = (market or "").strip().upper()

    out: list[dict[str, Any]] = []
    for dest in rows:
        if not _visible_in_market(dest, market_s):
            continue
        if continent_s and continent_s != "any" and str(dest.get("continent") or "").lower() != continent_s:
            continue
        if theme_s and theme_s != "any":
            themes = [str(t).lower() for t in (dest.get("themes") or [])]
            if theme_s not in themes:
                continue
        if q_s:
            blob = " ".join(
                [
                    str(dest.get("city") or ""),
                    str(dest.get("country") or ""),
                    str(dest.get("blurb") or ""),
                    " ".join(dest.get("themes") or []),
                ]
            ).lower()
            if q_s not in blob:
                continue
        out.append(_card_view(dest))

    out.sort(key=lambda d: (-int(d.get("trendingScore") or 0), str(d.get("city") or "")))
    continents = sorted({str(d.get("continent") or "") for d in rows if d.get("continent")})
    return {
        "destinations": out,
        "total": len(out),
        "continents": continents,
        "market": market_s or None,
        "mode": "live",
        "message": "Explore catalog · market-tagged destinations",
    }
