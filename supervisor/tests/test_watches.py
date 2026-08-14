"""Price-watch drop math + claim helpers (no live LiteAPI)."""


def test_significant_drop_thresholds():
    from supervisor.watches import significant_drop

    assert significant_drop(was=10000, now=9000, currency="INR") is True  # 10%
    assert significant_drop(was=10000, now=9800, currency="INR") is False  # 2% and < ₹500
    assert significant_drop(was=20000, now=19400, currency="INR") is True  # ₹600
    assert significant_drop(was=100, now=96, currency="USD") is True  # 4%
    assert significant_drop(was=100, now=98, currency="USD") is False
    assert significant_drop(was=80, now=90, currency="INR") is False


def test_claim_device_noops_without_ids():
    from supervisor.ledger import claim_device_for_user

    out = claim_device_for_user(None, None)
    assert out.get("ok") is False
    assert out.get("claimed", 0) == 0
