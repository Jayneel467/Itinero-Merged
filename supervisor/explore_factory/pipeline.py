"""CLI: Author → Checker → Reverifier → Publisher for Explore destinations.

  python -m supervisor.explore_factory.pipeline run --market US --publish
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


def cmd_author(args: argparse.Namespace) -> int:
    from supervisor.explore_factory.author import author_drafts
    from supervisor.explore_factory.publisher import save_draft

    drafts = author_drafts(args.market, limit=args.limit)
    paths = [str(save_draft(d)) for d in drafts]
    _print({"ok": True, "market": args.market.upper(), "count": len(drafts), "paths": paths})
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    from supervisor.explore_factory.checker import check_destination
    from supervisor.explore_factory.publisher import load_drafts, save_draft

    results = []
    for draft in load_drafts(market=args.market):
        res = check_destination(draft)
        save_draft(res["destination"])
        results.append(
            {
                "slug": res["destination"].get("slug"),
                "ok": res["ok"],
                "status": res["status"],
                "issueCount": len(res["issues"]),
            }
        )
    _print({"ok": bool(results) and all(r["ok"] for r in results), "results": results})
    return 0 if results and all(r["ok"] for r in results) else 1


def cmd_reverify(args: argparse.Namespace) -> int:
    from supervisor.explore_factory.publisher import load_drafts, save_draft
    from supervisor.explore_factory.reverify import reverify_destination

    results = []
    for draft in load_drafts(market=args.market):
        res = reverify_destination(draft, probe_live=bool(args.probe_live))
        save_draft(res["destination"])
        results.append(
            {
                "slug": res["destination"].get("slug"),
                "ok": res["ok"],
                "status": res["status"],
                "issueCount": len(res["issues"]),
            }
        )
    _print({"ok": bool(results) and all(r["ok"] for r in results), "results": results})
    return 0 if results and all(r["ok"] for r in results) else 1


def cmd_publish(args: argparse.Namespace) -> int:
    from supervisor.explore_factory import STATUS_REVERIFIED
    from supervisor.explore_factory.publisher import load_drafts, publish_to_live

    results = []
    for draft in load_drafts(market=args.market):
        status = str((draft.get("pipeline") or {}).get("status") or "")
        if status != STATUS_REVERIFIED and not args.force:
            results.append({"slug": draft.get("slug"), "ok": False, "message": f"skip: status={status}"})
            continue
        res = publish_to_live(draft, require_reverified=not args.force, dry_run=bool(args.dry_run))
        results.append({"slug": draft.get("slug"), **res})
    ok = all(r.get("ok") for r in results if "skip" not in str(r.get("message") or ""))
    _print({"ok": ok, "results": results})
    return 0 if ok else 1


def cmd_run(args: argparse.Namespace) -> int:
    from supervisor.explore_factory.author import author_drafts
    from supervisor.explore_factory.checker import check_destination
    from supervisor.explore_factory.publisher import publish_to_live, save_draft
    from supervisor.explore_factory.reverify import reverify_destination

    summary: list[dict[str, Any]] = []
    for draft in author_drafts(args.market, limit=args.limit):
        checked = check_destination(draft)
        if not checked["ok"]:
            save_draft(checked["destination"])
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
        rev = reverify_destination(checked["destination"], probe_live=bool(args.probe_live))
        save_draft(rev["destination"])
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
                rev["destination"],
                require_reverified=True,
                dry_run=bool(args.dry_run),
            )
        summary.append(
            {
                "slug": draft.get("slug"),
                "stage": "publish" if args.publish else "reverify",
                "ok": bool(pub.get("ok")),
                "status": (rev["destination"].get("pipeline") or {}).get("status"),
                "publish": pub,
            }
        )
    ok = all(row.get("ok") for row in summary) if summary else False
    _print({"ok": ok, "market": args.market.upper(), "summary": summary})
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Itinero Explore destination factory")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_author = sub.add_parser("author", help="Create market drafts")
    p_author.add_argument("--market", default="US")
    p_author.add_argument("--limit", type=int, default=8)
    p_author.set_defaults(func=cmd_author)

    p_check = sub.add_parser("check", help="Run checker on drafts")
    p_check.add_argument("--market", default="US")
    p_check.set_defaults(func=cmd_check)

    p_rev = sub.add_parser("reverify", help="Reverify drafts")
    p_rev.add_argument("--market", default="US")
    p_rev.add_argument("--probe-live", action="store_true")
    p_rev.set_defaults(func=cmd_reverify)

    p_pub = sub.add_parser("publish", help="Publish to live catalog")
    p_pub.add_argument("--market", default="US")
    p_pub.add_argument("--force", action="store_true")
    p_pub.add_argument("--dry-run", action="store_true")
    p_pub.set_defaults(func=cmd_publish)

    p_run = sub.add_parser("run", help="Full loop")
    p_run.add_argument("--market", default="US")
    p_run.add_argument("--limit", type=int, default=8)
    p_run.add_argument("--probe-live", action="store_true")
    p_run.add_argument("--publish", action="store_true")
    p_run.add_argument("--dry-run", action="store_true")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
