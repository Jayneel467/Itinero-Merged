"""Neon Postgres pool + schema migrate. No-ops when DATABASE_URL is unset."""

from __future__ import annotations

import os
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from dotenv import load_dotenv

_SUPERVISOR_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _SUPERVISOR_DIR.parent

for _env_path in [
    _SUPERVISOR_DIR / ".env",
    _REPO_ROOT / ".env",
    _REPO_ROOT / "supervisor" / ".env",
    _REPO_ROOT / "backend" / "supervisor" / ".env",
    _REPO_ROOT / "general_agent" / ".env",
]:
    if _env_path.exists():
        load_dotenv(_env_path, override=False)

_SCHEMA_PATH = _SUPERVISOR_DIR / "schema.sql"
_pool = None

_DEFAULT_DATABASE_URL = (
    "postgresql://neondb_owner:npg_PewpjJ8dY4xE@ep-cool-band-aytfc09a-pooler.c-5.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)


def database_url() -> str:
    return (os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or _DEFAULT_DATABASE_URL).strip()


def configured() -> bool:
    url = database_url().lower()
    return url.startswith("postgres://") or url.startswith("postgresql://")


def _conninfo() -> str:
    url = database_url()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    # Neon pooler is PgBouncer — SCRAM channel binding fails on PgBouncer
    if "channel_binding=" in url.lower():
        from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

        parts = urlsplit(url)
        query = [
            (k, v)
            for k, v in parse_qsl(parts.query, keep_blank_values=True)
            if k.lower() != "channel_binding"
        ]
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return url


def init_db() -> bool:
    """Open pool and apply schema. Returns False if DATABASE_URL is missing."""
    global _pool
    if not configured():
        return False
    from psycopg_pool import ConnectionPool

    def _pool_int(name: str, default: int, lo: int, hi: int) -> int:
        try:
            return max(lo, min(int(os.getenv(name) or str(default)), hi))
        except ValueError:
            return default

    if _pool is None:
        # Neon pooler: keep min 0 (no idle compute). 4 was too small for
        # chat + search + webhook + watches at once.
        _pool = ConnectionPool(
            conninfo=_conninfo(),
            min_size=_pool_int("DB_POOL_MIN", 0, 0, 8),
            max_size=_pool_int("DB_POOL_MAX", 12, 2, 32),
            timeout=_pool_int("DB_POOL_TIMEOUT", 15, 5, 60),
            kwargs={"connect_timeout": _pool_int("DB_CONNECT_TIMEOUT", 8, 3, 30)},
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
    except Exception as exc:
        import logging

        logging.getLogger("itinero.db").warning("postgres ping failed: %s", type(exc).__name__)
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
