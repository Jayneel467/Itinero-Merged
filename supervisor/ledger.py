"""Persist trips + payment/cancel ledger to Neon. Never raise into booking APIs."""

from __future__ import annotations

import json
import traceback
import uuid
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from supervisor.db import configured, connection, normalize_device_id


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, default=str)


def _num(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _date(value: Any) -> date | None:
    if not value:
        return None
    raw = str(value)[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _ts(value: Any) -> datetime | None:
    if not value:
        return None
    raw = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def ensure_device(device_id: str | None) -> str | None:
    did = normalize_device_id(device_id)
    if not did or not configured():
        return None
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO devices (id, last_seen_at)
            VALUES (%s, now())
            ON CONFLICT (id) DO UPDATE SET last_seen_at = now()
            """,
            (did,),
        )
        conn.commit()
    return did


def _user_id_for_device(conn, device_id: str | None) -> str | None:
    did = (device_id or "").strip()
    if not did:
        return None
    try:
        row = conn.execute("SELECT user_id FROM devices WHERE id = %s", (did,)).fetchone()
    except Exception:
        return None
    if not row or not row[0]:
        return None
    uid = str(row[0]).strip()
    return uid or None


def claim_device_for_user(device_id: str | None, user_id: str | None) -> dict[str, Any]:
    """Move guest trips/bookings/watches onto the signed-in account."""
    did = ensure_device(device_id)
    uid = (user_id or "").strip()
    if not did or not uid or not configured():
        return {"ok": False, "claimed": 0}
    trips_n = bookings_n = watches_n = 0
    with connection() as conn:
        t = conn.execute(
            """
            UPDATE trips SET user_id = %s, updated_at = now()
            WHERE device_id = %s AND (user_id IS NULL OR user_id = '' OR user_id = %s)
            """,
            (uid, did, uid),
        )
        trips_n = t.rowcount or 0
        b = conn.execute(
            """
            UPDATE bookings SET user_id = %s, updated_at = now()
            WHERE device_id = %s AND (user_id IS NULL OR user_id = '' OR user_id = %s)
            """,
            (uid, did, uid),
        )
        bookings_n = b.rowcount or 0
        try:
            w = conn.execute(
                """
                UPDATE price_watches SET user_id = %s, updated_at = now()
                WHERE device_id = %s AND (user_id IS NULL OR user_id = '' OR user_id = %s)
                """,
                (uid, did, uid),
            )
            watches_n = w.rowcount or 0
        except Exception:
            watches_n = 0
        conn.commit()
    return {
        "ok": True,
        "trips": trips_n,
        "bookings": bookings_n,
        "watches": watches_n,
        "claimed": trips_n + bookings_n + watches_n,
    }


def upsert_trip(
    device_id: str | None,
    trip: dict[str, Any],
    *,
    user_id: str | None = None,
) -> dict[str, Any]:
    did = ensure_device(device_id)
    if not did:
        return {"ok": False, "error": "missing_device"}
    if not isinstance(trip, dict) or not str(trip.get("id") or "").strip():
        return {"ok": False, "error": "invalid_trip"}
    trip_id = str(trip["id"]).strip()[:80]
    status = str(trip.get("status") or "draft")[:40]
    title = (trip.get("title") or None)
    origin = (trip.get("origin") or None)
    destination = (trip.get("destination") or None)
    created = _ts(trip.get("createdAt"))
    updated = _ts(trip.get("updatedAt"))
    uid = (user_id or "").strip() or None
    with connection() as conn:
        if not uid:
            uid = _user_id_for_device(conn, did)
        conn.execute(
            """
            INSERT INTO trips (
              id, device_id, user_id, status, title, origin, destination,
              depart_date, return_date, source, payload, created_at, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, COALESCE(%s, now()), COALESCE(%s, now()))
            ON CONFLICT (id) DO UPDATE SET
              device_id = EXCLUDED.device_id,
              user_id = COALESCE(EXCLUDED.user_id, trips.user_id),
              status = EXCLUDED.status,
              title = EXCLUDED.title,
              origin = EXCLUDED.origin,
              destination = EXCLUDED.destination,
              depart_date = EXCLUDED.depart_date,
              return_date = EXCLUDED.return_date,
              source = EXCLUDED.source,
              payload = EXCLUDED.payload,
              updated_at = EXCLUDED.updated_at
            """,
            (
                trip_id,
                did,
                uid,
                status,
                title,
                origin,
                destination,
                _date(trip.get("departDate")),
                _date(trip.get("returnDate")),
                (trip.get("source") or None),
                _json(trip),
                created,
                updated,
            ),
        )
        conn.commit()
    return {"ok": True, "id": trip_id}


def list_trips(device_id: str | None, user_id: str | None = None) -> list[dict[str, Any]]:
    did = normalize_device_id(device_id)
    if did:
        ensure_device(did)
    uid = (user_id or "").strip() or None
    if not did and not uid:
        return []
    clauses: list[str] = []
    params: list[str] = []
    if uid:
        clauses.append("user_id = %s")
        params.append(uid)
    if did:
        clauses.append("device_id = %s")
        params.append(did)
    with connection() as conn:
        rows = conn.execute(
            f"""
            SELECT payload
            FROM trips
            WHERE {' OR '.join(clauses)}
            ORDER BY updated_at DESC
            LIMIT 80
            """,
            tuple(params),
        ).fetchall()
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        payload = row[0]
        if not isinstance(payload, dict):
            continue
        tid = str(payload.get("id") or "").strip()
        if tid and tid in seen:
            continue
        if tid:
            seen.add(tid)
        out.append(payload)
    return out


def find_trip_by_booking_refs(
    *,
    booking_ref: str | None = None,
    payment_id: str | None = None,
) -> dict[str, Any] | None:
    """Best-effort trip payload lookup for confirmation email enrichment."""
    if not configured():
        return None
    ref = (booking_ref or "").strip()
    pay = (payment_id or "").strip()
    if not ref and not pay:
        return None
    clauses: list[str] = []
    params: list[str] = []
    if ref:
        clauses.append(
            "(payload::text ILIKE %s OR payload ->> 'id' = %s)"
        )
        params.extend([f"%{ref}%", ref])
    if pay:
        clauses.append("payload::text ILIKE %s")
        params.append(f"%{pay}%")
    sql = f"""
        SELECT payload
        FROM trips
        WHERE {' OR '.join(clauses)}
        ORDER BY updated_at DESC
        LIMIT 1
    """
    try:
        with connection() as conn:
            row = conn.execute(sql, tuple(params)).fetchone()
        if not row:
            return None
        payload = row[0]
        return payload if isinstance(payload, dict) else None
    except Exception:
        traceback.print_exc()
        return None


def delete_trip(
    device_id: str | None,
    trip_id: str,
    *,
    user_id: str | None = None,
) -> bool:
    did = ensure_device(device_id) if device_id else None
    tid = (trip_id or "").strip()
    uid = (user_id or "").strip() or None
    if not tid or (not did and not uid):
        return False
    clauses = ["id = %s"]
    params: list[str] = [tid]
    owners: list[str] = []
    if did:
        owners.append("device_id = %s")
        params.append(did)
    if uid:
        owners.append("user_id = %s")
        params.append(uid)
    clauses.append(f"({' OR '.join(owners)})")
    with connection() as conn:
        cur = conn.execute(
            f"DELETE FROM trips WHERE {' AND '.join(clauses)}",
            tuple(params),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0


def payment_owned_by_device(payment_id: str | None, device_id: str | None) -> bool:
    """True when this payment_id belongs to a booking on the device."""
    if not configured():
        return False
    pay = (payment_id or "").strip()
    did = (device_id or "").strip()
    if not pay or not did:
        return False
    with connection() as conn:
        row = conn.execute(
            """
            SELECT 1 FROM bookings
            WHERE payment_id = %s AND device_id = %s
            LIMIT 1
            """,
            (pay, did),
        ).fetchone()
        return bool(row)


def booking_owned_by_device(supplier_booking_id: str | None, device_id: str | None) -> bool | None:
    """True/False if ledger has a device binding; None if unknown (no row / no DB)."""
    if not configured():
        return None
    bid = (supplier_booking_id or "").strip()
    did = (device_id or "").strip()
    if not bid:
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT device_id, user_id FROM bookings
            WHERE supplier_booking_id = %s
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
            """,
            (bid,),
        ).fetchone()
        if not row:
            return None
        owner = (row[0] or "").strip()
        if not owner:
            return None
        if not did:
            return False
        return owner == did


def booking_owned_by_user(supplier_booking_id: str | None, user_id: str | None) -> bool | None:
    """True when the booking is linked to this signed-in account."""
    if not configured():
        return None
    bid = (supplier_booking_id or "").strip()
    uid = (user_id or "").strip()
    if not bid or not uid:
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT user_id FROM bookings
            WHERE supplier_booking_id = %s
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
            """,
            (bid,),
        ).fetchone()
        if not row:
            return None
        owner = (row[0] or "").strip()
        if not owner:
            return None
        return owner == uid


def _find_booking_id(
    conn,
    *,
    supplier_booking_id: str | None,
    payment_id: str | None,
) -> str | None:
    if supplier_booking_id:
        row = conn.execute(
            "SELECT id FROM bookings WHERE supplier_booking_id = %s LIMIT 1",
            (supplier_booking_id,),
        ).fetchone()
        if row:
            return row[0]
    if payment_id:
        row = conn.execute(
            "SELECT id FROM bookings WHERE payment_id = %s LIMIT 1",
            (payment_id,),
        ).fetchone()
        if row:
            return row[0]
    return None


def record_booking(
    *,
    kind: str,
    device_id: str | None = None,
    trip_id: str | None = None,
    supplier_booking_id: str | None = None,
    pnr: str | None = None,
    payment_id: str | None = None,
    status: str = "confirmed",
    amount: Any = None,
    currency: str | None = "INR",
    payload: dict[str, Any] | None = None,
) -> str | None:
    if not configured():
        return None
    did = ensure_device(device_id)
    supplier = (supplier_booking_id or "").strip() or None
    pay = (payment_id or "").strip() or None
    with connection() as conn:
        existing = _find_booking_id(conn, supplier_booking_id=supplier, payment_id=pay)
        booking_pk = existing or str(uuid.uuid4())
        uid = _user_id_for_device(conn, did)
        conn.execute(
            """
            INSERT INTO bookings (
              id, trip_id, device_id, user_id, kind, supplier_booking_id, pnr, payment_id,
              status, amount, currency, payload, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, now())
            ON CONFLICT (id) DO UPDATE SET
              trip_id = COALESCE(EXCLUDED.trip_id, bookings.trip_id),
              device_id = COALESCE(EXCLUDED.device_id, bookings.device_id),
              user_id = COALESCE(EXCLUDED.user_id, bookings.user_id),
              supplier_booking_id = COALESCE(EXCLUDED.supplier_booking_id, bookings.supplier_booking_id),
              pnr = COALESCE(EXCLUDED.pnr, bookings.pnr),
              payment_id = COALESCE(EXCLUDED.payment_id, bookings.payment_id),
              status = EXCLUDED.status,
              amount = COALESCE(EXCLUDED.amount, bookings.amount),
              currency = COALESCE(EXCLUDED.currency, bookings.currency),
              payload = EXCLUDED.payload,
              updated_at = now()
            """,
            (
                booking_pk,
                (trip_id or None),
                did,
                uid,
                str(kind or "unknown")[:32],
                supplier,
                (pnr or None),
                pay,
                str(status or "confirmed")[:40],
                _num(amount),
                (currency or "INR"),
                _json(payload or {}),
            ),
        )
        conn.commit()
        return booking_pk


def record_payment(
    *,
    payment_id: str | None,
    booking_id: str | None = None,
    trip_id: str | None = None,
    device_id: str | None = None,
    amount: Any = None,
    currency: str | None = "INR",
    status: str = "captured",
    provider: str = "stripe",
    payload: dict[str, Any] | None = None,
) -> None:
    pay = (payment_id or "").strip()
    if not configured() or not pay:
        return
    did = ensure_device(device_id)
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO payments (
              id, booking_id, trip_id, device_id, provider, amount, currency, status, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              booking_id = COALESCE(EXCLUDED.booking_id, payments.booking_id),
              trip_id = COALESCE(EXCLUDED.trip_id, payments.trip_id),
              status = EXCLUDED.status,
              amount = COALESCE(EXCLUDED.amount, payments.amount),
              payload = EXCLUDED.payload
            """,
            (
                pay[:80],
                booking_id,
                trip_id,
                did,
                str(provider or "stripe")[:32],
                _num(amount),
                (currency or "INR"),
                str(status or "captured")[:40],
                _json(payload or {}),
            ),
        )
        conn.commit()


def record_refund(
    *,
    refund_id: str | None,
    payment_id: str | None = None,
    booking_id: str | None = None,
    trip_id: str | None = None,
    amount: Any = None,
    currency: str | None = "INR",
    status: str | None = None,
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    rid = (refund_id or "").strip() or f"rf-{uuid.uuid4()}"
    if not configured():
        return
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO refunds (
              id, payment_id, booking_id, trip_id, amount, currency, status, reason, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            ON CONFLICT (id) DO UPDATE SET
              status = EXCLUDED.status,
              amount = COALESCE(EXCLUDED.amount, refunds.amount),
              payload = EXCLUDED.payload
            """,
            (
                rid[:80],
                (payment_id or None),
                booking_id,
                trip_id,
                _num(amount),
                (currency or "INR"),
                (status or None),
                (reason or None),
                _json(payload or {}),
            ),
        )
        conn.commit()


def record_cancel(
    *,
    supplier_booking_id: str | None,
    booking_id: str | None = None,
    trip_id: str | None = None,
    status: str | None = None,
    pending: bool = False,
    cancellation_fee: Any = None,
    refund_amount: Any = None,
    destination: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    if not configured():
        return
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO cancel_events (
              id, booking_id, trip_id, supplier_booking_id, status, pending,
              cancellation_fee, refund_amount, destination, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                str(uuid.uuid4()),
                booking_id,
                trip_id,
                (supplier_booking_id or None),
                (status or None),
                bool(pending),
                _num(cancellation_fee),
                _num(refund_amount),
                (destination or None),
                _json(payload or {}),
            ),
        )
        conn.commit()


def persist_flight_complete(
    *,
    device_id: str | None,
    result: dict[str, Any],
    payment_id: str | None,
    expected_amount: Any = None,
    currency: str | None = None,
    guest_email: str | None = None,
) -> None:
    if not result.get("ok"):
        return
    booking = result.get("booking") if isinstance(result.get("booking"), dict) else {}
    supplier_id = (
        booking.get("booking_id")
        or booking.get("bookingId")
        or booking.get("id")
        or None
    )
    pnr = booking.get("airline_pnr") or booking.get("booking_ref") or booking.get("pnr")
    amount = booking.get("total_price") or booking.get("price") or expected_amount
    cur = booking.get("currency") or currency or "INR"
    pay = payment_id or (booking.get("payment") or {}).get("payment_id")
    status = str(booking.get("status") or ("hold" if result.get("sandbox_hold") else "confirmed"))
    payload = dict(booking)
    mail = (guest_email or "").strip().lower()
    if mail and "@" in mail:
        payload["guest_email"] = mail
    booking_pk = record_booking(
        kind="flight",
        device_id=device_id,
        supplier_booking_id=str(supplier_id) if supplier_id else None,
        pnr=str(pnr) if pnr else None,
        payment_id=str(pay) if pay else None,
        status=status,
        amount=amount,
        currency=cur,
        payload=payload,
    )
    if pay:
        record_payment(
            payment_id=str(pay),
            booking_id=booking_pk,
            device_id=device_id,
            amount=amount,
            currency=cur,
            status="captured",
            payload={"source": "flight_complete"},
        )


def persist_hotel_book(
    *,
    device_id: str | None,
    result: dict[str, Any],
    payment_id: str | None,
    expected_amount: Any = None,
    guest_email: str | None = None,
) -> None:
    if not result.get("ok"):
        return
    booking = result.get("booking") if isinstance(result.get("booking"), dict) else {}
    supplier_id = booking.get("booking_id") or booking.get("bookingId")
    pay = payment_id or booking.get("payment_id")
    amount = booking.get("price") or expected_amount
    cur = booking.get("currency") or "INR"
    payload = dict(booking)
    mail = (guest_email or "").strip().lower()
    if mail and "@" in mail:
        payload["guest_email"] = mail
    booking_pk = record_booking(
        kind="hotel",
        device_id=device_id,
        supplier_booking_id=str(supplier_id) if supplier_id else None,
        payment_id=str(pay) if pay else None,
        status=str(booking.get("status") or "confirmed"),
        amount=amount,
        currency=cur,
        payload=payload,
    )
    if pay:
        record_payment(
            payment_id=str(pay),
            booking_id=booking_pk,
            device_id=device_id,
            amount=amount,
            currency=cur,
            status="captured",
            payload={"source": "hotel_book"},
        )


def persist_cancel_result(
    *,
    kind: str,
    device_id: str | None,
    supplier_booking_id: str,
    payment_id: str | None,
    result: dict[str, Any],
) -> None:
    booking = result.get("booking") if isinstance(result.get("booking"), dict) else {}
    cancel = result.get("cancellation") if isinstance(result.get("cancellation"), dict) else {}
    rzp = result.get("razorpay_refund") if isinstance(result.get("razorpay_refund"), dict) else {}
    pending = bool(result.get("pending") or cancel.get("pending") or booking.get("pending"))
    status = str(
        cancel.get("status")
        or booking.get("status")
        or ("cancel_pending" if pending else "cancelled")
    )
    booking_pk = record_booking(
        kind=kind,
        device_id=device_id,
        supplier_booking_id=supplier_booking_id,
        payment_id=payment_id,
        status="cancel_pending" if pending else "cancelled",
        amount=cancel.get("refund_amount") or booking.get("refund_amount"),
        currency=cancel.get("currency") or booking.get("currency") or "INR",
        payload={"booking": booking, "cancellation": cancel, "razorpay_refund": rzp},
    )
    record_cancel(
        supplier_booking_id=supplier_booking_id,
        booking_id=booking_pk,
        status=status,
        pending=pending,
        cancellation_fee=cancel.get("cancellation_fee") or booking.get("cancellation_fee"),
        refund_amount=cancel.get("refund_amount") or booking.get("refund_amount"),
        destination=cancel.get("destination") or booking.get("destination"),
        payload=result,
    )
    if rzp.get("ok") and not rzp.get("skipped") and (rzp.get("refund_id") or rzp.get("already_refunded")):
        record_refund(
            refund_id=rzp.get("refund_id"),
            payment_id=payment_id,
            booking_id=booking_pk,
            amount=rzp.get("refund_amount"),
            currency=rzp.get("currency") or "INR",
            status=str(rzp.get("status") or "processed"),
            reason="itinero_cancel",
            payload=rzp,
        )
    elif rzp.get("skipped"):
        record_refund(
            refund_id=None,
            payment_id=payment_id,
            booking_id=booking_pk,
            amount=rzp.get("refund_amount"),
            currency=rzp.get("currency") or "INR",
            status=f"skipped:{rzp.get('reason') or 'unknown'}",
            reason=str(rzp.get("reason") or ""),
            payload=rzp,
        )


def persist_standalone_refund(
    *,
    payment_id: str,
    booking_id: str | None,
    result: dict[str, Any],
) -> None:
    if not isinstance(result, dict):
        return
    record_refund(
        refund_id=result.get("refund_id"),
        payment_id=payment_id,
        booking_id=None,
        amount=result.get("refund_amount") or result.get("amount"),
        currency=result.get("currency") or "INR",
        status=str(result.get("status") or ("failed" if not result.get("ok") else "processed")),
        reason=(booking_id or "standalone"),
        payload=result,
    )


def safe_call(fn, *args, **kwargs) -> None:
    try:
        if not configured():
            return
        fn(*args, **kwargs)
    except Exception:
        traceback.print_exc()
