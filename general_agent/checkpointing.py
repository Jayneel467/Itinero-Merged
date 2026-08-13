"""LangGraph checkpointer factory — durable by default.

sqlite  — survives process restart (single node). Default for prod/sandbox.
memory  — process-local only (tests / emergency).

Redis/Postgres multi-replica saver is the next P1 when horizontal Vero scales.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from langgraph.checkpoint.memory import MemorySaver

log = logging.getLogger(__name__)

_GA_DIR = Path(__file__).resolve().parent
_DEFAULT_SQLITE = _GA_DIR / "data" / "vero_checkpoints.sqlite"

# Keep context-manager alive for process lifetime (SqliteSaver.from_conn_string).
_cm: Any = None
_saver: Any = None
_backend: str | None = None


def checkpoint_backend() -> str:
    raw = (os.getenv("VERO_CHECKPOINT") or "sqlite").strip().lower()
    if raw in {"memory", "mem", "ephemeral"}:
        return "memory"
    return "sqlite"


def checkpoint_path() -> str:
    return (os.getenv("VERO_CHECKPOINT_PATH") or str(_DEFAULT_SQLITE)).strip()


def get_checkpointer():
    """Return a process-wide checkpointer (lazy singleton)."""
    global _cm, _saver, _backend
    if _saver is not None:
        return _saver

    backend = checkpoint_backend()
    if backend == "memory":
        _saver = MemorySaver()
        _backend = "memory"
        log.info("vero_checkpoint backend=memory")
        return _saver

    try:
        from langgraph.checkpoint.sqlite import SqliteSaver
    except ImportError:
        log.warning(
            "langgraph-checkpoint-sqlite missing — falling back to MemorySaver. "
            "pip install langgraph-checkpoint-sqlite"
        )
        _saver = MemorySaver()
        _backend = "memory_fallback"
        return _saver

    path = checkpoint_path()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # from_conn_string yields a context manager; keep it open for the process.
    _cm = SqliteSaver.from_conn_string(path)
    _saver = _cm.__enter__()
    try:
        _saver.setup()
    except Exception as exc:  # noqa: BLE001
        log.warning("sqlite checkpointer setup: %s", exc)
    _backend = f"sqlite:{path}"
    log.info("vero_checkpoint backend=sqlite path=%s", path)
    return _saver


def checkpoint_status() -> dict[str, Any]:
    get_checkpointer()
    return {
        "backend": checkpoint_backend(),
        "active": _backend or checkpoint_backend(),
        "path": checkpoint_path() if checkpoint_backend() == "sqlite" else None,
        "durable": bool(_backend and str(_backend).startswith("sqlite")),
    }
