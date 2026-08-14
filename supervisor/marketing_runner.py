"""CLI entry for marketing cron (due workflows + digests)."""

from __future__ import annotations

import argparse
import asyncio
import json


async def _main(*, digests: bool, drain: bool, watches: bool) -> None:
    from supervisor.db import init_db
    from supervisor.marketing_workflows import process_due_runs, run_daily_digests
    from supervisor import marketing_store as mstore

    init_db()
    mstore.seed_offers_if_empty()
    out = await process_due_runs(drain=drain)
    if digests:
        out["digests"] = await run_daily_digests()
    if watches:
        from supervisor.watches import check_due

        out["watches"] = await check_due(limit=40)
    print(json.dumps(out, default=str))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--digests", action="store_true")
    p.add_argument(
        "--drain",
        action="store_true",
        help="Keep processing until no due runs (author→mail same invocation).",
    )
    p.add_argument(
        "--watches",
        action="store_true",
        help="Also re-check price watches and send drop emails.",
    )
    args = p.parse_args()
    asyncio.run(_main(digests=args.digests, drain=args.drain, watches=args.watches))
