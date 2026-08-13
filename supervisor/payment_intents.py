"""Persist checkout context for orphan recovery / analytics (Stripe Payment SDK path)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from supervisor.db import configured, connection, normalize_device_id


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, default=str)


def _num(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def upsert_intent(
    *,
    prebook_id: str,
    kind: str,
    device_id: str | None = None,
    session_id: str | None = None,
    amount: Any = None,
    currency: str = "INR",
    email: str | None = None,
    payload: dict[str, Any] | None = None,
    ttl_minutes: int = 45,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset"}
    pid = (prebook_id or "").strip()
    if not pid:
        return {"ok": False, "error": "missing_prebook"}
    k = (kind or "").strip().lower()
    if k not in {"flight", "hotel", "package"}:
        return {"ok": False, "error": "invalid_kind"}

    intent_id = str(uuid.uuid4())
    exp = datetime.now(timezone.utc) + timedelta(minutes=max(10, ttl_minutes))
    did = normalize_device_id(device_id)
    mail = (email or "").strip().lower() or None

    with connection() as conn:
        conn.execute(
            """
            UPDATE payment_intents
            SET status = 'superseded', updated_at = now()
            WHERE prebook_id = %s AND status = 'pending'
            """,
            (pid,),
        )
        conn.execute(
            """
            INSERT INTO payment_intents (
              id, prebook_id, kind, device_id, session_id, amount, currency,
              email, payload, status, expires_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, 'pending', %s)
            """,
            (
                intent_id,
                pid,
                k,
                did,
                (session_id or None),
                _num(amount),
                (currency or "INR").upper(),
                mail,
                _json(payload or {}),
                exp,
            ),
        )
        conn.commit()
    return {"ok": True, "intent_id": intent_id, "prebook_id": pid}


def get_pending_by_prebook(prebook_id: str) -> dict[str, Any] | None:
    pid = (prebook_id or "").strip()
    if not pid or not configured():
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, prebook_id, kind, device_id, session_id, amount, currency,
                   email, payload, status, razorpay_payment_id
            FROM payment_intents
            WHERE prebook_id = %s AND status = 'pending'
              AND expires_at > now()
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (pid,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "prebook_id": row[1],
        "kind": row[2],
        "device_id": row[3],
        "session_id": row[4],
        "amount": float(row[5]) if row[5] is not None else None,
        "currency": row[6],
        "email": row[7],
        "payload": row[8] if isinstance(row[8], dict) else {},
        "status": row[9],
        "razorpay_payment_id": row[10],
    }


def mark_completed(
    *,
    intent_id: str | None = None,
    prebook_id: str | None = None,
    payment_id: str | None = None,
    booking_id: str | None = None,
) -> None:
    if not configured():
        return
    pay = (payment_id or "").strip() or None
    book = (booking_id or "").strip() or None
    with connection() as conn:
        if intent_id:
            conn.execute(
                """
                UPDATE payment_intents
                SET status = 'completed',
                    razorpay_payment_id = COALESCE(%s, razorpay_payment_id),
                    booking_id = COALESCE(%s, booking_id),
                    updated_at = now()
                WHERE id = %s
                """,
                (pay, book, intent_id),
            )
        elif prebook_id:
            conn.execute(
                """
                UPDATE payment_intents
                SET status = 'completed',
                    razorpay_payment_id = COALESCE(%s, razorpay_payment_id),
                    booking_id = COALESCE(%s, booking_id),
                    updated_at = now()
                WHERE prebook_id = %s AND status = 'pending'
                """,
                (pay, book, (prebook_id or "").strip()),
            )
        conn.commit()


def booking_exists_for_payment(payment_id: str) -> bool:
    pay = (payment_id or "").strip()
    if not pay or not configured():
        return False
    with connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM bookings WHERE payment_id = %s LIMIT 1",
            (pay,),
        ).fetchone()
        return bool(row)
