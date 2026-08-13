"""CLI / orchestrator: Author → Checker → Reverifier → Publisher.

Examples:
  python -m supervisor.package_factory.pipeline author --market US
  python -m supervisor.package_factory.pipeline run --market US --publish
  python -m supervisor.package_factory.pipeline run --market US --probe-live --publish
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Allow `python -m supervisor.package_factory.pipeline` from repo root.
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _print(obj: Any) -> None:
    print(json.dumps(obj, indent=2, ensure_ascii=False, default=str))


def cmd_author(args: argparse.Namespace) -> int:
    from supervisor.package_factory.author import author_drafts
    from supervisor.package_factory.publisher import save_draft

    drafts = author_drafts(args.market, limit=args.limit)
    paths = []
    for draft in drafts:
        path = save_draft(draft)
        paths.append(str(path))
    _print({"ok": True, "market": args.market.upper(), "count": len(drafts), "paths": paths})
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    from supervisor.package_factory.checker import check_template
    from supervisor.package_factory.publisher import load_drafts, save_draft

    drafts = load_drafts(market=args.market)
    results = []
    for draft in drafts:
        res = check_template(draft)
        save_draft(res["package"])
        results.append(
            {
                "slug": res["package"].get("slug"),
                "ok": res["ok"],
                "status": res["status"],
                "issueCount": len(res["issues"]),
            }
        )
    _print({"ok": all(r["ok"] for r in results) if results else False, "results": results})
    return 0 if results and all(r["ok"] for r in results) else 1


def cmd_reverify(args: argparse.Namespace) -> int:
    from supervisor.package_factory.publisher import load_drafts, save_draft
    from supervisor.package_factory.reverify import reverify_template_sync

    drafts = load_drafts(market=args.market)
    results = []
    for draft in drafts:
        res = reverify_template_sync(draft, probe_live=bool(args.probe_live))
        save_draft(res["package"])
        results.append(
            {
                "slug": res["package"].get("slug"),
                "ok": res["ok"],
                "status": res["status"],
                "issueCount": len(res["issues"]),
            }
        )
    _print({"ok": all(r["ok"] for r in results) if results else False, "results": results})
    return 0 if results and all(r["ok"] for r in results) else 1


def cmd_publish(args: argparse.Namespace) -> int:
    from supervisor.package_factory import STATUS_REVERIFIED
    from supervisor.package_factory.publisher import load_drafts, publish_to_live

    drafts = load_drafts(market=args.market)
    results = []
    for draft in drafts:
        status = str((draft.get("pipeline") or {}).get("status") or "")
        if status != STATUS_REVERIFIED and not args.force:
            results.append(
                {
                    "slug": draft.get("slug"),
                    "ok": False,
                    "message": f"skip: status={status}",
                }
            )
            continue
        res = publish_to_live(
            draft,
            require_reverified=not args.force,
            dry_run=bool(args.dry_run),
        )
        results.append({"slug": draft.get("slug"), **res})
    ok = all(r.get("ok") for r in results if "skip" not in str(r.get("message") or ""))
    _print({"ok": ok, "results": results})
    return 0 if ok else 1


def cmd_run(args: argparse.Namespace) -> int:
    """Full loop for one market or WORLDWIDE: author → check → reverify → optional publish."""
    from supervisor.package_factory.author import author_drafts, author_worldwide
    from supervisor.package_factory.checker import check_template
    from supervisor.package_factory.publisher import publish_to_live, save_draft
    from supervisor.package_factory.reverify import reverify_template_sync

    market = str(args.market or "WORLDWIDE").upper()
    if market in ("WORLDWIDE", "WORLD", "ALL"):
        drafts = author_worldwide(limit_per_market=args.limit)
    else:
        drafts = author_drafts(market, limit=args.limit, include_global=(market != "GLOBAL"))
    summary: list[dict[str, Any]] = []
    for draft in drafts:
        checked = check_template(draft)
        if not checked["ok"]:
            save_draft(checked["package"])
            summary.append(
                {
                    "slug": draft.get("slug"),
                    "stage": "checker",
                    "ok": False,
                    "status": checked["status"],
                    "issues": checked["issues"][:5],
                }
            )
            continue
        rev = reverify_template_sync(checked["package"], probe_live=bool(args.probe_live))
        save_draft(rev["package"])
        if not rev["ok"]:
            summary.append(
                {
                    "slug": draft.get("slug"),
                    "stage": "reverify",
                    "ok": False,
                    "status": rev["status"],
                    "issues": rev["issues"][:5],
                }
            )
            continue
        pub: dict[str, Any] = {"ok": True, "skipped": True}
        if args.publish:
            pub = publish_to_live(
                rev["package"],
                require_reverified=True,
                dry_run=bool(args.dry_run),
            )
        summary.append(
            {
                "slug": draft.get("slug"),
                "stage": "publish" if args.publish else "reverify",
                "ok": bool(pub.get("ok")),
                "status": (rev["package"].get("pipeline") or {}).get("status"),
                "publish": pub,
            }
        )

    ok = all(row.get("ok") for row in summary) if summary else False
    _print({"ok": ok, "market": args.market.upper(), "summary": summary})
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Itinero package factory pipeline")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_author = sub.add_parser("author", help="Create market drafts")
    p_author.add_argument("--market", default="US")
    p_author.add_argument("--limit", type=int, default=5)
    p_author.set_defaults(func=cmd_author)

    p_check = sub.add_parser("check", help="Run checker on drafts")
    p_check.add_argument("--market", default="US")
    p_check.set_defaults(func=cmd_check)

    p_rev = sub.add_parser("reverify", help="Reverify drafts")
    p_rev.add_argument("--market", default="US")
    p_rev.add_argument("--probe-live", action="store_true")
    p_rev.set_defaults(func=cmd_reverify)

    p_pub = sub.add_parser("publish", help="Publish reverified drafts to live catalog")
    p_pub.add_argument("--market", default="US")
    p_pub.add_argument("--force", action="store_true")
    p_pub.add_argument("--dry-run", action="store_true")
    p_pub.set_defaults(func=cmd_publish)

    p_run = sub.add_parser("run", help="Author → check → reverify → optional publish")
    p_run.add_argument("--market", default="WORLDWIDE", help="US/IN/GB/… or WORLDWIDE")
    p_run.add_argument("--limit", type=int, default=8)
    p_run.add_argument("--probe-live", action="store_true")
    p_run.add_argument("--publish", action="store_true")
    p_run.add_argument("--dry-run", action="store_true")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
