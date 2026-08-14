"""Itinero Rewards ledger — earn, pending, redeem (Neon Postgres)."""

from __future__ import annotations

import json
import traceback
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any

from supervisor.db import configured, connection
from supervisor.fx_structured import convert
from supervisor.liteapi_loyalty import POINTS_PER_USD, estimate_loyalty_earn, fetch_loyalty_settings

MIN_REDEEM_POINTS = 50
REDEMPTION_TTL_MIN = 45


def _json(value: Any) -> str:
    return json.dumps(value if value is not None else {}, default=str)


def _norm_email(email: str | None) -> str | None:
    raw = (email or "").strip().lower()
    return raw if raw and "@" in raw else None


def _event_id() -> str:
    return f"lpe_{uuid.uuid4().hex[:24]}"


def _redemption_id() -> str:
    return f"lrd_{uuid.uuid4().hex[:24]}"


def points_to_discount(*, points: int, currency: str = "INR") -> dict[str, Any]:
    pts = max(0, int(points or 0))
    if pts <= 0:
        return {"ok": False, "error": "invalid_points"}
    cur = (currency or "INR").strip().upper()
    usd_value = pts / float(POINTS_PER_USD)
    if cur == "USD":
        amount = round(usd_value, 2)
    else:
        fx = convert(usd_value, "USD", cur)
        if fx.get("mode") != "ok":
            return {"ok": False, "error": "fx_unavailable", "message": "Could not convert points."}
        try:
            amount = round(float(fx.get("result") or 0), 2)
        except (TypeError, ValueError):
            return {"ok": False, "error": "fx_unavailable"}
    if amount <= 0:
        return {"ok": False, "error": "invalid_points"}
    return {
        "ok": True,
        "points": pts,
        "discountAmount": amount,
        "currency": cur,
        "usdValue": round(usd_value, 2),
    }


def ensure_account(user_id: str) -> None:
    if not configured() or not user_id:
        return
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO loyalty_accounts (user_id)
            VALUES (%s)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (user_id,),
        )
        conn.commit()


def merge_guest_email(*, user_id: str, email: str | None) -> None:
    """Attach guest-email earn events to a signed-in user."""
    em = _norm_email(email)
    if not configured() or not user_id or not em:
        return
    ensure_account(user_id)
    with connection() as conn:
        conn.execute(
            """
            UPDATE loyalty_point_events
            SET user_id = %s
            WHERE user_id IS NULL AND lower(guest_email) = %s
            """,
            (user_id, em),
        )
        pending = conn.execute(
            """
            SELECT COALESCE(SUM(points), 0)
            FROM loyalty_point_events
            WHERE user_id = %s AND status = 'pending'
            """,
            (user_id,),
        ).fetchone()
        available = conn.execute(
            """
            SELECT COALESCE(SUM(points), 0)
            FROM loyalty_point_events
            WHERE user_id = %s AND status = 'available'
            """,
            (user_id,),
        ).fetchone()
        lifetime = conn.execute(
            """
            SELECT COALESCE(SUM(points), 0)
            FROM loyalty_point_events
            WHERE user_id = %s AND points > 0 AND status IN ('pending', 'available')
            """,
            (user_id,),
        ).fetchone()
        conn.execute(
            """
            UPDATE loyalty_accounts
            SET pending_balance = %s,
                balance = %s,
                lifetime_earned = %s,
                updated_at = now()
            WHERE user_id = %s
            """,
            (
                int(pending[0] or 0),
                int(available[0] or 0),
                int(lifetime[0] or 0),
                user_id,
            ),
        )
        conn.commit()


def _recalc_account(conn, user_id: str) -> None:
    pending = conn.execute(
        """
        SELECT COALESCE(SUM(points), 0)
        FROM loyalty_point_events
        WHERE user_id = %s AND status = 'pending' AND points > 0
        """,
        (user_id,),
    ).fetchone()
    available = conn.execute(
        """
        SELECT COALESCE(SUM(points), 0)
        FROM loyalty_point_events
        WHERE user_id = %s AND status = 'available' AND points > 0
        """,
        (user_id,),
    ).fetchone()
    redeemed = conn.execute(
        """
        SELECT COALESCE(SUM(ABS(points)), 0)
        FROM loyalty_point_events
        WHERE user_id = %s AND status = 'redeemed' AND points < 0
        """,
        (user_id,),
    ).fetchone()
    lifetime = conn.execute(
        """
        SELECT COALESCE(SUM(points), 0)
        FROM loyalty_point_events
        WHERE user_id = %s AND points > 0 AND status IN ('pending', 'available')
        """,
        (user_id,),
    ).fetchone()
    conn.execute(
        """
        INSERT INTO loyalty_accounts (user_id, balance, pending_balance, lifetime_earned, updated_at)
        VALUES (%s, %s, %s, %s, now())
        ON CONFLICT (user_id) DO UPDATE SET
          balance = EXCLUDED.balance,
          pending_balance = EXCLUDED.pending_balance,
          lifetime_earned = EXCLUDED.lifetime_earned,
          updated_at = now()
        """,
        (user_id, int(available[0] or 0), int(pending[0] or 0), int(lifetime[0] or 0)),
    )


def confirm_due_points(*, user_id: str) -> int:
    """Move pending points to available when check-out date has passed."""
    if not configured() or not user_id:
        return 0
    today = date.today()
    moved = 0
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, points
            FROM loyalty_point_events
            WHERE user_id = %s
              AND status = 'pending'
              AND points > 0
              AND check_out_date IS NOT NULL
              AND check_out_date <= %s
            """,
            (user_id, today),
        ).fetchall()
        for row in rows:
            conn.execute(
                """
                UPDATE loyalty_point_events
                SET status = 'available', available_at = now()
                WHERE id = %s
                """,
                (row[0],),
            )
            moved += int(row[1] or 0)
        if rows:
            _recalc_account(conn, user_id)
        conn.commit()
    return moved


def get_balance(*, user_id: str) -> dict[str, Any]:
    if not configured() or not user_id:
        return {
            "ok": False,
            "enabled": False,
            "message": "Sign in to view Itinero Rewards.",
        }
    confirm_due_points(user_id=user_id)
    ensure_account(user_id)
    with connection() as conn:
        row = conn.execute(
            """
            SELECT balance, pending_balance, lifetime_earned, liteapi_guest_id, updated_at
            FROM loyalty_accounts
            WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return {
            "ok": True,
            "enabled": True,
            "balance": 0,
            "pendingBalance": 0,
            "lifetimeEarned": 0,
            "programName": "Itinero Rewards",
        }
    return {
        "ok": True,
        "enabled": True,
        "balance": int(row[0] or 0),
        "pendingBalance": int(row[1] or 0),
        "lifetimeEarned": int(row[2] or 0),
        "liteapiGuestId": row[3],
        "updatedAt": row[4].isoformat() if row[4] else None,
        "programName": "Itinero Rewards",
        "minRedeemPoints": MIN_REDEEM_POINTS,
        "pointsPerUsd": POINTS_PER_USD,
        "usageNote": "Apply points on package checkout. Hotel stays earn points after check-out.",
    }


def list_history(*, user_id: str, limit: int = 30) -> dict[str, Any]:
    if not configured() or not user_id:
        return {"ok": False, "events": []}
    lim = max(1, min(int(limit or 30), 100))
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, points, status, reason, booking_id, booking_kind,
                   check_out_date, created_at, payload
            FROM loyalty_point_events
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s
            """,
            (user_id, lim),
        ).fetchall()
    events = []
    for row in rows:
        payload = row[8] if isinstance(row[8], dict) else {}
        events.append(
            {
                "id": row[0],
                "points": int(row[1] or 0),
                "status": row[2],
                "reason": row[3],
                "bookingId": row[4],
                "bookingKind": row[5],
                "checkOutDate": row[6].isoformat() if row[6] else None,
                "createdAt": row[7].isoformat() if row[7] else None,
                "currency": payload.get("currency"),
                "bookingAmount": payload.get("bookingAmount"),
            }
        )
    return {"ok": True, "events": events}


def schedule_earn(
    *,
    user_id: str | None,
    guest_email: str | None,
    booking_id: str,
    booking_kind: str,
    amount: float,
    currency: str,
    check_out_date: str | None,
    settings: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Record pending earn from a confirmed booking (idempotent per booking_id)."""
    if not configured():
        return {"ok": False, "skipped": True, "reason": "db_unset"}
    bid = (booking_id or "").strip()
    if not bid:
        return {"ok": False, "skipped": True, "reason": "missing_booking_id"}

    est = estimate_loyalty_earn(amount=amount, currency=currency, settings=settings or {})
    points = int(est.get("points") or 0)
    try:
        from supervisor.billing import loyalty_multiplier_for

        mult = loyalty_multiplier_for(user_id=(user_id or "").strip() or None)
        if mult > 1 and points > 0:
            points = max(1, int(round(points * mult)))
            est = {**est, "points": points, "loyaltyMultiplier": mult}
    except Exception:
        pass
    if not est.get("enabled") or points <= 0:
        return {"ok": False, "skipped": True, "reason": "no_points"}

    em = _norm_email(guest_email)
    uid = (user_id or "").strip() or None
    if uid:
        ensure_account(uid)
    elif not em:
        return {"ok": False, "skipped": True, "reason": "no_identity"}

    co_date = None
    if check_out_date:
        try:
            co_date = date.fromisoformat(str(check_out_date)[:10])
        except ValueError:
            co_date = None

    with connection() as conn:
        # Idempotent: book API + LiteAPI webhook must not double-earn.
        existing = conn.execute(
            """
            SELECT id, points, status
            FROM loyalty_point_events
            WHERE booking_id = %s
              AND points > 0
              AND status IN ('pending', 'available', 'reversed')
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (bid,),
        ).fetchone()
        if existing:
            return {
                "ok": True,
                "duplicate": True,
                "eventId": existing[0],
                "points": int(existing[1] or 0),
                "status": existing[2],
            }

        evt_id = _event_id()
        conn.execute(
            """
            INSERT INTO loyalty_point_events (
              id, user_id, guest_email, booking_id, booking_kind, points, status,
              reason, check_out_date, payload
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s::jsonb)
            """,
            (
                evt_id,
                uid,
                em if not uid else None,
                bid,
                booking_kind,
                points,
                f"earn_{booking_kind}",
                co_date,
                _json(
                    {
                        "bookingAmount": amount,
                        "currency": currency,
                        "estimate": est,
                    }
                ),
            ),
        )
        if uid:
            _recalc_account(conn, uid)
        conn.commit()
    return {"ok": True, "eventId": evt_id, "points": points, "status": "pending"}


def reverse_earn_for_booking(
    *,
    booking_id: str,
    reason: str = "booking_cancelled",
) -> dict[str, Any]:
    """Claw back pending/available earn points when a booking is cancelled.

    Idempotent: already-reversed events are left alone. Available points reduce
    the user's spendable balance via account recalc (balance never invents points).
    """
    bid = (booking_id or "").strip()
    if not configured() or not bid:
        return {"ok": False, "skipped": True, "reason": "missing_booking_id"}

    reversed_points = 0
    user_ids: set[str] = set()
    event_ids: list[str] = []

    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, points, status
            FROM loyalty_point_events
            WHERE booking_id = %s
              AND points > 0
              AND status IN ('pending', 'available')
            """,
            (bid,),
        ).fetchall()
        if not rows:
            return {
                "ok": True,
                "reversed": False,
                "points": 0,
                "message": "No earn events to reverse for this booking.",
            }

        for row in rows:
            eid, uid, pts, status = row[0], row[1], int(row[2] or 0), row[3]
            conn.execute(
                """
                UPDATE loyalty_point_events
                SET status = 'reversed',
                    payload = COALESCE(payload, '{}'::jsonb) || %s::jsonb
                WHERE id = %s AND status IN ('pending', 'available')
                """,
                (
                    _json(
                        {
                            "reversedReason": reason,
                            "priorStatus": status,
                            "reversedAt": datetime.now(timezone.utc).isoformat(),
                        }
                    ),
                    eid,
                ),
            )
            # Audit row so history shows a cancel clawback clearly.
            conn.execute(
                """
                INSERT INTO loyalty_point_events (
                  id, user_id, guest_email, booking_id, booking_kind, points, status,
                  reason, payload
                )
                SELECT
                  %s, user_id, guest_email, booking_id, booking_kind, %s, 'reversed',
                  %s, %s::jsonb
                FROM loyalty_point_events WHERE id = %s
                """,
                (
                    _event_id(),
                    -abs(pts),
                    reason,
                    _json({"sourceEventId": eid, "priorStatus": status}),
                    eid,
                ),
            )
            reversed_points += pts
            event_ids.append(eid)
            if uid:
                user_ids.add(str(uid))

        for uid in user_ids:
            _recalc_account(conn, uid)
        conn.commit()

    return {
        "ok": True,
        "reversed": True,
        "points": reversed_points,
        "eventIds": event_ids,
        "userIds": list(user_ids),
        "bookingId": bid,
    }


def confirm_all_due_points(*, limit: int = 500) -> dict[str, Any]:
    """Batch job: confirm pending earns past check-out across all users/guests."""
    if not configured():
        return {"ok": False, "moved": 0, "reason": "db_unset"}
    lim = max(1, min(int(limit or 500), 5000))
    today = date.today()
    moved = 0
    users: set[str] = set()
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, points
            FROM loyalty_point_events
            WHERE status = 'pending'
              AND points > 0
              AND check_out_date IS NOT NULL
              AND check_out_date <= %s
            ORDER BY check_out_date ASC
            LIMIT %s
            """,
            (today, lim),
        ).fetchall()
        for row in rows:
            conn.execute(
                """
                UPDATE loyalty_point_events
                SET status = 'available', available_at = now()
                WHERE id = %s AND status = 'pending'
                """,
                (row[0],),
            )
            moved += int(row[2] or 0)
            if row[1]:
                users.add(str(row[1]))
        for uid in users:
            _recalc_account(conn, uid)
        conn.commit()
    return {"ok": True, "moved": moved, "accountsUpdated": len(users), "rows": len(rows)}


async def loyalty_on_booking_cancelled(
    *,
    booking_id: str,
    reason: str = "booking_cancelled",
) -> dict[str, Any]:
    try:
        return reverse_earn_for_booking(booking_id=booking_id, reason=reason)
    except Exception:
        traceback.print_exc()
        return {"ok": False, "error": "reverse_failed"}


def reserve_redemption(
    *,
    user_id: str,
    points: int,
    currency: str = "INR",
) -> dict[str, Any]:
    """Hold points and return a discount quote for checkout."""
    if not configured() or not user_id:
        return {"ok": False, "error": "auth_required"}
    pts = int(points or 0)
    if pts < MIN_REDEEM_POINTS:
        return {
            "ok": False,
            "error": "min_points",
            "message": f"Redeem at least {MIN_REDEEM_POINTS} points.",
            "minRedeemPoints": MIN_REDEEM_POINTS,
        }
    confirm_due_points(user_id=user_id)
    quote = points_to_discount(points=pts, currency=currency)
    if not quote.get("ok"):
        return quote

    with connection() as conn:
        row = conn.execute(
            "SELECT balance FROM loyalty_accounts WHERE user_id = %s",
            (user_id,),
        ).fetchone()
        balance = int(row[0] or 0) if row else 0
        if balance < pts:
            return {
                "ok": False,
                "error": "insufficient_points",
                "message": "Not enough available points.",
                "balance": balance,
            }
        rid = _redemption_id()
        expires = datetime.now(timezone.utc) + timedelta(minutes=REDEMPTION_TTL_MIN)
        conn.execute(
            """
            INSERT INTO loyalty_redemptions (
              id, user_id, points, discount_amount, currency, status, expires_at
            )
            VALUES (%s, %s, %s, %s, %s, 'reserved', %s)
            """,
            (rid, user_id, pts, quote["discountAmount"], quote["currency"], expires),
        )
        conn.execute(
            """
            INSERT INTO loyalty_point_events (
              id, user_id, points, status, reason, payload
            )
            VALUES (%s, %s, %s, 'redeemed', 'redeem_reserved', %s::jsonb)
            """,
            (rid.replace("lrd_", "lpe_"), user_id, -pts, _json({"redemptionId": rid})),
        )
        conn.execute(
            """
            UPDATE loyalty_accounts
            SET balance = balance - %s, updated_at = now()
            WHERE user_id = %s
            """,
            (pts, user_id),
        )
        conn.commit()
    return {
        "ok": True,
        "redemptionId": rid,
        "points": pts,
        "discountAmount": quote["discountAmount"],
        "currency": quote["currency"],
        "expiresAt": expires.isoformat(),
    }


def release_redemption(*, redemption_id: str, user_id: str) -> dict[str, Any]:
    if not configured():
        return {"ok": False}
    rid = (redemption_id or "").strip()
    with connection() as conn:
        row = conn.execute(
            """
            SELECT points, status FROM loyalty_redemptions
            WHERE id = %s AND user_id = %s
            """,
            (rid, user_id),
        ).fetchone()
        if not row or row[1] != "reserved":
            return {"ok": False, "error": "not_found"}
        pts = int(row[0] or 0)
        conn.execute(
            "UPDATE loyalty_redemptions SET status = 'released' WHERE id = %s",
            (rid,),
        )
        conn.execute(
            """
            INSERT INTO loyalty_point_events (
              id, user_id, points, status, reason, payload
            )
            VALUES (%s, %s, %s, 'available', 'redeem_released', %s::jsonb)
            """,
            (_event_id(), user_id, pts, _json({"redemptionId": rid})),
        )
        conn.execute(
            """
            UPDATE loyalty_accounts
            SET balance = balance + %s, updated_at = now()
            WHERE user_id = %s
            """,
            (pts, user_id),
        )
        conn.commit()
    return {"ok": True}


def apply_redemption(
    *,
    redemption_id: str,
    user_id: str,
    booking_id: str,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset"}
    rid = (redemption_id or "").strip()
    with connection() as conn:
        row = conn.execute(
            """
            SELECT points, discount_amount, currency, status, expires_at
            FROM loyalty_redemptions
            WHERE id = %s AND user_id = %s
            """,
            (rid, user_id),
        ).fetchone()
        if not row:
            return {"ok": False, "error": "not_found"}
        if row[3] != "reserved":
            return {"ok": False, "error": "already_used", "status": row[3]}
        exp = row[4]
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp < datetime.now(timezone.utc):
            conn.commit()
            release_redemption(redemption_id=rid, user_id=user_id)
            return {"ok": False, "error": "expired"}
        conn.execute(
            """
            UPDATE loyalty_redemptions
            SET status = 'applied', booking_id = %s
            WHERE id = %s
            """,
            (booking_id, rid),
        )
        conn.commit()
    return {
        "ok": True,
        "redemptionId": rid,
        "points": int(row[0] or 0),
        "discountAmount": float(row[1] or 0),
        "currency": row[2] or "INR",
    }


def validate_redemption_for_checkout(
    *,
    redemption_id: str | None,
    user_id: str | None,
) -> dict[str, Any]:
    rid = (redemption_id or "").strip()
    uid = (user_id or "").strip()
    if not rid:
        return {"ok": True, "applied": False, "discountAmount": 0}
    if not uid:
        return {"ok": False, "error": "auth_required", "message": "Sign in to use points."}
    if not configured():
        return {"ok": False, "error": "db_unset"}
    with connection() as conn:
        row = conn.execute(
            """
            SELECT points, discount_amount, currency, status, expires_at
            FROM loyalty_redemptions
            WHERE id = %s AND user_id = %s
            """,
            (rid, uid),
        ).fetchone()
    if not row or row[3] != "reserved":
        return {"ok": False, "error": "invalid_redemption"}
    exp = row[4]
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        release_redemption(redemption_id=rid, user_id=uid)
        return {"ok": False, "error": "expired"}
    return {
        "ok": True,
        "applied": True,
        "redemptionId": rid,
        "points": int(row[0] or 0),
        "discountAmount": float(row[1] or 0),
        "currency": row[2] or "INR",
    }


async def loyalty_on_booking_confirmed(
    *,
    user_id: str | None,
    guest_email: str | None,
    booking_id: str,
    booking_kind: str,
    amount: float | None,
    currency: str | None,
    check_out_date: str | None,
) -> None:
    try:
        if amount is None or float(amount) <= 0:
            return
        settings = await fetch_loyalty_settings()
        schedule_earn(
            user_id=user_id,
            guest_email=guest_email,
            booking_id=booking_id,
            booking_kind=booking_kind,
            amount=float(amount),
            currency=(currency or "INR").upper(),
            check_out_date=check_out_date,
            settings=settings,
        )
    except Exception:
        traceback.print_exc()


def safe_call(fn, *args, **kwargs) -> None:
    try:
        fn(*args, **kwargs)
    except Exception:
        traceback.print_exc()
