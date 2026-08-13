"""LiteAPI (Nuitee Connect) webhook receiver — booking lifecycle sync."""

from __future__ import annotations

import hmac
import json
import os
import traceback
from typing import Any

from supervisor.db import configured, connection
from supervisor.payment_guards import is_production, liteapi_webhook_secret_configured


def _secret() -> str:
    return (os.getenv("LITEAPI_WEBHOOK_SECRET") or os.getenv("LITEAPI_WEBHOOK_TOKEN") or "").strip()


def verify_auth_header(authorization: str | None) -> bool:
    """Validate PBO Authorization header.

    Production requires LITEAPI_WEBHOOK_SECRET — open webhooks are rejected.
    Sandbox/dev may run without a secret (local testing only).
    """
    secret = _secret()
    if not secret:
        return not is_production()
    got = (authorization or "").strip()
    if not got:
        return False
    if got == secret:
        return True
    if got.lower().startswith("bearer ") and got[7:].strip() == secret:
        return True
    try:
        return hmac.compare_digest(got, secret)
    except (TypeError, ValueError):
        return False


def _parse_json_field(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _store_event(event_id: str, event_name: str, payload: dict[str, Any]) -> bool:
    """Returns True if new event (should process), False if duplicate."""
    if not configured() or not event_id:
        return True
    with connection() as conn:
        exists = conn.execute(
            "SELECT 1 FROM liteapi_webhook_events WHERE event_id = %s",
            (event_id,),
        ).fetchone()
        if exists:
            return False
        conn.execute(
            """
            INSERT INTO liteapi_webhook_events (event_id, event_name, payload)
            VALUES (%s, %s, %s::jsonb)
            """,
            (event_id, event_name, json.dumps(payload, default=str)),
        )
        conn.commit()
    return True


def _booking_id_from(resp: dict[str, Any], req: dict[str, Any] | None = None) -> str:
    req = req or {}
    booking = resp.get("booking") if isinstance(resp.get("booking"), dict) else {}
    return str(
        resp.get("bookingId")
        or resp.get("booking_id")
        or booking.get("bookingId")
        or booking.get("id")
        or req.get("bookingId")
        or req.get("booking_id")
        or ""
    ).strip()


def _normalize_event_name(name: str) -> str:
    return (name or "").strip().lower().replace("_", ".")


async def process_liteapi_webhook(body: dict[str, Any]) -> dict[str, Any]:
    event_id = str(body.get("event_id") or body.get("eventId") or "").strip()
    event_name = str(body.get("event_name") or body.get("eventName") or "").strip()
    sandbox = bool(body.get("sandbox"))
    norm = _normalize_event_name(event_name)

    if not event_id:
        return {"ok": False, "error": "missing_event_id"}

    if not _store_event(event_id, event_name, body):
        return {"ok": True, "duplicate": True, "eventId": event_id}

    req = _parse_json_field(body.get("request"))
    resp = _parse_json_field(body.get("response"))

    handled = None
    try:
        if norm in {
            "booking.book",
            "hotel.book",
            "flight.book",
            "booking.confirmed",
        }:
            kind = "flight_webhook" if "flight" in norm else "hotel_webhook"
            await _on_booking_confirmed(req, resp, sandbox=sandbox, booking_kind=kind)
            handled = "book"
        elif norm in {
            "booking.cancel",
            "hotel.cancel",
            "flight.cancel",
            "booking.cancelled",
        } or norm.endswith(".cancel"):
            await _on_booking_cancelled(resp, req)
            handled = "cancel"
        elif "hotelconfirmationnumber" in norm.replace(".", "") or "confirmationnumber" in norm:
            _on_hotel_confirmation_number(resp)
            handled = "hotel_confirmation"
    except Exception:
        traceback.print_exc()
        return {
            "ok": False,
            "eventId": event_id,
            "eventName": event_name,
            "error": "handler_failed",
            "webhookSecretConfigured": liteapi_webhook_secret_configured(),
        }

    return {
        "ok": True,
        "eventId": event_id,
        "eventName": event_name,
        "handled": handled,
        "sandbox": sandbox,
    }


async def _on_booking_confirmed(
    req: dict[str, Any],
    resp: dict[str, Any],
    *,
    sandbox: bool,
    booking_kind: str = "hotel_webhook",
) -> None:
    booking_id = _booking_id_from(resp, req)
    if not booking_id:
        return

    holder = resp.get("holder") if isinstance(resp.get("holder"), dict) else {}
    guest_email = holder.get("email") or req.get("email")
    amount = resp.get("price") or resp.get("total") or resp.get("amount")
    currency = resp.get("currency") or "INR"
    check_out = (
        resp.get("checkOut")
        or resp.get("check_out")
        or (resp.get("stay") or {}).get("checkOut")
    )

    from supervisor.loyalty_ledger import loyalty_on_booking_confirmed

    await loyalty_on_booking_confirmed(
        user_id=None,
        guest_email=str(guest_email) if guest_email else None,
        booking_id=booking_id,
        booking_kind=booking_kind,
        amount=float(amount) if amount is not None else None,
        currency=str(currency),
        check_out_date=str(check_out)[:10] if check_out else None,
    )


async def _on_booking_cancelled(resp: dict[str, Any], req: dict[str, Any] | None = None) -> None:
    booking_id = _booking_id_from(resp, req)
    if not booking_id:
        return

    from supervisor.loyalty_ledger import loyalty_on_booking_cancelled

    await loyalty_on_booking_cancelled(
        booking_id=booking_id,
        reason="liteapi_webhook_cancel",
    )


def _on_hotel_confirmation_number(resp: dict[str, Any]) -> None:
    # Stored via webhook log; confirmation page can poll booking retrieve.
    _ = resp
