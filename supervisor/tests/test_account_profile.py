"""Account travellers + prefs sanitization (no live DB)."""


def test_sanitize_traveller_requires_a_name():
    from supervisor.account_profile import sanitize_traveller, sanitize_travellers

    assert sanitize_traveller({"firstName": "", "lastName": ""}) is None
    one = sanitize_traveller(
        {
            "id": "pax_1",
            "first_name": "Asha",
            "last_name": "Rao",
            "gender": "f",
            "passenger_type": "1",
            "document_number": "A12345678901234567890XXXX",
        }
    )
    assert one["firstName"] == "Asha"
    assert one["lastName"] == "Rao"
    assert one["gender"] == "F"
    assert one["passengerType"] == 1
    assert len(one["documentNumber"]) <= 20
    many = sanitize_travellers([{ **one, "id": f"pax_{i}" } for i in range(12)])
    assert len(many) == 8


def test_sanitize_prefs_and_contact():
    from supervisor.account_profile import sanitize_contact, sanitize_prefs

    prefs = sanitize_prefs(
        {
            "homeAirport": "bom1",
            "homeCity": "Mumbai" * 20,
            "priceAlerts": 0,
            "gstin": "27abcde1234f1z5extra",
            "invoiceEmail": "not-an-email",
        }
    )
    assert prefs["homeAirport"] == ""
    assert len(prefs["homeCity"]) <= 40
    assert prefs["priceAlerts"] is False
    assert len(prefs["gstin"]) == 15
    assert prefs["invoiceEmail"] == ""

    ok = sanitize_prefs({"homeAirport": "BOM", "invoiceEmail": "a@b.co"})
    assert ok["homeAirport"] == "BOM"
    assert ok["invoiceEmail"] == "a@b.co"

    contact = sanitize_contact({"email": "A@B.CO", "phone": "+91 98765 43210 extra"})
    assert contact["email"] == "a@b.co"
    assert contact["phone"] == "9876543210"


def test_get_state_without_user_or_db():
    from supervisor.account_profile import get_state, put_state

    missing = get_state("")
    assert missing["ok"] is False
    empty_db = get_state("user_x")
    # Sandbox without DATABASE_URL returns db_unset rather than crashing.
    assert empty_db["ok"] is False
    assert empty_db.get("error") in ("db_unset", "read_failed")
    wrote = put_state("user_x", travellers=[{"firstName": "Asha", "lastName": "Rao"}])
    assert wrote["ok"] is False
    assert wrote.get("travellers")[0]["firstName"] == "Asha"
    assert wrote.get("saved") == []


def test_sanitize_and_merge_saved():
    from supervisor.account_profile import merge_saved, sanitize_saved

    dirty = sanitize_saved(
        [
            {
                "id": "hotel:1",
                "type": "hotel",
                "title": "Taj",
                "url": "https://evil.example/phish",
                "image": "javascript:alert(1)",
                "savedAt": "2026-08-01T00:00:00Z",
            },
            {"id": "", "title": "skip"},
            {"title": "no id"},
            {
                "id": "pkg:goa",
                "type": "weird",
                "title": "Goa",
                "url": "/packages/goa",
                "savedAt": "2026-08-02T00:00:00Z",
            },
        ]
    )
    assert len(dirty) == 2
    assert dirty[0]["url"] == "/"
    assert dirty[0]["image"] == ""
    assert dirty[1]["type"] == "idea"
    assert dirty[1]["url"] == "/packages/goa"

    merged = merge_saved(
        [{"id": "hotel:1", "title": "Old", "url": "/hotel/1", "savedAt": "2026-01-01T00:00:00Z"}],
        [{"id": "hotel:1", "title": "New", "url": "/hotel/1", "savedAt": "2026-08-01T00:00:00Z"}],
    )
    assert len(merged) == 1
    assert merged[0]["title"] == "New"

    from supervisor.account_profile import put_state

    wrote = put_state(
        "user_x",
        saved=[{"id": "explore:bali", "type": "destination", "title": "Bali", "url": "/explore/bali"}],
    )
    assert wrote["ok"] is False
    assert wrote["saved"][0]["id"] == "explore:bali"
