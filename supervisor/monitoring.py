"""Dependency probes for Postgres, Redis, SMTP, and Sentry — used by /api/health*."""

from __future__ import annotations

import os
from typing import Any

from supervisor import session_store
from supervisor.db import configured as db_configured, ping as db_ping
from supervisor.email_service import smtp_configured, smtp_ping
from supervisor.observability import sentry_active


def _status_triple(raw: str) -> dict[str, Any]:
    """Normalize unset | ready | error into {status, ok, configured}."""
    value = (raw or "unset").strip().lower()
    if value == "ready":
        return {"status": "ready", "ok": True, "configured": True}
    if value == "error":
        return {"status": "error", "ok": False, "configured": True}
    if value == "unset":
        return {"status": "unset", "ok": True, "configured": False}
    return {"status": value, "ok": value == "ready", "configured": value != "unset"}


def check_postgres() -> dict[str, Any]:
    if not db_configured():
        return _status_triple("unset")
    return _status_triple(db_ping())


def check_redis() -> dict[str, Any]:
    url = (os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL") or "").strip()
    if not url:
        return _status_triple("unset")
    return _status_triple(session_store.redis_ping())


def check_smtp(*, deep: bool = False) -> dict[str, Any]:
    if not smtp_configured():
        return _status_triple("unset")
    probe = (os.getenv("SMTP_HEALTH_CHECK") or "").strip().lower() in {"1", "true", "yes"}
    if deep or probe:
        result = _status_triple(smtp_ping())
        result["probed"] = True
        return result
    return {"status": "ready", "ok": True, "configured": True, "probed": False}


def check_sentry() -> dict[str, Any]:
    configured = bool((os.getenv("SENTRY_DSN") or "").strip())
    active = sentry_active()
    if not configured:
        return {"status": "unset", "ok": True, "configured": False, "initialized": False}
    return {
        "status": "ready" if active else "error",
        "ok": active,
        "configured": True,
        "initialized": active,
    }


def dependency_report(*, deep: bool = False) -> dict[str, Any]:
    """Full dependency matrix for /api/health and readiness."""
    pg = check_postgres()
    redis = check_redis()
    smtp = check_smtp(deep=deep)
    sentry = check_sentry()
    all_ok = all(dep["ok"] for dep in (pg, redis, smtp, sentry))
    return {
        "ok": all_ok,
        "postgres": pg,
        "redis": redis,
        "smtp": smtp,
        "sentry": sentry,
    }


def readiness_missing(*, production: bool) -> list[str]:
    """Names of deps that block readiness in the current environment."""
    missing: list[str] = []
    liteapi = bool(
        os.getenv("API_KEY") or os.getenv("LITEAPI_KEY") or os.getenv("LITEAPI_API_KEY")
    )
    if not liteapi:
        missing.append("liteapi")

    pg = check_postgres()
    if pg["configured"] and not pg["ok"]:
        missing.append("postgres")

    redis = check_redis()
    # When Redis URL is set, sessions must actually connect (esp. multi-instance prod).
    if redis["configured"] and not redis["ok"]:
        missing.append("redis")

    if production:
        if not pg["configured"]:
            missing.append("postgres")
        smtp = check_smtp(deep=True)
        if not smtp["configured"]:
            missing.append("smtp")
        elif not smtp["ok"]:
            missing.append("smtp")
        sentry = check_sentry()
        if not sentry["configured"]:
            missing.append("sentry")

        from supervisor.payment_guards import (
            liteapi_webhook_secret_configured,
            mock_payment_allowed,
        )

        key = (
            os.getenv("API_KEY")
            or os.getenv("LITEAPI_API_KEY")
            or os.getenv("LITEAPI_KEY")
            or ""
        ).strip()
        if key.lower().startswith("sand_"):
            missing.append("liteapi_live_key")
        if mock_payment_allowed() or (
            os.getenv("ITINERO_ALLOW_MOCK_PAYMENT") or ""
        ).lower() in {"1", "true", "yes"}:
            missing.append("mock_payment_disabled")
        if not liteapi_webhook_secret_configured():
            missing.append("liteapi_webhook_secret")

        mkt = (
            os.getenv("MARKETING_ADMIN_TOKEN") or os.getenv("CATALOG_CURATOR_TOKEN") or ""
        ).strip()
        if not mkt:
            missing.append("marketing_admin_token")

        stripe = (
            os.getenv("STRIPE_SECRET_KEY")
            or os.getenv("ITINERO_STRIPE_SECRET_KEY")
            or ""
        ).strip()
        packages_on = (os.getenv("ITINERO_PACKAGES") or "1").strip().lower() not in {
            "0",
            "false",
            "off",
            "no",
        }
        if packages_on and not stripe:
            missing.append("stripe_secret_key")
        if stripe:
            wh = (
                os.getenv("STRIPE_WEBHOOK_SECRET")
                or os.getenv("ITINERO_STRIPE_WEBHOOK_SECRET")
                or ""
            ).strip()
            if not wh:
                missing.append("stripe_webhook_secret")

    return missing
