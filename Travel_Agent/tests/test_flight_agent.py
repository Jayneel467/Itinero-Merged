"""Core Flight Agent unit tests (no live API calls)."""

from __future__ import annotations

import os

import pytest

os.environ.setdefault("APP_ENV", "sandbox")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-not-real")
os.environ.setdefault("API_KEY", "sand_test")


@pytest.fixture(autouse=True)
def _clear_settings():
    from flight_agent.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_sandbox_allows_credit(monkeypatch):
    monkeypatch.setenv("APP_ENV", "sandbox")
    monkeypatch.setenv("LITEAPI_USE_PAYMENT_SDK", "false")
    from flight_agent.config import get_settings

    get_settings.cache_clear()
    get_settings().assert_payment_allowed()


def test_production_blocks_credit(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("LITEAPI_USE_PAYMENT_SDK", "false")
    from flight_agent.config import get_settings

    get_settings.cache_clear()
    with pytest.raises(ValueError, match="Payment SDK"):
        get_settings().assert_payment_allowed()


def test_session_context_defaults():
    from flight_agent.models.agent import SessionContext

    ctx = SessionContext()
    assert ctx.booking_id is None
    assert ctx.travelers_draft == []


def test_hold_ready_prompt_has_no_card_ui():
    from flight_agent.llm.confirmation import hold_ready_prompt
    from flight_agent.models.agent import SessionContext

    ctx = SessionContext(prebook_id="pb_test", last_prebook={"price": 100, "currency": "INR"})
    text = hold_ready_prompt(ctx).lower()
    assert "hold" in text
    assert "4242" not in text
    assert "payment box" not in text
    assert "checkout" in text


def test_flight_agent_tools_exclude_complete(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    from unittest.mock import MagicMock

    from flight_agent.config import get_settings
    from flight_agent.llm.tools import build_flight_tools
    from flight_agent.models.agent import SessionContext

    get_settings.cache_clear()
    names = {t.name for t in build_flight_tools(MagicMock(), SessionContext())}
    assert "prebook_flight" in names
    assert "complete_flight_booking" not in names


def test_flight_agent_builds(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real")
    from flight_agent.config import get_settings
    from flight_agent.agent import FlightAgent

    get_settings.cache_clear()
    agent = FlightAgent()
    assert agent._graph is not None
