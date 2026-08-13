"""AI stack smoke QA: Vero combo lanes + Gemini catalog LLM + curator health.

Run from repo root (use project venv — needs langchain):
  .venv/bin/python -m supervisor.tests.test_ai_stack_smoke
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
_GA = _ROOT / "general_agent"
if str(_GA) not in sys.path:
    sys.path.insert(0, str(_GA))


class Skip(Exception):
    pass


for rel in ("supervisor/.env", "general_agent/.env"):
    p = _ROOT / rel
    if not p.exists():
        continue
    for line in p.read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def test_catalog_llm_gemini_configured():
    from supervisor.catalog_llm import available, catalog_llm_status

    st = catalog_llm_status()
    assert st["usesCoreOpenAI"] is False
    assert st["role"] == "catalog_factory_only"
    if not available():
        raise Skip("GEMINI_API_KEY not set")
    assert st["provider"] == "gemini"
    assert st["configured"] is True


def test_catalog_llm_gemini_json_probe():
    from supervisor.catalog_llm import available, generate_json

    if not available():
        raise Skip("GEMINI_API_KEY not set")
    data = generate_json(
        'Return JSON {"ok": true, "city": "Lisbon", "blurb": "Tile hills and Atlantic light."}',
        temperature=0.1,
    )
    assert isinstance(data, dict)
    assert data.get("ok") is True
    assert "city" in data


def test_vero_lane_router_plan_vs_tools():
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
    from llm.model import choose_lane, vero_llm_status

    st = vero_llm_status()
    assert st["toolsProvider"] == "openai"

    plan_msgs = [HumanMessage(content="Plan a 5-day itinerary for Tokyo in October")]
    lane_plan = choose_lane(plan_msgs)
    if st["deepseekConfigured"] and st["comboEnabled"]:
        assert lane_plan == "planner"
    else:
        assert lane_plan == "tools"

    tool_msgs = [HumanMessage(content="Find flights JFK to NRT")]
    assert choose_lane(tool_msgs) == "tools"

    synth_msgs = [
        HumanMessage(content="Find flights JFK to NRT"),
        AIMessage(content="", tool_calls=[{"name": "search_flights", "args": {}, "id": "1"}]),
        ToolMessage(content='{"flights":[]}', tool_call_id="1"),
    ]
    lane = choose_lane(synth_msgs)
    if st["deepseekConfigured"] and st["comboEnabled"]:
        assert lane == "synth"
    else:
        assert lane == "tools"


def test_vero_deepseek_planner_invoke():
    from langchain_core.messages import HumanMessage, SystemMessage
    from llm.model import choose_lane, deepseek_configured, get_planner_llm

    if not deepseek_configured():
        raise Skip("DEEPSEEK_API_KEY not set")

    msgs = [HumanMessage(content="Suggest a rough 3-day plan for Lisbon, no flights")]
    assert choose_lane(msgs) == "planner"
    llm = get_planner_llm()
    resp = llm.invoke(
        [
            SystemMessage(content="You are Vero. Reply in 3 short bullets. No tools."),
            HumanMessage(content="3-day Lisbon outline for a couple in May."),
        ]
    )
    text = (getattr(resp, "content", None) or "").strip()
    assert len(text) > 40


def test_curator_health_reports_llm():
    from supervisor.catalog_curator.health import run_health

    report = run_health(markets=["US", "IN"])
    assert "catalogLlm" in report
    assert report["spa"]["ok"] is True
    assert report["packages"]["ok"] is True
    assert report["explore"]["ok"] is True


def main() -> int:
    results = []
    for name, fn in [
        ("catalog_status", test_catalog_llm_gemini_configured),
        ("catalog_probe", test_catalog_llm_gemini_json_probe),
        ("vero_router", test_vero_lane_router_plan_vs_tools),
        ("vero_deepseek", test_vero_deepseek_planner_invoke),
        ("curator_health", test_curator_health_reports_llm),
    ]:
        try:
            fn()
            results.append({"test": name, "ok": True})
            print(f"PASS {name}")
        except Skip as e:
            results.append({"test": name, "ok": True, "skipped": str(e)})
            print(f"SKIP {name}: {e}")
        except Exception as e:
            err = str(e) or repr(e)
            results.append({"test": name, "ok": False, "error": err[:400]})
            print(f"FAIL {name}: {err}")
    ok = all(r["ok"] for r in results)
    print(json.dumps({"ok": ok, "results": results}, indent=2))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
