"""CLI for the catalog curator agent.

  # Full loop: refresh factories + verify Explore/Packages pages
  python -m supervisor.catalog_curator run --publish

  # Health only (no new seeds)
  python -m supervisor.catalog_curator health

  # Against a running supervisor
  python -m supervisor.catalog_curator health --base-url http://127.0.0.1:8000
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _print(obj: Any) -> None:
    print(json.dumps(obj, indent=2, ensure_ascii=False, default=str))


def _markets(raw: str | None) -> list[str]:
    if not raw:
        from supervisor.catalog_curator import DEFAULT_MARKETS

        return list(DEFAULT_MARKETS)
    return [m.strip().upper() for m in raw.split(",") if m.strip()]


def cmd_health(args: argparse.Namespace) -> int:
    from supervisor.catalog_curator.health import run_health

    report = run_health(markets=_markets(args.markets), base_url=args.base_url or None)
    _print(report)
    return 0 if report.get("ok") else 1


def cmd_refresh(args: argparse.Namespace) -> int:
    from supervisor.catalog_curator.agent import refresh_catalogs

    report = refresh_catalogs(
        markets=_markets(args.markets),
        limit=args.limit,
        publish=bool(args.publish),
        probe_live=bool(args.probe_live),
        packages=not args.explore_only,
        explore=not args.packages_only,
    )
    _print(report)
    return 0 if report.get("ok") else 1


def cmd_daily(args: argparse.Namespace) -> int:
    from supervisor.catalog_curator.agent import daily

    report = daily(
        markets=_markets(args.markets),
        limit=args.limit,
        publish=bool(args.publish),
        probe_live=bool(args.probe_live),
        base_url=args.base_url or None,
        dry_run=bool(args.dry_run),
        save_report=not bool(args.dry_run),
    )
    _print(report)
    return 0 if report.get("ok") else 1


def cmd_run(args: argparse.Namespace) -> int:
    from supervisor.catalog_curator.agent import curate

    report = curate(
        markets=_markets(args.markets),
        limit=args.limit,
        publish=bool(args.publish),
        probe_live=bool(args.probe_live),
        refresh=not args.health_only,
        base_url=args.base_url or None,
        packages=not args.explore_only,
        explore=not args.packages_only,
    )
    _print(report)
    return 0 if report.get("ok") else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Catalog curator - keep Explore + Packages updated and verify pages"
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--markets", default="", help="Comma list, e.g. US,IN,GB")
        p.add_argument("--base-url", default="", help="Optional live supervisor URL")

    p_health = sub.add_parser("health", help="Check catalogs + SPA page contracts")
    add_common(p_health)
    p_health.set_defaults(func=cmd_health)

    p_refresh = sub.add_parser("refresh", help="Run package + explore factories")
    add_common(p_refresh)
    p_refresh.add_argument("--limit", type=int, default=8)
    p_refresh.add_argument("--publish", action="store_true")
    p_refresh.add_argument("--probe-live", action="store_true")
    p_refresh.add_argument("--packages-only", action="store_true")
    p_refresh.add_argument("--explore-only", action="store_true")
    p_refresh.set_defaults(func=cmd_refresh)

    p_run = sub.add_parser("run", help="Refresh + health (final agent loop)")
    add_common(p_run)
    p_run.add_argument("--limit", type=int, default=8)
    p_run.add_argument("--publish", action="store_true")
    p_run.add_argument("--probe-live", action="store_true")
    p_run.add_argument("--health-only", action="store_true")
    p_run.add_argument("--packages-only", action="store_true")
    p_run.add_argument("--explore-only", action="store_true")
    p_run.set_defaults(func=cmd_run)

    p_daily = sub.add_parser(
        "daily",
        help="Everyday loop: improve packages, fill thin markets, polish explore, health-check",
    )
    add_common(p_daily)
    p_daily.add_argument("--limit", type=int, default=8)
    p_daily.add_argument("--publish", action="store_true", default=True)
    p_daily.add_argument("--no-publish", action="store_true")
    p_daily.add_argument("--probe-live", action="store_true")
    p_daily.add_argument("--dry-run", action="store_true")
    p_daily.set_defaults(func=cmd_daily)

    args = parser.parse_args(argv)
    if getattr(args, "cmd", None) == "daily" and getattr(args, "no_publish", False):
        args.publish = False
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
