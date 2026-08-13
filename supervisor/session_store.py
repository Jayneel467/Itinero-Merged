"""Supervisor session store — in-memory by default, optional Redis (REDIS_URL / UPSTASH_REDIS_URL)."""

from __future__ import annotations

import json
import os
import traceback
from typing import Any

_SESSION_TTL_SEC = 60 * 60 * 24  # 24h
_cache: dict[str, dict[str, Any]] = {}
_redis = None  # False = unavailable, None = not tried
_redis_checked = False


def _default_session(session_id: str) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "flight_context": None,
        "history": [],
        "itinerary_state": None,
        "active_specialist": "supervisor",
        "dietary_preference": None,
        "user_id": None,
        "trip_flow": False,
        "pending_trip_slot": None,
        "trip_slots": {},
    }


def _redis_client():
    global _redis, _redis_checked
    if _redis_checked:
        return _redis if _redis is not False else None
    _redis_checked = True
    url = (os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL") or "").strip()
    if not url:
        _redis = False
        return None
    try:
        import redis

        client = redis.from_url(url, decode_responses=True, socket_connect_timeout=3)
        client.ping()
        _redis = client
        return client
    except Exception:
        traceback.print_exc()
        _redis = False
        return None


def redis_ping() -> str:
    """Ping Redis when configured. Returns unset | ready | error."""
    url = (os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL") or "").strip()
    if not url:
        return "unset"
    client = _redis_client()
    if not client:
        return "error"
    try:
        client.ping()
        return "ready"
    except Exception:
        return "error"


def redis_enabled() -> bool:
    return redis_ping() == "ready"


def get_session(session_id: str) -> dict[str, Any]:
    sid = (session_id or "").strip()
    if not sid:
        sid = "anonymous"
    if sid in _cache:
        return _cache[sid]

    client = _redis_client()
    if client:
        try:
            raw = client.get(f"itinero:session:{sid}")
            if raw:
                data = json.loads(raw)
                if isinstance(data, dict):
                    data.setdefault("session_id", sid)
                    _cache[sid] = data
                    return data
        except Exception:
            traceback.print_exc()

    data = _default_session(sid)
    _cache[sid] = data
    return data


def save_session(session_id: str, session: dict[str, Any] | None = None) -> None:
    sid = (session_id or "").strip()
    if not sid:
        return
    data = session if session is not None else _cache.get(sid)
    if not isinstance(data, dict):
        return
    data["session_id"] = sid
    _cache[sid] = data

    client = _redis_client()
    if not client:
        return
    try:
        client.setex(
            f"itinero:session:{sid}",
            _SESSION_TTL_SEC,
            json.dumps(data, default=str),
        )
    except Exception:
        traceback.print_exc()


def session_count() -> int:
    if redis_enabled():
        try:
            client = _redis_client()
            if client:
                keys = client.keys("itinero:session:*")
                return len(keys) if keys else len(_cache)
        except Exception:
            pass
    return len(_cache)
