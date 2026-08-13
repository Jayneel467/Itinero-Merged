"""LLM-powered Explore destination author (Gemini/Groq via catalog_llm)."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from supervisor.catalog_llm import available, generate_json, resolve_model, resolve_provider

from . import STATUS_DRAFT

_SLUG_RE = re.compile(r"[^a-z0-9\-]+")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _slugify(raw: str) -> str:
    s = str(raw or "").strip().lower().replace(" ", "-")
    return _SLUG_RE.sub("", s).strip("-")[:60] or "destination"


_PROMPT = """You add Explore destinations for Itinero's worldwide travel catalog.

Return JSON only:
{{
  "destinations": [
    {{
      "id": "kebab-case",
      "slug": "kebab-case",
      "city": "City",
      "country": "Country",
      "continent": "india|asia|middle_east|europe|americas|africa|oceania",
      "iata": "ABC",
      "themes": ["city", "food"],
      "blurb": "one sentence pitch ending with a period",
      "trendingScore": 80,
      "minTripDays": 3,
      "lat": 0.0,
      "lng": 0.0,
      "markets": ["*"]
    }}
  ]
}}

Rules:
- Target market: {market}
- Prefer worldwide variety; for country markets include some domestic cities for that home.
- Real coordinates and IATA codes only.
- Avoid existing ids: {existing}
- Create {count} destinations.
"""


def llm_author_destinations(
    market: str,
    *,
    count: int = 5,
    existing_ids: list[str] | None = None,
) -> dict[str, Any]:
    if not available():
        return {
            "ok": False,
            "destinations": [],
            "provider": "none",
            "error": "catalog LLM not configured (set GEMINI_API_KEY)",
        }

    code = str(market or "GLOBAL").strip().upper() or "GLOBAL"
    existing = [str(s) for s in (existing_ids or [])][:100]
    prompt = _PROMPT.format(
        market=code,
        existing=", ".join(existing) or "(none)",
        count=max(1, min(int(count), 10)),
    )
    try:
        data = generate_json(prompt, temperature=0.45)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "destinations": [], "provider": resolve_provider(), "error": str(exc)}

    rows = data.get("destinations") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return {
            "ok": False,
            "destinations": [],
            "provider": resolve_provider(),
            "error": "LLM did not return destinations[]",
        }

    out: list[dict[str, Any]] = []
    seen = set(existing)
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        city = str(raw.get("city") or "").strip()
        if not city:
            continue
        dest_id = _slugify(str(raw.get("id") or raw.get("slug") or city))
        if dest_id in seen:
            continue
        try:
            lat = float(raw.get("lat"))
            lng = float(raw.get("lng"))
        except (TypeError, ValueError):
            continue
        markets = raw.get("markets") if isinstance(raw.get("markets"), list) else ["*"]
        markets = [str(m).upper() for m in markets] or ["*"]
        out.append(
            {
                "id": dest_id,
                "slug": _slugify(str(raw.get("slug") or dest_id)),
                "city": city,
                "country": str(raw.get("country") or "").strip() or "Unknown",
                "continent": str(raw.get("continent") or "europe").strip().lower(),
                "iata": str(raw.get("iata") or "").strip().upper()[:4],
                "themes": [str(t).lower() for t in (raw.get("themes") or ["city"]) if str(t).strip()],
                "imageId": "",
                "blurb": str(raw.get("blurb") or f"{city} is worth a trip.").strip(),
                "trendingScore": int(raw.get("trendingScore") or 78),
                "minTripDays": int(raw.get("minTripDays") or 3),
                "lat": lat,
                "lng": lng,
                "markets": markets,
                "pipeline": {
                    "status": STATUS_DRAFT,
                    "market": code,
                    "authoredAt": _now(),
                    "author": f"explore_factory.llm.{resolve_provider()}",
                    "model": resolve_model(),
                },
            }
        )
        seen.add(dest_id)

    return {
        "ok": bool(out),
        "destinations": out,
        "provider": resolve_provider(),
        "model": resolve_model(),
        "count": len(out),
    }


_PROMPT_PLACE = """You add ONE Explore destination for Itinero for a place a traveler just searched.

Return JSON only:
{{
  "destinations": [
    {{
      "id": "kebab-case",
      "slug": "kebab-case",
      "city": "{city}",
      "country": "{country}",
      "continent": "india|asia|middle_east|europe|americas|africa|oceania",
      "iata": "ABC",
      "themes": ["culture", "pilgrimage"],
      "blurb": "one sentence pitch ending with a period",
      "trendingScore": 82,
      "minTripDays": 2,
      "lat": 0.0,
      "lng": 0.0,
      "markets": ["{market}"]
    }}
  ]
}}

Rules:
- city MUST be {city}
- country hint: {country}
- Real coordinates and nearest real IATA only
- Avoid existing ids: {existing}
- Create exactly 1 destination
"""


def llm_author_destination_for_place(
    city: str,
    *,
    market: str = "IN",
    country: str | None = None,
    existing_ids: list[str] | None = None,
) -> dict[str, Any]:
    place = str(city or "").strip()
    if not place:
        return {"ok": False, "destinations": [], "error": "city_required"}
    if not available():
        return {
            "ok": False,
            "destinations": [],
            "provider": "none",
            "error": "catalog LLM not configured (set GEMINI_API_KEY)",
        }

    code = str(market or "IN").strip().upper() or "IN"
    country_s = str(country or ("India" if code == "IN" else "")).strip() or "Unknown"
    existing = [str(s) for s in (existing_ids or [])][:100]
    prompt = _PROMPT_PLACE.format(
        city=place,
        country=country_s,
        market=code if code not in ("GLOBAL", "WORLD") else "*",
        existing=", ".join(existing) or "(none)",
    )
    try:
        data = generate_json(prompt, temperature=0.35)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "destinations": [], "provider": resolve_provider(), "error": str(exc)}

    rows = data.get("destinations") if isinstance(data, dict) else data
    if not isinstance(rows, list) or not rows:
        if isinstance(data, dict) and data.get("city"):
            rows = [data]
        else:
            return {
                "ok": False,
                "destinations": [],
                "provider": resolve_provider(),
                "error": "LLM did not return destinations[]",
            }

    out: list[dict[str, Any]] = []
    seen = set(existing)
    for raw in rows[:1]:
        if not isinstance(raw, dict):
            continue
        raw = {**raw, "city": place, "country": country_s}
        dest_id = _slugify(str(raw.get("id") or raw.get("slug") or place))
        if dest_id in seen:
            dest_id = f"{dest_id}-place"
        try:
            lat = float(raw.get("lat"))
            lng = float(raw.get("lng"))
        except (TypeError, ValueError):
            # Rough India fallback; Gemini should provide coords
            lat, lng = 0.0, 0.0
        markets = raw.get("markets") if isinstance(raw.get("markets"), list) else [code]
        markets = [str(m).upper() for m in markets] or [code]
        out.append(
            {
                "id": dest_id,
                "slug": _slugify(str(raw.get("slug") or dest_id)),
                "city": place,
                "country": country_s,
                "continent": str(raw.get("continent") or ("india" if code == "IN" else "asia")).strip().lower(),
                "iata": str(raw.get("iata") or "").strip().upper()[:4],
                "themes": [str(t).lower() for t in (raw.get("themes") or ["city"]) if str(t).strip()],
                "imageId": "",
                "blurb": str(raw.get("blurb") or f"{place} is worth a trip.").strip(),
                "trendingScore": int(raw.get("trendingScore") or 82),
                "minTripDays": int(raw.get("minTripDays") or 2),
                "lat": lat,
                "lng": lng,
                "markets": markets,
                "pipeline": {
                    "status": STATUS_DRAFT,
                    "market": code,
                    "authoredAt": _now(),
                    "author": f"explore_factory.llm.demand.{resolve_provider()}",
                    "model": resolve_model(),
                },
            }
        )
        seen.add(dest_id)

    return {
        "ok": bool(out),
        "destinations": out,
        "provider": resolve_provider(),
        "model": resolve_model(),
        "count": len(out),
        "city": place,
    }
