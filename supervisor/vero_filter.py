"""Let Vero Filter — LLM interprets natural-language filters into structured UI filters."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

_OPENAI_URL = "https://api.openai.com/v1/chat/completions"
_MODEL = os.getenv("VERO_FILTER_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-4o-mini"


def _api_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or "").strip()


def _extract_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return {}
    try:
        data = json.loads(m.group(0))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


async def _llm_json(system: str, user: str) -> dict[str, Any]:
    key = _api_key()
    if not key:
        return {"error": "missing_openai", "summary": "OpenAI key missing — using basic matching."}

    payload = {
        "model": _MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=35.0) as client:
        res = await client.post(
            _OPENAI_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        res.raise_for_status()
        body = res.json()
    content = (
        (((body.get("choices") or [{}])[0]).get("message") or {}).get("content")
        or ""
    )
    return _extract_json(content)


def _hotel_fallback(query: str, catalog: list[dict[str, Any]], areas: list[str]) -> dict[str, Any]:
    t = (query or "").lower()
    filters: dict[str, Any] = {
        "areas": [],
        "stars": [],
        "minRating": None,
        "maxPrice": None,
        "freeCancellation": False,
        "breakfast": False,
        "nearAirport": False,
        "keywords": [],
        "matchIds": [],
        "sortBy": None,
    }
    notes: list[str] = []

    pm = re.search(r"(?:under|below|less than|<)\s*[₹$]?\s*([\d,]+)\s*(k)?", t, re.I)
    if pm:
        v = int(pm.group(1).replace(",", ""))
        if pm.group(2):
            v *= 1000
        filters["maxPrice"] = v
        notes.append(f"under {v:,}")

    sm = re.search(r"(\d)\s*[★*]|(\d)\s*star", t)
    if sm:
        s = int(sm.group(1) or sm.group(2))
        if 1 <= s <= 5:
            filters["stars"] = [s]
            notes.append(f"{s}★")

    if re.search(r"breakfast|bb\b", t):
        filters["breakfast"] = True
        notes.append("breakfast")
    if re.search(r"free\s*cancel|refundable", t):
        filters["freeCancellation"] = True
        notes.append("free cancellation")

    if re.search(r"high\s*to\s*low|most\s*expensive|highest\s*price", t):
        filters["sortBy"] = "price_desc"
        notes.append("price high to low")
    elif re.search(r"low\s*to\s*high|cheap|lowest|budget", t):
        filters["sortBy"] = "price_asc"
        notes.append("price low to high")
    if re.search(r"top\s*rat|best\s*rat|highest\s*rat", t):
        filters["sortBy"] = "rating"
        notes.append("top rated")
    if re.search(r"\brecommend", t):
        filters["sortBy"] = "recommended"
        notes.append("recommended")

    if re.search(r"air\s*port|aiport|ariport|airpot|airoport|airprt|aeroport|near\s+air\b", t):
        airport_areas = [a for a in areas if re.search(r"airport|terminal|aiport", a, re.I)]
        if airport_areas:
            filters["areas"] = airport_areas
            notes.append(", ".join(airport_areas[:3]))
        else:
            filters["nearAirport"] = True
            notes.append("near airport")
            # Soft-match hotel names / locations containing airport-ish text
            ids = []
            for h in catalog:
                blob = " ".join(
                    str(h.get(k) or "").lower()
                    for k in ("name", "area", "location", "address", "city")
                )
                if re.search(r"airport|terminal|aiport|air\s*port", blob):
                    hid = h.get("id")
                    if hid:
                        ids.append(str(hid))
            if ids:
                filters["matchIds"] = ids[:40]

    return {
        "domain": "hotels",
        "filters": filters,
        "summary": ("Filtered: " + " · ".join(notes)) if notes else "Couldn't interpret that.",
        "mode": "fallback",
    }


def _flight_fallback(query: str, airlines: list[str]) -> dict[str, Any]:
    t = (query or "").lower()
    filters: dict[str, Any] = {
        "maxPrice": None,
        "airlines": [],
        "stops": [],
        "departureTimes": [],
        "arrivalTimes": [],
        "maxDurationHours": None,
        "excludeLayoverRegions": [],
        "sortBy": None,
    }
    notes: list[str] = []

    pm = re.search(r"(?:under|below|less than|<)\s*[₹$]?\s*([\d,]+)\s*(k)?", t, re.I)
    if pm:
        v = int(pm.group(1).replace(",", ""))
        if pm.group(2):
            v *= 1000
        filters["maxPrice"] = v
        notes.append(f"under {v:,}")

    if re.search(r"no stop|non[- ]?stop|nonstop|direct", t):
        filters["stops"] = ["Direct"]
        notes.append("non-stop only")
    elif re.search(r"1 stop|one stop", t):
        filters["stops"] = ["1 Stop"]
        notes.append("1 stop")

    if re.search(r"(middle\s*east|gulf|dubai|doha|abu\s*dhabi|dxb|doh|auh)", t) and re.search(
        r"(no|not|dont|don't|without|avoid|skip|exclude|which dont|that dont)", t
    ):
        filters["excludeLayoverRegions"] = ["middle_east"]
        notes.append("no Middle East layover")

    matched = [a for a in airlines if a.lower() in t]
    if matched:
        filters["airlines"] = matched
        notes.append(", ".join(matched))

    if re.search(r"high\s*to\s*low|most\s*expensive|highest\s*price|pricey|premium\s*first", t):
        filters["sortBy"] = "price_desc"
        notes.append("price high to low")
    elif re.search(r"cheap|lowest|budget|low\s*to\s*high", t):
        filters["sortBy"] = "cheapest"
        notes.append("cheapest first")
    if re.search(r"\bfast(est)?\b|\bshortest\b", t):
        filters["sortBy"] = "fastest"
        notes.append("fastest first")
    if re.search(r"\brecommend", t):
        filters["sortBy"] = "recommended"
        notes.append("recommended first")
    if re.search(r"morning", t):
        filters["departureTimes"] = ["morning"]
        notes.append("morning")
    if re.search(r"evening|night", t):
        filters["departureTimes"] = ["evening"]
        notes.append("evening")

    return {
        "domain": "flights",
        "filters": filters,
        "summary": ("Filtered: " + " · ".join(notes)) if notes else "Couldn't interpret that.",
        "mode": "fallback",
    }


async def interpret_hotel_filter(
    query: str,
    *,
    areas: list[str] | None = None,
    price_bounds: dict[str, Any] | None = None,
    hotels: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {
            "domain": "hotels",
            "filters": {
                "areas": [],
                "stars": [],
                "minRating": None,
                "maxPrice": None,
                "freeCancellation": False,
                "breakfast": False,
                "nearAirport": False,
                "keywords": [],
                "matchIds": [],
                "sortBy": None,
            },
            "summary": "Filters cleared.",
            "mode": "clear",
        }

    area_list = [str(a) for a in (areas or []) if a][:40]
    catalog = []
    for h in (hotels or [])[:60]:
        catalog.append(
            {
                "id": str(h.get("id") or ""),
                "name": h.get("name"),
                "area": h.get("area"),
                "location": h.get("location") or h.get("address"),
                "city": h.get("city"),
                "stars": h.get("stars"),
                "price": h.get("pricePerNight") or h.get("totalPrice") or h.get("price"),
            }
        )

    if not _api_key():
        return _hotel_fallback(q, catalog, area_list)

    system = (
        "You are Vero, Itinero's hotel filter brain. "
        "Convert the user's messy natural language (typos OK) into JSON filters for the current hotel results. "
        "Understand misspellings like aiport/ariport = airport. "
        "Return ONLY JSON with keys: "
        "maxPrice (number|null), stars (int[]), minRating (number|null), "
        "areas (string[] subset of provided areas), breakfast (bool), freeCancellation (bool), "
        "nearAirport (bool), keywords (string[]), matchIds (string[] of hotel ids that clearly fit), "
        "sortBy ('recommended'|'price_asc'|'price_desc'|'rating'|'stars'|null), "
        "summary (short human string of what you applied). "
        "Prefer nearAirport=true when user wants airport proximity even if no area is named Airport. "
        "Use matchIds when hotel names/locations clearly match (e.g. Airport Hotel). "
        "Do not invent areas outside the provided list."
    )
    user = json.dumps(
        {
            "query": q,
            "areas": area_list,
            "priceBounds": price_bounds or {},
            "hotels": catalog,
        },
        ensure_ascii=False,
    )

    try:
        data = await _llm_json(system, user)
        if data.get("error") == "missing_openai":
            return _hotel_fallback(q, catalog, area_list)

        filters = {
            "areas": [a for a in (data.get("areas") or []) if a in area_list],
            "stars": [int(s) for s in (data.get("stars") or []) if str(s).isdigit() and 1 <= int(s) <= 5],
            "minRating": data.get("minRating"),
            "maxPrice": data.get("maxPrice"),
            "freeCancellation": bool(data.get("freeCancellation")),
            "breakfast": bool(data.get("breakfast")),
            "nearAirport": bool(data.get("nearAirport")),
            "keywords": [str(k) for k in (data.get("keywords") or []) if k][:5],
            "matchIds": [str(i) for i in (data.get("matchIds") or []) if i][:60],
            "sortBy": data.get("sortBy")
            if data.get("sortBy")
            in {"recommended", "price_asc", "price_desc", "rating", "stars"}
            else None,
        }
        # If LLM said near airport but left everything empty, force the flag
        if not filters["nearAirport"] and re.search(
            r"air\s*port|aiport|ariport|airpot|airoport", q, re.I
        ):
            filters["nearAirport"] = True

        summary = str(data.get("summary") or "").strip()
        if not summary:
            bits = []
            if filters["maxPrice"] is not None:
                bits.append(f"under {int(filters['maxPrice']):,}")
            if filters["nearAirport"]:
                bits.append("near airport")
            if filters["stars"]:
                bits.append("★".join(str(s) for s in filters["stars"]) + "★")
            if filters["breakfast"]:
                bits.append("breakfast")
            if filters["areas"]:
                bits.append(", ".join(filters["areas"][:3]))
            summary = ("Filtered: " + " · ".join(bits)) if bits else "Applied Vero filter."

        return {"domain": "hotels", "filters": filters, "summary": summary, "mode": "llm"}
    except Exception as exc:
        fb = _hotel_fallback(q, catalog, area_list)
        fb["mode"] = "fallback"
        fb["message"] = f"LLM filter failed ({exc}); used basic matching."
        return fb


async def interpret_flight_filter(
    query: str,
    *,
    airlines: list[str] | None = None,
    price_bounds: dict[str, Any] | None = None,
) -> dict[str, Any]:
    q = (query or "").strip()
    if not q:
        return {
            "domain": "flights",
            "filters": {
                "maxPrice": None,
                "airlines": [],
                "stops": [],
                "departureTimes": [],
                "arrivalTimes": [],
                "maxDurationHours": None,
                "excludeLayoverRegions": [],
                "sortBy": None,
            },
            "summary": "Filters cleared.",
            "mode": "clear",
        }

    airline_list = [str(a) for a in (airlines or []) if a][:40]
    if not _api_key():
        return _flight_fallback(q, airline_list)

    system = (
        "You are Vero, Itinero's flight filter brain. "
        "Convert messy natural language (typos OK) into JSON filters. "
        "Return ONLY JSON with keys: "
        "maxPrice (number|null), airlines (string[] from provided list), "
        "stops (subset of ['Direct','1 Stop','2+ Stops']), "
        "departureTimes (subset of ['morning','afternoon','evening']), "
        "arrivalTimes (same), maxDurationHours (number|null), "
        "excludeLayoverRegions (e.g. ['middle_east'] when user wants no Gulf/DXB/DOH/AUH layover), "
        "sortBy ('cheapest'|'price_desc'|'fastest'|'recommended'|null), "
        "summary (short human string). "
        "Understand phrases like 'airline which dont take layover in middle east'."
    )
    user = json.dumps(
        {
            "query": q,
            "airlines": airline_list,
            "priceBounds": price_bounds or {},
            "stopOptions": ["Direct", "1 Stop", "2+ Stops"],
            "timeBuckets": ["morning", "afternoon", "evening"],
            "layoverRegions": ["middle_east"],
        },
        ensure_ascii=False,
    )

    try:
        data = await _llm_json(system, user)
        if data.get("error") == "missing_openai":
            return _flight_fallback(q, airline_list)

        stops_ok = {"Direct", "1 Stop", "2+ Stops"}
        times_ok = {"morning", "afternoon", "evening"}
        filters = {
            "maxPrice": data.get("maxPrice"),
            "airlines": [a for a in (data.get("airlines") or []) if a in airline_list],
            "stops": [s for s in (data.get("stops") or []) if s in stops_ok],
            "departureTimes": [t for t in (data.get("departureTimes") or []) if t in times_ok],
            "arrivalTimes": [t for t in (data.get("arrivalTimes") or []) if t in times_ok],
            "maxDurationHours": data.get("maxDurationHours"),
            "excludeLayoverRegions": [
                r for r in (data.get("excludeLayoverRegions") or []) if r in {"middle_east"}
            ],
            "sortBy": data.get("sortBy")
            if data.get("sortBy") in {"cheapest", "price_desc", "fastest", "recommended", "price_asc"}
            else None,
        }
        summary = str(data.get("summary") or "").strip() or "Applied Vero filter."
        return {"domain": "flights", "filters": filters, "summary": summary, "mode": "llm"}
    except Exception as exc:
        fb = _flight_fallback(q, airline_list)
        fb["mode"] = "fallback"
        fb["message"] = f"LLM filter failed ({exc}); used basic matching."
        return fb
