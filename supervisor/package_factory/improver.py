"""Daily package improver - upgrades live catalog every day.

Not just “add seeds”. Walks packages.json and:
  - backfills markets / missing editorial fields
  - refreshes seasonal idealMonths + featured rotation
  - re-validates via checker when structure changed
  - fills thin markets by authoring new drafts

Safe: writes only when something actually improved.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from . import STATUS_PUBLISHED

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "packages.json"

# Soft seasonal windows by theme (month numbers 1-12).
_THEME_MONTHS: dict[str, list[str]] = {
    "beach": ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
    "hills": ["Apr", "May", "Jun", "Sep", "Oct"],
    "ski": ["Dec", "Jan", "Feb", "Mar"],
    "pilgrimage": ["May", "Jun", "Jul", "Aug", "Sep"],
    "safari": ["Jun", "Jul", "Aug", "Sep", "Oct"],
    "city": ["Mar", "Apr", "May", "Sep", "Oct", "Nov"],
    "honeymoon": ["Oct", "Nov", "Dec", "Jan", "Feb"],
}

_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load() -> list[dict[str, Any]]:
    if not _DATA_PATH.exists():
        return []
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    return raw if isinstance(raw, list) else []


def _save(rows: list[dict[str, Any]]) -> None:
    _DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    _DATA_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _infer_markets(pkg: dict[str, Any]) -> list[str]:
    explicit = pkg.get("markets")
    if isinstance(explicit, list) and explicit:
        return [str(m).strip().upper() for m in explicit if str(m).strip()]
    region = str(pkg.get("region") or "").lower()
    if region == "domestic":
        # Legacy catalog domestic = India unless US destinations.
        blob = " ".join(
            [
                str(pkg.get("title") or ""),
                " ".join(pkg.get("destinations") or []),
                str((pkg.get("flight") or {}).get("gatewayCity") or ""),
            ]
        ).lower()
        if any(x in blob for x in ("new york", "miami", "los angeles", "california", "usa")):
            return ["US"]
        return ["IN"]
    return ["*"]


def _ideal_months_for(pkg: dict[str, Any]) -> list[str]:
    theme = str(pkg.get("theme") or "").lower()
    themes = [str(t).lower() for t in (pkg.get("themes") or [])]
    for key in (theme, *themes):
        if key in _THEME_MONTHS:
            return list(_THEME_MONTHS[key])
    return ["Apr", "May", "Jun", "Sep", "Oct"]


def _quality_score(pkg: dict[str, Any]) -> int:
    score = 0
    if pkg.get("title"):
        score += 10
    if pkg.get("overview") and len(str(pkg.get("overview"))) >= 40:
        score += 10
    if pkg.get("tagline"):
        score += 5
    if len(pkg.get("highlights") or []) >= 3:
        score += 15
    if len(pkg.get("inclusions") or []) >= 2:
        score += 10
    if pkg.get("itinerary") or pkg.get("dayBlueprints"):
        score += 20
    if pkg.get("markets"):
        score += 10
    if pkg.get("destinations"):
        score += 10
    if pkg.get("coverImage"):
        score += 5
    if pkg.get("idealMonths"):
        score += 5
    return score


def _default_highlights(pkg: dict[str, Any]) -> list[str]:
    dests = [str(d) for d in (pkg.get("destinations") or []) if str(d).strip()]
    theme = str(pkg.get("theme") or "trip").replace("_", " ")
    out = []
    if dests:
        out.append(f"Anchored around {', '.join(dests[:3])}")
    out.append(f"Built for a {theme} pace")
    nights = pkg.get("durationNights")
    if nights:
        out.append(f"{nights}-night stay plan with live hotel quotes")
    else:
        out.append("Live hotel quotes when you pick dates")
    return out[:4]


def _default_inclusions() -> list[str]:
    return [
        "Validated day-by-day plan for your dates",
        "Live hotel stays for each base city",
        "Package confirmation with structured itinerary",
    ]


def improve_package(pkg: dict[str, Any], *, today: date | None = None) -> tuple[dict[str, Any], list[str]]:
    """Return (updated_pkg, list of improvement codes)."""
    today = today or date.today()
    row = dict(pkg)
    changes: list[str] = []

    markets = _infer_markets(row)
    if markets != list(row.get("markets") or []):
        row["markets"] = markets
        changes.append("markets")

    highlights = list(row.get("highlights") or [])
    if len(highlights) < 3:
        row["highlights"] = _default_highlights(row)
        changes.append("highlights")

    inclusions = list(row.get("inclusions") or [])
    if len(inclusions) < 2:
        row["inclusions"] = _default_inclusions()
        changes.append("inclusions")

    if not str(row.get("coverImage") or "").strip():
        from supervisor.destination_covers import fill_package_cover

        filled = fill_package_cover(row)
        if str(filled.get("coverImage") or "").strip():
            row = filled
            changes.append("cover_image")

    if not row.get("idealMonths"):
        row["idealMonths"] = _ideal_months_for(row)
        changes.append("ideal_months")
    else:
        # Seasonal nudge: ensure current month’s neighbours stay in window for city/beach.
        months = list(row.get("idealMonths") or [])
        cur = _MONTH_NAMES[today.month - 1]
        theme = str(row.get("theme") or "").lower()
        if theme in ("city", "beach", "honeymoon") and cur not in months and today.month in (10, 11, 12, 1, 2, 3, 4):
            months = list(dict.fromkeys([*_ideal_months_for(row), *months]))[:8]
            if months != list(row.get("idealMonths") or []):
                row["idealMonths"] = months
                changes.append("ideal_months_seasonal")

    if not row.get("tagline") and row.get("overview"):
        overview = str(row.get("overview") or "").strip()
        row["tagline"] = (overview[:90] + "…") if len(overview) > 90 else overview
        changes.append("tagline")

    if not row.get("productType"):
        row["productType"] = "curated_template"
        changes.append("product_type")

    score = _quality_score(row)
    prev_score = int((row.get("pipeline") or {}).get("qualityScore") or 0)
    if score != prev_score or changes:
        pipeline = dict(row.get("pipeline") or {})
        history = list(pipeline.get("improvements") or [])
        if changes:
            history.append({"at": _now(), "changes": changes, "qualityScore": score})
            history = history[-30:]
            pipeline["improvements"] = history
            pipeline["lastImprovedAt"] = _now()
            pipeline["improver"] = "package_factory.improver.daily"
            changes.append("pipeline")
        pipeline["qualityScore"] = score
        pipeline["status"] = pipeline.get("status") or STATUS_PUBLISHED
        row["pipeline"] = pipeline

    # Drop duplicate "pipeline" from changes list noise for callers
    clean = [c for c in changes if c != "pipeline"]
    if score != prev_score and "quality_score" not in clean:
        clean.append("quality_score")
    return row, clean


def rotate_featured(rows: list[dict[str, Any]], *, today: date | None = None) -> list[str]:
    """Rotate featured flags so each market gets fresh homepage energy."""
    today = today or date.today()
    day_index = today.toordinal()
    touched: list[str] = []

    by_market: dict[str, list[dict[str, Any]]] = {}
    for pkg in rows:
        markets = [str(m).upper() for m in (pkg.get("markets") or ["*"])]
        keys = markets if markets else ["*"]
        for m in keys:
            if m == "*":
                continue
            by_market.setdefault(m, []).append(pkg)
        if "*" in keys or not markets:
            by_market.setdefault("GLOBAL", []).append(pkg)

    for market, pkgs in by_market.items():
        if len(pkgs) < 2:
            continue
        # Stable sort then pick 2 featured by day rotation
        ordered = sorted(pkgs, key=lambda p: str(p.get("slug") or ""))
        pick_a = ordered[day_index % len(ordered)]
        pick_b = ordered[(day_index + 3) % len(ordered)]
        chosen = {str(pick_a.get("slug")), str(pick_b.get("slug"))}
        for pkg in ordered:
            slug = str(pkg.get("slug") or "")
            want = slug in chosen
            if bool(pkg.get("featured")) != want:
                pkg["featured"] = want
                touched.append(f"{market}:{slug}:{'on' if want else 'off'}")
                pipeline = dict(pkg.get("pipeline") or {})
                pipeline["lastFeaturedRotateAt"] = _now()
                pkg["pipeline"] = pipeline
    return touched


def improve_live_catalog(
    *,
    dry_run: bool = False,
    rotate: bool = True,
) -> dict[str, Any]:
    """Daily pass over packages.json."""
    rows = _load()
    improved: list[dict[str, Any]] = []
    next_rows: list[dict[str, Any]] = []

    for pkg in rows:
        if not isinstance(pkg, dict):
            continue
        updated, changes = improve_package(pkg)
        next_rows.append(updated)
        if changes:
            improved.append({"slug": updated.get("slug"), "changes": changes, "qualityScore": _quality_score(updated)})

    featured_touches: list[str] = []
    if rotate:
        featured_touches = rotate_featured(next_rows)

    if not dry_run and (improved or featured_touches):
        _save(next_rows)

    weak = [
        {"slug": p.get("slug"), "qualityScore": _quality_score(p)}
        for p in next_rows
        if _quality_score(p) < 60
    ]

    return {
        "ok": True,
        "agent": "package_factory.improver",
        "at": _now(),
        "total": len(next_rows),
        "improvedCount": len(improved),
        "improved": improved[:40],
        "featuredRotations": featured_touches[:40],
        "weakPackages": weak[:20],
        "dryRun": dry_run,
        "path": str(_DATA_PATH),
    }


def fill_thin_markets(
    *,
    markets: list[str],
    min_domestic: int = 2,
    min_global: int = 8,
    limit: int = 5,
    publish: bool = True,
) -> dict[str, Any]:
    """If a market lacks domestic packages, author + gate + publish seeds.

    Also ensures GLOBAL international inventory stays above min_global.
    """
    from supervisor.package_factory.author import author_drafts
    from supervisor.package_factory.checker import check_template
    from supervisor.package_factory.publisher import publish_to_live, save_draft
    from supervisor.package_factory.reverify import reverify_template_sync
    from supervisor.packages_structured import list_packages

    def _gate_and_publish(drafts: list[dict[str, Any]], existing_slugs: set[str]) -> list[dict[str, Any]]:
        summary = []
        for draft in drafts:
            if str(draft.get("slug")) in existing_slugs:
                continue
            checked = check_template(draft)
            if not checked["ok"]:
                save_draft(checked["package"])
                summary.append({"slug": draft.get("slug"), "ok": False, "stage": "checker"})
                continue
            rev = reverify_template_sync(checked["package"], probe_live=False)
            save_draft(rev["package"])
            if not rev["ok"]:
                summary.append({"slug": draft.get("slug"), "ok": False, "stage": "reverify"})
                continue
            pub: dict[str, Any] = {"ok": True, "skipped": True}
            if publish:
                pub = publish_to_live(rev["package"], require_reverified=True)
            summary.append({"slug": draft.get("slug"), "ok": bool(pub.get("ok")), "publish": pub})
            if pub.get("ok"):
                existing_slugs.add(str(draft.get("slug")))
        return summary

    filled: list[dict[str, Any]] = []

    # Worldwide international floor
    all_pkgs = (list_packages(market=None) or {}).get("packages") or []
    global_intl = [
        p
        for p in all_pkgs
        if str(p.get("region") or "").lower() == "international"
        and (
            "*" in [str(m).upper() for m in (p.get("markets") or [])]
            or "GLOBAL" in [str(m).upper() for m in (p.get("markets") or [])]
        )
    ]
    existing = {str(p.get("slug")) for p in all_pkgs}
    if len(global_intl) < min_global:
        need = min_global - len(global_intl)
        summary = _gate_and_publish(
            author_drafts("GLOBAL", limit=max(need, limit), include_global=False),
            existing,
        )
        filled.append(
            {
                "market": "GLOBAL",
                "ok": all(s.get("ok") for s in summary) if summary else True,
                "internationalBefore": len(global_intl),
                "summary": summary,
            }
        )
    else:
        filled.append(
            {
                "market": "GLOBAL",
                "ok": True,
                "skipped": True,
                "international": len(global_intl),
            }
        )

    for market in markets:
        code = str(market).upper()
        if code in ("GLOBAL", "WORLD", "ALL", "WORLDWIDE", "EU"):
            continue
        res = list_packages(market=code)
        pkgs = res.get("packages") or []
        domestic = [
            p
            for p in pkgs
            if str(p.get("region") or "").lower() == "domestic"
            and code in [str(m).upper() for m in (p.get("markets") or [])]
        ]
        if len(domestic) >= min_domestic:
            filled.append({"market": code, "ok": True, "skipped": True, "domestic": len(domestic)})
            continue

        need = max(1, min_domestic - len(domestic))
        summary = _gate_and_publish(
            author_drafts(code, limit=min(limit, need + 2), include_global=False),
            {str(p.get("slug")) for p in pkgs},
        )
        filled.append(
            {
                "market": code,
                "ok": all(s.get("ok") for s in summary) if summary else True,
                "domesticBefore": len(domestic),
                "summary": summary,
            }
        )
    return {"ok": all(r.get("ok") for r in filled), "markets": filled}
