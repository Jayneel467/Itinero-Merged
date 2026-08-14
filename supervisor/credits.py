"""Claude-style Vero credits.

Vero stays free. Each traveller gets a daily pool that resets at UTC midnight.
A prepaid wallet (credit packs) sits on top of that pool.

When the pool is empty they wait for reset or spend wallet credits. Search/book
on the site still works. Low remaining credits degrade to DeepSeek chat only
(unless they are paying/booking).
"""

from __future__ import annotations

import contextvars
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("itinero.vero.credits")

_lock = threading.Lock()
_mem: dict[tuple[str, str], int] = {}  # (subject, day) -> used
_plan_cache: dict[str, tuple[float, str]] = {}
_PLAN_TTL_S = 45.0
_turn: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
    "vero_credit_turn", default=None
)


def begin_turn(
    subject: str,
    plan: str | None = None,
    *,
    consume: bool = True,
    remaining: int | None = None,
) -> None:
    _turn.set(
        {
            "subject": str(subject or "anon"),
            "plan": "plus" if str(plan or "").lower() == "plus" else "free",
            "consume": bool(consume),
            "remaining": remaining,
        }
    )


def current_turn() -> dict[str, Any] | None:
    return _turn.get()


def end_turn() -> None:
    _turn.set(None)


def cost_subject_from_turn(fallback: str | None = None) -> str:
    ctx = _turn.get() or {}
    return str(ctx.get("subject") or fallback or "anon")


def credits_remaining_from_turn() -> int | None:
    ctx = _turn.get() or {}
    if ctx.get("remaining") is None:
        return None
    try:
        return int(ctx["remaining"])
    except (TypeError, ValueError):
        return None

LANE_COST = {
    "planner": 1,
    "synth": 1,
    "router": 1,
    "tools": 4,
    "tools_fallback": 4,
}

TOOLS_SPECIALISTS = frozenset(
    {"flights", "hotels", "payment", "research", "travel_search", "train", "bus"}
)


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


def free_daily_credits() -> int:
    return _env_int("VERO_FREE_DAILY_CREDITS", 25)


def plus_daily_credits() -> int:
    """Legacy alias — prepaid packs replaced Plus daily pools."""
    return free_daily_credits()


def allowance_for_plan(plan: str | None) -> int:
    # Daily free pool is the same for everyone; purchased credits live in the wallet.
    return free_daily_credits()


def cost_for_lane(lane: str | None) -> int:
    return LANE_COST.get(str(lane or "planner").strip().lower(), 1)


def lane_from_specialist(specialist: str | None, *, has_live_cards: bool = False) -> str:
    spec = str(specialist or "").strip().lower()
    if has_live_cards or spec in TOOLS_SPECIALISTS:
        return "tools"
    return "planner"


def utc_day() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def reset_at_iso() -> str:
    now = datetime.now(timezone.utc)
    nxt = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    from datetime import timedelta

    nxt = nxt + timedelta(days=1)
    return nxt.isoformat().replace("+00:00", "Z")


def subject_key(
    *,
    user_id: str | None = None,
    device_id: str | None = None,
    thread_id: str | None = None,
) -> str:
    uid = str(user_id or "").strip()
    if uid:
        return f"user:{uid[:80]}"
    did = str(device_id or "").strip()
    if did:
        return f"device:{did[:80]}"
    tid = str(thread_id or "").strip() or "anon"
    return f"thread:{tid[:80]}"


def invalidate_plan_cache(user_id: str | None = None) -> None:
    with _lock:
        if user_id:
            _plan_cache.pop(str(user_id).strip(), None)
        else:
            _plan_cache.clear()


def plan_for_user(user_id: str | None) -> str:
    uid = str(user_id or "").strip()
    if not uid:
        return "free"
    now = time.monotonic()
    with _lock:
        hit = _plan_cache.get(uid)
        if hit and hit[0] > now:
            return hit[1]
    plan = "free"
    try:
        from supervisor.billing import snapshot_for_user

        snap = snapshot_for_user(uid)
        plan = "plus" if str(snap.get("plan") or "").lower() == "plus" else "free"
    except Exception:
        plan = "free"
    with _lock:
        _plan_cache[uid] = (now + _PLAN_TTL_S, plan)
    return plan


def catalog_copy() -> dict[str, Any]:
    free_n = free_daily_credits()
    return {
        "veroFree": True,
        "model": "credit_packs",
        "reset": "utc_midnight",
        "freeDailyCredits": free_n,
        "costs": dict(LANE_COST),
        "note": "Free daily credits + prepaid packs (no monthly plan).",
    }


def _db_get(subject: str, day: str) -> tuple[int, int] | None:
    try:
        from supervisor.db import configured, connection

        if not configured():
            return None
        with connection() as conn:
            row = conn.execute(
                """
                SELECT used, allowance FROM vero_credits
                WHERE subject = %s AND day = %s
                """,
                (subject, day),
            ).fetchone()
        if not row:
            return None
        return int(row[0] or 0), int(row[1] or 0)
    except Exception:
        log.debug("vero_credits db get failed", exc_info=True)
        return None


def _db_set(subject: str, day: str, used: int, allowance: int) -> None:
    try:
        from supervisor.db import configured, connection

        if not configured():
            return
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO vero_credits (subject, day, used, allowance, updated_at)
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (subject, day)
                DO UPDATE SET used = EXCLUDED.used,
                              allowance = EXCLUDED.allowance,
                              updated_at = now()
                """,
                (subject, day, used, allowance),
            )
            conn.commit()
    except Exception:
        log.debug("vero_credits db set failed", exc_info=True)


def _used(subject: str, day: str, allowance: int) -> int:
    db = _db_get(subject, day)
    if db is not None:
        used, stored_allow = db
        with _lock:
            _mem[(subject, day)] = used
        if stored_allow != allowance:
            _db_set(subject, day, used, allowance)
        return max(0, used)
    with _lock:
        return max(0, int(_mem.get((subject, day), 0)))


def snapshot(subject: str, *, plan: str | None = None) -> dict[str, Any]:
    day = utc_day()
    allow = allowance_for_plan(plan)
    used = _used(subject, day, allow)
    daily_remaining = max(0, allow - used)
    try:
        from supervisor.credit_packs import wallet_balance

        wallet = wallet_balance(subject)
    except Exception:
        wallet = 0
    remaining = daily_remaining + wallet
    return {
        "ok": True,
        "veroFree": True,
        "model": "credit_packs",
        "plan": "credits",
        "subject": subject,
        "day": day,
        "used": used,
        "allowance": allow,
        "dailyRemaining": daily_remaining,
        "walletBalance": wallet,
        "remaining": remaining,
        "resetAt": reset_at_iso(),
        "costs": dict(LANE_COST),
        "low": remaining > 0 and remaining < 4,
        "exhausted": remaining < 1,
    }


def peek(subject: str, *, plan: str | None = None) -> dict[str, Any]:
    return snapshot(subject, plan=plan)


def consume(
    subject: str,
    *,
    lane: str = "planner",
    plan: str | None = None,
) -> dict[str, Any]:
    cost = cost_for_lane(lane)
    day = utc_day()
    allow = allowance_for_plan(plan)
    taken_daily = 0
    taken_wallet = 0
    with _lock:
        used = int(_mem.get((subject, day), 0))
        db = _db_get(subject, day)
        if db is not None:
            used = int(db[0] or 0)
        daily_remaining = max(0, allow - used)
        taken_daily = min(cost, daily_remaining)
        used = used + taken_daily
        _mem[(subject, day)] = used
    _db_set(subject, day, used, allow)
    need = cost - taken_daily
    if need > 0:
        try:
            from supervisor.credit_packs import wallet_debit

            taken_wallet, _ = wallet_debit(subject, need)
        except Exception:
            taken_wallet = 0
    snap = snapshot(subject, plan=plan)
    snap["spent"] = taken_daily + taken_wallet
    snap["spentDaily"] = taken_daily
    snap["spentWallet"] = taken_wallet
    snap["lane"] = str(lane or "planner")
    log.info(
        "vero_credit subject=%s lane=%s spent=%s daily=%s wallet=%s remaining=%s",
        subject[:24],
        lane,
        snap["spent"],
        taken_daily,
        taken_wallet,
        snap["remaining"],
    )
    return snap


def exhausted_reply(*, plan: str | None = None, reset_at: str | None = None) -> str:
    when = reset_at or reset_at_iso()
    try:
        hour = datetime.fromisoformat(when.replace("Z", "+00:00")).strftime("%H:%M UTC")
    except ValueError:
        hour = "midnight UTC"
    return (
        f"You’re out of Vero credits. Free credits refresh at {hour}, "
        "or buy a pack anytime — they never expire. "
        "Search and book on Itinero still work."
    )


def reset_for_tests() -> None:
    with _lock:
        _mem.clear()
        _plan_cache.clear()
    try:
        from supervisor.credit_packs import reset_wallet_for_tests

        reset_wallet_for_tests()
    except Exception:
        pass
    end_turn()
