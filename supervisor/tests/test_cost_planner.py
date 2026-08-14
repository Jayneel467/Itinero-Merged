"""CFO cost planner: Vero stays free; OpenAI only for inventory/money."""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_GA = _ROOT / "general_agent"
for p in (_ROOT, _GA):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def test_blended_unit_economics_afford_free_vero():
    from llm.cost_planner import blended_target_usd, estimate_turn_usd, reset_for_tests

    reset_for_tests()
    cheap = estimate_turn_usd("planner")
    tools = estimate_turn_usd("tools")
    assert cheap < 0.003
    assert tools < 0.02
    assert cheap < tools
    blend = blended_target_usd()
    assert blend["veroFree"] is True
    assert blend["blendedUsd"] < 0.005
    assert blend["dauAt8Turns"] >= 1000 or blend["dailyBudgetUsd"] < 20


def test_budget_modes_never_paywall():
    from llm.cost_planner import budget_mode, record_turn, reset_for_tests, snapshot

    reset_for_tests()
    assert budget_mode() == "ok"
    for _ in range(3):
        rec = record_turn(lane="planner", subject="dev1")
        assert rec["veroFree"] is True
    snap = snapshot()
    assert snap["veroFree"] is True
    assert snap["budgetMode"] in {"ok", "conserve", "protect"}
    assert "Plus" not in (snap.get("note") or "") or "do not require Plus" in snap["note"]


def test_openai_fair_use_then_cheap(monkeypatch):
    from llm import cost_planner as cp

    cp.reset_for_tests()
    monkeypatch.setattr(cp, "openai_turns_per_subject_day", lambda: 2)
    assert cp.device_over_openai_quota("u1") is False
    cp.record_turn(lane="tools", subject="u1")
    cp.record_turn(lane="tools", subject="u1")
    assert cp.device_over_openai_quota("u1") is True
    assert cp.device_over_openai_quota("u2") is False


def test_llm_clients_are_reused():
    from llm.model import get_planner_llm, get_tools_llm

    a = get_tools_llm()
    b = get_tools_llm()
    assert a is b
    p1 = get_planner_llm()
    p2 = get_planner_llm()
    assert p1 is p2


def test_llm_http_client_ignores_env_proxy():
    from llm.model import get_tools_llm, reset_llm_clients

    reset_llm_clients()
    llm = get_tools_llm()
    http = getattr(llm, "http_client", None)
    assert http is not None
    assert getattr(http, "_trust_env", True) is False


def test_protect_keeps_money_on_tools(monkeypatch):
    from langchain_core.messages import HumanMessage
    from llm.model import choose_lane, vero_llm_status

    st = vero_llm_status()
    if not (st.get("deepseekConfigured") and st.get("comboEnabled")):
        return
    monkeypatch.setattr("llm.cost_planner.budget_mode", lambda: "protect")
    monkeypatch.setattr("llm.cost_planner.device_over_openai_quota", lambda s: True)
    assert choose_lane([HumanMessage(content="what's Kyoto like?")]) == "planner"
    assert choose_lane([HumanMessage(content="pay now for this hold")]) == "tools"
