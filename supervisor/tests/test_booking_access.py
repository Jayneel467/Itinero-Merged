"""P0 booking IDOR + marketing admin + prod cancel deny (no network)."""

from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _req(*, device="", token="", env_token="", query=None):
    headers = {}
    if device:
        headers["x-itinero-device"] = device
    if token:
        headers["x-marketing-token"] = token
    return SimpleNamespace(
        headers=headers,
        query_params=query or {},
    )


def test_prod_unknown_ownership_denied(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    from fastapi import HTTPException
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=None):
        with pytest.raises(HTTPException) as exc:
            require_booking_access(
                booking_id="HTL-1",
                device_id="dev-a",
                email=None,
                production=True,
            )
        assert exc.value.status_code == 403


def test_sandbox_unknown_ownership_allowed(monkeypatch):
    monkeypatch.setenv("APP_ENV", "sandbox")
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=None):
        require_booking_access(
            booking_id="HTL-1",
            device_id=None,
            production=False,
        )


def test_wrong_device_denied_even_in_sandbox():
    from fastapi import HTTPException
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=False):
        with pytest.raises(HTTPException) as exc:
            require_booking_access(
                booking_id="HTL-1",
                device_id="other-device",
                production=False,
            )
        assert exc.value.status_code == 403


def test_matching_device_allowed():
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=True):
        require_booking_access(booking_id="HTL-1", device_id="mine", production=True)


def test_matching_user_allowed():
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=False):
        with patch("supervisor.ledger.booking_owned_by_user", return_value=True):
            require_booking_access(
                booking_id="HTL-1",
                device_id="other-phone",
                user_id="user-1",
                production=True,
            )


def test_matching_email_allowed():
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=False), patch(
        "supervisor.booking_access.email_matches_booking", return_value=True
    ):
        require_booking_access(
            booking_id="HTL-1",
            device_id="wrong",
            email="guest@example.com",
            production=True,
        )


def test_admin_bypasses():
    from supervisor.booking_access import require_booking_access

    with patch("supervisor.ledger.booking_owned_by_device", return_value=False):
        require_booking_access(
            booking_id="HTL-1",
            device_id=None,
            admin_ok=True,
            production=True,
        )


def test_marketing_admin_closed_in_production_without_token(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("MARKETING_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("CATALOG_CURATOR_TOKEN", raising=False)
    monkeypatch.delenv("ITINERO_ENV", raising=False)
    monkeypatch.delenv("ENV", raising=False)
    from supervisor.booking_access import marketing_admin_allowed

    assert marketing_admin_allowed(_req()) is False


def test_marketing_admin_open_in_dev_without_token(monkeypatch):
    monkeypatch.setenv("APP_ENV", "sandbox")
    monkeypatch.delenv("MARKETING_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("CATALOG_CURATOR_TOKEN", raising=False)
    from supervisor.booking_access import marketing_admin_allowed

    assert marketing_admin_allowed(_req()) is True


def test_marketing_admin_token_required_when_set(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("MARKETING_ADMIN_TOKEN", "secret-mkt")
    from supervisor.booking_access import marketing_admin_allowed

    assert marketing_admin_allowed(_req()) is False
    assert marketing_admin_allowed(_req(token="wrong")) is False
    assert marketing_admin_allowed(_req(token="secret-mkt")) is True


def test_readiness_prod_requires_marketing_token_and_stripe(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("API_KEY", "live_not_sand")
    monkeypatch.setenv("ITINERO_ALLOW_MOCK_PAYMENT", "false")
    monkeypatch.setenv("LITEAPI_WEBHOOK_SECRET", "whsec")
    monkeypatch.delenv("MARKETING_ADMIN_TOKEN", raising=False)
    monkeypatch.delenv("CATALOG_CURATOR_TOKEN", raising=False)
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("ITINERO_STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    monkeypatch.delenv("SMTP_HOST", raising=False)

    from supervisor.monitoring import readiness_missing

    missing = readiness_missing(production=True)
    assert "marketing_admin_token" in missing
    assert "stripe_secret_key" in missing
