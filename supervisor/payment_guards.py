"""Production money-path guards — mock pay, env, webhook secrets."""

from __future__ import annotations

import os
from typing import Any


def app_env() -> str:
    return (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "sandbox").strip().lower()


def is_production() -> bool:
    return app_env() in {"production", "prod"}


def is_sandbox_app() -> bool:
    return app_env() in {"sandbox", "development", "dev", "test"}


def mock_payment_allowed() -> bool:
    """True only in sandbox/dev AND ITINERO_ALLOW_MOCK_PAYMENT=true."""
    if not is_sandbox_app():
        return False
    return (os.getenv("ITINERO_ALLOW_MOCK_PAYMENT") or "false").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def assert_mock_payment_allowed(*, mock_payment: bool) -> dict[str, Any] | None:
    """Return an error dict if mock is requested but disallowed; else None."""
    if not mock_payment:
        return None
    if mock_payment_allowed():
        return None
    return {
        "ok": False,
        "error": "mock_not_allowed",
        "message": "Demo / mock payment is disabled. Complete real checkout.",
    }


def liteapi_webhook_secret_configured() -> bool:
    return bool(
        (os.getenv("LITEAPI_WEBHOOK_SECRET") or os.getenv("LITEAPI_WEBHOOK_TOKEN") or "").strip()
    )


def money_path_launch_flags() -> dict[str, Any]:
    """Ops snapshot for health / launch certainty."""
    lite = bool(
        os.getenv("API_KEY") or os.getenv("LITEAPI_KEY") or os.getenv("LITEAPI_API_KEY")
    )
    key = (
        os.getenv("API_KEY")
        or os.getenv("LITEAPI_API_KEY")
        or os.getenv("LITEAPI_KEY")
        or ""
    ).strip()
    sand_key = key.lower().startswith("sand_")
    return {
        "appEnv": app_env(),
        "production": is_production(),
        "liteapiConfigured": lite,
        "liteapiSandboxKey": sand_key if lite else None,
        "mockPaymentAllowed": mock_payment_allowed(),
        "allowMockEnv": (os.getenv("ITINERO_ALLOW_MOCK_PAYMENT") or "false").strip().lower(),
        "liteapiWebhookSecret": liteapi_webhook_secret_configured(),
        "stripeConfigured": bool(
            (os.getenv("STRIPE_SECRET_KEY") or os.getenv("ITINERO_STRIPE_SECRET_KEY") or "").strip()
        ),
        "warnings": _money_path_warnings(sand_key=sand_key, lite=lite),
    }


def _money_path_warnings(*, sand_key: bool, lite: bool) -> list[str]:
    warnings: list[str] = []
    if is_production():
        if not lite:
            warnings.append("liteapi_key_missing")
        if sand_key:
            warnings.append("liteapi_sandbox_key_in_production")
        if mock_payment_allowed():
            warnings.append("mock_payment_enabled_in_production")
        if (os.getenv("ITINERO_ALLOW_MOCK_PAYMENT") or "").lower() in {"1", "true", "yes"}:
            warnings.append("ITINERO_ALLOW_MOCK_PAYMENT_true")
        if not liteapi_webhook_secret_configured():
            warnings.append("liteapi_webhook_secret_missing")
        # Guest email hygiene reminder for ops dashboards
        warnings.append("disable_liteapi_pbo_guest_emails_if_itinero_smtp_on")
    return warnings
