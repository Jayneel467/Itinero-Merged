"""Shared helpers for supervisor API smoke tests."""

from __future__ import annotations

import httpx

PASSENGER = {
    "first_name": "Audit",
    "last_name": "Tester",
    "birthday": "1995-03-22",
    "gender": "M",
    "nationality": "IN",
    "document_type": "passport",
    "document_number": "P1234567",
    "document_expiry": "2030-12-31",
    "document_issue_country": "IN",
    "passenger_type": 0,
}

CONTACT = {
    "first_name": "Audit",
    "last_name": "Tester",
    "email": "audit.smoke@example.com",
    "phone_country_code": "91",
    "phone_number": "9812345678",
}


def assert_json(resp: httpx.Response, step: str) -> dict:
    assert resp.status_code < 500, f"{step}: server error {resp.status_code} — {resp.text[:400]}"
    data = resp.json()
    assert isinstance(data, dict), f"{step}: expected JSON object"
    return data


def first_hotel_offer(rates_data: dict) -> str | None:
    for room in rates_data.get("rooms") or rates_data.get("offers") or []:
        for offer in room.get("offers") or room.get("rates") or [room]:
            offer_id = offer.get("offerId") or offer.get("offer_id") or offer.get("id")
            if offer_id:
                return offer_id
    return None


def skip_if_payment_gated(data: dict, label: str) -> None:
    import pytest

    if data.get("ok"):
        return
    err = str(data.get("error") or "")
    msg = str(data.get("message") or "")
    if err in {"book_failed", "payment_required", "payment_not_completed"} or "payment" in msg.lower():
        pytest.skip(f"{label}: LiteAPI requires Stripe capture — {msg or err}")
