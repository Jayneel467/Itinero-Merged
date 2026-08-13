"""Production agent runtime contract for Vero.

Defines build/prompt identity, turn budgets, and structured turn telemetry.
Hard locks (money, companion safety) live elsewhere — this module is the
agentic loop envelope: measure → bound → observe → degrade cleanly.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

log = logging.getLogger("itinero.vero.runtime")

# Bump when shipping behavior changes that evals / ops should pin.
AGENT_BUILD = (os.getenv("VERO_AGENT_BUILD") or "2026.08.13.prod1").strip()


def _default_prompt_version() -> str:
    try:
        from llm.prompts import PROMPT_VERSION as _pv  # type: ignore
        return str(_pv)
    except Exception:
        try:
            from general_agent.llm.prompts import PROMPT_VERSION as _pv  # type: ignore
            return str(_pv)
        except Exception:
            return "2026.08.13.1"


PROMPT_VERSION = (os.getenv("VERO_PROMPT_VERSION") or _default_prompt_version()).strip()


def _int_env(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def recursion_limit() -> int:
    """LangGraph steps per turn (agent + tools + itinerary nodes)."""
    return _int_env("VERO_RECURSION_LIMIT", 28)


def max_tool_rounds() -> int:
    """Soft budget for tool↔agent loops (observability + loop-guard context)."""
    return _int_env("VERO_MAX_TOOL_ROUNDS", 8)


def invoke_config(thread_id: str, *, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """LangGraph invoke config with production recursion bound."""
    cfg: dict[str, Any] = {
        "configurable": {"thread_id": thread_id},
        "recursion_limit": recursion_limit(),
    }
    if extra:
        cfg.update(extra)
    return cfg


@dataclass
class TurnTrace:
    trace_id: str
    thread_id: str
    started_ms: float
    message_chars: int
    path: str = "graph"
    tools: list[str] = field(default_factory=list)
    lane: str | None = None
    error: str | None = None
    degraded: bool = False

    def finish(self, *, path: str | None = None, tools: list[str] | None = None) -> dict[str, Any]:
        if path:
            self.path = path
        if tools is not None:
            self.tools = tools
        elapsed_ms = int((time.perf_counter() - self.started_ms) * 1000)
        payload = {
            "trace_id": self.trace_id,
            "thread_id": self.thread_id,
            "agent_build": AGENT_BUILD,
            "prompt_version": PROMPT_VERSION,
            "path": self.path,
            "tools": self.tools[:24],
            "tool_count": len(self.tools),
            "lane": self.lane,
            "latency_ms": elapsed_ms,
            "message_chars": self.message_chars,
            "recursion_limit": recursion_limit(),
            "degraded": self.degraded,
            "error": self.error,
        }
        log.info(
            "vero_turn trace=%s path=%s tools=%s latency_ms=%s build=%s",
            self.trace_id,
            self.path,
            len(self.tools),
            elapsed_ms,
            AGENT_BUILD,
        )
        return payload


def start_turn(message: str, thread_id: str) -> TurnTrace:
    return TurnTrace(
        trace_id=uuid.uuid4().hex[:16],
        thread_id=thread_id or "default",
        started_ms=time.perf_counter(),
        message_chars=len(message or ""),
    )


def extract_tool_names(messages: list[Any]) -> list[str]:
    """Tool names from the current turn (after last human message)."""
    last_human = None
    for i, msg in enumerate(messages or []):
        if getattr(msg, "type", None) == "human":
            last_human = i
    turn = messages[last_human + 1 :] if last_human is not None else list(messages or [])
    names: list[str] = []
    for msg in turn:
        if getattr(msg, "type", None) != "ai":
            continue
        for tc in getattr(msg, "tool_calls", None) or []:
            name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
            if name:
                names.append(str(name))
    return names


def agent_identity() -> dict[str, Any]:
    return {
        "agent": "vero",
        "agent_build": AGENT_BUILD,
        "prompt_version": PROMPT_VERSION,
        "recursion_limit": recursion_limit(),
        "max_tool_rounds": max_tool_rounds(),
        "llm_router": (os.getenv("VERO_LLM_ROUTER") or "1").strip(),
        "llm_combo": (os.getenv("VERO_LLM_COMBO") or "1").strip(),
        "model": (os.getenv("ITINERO_MODEL") or "gpt-4o-mini").strip(),
    }


def production_readiness() -> dict[str, Any]:
    """CTO checklist snapshot for /health — not a substitute for launch audit."""
    openai = bool((os.getenv("OPENAI_API_KEY") or "").strip())
    deepseek = bool((os.getenv("DEEPSEEK_API_KEY") or "").strip())
    sentry = bool((os.getenv("SENTRY_DSN") or "").strip())
    redis = bool(
        (os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL") or "").strip()
    )
    env = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "sandbox").lower()
    checks = [
        {"id": "openai", "ok": openai, "required_prod": True},
        {"id": "deepseek_combo", "ok": deepseek, "required_prod": False},
        {"id": "sentry", "ok": sentry, "required_prod": True},
        {"id": "redis_memory", "ok": redis, "required_prod": False},
        {"id": "durable_checkpoint", "ok": _checkpoint_durable(), "required_prod": False},
        {"id": "llm_router", "ok": (os.getenv("VERO_LLM_ROUTER") or "1") not in ("0", "false"), "required_prod": False},
        {"id": "recursion_bound", "ok": recursion_limit() <= 48, "required_prod": True},
    ]
    prod = env in {"production", "prod"}
    blocking = [c["id"] for c in checks if c["required_prod"] and not c["ok"] and prod]
    return {
        "environment": env,
        "production": prod,
        "ready": not blocking,
        "blocking": blocking,
        "checks": checks,
        **agent_identity(),
    }


def _checkpoint_durable() -> bool:
    try:
        from general_agent.checkpointing import checkpoint_status
    except ImportError:
        try:
            from checkpointing import checkpoint_status  # type: ignore
        except ImportError:
            return False
    return bool(checkpoint_status().get("durable"))
