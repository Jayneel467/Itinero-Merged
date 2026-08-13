#!/usr/bin/env python3
"""Run Vero companion stress-test (100 prompts) against live /api/chat.

Usage:
  .venv/bin/python -m general_agent.eval.companion_stress.run --smoke
  .venv/bin/python -m general_agent.eval.companion_stress.run --ids 23,51,61,71,83,100
  .venv/bin/python -m general_agent.eval.companion_stress.run --bucket C --limit 8
  .venv/bin/python -m general_agent.eval.companion_stress.run --dump-jsonl
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .fixtures import FIXTURES
from .metrics import QA_QUESTIONS, fail_hard
from .prompts_100 import BY_BUCKET, BY_ID, all_prompts

BASE = "http://127.0.0.1:8001"
OUT_DIR = Path(__file__).resolve().parent
LAST = OUT_DIR / "last_run.json"

SMOKE_IDS = [1, 11, 23, 33, 51, 61, 71, 83, 90, 100]


def chat(message: str, fixture: str, timeout: int = 180) -> dict:
    body = {
        "message": message,
        "thread_id": f"companion-stress-{fixture}-{int(time.time() * 1000)}",
        "spoken_language": "en-IN",
        "page_context": FIXTURES.get(fixture) or FIXTURES["plan"],
    }
    req = urllib.request.Request(
        f"{BASE}/api/chat",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode())
        ms = int((time.perf_counter() - t0) * 1000)
        reply = data.get("reply") or data.get("response") or ""
        return {
            "ok": True,
            "ms": ms,
            "reply": reply if isinstance(reply, str) else json.dumps(reply),
        }
    except Exception as exc:  # noqa: BLE001
        ms = int((time.perf_counter() - t0) * 1000)
        err = str(exc)
        if isinstance(exc, urllib.error.HTTPError):
            try:
                err = exc.read().decode()[:500]
            except Exception:
                pass
        return {"ok": False, "ms": ms, "reply": "", "error": err}


def _preview(text: str, n: int = 480) -> str:
    t = (text or "").replace("\n", " ").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def evaluate_item(item: dict) -> dict:
    result = chat(item["prompt"], item["fixture"])
    reply = result.get("reply") or ""
    flags = fail_hard(reply, item["prompt"], item["id"])
    return {
        "id": item["id"],
        "bucket": item["bucket"],
        "fixture": item["fixture"],
        "prompt": item["prompt"],
        "must": item.get("must") or [],
        "must_not": item.get("must_not") or [],
        "expected_behaviors": item.get("expected_behaviors") or [],
        "ok": result["ok"],
        "ms": result["ms"],
        "auto_flags": flags,
        "reply_preview": _preview(reply),
        "reply": reply,
        "error": result.get("error"),
        "qa": QA_QUESTIONS,
    }


def dump_jsonl() -> None:
    path = OUT_DIR / "prompts_100.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for item in all_prompts():
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"wrote {path} ({len(all_prompts())})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--ids", default="")
    ap.add_argument("--bucket", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dump-jsonl", action="store_true")
    args = ap.parse_args()

    if args.dump_jsonl:
        dump_jsonl()
        return

    queue = []
    if args.smoke:
        queue.extend(BY_ID[i] for i in SMOKE_IDS)
    if args.ids:
        queue.extend(BY_ID[int(x.strip())] for x in args.ids.split(",") if x.strip())
    if args.bucket:
        items = list(BY_BUCKET[args.bucket.strip().upper()])
        if args.limit:
            items = items[: args.limit]
        queue.extend(items)
    if not queue:
        ap.print_help()
        print(f"\nprompts={len(all_prompts())}  smoke={SMOKE_IDS}")
        return

    rows = []
    for item in queue:
        row = evaluate_item(item)
        rows.append(row)
        flags = ",".join(row["auto_flags"]) or "-"
        print(f"\n=== {row['bucket']} {row['id']}  {row['ms']}ms  flags={flags} ===")
        print(f"Q: {row['prompt'][:240]}")
        if not row["ok"]:
            print(f"ERR: {row.get('error')}")
        else:
            print(f"A: {row['reply_preview']}")

    payload = {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "n": len(rows),
        "ok": sum(1 for r in rows if r["ok"]),
        "flagged": sum(1 for r in rows if r["auto_flags"]),
        "rows": rows,
    }
    LAST.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {LAST}  ok={payload['ok']}/{payload['n']}  auto_flags={payload['flagged']}")


if __name__ == "__main__":
    main()
