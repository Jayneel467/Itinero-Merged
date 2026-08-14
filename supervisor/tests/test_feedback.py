def test_feedback_rejects_short_message():
    from supervisor.feedback import validate_feedback

    out = validate_feedback(message="too short")
    assert out["ok"] is False
    assert out["error"] == "message_too_short"


def test_feedback_accepts_valid_payload():
    from supervisor.feedback import validate_feedback

    out = validate_feedback(
        message="The flights filter hid layover airports I needed.",
        email="traveller@example.com",
        category="bug",
        rating=4,
    )
    assert out["ok"] is True
    assert out["category"] == "bug"
    assert out["rating"] == 4
    assert out["email"] == "traveller@example.com"


def test_feedback_inbox_defaults_to_company(monkeypatch):
    from supervisor.feedback import _support_inbox

    monkeypatch.delenv("FEEDBACK_TO_EMAIL", raising=False)
    monkeypatch.delenv("SUPPORT_EMAIL", raising=False)
    monkeypatch.delenv("VITE_SUPPORT_EMAIL", raising=False)
    assert _support_inbox() == "support@itinero.company"
