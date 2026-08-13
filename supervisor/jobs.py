"""Lightweight job helpers for supervisor.

- run_with_retry: in-process retries (email / webhooks later).
- enqueue_retry: if Redis is configured, push a JSON job onto a list for a
  future worker; otherwise run sync via a registered fn_key (best-effort).

Redis queue consumption is intentionally deferred — this module only enqueues
or falls back to sync execution.
"""

from __future__ import annotations

import json
import logging
import time
import traceback
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)

_QUEUE_KEY = "itinero:jobs:retry"
_HANDLERS: dict[str, Callable[..., Any]] = {}


def register_handler(fn_key: str, fn: Callable[..., Any]) -> None:
    """Register a callable for sync fallback when Redis is unavailable."""
    key = (fn_key or "").strip()
    if not key:
        raise ValueError("fn_key is required")
    _HANDLERS[key] = fn


def run_with_retry(
    fn: Callable[..., Any],
    /,
    *args: Any,
    attempts: int = 3,
    delay_s: float = 0.5,
    **kwargs: Any,
) -> Any:
    """Call fn with simple linear backoff. Raises the last exception."""
    tries = max(1, int(attempts))
    last: BaseException | None = None
    for i in range(tries):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:
            last = exc
            logger.warning(
                "run_with_retry attempt %s/%s failed: %s",
                i + 1,
                tries,
                exc,
            )
            if i + 1 < tries and delay_s > 0:
                time.sleep(delay_s * (i + 1))
    assert last is not None
    raise last


def _redis_client():
    try:
        from supervisor.session_store import _redis_client as session_redis

        return session_redis()
    except Exception:
        return None


def enqueue_retry(
    name: str,
    fn_key: str,
    payload: dict[str, Any] | None = None,
    attempts: int = 3,
) -> dict[str, Any]:
    """Enqueue a job on Redis list, or run registered handler sync with retries.

    Future: a worker will BRPOP ``itinero:jobs:retry`` and dispatch by fn_key.
    """
    job = {
        "name": (name or "job").strip() or "job",
        "fn_key": (fn_key or "").strip(),
        "payload": payload or {},
        "attempts": max(1, int(attempts)),
    }
    if not job["fn_key"]:
        return {"ok": False, "error": "fn_key is required"}

    client = _redis_client()
    if client is not None:
        try:
            client.rpush(_QUEUE_KEY, json.dumps(job, ensure_ascii=False))
            logger.info("enqueued job name=%s fn_key=%s", job["name"], job["fn_key"])
            return {"ok": True, "queued": True, "queue": _QUEUE_KEY, "job": job}
        except Exception:
            traceback.print_exc()
            logger.warning("Redis enqueue failed; falling back to sync")

    handler = _HANDLERS.get(job["fn_key"])
    if handler is None:
        logger.error(
            "No Redis queue and no registered handler for fn_key=%s — job dropped",
            job["fn_key"],
        )
        return {
            "ok": False,
            "queued": False,
            "error": f"no handler registered for {job['fn_key']}",
            "job": job,
        }

    try:
        result = run_with_retry(
            handler,
            job["payload"],
            attempts=job["attempts"],
        )
        return {"ok": True, "queued": False, "result": result, "job": job}
    except Exception as exc:
        logger.exception("sync job failed name=%s", job["name"])
        return {"ok": False, "queued": False, "error": str(exc), "job": job}
