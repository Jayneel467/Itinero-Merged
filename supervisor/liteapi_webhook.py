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
    await _maybe_send_itinero_mail(
        booking_id=booking_id,
        kind="confirm",
        booking_kind=booking_kind,
        email=str(guest_email) if guest_email else None,
        details={
            "booking_ref": booking_id,
            "booking_id": booking_id,
            "status": resp.get("status") or "confirmed",
            "hotel_name": resp.get("hotelName") or resp.get("hotel_name"),
            "check_in": resp.get("checkin") or resp.get("checkIn"),
            "check_out": check_out,
            "amount": amount,
            "currency": currency,
        },
    )


async def _on_booking_cancelled(resp: dict[str, Any], req: dict[str, Any] | None = None) -> None:
    booking_id = _booking_id_from(resp, req)
    if not booking_id:
        return

    from supervisor.loyalty_ledger import loyalty_on_booking_cancelled

    loyalty = await loyalty_on_booking_cancelled(
        booking_id=booking_id,
        reason="liteapi_webhook_cancel",
    )
    holder = resp.get("holder") if isinstance(resp.get("holder"), dict) else {}
    guest_email = holder.get("email") or (req or {}).get("email")
    await _maybe_send_itinero_mail(
        booking_id=booking_id,
        kind="cancel",
        booking_kind="hotel" if "hotel" in str(resp.get("status") or "") else "booking",
        email=str(guest_email) if guest_email else None,
        details={
            "booking_ref": booking_id,
            "booking_id": booking_id,
            "status": "cancelled",
            "title": resp.get("hotelName") or resp.get("hotel_name") or booking_id,
            "loyalty_reversed": bool(loyalty) if loyalty is not False else True,
        },
    )


def _on_hotel_confirmation_number(resp: dict[str, Any]) -> None:
    # Stored via webhook log; confirmation page can poll booking retrieve.
    _ = resp


def _mail_flag_key(kind: str) -> str:
    return "itinero_cancel_email_sent" if kind == "cancel" else "itinero_confirm_email_sent"


def _booking_payload(booking_id: str) -> dict[str, Any]:
    if not configured():
        return {}
    try:
        with connection() as conn:
            row = conn.execute(
                """
                SELECT payload FROM bookings
                WHERE supplier_booking_id = %s
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1
                """,
                (booking_id,),
            ).fetchone()
        payload = row[0] if row else {}
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _mark_mail_sent(booking_id: str, kind: str) -> None:
    if not configured():
        return
    key = _mail_flag_key(kind)
    try:
        with connection() as conn:
            conn.execute(
                """
                UPDATE bookings
                SET payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(%s, now()::text),
                    updated_at = now()
                WHERE supplier_booking_id = %s
                """,
                (key, booking_id),
            )
            conn.commit()
    except Exception:
        traceback.print_exc()


async def _maybe_send_itinero_mail(
    *,
    booking_id: str,
    kind: str,
    booking_kind: str,
    email: str | None,
    details: dict[str, Any],
) -> None:
    """Itinero SMTP only. Skip if checkout already mailed this booking."""
    payload = _booking_payload(booking_id)
    if payload.get(_mail_flag_key(kind)) or payload.get("confirmation_email_sent"):
        return
    mail = (email or "").strip()
    if not mail or "@" not in mail:
        try:
            from supervisor.booking_access import ledger_guest_email

            mail = ledger_guest_email(booking_id) or ""
        except Exception:
            mail = ""
    if not mail or "@" not in mail:
        return
    try:
        from supervisor.email_service import send_booking_cancellation, send_booking_confirmation

        if kind == "cancel":
            out = await send_booking_cancellation(kind=booking_kind, to_email=mail, details=details)
        else:
            out = await send_booking_confirmation(
                kind="hotel" if "hotel" in str(booking_kind or "") else "flight",
                to_email=mail,
                details=details,
            )
        if out.get("ok"):
            _mark_mail_sent(booking_id, kind)
    except Exception:
        traceback.print_exc()
