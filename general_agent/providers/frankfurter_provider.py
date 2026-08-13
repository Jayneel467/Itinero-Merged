"""Frankfurter exchange rates — no API key.

v2: https://api.frankfurter.dev/v2/rates?base=INR&quotes=USD,EUR
"""
from __future__ import annotations

import logging
import time
from typing import Any

import requests

from general_agent.exceptions import ProviderRequestError

logger = logging.getLogger(__name__)

RATES_URL = "https://api.frankfurter.dev/v2/rates"
PAIR_URL = "https://api.frankfurter.dev/v2/rate/{base}/{quote}"
V1_LATEST = "https://api.frankfurter.dev/v1/latest"

_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL = 6 * 3600  # Frankfurter updates about daily


def _cache_get(key: str) -> dict[str, Any] | None:
    hit = _CACHE.get(key)
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return payload


def _cache_set(key: str, payload: dict[str, Any]) -> dict[str, Any]:
    _CACHE[key] = (time.time(), payload)
    return payload


def _normalize_v2_list(rows: list, base: str) -> dict[str, Any]:
    rates: dict[str, float] = {}
    date = ""
    used_base = (base or "EUR").upper()
    for row in rows:
        if not isinstance(row, dict):
            continue
        quote = str(row.get("quote") or "").upper()
        try:
            rate = float(row.get("rate"))
        except (TypeError, ValueError):
            continue
        if quote and rate > 0:
            rates[quote] = rate
        date = str(row.get("date") or date)
        if row.get("base"):
            used_base = str(row["base"]).upper()
    return {"base": used_base, "date": date, "rates": rates, "source": "frankfurter"}


def latest_rates(base: str = "INR", quotes: list[str] | None = None) -> dict[str, Any]:
    """Latest Frankfurter rates. `rates[quote]` = units of quote per 1 base."""
    base = (base or "INR").upper()
    qlist = [str(q).upper() for q in (quotes or []) if str(q).strip()]
    qlist = [q for q in qlist if q != base]
    cache_key = f"{base}:{','.join(sorted(qlist)) or '*'}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    params: dict[str, str] = {"base": base}
    if qlist:
        params["quotes"] = ",".join(qlist)
    try:
        resp = requests.get(RATES_URL, params=params, timeout=12)
        resp.raise_for_status()
        body = resp.json()
    except requests.exceptions.RequestException as exc:
        logger.warning("Frankfurter v2 rates failed base=%s: %s", base, exc)
        body = None

    if isinstance(body, list) and body:
        return _cache_set(cache_key, _normalize_v2_list(body, base))

    # v1 fallback (ECB subset — may omit some Gulf/Asian quotes)
    v1_params: dict[str, str] = {"base": base}
    if qlist:
        v1_params["symbols"] = ",".join(qlist)
    try:
        resp = requests.get(V1_LATEST, params=v1_params, timeout=12)
        resp.raise_for_status()
        v1 = resp.json() or {}
        rates = {
            str(k).upper(): float(v)
            for k, v in (v1.get("rates") or {}).items()
            if v is not None
        }
        return _cache_set(
            cache_key,
            {
                "base": str(v1.get("base") or base).upper(),
                "date": str(v1.get("date") or ""),
                "rates": rates,
                "source": "frankfurter",
            },
        )
    except requests.exceptions.RequestException as exc:
        raise ProviderRequestError("Frankfurter", str(exc)) from exc


def pair_rate(base: str, quote: str) -> dict[str, Any]:
    """One pair: 1 base = rate quote."""
    base = (base or "").upper()
    quote = (quote or "").upper()
    if not base or not quote:
        raise ProviderRequestError("Frankfurter", "base and quote currencies are required")
    if base == quote:
        return {"base": base, "quote": quote, "rate": 1.0, "date": "", "source": "frankfurter"}

    cache_key = f"pair:{base}:{quote}"
    cached = _cache_get(cache_key)
    if cached:
        return cached

    try:
        resp = requests.get(PAIR_URL.format(base=base, quote=quote), timeout=12)
        resp.raise_for_status()
        body = resp.json()
    except requests.exceptions.RequestException:
        body = None

    rate = None
    date = ""
    if isinstance(body, dict) and body.get("rate") is not None:
        try:
            rate = float(body["rate"])
        except (TypeError, ValueError):
            rate = None
        date = str(body.get("date") or "")
    elif isinstance(body, list) and body:
        row = body[0] if isinstance(body[0], dict) else {}
        try:
            rate = float(row.get("rate"))
        except (TypeError, ValueError):
            rate = None
        date = str(row.get("date") or "")

    if rate is None or rate <= 0:
        bundle = latest_rates(base, [quote])
        rate = float((bundle.get("rates") or {}).get(quote) or 0)
        date = bundle.get("date") or date
        if rate <= 0:
            raise ProviderRequestError("Frankfurter", f"no rate for {base}/{quote}")

    return _cache_set(
        cache_key,
        {"base": base, "quote": quote, "rate": rate, "date": date, "source": "frankfurter"},
    )


def convert_amount(amount: float, base: str, quote: str) -> dict[str, Any]:
    pair = pair_rate(base, quote)
    amt = float(amount)
    result = amt * float(pair["rate"])
    return {
        "amount": amt,
        "from": pair["base"],
        "to": pair["quote"],
        "rate": pair["rate"],
        "result": result,
        "date": pair.get("date") or "",
        "source": "frankfurter",
    }
