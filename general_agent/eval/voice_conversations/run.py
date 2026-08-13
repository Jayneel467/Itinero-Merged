#!/usr/bin/env python3
"""Multi-turn Vero *voice* eval — same thread_id, voice_mode=True.

Usage:
  .venv/bin/python -m general_agent.eval.voice_conversations.run --smoke
  .venv/bin/python -m general_agent.eval.voice_conversations.run --ids 1,2,14,39,50
  .venv/bin/python -m general_agent.eval.voice_conversations.run --dump-jsonl
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .conversations_50 import BY_ID, CONVERSATIONS
from .fixtures import FIXTURES
from .metrics import VOICE_QA, fail_hard, hit_must_any

BASE = "http://127.0.0.1:8001"
OUT_DIR = Path(__file__).resolve().parent
LAST = OUT_DIR / "last_run.json"
SMOKE_IDS = [1, 2, 14, 39, 50]


def chat(message: str, thread_id: str, fixture: str, timeout: int = 180) -> dict:
    body = {
        "message": message,
        "thread_id": thread_id,
        "voice_mode": True,
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
        return {"ok": True, "ms": ms, "reply": reply if isinstance(reply, str) else json.dumps(reply)}
    except Exception as exc:  # noqa: BLE001
        ms = int((time.perf_counter() - t0) * 1000)
        err = str(exc)
        if isinstance(exc, urllib.error.HTTPError):
            try:
                err = exc.read().decode()[:400]
            except Exception:
                pass
        return {"ok": False, "ms": ms, "reply": "", "error": err}


def _preview(text: str, n: int = 360) -> str:
    t = (text or "").replace("\n", " ").strip()
    return t if len(t) <= n else t[: n - 1] + "…"


def run_conversation(conv: dict) -> dict:
    thread = f"voice-{conv['id']}-{int(time.time() * 1000)}"
    fixture = conv.get("fixture") or "plan"
    turns_out = []
    ok = True
    for msg in list(conv.get("setup") or []):
        res = chat(msg, thread, fixture)
        turns_out.append({"role": "setup", "user": msg, **res, "preview": _preview(res.get("reply") or "")})
        if not res["ok"]:
            ok = False
            break
    last_reply = ""
    if ok:
        for msg in conv["turns"]:
            res = chat(msg, thread, fixture)
            turns_out.append({"role": "user", "user": msg, **res, "preview": _preview(res.get("reply") or "")})
            last_reply = res.get("reply") or ""
            if not res["ok"]:
                ok = False
                break
    flags = fail_hard(last_reply, conv) if ok else ["transport_error"]
    must_hit = hit_must_any(last_reply, conv.get("last_must_any") or []) if ok else False
    if ok and conv.get("last_must_any") and not must_hit:
        flags.append("missed_must_any")
    return {
        "id": conv["id"],
        "name": conv["name"],
        "skills": conv.get("skills") or [],
        "ok": ok,
        "auto_flags": flags,
        "must_any_hit": must_hit,
        "n_turns": len(conv["turns"]),
        "total_ms": sum(t.get("ms") or 0 for t in turns_out),
        "last_preview": _preview(last_reply, 480),
        "last_reply": last_reply,
        "turns": turns_out,
        "qa": VOICE_QA,
    }


def dump_jsonl() -> None:
    path = OUT_DIR / "conversations_50.jsonl"
    with path.open("w", encoding="utf-8") as f:
        for c in CONVERSATIONS:
            f.write(json.dumps(c, ensure_ascii=False) + "\n")
    print(f"wrote {path} ({len(CONVERSATIONS)})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--ids", default="")
    ap.add_argument("--dump-jsonl", action="store_true")
    args = ap.parse_args()
    if args.dump_jsonl:
        dump_jsonl()
        return
    ids = []
    if args.smoke:
        ids.extend(SMOKE_IDS)
    if args.ids:
        ids.extend(int(x.strip()) for x in args.ids.split(",") if x.strip())
    if not ids:
        ap.print_help()
        print(f"\nconversations={len(CONVERSATIONS)} smoke={SMOKE_IDS}")
        return
    rows = []
    for i in ids:
        row = run_conversation(BY_ID[i])
        rows.append(row)
        flags = ",".join(row["auto_flags"]) or "-"
        print(f"\n=== V{row['id']} {row['name']}  {row['total_ms']}ms  flags={flags} ===")
        for t in row["turns"]:
            tag = "S" if t["role"] == "setup" else "U"
            print(f"  {tag}: {t['user'][:120]}")
            print(f"  V: {t['preview']}")
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
