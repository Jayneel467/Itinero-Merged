"""Server-side price watches — email when live min fare drops.

Guest watches live on device_id until login claims them onto the account.
Plus entitlement (1 vs 8) is enforced at upsert time.
"""

from __future__ import annotations

import asyncio
import traceback
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

from supervisor.db import configured, connection, normalize_device_id

DROP_PCT = 3.0
MIN_DROP_INR = 500.0
MIN_DROP_OTHER = 5.0


def _num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, TypeError, ValueError):
        return None


def _iata(value: Any) -> str:
    return str(value or "").strip().upper()[:3]


def significant_drop(*, was: float, now: float, currency: str = "INR") -> bool:
    if was <= 0 or now <= 0 or now >= was:
        return False
    drop = was - now
    pct = (drop / was) * 100.0
    floor = MIN_DROP_INR if str(currency or "INR").upper() == "INR" else MIN_DROP_OTHER
    return pct >= DROP_PCT or drop >= floor


def _row_public(row) -> dict[str, Any]:
    (
        wid,
        user_id,
        device_id,
        email,
        origin,
        destination,
        currency,
        baseline,
        last_price,
        best_date,
        last_checked,
        last_alerted,
        last_error,
        active,
        created,
        updated,
    ) = row[:16]
    return {
        "id": wid,
        "userId": user_id,
        "deviceId": device_id,
        "email": email,
        "origin": origin,
        "destination": destination,
        "originLabel": origin,
        "destinationLabel": destination,
        "currency": currency or "INR",
        "baselinePrice": _num(baseline),
        "lastPrice": _num(last_price),
        "bestDate": str(best_date)[:10] if best_date else None,
        "lastCheckedAt": last_checked.isoformat() if isinstance(last_checked, datetime) else last_checked,
        "lastAlertedAt": last_alerted.isoformat() if isinstance(last_alerted, datetime) else last_alerted,
        "lastError": last_error,
        "active": bool(active),
        "createdAt": created.isoformat() if isinstance(created, datetime) else created,
        "updatedAt": updated.isoformat() if isinstance(updated, datetime) else updated,
    }


def _limit_for_user(user_id: str | None) -> int:
    try:
        from supervisor.billing import snapshot_for_user

        snap = snapshot_for_user(user_id)
        return int(snap.get("priceWatchLimit") or (8 if snap.get("plan") == "plus" else 1))
    except Exception:
        return 1


def list_watches(*, user_id: str | None = None, device_id: str | None = None) -> list[dict[str, Any]]:
    if not configured():
        return []
    uid = (user_id or "").strip() or None
    did = normalize_device_id(device_id)
    if not uid and not did:
        return []
    clauses: list[str] = ["active = true"]
    params: list[str] = []
    owners: list[str] = []
    if uid:
        owners.append("user_id = %s")
        params.append(uid)
    if did:
        owners.append("device_id = %s")
        params.append(did)
    clauses.append(f"({' OR '.join(owners)})")
    with connection() as conn:
        rows = conn.execute(
            f"""
            SELECT id, user_id, device_id, email, origin, destination, currency,
                   baseline_price, last_price, best_date, last_checked_at, last_alerted_at,
                   last_error, active, created_at, updated_at
            FROM price_watches
            WHERE {' AND '.join(clauses)}
            ORDER BY created_at DESC
            """,
            tuple(params),
        ).fetchall()
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        pub = _row_public(row)
        key = f"{pub['origin']}-{pub['destination']}"
        if key in seen:
            continue
        seen.add(key)
        out.append(pub)
    return out


def upsert_watch(
    *,
    user_id: str | None,
    device_id: str | None,
    origin: str,
    destination: str,
    currency: str = "INR",
    email: str | None = None,
    watch_id: str | None = None,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset"}
    frm = _iata(origin)
    to = _iata(destination)
    if len(frm) != 3 or len(to) != 3 or frm == to:
        return {"ok": False, "error": "invalid_route", "message": "Pick two different airport codes."}
    uid = (user_id or "").strip() or None
    did = normalize_device_id(device_id)
    if not uid and not did:
        return {"ok": False, "error": "missing_identity"}
    mail = (email or "").strip().lower() or None
    if mail and "@" not in mail:
        mail = None
    cap = _limit_for_user(uid)
    existing = list_watches(user_id=uid, device_id=did)
    if any(w["origin"] == frm and w["destination"] == to for w in existing):
        hit = next(w for w in existing if w["origin"] == frm and w["destination"] == to)
        return {"ok": True, "watch": hit, "existing": True}
    if len(existing) >= cap:
        return {
            "ok": False,
            "error": "watch_limit",
            "limit": cap,
            "message": (
                f"You can watch up to {cap} routes."
                if cap > 1
                else "You can watch 1 route. Remove one to add another."
            ),
        }
    wid = (watch_id or "").strip() or str(uuid.uuid4())
    cur = str(currency or "INR").upper()[:8]
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO price_watches (
              id, user_id, device_id, email, origin, destination, currency, active, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, true, now())
            ON CONFLICT (id) DO UPDATE SET
              user_id = COALESCE(EXCLUDED.user_id, price_watches.user_id),
              device_id = COALESCE(EXCLUDED.device_id, price_watches.device_id),
              email = COALESCE(EXCLUDED.email, price_watches.email),
              active = true,
              updated_at = now()
            """,
            (wid, uid, did, mail, frm, to, cur),
        )
        conn.commit()
    rows = list_watches(user_id=uid, device_id=did)
    watch = next((w for w in rows if w["id"] == wid or (w["origin"] == frm and w["destination"] == to)), None)
    return {"ok": True, "watch": watch or {"id": wid, "origin": frm, "destination": to, "currency": cur}}


def delete_watch(*, watch_id: str, user_id: str | None = None, device_id: str | None = None) -> bool:
    if not configured():
        return False
    wid = (watch_id or "").strip()
    uid = (user_id or "").strip() or None
    did = normalize_device_id(device_id)
    if not wid or (not uid and not did):
        return False
    owners: list[str] = []
    params: list[str] = [wid]
    if uid:
        owners.append("user_id = %s")
        params.append(uid)
    if did:
        owners.append("device_id = %s")
        params.append(did)
    with connection() as conn:
        cur = conn.execute(
            f"""
            UPDATE price_watches SET active = false, updated_at = now()
            WHERE id = %s AND ({' OR '.join(owners)})
            """,
            tuple(params),
        )
        conn.commit()
        return (cur.rowcount or 0) > 0


def _sample_dates(n: int = 6) -> list[str]:
    today = date.today()
    out: list[str] = []
    for offset in (7, 14, 21, 30, 45, 60)[:n]:
        out.append((today + timedelta(days=offset)).isoformat())
    return out


async def probe_min_fare(
    *, origin: str, destination: str, currency: str = "INR", date_count: int = 6
) -> dict[str, Any]:
    from supervisor.flight_structured import structured_price_calendar

    res = await structured_price_calendar(
        origin=origin,
        destination=destination,
        dates=_sample_dates(max(2, min(int(date_count or 6), 8))),
        adults=1,
        children=0,
        infants=0,
        cabin="ECONOMY",
        currency=currency,
    )
    rows = res.get("dates") if isinstance(res, dict) else None
    if not isinstance(rows, list):
        return {"ok": False, "error": res.get("message") or res.get("error") or "calendar_failed"}
    min_price = None
    best_date = None
    cur = currency
    for row in rows:
        if not isinstance(row, dict):
            continue
        price = _num(row.get("minPrice") or row.get("min_price") or row.get("price"))
        if price is None or price <= 0:
            continue
        if min_price is None or price < min_price:
            min_price = price
            best_date = str(row.get("date") or "")[:10] or None
            cur = str(row.get("currency") or cur or "INR")
    if min_price is None:
        return {"ok": False, "error": res.get("message") or "No live fare on sampled dates."}
    return {"ok": True, "minPrice": min_price, "bestDate": best_date, "currency": cur}


async def check_watch(
    watch_id: str, *, send_email: bool = True, date_count: int = 6
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset"}
    wid = (watch_id or "").strip()
    if not wid:
        return {"ok": False, "error": "missing_id"}
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, device_id, email, origin, destination, currency,
                   baseline_price, last_price, best_date, last_checked_at, last_alerted_at,
                   last_error, active, created_at, updated_at
            FROM price_watches WHERE id = %s
            """,
            (wid,),
        ).fetchone()
    if not row:
        return {"ok": False, "error": "not_found"}
    watch = _row_public(row)
    if not watch.get("active"):
        return {"ok": False, "error": "inactive", "watch": watch}

    probe = await probe_min_fare(
        origin=watch["origin"],
        destination=watch["destination"],
        currency=watch.get("currency") or "INR",
        date_count=date_count,
    )
    now = datetime.now(timezone.utc)
    if not probe.get("ok"):
        with connection() as conn:
            conn.execute(
                """
                UPDATE price_watches
                SET last_checked_at = %s, last_error = %s, updated_at = now()
                WHERE id = %s
                """,
                (now, str(probe.get("error") or "probe_failed")[:240], wid),
            )
            conn.commit()
        return {"ok": False, "error": probe.get("error"), "watch": watch}

    new_price = float(probe["minPrice"])
    best_date = probe.get("bestDate")
    currency = str(probe.get("currency") or watch.get("currency") or "INR")
    prev_baseline = watch.get("baselinePrice")
    prev_last = watch.get("lastPrice")
    compare = prev_last if prev_last is not None else prev_baseline
    alert = None
    next_baseline = prev_baseline if prev_baseline is not None else new_price
    if compare is not None and significant_drop(was=float(compare), now=new_price, currency=currency):
        alert = {
            "type": "price_drop",
            "origin": watch["origin"],
            "destination": watch["destination"],
            "price": new_price,
            "wasPrice": float(compare),
            "currency": currency,
            "bestDate": best_date,
        }
        next_baseline = new_price
        if send_email and watch.get("email"):
            try:
                from supervisor.email_service import send_price_watch_alert

                await send_price_watch_alert(to_email=watch["email"], details=alert)
            except Exception:
                traceback.print_exc()

    with connection() as conn:
        conn.execute(
            """
            UPDATE price_watches
            SET last_price = %s,
                baseline_price = %s,
                best_date = %s,
                currency = %s,
                last_checked_at = %s,
                last_alerted_at = CASE WHEN %s THEN %s ELSE last_alerted_at END,
                last_error = NULL,
                updated_at = now()
            WHERE id = %s
            """,
            (
                new_price,
                next_baseline,
                best_date,
                currency,
                now,
                bool(alert),
                now if alert else None,
                wid,
            ),
        )
        conn.commit()
    watch.update(
        {
            "lastPrice": new_price,
            "baselinePrice": next_baseline,
            "bestDate": best_date,
            "currency": currency,
            "lastCheckedAt": now.isoformat(),
            "lastError": None,
        }
    )
    return {"ok": True, "watch": watch, "alert": alert}


async def check_due(*, limit: int = 40, send_email: bool = True) -> dict[str, Any]:
    """Cron: re-check watches not probed in the last 6 hours."""
    if not configured():
        return {"ok": False, "error": "db_unset", "checked": 0}
    cutoff = datetime.now(timezone.utc) - timedelta(hours=6)
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id FROM price_watches
            WHERE active = true
              AND (last_checked_at IS NULL OR last_checked_at < %s)
            ORDER BY last_checked_at NULLS FIRST
            LIMIT %s
            """,
            (cutoff, max(1, min(int(limit), 80))),
        ).fetchall()
    sem = asyncio.Semaphore(4)

    async def _one(wid: str) -> dict[str, Any]:
        async with sem:
            try:
                return await check_watch(wid, send_email=send_email, date_count=4)
            except Exception as exc:
                traceback.print_exc()
                return {"ok": False, "error": type(exc).__name__, "id": wid}

    results = await asyncio.gather(*[_one(str(r[0])) for r in rows]) if rows else []
    alerts = sum(1 for out in results if isinstance(out, dict) and out.get("alert"))
    return {"ok": True, "checked": len(results), "alerts": alerts, "results": list(results)}
