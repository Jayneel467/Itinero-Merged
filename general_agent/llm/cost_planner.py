"""CFO cost planner for free Vero.

Unit economics (USD, conservative 2026 list prices). Vero stays free to the
user — we afford it by sending most turns to DeepSeek and only paying OpenAI
for live inventory / money tools.

Does not paywall Vero. Budget modes degrade quality, never require Plus.
User-facing fair-use is Claude-style daily credits (supervisor/credits.py).
"""

from __future__ import annotations

import logging
import os
import threading
from collections import defaultdict
from datetime import date
from typing import Any

log = logging.getLogger("itinero.vero.cost")

# USD per 1M tokens (list, not committed discounts).
RATES_USD_PER_M = {
    "gpt-4o-mini": {"in": 0.15, "out": 0.60},
    "deepseek-chat": {"in": 0.14, "out": 0.28},
    "gemini-2.5-flash": {"in": 0.10, "out": 0.40},
}

# Assumed tokens / turn (system prompt is the heavy input).
TURN_TOKENS = {
    # Slim planner prompt (~3.5k in) vs full tools bible (~7–16k).
    "planner": {"in": 3500, "out": 450, "model": "deepseek-chat"},
    "synth": {"in": 5000, "out": 500, "model": "deepseek-chat"},
    "tools": {"in": 16000, "out": 700, "model": "gpt-4o-mini"},
    "tools_fallback": {"in": 16000, "out": 700, "model": "gpt-4o-mini"},
    "router": {"in": 500, "out": 80, "model": "gpt-4o-mini"},
}

_lock = threading.Lock()
_day = ""
_spend_usd = 0.0
_turns: dict[str, int] = defaultdict(int)
_openai_turns: dict[str, int] = defaultdict(int)


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(0.0, float(raw))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        return default


def daily_budget_usd() -> float:
    """Hard daily AI spend ceiling (process-local). Default $80."""
    return _env_float("VERO_DAILY_BUDGET_USD", 80.0)


def openai_turns_per_subject_day() -> int:
    """Fair-use OpenAI (tools) turns per device/thread per day."""
    return _env_int("VERO_OPENAI_TURNS_PER_DEVICE_DAY", 12)


def estimate_turn_usd(lane: str) -> float:
    spec = TURN_TOKENS.get(lane) or TURN_TOKENS["planner"]
    rates = RATES_USD_PER_M.get(spec["model"]) or RATES_USD_PER_M["deepseek-chat"]
    usd = (spec["in"] / 1_000_000) * rates["in"] + (spec["out"] / 1_000_000) * rates["out"]
    return round(usd, 6)


def blended_target_usd() -> dict[str, Any]:
    """Launch mix: 80% cheap chat / 20% OpenAI tools."""
    cheap = estimate_turn_usd("planner")
    tools = estimate_turn_usd("tools")
    blended = 0.80 * cheap + 0.20 * tools
    budget = daily_budget_usd()
    turns = int(budget / blended) if blended > 0 else 0
    return {
        "cheapUsd": cheap,
        "toolsUsd": tools,
        "blendedUsd": round(blended, 6),
        "dailyBudgetUsd": budget,
        "turnsPerDayAtBlend": turns,
        "dauAt8Turns": turns // 8 if turns else 0,
        "mix": "80% DeepSeek chat / 20% OpenAI tools",
        "veroFree": True,
    }


def _roll_day() -> None:
    global _day, _spend_usd, _turns, _openai_turns
    today = date.today().isoformat()
    if _day != today:
        _day = today
        _spend_usd = 0.0
        _turns = defaultdict(int)
        _openai_turns = defaultdict(int)


def budget_mode() -> str:
    """ok | conserve | protect. Never blocks Vero."""
    _roll_day()
    budget = daily_budget_usd()
    if budget <= 0:
        return "ok"
    ratio = _spend_usd / budget
    if ratio >= 0.95:
        return "protect"
    if ratio >= 0.70:
        return "conserve"
    return "ok"


def openai_quota_remaining(subject: str | None) -> int:
    _roll_day()
    cap = openai_turns_per_subject_day()
    used = _openai_turns.get(str(subject or "anon"), 0)
    return max(0, cap - used)


def device_over_openai_quota(subject: str | None) -> bool:
    return openai_quota_remaining(subject) <= 0


def message_window(lane: str) -> int:
    mode = budget_mode()
    if lane in {"tools", "tools_fallback"}:
        if mode == "protect":
            return _env_int("VERO_COST_WINDOW_TOOLS_PROTECT", 10)
        return _env_int("VERO_COST_WINDOW_TOOLS", 16)
    if mode == "protect":
        return 8
    if mode == "conserve":
        return 10
    return _env_int("VERO_COST_WINDOW_CHEAP", 12)


def max_output_tokens(lane: str) -> int:
    mode = budget_mode()
    if lane in {"tools", "tools_fallback"}:
        return 900 if mode == "protect" else 1400
    if mode == "protect":
        return 350
    if mode == "conserve":
        return 500
    return 700


def record_turn(*, lane: str, subject: str | None = None) -> dict[str, Any]:
    _roll_day()
    usd = estimate_turn_usd(lane)
    key = str(subject or "anon")[:80] or "anon"
    with _lock:
        global _spend_usd
        _spend_usd += usd
        _turns[lane] = _turns.get(lane, 0) + 1
        if lane in {"tools", "tools_fallback"}:
            _openai_turns[key] += 1
    mode = budget_mode()
    log.info(
        "vero_cost lane=%s usd=%.5f spend=%.3f mode=%s subject=%s",
        lane,
        usd,
        _spend_usd,
        mode,
        key[:16],
    )
    return {
        "lane": lane,
        "estimatedUsd": usd,
        "daySpendUsd": round(_spend_usd, 4),
        "budgetMode": mode,
        "veroFree": True,
    }


def snapshot() -> dict[str, Any]:
    _roll_day()
    blend = blended_target_usd()
    return {
        "veroFree": True,
        "day": _day or date.today().isoformat(),
        "daySpendUsd": round(_spend_usd, 4),
        "dailyBudgetUsd": daily_budget_usd(),
        "budgetMode": budget_mode(),
        "turns": dict(_turns),
        "openaiFairUsePerDevice": openai_turns_per_subject_day(),
        **blend,
        "ratesUsdPerM": RATES_USD_PER_M,
        "note": "Vero is free. Daily credits (Claude-style) meter usage; budget modes degrade to DeepSeek and do not require Plus.",
    }


def reset_for_tests() -> None:
    global _day, _spend_usd, _turns, _openai_turns
    with _lock:
        _day = date.today().isoformat()
        _spend_usd = 0.0
        _turns = defaultdict(int)
        _openai_turns = defaultdict(int)
