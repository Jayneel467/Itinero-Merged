"""Observability helpers for Vero (general_agent). Kept local to avoid coupling to supervisor."""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any

_SENTRY_ACTIVE = False


def _service_name() -> str:
    return (os.getenv("SERVICE_NAME") or "itinero-vero").strip() or "itinero-vero"


def _app_env() -> str:
    return (
        os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or os.getenv("ENV") or "sandbox"
    ).strip().lower() or "sandbox"


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "service": _service_name(),
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: int | None = None) -> None:
    """JSON logs when LOG_FORMAT=json; otherwise plain text. Includes SERVICE_NAME."""
    if level is None:
        raw = (os.getenv("LOG_LEVEL") or "INFO").upper()
        level = getattr(logging, raw, logging.INFO)

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    fmt = (os.getenv("LOG_FORMAT") or "").strip().lower()
    if fmt == "json":
        handler.setFormatter(_JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                f"%(asctime)s | %(levelname)-8s | {_service_name()} | %(name)s | %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
    root.addHandler(handler)


def sentry_active() -> bool:
    """True when Sentry SDK initialized successfully this process."""
    return _SENTRY_ACTIVE


def init_sentry() -> bool:
    """Init Sentry if SENTRY_DSN is set. Returns True when enabled."""
    global _SENTRY_ACTIVE
    dsn = (os.getenv("SENTRY_DSN") or "").strip()
    if not dsn:
        _SENTRY_ACTIVE = False
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        logging.getLogger(__name__).warning(
            "SENTRY_DSN set but sentry-sdk is not installed"
        )
        _SENTRY_ACTIVE = False
        return False

    try:
        traces = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE") or "0.05")
    except ValueError:
        traces = 0.05

    sentry_sdk.init(
        dsn=dsn,
        environment=_app_env(),
        traces_sample_rate=max(0.0, min(traces, 1.0)),
        integrations=[
            FastApiIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        send_default_pii=False,
    )
    logging.getLogger(__name__).info(
        "Sentry enabled (env=%s, traces_sample_rate=%s)", _app_env(), traces
    )
    _SENTRY_ACTIVE = True
    return True


def health_payload(*, extra: dict[str, Any] | None = None) -> dict[str, Any]:
    """Basic health dict with redis / smtp / sentry configured flags."""
    redis_on = bool(
        (os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL") or "").strip()
    )
    smtp_on = bool(
        (os.getenv("SMTP_HOST") or "").strip()
        and (os.getenv("SMTP_USER") or "").strip()
        and (os.getenv("SMTP_PASSWORD") or "").strip()
    )
    sentry_cfg = bool((os.getenv("SENTRY_DSN") or "").strip())
    sentry_on = sentry_active()
    body: dict[str, Any] = {
        "status": "ok",
        "service": _service_name(),
        "environment": _app_env(),
        "redis": redis_on,
        "smtp": smtp_on,
        "sentry": sentry_on or sentry_cfg,
        "configured": {
            "openai": bool((os.getenv("OPENAI_API_KEY") or "").strip()),
            "redis": redis_on,
            "smtp": smtp_on,
            "sentry": sentry_on if sentry_cfg else False,
        },
        "dependencies": {
            "sentry": {
                "status": "ready" if sentry_on else ("error" if sentry_cfg else "unset"),
                "ok": sentry_on or not sentry_cfg,
                "configured": sentry_cfg,
                "initialized": sentry_on,
            },
        },
    }
    if extra:
        body.update(extra)
    return body
