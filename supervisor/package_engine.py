"""Package engine: templates → constraints → plan → validate → instance.

Templates store editorial intent (anchors, duration, style) — never live prices
or country immigration rules. Traveler dates + live inventory produce a
Package Instance. Invalid circuits (e.g. 6-day Chardham) do not silently squeeze.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

NOT_CONFIGURED = "NOT_CONFIGURED"
SEARCHING = "SEARCHING"
AVAILABLE = "AVAILABLE"
SELECTED = "SELECTED"
UNAVAILABLE = "UNAVAILABLE"
INVALID = "INVALID"
NEEDS_REVIEW = "NEEDS_REVIEW"
VALIDATED = "VALIDATED"
INCOMPLETE = "INCOMPLETE"
ALMOST_READY = "ALMOST_READY"
READY_TO_BOOK = "READY_TO_BOOK"
NOT_READY = "NOT_READY"

_DHAM_ALIASES = {
    "yamunotri": "Yamunotri",
    "gangotri": "Gangotri",
    "kedarnath": "Kedarnath",
    "badrinath": "Badrinath",
}


def _iso(d: date) -> str:
    return d.isoformat()


def _parse_date(raw: str | None) -> date | None:
    try:
        return date.fromisoformat(str(raw or "")[:10])
    except Exception:
        return None


def _days_between(check_in: str, check_out: str) -> int:
    a = _parse_date(check_in)
    b = _parse_date(check_out)
    if not a or not b:
        return 0
    return max(0, (b - a).days)


def _add_days(iso: str, n: int) -> str:
    d = _parse_date(iso) or date.today()
    return _iso(d + timedelta(days=n))


def _norm_anchor(name: str) -> str:
    key = str(name or "").strip().lower()
    return _DHAM_ALIASES.get(key, str(name or "").strip())


def _blob(pkg: dict[str, Any]) -> str:
    return " ".join(
        [
            str(pkg.get("id") or ""),
            str(pkg.get("slug") or ""),
            str(pkg.get("title") or ""),
            " ".join(pkg.get("destinations") or []),
            " ".join(pkg.get("requiredAnchors") or pkg.get("required_anchors") or []),
            " ".join(pkg.get("routeConcept") or pkg.get("route_concept") or []),
        ]
    ).lower()


def is_chardham(pkg: dict[str, Any]) -> bool:
    return "chardham" in _blob(pkg) or "char dham" in _blob(pkg)


def normalize_template(raw: dict[str, Any]) -> dict[str, Any]:
    """Catalog row → template. Drops marketing prices/badges as live facts."""
    pkg = dict(raw or {})
    rec = pkg.get("recommendedDurationDays") or pkg.get("recommended_duration_days")
    if isinstance(rec, (int, float)):
        rec = [int(rec), int(rec)]
    if not rec:
        days = int(pkg.get("durationDays") or (int(pkg.get("durationNights") or 3) + 1) or 4)
        rec = [days, days]
    rec = [int(rec[0]), int(rec[-1] if len(rec) > 1 else rec[0])]
    min_d = int(pkg.get("minDurationDays") or pkg.get("min_duration_days") or rec[0])
    anchors = [
        _norm_anchor(a)
        for a in (pkg.get("requiredAnchors") or pkg.get("required_anchors") or [])
        if str(a).strip()
    ]
    if is_chardham(pkg) and not anchors:
        anchors = ["Yamunotri", "Gangotri", "Kedarnath", "Badrinath"]
        rec = list(pkg.get("recommendedDurationDays") or [9, 12])
        min_d = int(pkg.get("minDurationDays") or 9)

    route = pkg.get("routeConcept") or pkg.get("route_concept") or list(pkg.get("destinations") or [])
    blueprints = pkg.get("dayBlueprints") or pkg.get("itinerary") or []
    fallbacks = pkg.get("fallbackPlans") or pkg.get("fallback_plans") or []
    if is_chardham(pkg) and not fallbacks:
        fallbacks = [
            {
                "id": "do_dham",
                "title": "Yamunotri + Gangotri",
                "anchors": ["Yamunotri", "Gangotri"],
                "minDays": 5,
                "maxDays": 7,
                "recommendedDays": 6,
            }
        ]

    duration_days = int(pkg.get("durationDays") or rec[0])
    duration_nights = int(pkg.get("durationNights") or max(1, duration_days - 1))

    return {
        **pkg,
        "productType": pkg.get("productType") or "curated_template",
        "travelStyle": pkg.get("travelStyle") or pkg.get("travel_style") or pkg.get("theme"),
        "requiredAnchors": anchors,
        "routeConcept": route,
        "recommendedDurationDays": rec,
        "minDurationDays": min_d,
        "durationDays": duration_days,
        "durationNights": duration_nights,
        "dayBlueprints": blueprints,
        "fallbackPlans": fallbacks,
        "groundEstimates": pkg.get("groundEstimates") or pkg.get("ground_estimates") or {},
        "knowBeforeYouGo": pkg.get("knowBeforeYouGo") or pkg.get("know_before_you_go") or [],
        # never treat brochure floors as payable
        "fromPrice": None,
        "badge": None,
    }


def _day(
    *,
    n: int,
    origin: str,
    destination: str,
    title: str,
    narrative: str,
    stay_city: str,
    activities: list[str] | None = None,
    optional: list[str] | None = None,
    transfers: list[dict[str, Any]] | None = None,
    meals: list[str] | None = None,
    pace: str = "moderate",
    altitude_m: int | None = None,
    anchors: list[str] | None = None,
    flags: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "day": n,
        "origin": origin,
        "destination": destination,
        "title": title,
        "narrative": narrative,
        "description": narrative,
        "activities": activities or [],
        "optionalActivities": optional or [],
        "transfers": transfers or [],
        "hotel_city": stay_city,
        "stayCity": stay_city,
        "meals": meals or ["breakfast"],
        "pace": pace,
        "altitude_m": altitude_m,
        "anchors": [_norm_anchor(a) for a in (anchors or [])],
        "flags": flags or [],
    }


def _road(minutes: int, origin: str, dest: str) -> dict[str, Any]:
    return {
        "mode": "road",
        "estimated_duration_minutes": int(minutes),
        "origin": origin,
        "destination": dest,
        "source": "estimate",
    }


def _chardham_full(days: int) -> list[dict[str, Any]]:
    """Reliable four-dham circuit. days is calendar days (nights = days-1)."""
    days = max(9, min(14, int(days or 10)))
    plan: list[dict[str, Any]] = [
        _day(
            n=1,
            origin="Haridwar",
            destination="Haridwar",
            title="Arrive Haridwar",
            narrative="Check in, evening Ganga Aarti at Har Ki Pauri, rest before the hills.",
            stay_city="Haridwar",
            activities=["Check-in", "Har Ki Pauri Ganga Aarti"],
            meals=["dinner"],
            pace="easy",
            altitude_m=310,
        ),
        _day(
            n=2,
            origin="Haridwar",
            destination="Barkot",
            title="Haridwar to Barkot",
            narrative="Hill transfer toward Yamunotri base. Evening rest — no extra excursion.",
            stay_city="Barkot",
            activities=["Drive to Barkot", "Hotel check-in"],
            optional=["Short market walk after check-in"],
            transfers=[_road(420, "Haridwar", "Barkot")],
            pace="moderate",
            altitude_m=1220,
            flags=["long_transfer"],
        ),
        _day(
            n=3,
            origin="Barkot",
            destination="Yamunotri",
            title="Yamunotri darshan",
            narrative="Early start for Yamunotri. Return to Barkot the same night.",
            stay_city="Barkot",
            activities=["Yamunotri darshan", "Return to Barkot"],
            transfers=[_road(180, "Barkot", "Yamunotri"), _road(180, "Yamunotri", "Barkot")],
            pace="demanding",
            altitude_m=3293,
            anchors=["Yamunotri"],
        ),
        _day(
            n=4,
            origin="Barkot",
            destination="Uttarkashi",
            title="Barkot to Uttarkashi",
            narrative="Transfer toward Gangotri base. Light evening, early night.",
            stay_city="Uttarkashi",
            activities=["Drive to Uttarkashi"],
            transfers=[_road(300, "Barkot", "Uttarkashi")],
            pace="moderate",
            altitude_m=1158,
        ),
        _day(
            n=5,
            origin="Uttarkashi",
            destination="Gangotri",
            title="Gangotri darshan",
            narrative="Gangotri darshan and return to Uttarkashi. Do not continue to Kedarnath base today.",
            stay_city="Uttarkashi",
            activities=["Gangotri darshan", "Return to Uttarkashi"],
            transfers=[_road(210, "Uttarkashi", "Gangotri"), _road(210, "Gangotri", "Uttarkashi")],
            pace="demanding",
            altitude_m=3100,
            anchors=["Gangotri"],
        ),
        _day(
            n=6,
            origin="Uttarkashi",
            destination="Guptkashi",
            title="Transfer to Guptkashi",
            narrative="Full road day to Kedarnath base region. Travel only — no darshan stacked on this drive.",
            stay_city="Guptkashi",
            activities=["Drive Uttarkashi → Guptkashi", "Check-in and rest"],
            transfers=[_road(480, "Uttarkashi", "Guptkashi")],
            pace="demanding",
            altitude_m=1319,
            flags=["long_transfer", "no_stacked_darshan"],
        ),
        _day(
            n=7,
            origin="Guptkashi",
            destination="Kedarnath",
            title="Kedarnath darshan",
            narrative="Trek or helicopter window for Kedarnath. Overnight back at Guptkashi unless weather forces a high stay.",
            stay_city="Guptkashi",
            activities=["Kedarnath darshan (trek or heli)", "Return to base"],
            optional=["Helicopter instead of trek"],
            pace="demanding",
            altitude_m=3584,
            anchors=["Kedarnath"],
            flags=["altitude", "weather_dependent"],
        ),
        _day(
            n=8,
            origin="Guptkashi",
            destination="Joshimath",
            title="Toward Badrinath base",
            narrative="Road day toward Joshimath / Pipalkoti. Rest on arrival.",
            stay_city="Joshimath",
            activities=["Drive to Joshimath"],
            transfers=[_road(420, "Guptkashi", "Joshimath")],
            pace="moderate",
            altitude_m=1875,
            flags=["long_transfer"],
        ),
        _day(
            n=9,
            origin="Joshimath",
            destination="Badrinath",
            title="Badrinath darshan",
            narrative="Badrinath darshan. Overnight Joshimath or Badrinath depending on rooms.",
            stay_city="Joshimath",
            activities=["Badrinath darshan"],
            transfers=[_road(180, "Joshimath", "Badrinath"), _road(180, "Badrinath", "Joshimath")],
            pace="moderate",
            altitude_m=3300,
            anchors=["Badrinath"],
        ),
        _day(
            n=10,
            origin="Joshimath",
            destination="Haridwar",
            title="Return to Haridwar",
            narrative="Descend to the plains for onward travel. Buffer for mountain roads.",
            stay_city="Haridwar",
            activities=["Drive to Haridwar", "Onward departure or overnight"],
            transfers=[_road(540, "Joshimath", "Haridwar")],
            meals=["breakfast"],
            pace="demanding",
            altitude_m=310,
            flags=["long_transfer", "departure"],
        ),
    ]

    if days == 9:
        # Compress only the final overnight: depart same day after Badrinath is unsafe.
        # Keep 9 calendar days by combining arrival buffer: start circuit day 1 as transfer.
        plan[0] = _day(
            n=1,
            origin="Haridwar",
            destination="Barkot",
            title="Arrive and drive to Barkot",
            narrative="Arrive Haridwar / Dehradun early, then transfer to Barkot. Only works with a morning arrival.",
            stay_city="Barkot",
            activities=["Arrive", "Drive to Barkot"],
            transfers=[_road(420, "Haridwar", "Barkot")],
            meals=["dinner"],
            pace="demanding",
            flags=["requires_morning_arrival", "long_transfer"],
        )
        rest = plan[2:]  # skip original day 2 (already did Barkot transfer)
        out = [plan[0], *rest]
        for i, d in enumerate(out, 1):
            d["day"] = i
        return out[:9]

    if days >= 11:
        rest_a = _day(
            n=4,
            origin="Barkot",
            destination="Barkot",
            title="Rest / buffer after Yamunotri",
            narrative="Recovery morning in Barkot. Optional short walk only.",
            stay_city="Barkot",
            activities=["Rest", "Optional short walk"],
            pace="easy",
            flags=["buffer"],
        )
        # insert after Yamunotri (day 3)
        core = plan[:3] + [rest_a] + plan[3:]
        if days >= 12:
            rest_b = _day(
                n=9,
                origin="Guptkashi",
                destination="Guptkashi",
                title="Rest after Kedarnath",
                narrative="Buffer after the Kedarnath day before the Badrinath transfer.",
                stay_city="Guptkashi",
                activities=["Rest"],
                pace="easy",
                flags=["buffer", "altitude"],
            )
            # after Kedarnath day (now shifted)
            ked_idx = next(i for i, d in enumerate(core) if "Kedarnath" in (d.get("anchors") or []))
            core = core[: ked_idx + 1] + [rest_b] + core[ked_idx + 1 :]
        for i, d in enumerate(core, 1):
            d["day"] = i
        return core[:days]

    return plan[:10]


def _do_dham(days: int) -> list[dict[str, Any]]:
    days = max(5, min(7, int(days or 6)))
    plan = [
        _day(
            n=1,
            origin="Haridwar",
            destination="Haridwar",
            title="Arrive Haridwar",
            narrative="Check in and evening Ganga Aarti. Rest before the hills.",
            stay_city="Haridwar",
            activities=["Check-in", "Har Ki Pauri Ganga Aarti"],
            meals=["dinner"],
            pace="easy",
        ),
        _day(
            n=2,
            origin="Haridwar",
            destination="Barkot",
            title="Haridwar to Barkot",
            narrative="Scenic hill transfer. Evening rest at Barkot.",
            stay_city="Barkot",
            activities=["Drive to Barkot"],
            optional=["Hotel briefing only"],
            transfers=[_road(420, "Haridwar", "Barkot")],
            pace="moderate",
            flags=["long_transfer"],
        ),
        _day(
            n=3,
            origin="Barkot",
            destination="Yamunotri",
            title="Yamunotri darshan",
            narrative="Yamunotri and return to Barkot.",
            stay_city="Barkot",
            activities=["Yamunotri darshan"],
            transfers=[_road(180, "Barkot", "Yamunotri"), _road(180, "Yamunotri", "Barkot")],
            pace="demanding",
            anchors=["Yamunotri"],
        ),
        _day(
            n=4,
            origin="Barkot",
            destination="Uttarkashi",
            title="Barkot to Uttarkashi",
            narrative="Transfer to Gangotri base town.",
            stay_city="Uttarkashi",
            activities=["Drive to Uttarkashi"],
            transfers=[_road(300, "Barkot", "Uttarkashi")],
            pace="moderate",
        ),
        _day(
            n=5,
            origin="Uttarkashi",
            destination="Gangotri",
            title="Gangotri darshan",
            narrative="Gangotri darshan, overnight Uttarkashi.",
            stay_city="Uttarkashi",
            activities=["Gangotri darshan"],
            transfers=[_road(210, "Uttarkashi", "Gangotri"), _road(210, "Gangotri", "Uttarkashi")],
            pace="demanding",
            anchors=["Gangotri"],
        ),
        _day(
            n=6,
            origin="Uttarkashi",
            destination="Haridwar",
            title="Return to Haridwar",
            narrative="Descend to the plains for departure.",
            stay_city="Haridwar",
            activities=["Drive to Haridwar", "Depart"],
            transfers=[_road(420, "Uttarkashi", "Haridwar")],
            pace="moderate",
            flags=["departure"],
        ),
    ]
    if days == 5:
        plan[0] = _day(
            n=1,
            origin="Haridwar",
            destination="Barkot",
            title="Arrive and drive to Barkot",
            narrative="Morning arrival required to reach Barkot the same day.",
            stay_city="Barkot",
            activities=["Arrive", "Drive to Barkot"],
            transfers=[_road(420, "Haridwar", "Barkot")],
            meals=["dinner"],
            pace="demanding",
            flags=["requires_morning_arrival"],
        )
        rest = plan[2:]
        out = [plan[0], *rest]
        for i, d in enumerate(out, 1):
            d["day"] = i
        return out[:5]
    if days == 7:
        plan.insert(
            5,
            _day(
                n=6,
                origin="Uttarkashi",
                destination="Uttarkashi",
                title="Buffer / rest",
                narrative="Weather buffer after Gangotri before the return drive.",
                stay_city="Uttarkashi",
                activities=["Rest"],
                pace="easy",
                flags=["buffer"],
            ),
        )
        plan[6]["day"] = 7
        for i, d in enumerate(plan, 1):
            d["day"] = i
        return plan[:7]
    return plan[:6]


def _from_blueprints(template: dict[str, Any], calendar_days: int) -> list[dict[str, Any]]:
    raw = list(template.get("dayBlueprints") or [])
    if not raw:
        dest = (template.get("destinations") or ["Stay"])[0]
        stay = str((template.get("stay") or {}).get("city") or dest)
        return [
            _day(
                n=i,
                origin=stay,
                destination=stay,
                title=f"Day {i} in {stay}",
                narrative=f"Flexible day in {stay}.",
                stay_city=stay,
                pace="moderate" if i not in (1, calendar_days) else "easy",
            )
            for i in range(1, calendar_days + 1)
        ]

    out: list[dict[str, Any]] = []
    prev_city = str(
        (template.get("stay") or {}).get("city")
        or (template.get("destinations") or ["Stay"])[0]
    )
    for i, row in enumerate(raw[:calendar_days], 1):
        stay = str(row.get("stayCity") or row.get("hotel_city") or prev_city)
        origin = str(row.get("origin") or prev_city)
        dest = str(row.get("destination") or stay)
        activities = row.get("activities") or []
        if isinstance(activities, str):
            activities = [activities]
        meals = row.get("meals")
        if isinstance(meals, str):
            meals = [m.strip() for m in meals.replace("/", ",").split(",") if m.strip()]
        transfers = list(row.get("transfers") or [])
        if not transfers and origin and dest and origin.lower() != dest.lower():
            transfers = [_road(240, origin, dest)]
        out.append(
            _day(
                n=int(row.get("day") or i),
                origin=origin,
                destination=dest,
                title=str(row.get("title") or f"Day {i}"),
                narrative=str(row.get("narrative") or row.get("description") or ""),
                stay_city=stay,
                activities=list(activities),
                optional=list(row.get("optionalActivities") or []),
                transfers=transfers,
                meals=list(meals or ["breakfast"]),
                pace=str(row.get("pace") or "moderate"),
                altitude_m=row.get("altitude_m"),
                anchors=list(row.get("anchors") or []),
                flags=list(row.get("flags") or []),
            )
        )
        prev_city = stay

    while len(out) < calendar_days:
        last = out[-1] if out else None
        city = (last or {}).get("stayCity") or prev_city
        n = len(out) + 1
        out.append(
            _day(
                n=n,
                origin=city,
                destination=city,
                title=f"Flexible day in {city}",
                narrative="Unscheduled buffer day — keep it light.",
                stay_city=city,
                pace="easy",
                flags=["buffer"],
            )
        )
    return out[:calendar_days]


def stay_segments_from_days(days: list[dict[str, Any]], check_in: str) -> list[dict[str, Any]]:
    """Nights = calendar_days - 1; each overnight uses that day's stay city."""
    if not days:
        return []
    night_cities = [str(d.get("stayCity") or d.get("hotel_city") or "").strip() for d in days[:-1]]
    if not night_cities:
        city = str(days[0].get("stayCity") or "Stay")
        return [
            {
                "id": "stay-0",
                "city": city,
                "nights": 1,
                "checkIn": check_in,
                "checkOut": _add_days(check_in, 1),
                "label": f"{city} · 1 night",
            }
        ]
    segments: list[dict[str, Any]] = []
    i = 0
    while i < len(night_cities):
        city = night_cities[i] or "Stay"
        j = i + 1
        while j < len(night_cities) and (night_cities[j] or city) == city:
            j += 1
        n = j - i
        cin = _add_days(check_in, i)
        segments.append(
            {
                "id": f"stay-{len(segments)}",
                "city": city,
                "nights": n,
                "checkIn": cin,
                "checkOut": _add_days(cin, n),
                "label": f"{city} · {n} night{'s' if n != 1 else ''}",
            }
        )
        i = j
    return segments


def _anchors_in_days(days: list[dict[str, Any]]) -> list[str]:
    found: list[str] = []
    blob_parts: list[str] = []
    for d in days:
        for a in d.get("anchors") or []:
            n = _norm_anchor(a)
            if n and n not in found:
                found.append(n)
        blob_parts.append(
            " ".join(
                [
                    str(d.get("title") or ""),
                    str(d.get("narrative") or ""),
                    str(d.get("destination") or ""),
                    " ".join(d.get("activities") or []),
                ]
            ).lower()
        )
    blob = " ".join(blob_parts)
    for key, label in _DHAM_ALIASES.items():
        if key in blob and label not in found:
            found.append(label)
    return found


def validate_instance(
    template: dict[str, Any],
    days: list[dict[str, Any]],
    *,
    calendar_days: int,
    variant: str,
    hard: dict[str, Any] | None = None,
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    offers: list[dict[str, Any]] = []
    required = [_norm_anchor(a) for a in (template.get("requiredAnchors") or [])]
    present = _anchors_in_days(days)
    min_d = int(template.get("minDurationDays") or 0)
    rec = template.get("recommendedDurationDays") or [calendar_days, calendar_days]
    hard = hard or {}

    if required and variant != "do_dham":
        missing = [a for a in required if a not in present]
        if missing:
            issues.append(
                {
                    "severity": "error",
                    "code": "missing_anchors",
                    "message": (
                        f"Package promises {', '.join(required)} but the plan is missing "
                        f"{', '.join(missing)}."
                    ),
                }
            )

    if is_chardham(template) and variant != "do_dham" and calendar_days < min_d:
        issues.append(
            {
                "severity": "error",
                "code": "duration_too_short",
                "message": (
                    f"{calendar_days} days is too short for a reliable four-dham circuit. "
                    f"I recommend {rec[0]}–{rec[-1]} days for Chardham."
                ),
            }
        )
        offers.append(
            {
                "id": "extend_chardham",
                "action": "set_duration_days",
                "days": int(rec[0] if rec[0] >= 10 else 10),
                "label": f"Extend to {rec[0] if rec[0] >= 10 else 10} days for Chardham",
            }
        )
        offers.append(
            {
                "id": "do_dham",
                "action": "set_plan_variant",
                "variant": "do_dham",
                "label": "Keep 6 days — Yamunotri + Gangotri only",
            }
        )

    if is_chardham(template) and variant == "do_dham":
        extra = [a for a in present if a in ("Kedarnath", "Badrinath")]
        if extra:
            issues.append(
                {
                    "severity": "error",
                    "code": "variant_overreach",
                    "message": "This shorter plan should not include Kedarnath or Badrinath.",
                }
            )

    for d in days:
        mins = sum(int(t.get("estimated_duration_minutes") or 0) for t in (d.get("transfers") or []))
        acts = list(d.get("activities") or [])
        origin = str(d.get("origin") or "").strip().lower()
        stay = str(d.get("stayCity") or d.get("hotel_city") or "").strip().lower()
        changed_base = bool(origin and stay and origin != stay)
        has_darshan = any("darshan" in str(a).lower() for a in acts)
        # Out-and-back darshan from the same base (Yamunotri / Gangotri) is expected.
        # Changing overnight city AND stacking darshan on a long transfer is not.
        if changed_base and mins >= 360 and has_darshan:
            issues.append(
                {
                    "severity": "error",
                    "code": "impossible_same_day",
                    "day": d.get("day"),
                    "message": (
                        f"Day {d.get('day')}: overnight move plus darshan on a {mins // 60}h+ "
                        "road day is not reliable (this is how Gangotri→Guptkashi gets squeezed)."
                    ),
                }
            )
        if mins >= 360 and str(d.get("pace") or "") == "easy":
            issues.append(
                {
                    "severity": "warn",
                    "code": "pace_mismatch",
                    "day": d.get("day"),
                    "message": f"Day {d.get('day')} is a long transfer labelled easy.",
                }
            )
        if "attempt" in str(d.get("narrative") or "").lower() and "Kedarnath" in (
            d.get("anchors") or []
        ):
            issues.append(
                {
                    "severity": "warn",
                    "code": "kedarnath_attempt",
                    "day": d.get("day"),
                    "message": "Kedarnath should not be an ‘attempt or depart’ day.",
                }
            )

    if hard.get("helicopter") is False:
        for d in days:
            blob = " ".join(d.get("activities") or []).lower()
            if "heli" in blob and "optional" not in blob:
                issues.append(
                    {
                        "severity": "error",
                        "code": "heli_constraint",
                        "day": d.get("day"),
                        "message": "Plan assumes helicopter but the traveler ruled it out.",
                    }
                )

    errors = [i for i in issues if i.get("severity") == "error"]
    ok = not errors
    status = VALIDATED if ok else (NEEDS_REVIEW if not errors else INVALID)
    if errors:
        status = INVALID
    elif issues:
        status = NEEDS_REVIEW
    else:
        status = VALIDATED

    return {
        "ok": ok,
        "status": status,
        "issues": issues,
        "offers": offers,
        "anchorsRequired": required,
        "anchorsPresent": present,
        "calendarDays": calendar_days,
        "variant": variant,
    }


def lighten_day(day: dict[str, Any]) -> dict[str, Any]:
    """Propose a lighter version of one structured day. Does not mutate until apply."""
    current = dict(day or {})
    transfers = list(current.get("transfers") or [])
    mins = sum(int(t.get("estimated_duration_minutes") or 0) for t in transfers)
    optional = list(current.get("optionalActivities") or [])
    activities = [a for a in (current.get("activities") or []) if "optional" not in str(a).lower()]
    proposed = dict(current)
    proposed["optionalActivities"] = []
    proposed["activities"] = activities
    proposed["pace"] = "relaxed" if mins < 420 else "moderate"
    flags = [f for f in (current.get("flags") or []) if f != "evening_excursion"]
    if "check_in_first" not in flags:
        flags.append("check_in_first")
    proposed["flags"] = flags
    leave = "09:30" if mins >= 300 else "10:00"
    proposed["departAfter"] = leave
    extra = []
    if optional:
        extra.append("dropped optional stops")
    extra.append(f"leave after {leave}")
    extra.append("check in before any evening plan")
    proposed["narrative"] = (
        f"{current.get('narrative') or current.get('title') or ''} "
        f"Lightened: {', '.join(extra)}."
    ).strip()
    proposed["description"] = proposed["narrative"]

    before_active = mins + (40 * max(0, len(current.get("activities") or []) - 1))
    after_active = mins + (25 * max(0, len(proposed["activities"]) - 1))
    return {
        "day": int(current.get("day") or 0),
        "before": {
            "pace": current.get("pace"),
            "activities": current.get("activities") or [],
            "optionalActivities": optional,
            "transferMinutes": mins,
            "activeMinutes": before_active,
            "narrative": current.get("narrative") or current.get("description"),
        },
        "after": {
            "pace": proposed.get("pace"),
            "activities": proposed.get("activities") or [],
            "optionalActivities": [],
            "transferMinutes": mins,
            "activeMinutes": after_active,
            "departAfter": leave,
            "narrative": proposed.get("narrative"),
        },
        "patch": {
            "day": int(current.get("day") or 0),
            "title": current.get("title"),
            "description": proposed.get("narrative"),
            "narrative": proposed.get("narrative"),
            "activities": proposed.get("activities"),
            "optionalActivities": [],
            "pace": proposed.get("pace"),
            "flags": proposed.get("flags"),
            "departAfter": leave,
            "stayCity": current.get("stayCity"),
            "meals": current.get("meals"),
        },
    }


def know_before_you_go(template: dict[str, Any]) -> list[dict[str, Any]]:
    region = str(template.get("region") or "domestic").lower()
    custom = list(template.get("knowBeforeYouGo") or [])
    if custom:
        out = []
        for row in custom:
            if isinstance(row, str):
                out.append({"id": row[:24], "title": "Note", "body": row})
            elif isinstance(row, dict) and (row.get("body") or row.get("title")):
                out.append(
                    {
                        "id": row.get("id") or row.get("title"),
                        "title": row.get("title") or "Note",
                        "body": row.get("body") or "",
                    }
                )
        if region == "domestic":
            out = [
                m
                for m in out
                if not any(
                    k in str(m.get("title") or "").lower()
                    for k in ("embassy", "visa", "esta", "e-visa", "immigration")
                )
            ]
        return out

    modules: list[dict[str, Any]] = []
    if region == "domestic":
        modules.append(
            {
                "id": "id",
                "title": "Government ID",
                "body": "Carry a government photo ID for hotels and any temple registration. Indian travelers do not need immigration documents for this domestic trip.",
            }
        )
    else:
        modules.extend(
            [
                {
                    "id": "passport",
                    "title": "Passport",
                    "body": "Check passport validity against official entry rules before you fly.",
                },
                {
                    "id": "visa",
                    "title": "Visa / ETA",
                    "body": "Ask Vero to check official sources for your passport and destination. Do not rely on brochure copy.",
                },
            ]
        )

    if is_chardham(template) or "kedarnath" in _blob(template):
        modules.extend(
            [
                {
                    "id": "altitude",
                    "title": "Altitude",
                    "body": "Kedarnath and Badrinath sit above 3,000m. Build rest after darshan days; watch for headache, nausea, or breathlessness.",
                },
                {
                    "id": "roads",
                    "title": "Road conditions",
                    "body": "Himalayan roads close for landslides and weather. Keep buffers; same-day Gangotri darshan plus Guptkashi transfer is not reliable.",
                },
                {
                    "id": "season",
                    "title": "Temple opening season",
                    "body": "Char Dham temples follow a seasonal opening calendar (typically late spring through autumn). Confirm opening dates for your travel window.",
                },
                {
                    "id": "weather",
                    "title": "Weather",
                    "body": "Afternoons can turn wet; nights are cold even in summer. Kedarnath days are weather-dependent.",
                },
                {
                    "id": "trek",
                    "title": "Trekking intensity",
                    "body": "Kedarnath trek is steep. Helicopter is optional and often waitlisted — not assumed in this package unless you add it.",
                },
                {
                    "id": "registration",
                    "title": "Registration",
                    "body": "Some yatra stretches require biometric / online registration. Complete it before hill transfers.",
                },
                {
                    "id": "heli",
                    "title": "Helicopter",
                    "body": "Kedarnath heli is inventory-limited and not included unless selected. Weather cancellations are common.",
                },
                {
                    "id": "kit",
                    "title": "Warm clothing",
                    "body": "Pack layers, rain shell, and sturdy shoes. Nights at Barkot / Guptkashi / Joshimath drop quickly.",
                },
                {
                    "id": "mobile",
                    "title": "Mobile connectivity",
                    "body": "Coverage is patchy above Uttarkashi and around Kedarnath. Download offline maps; do not rely on last-minute booking apps on darshan day.",
                },
                {
                    "id": "emergency",
                    "title": "Emergency facilities",
                    "body": "Medical posts exist on main yatra routes but are basic. Serious issues mean descend toward Guptkashi / Joshimath / Dehradun.",
                },
            ]
        )
    return modules


def estimate_ground(template: dict[str, Any], guests: int, calendar_days: int) -> dict[str, Any]:
    ge = template.get("groundEstimates") or {}
    guests = max(1, int(guests or 2))
    days = max(1, int(calendar_days or 1))

    def _pair(val: Any, fallback_pp: tuple[int, int]) -> tuple[int, int]:
        if isinstance(val, (list, tuple)) and len(val) >= 2:
            return int(val[0]), int(val[1])
        return fallback_pp

    if ge:
        t0, t1 = _pair(ge.get("transfersPerPerson") or ge.get("transfers_per_person"), (0, 0))
        m0, m1 = _pair(ge.get("mealsPerPerson") or ge.get("meals_per_person"), (0, 0))
        d0, d1 = _pair(ge.get("darshanPerPerson") or ge.get("darshan_per_person"), (0, 0))
        lo = (t0 + m0 + d0) * guests
        hi = (t1 + m1 + d1) * guests
        return {
            "currency": ge.get("currency") or template.get("currency") or "INR",
            "transfers": {"min": t0 * guests, "max": t1 * guests, "kind": "estimate"},
            "meals": {"min": m0 * guests, "max": m1 * guests, "kind": "estimate"},
            "darshan": {"min": d0 * guests, "max": d1 * guests, "kind": "estimate"},
            "totalMin": lo,
            "totalMax": hi,
            "notes": list(ge.get("notes") or []),
            "perPerson": False,
            "guests": guests,
        }

    # Soft defaults only when template omitted estimates — still labelled estimate.
    if is_chardham(template):
        return estimate_ground(
            {
                **template,
                "groundEstimates": {
                    "currency": "INR",
                    "transfersPerPerson": [9000, 16000],
                    "mealsPerPerson": [4500, 8000],
                    "darshanPerPerson": [0, 2500],
                    "notes": [
                        "Shared taxis / tempo travellers — not a live bookable transfer",
                        "Kedarnath helicopter not included",
                        "Special darshan not included",
                    ],
                },
            },
            guests,
            days,
        )

    region = str(template.get("region") or "").lower()
    if region == "domestic":
        pp_lo, pp_hi = 1200 * days, 2200 * days
    else:
        pp_lo, pp_hi = 2500 * days, 4500 * days
    return {
        "currency": template.get("currency") or "INR",
        "transfers": {"min": 0, "max": 0, "kind": "estimate"},
        "meals": {"min": pp_lo * guests, "max": pp_hi * guests, "kind": "estimate"},
        "darshan": {"min": 0, "max": 0, "kind": "estimate"},
        "totalMin": pp_lo * guests,
        "totalMax": pp_hi * guests,
        "notes": ["Local meals & incidentals — estimate only, not payable here"],
        "guests": guests,
    }


def stamp_dates(days: list[dict[str, Any]], check_in: str) -> list[dict[str, Any]]:
    start = _parse_date(check_in) or date.today()
    out = []
    for i, d in enumerate(days):
        row = dict(d)
        row["day"] = i + 1
        row["date"] = _iso(start + timedelta(days=i))
        out.append(row)
    return out


def instantiate(
    template_raw: dict[str, Any],
    *,
    check_in: str,
    check_out: str,
    guests: int = 2,
    origin: str | None = None,
    variant: str | None = None,
    hard_constraints: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template = normalize_template(template_raw)
    calendar_days = _days_between(check_in, check_out) + 1
    if calendar_days < 2:
        rec = template.get("recommendedDurationDays") or [int(template.get("durationDays") or 4)]
        calendar_days = int(rec[0] if rec else template.get("durationDays") or 4)
        check_out = _add_days(check_in, calendar_days - 1)

    requested_variant = (variant or "auto").strip().lower() or "auto"
    min_d = int(template.get("minDurationDays") or 0)
    rec = template.get("recommendedDurationDays") or [calendar_days]

    resolved = requested_variant
    if requested_variant in ("", "auto"):
        if is_chardham(template) and calendar_days < min_d:
            resolved = "unmet"  # do not squeeze four dhams
        else:
            resolved = "full"
    if resolved == "do-dham":
        resolved = "do_dham"

    if is_chardham(template) and resolved == "full":
        plan_days = max(min_d, calendar_days) if calendar_days >= min_d else int(rec[0] if rec[0] >= 10 else 10)
        days = _chardham_full(plan_days)
        # If traveler dates are shorter than a valid circuit, still show the valid plan
        # but validation will fail against their calendar window.
        if calendar_days < min_d:
            # Keep recommended plan length for honesty; UI compares to selected dates.
            pass
        else:
            days = days[:calendar_days]
    elif is_chardham(template) and resolved == "do_dham":
        days = _do_dham(min(7, max(5, calendar_days)))
        days = days[:calendar_days] if calendar_days >= 5 else days
    elif is_chardham(template) and resolved == "unmet":
        days = _chardham_full(int(rec[0] if rec[0] >= 10 else 10))
    else:
        days = _from_blueprints(template, calendar_days)

    days = stamp_dates(days, check_in)
    validation = validate_instance(
        template,
        days,
        calendar_days=calendar_days,
        variant="do_dham" if resolved == "do_dham" else "full",
        hard=hard_constraints,
    )
    if resolved == "unmet":
        validation["ok"] = False
        validation["status"] = INVALID
        if not any(i.get("code") == "duration_too_short" for i in validation["issues"]):
            rec0 = int(rec[0] if rec[0] >= 10 else 10)
            validation["issues"].insert(
                0,
                {
                    "severity": "error",
                    "code": "duration_too_short",
                    "message": (
                        f"{calendar_days} days is too short for a reliable four-dham circuit. "
                        f"I recommend {rec0} days for Chardham, or keep {calendar_days} days "
                        "as Yamunotri + Gangotri."
                    ),
                },
            )
        if not validation.get("offers"):
            rec0 = int(rec[0] if rec[0] >= 10 else 10)
            validation["offers"] = [
                {
                    "id": "extend_chardham",
                    "action": "set_duration_days",
                    "days": rec0,
                    "label": f"Extend to {rec0} days for Chardham",
                },
                {
                    "id": "do_dham",
                    "action": "set_plan_variant",
                    "variant": "do_dham",
                    "label": f"Keep {calendar_days} days — Yamunotri + Gangotri",
                },
            ]

    segments = stay_segments_from_days(days, check_in)
    origin_code = (origin or "").upper().strip()[:3] or None
    guests_n = max(1, int(guests or 2))
    estimates = estimate_ground(template, guests_n, calendar_days)

    instance_title = template.get("title") or "Package"
    if origin_code:
        gw = (template.get("flight") or {}).get("gatewayAirport") or ""
        instance_title = f"Your {template.get('title')} — {origin_code} → {gw or 'gateway'}"

    return {
        "productType": "dynamic_instance",
        "templateId": template.get("id"),
        "slug": template.get("slug"),
        "title": template.get("title"),
        "instanceTitle": instance_title,
        "tagline": template.get("tagline"),
        "region": template.get("region"),
        "theme": template.get("theme"),
        "travelStyle": template.get("travelStyle"),
        "variant": resolved,
        "checkIn": check_in[:10],
        "checkOut": check_out[:10] if check_out else _add_days(check_in, calendar_days - 1),
        "calendarDays": calendar_days,
        "nights": max(1, calendar_days - 1),
        "guests": guests_n,
        "origin": origin_code,
        "requiredAnchors": template.get("requiredAnchors") or [],
        "routeConcept": template.get("routeConcept") or [],
        "recommendedDurationDays": template.get("recommendedDurationDays"),
        "minDurationDays": template.get("minDurationDays"),
        "days": days,
        "itinerary": days,  # compatibility
        "staySegments": segments,
        "validation": validation,
        "estimates": estimates,
        "know": know_before_you_go(template),
        "hardConstraints": hard_constraints or {},
        "fallbackPlans": template.get("fallbackPlans") or [],
        "flightGateway": template.get("flight")
        if isinstance(template.get("flight"), dict)
        else None,
    }


def component_status(
    *,
    itinerary_status: str,
    hotel_nights_ok: int,
    hotel_nights_total: int,
    hotel_searching: bool,
    flight_origin: str | None,
    flight_selected: bool,
    flight_available: bool,
    flight_supported: bool,
) -> dict[str, Any]:
    if hotel_searching:
        hotel = SEARCHING
    elif hotel_nights_total <= 0:
        hotel = NOT_CONFIGURED
    elif hotel_nights_ok <= 0:
        hotel = UNAVAILABLE
    elif hotel_nights_ok < hotel_nights_total:
        hotel = NEEDS_REVIEW
    else:
        hotel = SELECTED if hotel_nights_ok else AVAILABLE

    if not flight_supported:
        flight = NOT_CONFIGURED
    elif not flight_origin:
        flight = NOT_CONFIGURED
    elif flight_selected:
        flight = SELECTED
    elif flight_available:
        flight = AVAILABLE
    else:
        flight = UNAVAILABLE

    attention: list[str] = []
    if itinerary_status == INVALID:
        attention.append("Itinerary needs a feasible plan")
    elif itinerary_status == NEEDS_REVIEW:
        attention.append("Itinerary has warnings")
    if hotel == UNAVAILABLE:
        attention.append("No live hotel inventory")
    elif hotel == NEEDS_REVIEW:
        attention.append("Some stay nights still need a hotel")
    if flight_supported and flight == NOT_CONFIGURED:
        attention.append("Flight origin required")
    if flight == UNAVAILABLE:
        attention.append("No return flight for these dates")

    if itinerary_status == INVALID or hotel == UNAVAILABLE:
        package = NOT_READY
    elif attention:
        package = ALMOST_READY if hotel in (SELECTED, AVAILABLE, NEEDS_REVIEW) else INCOMPLETE
    elif hotel in (SELECTED, AVAILABLE) and itinerary_status == VALIDATED:
        package = READY_TO_BOOK
    else:
        package = INCOMPLETE

    return {
        "itinerary": itinerary_status,
        "hotel": hotel,
        "flight": flight,
        "package": package,
        "attention": attention,
        "hotelNightsOk": hotel_nights_ok,
        "hotelNightsTotal": hotel_nights_total,
        "readyToBook": package == READY_TO_BOOK,
        "canPay": hotel_nights_ok > 0 and itinerary_status != INVALID,
    }


def pricing_breakdown(
    *,
    stay_total: float | None,
    flight_total: float | None,
    estimates: dict[str, Any] | None,
    guests: int,
    stay_nights: int,
    can_pay: bool,
    template: dict[str, Any] | None = None,
) -> dict[str, Any]:
    stay = float(stay_total or 0)
    flight = float(flight_total or 0)
    inventory = stay + flight
    margin = compute_package_margin(
        template=template,
        inventory_total=inventory,
        guests=guests,
    )
    bookable = inventory + margin
    est = estimates or {}
    extra_lo = int(est.get("totalMin") or 0)
    extra_hi = int(est.get("totalMax") or extra_lo)
    trip_lo = int(bookable) + extra_lo
    trip_hi = int(bookable) + extra_hi
    per_night = None
    if stay and stay_nights:
        per_night = round(stay / max(1, stay_nights), 0)
    # Customer pays once (Itinero Stripe); inventory fulfilled via LiteAPI credit after payment.
    pay_lite = int(inventory) if inventory > 0 else None
    pay_margin = int(margin) if margin > 0 else None
    return {
        "bookableTotal": int(bookable) if bookable else None,
        "inventoryTotal": int(inventory) if inventory else None,
        "stayTotal": int(stay) if stay else None,
        "flightTotal": int(flight) if flight else None,
        "packageMargin": pay_margin,
        "payLiteApi": pay_lite,
        "payHotel": int(stay) if stay > 0 else None,
        "payFlight": int(flight) if flight > 0 else None,
        "payItinero": pay_margin,
        "payMargin": pay_margin,
        "estimatedExtrasMin": extra_lo or None,
        "estimatedExtrasMax": extra_hi or None,
        "estimatedTripMin": trip_lo if bookable or extra_lo else None,
        "estimatedTripMax": trip_hi if bookable or extra_hi else None,
        "stayPerNight": int(per_night) if per_night else None,
        "guests": guests,
        "canPay": bool(can_pay and bookable > 0),
        "payNow": int(bookable) if (can_pay and bookable > 0) else None,
        "currency": est.get("currency") or "INR",
        "honesty": (
            "One payment to Itinero. "
            "Hotel and flights are included in the total. "
            "Ground, meals, and darshan stay estimates — not charged here."
        ),
    }


def compute_package_margin(
    *,
    template: dict[str, Any] | None,
    inventory_total: float,
    guests: int = 2,
) -> int:
    """Itinero's package margin — not hotel/flight inventory (those settle on LiteAPI)."""
    import os

    tpl = template or {}
    if tpl.get("packageMargin") is not None:
        try:
            fixed = int(float(tpl.get("packageMargin")))
            return max(0, fixed)
        except (TypeError, ValueError):
            pass
    try:
        pct = float(
            tpl.get("packageMarginPct")
            or tpl.get("package_margin_pct")
            or os.getenv("PACKAGE_MARGIN_PCT")
            or 8
        )
    except (TypeError, ValueError):
        pct = 8.0
    try:
        flat = float(tpl.get("packageMarginFlat") or tpl.get("package_margin_flat") or 0)
    except (TypeError, ValueError):
        flat = 0.0
    try:
        per_guest = float(tpl.get("packageMarginPerGuest") or tpl.get("package_margin_per_guest") or 0)
    except (TypeError, ValueError):
        per_guest = 0.0
    try:
        min_margin = float(tpl.get("packageMarginMin") or os.getenv("PACKAGE_MARGIN_MIN") or 499)
    except (TypeError, ValueError):
        min_margin = 499.0

    if inventory_total <= 0:
        return 0

    from_pct = round(inventory_total * pct / 100.0)
    from_flat = flat + per_guest * max(1, int(guests or 1))
    margin = int(max(from_pct, from_flat))
    if margin > 0 and margin < min_margin:
        margin = int(min_margin)
    return max(0, margin)


def derived_badge(pricing: dict[str, Any], *, region: str | None = None) -> str | None:
    """Only emit a badge from verified live stay math — never brochure copy."""
    stay = pricing.get("stayTotal")
    nights = None
    per = pricing.get("stayPerNight")
    guests = int(pricing.get("guests") or 2)
    if not stay or not per:
        return None
    per_person = float(stay) / max(1, guests)
    if per_person <= 10000 and str(region or "").lower() == "domestic":
        return f"Stays under ₹10k / person for these dates"
    if per and per <= 2500:
        return f"Stays from ₹{int(per):,}/night"
    return None
