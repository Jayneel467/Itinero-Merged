#!/usr/bin/env python3
"""Run Vero trip-planning benchmark against live /api/chat.

Usage (from repo root):
  .venv/bin/python -m general_agent.eval.trip_benchmark.run --smoke
  .venv/bin/python -m general_agent.eval.trip_benchmark.run --killers
  .venv/bin/python -m general_agent.eval.trip_benchmark.run --ids 1,52,102,151,201,251
  .venv/bin/python -m general_agent.eval.trip_benchmark.run --killer-ids K01,K02
  .venv/bin/python -m general_agent.eval.trip_benchmark.run --bucket A --limit 5
  .venv/bin/python -m general_agent.eval.trip_benchmark.run --dump-jsonl
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .killers_50 import BY_ID as KILLERS, all_killers
from .metrics import METRICS, fail_hard
from .personas import PERSONAS, page_context
from .prompts_300 import BY_ID, all_prompts

BASE = "http://127.0.0.1:8001"
OUT_DIR = Path(__file__).resolve().parent
LAST = OUT_DIR / "last_run.json"


def chat(message: str, bucket: str, timeout: int = 180) -> dict:
    # Fresh thread_id per prompt — Vero memory is scoped to thread_id (NOT conversation_id).
    body = {
        "message": message,
        "thread_id": f"trip-bench-{bucket}-{int(time.time() * 1000)}-{id(message)}",
        "spoken_language": "en-IN" if bucket in ("A", "B", "C", "D") else "en-US",
        "page_context": page_context(bucket),
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
        reply = data.get("reply") or data.get("response") or data.get("message") or ""
        return {
            "ok": True,
            "ms": ms,
            "reply": reply if isinstance(reply, str) else json.dumps(reply),
            "tools": data.get("tools_used") or data.get("tool_calls") or [],
            "raw_keys": sorted(data.keys()),
        }
    except Exception as exc:  # noqa: BLE001 — eval harness
        ms = int((time.perf_counter() - t0) * 1000)
        err = str(exc)
        if isinstance(exc, urllib.error.HTTPError):
            try:
                err = exc.read().decode()[:500]
            except Exception:
                pass
        return {"ok": False, "ms": ms, "reply": "", "error": err, "tools": []}


def _preview(text: str, n: int = 420) -> str:
    t = (text or "").replace("\n", " ").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def evaluate_item(item: dict, *, is_killer: bool = False) -> dict:
    bucket = item["bucket"]
    result = chat(item["prompt"], bucket)
    reply = result.get("reply") or ""
    flags = fail_hard(reply, item["prompt"])
    row = {
        "id": item["id"],
        "killer": is_killer,
        "bucket": bucket,
        "persona": PERSONAS[bucket]["label"],
        "vague": item.get("vague", False),
        "needs_live": item.get("needs_live", False),
        "metrics": item.get("metrics", []),
        "hard_constraints": item.get("hard_constraints", []),
        "expected_behaviors": item.get("expected_behaviors", []),
        "prompt": item["prompt"],
        "ok": result["ok"],
        "ms": result["ms"],
        "tools": result.get("tools") or [],
        "auto_flags": flags,
        "reply_preview": _preview(reply),
        "reply": reply,
        "error": result.get("error"),
    }
    return row


def dump_jsonl() -> None:
    p300 = OUT_DIR / "prompts_300.jsonl"
    k50 = OUT_DIR / "killers_50.jsonl"
    with p300.open("w", encoding="utf-8") as f:
        for item in all_prompts():
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    with k50.open("w", encoding="utf-8") as f:
        for item in all_killers():
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"wrote {p300.name} ({len(all_prompts())}) and {k50.name} ({len(all_killers())})")


def _print_row(row: dict) -> None:
    tag = "KILL" if row.get("killer") else row["bucket"]
    flags = ",".join(row.get("auto_flags") or []) or "-"
    print(f"\n=== {tag} {row['id']}  {row['ms']}ms  flags={flags} ===")
    print(f"Q: {row['prompt'][:220]}{'…' if len(row['prompt']) > 220 else ''}")
    if not row["ok"]:
        print(f"ERR: {row.get('error')}")
        return
    print(f"A: {row['reply_preview']}")
    mets = ", ".join(row.get("metrics") or [])
    print(f"metrics: {mets}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="1 prompt per bucket A–F + K01,K02")
    ap.add_argument("--killers", action="store_true", help="all 50 killers (slow, live APIs)")
    ap.add_argument("--ids", default="", help="comma 300-set ids")
    ap.add_argument("--killer-ids", default="", help="comma K01,K02,...")
    ap.add_argument("--bucket", default="", help="A-F")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dump-jsonl", action="store_true")
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    if args.dump_jsonl:
        dump_jsonl()
        return

    queue: list[tuple[dict, bool]] = []
    if args.smoke:
        smoke_ids = [1, 52, 102, 151, 219, 281]
        for i in smoke_ids:
            queue.append((BY_ID[i], False))
        queue.append((KILLERS["K01"], True))
        queue.append((KILLERS["K02"], True))
    if args.killers:
        for k in all_killers():
            queue.append((k, True))
    if args.ids:
        for part in args.ids.split(","):
            queue.append((BY_ID[int(part.strip())], False))
    if args.killer_ids:
        for part in args.killer_ids.split(","):
            queue.append((KILLERS[part.strip().upper()], True))
    if args.bucket:
        b = args.bucket.strip().upper()
        items = [p for p in all_prompts() if p["bucket"] == b]
        if args.limit:
            items = items[: args.limit]
        queue.extend((p, False) for p in items)

    if not queue:
        ap.print_help()
        print("\nmetrics:", ", ".join(METRICS))
        print(f"prompts: {len(all_prompts())}  killers: {len(all_killers())}")
        return

    rows = []
    for item, is_killer in queue:
        row = evaluate_item(item, is_killer=is_killer)
        rows.append(row)
        _print_row(row)

    payload = {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "base": BASE,
        "n": len(rows),
        "ok": sum(1 for r in rows if r["ok"]),
        "flagged": sum(1 for r in rows if r.get("auto_flags")),
        "rows": rows,
    }
    LAST.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {LAST}  ok={payload['ok']}/{payload['n']}  auto_flags={payload['flagged']}")


if __name__ == "__main__":
    main()
