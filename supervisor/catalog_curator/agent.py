"""Curator agent - refresh factories, then verify Explore + Packages are fine."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import DEFAULT_MARKETS, STATUS_DEGRADED, STATUS_FAILED, STATUS_HEALTHY
from .health import run_health


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _run_package_factory(market: str, *, limit: int, publish: bool, probe_live: bool) -> dict[str, Any]:
    from supervisor.package_factory.author import author_drafts, author_worldwide
    from supervisor.package_factory.checker import check_template
    from supervisor.package_factory.publisher import publish_to_live, save_draft
    from supervisor.package_factory.reverify import reverify_template_sync

    summary: list[dict[str, Any]] = []
    code = str(market or "").strip().upper()
    if code in ("WORLD", "ALL", "WORLDWIDE"):
        drafts = author_worldwide(limit_per_market=limit)
    else:
        drafts = author_drafts(code, limit=limit, include_global=(code != "GLOBAL"))
    if not drafts:
        return {"ok": True, "market": market, "skipped": True, "reason": "no_seeds", "summary": []}

    for draft in drafts:
        checked = check_template(draft)
        if not checked["ok"]:
            save_draft(checked["package"])
            summary.append(
                {
                    "slug": draft.get("slug"),
                    "ok": False,
                    "stage": "checker",
                    "status": checked["status"],
                }
            )
            continue
        rev = reverify_template_sync(checked["package"], probe_live=probe_live)
        save_draft(rev["package"])
        if not rev["ok"]:
            summary.append(
                {
                    "slug": draft.get("slug"),
                    "ok": False,
                    "stage": "reverify",
                    "status": rev["status"],
                }
            )
            continue
        pub: dict[str, Any] = {"ok": True, "skipped": True}
        if publish:
            pub = publish_to_live(rev["package"], require_reverified=True)
        summary.append(
            {
                "slug": draft.get("slug"),
                "ok": bool(pub.get("ok")),
                "stage": "publish" if publish else "reverify",
                "status": (rev["package"].get("pipeline") or {}).get("status"),
                "publish": pub,
            }
        )
    return {
        "ok": all(row.get("ok") for row in summary) if summary else True,
        "market": market,
        "summary": summary,
    }


def _run_explore_factory(market: str, *, limit: int, publish: bool, probe_live: bool) -> dict[str, Any]:
    from supervisor.explore_factory.author import author_drafts
    from supervisor.explore_factory.checker import check_destination
    from supervisor.explore_factory.publisher import publish_to_live, save_draft
    from supervisor.explore_factory.reverify import reverify_destination

    summary: list[dict[str, Any]] = []
    drafts = author_drafts(market, limit=limit)
    if not drafts:
        return {"ok": True, "market": market, "skipped": True, "reason": "no_seeds", "summary": []}

    for draft in drafts:
        checked = check_destination(draft)
        if not checked["ok"]:
            save_draft(checked["destination"])
            summary.append(
                {
                    "slug": draft.get("slug"),
                    "ok": False,
                    "stage": "checker",
                    "status": checked["status"],
                }
            )
            continue
        rev = reverify_destination(checked["destination"], probe_live=probe_live)
        save_draft(rev["destination"])
        if not rev["ok"]:
            summary.append(
                {
                    "slug": draft.get("slug"),
                    "ok": False,
                    "stage": "reverify",
                    "status": rev["status"],
                }
            )
            continue
        pub: dict[str, Any] = {"ok": True, "skipped": True}
        if publish:
            pub = publish_to_live(rev["destination"], require_reverified=True)
        summary.append(
            {
                "slug": draft.get("slug"),
                "ok": bool(pub.get("ok")),
                "stage": "publish" if publish else "reverify",
                "status": (rev["destination"].get("pipeline") or {}).get("status"),
                "publish": pub,
            }
        )
    return {
        "ok": all(row.get("ok") for row in summary) if summary else True,
        "market": market,
        "summary": summary,
    }


def refresh_catalogs(
    *,
    markets: list[str] | None = None,
    limit: int = 8,
    publish: bool = True,
    probe_live: bool = False,
    packages: bool = True,
    explore: bool = True,
) -> dict[str, Any]:
    """Keep catalogs updated via package + explore factories."""
    markets = [str(m).upper() for m in (markets or list(DEFAULT_MARKETS))]
    package_runs: list[dict[str, Any]] = []
    explore_runs: list[dict[str, Any]] = []

    for market in markets:
        if packages:
            package_runs.append(
                _run_package_factory(
                    market, limit=limit, publish=publish, probe_live=probe_live
                )
            )
        if explore:
            explore_runs.append(
                _run_explore_factory(
                    market, limit=limit, publish=publish, probe_live=probe_live
                )
            )

    ok = all(r.get("ok") for r in package_runs + explore_runs)
    return {
        "ok": ok,
        "at": _now(),
        "markets": markets,
        "packages": package_runs,
        "explore": explore_runs,
    }


def daily(
    *,
    markets: list[str] | None = None,
    limit: int = 8,
    publish: bool = True,
    probe_live: bool = False,
    base_url: str | None = None,
    dry_run: bool = False,
    save_report: bool = True,
) -> dict[str, Any]:
    """Everyday loop: improve packages → fill thin markets → polish explore → health."""
    from pathlib import Path

    from supervisor.explore_factory.improver import improve_live_catalog as improve_explore
    from supervisor.package_factory.improver import fill_thin_markets, improve_live_catalog

    markets = [str(m).upper() for m in (markets or list(DEFAULT_MARKETS))]

    package_improve = improve_live_catalog(dry_run=dry_run, rotate=not dry_run)
    home_markets = [m for m in markets if m not in ("GLOBAL", "WORLD", "ALL", "WORLDWIDE", "EU")]
    if not home_markets:
        home_markets = ["US", "IN", "GB", "AE", "SG", "AU", "JP", "CA"]
    package_fill = fill_thin_markets(
        markets=home_markets,
        min_domestic=2,
        limit=limit,
        publish=publish and not dry_run,
    )
    explore_improve = improve_explore(dry_run=dry_run)

    # Worldwide packages first (Paris, Tokyo, Dubai, …), then per-home domestic.
    package_world = _run_package_factory(
        "WORLDWIDE",
        limit=limit,
        publish=publish and not dry_run,
        probe_live=probe_live,
    )
    refresh_report = refresh_catalogs(
        markets=home_markets,
        limit=limit,
        publish=publish and not dry_run,
        probe_live=probe_live,
        packages=True,
        explore=True,
    )
    refresh_report["worldwide"] = package_world
    if not package_world.get("ok"):
        refresh_report["ok"] = False

    health = run_health(markets=home_markets or markets, base_url=base_url)

    if (
        not health.get("ok")
        or not package_improve.get("ok")
        or not package_fill.get("ok")
        or not explore_improve.get("ok")
        or not refresh_report.get("ok")
    ):
        status = STATUS_FAILED
    elif health.get("status") == STATUS_DEGRADED:
        status = STATUS_DEGRADED
    else:
        status = STATUS_HEALTHY

    report = {
        "ok": status != STATUS_FAILED,
        "status": status,
        "agent": "catalog_curator.daily",
        "at": _now(),
        "markets": markets,
        "packageImprove": package_improve,
        "packageFill": package_fill,
        "exploreImprove": explore_improve,
        "refresh": refresh_report,
        "health": health,
        "pages": {
            "packages": health.get("packages"),
            "explore": health.get("explore"),
            "spa": health.get("spa"),
            "http": health.get("http"),
        },
        "message": {
            STATUS_HEALTHY: "Daily improve complete - Explore + Packages look fine",
            STATUS_DEGRADED: "Daily improve complete with warnings",
            STATUS_FAILED: "Daily improve found failures",
        }.get(status, status),
    }

    if save_report and not dry_run:
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        out_dir = Path(__file__).resolve().parent.parent / "data" / "catalog_curator_reports"
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{day}.json"
        path.write_text(
            __import__("json").dumps(report, indent=2, ensure_ascii=False, default=str) + "\n",
            encoding="utf-8",
        )
        report["reportPath"] = str(path)

    return report


def curate(
    *,
    markets: list[str] | None = None,
    limit: int = 8,
    publish: bool = True,
    probe_live: bool = False,
    refresh: bool = True,
    base_url: str | None = None,
    packages: bool = True,
    explore: bool = True,
) -> dict[str, Any]:
    """Final agent entrypoint: refresh → health-check Explore + Packages pages."""
    markets = [str(m).upper() for m in (markets or list(DEFAULT_MARKETS))]
    refresh_report: dict[str, Any] = {
        "ok": True,
        "skipped": True,
        "at": _now(),
    }
    if refresh:
        refresh_report = refresh_catalogs(
            markets=markets,
            limit=limit,
            publish=publish,
            probe_live=probe_live,
            packages=packages,
            explore=explore,
        )

    health = run_health(markets=markets, base_url=base_url)

    if not health.get("ok") or not refresh_report.get("ok"):
        status = STATUS_FAILED
    elif health.get("status") == STATUS_DEGRADED:
        status = STATUS_DEGRADED
    else:
        status = STATUS_HEALTHY

    return {
        "ok": status != STATUS_FAILED,
        "status": status,
        "agent": "catalog_curator",
        "at": _now(),
        "markets": markets,
        "refresh": refresh_report,
        "health": health,
        "pages": {
            "packages": health.get("packages"),
            "explore": health.get("explore"),
            "spa": health.get("spa"),
            "http": health.get("http"),
        },
        "message": {
            STATUS_HEALTHY: "Explore + Packages catalogs updated and page contracts look fine",
            STATUS_DEGRADED: "Catalogs updated with warnings - review health.issues",
            STATUS_FAILED: "Curator found failures - Explore/Packages need attention",
        }.get(status, status),
    }
