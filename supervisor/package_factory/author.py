"""Author agent - proposes package drafts worldwide (not USA-only).

MVP: deterministic seed templates across GLOBAL + home markets.
Later: swap in LLM author; keep the same template shape.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import STATUS_DRAFT

# Home markets the daily curator walks by default.
WORLD_MARKETS = ("US", "IN", "GB", "AE", "SG", "AU", "JP", "CA", "EU")

try:
    from supervisor.catalog_llm import available
except Exception:  # pragma: no cover
    def available() -> bool:  # type: ignore
        return False


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _days(city: str, titles: list[str], activities: list[list[str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, title in enumerate(titles, 1):
        acts = activities[i - 1] if i - 1 < len(activities) else [f"Day in {city}"]
        out.append(
            {
                "day": i,
                "title": title,
                "description": f"{title} in {city}.",
                "stayCity": city,
                "anchors": [city],
                "activities": acts,
            }
        )
    return out


def _base(
    *,
    slug: str,
    title: str,
    tagline: str,
    overview: str,
    theme: str,
    themes: list[str],
    region: str,
    markets: list[str],
    destinations: list[str],
    days: int,
    nights: int,
    gateway: str,
    gateway_city: str,
    stay_city: str,
    highlights: list[str],
    blueprints: list[dict[str, Any]],
    featured: bool = False,
    currency: str = "USD",
    ideal_months: list[str] | None = None,
) -> dict[str, Any]:
    from supervisor.destination_covers import fill_package_cover

    return fill_package_cover({
        "id": f"pkg-{slug}",
        "slug": slug,
        "title": title,
        "tagline": tagline,
        "overview": overview,
        "theme": theme,
        "themes": themes,
        "region": region,
        "markets": markets,
        "productType": "curated_template",
        "travelStyle": theme,
        "requiredAnchors": [],
        "routeConcept": destinations[:],
        "recommendedDurationDays": [days, days + 2],
        "minDurationDays": max(2, days - 1),
        "durationDays": days,
        "durationNights": nights,
        "destinations": destinations,
        "flight": {"gatewayAirport": gateway, "gatewayCity": gateway_city},
        "coverImage": "",
        "gallery": [],
        "highlights": highlights,
        "inclusions": [
            "Validated day-by-day plan for your dates",
            "Live hotel stays for each base city",
            "Package confirmation with structured itinerary",
        ],
        "exclusions": [
            "Flights into the gateway city",
            "Personal expenses and tips",
            "Optional activities not listed as included",
        ],
        "idealMonths": ideal_months
        or ["Apr", "May", "Jun", "Sep", "Oct"],
        "difficulty": "Easy",
        "groupSizeHint": "Couples & small groups",
        "featured": featured,
        "currency": currency,
        "stay": {"city": stay_city, "minStars": 3, "boardHint": "Breakfast"},
        "itinerary": blueprints,
        "dayBlueprints": blueprints,
        "pipeline": {
            "status": STATUS_DRAFT,
            "market": markets[0] if markets else "GLOBAL",
            "authoredAt": _now(),
            "author": "package_factory.author.seed",
            "checks": [],
        },
    })


def _city_pkg(
    *,
    slug: str,
    title: str,
    city: str,
    country_blurb: str,
    theme: str,
    themes: list[str],
    region: str,
    markets: list[str],
    gateway: str,
    days: int = 4,
    nights: int | None = None,
    highlights: list[str] | None = None,
    featured: bool = False,
    currency: str = "USD",
    ideal_months: list[str] | None = None,
    day_titles: list[str] | None = None,
) -> dict[str, Any]:
    nights = nights if nights is not None else max(1, days - 1)
    titles = day_titles or (
        [f"Arrive {city}", f"{city} highlights", f"Neighbourhood day", "Depart"][:days]
        if days <= 4
        else [f"Arrive {city}", f"{city} icons", "Deep dive day", "Free day", "Depart"][:days]
    )
    while len(titles) < days:
        titles.append(f"Day {len(titles) + 1} in {city}")
    titles = titles[:days]
    activities = [
        ["Check in", "Evening walk"],
        ["City highlights", "Local lunch"],
        ["Neighbourhood explore", "Sunset"],
        ["Museum or viewpoint", "Cafe stop"],
        ["Breakfast", "Airport transfer"],
    ]
    acts = [activities[min(i, len(activities) - 1)] for i in range(days)]
    acts[-1] = ["Breakfast", "Airport transfer"]
    return _base(
        slug=slug,
        title=title,
        tagline=country_blurb,
        overview=f"{days}-day plan based in {city}. Live stays when you pick dates - not a frozen brochure price.",
        theme=theme,
        themes=themes,
        region=region,
        markets=markets,
        destinations=[city],
        days=days,
        nights=nights,
        gateway=gateway,
        gateway_city=city,
        stay_city=city,
        highlights=highlights or [f"{city} walk", "Local food", "Easy pacing"],
        blueprints=_days(city, titles, acts),
        featured=featured,
        currency=currency,
        ideal_months=ideal_months,
    )


# ---------------------------------------------------------------------------
# WORLDWIDE seed bank
# GLOBAL = visible to every home market (markets: ["*"])
# Per-market lists = domestic / affinity packages for that home
# ---------------------------------------------------------------------------

SEED_BANK: dict[str, list[dict[str, Any]]] = {
    "GLOBAL": [
        _city_pkg(
            slug="paris-long-weekend",
            title="Paris Long Weekend",
            city="Paris",
            country_blurb="Cafés, museums, and Seine-light evenings.",
            theme="city",
            themes=["city", "food", "honeymoon"],
            region="international",
            markets=["*"],
            gateway="CDG",
            currency="EUR",
            featured=True,
            highlights=["Louvre or Orsay", "Neighbourhood dinner", "Seine walk"],
        ),
        _city_pkg(
            slug="rome-classic-break",
            title="Rome Classic Break",
            city="Rome",
            country_blurb="Ancient stones and perfect pasta nights.",
            theme="city",
            themes=["city", "food", "culture"],
            region="international",
            markets=["*"],
            gateway="FCO",
            currency="EUR",
            highlights=["Historic centre", "Trastevere evening", "Gelato stop"],
        ),
        _city_pkg(
            slug="london-city-sampler",
            title="London City Sampler",
            city="London",
            country_blurb="Parks, pubs, and world-class museums.",
            theme="city",
            themes=["city", "food", "culture"],
            region="international",
            markets=["*"],
            gateway="LHR",
            currency="GBP",
        ),
        _city_pkg(
            slug="barcelona-med-break",
            title="Barcelona Med Break",
            city="Barcelona",
            country_blurb="Gaudí curves and Mediterranean nights.",
            theme="city",
            themes=["city", "beach", "food"],
            region="international",
            markets=["*"],
            gateway="BCN",
            currency="EUR",
            highlights=["Gothic Quarter", "Beach afternoon", "Tapas night"],
        ),
        _city_pkg(
            slug="tokyo-neon-nights",
            title="Tokyo Neon Nights",
            city="Tokyo",
            country_blurb="Neon nights, quiet shrines, endless bowls.",
            theme="city",
            themes=["city", "food"],
            region="international",
            markets=["*"],
            gateway="NRT",
            days=5,
            currency="JPY",
            featured=True,
            highlights=["Neighbourhood ramen", "Shrine morning", "Skyline view"],
        ),
        _city_pkg(
            slug="bali-soft-reset",
            title="Bali Soft Reset",
            city="Bali",
            country_blurb="Rice terraces, surf towns, and temple sunsets.",
            theme="beach",
            themes=["beach", "wellness", "honeymoon"],
            region="international",
            markets=["*"],
            gateway="DPS",
            days=5,
            currency="USD",
            ideal_months=["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
        ),
        _city_pkg(
            slug="dubai-skyline-escape",
            title="Dubai Skyline Escape",
            city="Dubai",
            country_blurb="Desert dunes meet futuristic skyline.",
            theme="city",
            themes=["city", "luxury", "adventure"],
            region="international",
            markets=["*"],
            gateway="DXB",
            currency="AED",
            ideal_months=["Nov", "Dec", "Jan", "Feb", "Mar"],
        ),
        _city_pkg(
            slug="singapore-easy-days",
            title="Singapore Easy Days",
            city="Singapore",
            country_blurb="Garden city, hawker flavours, skyline walks.",
            theme="city",
            themes=["city", "food", "family"],
            region="international",
            markets=["*"],
            gateway="SIN",
            currency="SGD",
        ),
        _city_pkg(
            slug="bangkok-street-pulse",
            title="Bangkok Street Pulse",
            city="Bangkok",
            country_blurb="Temples, markets, and midnight street eats.",
            theme="food",
            themes=["food", "city", "backpacking"],
            region="international",
            markets=["*"],
            gateway="BKK",
            currency="THB",
        ),
        _city_pkg(
            slug="istanbul-two-shores",
            title="Istanbul Two Shores",
            city="Istanbul",
            country_blurb="Where Europe and Asia share one skyline.",
            theme="city",
            themes=["city", "food", "culture"],
            region="international",
            markets=["*"],
            gateway="IST",
            currency="USD",
        ),
        _city_pkg(
            slug="cape-town-wild-light",
            title="Cape Town Wild Light",
            city="Cape Town",
            country_blurb="Table Mountain, wine country, and Atlantic light.",
            theme="adventure",
            themes=["adventure", "city", "beach"],
            region="international",
            markets=["*"],
            gateway="CPT",
            days=5,
            currency="USD",
        ),
        _city_pkg(
            slug="sydney-harbour-days",
            title="Sydney Harbour Days",
            city="Sydney",
            country_blurb="Harbour icon with beach-city lifestyle.",
            theme="city",
            themes=["city", "beach"],
            region="international",
            markets=["*"],
            gateway="SYD",
            days=5,
            currency="AUD",
        ),
        _city_pkg(
            slug="lisbon-tile-hills",
            title="Lisbon Tile Hills",
            city="Lisbon",
            country_blurb="Tile hills, trams, and Atlantic light.",
            theme="city",
            themes=["city", "food", "backpacking"],
            region="international",
            markets=["*"],
            gateway="LIS",
            currency="EUR",
        ),
        _city_pkg(
            slug="seoul-city-pulse",
            title="Seoul City Pulse",
            city="Seoul",
            country_blurb="K-culture, mountains in the city, late-night eats.",
            theme="city",
            themes=["city", "food"],
            region="international",
            markets=["*"],
            gateway="ICN",
            currency="KRW",
        ),
        _city_pkg(
            slug="mexico-city-flavours",
            title="Mexico City Flavours",
            city="Mexico City",
            country_blurb="Museums, markets, and world-class cuisine.",
            theme="food",
            themes=["food", "city", "culture"],
            region="international",
            markets=["*"],
            gateway="MEX",
            currency="USD",
        ),
    ],
    "US": [
        _city_pkg(
            slug="nyc-long-weekend",
            title="New York Long Weekend",
            city="New York",
            country_blurb="Skyline mornings, neighbourhood food, one easy city break.",
            theme="city",
            themes=["city", "food"],
            region="domestic",
            markets=["US"],
            gateway="JFK",
            featured=True,
            highlights=["Central Park walk", "Neighbourhood food crawl", "Skyline viewpoint"],
        ),
        _city_pkg(
            slug="miami-beach-reset",
            title="Miami Beach Reset",
            city="Miami",
            country_blurb="Art Deco mornings and warm Atlantic evenings.",
            theme="beach",
            themes=["beach", "city"],
            region="domestic",
            markets=["US"],
            gateway="MIA",
            ideal_months=["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
        ),
        _city_pkg(
            slug="california-coast-sampler",
            title="California Coast Sampler",
            city="Los Angeles",
            country_blurb="LA energy, Pacific light, one easy west-coast loop.",
            theme="city",
            themes=["city", "beach", "roadtrip"],
            region="domestic",
            markets=["US"],
            gateway="LAX",
            days=5,
        ),
    ],
    "GB": [
        _city_pkg(
            slug="edinburgh-castle-break",
            title="Edinburgh Castle Break",
            city="Edinburgh",
            country_blurb="Castle views, festival energy, highland day trips.",
            theme="city",
            themes=["city", "culture", "hills"],
            region="domestic",
            markets=["GB"],
            gateway="EDI",
            currency="GBP",
            featured=True,
        ),
        _city_pkg(
            slug="bath-cotswolds-escape",
            title="Bath & Cotswolds Escape",
            city="Bath",
            country_blurb="Georgian crescents and honey-stone villages.",
            theme="city",
            themes=["city", "culture"],
            region="domestic",
            markets=["GB"],
            gateway="BRS",
            currency="GBP",
        ),
    ],
    "AE": [
        _city_pkg(
            slug="abu-dhabi-calm-days",
            title="Abu Dhabi Calm Days",
            city="Abu Dhabi",
            country_blurb="Grand Mosque calm and island resort pace.",
            theme="city",
            themes=["city", "luxury", "honeymoon"],
            region="domestic",
            markets=["AE"],
            gateway="AUH",
            currency="AED",
            ideal_months=["Nov", "Dec", "Jan", "Feb", "Mar"],
        ),
    ],
    "SG": [
        _city_pkg(
            slug="singapore-home-weekend",
            title="Singapore Home Weekend",
            city="Singapore",
            country_blurb="Hawker runs, gardens, and an easy staycation reset.",
            theme="city",
            themes=["city", "food", "family"],
            region="domestic",
            markets=["SG"],
            gateway="SIN",
            currency="SGD",
            days=3,
            nights=2,
        ),
    ],
    "AU": [
        _city_pkg(
            slug="melbourne-laneway-break",
            title="Melbourne Laneway Break",
            city="Melbourne",
            country_blurb="Coffee culture, laneway art, and easy day trips.",
            theme="city",
            themes=["city", "food"],
            region="domestic",
            markets=["AU"],
            gateway="MEL",
            currency="AUD",
            featured=True,
        ),
        _city_pkg(
            slug="sydney-local-harbour",
            title="Sydney Local Harbour",
            city="Sydney",
            country_blurb="Ferry light, beach mornings, neighbourhood evenings.",
            theme="city",
            themes=["city", "beach"],
            region="domestic",
            markets=["AU"],
            gateway="SYD",
            currency="AUD",
            days=4,
        ),
    ],
    "JP": [
        _city_pkg(
            slug="kyoto-temple-days",
            title="Kyoto Temple Days",
            city="Kyoto",
            country_blurb="Temples, gardens, and maple-light evenings.",
            theme="culture",
            themes=["culture", "city", "food"],
            region="domestic",
            markets=["JP"],
            gateway="KIX",
            currency="JPY",
            featured=True,
        ),
    ],
    "CA": [
        _city_pkg(
            slug="toronto-lake-city",
            title="Toronto Lake City",
            city="Toronto",
            country_blurb="Lake city with neighbourhood food scenes.",
            theme="city",
            themes=["city", "food"],
            region="domestic",
            markets=["CA"],
            gateway="YYZ",
            currency="CAD",
        ),
        _city_pkg(
            slug="vancouver-coast-mountains",
            title="Vancouver Coast & Mountains",
            city="Vancouver",
            country_blurb="Ocean walks with mountain edges in view.",
            theme="city",
            themes=["city", "hills", "adventure"],
            region="domestic",
            markets=["CA"],
            gateway="YVR",
            currency="CAD",
            days=4,
        ),
    ],
    "EU": [
        _city_pkg(
            slug="amsterdam-canal-break",
            title="Amsterdam Canal Break",
            city="Amsterdam",
            country_blurb="Canals, bikes, and golden-hour bridges.",
            theme="city",
            themes=["city", "culture"],
            region="international",
            markets=["GB", "EU", "*"],
            gateway="AMS",
            currency="EUR",
        ),
        _city_pkg(
            slug="prague-old-town",
            title="Prague Old Town",
            city="Prague",
            country_blurb="Fairy-tale bridges and old-town spires.",
            theme="city",
            themes=["city", "honeymoon"],
            region="international",
            markets=["GB", "EU", "*"],
            gateway="PRG",
            currency="EUR",
        ),
    ],
    "IN": [
        # Live IN domestic catalog already rich; optional extras can go here later.
    ],
}


def _stamp(draft: dict[str, Any], market: str) -> dict[str, Any]:
    out = dict(draft)
    pipeline = dict(out.get("pipeline") or {})
    pipeline.update(
        {
            "status": STATUS_DRAFT,
            "market": market,
            "authoredAt": _now(),
            "author": "package_factory.author.seed",
        }
    )
    out["pipeline"] = pipeline
    out["markets"] = list(out.get("markets") or [market])
    return out


def author_drafts(
    market: str,
    *,
    limit: int = 8,
    include_global: bool = True,
    use_llm: bool | None = None,
) -> list[dict[str, Any]]:
    """Drafts for one home market, plus GLOBAL worldwide packages.

    When GEMINI_API_KEY / GROQ_API_KEY is set, LLM authors new packages first
    (cheap catalog LLM — never core OpenAI). Seed bank fills the rest.
    """
    code = str(market or "").strip().upper() or "GLOBAL"
    if code in ("WORLD", "ALL", "*"):
        code = "GLOBAL"

    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    want_llm = available() if use_llm is None else bool(use_llm)
    if want_llm and available():
        try:
            from supervisor.packages_structured import list_packages
            from supervisor.package_factory.llm_author import llm_author_packages

            existing = [str(p.get("slug")) for p in (list_packages().get("packages") or [])]
            llm = llm_author_packages(code, count=limit, existing_slugs=existing)
            for pkg in llm.get("packages") or []:
                slug = str(pkg.get("slug") or "")
                if not slug or slug in seen:
                    continue
                seen.add(slug)
                out.append(pkg)
        except Exception:
            pass

    seeds: list[dict[str, Any]] = []
    if code == "GLOBAL":
        seeds.extend(SEED_BANK.get("GLOBAL") or [])
    else:
        seeds.extend(SEED_BANK.get(code) or [])
        if include_global:
            seeds.extend(SEED_BANK.get("GLOBAL") or [])

    for raw in seeds:
        slug = str(raw.get("slug") or "")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        out.append(_stamp(raw, code if code != "GLOBAL" else "GLOBAL"))
        if len(out) >= max(1, limit):
            break

    return out[: max(1, limit)] if out else out


def author_worldwide(
    *,
    limit_per_market: int = 6,
    include_global: bool = True,
    use_llm: bool | None = None,
) -> list[dict[str, Any]]:
    """Author drafts across all world markets + GLOBAL catalog."""
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in author_drafts(
        "GLOBAL", limit=limit_per_market, include_global=False, use_llm=use_llm
    ):
        slug = str(raw.get("slug") or "")
        if slug in seen:
            continue
        seen.add(slug)
        out.append(raw)
    for market in WORLD_MARKETS:
        for raw in author_drafts(
            market, limit=limit_per_market, include_global=False, use_llm=use_llm
        ):
            slug = str(raw.get("slug") or "")
            if slug in seen:
                continue
            seen.add(slug)
            out.append(raw)
    if include_global:
        pass
    return out
