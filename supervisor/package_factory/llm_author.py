"""LLM-powered package author (Gemini/Groq via catalog_llm — not core OpenAI)."""

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
    s = _SLUG_RE.sub("", s)
    return s.strip("-")[:60] or "package"


def _normalize_pkg(raw: dict[str, Any], *, market: str) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    city = str(raw.get("stayCity") or raw.get("city") or (raw.get("destinations") or ["City"])[0]).strip()
    if not city:
        return None
    slug = _slugify(str(raw.get("slug") or raw.get("title") or city))
    days = int(raw.get("durationDays") or raw.get("days") or 4)
    days = max(3, min(days, 8))
    nights = int(raw.get("durationNights") or max(1, days - 1))
    themes = [str(t).lower() for t in (raw.get("themes") or [raw.get("theme") or "city"]) if str(t).strip()]
    theme = str(raw.get("theme") or (themes[0] if themes else "city")).lower()
    region = str(raw.get("region") or ("domestic" if market not in ("GLOBAL", "*", "WORLD") else "international")).lower()
    if region not in ("domestic", "international"):
        region = "international"
    markets = raw.get("markets")
    if not isinstance(markets, list) or not markets:
        markets = ["*"] if region == "international" or market in ("GLOBAL", "WORLD") else [market]
    markets = [str(m).upper() for m in markets]

    blueprints = raw.get("dayBlueprints") or raw.get("itinerary") or []
    if not isinstance(blueprints, list) or len(blueprints) < 2:
        blueprints = []
        for i in range(1, days + 1):
            blueprints.append(
                {
                    "day": i,
                    "title": f"Day {i} in {city}" if i < days else "Depart",
                    "description": f"Flexible day in {city}.",
                    "stayCity": city,
                    "anchors": [city],
                    "activities": ["Explore", "Local food"] if i < days else ["Breakfast", "Airport transfer"],
                }
            )
    else:
        fixed = []
        for i, row in enumerate(blueprints[:days], 1):
            if not isinstance(row, dict):
                continue
            stay = str(row.get("stayCity") or city)
            fixed.append(
                {
                    "day": int(row.get("day") or i),
                    "title": str(row.get("title") or f"Day {i}"),
                    "description": str(row.get("description") or row.get("narrative") or f"Day in {stay}."),
                    "stayCity": stay,
                    "anchors": list(row.get("anchors") or [stay]),
                    "activities": list(row.get("activities") or ["Explore"]),
                }
            )
        blueprints = fixed

    gateway = str(raw.get("gateway") or (raw.get("flight") or {}).get("gatewayAirport") or "").upper()
    if len(gateway) < 3:
        gateway = "XXX"
    currency = str(raw.get("currency") or "USD").upper()

    from supervisor.destination_covers import fill_package_cover

    return fill_package_cover({
        "id": f"pkg-{slug}",
        "slug": slug,
        "title": str(raw.get("title") or f"{city} Escape").strip(),
        "tagline": str(raw.get("tagline") or raw.get("blurb") or f"A {theme} break in {city}.").strip(),
        "overview": str(
            raw.get("overview")
            or f"{days}-day plan based in {city}. Live stays when you pick dates."
        ).strip(),
        "theme": theme,
        "themes": themes or [theme],
        "region": region,
        "markets": markets,
        "productType": "curated_template",
        "travelStyle": theme,
        "requiredAnchors": [],
        "routeConcept": list(raw.get("destinations") or [city]),
        "recommendedDurationDays": [days, days + 2],
        "minDurationDays": max(2, days - 1),
        "durationDays": days,
        "durationNights": nights,
        "destinations": list(raw.get("destinations") or [city]),
        "flight": {
            "gatewayAirport": gateway,
            "gatewayCity": str((raw.get("flight") or {}).get("gatewayCity") or city),
        },
        "coverImage": "",
        "gallery": [],
        "highlights": list(raw.get("highlights") or [f"{city} walk", "Local food", "Easy pacing"])[:5],
        "inclusions": list(
            raw.get("inclusions")
            or [
                "Validated day-by-day plan for your dates",
                "Live hotel stays for each base city",
                "Package confirmation with structured itinerary",
            ]
        ),
        "exclusions": list(
            raw.get("exclusions")
            or [
                "Flights into the gateway city",
                "Personal expenses and tips",
                "Optional activities not listed as included",
            ]
        ),
        "idealMonths": list(raw.get("idealMonths") or ["Apr", "May", "Jun", "Sep", "Oct"]),
        "difficulty": str(raw.get("difficulty") or "Easy"),
        "groupSizeHint": str(raw.get("groupSizeHint") or "Couples & small groups"),
        "featured": bool(raw.get("featured")),
        "currency": currency,
        "stay": {"city": city, "minStars": 3, "boardHint": "Breakfast"},
        "itinerary": blueprints,
        "dayBlueprints": blueprints,
        "pipeline": {
            "status": STATUS_DRAFT,
            "market": market,
            "authoredAt": _now(),
            "author": f"package_factory.llm.{resolve_provider()}",
            "model": resolve_model(),
            "checks": [],
        },
    })


_PROMPT = """You write curated holiday PACKAGE templates for Itinero's worldwide catalog.

Return JSON only:
{{
  "packages": [
    {{
      "slug": "kebab-case-id",
      "title": "...",
      "tagline": "one short line",
      "overview": "2-3 sentences",
      "theme": "city|beach|food|adventure|culture|honeymoon|hills|safari|wellness|hiking|biking|trekking|scuba|ski",
      "themes": ["city", "food", "hiking"],
      "region": "domestic|international",
      "markets": ["*"] or ["US"] etc,
      "destinations": ["City"],
      "durationDays": 4,
      "durationNights": 3,
      "gateway": "IATA",
      "currency": "USD",
      "idealMonths": ["Apr", "May"],
      "highlights": ["...", "...", "..."],
      "stayCity": "City",
      "dayBlueprints": [
        {{"day": 1, "title": "...", "description": "...", "stayCity": "City", "anchors": ["City"], "activities": ["..."]}}
      ]
    }}
  ]
}}

Rules:
- Target market code: {market}
- If market is GLOBAL: region=international, markets=["*"], cities across Europe/Asia/ME/Africa/Americas/Oceania.
- If market is a country (US/GB/AE/...): prefer domestic city breaks for that home; markets=[that code].
- Do NOT invent live prices.
- Avoid these existing slugs: {existing}
- Create {count} fresh, realistic packages with real city IATA gateways.
- Each package needs full dayBlueprints for every day.
"""


def llm_author_packages(
    market: str,
    *,
    count: int = 4,
    existing_slugs: list[str] | None = None,
) -> dict[str, Any]:
    """Author packages via cheap catalog LLM. Returns {ok, packages, provider, error?}."""
    if not available():
        return {
            "ok": False,
            "packages": [],
            "provider": "none",
            "error": "catalog LLM not configured (set GEMINI_API_KEY)",
        }

    code = str(market or "GLOBAL").strip().upper() or "GLOBAL"
    existing = [str(s) for s in (existing_slugs or [])][:80]
    prompt = _PROMPT.format(
        market=code,
        existing=", ".join(existing) or "(none)",
        count=max(1, min(int(count), 8)),
    )
    try:
        data = generate_json(prompt, temperature=0.5)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "packages": [], "provider": resolve_provider(), "error": str(exc)}

    rows = data.get("packages") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return {
            "ok": False,
            "packages": [],
            "provider": resolve_provider(),
            "error": "LLM did not return packages[]",
        }

    out: list[dict[str, Any]] = []
    seen = set(existing)
    for raw in rows:
        pkg = _normalize_pkg(raw, market=code)
        if not pkg:
            continue
        if pkg["slug"] in seen:
            pkg["slug"] = f"{pkg['slug']}-{code.lower()}"
            pkg["id"] = f"pkg-{pkg['slug']}"
        if pkg["slug"] in seen:
            continue
        seen.add(pkg["slug"])
        out.append(pkg)

    return {
        "ok": bool(out),
        "packages": out,
        "provider": resolve_provider(),
        "model": resolve_model(),
        "count": len(out),
    }


_PROMPT_PLACE = """You write ONE curated holiday PACKAGE template for Itinero for a specific place the traveler just searched.

Return JSON only:
{{
  "packages": [
    {{
      "slug": "kebab-case-id",
      "title": "...",
      "tagline": "one short line",
      "overview": "2-3 sentences",
      "theme": "city|beach|food|adventure|culture|honeymoon|hills|safari|wellness|pilgrimage",
      "themes": ["culture", "pilgrimage"],
      "region": "domestic|international",
      "markets": ["IN"] or ["*"],
      "destinations": ["{city}"],
      "durationDays": 3,
      "durationNights": 2,
      "gateway": "IATA",
      "currency": "{currency}",
      "idealMonths": ["Oct", "Nov"],
      "highlights": ["...", "...", "..."],
      "stayCity": "{city}",
      "dayBlueprints": [
        {{"day": 1, "title": "...", "description": "...", "stayCity": "{city}", "anchors": ["{city}"], "activities": ["..."]}}
      ]
    }}
  ]
}}

Rules:
- The package MUST be about {city}{country_bit}. stayCity and destinations must include {city}.
- Target traveler market: {market}
- Use a real nearby airport IATA gateway (3 letters).
- Do NOT invent live prices.
- Avoid existing slugs: {existing}
- Full dayBlueprints for every day (3-5 days typical for a first trip).
- Create exactly 1 package.
"""


def llm_author_package_for_place(
    city: str,
    *,
    market: str = "IN",
    country: str | None = None,
    existing_slugs: list[str] | None = None,
) -> dict[str, Any]:
    """Author a single package for a demanded city via Gemini/catalog LLM."""
    place = str(city or "").strip()
    if not place:
        return {"ok": False, "packages": [], "error": "city_required"}
    if not available():
        return {
            "ok": False,
            "packages": [],
            "provider": "none",
            "error": "catalog LLM not configured (set GEMINI_API_KEY)",
        }

    code = str(market or "IN").strip().upper() or "IN"
    existing = [str(s) for s in (existing_slugs or [])][:80]
    country_s = str(country or "").strip()
    currency = "INR" if code == "IN" else "USD"
    prompt = _PROMPT_PLACE.format(
        city=place,
        country_bit=f" ({country_s})" if country_s else "",
        market=code,
        currency=currency,
        existing=", ".join(existing) or "(none)",
    )
    try:
        data = generate_json(prompt, temperature=0.4)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "packages": [], "provider": resolve_provider(), "error": str(exc)}

    rows = data.get("packages") if isinstance(data, dict) else data
    if not isinstance(rows, list) or not rows:
        # Accept single object
        if isinstance(data, dict) and data.get("title"):
            rows = [data]
        else:
            return {
                "ok": False,
                "packages": [],
                "provider": resolve_provider(),
                "error": "LLM did not return packages[]",
            }

    out: list[dict[str, Any]] = []
    seen = set(existing)
    for raw in rows[:1]:
        if isinstance(raw, dict):
            raw = {**raw, "stayCity": place, "destinations": list(raw.get("destinations") or [place])}
            if place not in raw["destinations"]:
                raw["destinations"] = [place] + list(raw["destinations"])
        pkg = _normalize_pkg(raw, market=code)
        if not pkg:
            continue
        # Force place identity
        pkg["stay"] = {**(pkg.get("stay") or {}), "city": place}
        dests = [place] + [d for d in (pkg.get("destinations") or []) if str(d).lower() != place.lower()]
        pkg["destinations"] = dests
        if pkg["slug"] in seen:
            pkg["slug"] = f"{_slugify(place)}-escape"
            pkg["id"] = f"pkg-{pkg['slug']}"
        seen.add(pkg["slug"])
        out.append(pkg)

    return {
        "ok": bool(out),
        "packages": out,
        "provider": resolve_provider(),
        "model": resolve_model(),
        "count": len(out),
        "city": place,
    }
