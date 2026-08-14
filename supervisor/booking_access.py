"""Hotel/flight booking ownership — IDOR + cancel guards.

Proof of ownership (any one):
  - ITINERO_ADMIN_SECRET
  - X-Itinero-Device matches ledger device_id
  - guest email matches ledger payload / loyalty row

Production: unknown ownership is DENIED (no silent allow).
Sandbox/dev without a ledger row: allow so live smoke still works.
"""

from __future__ import annotations

import os
import re
from typing import Any

from fastapi import HTTPException, Request


def is_production() -> bool:
    return (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "").lower() in {
        "production",
        "prod",
    }


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


_EMAIL_KEYS = ("guest_email", "email", "contact_email")


def _email_from_obj(obj: Any) -> str:
    if not isinstance(obj, dict):
        return ""
    for key in _EMAIL_KEYS:
        got = normalize_email(obj.get(key) if isinstance(obj.get(key), str) else None)
        if got and "@" in got:
            return got
    for nested_key in ("holder", "guest", "contact", "traveler"):
        nested = obj.get(nested_key)
        if isinstance(nested, dict):
            got = _email_from_obj(nested)
            if got:
                return got
    return ""


def ledger_guest_email(supplier_booking_id: str) -> str | None:
    """Best-effort guest email from bookings.payload or loyalty events."""
    bid = (supplier_booking_id or "").strip()
    if not bid:
        return None
    try:
        from supervisor.db import configured, connection
    except Exception:
        return None
    if not configured():
        return None
    try:
        with connection() as conn:
            row = conn.execute(
                """
                SELECT payload FROM bookings
                WHERE supplier_booking_id = %s
                ORDER BY updated_at DESC NULLS LAST
                LIMIT 1
                """,
                (bid,),
            ).fetchone()
            if row:
                got = _email_from_obj(row[0] if isinstance(row[0], dict) else {})
                if got:
                    return got
            loy = conn.execute(
                """
                SELECT guest_email FROM loyalty_point_events
                WHERE booking_id = %s AND guest_email IS NOT NULL
                ORDER BY created_at DESC NULLS LAST
                LIMIT 1
                """,
                (bid,),
            ).fetchone()
            if loy:
                got = normalize_email(loy[0] if isinstance(loy[0], str) else None)
                if got and "@" in got:
                    return got
    except Exception:
        return None
    return None


def email_matches_booking(supplier_booking_id: str, email: str | None) -> bool:
    want = normalize_email(email)
    if not want or "@" not in want:
        return False
    stored = ledger_guest_email(supplier_booking_id)
    return bool(stored and stored == want)


def _user_id_from_request(request: Request | None) -> str | None:
    if request is None:
        return None
    auth = (request.headers.get("authorization") or "").strip()
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip() or None
    if not token:
        return None
    try:
        from supervisor.auth import user_from_token

        user = user_from_token(token)
    except Exception:
        return None
    if not user or not user.get("id"):
        return None
    return str(user["id"])


def require_booking_access(
    *,
    booking_id: str,
    device_id: str | None,
    email: str | None = None,
    user_id: str | None = None,
    admin_ok: bool = False,
    production: bool | None = None,
) -> None:
    """Raise 403 unless caller can prove ownership. Never leak whether the id exists."""
    bid = (booking_id or "").strip()
    if not bid:
        raise HTTPException(status_code=400, detail="Missing booking id.")
    if admin_ok:
        return

    from supervisor.ledger import booking_owned_by_device, booking_owned_by_user

    owned = booking_owned_by_device(bid, device_id)
    if owned is True:
        return
    if user_id and booking_owned_by_user(bid, user_id) is True:
        return
    if email_matches_booking(bid, email):
        return

    prod = is_production() if production is None else bool(production)
    deny_detail = "Not authorized for this booking. Use the checkout email or the same device."

    if owned is False:
        raise HTTPException(status_code=403, detail=deny_detail)

    # owned is None — no ledger row / no DB
    if prod:
        raise HTTPException(status_code=403, detail=deny_detail)
    # Sandbox smoke: unknown ownership allowed only when no production lock.


def require_booking_access_from_request(
    request: Request,
    booking_id: str,
    *,
    email: str | None = None,
    admin_ok: bool = False,
) -> None:
    from supervisor.db import normalize_device_id

    device_id = normalize_device_id(request.headers.get("x-itinero-device"))
    q_email = email or request.query_params.get("email")
    require_booking_access(
        booking_id=booking_id,
        device_id=device_id,
        email=q_email,
        user_id=_user_id_from_request(request),
        admin_ok=admin_ok,
    )


_TOKEN_ENV_OK = re.compile(r"^(dev|local|development|sandbox)$", re.I)


def marketing_admin_allowed(request: Request) -> bool:
    """Marketing ops endpoints — never default-open when APP_ENV=production."""
    import hmac

    expected = (
        os.getenv("MARKETING_ADMIN_TOKEN") or os.getenv("CATALOG_CURATOR_TOKEN") or ""
    ).strip()
    env = (
        os.getenv("APP_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("ITINERO_ENV")
        or os.getenv("ENV")
        or "dev"
    ).lower()
    if env in {"production", "prod"}:
        if not expected:
            return False
    elif not expected:
        return bool(_TOKEN_ENV_OK.match(env))

    got = (
        request.headers.get("x-marketing-token")
        or request.query_params.get("token")
        or ""
    ).strip()
    auth = (request.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        got = got or auth[7:].strip()
    return bool(got) and hmac.compare_digest(got, expected)
