"""LiteAPI loyalty settings + earn estimates for checkout UI."""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from supervisor.fx_structured import convert

_LITEAPI_BASE = "https://api.liteapi.travel/v3.0"
_CACHE_TTL_SEC = 300
_POINTS_PER_USD = 10  # LiteAPI redeem: 10 points = $1 USD
POINTS_PER_USD = _POINTS_PER_USD
_PROGRAM_NAME = (os.getenv("ITINERO_LOYALTY_PROGRAM_NAME") or "Itinero Rewards").strip()

_cache: dict[str, Any] = {"at": 0.0, "settings": None}


def _api_key() -> str:
    return (
        (os.getenv("API_KEY") or "")
        or (os.getenv("LITEAPI_API_KEY") or "")
        or (os.getenv("LITEAPI_KEY") or "")
    ).strip()


async def fetch_loyalty_settings(*, force: bool = False) -> dict[str, Any]:
    """Fetch LiteAPI loyalty program config (cached ~5 min)."""
    now = time.time()
    if not force and _cache.get("settings") and now - float(_cache.get("at") or 0) < _CACHE_TTL_SEC:
        return dict(_cache["settings"])

    key = _api_key()
    if not key:
        out = {
            "ok": False,
            "enabled": False,
            "error": "liteapi_not_configured",
            "message": "LiteAPI key missing.",
            "programName": _PROGRAM_NAME,
        }
        _cache.update(at=now, settings=out)
        return out

    url = f"{_LITEAPI_BASE}/loyalties/"
    headers = {"Accept": "application/json", "X-API-Key": key}
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers=headers)
        body = r.json() if r.content else {}
    except Exception as exc:
        out = {
            "ok": False,
            "enabled": False,
            "error": "loyalty_fetch_failed",
            "message": str(exc) or "Could not load loyalty settings.",
            "programName": _PROGRAM_NAME,
        }
        _cache.update(at=now, settings=out)
        return out

    rows = body.get("data") if isinstance(body, dict) else None
    row = rows[0] if isinstance(rows, list) and rows else {}
    if not isinstance(row, dict):
        row = {}

    status = str(row.get("status") or "disabled").strip().lower()
    enabled = status == "enabled"
    try:
        cashback_rate = float(row.get("cashbackRate") or 0)
    except (TypeError, ValueError):
        cashback_rate = 0.0
    cashback_currency = str(row.get("cashbackCurrency") or "USD").strip().upper() or "USD"

    out = {
        "ok": True,
        "enabled": enabled and cashback_rate > 0,
        "status": status,
        "cashbackRate": cashback_rate,
        "cashbackCurrency": cashback_currency,
        "programName": _PROGRAM_NAME,
        "pointsPerUnit": _POINTS_PER_USD,
        "accrualNote": "Points credited after check-out.",
    }
    _cache.update(at=now, settings=out)
    return out


def _amount_in_currency(amount: float, src: str, dst: str) -> float | None:
    src_u = (src or "USD").strip().upper()
    dst_u = (dst or "USD").strip().upper()
    if src_u == dst_u:
        return float(amount)
    res = convert(float(amount), src_u, dst_u)
    if res.get("mode") != "ok":
        return None
    try:
        val = float(res.get("result"))
    except (TypeError, ValueError):
        return None
    return val if val > 0 else None


def estimate_loyalty_earn(
    *,
    amount: float,
    currency: str = "INR",
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Estimate Itinero points from a booking total using LiteAPI cashback rate."""
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return {"ok": False, "enabled": False, "error": "invalid_amount"}
    if amt <= 0:
        return {"ok": False, "enabled": False, "error": "invalid_amount"}

    cfg = settings or {}
    if not cfg.get("ok"):
        return {
            "ok": False,
            "enabled": False,
            "programName": cfg.get("programName") or _PROGRAM_NAME,
            "message": cfg.get("message") or "Loyalty unavailable.",
        }
    if not cfg.get("enabled"):
        return {
            "ok": True,
            "enabled": False,
            "programName": cfg.get("programName") or _PROGRAM_NAME,
        }

    booking_currency = (currency or "INR").strip().upper()
    cashback_currency = str(cfg.get("cashbackCurrency") or "USD").strip().upper()
    cashback_rate = float(cfg.get("cashbackRate") or 0)
    base_in_reward_ccy = _amount_in_currency(amt, booking_currency, cashback_currency)
    degraded = base_in_reward_ccy is None
    if degraded:
        # Fall back: treat amount as reward currency (rough estimate).
        base_in_reward_ccy = amt

    cashback_amount = round(float(base_in_reward_ccy) * cashback_rate, 2)
    points = max(0, int(round(cashback_amount * _POINTS_PER_USD)))
    label = f"Earn ~{points:,} {cfg.get('programName') or _PROGRAM_NAME} points"

    return {
        "ok": True,
        "enabled": points > 0,
        "programName": cfg.get("programName") or _PROGRAM_NAME,
        "points": points,
        "cashbackAmount": cashback_amount,
        "cashbackCurrency": cashback_currency,
        "cashbackRate": cashback_rate,
        "bookingAmount": round(amt, 2),
        "bookingCurrency": booking_currency,
        "label": label,
        "accrualNote": cfg.get("accrualNote") or "Points credited after check-out.",
        "disclaimer": f"10 points = $1 {cashback_currency}. Estimate only.",
        "degraded": degraded,
    }
