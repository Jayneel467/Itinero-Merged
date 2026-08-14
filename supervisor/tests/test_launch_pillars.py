"""Launch pillars — money-path guards, webhook auth, loyalty reverse helpers."""

from __future__ import annotations

import os

import pytest


def test_mock_payment_blocked_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ITINERO_ALLOW_MOCK_PAYMENT", "true")
    from supervisor.payment_guards import assert_mock_payment_allowed, mock_payment_allowed

    assert mock_payment_allowed() is False
    err = assert_mock_payment_allowed(mock_payment=True)
    assert err and err["error"] == "mock_not_allowed"
    assert assert_mock_payment_allowed(mock_payment=False) is None


def test_mock_payment_allowed_only_sandbox_flag(monkeypatch):
    monkeypatch.setenv("APP_ENV", "sandbox")
    monkeypatch.setenv("ITINERO_ALLOW_MOCK_PAYMENT", "true")
    from supervisor.payment_guards import assert_mock_payment_allowed, mock_payment_allowed

    assert mock_payment_allowed() is True
    assert assert_mock_payment_allowed(mock_payment=True) is None


def test_webhook_auth_requires_secret_in_production(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("LITEAPI_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("LITEAPI_WEBHOOK_TOKEN", raising=False)
    from supervisor.liteapi_webhook import verify_auth_header

    assert verify_auth_header(None) is False
    assert verify_auth_header("Bearer anything") is False

    monkeypatch.setenv("LITEAPI_WEBHOOK_SECRET", "super-secret-token")
    assert verify_auth_header("super-secret-token") is True
    assert verify_auth_header("Bearer super-secret-token") is True
    assert verify_auth_header("wrong") is False


def test_webhook_auth_open_in_sandbox_without_secret(monkeypatch):
    monkeypatch.setenv("APP_ENV", "sandbox")
    monkeypatch.delenv("LITEAPI_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("LITEAPI_WEBHOOK_TOKEN", raising=False)
    from supervisor.liteapi_webhook import verify_auth_header

    assert verify_auth_header(None) is True


def test_readiness_prod_requires_webhook_and_live_key(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("API_KEY", "sand_test_key")
    monkeypatch.setenv("ITINERO_ALLOW_MOCK_PAYMENT", "false")
    monkeypatch.delenv("LITEAPI_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("ITINERO_STRIPE_WEBHOOK_SECRET", raising=False)

    from supervisor.monitoring import readiness_missing

    missing = readiness_missing(production=True)
    assert "liteapi_live_key" in missing
    assert "liteapi_webhook_secret" in missing
    assert "marketing_admin_token" in missing
    assert "stripe_webhook_secret" in missing


def test_money_path_flags_warn_on_sandbox_key_in_prod(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("LITEAPI_KEY", "sand_abc")
    monkeypatch.setenv("ITINERO_ALLOW_MOCK_PAYMENT", "false")
    monkeypatch.delenv("LITEAPI_WEBHOOK_SECRET", raising=False)

    from supervisor.payment_guards import money_path_launch_flags

    flags = money_path_launch_flags()
    assert flags["production"] is True
    assert flags["liteapiSandboxKey"] is True
    assert "liteapi_sandbox_key_in_production" in flags["warnings"]
    assert "liteapi_webhook_secret_missing" in flags["warnings"]
