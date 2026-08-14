"""Vero credit packs — prepaid wallet; Stripe Checkout may use a monthly card.

Unit economics (CFO target: 20–30% gross margin on LLM spend)

Lane costs (conservative 2026):
  DeepSeek chat/plan ≈ $0.0006 / turn → 1 credit
  OpenAI tools      ≈ $0.006  / turn → 4 credits
  Blended (80/20 turns) ≈ $0.0019 / turn → 1.6 credits
  → LLM cost / credit ≈ $0.0012

Fully loaded (LLM + Stripe ~3% + infra buffer) ≈ $0.0015 / credit.
Sell target at 25% margin: $0.0015 / 0.75 ≈ $0.0020 / credit (~₹0.17 at 83 INR/USD).

Pack list prices sit in the ₹0.17–₹0.24 / credit band (volume discounts on larger packs).
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any

log = logging.getLogger("itinero.billing.credit_packs")

# Loaded cost floor used for margin checks (USD per credit).
COST_PER_CREDIT_USD = float(os.getenv("VERO_COST_PER_CREDIT_USD") or "0.0015")
TARGET_MARGIN_MIN = 0.20
TARGET_MARGIN_MAX = 0.30
INR_PER_USD = float(os.getenv("VERO_INR_PER_USD") or "83")


def billing_currency(currency: str | None) -> str:
    """INR stays INR. Every other display currency checks out in USD."""
    return "INR" if str(currency or "INR").strip().upper() == "INR" else "USD"


def _packs_raw() -> list[dict[str, Any]]:
    """Canonical packs: India (INR) stays cheap; USD is a larger company ladder."""
    return [
        {
            "id": "starter",
            "name": "Starter",
            "credits": 200,
            "badge": None,
            "highlighted": False,
            "blurb": "≈ 200 chats or 50 live searches via Vero",
            # Stripe Checkout rejects INR that converts to < $0.50 (₹29 ≈ $0.30).
            "inr_minor": 4900,  # ₹49
            "markets": ("INR",),
            "cta": "Buy Starter",
        },
        {
            "id": "traveler",
            "name": "Traveler",
            "credits": 500,
            "usd_credits": 2000,
            "badge": "Most popular",
            "highlighted": True,
            "blurb": "≈ 500 chats or 125 live searches — best everyday top-up",
            "inr_minor": 9900,  # ₹99
            "usd_minor": 1299,  # $12.99
            "cta": "Buy Traveler",
        },
        {
            "id": "explorer",
            "name": "Explorer",
            "credits": 2000,
            "usd_credits": 8000,
            "badge": "Best value",
            "highlighted": False,
            "blurb": "≈ 2000 chats or 500 live searches — trips & research weeks",
            "inr_minor": 34900,  # ₹349
            "usd_minor": 3999,  # $39.99
            "cta": "Buy Explorer",
        },
        {
            "id": "pro",
            "name": "Pro",
            "credits": 6000,
            "usd_credits": 25000,
            "badge": None,
            "highlighted": False,
            "blurb": "≈ 6000 chats or 1500 live searches — teams & power users",
            "inr_minor": 99900,  # ₹999
            "usd_minor": 9900,  # $99
            "cta": "Buy Pro",
        },
    ]


PACK_ORDER = ("starter", "traveler", "explorer", "pro")


def pack_by_id(pack_id: str) -> dict[str, Any] | None:
    pid = str(pack_id or "").strip().lower()
    for p in _packs_raw():
        if p["id"] == pid:
            return dict(p)
    return None


def pack_rank(pack_id: str | None) -> int:
    """1 = Starter … 4 = Pro. Unknown / empty = 0 (no active pack)."""
    pid = str(pack_id or "").strip().lower()
    try:
        return PACK_ORDER.index(pid) + 1
    except ValueError:
        return 0


def pack_available_in(pack: dict[str, Any], currency: str | None) -> bool:
    markets = pack.get("markets")
    if not markets:
        return True
    return billing_currency(currency) in markets


def pack_credits_for(pack: dict[str, Any], currency: str | None) -> int:
    cur = billing_currency(currency)
    if cur != "INR":
        return int(pack.get("usd_credits") or pack.get("credits") or 0)
    return int(pack.get("credits") or 0)


def _format_money(major: float, currency: str) -> str:
    cur = (currency or "INR").upper()
    if cur == "INR":
        return f"₹{int(round(major))}"
    return f"${major:.2f}"


def _margin(credits: int, price_usd: float) -> float | None:
    if credits <= 0 or price_usd <= 0:
        return None
    cost = credits * COST_PER_CREDIT_USD
    return max(0.0, 1.0 - (cost / price_usd))


def enrich_pack(pack: dict[str, Any], currency: str = "INR") -> dict[str, Any]:
    cur = billing_currency(currency)
    minor = int(pack["inr_minor"] if cur == "INR" else pack["usd_minor"])
    major = minor / 100.0
    price_usd = (minor / 100.0) if cur == "USD" else (minor / 100.0) / INR_PER_USD
    credits = pack_credits_for(pack, cur)
    per = major / credits if credits else 0
    margin = _margin(credits, price_usd)
    searches = max(1, credits // 4)
    if cur == "USD":
        highlighted = pack["id"] == "explorer"
        badge = "Most popular" if pack["id"] == "explorer" else None
        blurb = (
            f"≈ {credits} chats or {searches} live searches — international pack"
        )
        if pack["id"] == "explorer":
            blurb = f"≈ {credits} chats or {searches} live searches — best for teams"
        elif pack["id"] == "pro":
            blurb = f"≈ {credits} chats or {searches} live searches — companies & power users"
    else:
        highlighted = bool(pack.get("highlighted"))
        badge = pack.get("badge")
        blurb = pack.get("blurb") or f"≈ {credits} chats or {searches} live searches via Vero"
    return {
        "id": pack["id"],
        "name": pack["name"],
        "credits": credits,
        "badge": badge,
        "highlighted": highlighted,
        "blurb": blurb,
        "cta": pack.get("cta") or f"Buy {pack['name']}",
        "interval": None,
        "plan": "credits",
        "price": {
            "amount": major,
            "currency": cur,
            "formatted": _format_money(major, cur),
            "minor": minor,
        },
        "perCredit": {
            "amount": round(per, 4),
            "currency": cur,
            "formatted": (
                f"₹{per:.2f}/credit" if cur == "INR" else f"${per:.4f}/credit"
            ),
        },
        "economics": {
            "costPerCreditUsd": COST_PER_CREDIT_USD,
            "estMargin": round(margin, 3) if margin is not None else None,
            "targetMargin": f"{int(TARGET_MARGIN_MIN*100)}–{int(TARGET_MARGIN_MAX*100)}%",
            "withinTarget": bool(
                margin is not None and TARGET_MARGIN_MIN <= margin <= (TARGET_MARGIN_MAX + 0.12)
            ),
        },
        "features": [
            f"{credits} Vero credits (never expire)",
            "Chat / plan = 1 credit · live search via Vero = 4",
            "Same models as free — just more runway",
            "Search & book on the site stay free",
        ],
    }


def catalog(*, currency: str = "INR") -> dict[str, Any]:
    cur = billing_currency(currency)
    packs = [enrich_pack(p, cur) for p in _packs_raw() if pack_available_in(p, cur)]
    for p in packs:
        p.pop("economics", None)
    try:
        from supervisor.credits import free_daily_credits, LANE_COST

        free_n = free_daily_credits()
        costs = dict(LANE_COST)
    except Exception:
        free_n = 25
        costs = {"planner": 1, "tools": 4}
    if cur == "USD":
        copy = (
            f"Everyone gets {free_n} free credits each UTC day. "
            "International packs start larger — more credits for teams, not the India Starter price. "
            "Search and book never need credits."
        )
    else:
        copy = (
            f"Everyone gets {free_n} free credits each UTC day. "
            "Need more? Pick a pack. Search and book never need credits."
        )
    return {
        "ok": True,
        "veroFree": True,
        "model": "credit_packs",
        "headline": "Buy Vero credits",
        "copy": copy,
        "market": "international" if cur == "USD" else "india",
        "defaultInterval": "month",
        "creditExplainer": {
            "freeDaily": free_n,
            "chatCost": int(costs.get("planner", 1)),
            "liveSearchCost": int(costs.get("tools", 4)),
            "rule": (
                "Daily free credits spend first, then your wallet. "
                "Empty → wait for UTC reset or get more credits."
            ),
        },
        "plans": packs,  # keep key name for existing UI
        "packs": packs,
        "billingConfigured": True,  # filled by billing.catalog wrapper
        "stripeMode": "unset",
    }


# ── Wallet persistence ────────────────────────────────────────────────


def _db_wallet_get(subject: str) -> int | None:
    try:
        from supervisor.db import configured, connection

        if not configured():
            return None
        with connection() as conn:
            row = conn.execute(
                "SELECT balance FROM vero_credit_wallet WHERE subject = %s",
                (subject,),
            ).fetchone()
        if not row:
            return 0
        return max(0, int(row[0] or 0))
    except Exception:
        log.debug("wallet get failed", exc_info=True)
        return None


def _db_wallet_add(subject: str, delta: int) -> int:
    """Atomically add (or subtract) credits; returns new balance."""
    try:
        from supervisor.db import configured, connection

        if not configured():
            return -1
        d = int(delta)
        with connection() as conn:
            conn.execute(
                """
                INSERT INTO vero_credit_wallet (subject, balance, updated_at)
                VALUES (%s, GREATEST(0, %s), now())
                ON CONFLICT (subject) DO UPDATE
                SET balance = GREATEST(0, vero_credit_wallet.balance + %s),
                    updated_at = now()
                """,
                (subject, d, d),
            )
            row = conn.execute(
                "SELECT balance FROM vero_credit_wallet WHERE subject = %s",
                (subject,),
            ).fetchone()
            conn.commit()
        return max(0, int(row[0] or 0)) if row else 0
    except Exception:
        log.exception("wallet add failed")
        return -1


_mem_wallet: dict[str, int] = {}


def wallet_balance(subject: str) -> int:
    sub = str(subject or "").strip() or "anon"
    db = _db_wallet_get(sub)
    if db is not None:
        _mem_wallet[sub] = db
        return db
    return max(0, int(_mem_wallet.get(sub, 0)))


def wallet_credit(subject: str, amount: int) -> int:
    sub = str(subject or "").strip() or "anon"
    n = max(0, int(amount))
    if n <= 0:
        return wallet_balance(sub)
    db = _db_wallet_add(sub, n)
    if db >= 0:
        _mem_wallet[sub] = db
        return db
    _mem_wallet[sub] = wallet_balance(sub) + n
    return _mem_wallet[sub]


def wallet_debit(subject: str, amount: int) -> tuple[int, int]:
    """Debit up to `amount`. Returns (taken, remaining_balance)."""
    sub = str(subject or "").strip() or "anon"
    need = max(0, int(amount))
    bal = wallet_balance(sub)
    take = min(need, bal)
    if take <= 0:
        return 0, bal
    db = _db_wallet_add(sub, -take)
    if db >= 0:
        _mem_wallet[sub] = db
        return take, db
    _mem_wallet[sub] = bal - take
    return take, _mem_wallet[sub]


def record_purchase(
    *,
    user_id: str,
    subject: str,
    pack_id: str,
    credits: int,
    amount_minor: int,
    currency: str,
    stripe_session_id: str | None,
    stripe_payment_intent: str | None = None,
) -> dict[str, Any]:
    pid = str(uuid.uuid4())
    try:
        from supervisor.db import configured, connection

        if configured():
            with connection() as conn:
                # Idempotent on stripe session
                if stripe_session_id:
                    exists = conn.execute(
                        "SELECT id, credits FROM vero_credit_purchases WHERE stripe_session_id = %s",
                        (stripe_session_id,),
                    ).fetchone()
                    if exists:
                        return {
                            "ok": True,
                            "id": exists[0],
                            "credits": int(exists[1] or 0),
                            "duplicate": True,
                            "balance": wallet_balance(subject),
                        }
                conn.execute(
                    """
                    INSERT INTO vero_credit_purchases (
                      id, user_id, subject, pack_id, credits, amount_minor, currency,
                      stripe_session_id, stripe_payment_intent, status, created_at
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'paid', now())
                    """,
                    (
                        pid,
                        user_id,
                        subject,
                        pack_id,
                        int(credits),
                        int(amount_minor),
                        currency.upper(),
                        stripe_session_id,
                        stripe_payment_intent,
                    ),
                )
                conn.commit()
    except Exception:
        log.exception("record_purchase failed")
    bal = wallet_credit(subject, credits)
    return {
        "ok": True,
        "id": pid,
        "credits": int(credits),
        "duplicate": False,
        "balance": bal,
        "packId": pack_id,
    }


def reset_wallet_for_tests() -> None:
    _mem_wallet.clear()
