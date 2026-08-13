"""
Vero dual-LLM: OpenAI (tools/booking) + DeepSeek (trip plans / synthesis).

Active combo (not failover):
  - Tool turns → OpenAI with tools bound
  - After tool results → DeepSeek synthesizes the user-facing answer (no tools)
  - Pure itinerary / plan chat (no booking keywords) → DeepSeek planner

Never uses Gemini here — Gemini is catalog-only.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any, Literal

from langchain_openai import ChatOpenAI

from general_agent.config import MODEL_NAME, MODEL_TEMPERATURE, OPENAI_API_KEY
from llm.tools import ALL_TOOLS

logger = logging.getLogger(__name__)

Lane = Literal["tools", "planner", "synth"]

_TOOL_HINT = re.compile(
    r"\b("
    r"flight|flights|hotel|hotels|book|booking|search|price|fare|fares|"
    r"train|trains|bus|buses|pnr|track|visa|weather|map|maps|directions|"
    r"restaurant|restaurants|event|events|concert|ticket|tickets|"
    r"pay|payment|hold|prebook|checkout|availability|"
    r"liteapi|seat|baggage|cancel|refund"
    r")\b",
    re.I,
)

# "no flights", "without booking", "don't search hotels" must not force the tools lane.
_NEGATED_TOOL = re.compile(
    r"\b("
    r"no|without|dont|don't|do not|skip|ignore|exclude|"
    r"not looking for|not searching|not booking"
    r")\b[\w\s,-]{0,24}\b("
    r"flight|flights|hotel|hotels|book|booking|search|price|fare|fares|"
    r"train|trains|bus|buses|ticket|tickets|payment|checkout"
    r")\b",
    re.I,
)

# Narrow plan lane — soft "suggest/explore/recommend" stays on tools so the
# model can think + call Places/search instead of rule-routing to planner.
_PLAN_HINT = re.compile(
    r"\b("
    r"itinerary|day[- ]by[- ]day|trip plan|plan a trip|plan my trip|plan our trip|"
    r"\d+\s*[- ]?\s*day(?:s)?\s+(?:plan|itinerary|trip)|rough\s+\d+\s*[- ]?\s*day|"
    r"honeymoon (?:plan|itinerary)|"
    r"rough plan|sample plan|outline (?:the )?trip|day plan|trip outline"
    r")\b",
    re.I,
)


def _wants_tools(text: str) -> bool:
    """True when the user is asking for inventory/search/booking actions."""
    if not text:
        return False
    cleaned = _NEGATED_TOOL.sub(" ", text)
    return bool(_TOOL_HINT.search(cleaned))


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def deepseek_configured() -> bool:
    return bool(_env("DEEPSEEK_API_KEY"))


def vero_llm_status() -> dict[str, Any]:
    return {
        "toolsProvider": "openai",
        "toolsModel": MODEL_NAME or "gpt-4o-mini",
        "plannerProvider": "deepseek" if deepseek_configured() else "openai",
        "plannerModel": (
            (_env("DEEPSEEK_MODEL") or "deepseek-chat")
            if deepseek_configured()
            else (MODEL_NAME or "gpt-4o-mini")
        ),
        "comboEnabled": deepseek_configured()
        and _env("VERO_LLM_COMBO", "1") not in ("0", "false", "off", "no"),
        "openaiConfigured": bool(OPENAI_API_KEY),
        "deepseekConfigured": deepseek_configured(),
    }


def get_tools_llm():
    """OpenAI — only lane allowed to bind booking/search tools."""
    return ChatOpenAI(
        model=MODEL_NAME or "gpt-4o-mini",
        temperature=MODEL_TEMPERATURE,
        api_key=OPENAI_API_KEY,
        max_retries=5,
    )


def get_planner_llm():
    """DeepSeek for plans/synthesis; falls back to OpenAI if key missing."""
    if deepseek_configured():
        return ChatOpenAI(
            model=_env("DEEPSEEK_MODEL") or "deepseek-chat",
            temperature=float(_env("DEEPSEEK_TEMPERATURE") or str(MODEL_TEMPERATURE)),
            api_key=_env("DEEPSEEK_API_KEY"),
            base_url=_env("DEEPSEEK_BASE_URL") or "https://api.deepseek.com/v1",
            max_retries=4,
        )
    return get_tools_llm()


def get_llm():
    """Back-compat: tools lane (OpenAI)."""
    return get_tools_llm()


def get_llm_with_tools():
    """OpenAI with all Vero tools bound."""
    return get_tools_llm().bind_tools(ALL_TOOLS)


def _last_human_text(messages: list) -> str:
    for m in reversed(messages or []):
        if getattr(m, "type", None) == "human":
            content = getattr(m, "content", "") or ""
            if isinstance(content, list):
                parts = []
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        parts.append(str(block.get("text") or ""))
                    else:
                        parts.append(str(block))
                return " ".join(parts)
            return str(content)
    return ""


def _recent_tool_results(messages: list) -> bool:
    """True when the latest non-system messages are tool outputs awaiting synthesis."""
    non_system = [m for m in (messages or []) if getattr(m, "type", None) != "system"]
    if not non_system:
        return False
    # Skip trailing empty AI messages
    i = len(non_system) - 1
    while i >= 0 and getattr(non_system[i], "type", None) == "ai":
        tc = getattr(non_system[i], "tool_calls", None) or []
        if tc:
            return False
        content = (getattr(non_system[i], "content", None) or "").strip()
        if content:
            return False
        i -= 1
    saw_tool = False
    while i >= 0:
        t = getattr(non_system[i], "type", None)
        if t == "tool":
            saw_tool = True
            i -= 1
            continue
        if t == "ai" and (getattr(non_system[i], "tool_calls", None) or []):
            return saw_tool
        break
    return saw_tool


def choose_lane(messages: list, trip_context: dict | None = None) -> Lane:
    """Pick tools (OpenAI) vs planner/synth (DeepSeek).

    Thinking-first: ambiguous turns stay on the tools lane so the model can
    decide whether to call tools. Only clear itinerary language → planner;
    post-tool synthesis → synth. Hard lock: inventory/booking verbs → tools.
    """
    combo = _env("VERO_LLM_COMBO", "1") not in ("0", "false", "off", "no")
    if not combo or not deepseek_configured():
        return "tools"

    if _recent_tool_results(messages):
        return "synth"

    text = _last_human_text(messages)
    if not text:
        return "tools"

    toolish = _wants_tools(text)
    # Money / inventory / live facts always stay on OpenAI tools.
    if toolish:
        return "tools"

    # Explicit multi-day plan language only → DeepSeek planner.
    if _PLAN_HINT.search(text):
        return "planner"

    # Default: let the tools-capable model think (may answer without calling tools).
    return "tools"


def get_llm_for_turn(messages: list, trip_context: dict | None = None):
    """
    Returns (runnable, lane).
    - tools → OpenAI + tools
    - planner/synth → DeepSeek without tools
    """
    lane = choose_lane(messages, trip_context)
    if lane == "tools":
        logger.info("vero_llm lane=tools provider=openai model=%s", MODEL_NAME)
        return get_llm_with_tools(), lane

    planner = get_planner_llm()
    logger.info(
        "vero_llm lane=%s provider=%s",
        lane,
        "deepseek" if deepseek_configured() else "openai",
    )
    return planner, lane
