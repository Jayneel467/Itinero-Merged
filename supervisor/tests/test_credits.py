"""Vero credits: free daily pool + prepaid wallet (no monthly Plus)."""

from __future__ import annotations


def test_free_daily_default():
    from supervisor.credits import allowance_for_plan, reset_for_tests

    reset_for_tests()
    assert allowance_for_plan("free") == 25
    assert allowance_for_plan("plus") == 25  # packs replaced Plus pools


def test_lane_costs_tools_cost_more():
    from supervisor.credits import cost_for_lane, lane_from_specialist

    assert cost_for_lane("planner") == 1
    assert cost_for_lane("synth") == 1
    assert cost_for_lane("tools") == 4
    assert lane_from_specialist("flights", has_live_cards=False) == "tools"
    assert lane_from_specialist("supervisor") == "planner"


def test_consume_then_exhaust(monkeypatch):
    from supervisor import credits as c

    c.reset_for_tests()
    monkeypatch.setattr(c, "free_daily_credits", lambda: 5)
    subj = "device:test-dev-1"
    snap = c.peek(subj, plan="free")
    assert snap["remaining"] == 5
    c.consume(subj, lane="planner", plan="free")
    snap = c.peek(subj, plan="free")
    assert snap["used"] == 1
    assert snap["remaining"] == 4
    c.consume(subj, lane="tools", plan="free")
    snap = c.peek(subj, plan="free")
    assert snap["used"] == 5
    assert snap["exhausted"] is True
    again = c.consume(subj, lane="planner", plan="free")
    assert again["spent"] == 0
    assert again["remaining"] == 0


def test_wallet_extends_beyond_daily(monkeypatch):
    from supervisor import credits as c
    from supervisor.credit_packs import wallet_credit

    c.reset_for_tests()
    monkeypatch.setattr(c, "free_daily_credits", lambda: 4)
    free = c.consume("user:u1", lane="tools", plan="free")
    assert free["allowance"] == 4
    assert free["dailyRemaining"] == 0
    wallet_credit("user:u1", 8)
    snap = c.peek("user:u1")
    assert snap["walletBalance"] == 8
    assert snap["remaining"] == 8


def test_plan_for_user_is_cached(monkeypatch):
    from supervisor import credits as c

    c.reset_for_tests()
    calls = {"n": 0}

    def fake_snap(uid):
        calls["n"] += 1
        return {"plan": "plus" if uid == "u-plus" else "free"}

    monkeypatch.setattr("supervisor.billing.snapshot_for_user", fake_snap)
    assert c.plan_for_user("u-plus") == "plus"
    assert c.plan_for_user("u-plus") == "plus"
    assert calls["n"] == 1
    c.invalidate_plan_cache("u-plus")
    assert c.plan_for_user("u-plus") == "plus"
    assert calls["n"] == 2


def test_exhausted_reply_mentions_pack():
    from supervisor.credits import exhausted_reply

    msg = exhausted_reply(plan="free", reset_at="2026-08-14T00:00:00Z")
    assert "pack" in msg.lower()
    assert "refresh" in msg.lower() or "reset" in msg.lower()


def test_entitlements_include_daily_credits():
    from supervisor.billing import entitlements_for_plan

    free = entitlements_for_plan("free")
    plus = entitlements_for_plan("plus")
    assert free["veroFree"] is True
    assert plus["veroFree"] is True
    assert free["dailyCredits"] == 25
    assert plus["dailyCredits"] == 25
    assert free["creditCosts"]["tools"] == 4


def test_catalog_mentions_credits():
    from supervisor.billing import catalog

    cat = catalog(currency="INR")
    assert cat["veroFree"] is True
    blob = " ".join(
        cat["plans"][0]["features"]
        + cat["plans"][1]["features"]
        + [cat["copy"], cat["headline"]]
    )
    assert "credit" in blob.lower()
    assert cat["model"] == "credit_packs"
