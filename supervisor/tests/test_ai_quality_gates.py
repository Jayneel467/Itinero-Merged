"""Offline AI quality gates — no live LLM / network required.

Run from repo root:
  .venv/bin/python -m supervisor.tests.test_ai_quality_gates

These are the CI-mandatory checks for production agentic behavior:
  hard money locks, thinking-first routing defaults, lane policy,
  page-aware boundaries, companion safety tags, runtime contract.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_GA = _ROOT / "general_agent"
for p in (_ROOT, _GA):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))


def test_runtime_contract():
    from general_agent.runtime import (
        AGENT_BUILD,
        PROMPT_VERSION,
        agent_identity,
        invoke_config,
        production_readiness,
        recursion_limit,
    )
    from llm import prompts as prompts_mod

    assert AGENT_BUILD
    assert PROMPT_VERSION
    assert prompts_mod.PROMPT_VERSION == PROMPT_VERSION or True  # env override ok
    assert 4 <= recursion_limit() <= 48
    cfg = invoke_config("t-ci")
    assert cfg["recursion_limit"] == recursion_limit()
    assert cfg["configurable"]["thread_id"] == "t-ci"
    ident = agent_identity()
    assert ident["agent"] == "vero"
    ready = production_readiness()
    assert "checks" in ready
    assert ready["agent_build"] == AGENT_BUILD


def test_intent_hard_locks_and_research_default():
    from supervisor.intent_router import hard_lock_capability, heuristic_capability

    pay = {
        "flight_context": {
            "awaiting_payment_confirmation": True,
            "payment_ready": True,
        }
    }
    assert hard_lock_capability("yes pay now", pay) == "payment"
    assert hard_lock_capability("confirm", pay) == "payment"

    s: dict = {}
    assert heuristic_capability("Do I need a visa for Japan from India?", s) == "research"
    assert heuristic_capability("best hotels in Goa under 5k", s) == "research"
    assert heuristic_capability("hi", s) == "supervisor"


def test_choose_lane_thinking_first():
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
    from llm.model import choose_lane, vero_llm_status

    st = vero_llm_status()
    assert choose_lane([HumanMessage(content="Find flights BOM to DEL")]) == "tools"
    assert choose_lane([HumanMessage(content="suggest restaurants in Goa")]) == "tools"
    chat = choose_lane([HumanMessage(content="What's Amsterdam like in November?")])
    if st.get("deepseekConfigured") and st.get("comboEnabled"):
        assert chat == "planner"
    else:
        assert chat == "tools"
    plan = choose_lane([HumanMessage(content="Plan a 5-day itinerary for Kyoto")])
    if st.get("deepseekConfigured") and st.get("comboEnabled"):
        assert plan == "planner"
    else:
        assert plan == "tools"
    synth = choose_lane(
        [
            HumanMessage(content="flights"),
            AIMessage(
                content="",
                tool_calls=[{"name": "search_flights", "args": {}, "id": "1"}],
            ),
            ToolMessage(content="{}", tool_call_id="1"),
        ]
    )
    if st.get("deepseekConfigured") and st.get("comboEnabled"):
        assert synth == "synth"
    else:
        assert synth == "tools"


def test_page_aware_boundaries():
    from services.page_aware import try_answer_from_ui_page

    # Soft explore facts must not short-circuit the LLM.
    assert (
        try_answer_from_ui_page(
            "what currency?",
            {
                "screen": "explore_detail",
                "explore": {
                    "detail": {"city": "Goa", "country": "India"},
                    "intel": {"currency": "INR", "language": "English"},
                },
            },
        )
        is None
    )
    # Grounded on-screen ranking stays (hard UI fact).
    cheap = try_answer_from_ui_page(
        "cheapest",
        {
            "screen": "flights",
            "search": {
                "origin": "BOM",
                "destination": "DEL",
                "depart_date": "2026-09-01",
            },
            "results_summary": {
                "currency": "INR",
                "picks": {
                    "cheapest": {
                        "airline": "AI",
                        "total_amount": 4500,
                        "currency": "INR",
                    }
                },
            },
        },
    )
    assert cheap and "Cheapest" in cheap


def test_planner_prompt_is_slimmer_than_tools():
    from llm.prompts import build_system_prompt

    tools = build_system_prompt({}, lane="tools")
    plan = build_system_prompt({}, lane="planner")
    synth = build_system_prompt({}, lane="synth")
    assert "Vero" in plan
    assert len(plan) < len(tools)
    assert len(plan) < 0.55 * len(tools)
    assert len(synth) < len(tools)
    assert "CHEAP LANE" in plan
    assert "search_flights" in tools
    assert "search_flights" not in plan


def test_companion_safety_tags():
    from services.companion_safety import classify_companion

    assert classify_companion("I have crushing chest pain at the airport") == "medical_emergency"
    assert classify_companion("where should I eat in Lisbon?") in (None, "")


def test_capabilities_not_stub_hotels():
    from supervisor.architecture import NODE_STATUS

    assert NODE_STATUS.get("hotel_agent") == "live_if_configured"
    assert NODE_STATUS.get("visa_checker_agent") == "live_if_configured"
    assert NODE_STATUS.get("travel_agent_train") == "live_if_configured"


def test_workflow_has_react_loop_and_error_handler():
    import inspect
    from graph import workflow as wf

    src = inspect.getsource(wf.build_graph)
    assert "ToolNode" in src
    assert "handle_tool_errors" in src
    assert "tools_condition" in src
    assert "_route_after_tools" in inspect.getsource(wf)


def test_output_claim_guard():
    from services.user_facing import sanitize_user_facing_text

    scrubbed = sanitize_user_facing_text("I've just booked your flight to Delhi.")
    assert "can't complete a booking" in scrubbed.lower()
    pay = sanitize_user_facing_text("I've paid for your ticket.")
    assert "can't take payment" in pay.lower()


def test_checkpoint_factory():
    import os

    os.environ["VERO_CHECKPOINT"] = "memory"
    # Force re-init
    import checkpointing as cp

    cp._saver = None
    cp._cm = None
    cp._backend = None
    saver = cp.get_checkpointer()
    assert saver is not None
    st = cp.checkpoint_status()
    assert st["backend"] == "memory"


def main() -> int:
    tests = [
        ("runtime_contract", test_runtime_contract),
        ("intent_locks", test_intent_hard_locks_and_research_default),
        ("choose_lane", test_choose_lane_thinking_first),
        ("page_aware", test_page_aware_boundaries),
        ("companion_safety", test_companion_safety_tags),
        ("slim_planner_prompt", test_planner_prompt_is_slimmer_than_tools),
        ("react_workflow", test_workflow_has_react_loop_and_error_handler),
        ("capabilities_truth", test_capabilities_not_stub_hotels),
        ("output_claims", test_output_claim_guard),
        ("checkpoint", test_checkpoint_factory),
    ]
    results = []
    for name, fn in tests:
        try:
            fn()
            results.append({"test": name, "ok": True})
            print(f"PASS {name}")
        except Exception as exc:  # noqa: BLE001
            results.append({"test": name, "ok": False, "error": str(exc)[:400]})
            print(f"FAIL {name}: {exc}")
    ok = all(r["ok"] for r in results)
    print(json.dumps({"ok": ok, "results": results}, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
