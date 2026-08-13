"""Frankfurter FX for the Itinero currency picker + convert API."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

_ROOT = Path(__file__).resolve().parent.parent
_GA = _ROOT / "general_agent"
for p in (str(_ROOT), str(_GA)):
    if p not in sys.path:
        sys.path.append(p)

from general_agent.exceptions import ProviderRequestError
from providers import frankfurter_provider

DEFAULT_QUOTES = [
    "USD",
    "EUR",
    "GBP",
    "INR",
    "AED",
    "SAR",
    "QAR",
    "SGD",
    "AUD",
    "CAD",
    "NZD",
    "CHF",
    "JPY",
    "CNY",
    "HKD",
    "KRW",
    "THB",
    "MYR",
    "IDR",
    "PHP",
    "VND",
    "MXN",
    "BRL",
    "TRY",
    "ZAR",
    "SEK",
    "NOK",
    "DKK",
    "PLN",
    "CZK",
    "HUF",
    "RON",
    "ILS",
]


def rates_bundle(base: str = "USD", quotes: str | None = None) -> dict[str, Any]:
    base = (base or "USD").upper()
    qlist = [p.strip().upper() for p in (quotes or "").split(",") if p.strip()] or [
        q for q in DEFAULT_QUOTES if q != base
    ]
    try:
        data = frankfurter_provider.latest_rates(base, qlist)
    except ProviderRequestError as exc:
        return {
            "base": base,
            "date": "",
            "rates": {},
            "source": "frankfurter",
            "mode": "degraded",
            "message": str(exc),
        }
    return {
        "base": data.get("base") or base,
        "date": data.get("date") or "",
        "rates": data.get("rates") or {},
        "source": "frankfurter",
        "mode": "ok",
        "message": "",
    }


def convert(amount: float, src: str, dst: str) -> dict[str, Any]:
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return {"mode": "error", "message": "amount must be numeric"}
    if amt <= 0:
        return {"mode": "error", "message": "amount must be > 0"}
    try:
        data = frankfurter_provider.convert_amount(amt, src or "USD", dst or "USD")
    except ProviderRequestError as exc:
        return {"mode": "degraded", "message": str(exc), "result": None}
    return {**data, "mode": "ok", "message": ""}
