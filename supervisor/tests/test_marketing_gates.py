"""Marketing anti-spam + demand enroll (no SMTP / DB required for unit bits)."""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def test_caps_count_sent_only_not_queued():
    from supervisor import marketing_store as store

    src = Path(store.__file__).read_text(encoding="utf-8")
    body = src.split("def count_marketing_sends")[1].split("def marketing_send_allowed")[0]
    assert "status = 'sent'" in body or 'status = "sent"' in body
    assert "status IN ('sent', 'queued')" not in body[:800]
    assert "campaign NOT LIKE 'preview_%'" not in body
    assert "campaign NOT LIKE %s" in body


def test_send_allowed_requires_consent_when_user():
    from supervisor import marketing_store as store

    with patch.object(store, "get_user_email_row", return_value={"newsletter": False}), patch.object(
        store, "configured", return_value=True
    ):
        gate = store.marketing_send_allowed(
            user_id="u1", to_email="a@b.com", campaign="daily_digest"
        )
    assert gate["ok"] is False
    assert gate["reason"] == "no_consent"


def test_search_family_weekly_cap():
    from supervisor import marketing_store as store

    with patch.object(
        store, "get_user_email_row", return_value={"newsletter": True}
    ), patch.object(store, "get_interests", return_value={"mail_frequency": "daily"}), patch.object(
        store, "already_sent_today", return_value=False
    ), patch.object(
        store, "count_marketing_sends", side_effect=[0, 0, 1]
    ):
        # day=0, week=0, then search_family prefix count=1
        gate = store.marketing_send_allowed(
            user_id="u1", to_email="a@b.com", campaign="search_place_vrindavan"
        )
    assert gate["ok"] is False
    assert gate["reason"] == "search_family_weekly_cap"


def test_enroll_without_user_does_not_want_mail():
    from supervisor.demand_campaign import enroll_search_campaign

    with patch("supervisor.demand_campaign.find_active_package", return_value=None), patch(
        "supervisor.demand_campaign._user_has_pending_search_curate", return_value=False
    ), patch("supervisor.marketing_store.enqueue_workflow", return_value="run_1") as enq:
        out = enroll_search_campaign(None, city="Vrindavan", lead_email="lead@x.com")
    assert out.get("want_mail") is False
    assert out.get("mode") == "author_only"
    assert enq.called


def test_list_unsubscribe_header():
    from supervisor.marketing_templates import build_marketing_message

    msg = build_marketing_message(
        to="a@b.com",
        subject="Hi",
        html_body="<p>x</p>",
        plain="x",
        from_addr="Itinero <noreply@itinero.company>",
        unsub_url="https://itinero.company/api/newsletter/unsubscribe?token=abc",
    )
    assert "List-Unsubscribe" in msg
    assert "token=abc" in msg["List-Unsubscribe"]
    assert msg["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_search_mail_delay_env(monkeypatch):
    from datetime import timedelta

    monkeypatch.setenv("MARKETING_SEARCH_MAIL_DELAY_HOURS", "0")
    from supervisor.demand_campaign import search_mail_delay

    assert search_mail_delay() == timedelta(0)

    monkeypatch.setenv("MARKETING_SEARCH_MAIL_DELAY_HOURS", "4")
    assert search_mail_delay() == timedelta(hours=4)

    monkeypatch.setenv("MARKETING_SEARCH_MAIL_DELAY_HOURS", "nope")
    assert search_mail_delay() == timedelta(hours=4)


def test_mail_existing_uses_search_delay(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from supervisor.demand_campaign import enroll_search_campaign

    monkeypatch.setenv("MARKETING_SEARCH_MAIL_DELAY_HOURS", "4")
    fixed = datetime(2026, 8, 13, 12, 0, tzinfo=timezone.utc)
    captured: dict = {}

    def _enq(**kwargs):
        captured.update(kwargs)
        return "run_delay"

    with patch("supervisor.demand_campaign.find_active_package", return_value={"slug": "vri"}), patch(
        "supervisor.demand_campaign._user_has_pending_search_curate", return_value=False
    ), patch(
        "supervisor.marketing_store.marketing_send_allowed",
        return_value={"ok": True, "reason": "allowed"},
    ), patch(
        "supervisor.marketing_store.enqueue_workflow", side_effect=_enq
    ), patch(
        "supervisor.demand_campaign._now", return_value=fixed
    ):
        out = enroll_search_campaign("u1", city="Vrindavan")

    assert out.get("mode") == "mail_existing"
    assert captured.get("due_at") == fixed + timedelta(hours=4)
    assert captured.get("step") == "mail_vrindavan"


def test_process_due_runs_drain_loops_until_empty():
    import asyncio

    from supervisor import marketing_workflows as wf

    n = {"i": 0}

    def due(limit=100):
        n["i"] += 1
        if n["i"] == 1:
            return [
                {
                    "id": "r1",
                    "user_id": "u1",
                    "workflow": "search_curate",
                    "step": "mail_x",
                    "payload": {},
                }
            ]
        return []

    with patch.object(wf.store, "due_workflow_runs", side_effect=due), patch(
        "supervisor.demand_campaign.process_search_curate_run",
        new_callable=AsyncMock,
        return_value={"ok": True},
    ):
        out = asyncio.run(wf.process_due_runs(drain=True, max_loops=4))

    assert out["ok"] is True
    assert out["loops"] == 2
    assert out["processed"] == 1


def test_offline_marketing_smoke_passes():
    from supervisor.marketing_smoke import run_offline

    out = run_offline()
    assert out["ok"] is True, out


def test_india_landings_and_offer_copy_have_no_supplier():
    from supervisor.marketing_campaigns import marketing_catalog

    cat = marketing_catalog()
    slugs = {c["slug"] for c in cat["landings"]}
    assert {"goa-sun", "kerala-backwaters", "rajasthan-forts", "golden-triangle", "welcome"} <= slugs
    blob = " ".join(str(o.get("copy") or "") for o in cat["offers"]).lower()
    assert "supplier" not in blob
    assert "liteapi" not in blob
    ids = {j["id"] for j in cat["journeys"]}
    assert "signup_onboarding" in ids
    assert "price_watch" in ids
    assert "daily_digest" in ids


def test_broadcast_rejects_unknown_segment_and_template():
    import asyncio
    from supervisor.marketing_mailer import broadcast_to_segment

    with patch("supervisor.marketing_mailer.store.list_segments", return_value=[{"id": "seg_newsletter", "name": "All", "rules": {}}]):
        bad_t = asyncio.run(broadcast_to_segment(template="nukes", segment_id="seg_newsletter"))
        assert bad_t["ok"] is False
        assert bad_t["error"] == "unknown_template"
        bad_s = asyncio.run(broadcast_to_segment(template="daily_digest", segment_id="nope"))
        assert bad_s["ok"] is False
        assert bad_s["error"] == "unknown_segment"


def test_newsletter_segment_matches_zero_score():
    from supervisor.marketing_store import user_matches_segment

    with patch("supervisor.marketing_store.get_interests", return_value={"vibes": [], "home_country": "IN"}), patch(
        "supervisor.marketing_store.get_contact_score", return_value={"score": 0}
    ):
        assert user_matches_segment("u1", {"min_score": 0}) is True
        assert user_matches_segment("u1", {"min_score": 40}) is False
        assert user_matches_segment("u1", {"vibes_any": ["beach"], "home_country": "IN"}) is False


def test_lead_welcome_passes_unsub_token():
    src = (_ROOT / "supervisor" / "main.py").read_text(encoding="utf-8")
    chunk = src.split("signup_spark_html")[1].split("send_marketing")[0]
    assert "unsubscribe_token" in chunk
    assert 'unsub_token=""' not in chunk


def test_signup_spark_html_includes_unsub_token():
    from supervisor.marketing_templates import signup_spark_html

    html = signup_spark_html(
        unsub_token="lead_abc123",
        api_base="https://itinero.company",
    )
    assert "token=lead_abc123" in html


def test_unsubscribe_missing_token():
    from supervisor.marketing_store import unsubscribe_by_token

    missing = unsubscribe_by_token("")
    assert missing["ok"] is False
    assert missing.get("error") == "missing_token"


def test_lead_unsubscribed_blocks_mail():
    from supervisor import marketing_store as store

    with patch.object(store, "lead_is_unsubscribed", return_value=True):
        gate = store.marketing_send_allowed(
            user_id=None, to_email="lead@x.com", campaign="daily_digest"
        )
    assert gate["ok"] is False
    assert gate["reason"] == "lead_unsubscribed"
