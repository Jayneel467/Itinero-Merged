"""Neon Postgres pool + schema migrate. No-ops when DATABASE_URL is unset."""

from __future__ import annotations

import os
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

_SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"
_pool = None


def database_url() -> str:
    return (os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or "").strip()


def configured() -> bool:
    url = database_url().lower()
    return url.startswith("postgres://") or url.startswith("postgresql://")


def _conninfo() -> str:
    url = database_url()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url


def init_db() -> bool:
    """Open pool and apply schema. Returns False if DATABASE_URL is missing."""
    global _pool
    if not configured():
        return False
    from psycopg_pool import ConnectionPool

    if _pool is None:
        _pool = ConnectionPool(
            conninfo=_conninfo(),
            min_size=0,
            max_size=4,
            timeout=20,
            kwargs={"connect_timeout": 20},
            open=True,
        )
    sql = _SCHEMA_PATH.read_text(encoding="utf-8")
    cleaned = "\n".join(
        line for line in sql.splitlines() if line.strip() and not line.strip().startswith("--")
    )
    statements = [s.strip() for s in cleaned.split(";") if s.strip()]
    with _pool.connection() as conn:
        with conn.transaction():
            for stmt in statements:
                conn.execute(stmt)
    return True


def ping() -> str:
    if not configured():
        return "unset"
    try:
        if _pool is None:
            init_db()
        with connection() as conn:
            conn.execute("SELECT 1")
        return "ready"
    except Exception:
        return "error"


@contextmanager
def connection() -> Iterator[Any]:
    if _pool is None:
        if not init_db():
            raise RuntimeError("DATABASE_URL is not set")
    assert _pool is not None
    with _pool.connection() as conn:
        yield conn


_DEVICE_RE = re.compile(r"^[A-Za-z0-9._:-]{8,80}$")


def normalize_device_id(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value or not _DEVICE_RE.match(value):
        return None
    return value
