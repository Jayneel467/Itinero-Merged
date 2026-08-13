"""Author agent - proposes Explore destination drafts for a market."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import STATUS_DRAFT


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _dest(
    *,
    id: str,
    city: str,
    country: str,
    continent: str,
    iata: str,
    themes: list[str],
    blurb: str,
    markets: list[str],
    lat: float,
    lng: float,
    trending_score: int = 80,
    min_trip_days: int = 3,
    image_id: str = "photo-1506905925346-21bda4d32df4",
) -> dict[str, Any]:
    return {
        "id": id,
        "slug": id,
        "city": city,
        "country": country,
        "continent": continent,
        "iata": iata,
        "themes": themes,
        "imageId": image_id,
        "blurb": blurb,
        "trendingScore": trending_score,
        "minTripDays": min_trip_days,
        "lat": lat,
        "lng": lng,
        "markets": markets,
        "pipeline": {
            "status": STATUS_DRAFT,
            "market": markets[0] if markets else "GLOBAL",
            "authoredAt": _now(),
            "author": "explore_factory.author.seed",
        },
    }


# Expand over time / replace with LLM author.
SEED_BANK: dict[str, list[dict[str, Any]]] = {
    "US": [
        _dest(
            id="boston",
            city="Boston",
            country="USA",
            continent="americas",
            iata="BOS",
            themes=["city", "food", "culture"],
            blurb="Harbour walks, university energy, and New England seafood.",
            markets=["US", "*"],
            lat=42.36,
            lng=-71.06,
            trending_score=84,
            image_id="photo-1501594907352-04cda38ebc29",
        ),
        _dest(
            id="austin",
            city="Austin",
            country="USA",
            continent="americas",
            iata="AUS",
            themes=["city", "food", "adventure"],
            blurb="Live music, breakfast tacos, and Hill Country day trips.",
            markets=["US", "*"],
            lat=30.27,
            lng=-97.74,
            trending_score=85,
            image_id="photo-1531219572328-a0171b4448a3",
        ),
        _dest(
            id="new-orleans",
            city="New Orleans",
            country="USA",
            continent="americas",
            iata="MSY",
            themes=["city", "food", "culture"],
            blurb="Jazz nights, Creole tables, and Mississippi light.",
            markets=["US", "*"],
            lat=29.95,
            lng=-90.07,
            trending_score=86,
            image_id="photo-1569949381669-ecf31ae8e613",
        ),
        _dest(
            id="washington-dc",
            city="Washington, D.C.",
            country="USA",
            continent="americas",
            iata="DCA",
            themes=["city", "culture", "family"],
            blurb="Monuments, museums, and cherry-blossom springs.",
            markets=["US", "*"],
            lat=38.85,
            lng=-77.04,
            trending_score=83,
            image_id="photo-1501466044931-62695aada8ed",
        ),
        _dest(
            id="portland",
            city="Portland",
            country="USA",
            continent="americas",
            iata="PDX",
            themes=["city", "food", "hills"],
            blurb="Coffee, forests, and Cascades weekend escapes.",
            markets=["US", "*"],
            lat=45.59,
            lng=-122.60,
            trending_score=81,
            image_id="photo-1469474968028-56623f02e42e",
        ),
        _dest(
            id="savannah",
            city="Savannah",
            country="USA",
            continent="americas",
            iata="SAV",
            themes=["city", "culture", "food"],
            blurb="Oak-lined squares and slow Southern evenings.",
            markets=["US", "*"],
            lat=32.08,
            lng=-81.09,
            trending_score=80,
            min_trip_days=2,
            image_id="photo-1546156929-a4c0ac41164c",
        ),
    ],
    "GB": [
        _dest(
            id="edinburgh",
            city="Edinburgh",
            country="UK",
            continent="europe",
            iata="EDI",
            themes=["city", "culture", "hills"],
            blurb="Castle views, festival energy, and highland day trips.",
            markets=["GB", "*"],
            lat=55.95,
            lng=-3.19,
            trending_score=88,
            image_id="photo-1506377247377-2a5b3b417ebb",
        ),
    ],
    "IN": [],
}


def author_drafts(market: str, *, limit: int = 8, use_llm: bool | None = None) -> list[dict[str, Any]]:
    code = str(market or "").strip().upper() or "US"
    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    want_llm = use_llm
    if want_llm is None:
        try:
            from supervisor.catalog_llm import available as llm_available

            want_llm = llm_available()
        except Exception:
            want_llm = False

    if want_llm:
        try:
            from supervisor.explore_structured import list_destinations
            from supervisor.explore_factory.llm_author import llm_author_destinations

            existing = [str(d.get("id")) for d in (list_destinations().get("destinations") or [])]
            llm = llm_author_destinations(code, count=limit, existing_ids=existing)
            for dest in llm.get("destinations") or []:
                did = str(dest.get("id") or "")
                if not did or did in seen:
                    continue
                seen.add(did)
                out.append(dest)
        except Exception:
            pass

    for raw in list(SEED_BANK.get(code) or []):
        did = str(raw.get("id") or "")
        if not did or did in seen:
            continue
        seen.add(did)
        draft = dict(raw)
        pipeline = dict(draft.get("pipeline") or {})
        pipeline.update(
            {
                "status": STATUS_DRAFT,
                "market": code,
                "authoredAt": _now(),
                "author": "explore_factory.author.seed",
            }
        )
        draft["pipeline"] = pipeline
        draft["markets"] = list(draft.get("markets") or [code])
        out.append(draft)
        if len(out) >= max(1, limit):
            break
    return out[: max(1, limit)] if out else out
