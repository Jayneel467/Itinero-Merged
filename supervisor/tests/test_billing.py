"""Vero credits: free daily pool + prepaid packs (no monthly Plus)."""

from __future__ import annotations

import hashlib
import hmac
import time


def test_vero_always_free_and_packs_catalog():
    from supervisor.billing import catalog, entitlements_for_plan

    cat = catalog(currency="INR")
    assert cat["veroFree"] is True
    assert cat["model"] == "credit_packs"
    assert cat["plans"][0]["id"] == "free"
    packs = [p for p in cat["plans"] if p["id"] != "free"]
    assert len(packs) >= 3
    assert any(p["id"] == "traveler" for p in packs)
    assert "Claude" not in (cat.get("copy") or "")
    free = entitlements_for_plan("free")
    assert free["veroFree"] is True
    assert free["dailyCredits"] == 25
    assert free["plan"] == "credits"


def test_pack_margins_in_target_band():
    from supervisor.credit_packs import COST_PER_CREDIT_USD, enrich_pack, pack_by_id

    for pid in ("starter", "traveler", "explorer", "pro"):
        packed = enrich_pack(pack_by_id(pid), "INR")
        margin = packed["economics"]["estMargin"]
        assert margin is not None
        # Allow a little headroom above 30% on small packs (Stripe fee rounding).
        assert margin >= 0.18, f"{pid} margin {margin} too low vs cost {COST_PER_CREDIT_USD}"
        assert margin <= 0.55, f"{pid} margin {margin} unexpectedly high"


def test_inr_packs_clear_stripe_fifty_cent_floor():
    """USD Stripe accounts reject Checkout under $0.50 after FX conversion."""
    from supervisor.credit_packs import INR_PER_USD, _packs_raw

    for pack in _packs_raw():
        converted_usd = (pack["inr_minor"] / 100.0) / INR_PER_USD
        assert converted_usd >= 0.50, (
            f"{pack['id']} ₹{pack['inr_minor']/100:.0f} converts to ${converted_usd:.2f} "
            "(Stripe minimum is $0.50)"
        )
        if "usd_minor" in pack:
            assert pack["usd_minor"] >= 50


def test_usd_catalog_hides_starter_and_gives_more_credits():
    from supervisor.billing import catalog
    from supervisor.credit_packs import pack_by_id

    usd = catalog(currency="USD")
    ids = [p["id"] for p in usd["packs"]]
    assert "starter" not in ids
    assert usd["market"] == "international"
    traveler = next(p for p in usd["packs"] if p["id"] == "traveler")
    explorer = next(p for p in usd["packs"] if p["id"] == "explorer")
    pro = next(p for p in usd["packs"] if p["id"] == "pro")
    assert traveler["credits"] == 2000
    assert explorer["credits"] == 8000
    assert pro["credits"] == 25000
    assert traveler["credits"] > pack_by_id("traveler")["credits"]
    assert traveler["price"]["amount"] >= 12
    assert "India Starter" in (usd.get("copy") or "")

    inr = catalog(currency="INR")
    assert any(p["id"] == "starter" for p in inr["packs"])
    assert next(p for p in inr["packs"] if p["id"] == "starter")["credits"] == 200


def test_usd_checkout_rejects_starter(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="starter",
        currency="USD",
    )
    assert out["ok"] is False
    assert out["error"] == "pack_market"


def test_usd_checkout_grants_international_credits(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    monkeypatch.setattr(billing, "get_subscription", lambda uid: None)
    monkeypatch.setattr(billing, "_prune_duplicate_subscriptions", lambda **kwargs: None)
    monkeypatch.setattr(billing, "_current_pack_from_stripe", lambda *a, **k: None)
    monkeypatch.setattr(billing, "_ensure_customer", lambda **kwargs: {"ok": True, "id": "cus_test"})
    captured = {}

    def fake_post(path, data):
        captured["data"] = data
        return {"ok": True, "id": "cs_usd", "url": "https://checkout.stripe.com/c/pay/cs_usd"}

    monkeypatch.setattr(billing, "_stripe_post", fake_post)
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="traveler",
        currency="EUR",
    )
    assert out["ok"] is True
    assert out["credits"] == 2000
    data = captured["data"]
    assert data["line_items[0][price_data][currency]"] == "usd"
    assert data["line_items[0][price_data][unit_amount]"] == "1299"
    assert data["metadata[itinero_credits]"] == "2000"
    assert data["subscription_data[metadata][itinero_credits]"] == "2000"


def test_public_catalog_hides_margin():
    import json
    from supervisor.billing import catalog

    blob = json.dumps(catalog(currency="INR")).lower()
    assert "margin" not in blob
    assert "deepseek" not in blob
    assert "0.0015" not in blob
    assert "or plus" not in blob
    assert "cancel anytime" not in blob
    expl = catalog(currency="INR").get("creditExplainer") or {}
    assert "marginNote" not in expl


def test_wallet_consume_after_daily():
    from supervisor.credits import consume, reset_for_tests, snapshot, free_daily_credits
    from supervisor.credit_packs import wallet_credit

    reset_for_tests()
    subject = "user:test-wallet"
    daily = free_daily_credits()
    # Burn daily pool
    for _ in range(daily):
        consume(subject, lane="planner")
    snap = snapshot(subject)
    assert snap["dailyRemaining"] == 0
    assert snap["remaining"] == 0
    wallet_credit(subject, 10)
    snap = snapshot(subject)
    assert snap["walletBalance"] == 10
    assert snap["remaining"] == 10
    out = consume(subject, lane="tools")  # costs 4
    assert out["spentWallet"] == 4
    assert snapshot(subject)["walletBalance"] == 6


def test_stripe_signature_roundtrip():
    from supervisor.billing import verify_stripe_signature

    secret = "whsec_test"
    payload = b'{"id":"evt_1","type":"ping"}'
    ts = str(int(time.time()))
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    assert verify_stripe_signature(payload, f"t={ts},v1={sig}", secret)
    assert not verify_stripe_signature(payload, f"t={ts},v1=deadbeef", secret)
    assert not verify_stripe_signature(payload, None, secret)


def test_guest_snapshot_is_free_vero():
    from supervisor.billing import snapshot_for_user

    snap = snapshot_for_user(None)
    assert snap["veroFree"] is True


def test_site_url_includes_itinero_base(monkeypatch):
    from supervisor import billing

    monkeypatch.delenv("PUBLIC_SITE_URL", raising=False)
    monkeypatch.delenv("ITINERO_PUBLIC_SITE_URL", raising=False)
    monkeypatch.delenv("ITINERO_APP_BASE", raising=False)
    assert billing._site_url() == "http://127.0.0.1:5173/itinero"
    monkeypatch.setenv("PUBLIC_SITE_URL", "https://itinero.company/itinero")
    assert billing._site_url() == "https://itinero.company/itinero"
    monkeypatch.setenv("PUBLIC_SITE_URL", "https://itinero.company")
    assert billing._frontend_url("plus") == "https://itinero.company/itinero/plus"


def test_checkout_defaults_to_monthly_autocard(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    monkeypatch.setattr(billing, "get_subscription", lambda uid: None)
    monkeypatch.setattr(billing, "_prune_duplicate_subscriptions", lambda **kwargs: None)
    monkeypatch.setattr(billing, "_current_pack_from_stripe", lambda *a, **k: None)
    monkeypatch.setattr(
        billing,
        "_ensure_customer",
        lambda **kwargs: {"ok": True, "id": "cus_test"},
    )
    captured = {}

    def fake_post(path, data):
        captured["path"] = path
        captured["data"] = data
        return {"ok": True, "id": "cs_test", "url": "https://checkout.stripe.com/c/pay/cs_test"}

    monkeypatch.setattr(billing, "_stripe_post", fake_post)
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="traveler",
        currency="INR",
    )
    assert out["ok"] is True
    assert out["mode"] == "subscription"
    data = captured["data"]
    assert data["mode"] == "subscription"
    assert data["saved_payment_method_options[payment_method_save]"] == "enabled"
    assert data["payment_method_collection"] == "always"
    assert data["line_items[0][price_data][recurring][interval]"] == "month"
    assert data["subscription_data[metadata][itinero_pack_id]"] == "traveler"
    assert data["subscription_data[metadata][itinero_credits]"] == "500"
    assert data["success_url"].startswith("http://127.0.0.1:5173/itinero/plus?")
    assert "{CHECKOUT_SESSION_ID}" in data["success_url"]
    assert data["cancel_url"] == "http://127.0.0.1:5173/itinero/plus?checkout=cancel"


def test_checkout_once_saves_card_off_session(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    monkeypatch.setattr(billing, "get_subscription", lambda uid: None)
    monkeypatch.setattr(billing, "_prune_duplicate_subscriptions", lambda **kwargs: None)
    monkeypatch.setattr(billing, "_current_pack_from_stripe", lambda *a, **k: None)
    monkeypatch.setattr(
        billing,
        "_ensure_customer",
        lambda **kwargs: {"ok": True, "id": "cus_test"},
    )
    captured = {}

    def fake_post(path, data):
        captured["data"] = data
        return {"ok": True, "id": "cs_once", "url": "https://checkout.stripe.com/c/pay/cs_once"}

    monkeypatch.setattr(billing, "_stripe_post", fake_post)
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="starter",
        interval="once",
        currency="INR",
    )
    assert out["ok"] is True
    assert out["mode"] == "payment"
    data = captured["data"]
    assert data["mode"] == "payment"
    assert data["payment_intent_data[setup_future_usage]"] == "off_session"
    assert data["saved_payment_method_options[payment_method_save]"] == "enabled"
    assert "line_items[0][price_data][recurring][interval]" not in data


def test_stripe_test_key_is_ready(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    ready = billing.stripe_ready()
    assert ready["ok"] is True
    assert ready["mode"] == "test"


def test_pack_rank_order():
    from supervisor.credit_packs import pack_rank

    assert pack_rank(None) == 0
    assert pack_rank("starter") < pack_rank("traveler") < pack_rank("explorer") < pack_rank("pro")


def _active_starter():
    return {
        "plan": "starter",
        "status": "active",
        "stripeCustomerId": "cus_test",
        "stripeSubscriptionId": "sub_1",
    }


def test_checkout_blocks_same_pack(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    monkeypatch.setattr(billing, "get_subscription", lambda uid: _active_starter())
    monkeypatch.setattr(billing, "_prune_duplicate_subscriptions", lambda **kwargs: "sub_1")
    monkeypatch.setattr(billing, "_current_pack_from_stripe", lambda *a, **k: None)
    monkeypatch.setattr(billing, "_ensure_customer", lambda **kwargs: {"ok": True, "id": "cus_test"})

    def boom(*_a, **_k):
        raise AssertionError("must not open a second Stripe checkout")

    monkeypatch.setattr(billing, "_stripe_post", boom)
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="starter",
        currency="INR",
    )
    assert out["ok"] is False
    assert out["error"] == "pack_active"
    assert out["activePackId"] == "starter"
    assert "already have Starter" in out["message"]


def test_checkout_blocks_downgrade(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    monkeypatch.setattr(
        billing,
        "get_subscription",
        lambda uid: {**_active_starter(), "plan": "traveler"},
    )
    monkeypatch.setattr(billing, "_prune_duplicate_subscriptions", lambda **kwargs: "sub_1")
    monkeypatch.setattr(billing, "_current_pack_from_stripe", lambda *a, **k: None)
    monkeypatch.setattr(billing, "_ensure_customer", lambda **kwargs: {"ok": True, "id": "cus_test"})
    monkeypatch.setattr(billing, "_stripe_post", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no checkout")))
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="starter",
        currency="INR",
    )
    assert out["ok"] is False
    assert out["error"] == "pack_downgrade"


def test_checkout_upgrade_updates_existing_sub(monkeypatch):
    from supervisor import billing

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_abc")
    monkeypatch.delenv("STRIPE_LIVE", raising=False)
    monkeypatch.setattr(billing, "get_subscription", lambda uid: _active_starter())
    monkeypatch.setattr(billing, "_prune_duplicate_subscriptions", lambda **kwargs: "sub_1")
    monkeypatch.setattr(billing, "_current_pack_from_stripe", lambda *a, **k: None)
    monkeypatch.setattr(billing, "_ensure_customer", lambda **kwargs: {"ok": True, "id": "cus_test"})
    monkeypatch.setattr(billing, "_activate_credit_subscription", lambda **kwargs: None)
    monkeypatch.setattr(
        "supervisor.credit_packs.record_purchase",
        lambda **kwargs: {"ok": True, "credits": kwargs["credits"]},
    )

    def fake_get(path, params=None):
        assert path == "subscriptions/sub_1"
        return {"ok": True, "id": "sub_1", "items": {"data": [{"id": "si_1"}]}, "status": "active"}

    captured = {}

    def fake_post(path, data):
        captured["path"] = path
        captured["data"] = data
        return {
            "ok": True,
            "id": "sub_1",
            "customer": "cus_test",
            "latest_invoice": "in_upg",
            "metadata": {"itinero_pack_id": "traveler"},
        }

    monkeypatch.setattr(billing, "_stripe_get", fake_get)
    monkeypatch.setattr(billing, "_stripe_post", fake_post)
    out = billing.create_checkout_session(
        user_id="u1",
        email="a@b.com",
        name="A",
        pack_id="traveler",
        currency="INR",
    )
    assert out["ok"] is True
    assert out["upgraded"] is True
    assert out["packId"] == "traveler"
    assert out["credits"] == 300
    assert captured["path"] == "subscriptions/sub_1"
    assert captured["data"]["metadata[itinero_pack_id]"] == "traveler"
    assert "checkout/sessions" not in captured["path"]


def test_prune_cancels_duplicate_stripe_subs(monkeypatch):
    from supervisor import billing

    deleted = []
    monkeypatch.setattr(
        billing,
        "_list_stripe_subscriptions",
        lambda cid: [{"id": "sub_keep"}, {"id": "sub_extra"}, {"id": "sub_extra2"}],
    )
    monkeypatch.setattr(
        billing,
        "_stripe_delete",
        lambda path: deleted.append(path) or {"ok": True},
    )
    keep = billing._prune_duplicate_subscriptions(customer_id="cus_x", keep_id="sub_keep")
    assert keep == "sub_keep"
    assert deleted == ["subscriptions/sub_extra", "subscriptions/sub_extra2"]


def test_upgrade_invoice_does_not_double_credit(monkeypatch):
    from supervisor import billing

    monkeypatch.setattr(billing, "configured", lambda: False)
    called = {"n": 0}

    def boom(**_k):
        called["n"] += 1
        raise AssertionError("upgrade invoices must not grant a full pack")

    monkeypatch.setattr(billing, "_fulfill_subscription_invoice", boom)
    out = billing.handle_stripe_event(
        {
            "type": "invoice.paid",
            "data": {
                "object": {
                    "id": "in_upg",
                    "billing_reason": "subscription_update",
                    "subscription": "sub_1",
                    "metadata": {"itinero_pack_id": "traveler", "itinero_user_id": "u1"},
                }
            },
        }
    )
    assert out.get("skipped") is True
    assert called["n"] == 0
