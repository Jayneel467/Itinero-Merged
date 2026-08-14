"""Itinero billing — Vero credit packs + monthly auto-renew (saved card).

Product rule: Vero is always free with a daily credit pool. Extra usage is
Stripe Checkout: monthly subscription (card on file, auto-charge) or a
one-time pack. Legacy Plus perk rows remain for historical data.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from supervisor.db import configured, connection
from supervisor.payment_guards import is_production


def _stripe_secret() -> str:
    return (
        (os.getenv("STRIPE_SECRET_KEY") or "")
        or (os.getenv("STRIPE_SECRET") or "")
        or (os.getenv("ITINERO_STRIPE_SECRET_KEY") or "")
    ).strip()


def stripe_live_allowed() -> bool:
    """Live (sk_live_) keys stay off until you explicitly set STRIPE_LIVE=1."""
    return (os.getenv("STRIPE_LIVE") or "").strip().lower() in {"1", "true", "yes"}


def stripe_key_mode() -> str:
    secret = _stripe_secret()
    if secret.startswith("sk_test_"):
        return "test"
    if secret.startswith("sk_live_"):
        return "live"
    if secret:
        return "unknown"
    return "unset"


def stripe_ready() -> dict[str, Any]:
    """Plus checkout is on only with sk_test_ (or sk_live_ after STRIPE_LIVE=1)."""
    mode = stripe_key_mode()
    if mode == "unset":
        return {
            "ok": False,
            "error": "stripe_not_configured",
            "mode": mode,
            "message": "Set STRIPE_SECRET_KEY=sk_test_… to take Plus payments.",
        }
    if mode == "live" and not stripe_live_allowed():
        return {
            "ok": False,
            "error": "stripe_live_blocked",
            "mode": mode,
            "message": "Live Stripe keys are blocked. Keep using sk_test_ until STRIPE_LIVE=1.",
        }
    if mode not in {"test", "live"}:
        return {
            "ok": False,
            "error": "stripe_key_invalid",
            "mode": mode,
            "message": "STRIPE_SECRET_KEY must start with sk_test_ (or sk_live_ after STRIPE_LIVE=1).",
        }
    return {"ok": True, "mode": mode}

FREE_TRAVELLERS = 2
PLUS_TRAVELLERS = 8
FREE_WATCHES = 1
PLUS_WATCHES = 8

PLUS_ACTIVE = frozenset({"active", "trialing", "past_due"})

def _credit_feature_lines() -> tuple[str, str]:
    try:
        from supervisor.credits import free_daily_credits

        free_n = free_daily_credits()
    except Exception:
        free_n = 25
    return (
        f"{free_n} Vero credits / day (refresh UTC midnight)",
        "Buy a credit pack anytime — extra credits never expire",
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _app_base() -> str:
    """SPA lives under /itinero (Vite base + React Router basename)."""
    raw = (os.getenv("ITINERO_APP_BASE") or "/itinero").strip() or "/itinero"
    if not raw.startswith("/"):
        raw = f"/{raw}"
    return raw.rstrip("/") or "/itinero"


def _site_url() -> str:
    origin = (
        os.getenv("PUBLIC_SITE_URL")
        or os.getenv("ITINERO_PUBLIC_SITE_URL")
        or "http://127.0.0.1:5173"
    ).rstrip("/")
    base = _app_base()
    if origin.endswith(base):
        return origin
    return f"{origin}{base}"


def _frontend_url(path: str) -> str:
    rel = str(path or "").lstrip("/")
    return f"{_site_url()}/{rel}"


def _webhook_secret() -> str:
    return (os.getenv("STRIPE_WEBHOOK_SECRET") or os.getenv("ITINERO_STRIPE_WEBHOOK_SECRET") or "").strip()


def _price_id(interval: str, currency: str = "INR") -> str:
    cur = (currency or "INR").strip().upper()
    if interval == "year":
        if cur == "USD":
            return (
                (os.getenv("STRIPE_PRICE_PLUS_ANNUAL_USD") or "")
                or (os.getenv("STRIPE_PRICE_PLUS_ANNUAL") or "")
            ).strip()
        return (os.getenv("STRIPE_PRICE_PLUS_ANNUAL") or "").strip()
    if cur == "USD":
        return (
            (os.getenv("STRIPE_PRICE_PLUS_MONTHLY_USD") or "")
            or (os.getenv("STRIPE_PRICE_PLUS_MONTHLY") or "")
        ).strip()
    return (os.getenv("STRIPE_PRICE_PLUS_MONTHLY") or "").strip()


def _amount_for(interval: str, currency: str) -> tuple[int, str]:
    """Stripe minor units + currency code."""
    cur = (currency or "INR").strip().upper()
    if cur not in {"INR", "USD"}:
        cur = "INR"
    if interval == "year":
        if cur == "USD":
            return 4900, "usd"
        return 249900, "inr"
    if cur == "USD":
        return 499, "usd"
    return 29900, "inr"


def _format_money(major: float, currency: str) -> str:
    cur = (currency or "INR").strip().upper()
    if cur == "INR":
        return f"₹{int(round(major))}"
    return f"${major:.2f}"


def _display_price(interval: str, currency: str) -> dict[str, Any]:
    units, cur = _amount_for(interval, currency)
    major = units if cur.upper() in {"JPY"} else units / 100
    return {
        "amount": major,
        "currency": cur.upper(),
        "formatted": _format_money(major, cur),
    }


def _annual_value(currency: str) -> dict[str, Any]:
    """CFO math: annual vs 12× monthly — what the traveler actually saves."""
    monthly = _display_price("month", currency)
    annual = _display_price("year", currency)
    year_if_monthly = float(monthly["amount"]) * 12
    save = max(0.0, year_if_monthly - float(annual["amount"]))
    per_month = float(annual["amount"]) / 12.0
    months_free = (save / float(monthly["amount"])) if monthly["amount"] else 0.0
    return {
        "price": annual,
        "effectiveMonthly": {
            "amount": round(per_month, 2),
            "currency": annual["currency"],
            "formatted": _format_money(per_month, annual["currency"]),
        },
        "vsMonthlyYear": {
            "amount": year_if_monthly,
            "currency": annual["currency"],
            "formatted": _format_money(year_if_monthly, annual["currency"]),
        },
        "savings": {
            "amount": round(save, 2),
            "currency": annual["currency"],
            "formatted": _format_money(save, annual["currency"]),
            "monthsFreeApprox": round(months_free, 1),
        },
        "badge": "Best value",
    }


def _credit_explainer() -> dict[str, Any]:
    try:
        from supervisor.credits import LANE_COST, free_daily_credits

        free_n = free_daily_credits()
        costs = dict(LANE_COST)
    except Exception:
        free_n = 25
        costs = {"planner": 1, "synth": 1, "router": 1, "tools": 4, "tools_fallback": 4}
    tools = max(1, int(costs.get("tools", 4)))
    return {
        "freeDaily": free_n,
        "chatCost": int(costs.get("planner", 1)),
        "liveSearchCost": tools,
        "freePlain": (
            f"{free_n} credits/day ≈ {free_n} chat turns or "
            f"{max(1, free_n // tools)} live searches via Vero"
        ),
        "rule": (
            "Search & book on the site never spend Vero credits. "
            "Empty pool → wait for UTC reset or buy a credit pack."
        ),
    }


def catalog(*, currency: str = "INR") -> dict[str, Any]:
    from supervisor.credit_packs import billing_currency, catalog as packs_catalog

    cat = packs_catalog(currency=currency)
    bill_cur = billing_currency(currency)
    ready = stripe_ready()
    cat["billingConfigured"] = bool(ready.get("ok"))
    cat["stripeMode"] = stripe_key_mode()
    cat["stripeLiveAllowed"] = stripe_live_allowed()
    # Free tier card for the pricing grid (not a Stripe product)
    try:
        from supervisor.credits import free_daily_credits, LANE_COST

        free_n = free_daily_credits()
        tools = int(LANE_COST.get("tools", 4))
    except Exception:
        free_n, tools = 25, 4
    free_card = {
        "id": "free",
        "plan": "free",
        "name": "Free daily",
        "interval": None,
        "credits": free_n,
        "badge": None,
        "highlighted": False,
        "blurb": (
            f"{free_n} credits every UTC day ≈ {free_n} chats or "
            f"{max(1, free_n // tools)} live searches"
        ),
        "price": {
            "amount": 0,
            "currency": bill_cur,
            "formatted": "₹0" if bill_cur == "INR" else "$0",
        },
        "features": [
            "Vero companion forever free",
            f"{free_n} credits / day (refresh UTC midnight)",
            "Search flights, stays, packages, trains",
            "Book pay-as-you-go — no credits needed",
        ],
        "cta": "Talk to Vero",
    }
    packs = list(cat.get("packs") or cat.get("plans") or [])
    cat["plans"] = [free_card, *packs]
    cat["packs"] = packs
    return cat


def entitlements_for_plan(plan: str) -> dict[str, Any]:
    # Credit packs replaced Plus. Feature limits are open; AI usage is metered.
    try:
        from supervisor.credits import allowance_for_plan, LANE_COST

        daily = allowance_for_plan("free")
        costs = dict(LANE_COST)
    except Exception:
        daily = 25
        costs = {"planner": 1, "synth": 1, "router": 1, "tools": 4, "tools_fallback": 4}
    return {
        "plan": "credits",
        "veroFree": True,
        "dailyCredits": daily,
        "creditCosts": costs,
        "loyaltyMultiplier": 1.0,
        "savedTravellersLimit": PLUS_TRAVELLERS,
        "priceWatchLimit": PLUS_WATCHES,
        "priceAlerts": True,
        "memberDeals": False,
        "prioritySupport": False,
        "bookingFeeWaived": False,
    }


def _plan_features(plan: str) -> list[str]:
    free_line, plus_line = _credit_feature_lines()
    if str(plan or "").lower() == "plus":
        return [
            "Everything in Free, including Vero",
            plus_line,
            "2× Itinero Rewards on eligible bookings",
            f"Save up to {PLUS_TRAVELLERS} travellers",
            f"Watch up to {PLUS_WATCHES} flight routes",
            "Member deals & priority support",
            "Vero stays free — credits stay in your wallet",
        ]
    return [
        "Vero companion — chat, plan, visa & gear intel (forever free)",
        free_line,
        "Search flights, stays, packages, trains, transits",
        "Book pay-as-you-go",
        f"Save {FREE_TRAVELLERS} travellers",
        f"{FREE_WATCHES} price-watch route",
        "Standard Itinero Rewards",
    ]


def _row_to_sub(row) -> dict[str, Any] | None:
    if not row:
        return None
    period_end = row[8]
    return {
        "id": row[0],
        "userId": row[1],
        "plan": row[2] or "free",
        "interval": row[3],
        "status": row[4] or "inactive",
        "stripeCustomerId": row[5],
        "stripeSubscriptionId": row[6],
        "stripePriceId": row[7],
        "currentPeriodEnd": period_end.isoformat() if period_end else None,
        "cancelAtPeriodEnd": bool(row[9]),
    }


def get_subscription(user_id: str | None) -> dict[str, Any] | None:
    uid = (user_id or "").strip()
    if not uid or not configured():
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, plan, interval, status, stripe_customer_id,
                   stripe_subscription_id, stripe_price_id, current_period_end,
                   cancel_at_period_end
            FROM subscriptions
            WHERE user_id = %s
            """,
            (uid,),
        ).fetchone()
    return _row_to_sub(row)


def _is_plus(sub: dict[str, Any] | None) -> bool:
    if not sub:
        return False
    if str(sub.get("plan") or "").lower() != "plus":
        return False
    status = str(sub.get("status") or "").lower()
    if status not in PLUS_ACTIVE:
        return False
    end = sub.get("currentPeriodEnd")
    if end:
        try:
            dt = datetime.fromisoformat(str(end).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt < _now() and status != "past_due":
                return False
        except ValueError:
            pass
    return True


def snapshot_for_user(user_id: str | None) -> dict[str, Any]:
    from supervisor.credit_packs import pack_by_id

    sub = get_subscription(user_id)
    plus = _is_plus(sub)
    ent = entitlements_for_plan("plus" if plus else "free")
    ready = stripe_ready()
    active_pack = _active_pack_id(sub)
    packed = pack_by_id(active_pack) if active_pack else None
    return {
        **ent,
        "stripeConfigured": bool(ready.get("ok")),
        "stripeMode": stripe_key_mode(),
        "status": (sub or {}).get("status") or "inactive",
        "interval": (sub or {}).get("interval"),
        "currentPeriodEnd": (sub or {}).get("currentPeriodEnd"),
        "cancelAtPeriodEnd": bool((sub or {}).get("cancelAtPeriodEnd")),
        "hasAutocard": str((sub or {}).get("status") or "").lower()
        in {"active", "trialing", "past_due"},
        "activePackId": active_pack,
        "activePackName": (packed or {}).get("name"),
    }


def loyalty_multiplier_for(user_id: str | None) -> float:
    snap = snapshot_for_user(user_id)
    try:
        return float(snap.get("loyaltyMultiplier") or 1.0)
    except (TypeError, ValueError):
        return 1.0


def _upsert_subscription(
    *,
    user_id: str,
    plan: str,
    interval: str | None,
    status: str,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
    stripe_price_id: str | None = None,
    current_period_end: datetime | None = None,
    cancel_at_period_end: bool = False,
    payload: dict[str, Any] | None = None,
) -> None:
    if not configured() or not user_id:
        return
    try:
        from supervisor.credits import invalidate_plan_cache

        invalidate_plan_cache(user_id)
    except Exception:
        pass
    sid = f"sub_{uuid.uuid4().hex[:24]}"
    with connection() as conn:
        existing = conn.execute(
            "SELECT id FROM subscriptions WHERE user_id = %s",
            (user_id,),
        ).fetchone()
        body = json.dumps(payload or {}, default=str)
        if existing:
            conn.execute(
                """
                UPDATE subscriptions
                SET plan = %s, interval = %s, status = %s,
                    stripe_customer_id = COALESCE(%s, stripe_customer_id),
                    stripe_subscription_id = COALESCE(%s, stripe_subscription_id),
                    stripe_price_id = COALESCE(%s, stripe_price_id),
                    current_period_end = %s,
                    cancel_at_period_end = %s,
                    payload = %s::jsonb,
                    updated_at = now()
                WHERE user_id = %s
                """,
                (
                    plan,
                    interval,
                    status,
                    stripe_customer_id,
                    stripe_subscription_id,
                    stripe_price_id,
                    current_period_end,
                    cancel_at_period_end,
                    body,
                    user_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO subscriptions (
                  id, user_id, plan, interval, status, stripe_customer_id,
                  stripe_subscription_id, stripe_price_id, current_period_end,
                  cancel_at_period_end, payload
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                """,
                (
                    sid,
                    user_id,
                    plan,
                    interval,
                    status,
                    stripe_customer_id,
                    stripe_subscription_id,
                    stripe_price_id,
                    current_period_end,
                    cancel_at_period_end,
                    body,
                ),
            )
        conn.commit()


def _ts(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    try:
        n = int(value)
        return datetime.fromtimestamp(n, tz=timezone.utc)
    except (TypeError, ValueError, OSError):
        return None


def _stripe_post(path: str, data: dict[str, str]) -> dict[str, Any]:
    ready = stripe_ready()
    if not ready.get("ok"):
        return ready
    secret = _stripe_secret()
    try:
        with httpx.Client(timeout=25.0) as client:
            r = client.post(
                f"https://api.stripe.com/v1/{path.lstrip('/')}",
                data=data,
                auth=(secret, ""),
                headers={"Accept": "application/json"},
            )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            return {
                "ok": False,
                "error": "stripe_failed",
                "message": str(err.get("message") or f"Stripe error ({r.status_code})."),
            }
        return {"ok": True, **body}
    except Exception as exc:
        return {"ok": False, "error": "stripe_error", "message": f"Stripe error ({type(exc).__name__})."}


def _stripe_get(path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    ready = stripe_ready()
    if not ready.get("ok"):
        return ready
    secret = _stripe_secret()
    try:
        with httpx.Client(timeout=25.0) as client:
            r = client.get(
                f"https://api.stripe.com/v1/{path.lstrip('/')}",
                params=params or {},
                auth=(secret, ""),
                headers={"Accept": "application/json"},
            )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            return {
                "ok": False,
                "error": "stripe_failed",
                "message": str(err.get("message") or f"Stripe error ({r.status_code})."),
            }
        return {"ok": True, **body}
    except Exception as exc:
        return {"ok": False, "error": "stripe_error", "message": f"Stripe error ({type(exc).__name__})."}


def _stripe_delete(path: str) -> dict[str, Any]:
    ready = stripe_ready()
    if not ready.get("ok"):
        return ready
    secret = _stripe_secret()
    try:
        with httpx.Client(timeout=25.0) as client:
            r = client.delete(
                f"https://api.stripe.com/v1/{path.lstrip('/')}",
                auth=(secret, ""),
                headers={"Accept": "application/json"},
            )
        body = r.json() if r.content else {}
        if r.status_code >= 400:
            err = body.get("error") if isinstance(body.get("error"), dict) else {}
            return {
                "ok": False,
                "error": "stripe_failed",
                "message": str(err.get("message") or f"Stripe error ({r.status_code})."),
            }
        return {"ok": True, **body}
    except Exception as exc:
        return {"ok": False, "error": "stripe_error", "message": f"Stripe error ({type(exc).__name__})."}


def _active_pack_id(sub: dict[str, Any] | None) -> str | None:
    from supervisor.credit_packs import pack_by_id

    if not sub:
        return None
    status = str(sub.get("status") or "").lower()
    if status not in PLUS_ACTIVE:
        return None
    pid = str(sub.get("plan") or "").strip().lower()
    return pid if pack_by_id(pid) else None


def _list_stripe_subscriptions(customer_id: str) -> list[dict[str, Any]]:
    cid = str(customer_id or "").strip()
    if not cid.startswith("cus_"):
        return []
    out = _stripe_get("subscriptions", {"customer": cid, "status": "active", "limit": "20"})
    if not out.get("ok"):
        return []
    data = out.get("data")
    return [row for row in data if isinstance(row, dict)] if isinstance(data, list) else []


def _prune_duplicate_subscriptions(*, customer_id: str, keep_id: str | None) -> str | None:
    """Keep one active Stripe sub; cancel extras immediately so they aren't billed again."""
    rows = _list_stripe_subscriptions(customer_id)
    if not rows:
        return keep_id if (keep_id or "").startswith("sub_") else None
    keep = (keep_id or "").strip()
    if not keep.startswith("sub_") or not any(_stripe_id(r.get("id"), "sub_") == keep for r in rows):
        keep = _stripe_id(rows[0].get("id"), "sub_")
    for row in rows:
        sid = _stripe_id(row.get("id"), "sub_")
        if sid and sid != keep:
            _stripe_delete(f"subscriptions/{sid}")
    return keep or None


def _pack_gate_message(*, current_id: str, wanted_id: str) -> dict[str, Any]:
    from supervisor.credit_packs import pack_by_id, pack_rank

    current = pack_by_id(current_id) or {"name": current_id}
    wanted = pack_by_id(wanted_id) or {"name": wanted_id}
    if pack_rank(wanted_id) < pack_rank(current_id):
        msg = (
            f"You already have {current.get('name')}. "
            f"{wanted.get('name')} is a smaller pack — stay on {current.get('name')} "
            "or switch to a larger one."
        )
        err = "pack_downgrade"
    else:
        msg = (
            f"You already have {current.get('name')} this cycle. "
            "Pick a larger pack for more credits."
        )
        err = "pack_active"
    return {
        "ok": False,
        "error": err,
        "activePackId": current_id,
        "message": msg,
    }


def _current_pack_from_stripe(customer_id: str, keep_id: str | None) -> str | None:
    from supervisor.credit_packs import pack_by_id

    sid = (keep_id or "").strip()
    if not sid.startswith("sub_"):
        rows = _list_stripe_subscriptions(customer_id)
        sid = _stripe_id((rows[0] if rows else {}).get("id"), "sub_")
    if not sid.startswith("sub_"):
        return None
    live = _stripe_get(f"subscriptions/{sid}")
    if not live.get("ok"):
        return None
    if str(live.get("status") or "").lower() not in PLUS_ACTIVE:
        return None
    meta = live.get("metadata") if isinstance(live.get("metadata"), dict) else {}
    pid = str(meta.get("itinero_pack_id") or "").strip().lower()
    return pid if pack_by_id(pid) else None


def _upgrade_subscription(
    *,
    user_id: str,
    sub: dict[str, Any],
    pack: dict[str, Any],
    currency: str,
) -> dict[str, Any]:
    """Switch the existing Stripe sub to a larger pack and credit the extra wallet credits."""
    from supervisor.credit_packs import enrich_pack, pack_by_id, pack_credits_for, record_purchase
    from supervisor.credits import subject_key

    sid = str(sub.get("stripeSubscriptionId") or "").strip()
    if not sid.startswith("sub_"):
        return {
            "ok": False,
            "error": "no_subscription",
            "message": "You already have a pack this cycle. Pick a larger one, or manage billing.",
        }
    live = _stripe_get(f"subscriptions/{sid}")
    if not live.get("ok"):
        return live
    items = ((live.get("items") or {}).get("data") or []) if isinstance(live.get("items"), dict) else []
    item_id = _stripe_id((items[0] if items else {}).get("id"), "si_")
    if not item_id:
        return {"ok": False, "error": "no_item", "message": "Could not update this pack. Try Manage billing."}
    cur = (currency or "INR").strip().upper()
    if cur not in {"INR", "USD"}:
        cur = "INR"
    enriched = enrich_pack(pack, cur)
    credits = int(enriched["credits"])
    minor = int(enriched["price"]["minor"])
    data = {
        f"items[0][id]": item_id,
        f"items[0][price_data][currency]": cur.lower(),
        f"items[0][price_data][unit_amount]": str(minor),
        f"items[0][price_data][recurring][interval]": "month",
        f"items[0][price_data][product_data][name]": (
            f"Vero {pack['name']} — {credits} credits"
        ),
        "proration_behavior": "always_invoice",
        "payment_behavior": "error_if_incomplete",
        "metadata[itinero_user_id]": user_id,
        "metadata[itinero_pack_id]": pack["id"],
        "metadata[itinero_credits]": str(credits),
        "metadata[itinero_product]": "vero_credits_sub",
        "metadata[itinero_interval]": "month",
        "metadata[itinero_upgrade]": "1",
    }
    out = _stripe_post(f"subscriptions/{sid}", data)
    if not out.get("ok"):
        return out
    old = pack_by_id(str(sub.get("plan") or "")) or {}
    old_credits = pack_credits_for(old, cur) if old.get("id") else 0
    delta = max(0, credits - old_credits)
    _activate_credit_subscription(
        user_id=user_id,
        obj=out,
        extra_payload={
            "itinero_pack_id": pack["id"],
            "itinero_credits": credits,
            "itinero_interval": "month",
        },
    )
    credited = 0
    if delta:
        subject = subject_key(user_id=user_id)
        inv = _stripe_id(out.get("latest_invoice"), "in_") or f"upgrade:{sid}:{pack['id']}"
        rec = record_purchase(
            user_id=user_id,
            subject=subject,
            pack_id=pack["id"],
            credits=delta,
            amount_minor=minor,
            currency=cur,
            stripe_session_id=inv,
            stripe_payment_intent=None,
        )
        credited = int(rec.get("credits") or 0) if rec.get("ok") else 0
    return {
        "ok": True,
        "upgraded": True,
        "packId": pack["id"],
        "credits": credited,
        "activePackId": pack["id"],
        "message": (
            f"Switched to {pack['name']}."
            + (f" {credited} extra credits added to your wallet." if credited else "")
        ),
        "stripeMode": stripe_key_mode(),
    }


def _ensure_customer(*, user_id: str, email: str | None, name: str | None) -> dict[str, Any]:
    sub = get_subscription(user_id) or {}
    cid = (sub.get("stripeCustomerId") or "").strip()
    if cid.startswith("cus_"):
        return {"ok": True, "id": cid}
    data: dict[str, str] = {
        "metadata[itinero_user_id]": user_id,
    }
    if email:
        data["email"] = email.strip()
    if name:
        data["name"] = name.strip()[:80]
    out = _stripe_post("customers", data)
    if not out.get("ok"):
        return out
    new_id = str(out.get("id") or "")
    if new_id:
        _upsert_subscription(
            user_id=user_id,
            plan=sub.get("plan") or "free",
            interval=sub.get("interval"),
            status=sub.get("status") or "inactive",
            stripe_customer_id=new_id,
        )
    return {"ok": True, "id": new_id}


def _wants_subscription(interval: str | None) -> bool:
    raw = (interval or "month").strip().lower()
    if raw in {"once", "one_time", "onetime", "payment", "pack"}:
        return False
    return raw in {"month", "monthly", "year", "annual", "subscription", "sub", ""}


def _stripe_id(value: Any, prefix: str) -> str:
    if isinstance(value, dict):
        value = value.get("id")
    text = str(value or "").strip()
    return text if text.startswith(prefix) else ""


def create_checkout_session(
    *,
    user_id: str,
    email: str | None,
    name: str | None,
    pack_id: str | None = None,
    interval: str | None = None,
    currency: str = "INR",
) -> dict[str, Any]:
    """Stripe Checkout: monthly autocard subscription (default) or one-time pack."""
    from supervisor.credit_packs import billing_currency, enrich_pack, pack_available_in, pack_by_id

    if not user_id:
        return {"ok": False, "error": "unauthorized", "message": "Sign in to buy credits."}
    ready = stripe_ready()
    if not ready.get("ok"):
        return ready
    pid = (pack_id or "").strip().lower()
    if not pid and interval:
        pid = "traveler"
    pack = pack_by_id(pid)
    if not pack:
        return {"ok": False, "error": "bad_pack", "message": "Unknown credit pack."}
    cur = billing_currency(currency)
    if not pack_available_in(pack, cur):
        return {
            "ok": False,
            "error": "pack_market",
            "message": (
                "Starter is priced for India. International packs start at Traveler "
                "with more credits."
            ),
        }
    enriched = enrich_pack(pack, cur)
    credits = int(enriched["credits"])
    cust = _ensure_customer(user_id=user_id, email=email, name=name)
    if not cust.get("ok"):
        return cust
    sub = get_subscription(user_id) or {}
    keep = _prune_duplicate_subscriptions(
        customer_id=str(cust.get("id") or ""),
        keep_id=sub.get("stripeSubscriptionId"),
    )
    current = _active_pack_id(sub) or _current_pack_from_stripe(str(cust.get("id") or ""), keep)
    if current:
        from supervisor.credit_packs import pack_rank

        if pack_rank(pack["id"]) <= pack_rank(current):
            return _pack_gate_message(current_id=current, wanted_id=pack["id"])
        return _upgrade_subscription(
            user_id=user_id,
            sub={
                **sub,
                "plan": current,
                "status": "active",
                "stripeSubscriptionId": keep or sub.get("stripeSubscriptionId"),
            },
            pack=pack,
            currency=cur,
        )
    minor = int(enriched["price"]["minor"])
    stripe_cur = cur.lower()
    subscribe = _wants_subscription(interval)
    rec_interval = "year" if str(interval or "").lower() in {"year", "annual"} else "month"
    data: dict[str, str] = {
        "mode": "subscription" if subscribe else "payment",
        "customer": str(cust["id"]),
        "success_url": _frontend_url("plus?checkout=success&session_id={CHECKOUT_SESSION_ID}"),
        "cancel_url": _frontend_url("plus?checkout=cancel"),
        "allow_promotion_codes": "true",
        "client_reference_id": user_id,
        "saved_payment_method_options[payment_method_save]": "enabled",
        "payment_method_collection": "always",
        "metadata[itinero_user_id]": user_id,
        "metadata[itinero_pack_id]": pack["id"],
        "metadata[itinero_credits]": str(credits),
        "metadata[itinero_product]": "vero_credits_sub" if subscribe else "vero_credits",
        "metadata[itinero_interval]": rec_interval if subscribe else "once",
        "managed_payments[enabled]": "false",
        "automatic_tax[enabled]": "false",
        "line_items[0][price_data][currency]": stripe_cur,
        "line_items[0][price_data][unit_amount]": str(minor),
        "line_items[0][price_data][product_data][name]": (
            f"Vero {pack['name']} — {credits} credits"
        ),
        "line_items[0][price_data][product_data][description]": (
            "Vero credits. Chat=1, live search=4. Search and book on Itinero stay free."
        ),
        "line_items[0][quantity]": "1",
    }
    if subscribe:
        data["line_items[0][price_data][recurring][interval]"] = rec_interval
        data["customer_update[name]"] = "auto"
        data["subscription_data[metadata][itinero_user_id]"] = user_id
        data["subscription_data[metadata][itinero_pack_id]"] = pack["id"]
        data["subscription_data[metadata][itinero_credits]"] = str(credits)
        data["subscription_data[metadata][itinero_product]"] = "vero_credits_sub"
        data["subscription_data[metadata][itinero_interval]"] = rec_interval
    else:
        data["payment_intent_data[setup_future_usage]"] = "off_session"
        data["payment_intent_data[metadata][itinero_user_id]"] = user_id
        data["payment_intent_data[metadata][itinero_pack_id]"] = pack["id"]
    out = _stripe_post("checkout/sessions", data)
    if not out.get("ok"):
        return out
    url = out.get("url")
    if not url:
        return {"ok": False, "error": "no_checkout_url", "message": "Stripe did not return a checkout URL."}
    return {
        "ok": True,
        "url": url,
        "sessionId": out.get("id"),
        "packId": pack["id"],
        "credits": credits,
        "mode": "subscription" if subscribe else "payment",
        "interval": rec_interval if subscribe else "once",
        "stripeMode": stripe_key_mode(),
    }


def create_portal_session(*, user_id: str) -> dict[str, Any]:
    sub = get_subscription(user_id) or {}
    cid = (sub.get("stripeCustomerId") or "").strip()
    if not cid.startswith("cus_"):
        return {
            "ok": False,
            "error": "no_customer",
            "message": "No Stripe customer yet — buy a credit pack first.",
        }
    _prune_duplicate_subscriptions(
        customer_id=cid,
        keep_id=sub.get("stripeSubscriptionId"),
    )
    out = _stripe_post(
        "billing_portal/sessions",
        {"customer": cid, "return_url": _frontend_url("plus")},
    )
    if not out.get("ok"):
        return out
    url = out.get("url")
    if not url:
        return {"ok": False, "error": "no_portal_url", "message": "Could not open billing portal."}
    return {"ok": True, "url": url, "stripeMode": stripe_key_mode()}


def _fulfill_credit_pack_session(
    *,
    user_id: str,
    sess: dict[str, Any],
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    from supervisor.credit_packs import pack_by_id, pack_credits_for, record_purchase
    from supervisor.credits import subject_key

    meta = sess.get("metadata") if isinstance(sess.get("metadata"), dict) else {}
    pack_id = str(meta.get("itinero_pack_id") or "").strip().lower()
    pack = pack_by_id(pack_id)
    currency = str(sess.get("currency") or "inr").upper()
    credits = int(meta.get("itinero_credits") or (pack_credits_for(pack, currency) if pack else 0) or 0)
    if not pack or credits <= 0:
        return {"ok": False, "error": "bad_pack", "message": "Checkout missing pack metadata."}
    amount_total = sess.get("amount_total") or sess.get("amount_paid")
    try:
        amount_minor = int(amount_total if amount_total is not None else pack.get("inr_minor") or 0)
    except (TypeError, ValueError):
        amount_minor = int(pack.get("inr_minor") or 0)
    subject = subject_key(user_id=user_id)
    pi = sess.get("payment_intent")
    if isinstance(pi, dict):
        pi = pi.get("id")
    key = (idempotency_key or "").strip() or str(sess.get("id") or "") or None
    out = record_purchase(
        user_id=user_id,
        subject=subject,
        pack_id=pack["id"],
        credits=credits,
        amount_minor=amount_minor,
        currency=currency,
        stripe_session_id=key,
        stripe_payment_intent=str(pi or "") or None,
    )
    return {
        **out,
        "plan": "credits",
        "packId": pack["id"],
        "sessionId": sess.get("id"),
        "stripeMode": stripe_key_mode(),
    }


def _subscription_meta(obj: dict[str, Any]) -> dict[str, Any]:
    meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
    if meta.get("itinero_pack_id"):
        return meta
    details = obj.get("subscription_details") if isinstance(obj.get("subscription_details"), dict) else {}
    nested = details.get("metadata") if isinstance(details.get("metadata"), dict) else {}
    if nested.get("itinero_pack_id"):
        return nested
    parent = obj.get("parent") if isinstance(obj.get("parent"), dict) else {}
    sub_details = parent.get("subscription_details") if isinstance(parent.get("subscription_details"), dict) else {}
    pmeta = sub_details.get("metadata") if isinstance(sub_details.get("metadata"), dict) else {}
    if pmeta.get("itinero_pack_id"):
        return pmeta
    sub_id = _stripe_id(obj.get("subscription"), "sub_")
    if sub_id:
        sub = _stripe_get(f"subscriptions/{sub_id}")
        sm = sub.get("metadata") if isinstance(sub.get("metadata"), dict) else {}
        if sm.get("itinero_pack_id"):
            return sm
    return meta


def _activate_credit_subscription(*, user_id: str, obj: dict[str, Any], extra_payload: dict | None = None) -> None:
    meta = _subscription_meta(obj)
    pack_id = str(meta.get("itinero_pack_id") or extra_payload and extra_payload.get("itinero_pack_id") or "credits")
    rec = "month"
    raw_int = str(meta.get("itinero_interval") or extra_payload and extra_payload.get("itinero_interval") or "month")
    if raw_int in {"year", "annual"}:
        rec = "year"
    _upsert_subscription(
        user_id=user_id,
        plan=pack_id,
        interval=rec,
        status="active",
        stripe_customer_id=_stripe_id(obj.get("customer"), "cus_") or None,
        stripe_subscription_id=_stripe_id(obj.get("subscription") or obj.get("id"), "sub_") or None,
        payload={
            "itinero_pack_id": pack_id,
            "itinero_credits": meta.get("itinero_credits"),
            "itinero_product": "vero_credits_sub",
            **(extra_payload or {}),
        },
    )


def _fulfill_subscription_invoice(*, user_id: str, invoice: dict[str, Any]) -> dict[str, Any]:
    meta = _subscription_meta(invoice)
    pack_id = str(meta.get("itinero_pack_id") or "").strip().lower()
    if not pack_id:
        return {"ok": True, "skipped": True, "reason": "no_pack"}
    inv_id = _stripe_id(invoice.get("id"), "in_") or str(invoice.get("id") or "")
    sess = {
        "id": inv_id,
        "metadata": meta,
        "amount_paid": invoice.get("amount_paid"),
        "amount_total": invoice.get("amount_paid"),
        "currency": invoice.get("currency"),
        "payment_intent": invoice.get("payment_intent"),
    }
    return _fulfill_credit_pack_session(user_id=user_id, sess=sess, idempotency_key=inv_id)


def complete_checkout_session(*, user_id: str, session_id: str) -> dict[str, Any]:
    """Credit the wallet after Stripe Checkout redirect (works without webhook in test)."""
    uid = (user_id or "").strip()
    sid = (session_id or "").strip()
    if not uid:
        return {"ok": False, "error": "unauthorized", "message": "Sign in to finish checkout."}
    if not sid.startswith("cs_"):
        return {"ok": False, "error": "bad_session", "message": "Missing Stripe checkout session."}
    sess = _stripe_get(f"checkout/sessions/{sid}", {"expand[]": "invoice"})
    if not sess.get("ok"):
        return sess
    meta = sess.get("metadata") if isinstance(sess.get("metadata"), dict) else {}
    owner = str(meta.get("itinero_user_id") or sess.get("client_reference_id") or "").strip()
    if owner and owner != uid:
        return {"ok": False, "error": "forbidden", "message": "This checkout belongs to another account."}
    mode = str(sess.get("mode") or "").lower()
    status = str(sess.get("status") or "").lower()
    paid = str(sess.get("payment_status") or "").lower()
    if status not in {"complete", "paid"} and paid not in {"paid", "no_payment_required"}:
        return {
            "ok": False,
            "error": "not_complete",
            "message": "Checkout is not finished yet. Complete payment on Stripe.",
        }
    product = str(meta.get("itinero_product") or "")
    if mode == "subscription" or product == "vero_credits_sub":
        _activate_credit_subscription(user_id=uid, obj={**sess, "metadata": meta})
        invoice = sess.get("invoice")
        if isinstance(invoice, dict):
            fulfilled = _fulfill_subscription_invoice(user_id=uid, invoice={**invoice, "metadata": {**meta, **(invoice.get("metadata") or {})}})
        else:
            inv_id = _stripe_id(invoice, "in_")
            fulfilled = _fulfill_credit_pack_session(
                user_id=uid,
                sess=sess,
                idempotency_key=inv_id or sid,
            )
        return {**fulfilled, "mode": "subscription"}
    if mode == "payment" or product == "vero_credits":
        return _fulfill_credit_pack_session(user_id=uid, sess=sess)
    return {"ok": False, "error": "unknown_mode", "message": "Unrecognized checkout."}


def verify_stripe_signature(payload: bytes, header: str | None, secret: str, *, tolerance: int = 300) -> bool:
    if not secret or not header or not payload:
        return False
    parts = {}
    for item in header.split(","):
        if "=" in item:
            k, v = item.split("=", 1)
            parts[k.strip()] = v.strip()
    ts = parts.get("t")
    sig = parts.get("v1")
    if not ts or not sig:
        return False
    try:
        age = abs(time.time() - int(ts))
    except ValueError:
        return False
    if age > tolerance:
        return False
    signed = f"{ts}.".encode() + payload
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    try:
        return hmac.compare_digest(expected, sig)
    except (TypeError, ValueError):
        return False


def _store_event(event_id: str, event_type: str, payload: dict[str, Any]) -> bool:
    if not configured() or not event_id:
        return True
    with connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM stripe_webhook_events WHERE event_id = %s",
            (event_id,),
        ).fetchone()
        if exists:
            return False
        conn.execute(
            """
            INSERT INTO stripe_webhook_events (event_id, event_type, payload)
            VALUES (%s, %s, %s::jsonb)
            """,
            (event_id, event_type[:80], json.dumps(payload, default=str)),
        )
        conn.commit()
    return True


def _user_id_from_stripe(obj: dict[str, Any]) -> str | None:
    meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
    uid = str(meta.get("itinero_user_id") or obj.get("client_reference_id") or "").strip()
    if uid:
        return uid
    cust = str(obj.get("customer") or "").strip()
    if not cust.startswith("cus_") or not configured():
        return None
    with connection() as conn:
        row = conn.execute(
            "SELECT user_id FROM subscriptions WHERE stripe_customer_id = %s LIMIT 1",
            (cust,),
        ).fetchone()
    return str(row[0]) if row else None


def apply_subscription_object(obj: dict[str, Any], *, user_id: str | None = None) -> dict[str, Any]:
    """Map a Stripe subscription object onto our row."""
    uid = user_id or _user_id_from_stripe(obj)
    if not uid:
        return {"ok": False, "error": "no_user"}
    status = str(obj.get("status") or "inactive").lower()
    items = ((obj.get("items") or {}).get("data") or []) if isinstance(obj.get("items"), dict) else []
    price = (items[0].get("price") or {}) if items else {}
    rec = price.get("recurring") if isinstance(price.get("recurring"), dict) else {}
    interval = str(rec.get("interval") or obj.get("metadata", {}).get("itinero_interval") or "month")
    if interval not in {"month", "year"}:
        interval = "month"
    plus = status in PLUS_ACTIVE
    _upsert_subscription(
        user_id=uid,
        plan="plus" if plus else "free",
        interval=interval if plus else None,
        status=status,
        stripe_customer_id=str(obj.get("customer") or "") or None,
        stripe_subscription_id=str(obj.get("id") or "") or None,
        stripe_price_id=str(price.get("id") or "") or None,
        current_period_end=_ts(obj.get("current_period_end")),
        cancel_at_period_end=bool(obj.get("cancel_at_period_end")),
        payload={"stripe_status": status},
    )
    return {"ok": True, "userId": uid, "plan": "plus" if plus else "free", "status": status}


def handle_stripe_event(event: dict[str, Any]) -> dict[str, Any]:
    etype = str(event.get("type") or "")
    eid = str(event.get("id") or "")
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    obj = data.get("object") if isinstance(data.get("object"), dict) else {}
    if eid and not _store_event(eid, etype, event):
        return {"ok": True, "duplicate": True, "type": etype}

    if etype == "checkout.session.completed":
        mode = str(obj.get("mode") or "").lower()
        meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        product = str(meta.get("itinero_product") or "")
        uid = _user_id_from_stripe(obj)
        if mode == "payment" or product == "vero_credits":
            if not uid:
                return {"ok": False, "error": "no_user", "type": etype}
            return {**_fulfill_credit_pack_session(user_id=uid, sess=obj), "type": etype}
        if mode == "subscription" or product == "vero_credits_sub":
            if uid:
                _activate_credit_subscription(user_id=uid, obj=obj)
                invoice = obj.get("invoice")
                if isinstance(invoice, dict) or _stripe_id(invoice, "in_"):
                    inv = invoice if isinstance(invoice, dict) else {"id": invoice, "metadata": meta}
                    fulfilled = _fulfill_subscription_invoice(user_id=uid, invoice=inv)
                    return {**fulfilled, "type": etype, "userId": uid}
            return {"ok": True, "type": etype, "userId": uid}
        return {"ok": True, "ignored": True, "type": etype}

    if etype in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        if str(meta.get("itinero_product") or "") == "vero_credits_sub":
            uid = _user_id_from_stripe(obj)
            if uid:
                status = str(obj.get("status") or "inactive").lower()
                pack_id = str(meta.get("itinero_pack_id") or "credits")
                _upsert_subscription(
                    user_id=uid,
                    plan=pack_id if status in PLUS_ACTIVE else "free",
                    interval=str(meta.get("itinero_interval") or "month"),
                    status=status,
                    stripe_customer_id=_stripe_id(obj.get("customer"), "cus_") or None,
                    stripe_subscription_id=_stripe_id(obj.get("id"), "sub_") or None,
                    current_period_end=_ts(obj.get("current_period_end")),
                    cancel_at_period_end=bool(obj.get("cancel_at_period_end")),
                    payload={"itinero_pack_id": pack_id, "itinero_product": "vero_credits_sub"},
                )
                return {"ok": True, "userId": uid, "status": status, "type": etype}
        return {**apply_subscription_object(obj), "type": etype}

    if etype in {"invoice.paid", "invoice.payment_failed"}:
        sub_id = _stripe_id(obj.get("subscription"), "sub_")
        uid = _user_id_from_stripe(obj)
        if not uid and sub_id and configured():
            with connection() as conn:
                row = conn.execute(
                    "SELECT user_id FROM subscriptions WHERE stripe_subscription_id = %s",
                    (sub_id,),
                ).fetchone()
            uid = str(row[0]) if row else None
        reason = str(obj.get("billing_reason") or "").lower()
        if (
            etype == "invoice.paid"
            and uid
            and reason == "subscription_update"
        ):
            pack_id = str(_subscription_meta(obj).get("itinero_pack_id") or "").strip().lower()
            if uid and sub_id and pack_id:
                _upsert_subscription(
                    user_id=uid,
                    plan=pack_id,
                    interval=str(_subscription_meta(obj).get("itinero_interval") or "month"),
                    status="active",
                    stripe_subscription_id=sub_id,
                )
            return {"ok": True, "skipped": True, "reason": "upgrade_invoice", "type": etype}
        if etype == "invoice.paid" and uid and _subscription_meta(obj).get("itinero_pack_id"):
            fulfilled = _fulfill_subscription_invoice(user_id=uid, invoice=obj)
            if uid and sub_id:
                _upsert_subscription(
                    user_id=uid,
                    plan=str(_subscription_meta(obj).get("itinero_pack_id") or "credits"),
                    interval=str(_subscription_meta(obj).get("itinero_interval") or "month"),
                    status="active",
                    stripe_subscription_id=sub_id,
                )
            return {**fulfilled, "type": etype}
        if sub_id and uid:
            status = "active" if etype == "invoice.paid" else "past_due"
            plus = status in PLUS_ACTIVE
            _upsert_subscription(
                user_id=uid,
                plan="plus" if plus else "free",
                interval=(get_subscription(uid) or {}).get("interval") or "month",
                status=status,
                stripe_subscription_id=sub_id,
            )
        return {"ok": True, "type": etype}

    return {"ok": True, "ignored": True, "type": etype}


def process_stripe_webhook(*, payload: bytes, signature: str | None) -> dict[str, Any]:
    secret = _webhook_secret()
    if secret:
        if not verify_stripe_signature(payload, signature, secret):
            return {"ok": False, "error": "invalid_signature", "message": "Invalid Stripe signature."}
    elif is_production():
        return {"ok": False, "error": "webhook_secret_missing", "message": "STRIPE_WEBHOOK_SECRET required in production."}

    try:
        event = json.loads(payload.decode("utf-8"))
    except Exception:
        return {"ok": False, "error": "invalid_json"}
    if not isinstance(event, dict):
        return {"ok": False, "error": "invalid_event"}
    try:
        return handle_stripe_event(event)
    except Exception:
        traceback.print_exc()
        return {"ok": False, "error": "handler_failed"}
