"""Postgres helpers for Itinero Marketing OS."""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from supervisor.db import configured, connection


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _jid() -> str:
    return uuid.uuid4().hex


def _json(val: Any) -> str:
    return json.dumps(val if val is not None else {})


def ensure_user_marketing_row(user_id: str) -> str:
    """Ensure interests row + unsubscribe_token + referral_code. Returns unsub token."""
    if not configured():
        return ""
    token = "unsub_" + uuid.uuid4().hex
    ref = "IT" + uuid.uuid4().hex[:8].upper()
    with connection() as conn:
        row = conn.execute(
            "SELECT unsubscribe_token, referral_code FROM users WHERE id = %s",
            (user_id,),
        ).fetchone()
        if not row:
            return ""
        unsub, referral = row[0], row[1]
        if not unsub:
            conn.execute(
                "UPDATE users SET unsubscribe_token = %s WHERE id = %s AND unsubscribe_token IS NULL",
                (token, user_id),
            )
            unsub = token
        if not referral:
            conn.execute(
                "UPDATE users SET referral_code = COALESCE(referral_code, %s) WHERE id = %s",
                (ref, user_id),
            )
        conn.execute(
            """
            INSERT INTO user_interests (user_id)
            VALUES (%s)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (user_id,),
        )
        conn.commit()
        return unsub or token


def set_user_attribution(
    user_id: str,
    *,
    acq_source: str | None = None,
    acq_medium: str | None = None,
    acq_campaign: str | None = None,
    landing_path: str | None = None,
) -> None:
    if not configured() or not user_id:
        return
    with connection() as conn:
        conn.execute(
            """
            UPDATE users SET
              acq_source = COALESCE(%s, acq_source),
              acq_medium = COALESCE(%s, acq_medium),
              acq_campaign = COALESCE(%s, acq_campaign),
              landing_path = COALESCE(%s, landing_path),
              updated_at = now()
            WHERE id = %s
            """,
            (
                (acq_source or None),
                (acq_medium or None),
                (acq_campaign or None),
                (landing_path or None),
                user_id,
            ),
        )
        conn.commit()


def get_interests(user_id: str) -> dict[str, Any]:
    empty = {
        "user_id": user_id,
        "home_airport": None,
        "home_city": None,
        "home_country": None,
        "vibes": [],
        "destinations": [],
        "trip_styles": [],
        "budget_band": None,
        "preferred_currency": None,
        "mail_frequency": "daily",
        "categories": [],
    }
    if not configured():
        return empty
    with connection() as conn:
        row = conn.execute(
            """
            SELECT home_airport, home_city, home_country, vibes, destinations,
                   trip_styles, budget_band, preferred_currency, mail_frequency, categories
            FROM user_interests WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return empty
    return {
        "user_id": user_id,
        "home_airport": row[0],
        "home_city": row[1],
        "home_country": row[2],
        "vibes": row[3] or [],
        "destinations": row[4] or [],
        "trip_styles": row[5] or [],
        "budget_band": row[6],
        "preferred_currency": row[7],
        "mail_frequency": row[8] or "daily",
        "categories": row[9] or [],
    }


def put_interests(user_id: str, data: dict[str, Any]) -> dict[str, Any]:
    ensure_user_marketing_row(user_id)
    vibes = data.get("vibes") if isinstance(data.get("vibes"), list) else []
    destinations = data.get("destinations") if isinstance(data.get("destinations"), list) else []
    trip_styles = data.get("trip_styles") if isinstance(data.get("trip_styles"), list) else []
    categories = data.get("categories") if isinstance(data.get("categories"), list) else []
    freq = (data.get("mail_frequency") or "daily").strip().lower()
    if freq not in ("daily", "weekly", "off"):
        freq = "daily"
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO user_interests (
              user_id, home_airport, home_city, home_country, vibes, destinations,
              trip_styles, budget_band, preferred_currency, mail_frequency, categories, updated_at
            ) VALUES (%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s,%s,%s::jsonb,now())
            ON CONFLICT (user_id) DO UPDATE SET
              home_airport = EXCLUDED.home_airport,
              home_city = EXCLUDED.home_city,
              home_country = EXCLUDED.home_country,
              vibes = EXCLUDED.vibes,
              destinations = EXCLUDED.destinations,
              trip_styles = EXCLUDED.trip_styles,
              budget_band = EXCLUDED.budget_band,
              preferred_currency = EXCLUDED.preferred_currency,
              mail_frequency = EXCLUDED.mail_frequency,
              categories = EXCLUDED.categories,
              updated_at = now()
            """,
            (
                user_id,
                (data.get("home_airport") or None),
                (data.get("home_city") or None),
                (data.get("home_country") or None),
                _json(vibes),
                _json(destinations),
                _json(trip_styles),
                (data.get("budget_band") or None),
                (data.get("preferred_currency") or None),
                freq,
                _json(categories),
            ),
        )
        conn.commit()
    return get_interests(user_id)


def _merge_destinations(existing: list, city: str | None, country: str | None, weight: float) -> list:
    if not city and not country:
        return existing
    out = list(existing or [])
    key = (city or "").strip().lower()
    found = False
    for item in out:
        if isinstance(item, dict) and str(item.get("city") or "").strip().lower() == key and key:
            item["weight"] = float(item.get("weight") or 0) + weight
            found = True
            break
    if not found and (city or country):
        out.append({"city": city, "country": country, "weight": weight})
    out.sort(key=lambda x: float(x.get("weight") or 0) if isinstance(x, dict) else 0, reverse=True)
    return out[:40]


def _merge_vibes(existing: list, vibe: str | None, weight: float = 1.0) -> list:
    if not vibe:
        return existing or []
    vid = str(vibe).strip().lower()
    out: list[Any] = []
    weights: dict[str, float] = {}
    for v in existing or []:
        if isinstance(v, str):
            weights[v] = weights.get(v, 0) + 1
        elif isinstance(v, dict) and v.get("id"):
            weights[str(v["id"])] = float(v.get("weight") or 1)
    weights[vid] = weights.get(vid, 0) + weight
    for k, w in sorted(weights.items(), key=lambda kv: -kv[1])[:24]:
        out.append({"id": k, "weight": w})
    return out


def record_events(
    events: list[dict[str, Any]],
    *,
    user_id: str | None = None,
    lead_email: str | None = None,
) -> int:
    if not configured() or not events:
        return 0
    n = 0
    with connection() as conn:
        for ev in events[:50]:
            et = str(ev.get("type") or ev.get("event_type") or "").strip()[:64]
            if not et:
                continue
            payload = ev.get("payload") if isinstance(ev.get("payload"), dict) else {}
            weight = float(ev.get("weight") or 1)
            eid = "iev_" + _jid()[:20]
            conn.execute(
                """
                INSERT INTO interest_events (id, user_id, lead_email, event_type, payload, weight)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                """,
                (eid, user_id, (lead_email or None), et, _json(payload), weight),
            )
            n += 1
            if user_id and et in (
                "vibe_tap",
                "search",
                "save",
                "deal_click",
                "booking_confirm",
                "page_view",
            ):
                interests = get_interests(user_id)
                vibes = interests.get("vibes") or []
                dests = interests.get("destinations") or []
                if et == "vibe_tap":
                    vibes = _merge_vibes(vibes, payload.get("vibe") or payload.get("theme"), weight)
                if et in ("search", "save", "deal_click", "booking_confirm"):
                    dests = _merge_destinations(
                        dests,
                        payload.get("city") or payload.get("destination"),
                        payload.get("country"),
                        weight,
                    )
                    if payload.get("theme") or payload.get("vibe"):
                        vibes = _merge_vibes(
                            vibes, payload.get("theme") or payload.get("vibe"), weight * 0.5
                        )
                conn.execute(
                    """
                    UPDATE user_interests SET
                      vibes = %s::jsonb,
                      destinations = %s::jsonb,
                      updated_at = now()
                    WHERE user_id = %s
                    """,
                    (_json(vibes), _json(dests), user_id),
                )
        conn.commit()
    return n


def create_lead(
    email: str,
    *,
    vibes: list | None = None,
    acq_source: str | None = None,
    acq_medium: str | None = None,
    acq_campaign: str | None = None,
    landing_path: str | None = None,
) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset"}
    mail = (email or "").strip().lower()
    if "@" not in mail or "." not in mail.split("@")[-1]:
        return {"ok": False, "error": "invalid_email", "message": "Enter a valid email."}
    lid = "lead_" + _jid()[:18]
    token = "unsub_" + uuid.uuid4().hex
    with connection() as conn:
        existing = conn.execute(
            """
            SELECT id, unsubscribe_token FROM marketing_leads WHERE lower(email) = %s
            """,
            (mail,),
        ).fetchone()
        if existing:
            unsub = existing[1] or token
            conn.execute(
                """
                UPDATE marketing_leads SET
                  vibes = CASE WHEN %s::jsonb = '[]'::jsonb THEN vibes ELSE %s::jsonb END,
                  acq_source = COALESCE(%s, acq_source),
                  acq_medium = COALESCE(%s, acq_medium),
                  acq_campaign = COALESCE(%s, acq_campaign),
                  landing_path = COALESCE(%s, landing_path),
                  unsubscribe_token = COALESCE(unsubscribe_token, %s),
                  unsubscribed_at = NULL
                WHERE id = %s
                """,
                (
                    _json(vibes or []),
                    _json(vibes or []),
                    acq_source,
                    acq_medium,
                    acq_campaign,
                    landing_path,
                    unsub,
                    existing[0],
                ),
            )
            conn.commit()
            return {
                "ok": True,
                "id": existing[0],
                "email": mail,
                "created": False,
                "unsubscribe_token": unsub,
            }
        conn.execute(
            """
            INSERT INTO marketing_leads
              (id, email, vibes, acq_source, acq_medium, acq_campaign, landing_path, unsubscribe_token)
            VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s, %s)
            """,
            (
                lid,
                mail,
                _json(vibes or []),
                acq_source,
                acq_medium,
                acq_campaign,
                landing_path,
                token,
            ),
        )
        conn.commit()
    return {"ok": True, "id": lid, "email": mail, "created": True, "unsubscribe_token": token}


def lead_is_unsubscribed(email: str) -> bool:
    if not configured():
        return False
    mail = (email or "").strip().lower()
    if not mail:
        return False
    try:
        with connection() as conn:
            row = conn.execute(
                """
                SELECT unsubscribed_at FROM marketing_leads WHERE lower(email) = %s
                """,
                (mail,),
            ).fetchone()
        return bool(row and row[0])
    except Exception:
        return False


def unsubscribe_by_token(token: str) -> dict[str, Any]:
    tok = (token or "").strip()
    if not tok:
        return {"ok": False, "error": "missing_token"}
    if not configured():
        return {"ok": False, "error": "db_unset"}
    with connection() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE unsubscribe_token = %s",
            (tok,),
        ).fetchone()
        if row:
            uid = row[0]
            conn.execute(
                "UPDATE users SET newsletter = false, updated_at = now() WHERE id = %s",
                (uid,),
            )
            conn.execute(
                """
                UPDATE user_interests SET mail_frequency = 'off', updated_at = now()
                WHERE user_id = %s
                """,
                (uid,),
            )
            conn.execute(
                """
                UPDATE workflow_runs SET status = 'cancelled'
                WHERE user_id = %s AND status = 'pending'
                """,
                (uid,),
            )
            conn.commit()
            return {"ok": True, "message": "You're unsubscribed from marketing emails."}
        lead = conn.execute(
            "SELECT id, email FROM marketing_leads WHERE unsubscribe_token = %s",
            (tok,),
        ).fetchone()
        if not lead:
            return {"ok": False, "error": "invalid_token", "message": "Link expired or invalid."}
        conn.execute(
            "UPDATE marketing_leads SET unsubscribed_at = now() WHERE id = %s",
            (lead[0],),
        )
        conn.execute(
            """
            UPDATE workflow_runs SET status = 'cancelled'
            WHERE status = 'pending' AND lower(lead_email) = lower(%s)
            """,
            (lead[1],),
        )
        conn.commit()
    return {"ok": True, "message": "You're unsubscribed from marketing emails."}


def enqueue_workflow(
    *,
    user_id: str | None,
    workflow: str,
    step: str,
    due_at: datetime | None = None,
    lead_email: str | None = None,
    payload: dict | None = None,
) -> str | None:
    if not configured():
        return None
    rid = "wfr_" + _jid()[:20]
    when = due_at or _now()
    with connection() as conn:
        # avoid duplicate pending same step
        exists = conn.execute(
            """
            SELECT id FROM workflow_runs
            WHERE status = 'pending' AND workflow = %s AND step = %s
              AND (
                (user_id IS NOT NULL AND user_id = %s)
                OR (lead_email IS NOT NULL AND lower(lead_email) = lower(%s))
              )
            LIMIT 1
            """,
            (workflow, step, user_id, lead_email or ""),
        ).fetchone()
        if exists:
            return exists[0]
        conn.execute(
            """
            INSERT INTO workflow_runs
              (id, user_id, lead_email, workflow, step, due_at, status, payload)
            VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s::jsonb)
            """,
            (rid, user_id, lead_email, workflow, step, when, _json(payload or {})),
        )
        conn.commit()
    return rid


def due_workflow_runs(limit: int = 100) -> list[dict[str, Any]]:
    if not configured():
        return []
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, lead_email, workflow, step, due_at, payload
            FROM workflow_runs
            WHERE status = 'pending' AND due_at <= now()
            ORDER BY due_at ASC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    out = []
    for r in rows:
        out.append(
            {
                "id": r[0],
                "user_id": r[1],
                "lead_email": r[2],
                "workflow": r[3],
                "step": r[4],
                "due_at": r[5],
                "payload": r[6] or {},
            }
        )
    return out


def list_workflow_queue(limit: int = 40) -> list[dict[str, Any]]:
    """Pending journeys (due + upcoming) for the marketing admin."""
    if not configured():
        return []
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, user_id, lead_email, workflow, step, due_at, payload, status
            FROM workflow_runs
            WHERE status = 'pending'
            ORDER BY due_at ASC
            LIMIT %s
            """,
            (max(1, min(int(limit), 200)),),
        ).fetchall()
    out = []
    for r in rows:
        due = r[5]
        out.append(
            {
                "id": r[0],
                "user_id": r[1],
                "lead_email": r[2],
                "workflow": r[3],
                "step": r[4],
                "due_at": due.isoformat() if hasattr(due, "isoformat") else due,
                "payload": r[6] or {},
                "status": r[7],
            }
        )
    return out


def complete_workflow_run(run_id: str, status: str = "done") -> None:
    if not configured():
        return
    with connection() as conn:
        conn.execute(
            """
            UPDATE workflow_runs
            SET status = %s, completed_at = now()
            WHERE id = %s
            """,
            (status, run_id),
        )
        conn.commit()


def cancel_workflow(user_id: str, workflow: str) -> None:
    if not configured():
        return
    with connection() as conn:
        conn.execute(
            """
            UPDATE workflow_runs SET status = 'cancelled'
            WHERE user_id = %s AND workflow = %s AND status = 'pending'
            """,
            (user_id, workflow),
        )
        conn.commit()


def already_sent_today(user_id: str | None, campaign: str, to_email: str | None = None) -> bool:
    if not configured():
        return False
    with connection() as conn:
        if user_id:
            row = conn.execute(
                """
                SELECT 1 FROM email_sends
                WHERE user_id = %s AND campaign = %s
                  AND status = 'sent'
                  AND sent_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
                LIMIT 1
                """,
                (user_id, campaign),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT 1 FROM email_sends
                WHERE lower(to_email) = lower(%s) AND campaign = %s
                  AND status = 'sent'
                  AND sent_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
                LIMIT 1
                """,
                (to_email or "", campaign),
            ).fetchone()
    return bool(row)


def _marketing_cap_day() -> int:
    try:
        return max(1, int(os.getenv("MARKETING_MAX_PER_DAY") or "1"))
    except ValueError:
        return 1


def _marketing_cap_week() -> int:
    try:
        return max(1, int(os.getenv("MARKETING_MAX_PER_WEEK") or "3"))
    except ValueError:
        return 3


def _search_place_cooldown_days() -> int:
    try:
        return max(1, int(os.getenv("MARKETING_SEARCH_COOLDOWN_DAYS") or "14"))
    except ValueError:
        return 14


def count_marketing_sends(
    *,
    user_id: str | None = None,
    to_email: str | None = None,
    hours: int | None = None,
    days: int | None = None,
    campaign_prefix: str | None = None,
    campaign_exact: str | None = None,
) -> int:
    """Count successful marketing sends (excludes preview + failed/queued)."""
    if not configured():
        return 0
    if not user_id and not to_email:
        return 0
    clauses = [
        # Only count mail that actually left. Queued/failed SMTP must not burn caps.
        "status = 'sent'",
        # Parameterize LIKE so psycopg does not treat '%' as a placeholder.
        "campaign NOT LIKE %s",
    ]
    params: list[Any] = ["preview_%"]
    if user_id:
        clauses.append("user_id = %s")
        params.append(user_id)
    else:
        clauses.append("lower(to_email) = lower(%s)")
        params.append(to_email or "")
    if hours is not None:
        clauses.append("sent_at >= now() - (%s || ' hours')::interval")
        params.append(str(int(hours)))
    if days is not None:
        clauses.append("sent_at >= now() - (%s || ' days')::interval")
        params.append(str(int(days)))
    if campaign_prefix:
        clauses.append("campaign LIKE %s")
        params.append(f"{campaign_prefix}%")
    if campaign_exact:
        clauses.append("campaign = %s")
        params.append(campaign_exact)
    sql = f"SELECT COUNT(*) FROM email_sends WHERE {' AND '.join(clauses)}"
    with connection() as conn:
        row = conn.execute(sql, tuple(params)).fetchone()
    return int(row[0] or 0) if row else 0


def marketing_send_allowed(
    *,
    user_id: str | None,
    to_email: str | None,
    campaign: str,
) -> dict[str, Any]:
    """Global anti-spam gate for marketing mail. Transactional OTP/booking bypass this."""
    camp = str(campaign or "").strip()
    if camp.startswith("preview_"):
        return {"ok": True, "reason": "preview"}

    # Consent
    if user_id:
        user = get_user_email_row(user_id)
        if not user or not user.get("newsletter"):
            return {"ok": False, "reason": "no_consent"}
        freq = (get_interests(user_id).get("mail_frequency") or "daily").lower()
        if freq == "off":
            return {"ok": False, "reason": "frequency_off"}
    elif not to_email:
        return {"ok": False, "reason": "no_recipient"}
    elif lead_is_unsubscribed(to_email):
        return {"ok": False, "reason": "lead_unsubscribed"}

    if already_sent_today(user_id, camp, to_email):
        return {"ok": False, "reason": "already_sent_today"}

    day_n = count_marketing_sends(user_id=user_id, to_email=to_email, hours=24)
    if day_n >= _marketing_cap_day():
        return {"ok": False, "reason": "daily_cap", "sent_24h": day_n, "cap": _marketing_cap_day()}

    week_n = count_marketing_sends(user_id=user_id, to_email=to_email, days=7)
    if week_n >= _marketing_cap_week():
        return {"ok": False, "reason": "weekly_cap", "sent_7d": week_n, "cap": _marketing_cap_week()}

    # Search-triggered place mails: strict — 1/week family, long cooldown per city
    if camp.startswith("search_place_"):
        family_n = count_marketing_sends(
            user_id=user_id,
            to_email=to_email,
            days=7,
            campaign_prefix="search_place_",
        )
        if family_n >= 1:
            return {"ok": False, "reason": "search_family_weekly_cap"}
        cool = _search_place_cooldown_days()
        same = count_marketing_sends(
            user_id=user_id,
            to_email=to_email,
            days=cool,
            campaign_exact=camp,
        )
        if same >= 1:
            return {"ok": False, "reason": "search_place_cooldown", "days": cool}
        # Weekly-frequency users: no search mails (digest on Monday is enough)
        if user_id:
            freq = (get_interests(user_id).get("mail_frequency") or "daily").lower()
            if freq == "weekly":
                return {"ok": False, "reason": "weekly_pref_blocks_search"}

    return {"ok": True, "reason": "allowed"}


def log_email_send(
    *,
    to_email: str,
    campaign: str,
    template: str,
    subject: str,
    user_id: str | None = None,
    variant: str | None = None,
    status: str = "sent",
    payload: dict | None = None,
) -> str:
    sid = "esnd_" + _jid()[:20]
    if not configured():
        return sid
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO email_sends
              (id, user_id, to_email, campaign, template, variant, subject, status, payload)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
            """,
            (
                sid,
                user_id,
                to_email,
                campaign,
                template,
                variant,
                subject,
                status,
                _json(payload or {}),
            ),
        )
        conn.commit()
    return sid


def record_engagement(send_id: str, kind: str, url: str | None = None) -> None:
    if not configured() or not send_id:
        return
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO email_engagement (id, send_id, kind, url)
            VALUES (%s, %s, %s, %s)
            """,
            ("eng_" + _jid()[:18], send_id, kind, url),
        )
        conn.commit()


def get_send(send_id: str) -> dict[str, Any] | None:
    if not configured():
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, user_id, to_email, campaign, template, variant, subject, payload
            FROM email_sends WHERE id = %s
            """,
            (send_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "user_id": row[1],
        "to_email": row[2],
        "campaign": row[3],
        "template": row[4],
        "variant": row[5],
        "subject": row[6],
        "payload": row[7] or {},
    }


def seed_offers_if_empty() -> int:
    from supervisor.marketing_campaigns import SEED_OFFERS

    if not configured():
        return 0
    n = 0
    with connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM marketing_offers").fetchone()[0]
        if count and int(count) > 0:
            return 0
        for o in SEED_OFFERS:
            conn.execute(
                """
                INSERT INTO marketing_offers
                  (id, code, title, copy, image_url, targets, discount_type, discount_value, currency, active)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (
                    o["id"],
                    o["code"],
                    o["title"],
                    o.get("copy"),
                    o.get("image_url"),
                    _json(o.get("targets") or {}),
                    o.get("discount_type") or "percent",
                    o.get("discount_value") or 0,
                    o.get("currency") or "INR",
                    bool(o.get("active", True)),
                ),
            )
            n += 1
        conn.commit()
    return n


def list_offers(*, active_only: bool = True, vibes: list[str] | None = None) -> list[dict[str, Any]]:
    if not configured():
        from supervisor.marketing_campaigns import SEED_OFFERS

        return list(SEED_OFFERS)
    seed_offers_if_empty()
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT id, code, title, copy, image_url, targets, discount_type, discount_value,
                   currency, starts_at, ends_at, active
            FROM marketing_offers
            WHERE (%s = false OR active = true)
              AND (starts_at IS NULL OR starts_at <= now())
              AND (ends_at IS NULL OR ends_at >= now())
            ORDER BY created_at DESC
            """,
            (active_only,),
        ).fetchall()
    out = []
    vibe_set = {str(v).lower() for v in (vibes or [])}
    for r in rows:
        targets = r[5] or {}
        target_vibes = [str(x).lower() for x in (targets.get("vibes") or [])]
        if vibe_set and target_vibes and not (vibe_set & set(target_vibes)):
            continue
        out.append(
            {
                "id": r[0],
                "code": r[1],
                "title": r[2],
                "copy": r[3],
                "image_url": r[4],
                "targets": targets,
                "discount_type": r[6],
                "discount_value": float(r[7] or 0),
                "currency": r[8],
                "starts_at": r[9].isoformat() if r[9] else None,
                "ends_at": r[10].isoformat() if r[10] else None,
                "active": bool(r[11]),
            }
        )
    return out


def validate_offer(code: str, *, vibes: list[str] | None = None) -> dict[str, Any]:
    offers = list_offers(active_only=True, vibes=None)
    c = (code or "").strip().upper()
    for o in offers:
        if str(o.get("code") or "").upper() == c:
            return {
                "ok": True,
                "valid": True,
                "offer": o,
                "message": f"{o['title']} applied.",
            }
    return {"ok": True, "valid": False, "message": "Invalid or expired promo code."}


def upsert_offer(data: dict[str, Any]) -> dict[str, Any]:
    if not configured():
        return {"ok": False, "error": "db_unset"}
    oid = data.get("id") or ("offer_" + _jid()[:16])
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO marketing_offers
              (id, code, title, copy, image_url, targets, discount_type, discount_value, currency, active)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
              code = EXCLUDED.code,
              title = EXCLUDED.title,
              copy = EXCLUDED.copy,
              image_url = EXCLUDED.image_url,
              targets = EXCLUDED.targets,
              discount_type = EXCLUDED.discount_type,
              discount_value = EXCLUDED.discount_value,
              currency = EXCLUDED.currency,
              active = EXCLUDED.active
            """,
            (
                oid,
                str(data.get("code") or "").upper(),
                data.get("title") or "Offer",
                data.get("copy"),
                data.get("image_url"),
                _json(data.get("targets") or {}),
                data.get("discount_type") or "percent",
                float(data.get("discount_value") or 0),
                data.get("currency") or "INR",
                bool(data.get("active", True)),
            ),
        )
        conn.commit()
    return {"ok": True, "id": oid}


def marketing_stats() -> dict[str, Any]:
    if not configured():
        return {"ok": True, "sends": [], "totals": {}}
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT campaign,
                   COUNT(*) AS sent,
                   COUNT(*) FILTER (
                     WHERE EXISTS (
                       SELECT 1 FROM email_engagement e
                       WHERE e.send_id = email_sends.id AND e.kind = 'open'
                     )
                   ) AS opens,
                   COUNT(*) FILTER (
                     WHERE EXISTS (
                       SELECT 1 FROM email_engagement e
                       WHERE e.send_id = email_sends.id AND e.kind = 'click'
                     )
                   ) AS clicks
            FROM email_sends
            WHERE sent_at >= now() - interval '30 days'
            GROUP BY campaign
            ORDER BY sent DESC
            """
        ).fetchall()
    sends = [
        {"campaign": r[0], "sent": int(r[1]), "opens": int(r[2]), "clicks": int(r[3])}
        for r in rows
    ]
    return {"ok": True, "sends": sends, "totals": {
        "sent": sum(s["sent"] for s in sends),
        "opens": sum(s["opens"] for s in sends),
        "clicks": sum(s["clicks"] for s in sends),
    }}


def get_or_assign_ab_variant(user_id: str, campaign: str) -> str:
    """Sticky A/B subject variant; respect lock if present."""
    if not configured():
        return "A"
    with connection() as conn:
        lock = conn.execute(
            "SELECT winner_variant FROM ab_subject_locks WHERE campaign = %s",
            (campaign,),
        ).fetchone()
        if lock and lock[0]:
            return lock[0]
        prev = conn.execute(
            """
            SELECT variant FROM email_sends
            WHERE user_id = %s AND campaign = %s AND variant IS NOT NULL
            ORDER BY sent_at DESC LIMIT 1
            """,
            (user_id, campaign),
        ).fetchone()
        if prev and prev[0]:
            return prev[0]
    # stable hash
    h = sum(ord(c) for c in (user_id or ""))
    return "A" if h % 2 == 0 else "B"


def maybe_lock_ab_winner(campaign: str, min_sends: int = 40) -> dict[str, Any] | None:
    if not configured():
        return None
    with connection() as conn:
        existing = conn.execute(
            "SELECT winner_variant FROM ab_subject_locks WHERE campaign = %s",
            (campaign,),
        ).fetchone()
        if existing:
            return {"winner": existing[0], "already": True}
        rows = conn.execute(
            """
            SELECT variant, COUNT(*) AS n,
              COUNT(*) FILTER (
                WHERE EXISTS (
                  SELECT 1 FROM email_engagement e
                  WHERE e.send_id = email_sends.id AND e.kind = 'open'
                )
              ) AS opens
            FROM email_sends
            WHERE campaign = %s AND variant IN ('A', 'B')
            GROUP BY variant
            """,
            (campaign,),
        ).fetchall()
        stats = {r[0]: {"sent": int(r[1]), "opens": int(r[2])} for r in rows}
        if sum(v["sent"] for v in stats.values()) < min_sends:
            return None
        best = None
        best_rate = -1.0
        for var, s in stats.items():
            rate = (s["opens"] / s["sent"]) if s["sent"] else 0
            if rate > best_rate:
                best_rate = rate
                best = var
        if not best:
            return None
        conn.execute(
            """
            INSERT INTO ab_subject_locks (campaign, winner_variant, stats)
            VALUES (%s, %s, %s::jsonb)
            ON CONFLICT (campaign) DO NOTHING
            """,
            (campaign, best, _json(stats)),
        )
        conn.commit()
    return {"winner": best, "stats": stats}


def recompute_contact_score(user_id: str) -> dict[str, Any]:
    if not configured():
        return {"score": 0}
    with connection() as conn:
        opens = conn.execute(
            """
            SELECT COUNT(*) FROM email_engagement e
            JOIN email_sends s ON s.id = e.send_id
            WHERE s.user_id = %s AND e.kind = 'open'
              AND e.created_at >= now() - interval '90 days'
            """,
            (user_id,),
        ).fetchone()[0]
        clicks = conn.execute(
            """
            SELECT COUNT(*) FROM email_engagement e
            JOIN email_sends s ON s.id = e.send_id
            WHERE s.user_id = %s AND e.kind = 'click'
              AND e.created_at >= now() - interval '90 days'
            """,
            (user_id,),
        ).fetchone()[0]
        searches = conn.execute(
            """
            SELECT COUNT(*) FROM interest_events
            WHERE user_id = %s AND event_type IN ('search', 'vibe_tap', 'save')
              AND created_at >= now() - interval '90 days'
            """,
            (user_id,),
        ).fetchone()[0]
        bookings = conn.execute(
            """
            SELECT COUNT(*), COALESCE(SUM(amount), 0) FROM bookings
            WHERE payload->>'user_id' = %s OR device_id IN (
              SELECT id FROM devices WHERE user_id = %s
            )
            """,
            (user_id, user_id),
        ).fetchone()
        last_open = conn.execute(
            """
            SELECT MAX(e.created_at) FROM email_engagement e
            JOIN email_sends s ON s.id = e.send_id
            WHERE s.user_id = %s AND e.kind = 'open'
            """,
            (user_id,),
        ).fetchone()[0]
        # preferred hour from opens
        hour_row = conn.execute(
            """
            SELECT EXTRACT(HOUR FROM e.created_at AT TIME ZONE 'UTC')::int AS h, COUNT(*)
            FROM email_engagement e
            JOIN email_sends s ON s.id = e.send_id
            WHERE s.user_id = %s AND e.kind = 'open'
            GROUP BY h ORDER BY COUNT(*) DESC LIMIT 1
            """,
            (user_id,),
        ).fetchone()
    book_n = int(bookings[0] or 0)
    book_val = float(bookings[1] or 0)
    engagement = float(opens) * 2 + float(clicks) * 4 + float(searches) * 1.5 + book_n * 20
    recency_days = None
    if last_open:
        if last_open.tzinfo is None:
            last_open = last_open.replace(tzinfo=timezone.utc)
        recency_days = max(0, int((_now() - last_open).total_seconds() // 86400))
        if recency_days > 30:
            engagement *= 0.7
    score = min(100.0, engagement)
    pref_hour = int(hour_row[0]) if hour_row else 9
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO contact_scores
              (user_id, engagement, recency_days, booking_value, score, preferred_send_hour, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (user_id) DO UPDATE SET
              engagement = EXCLUDED.engagement,
              recency_days = EXCLUDED.recency_days,
              booking_value = EXCLUDED.booking_value,
              score = EXCLUDED.score,
              preferred_send_hour = EXCLUDED.preferred_send_hour,
              updated_at = now()
            """,
            (user_id, engagement, recency_days, book_val, score, pref_hour),
        )
        conn.commit()
    return {
        "user_id": user_id,
        "engagement": engagement,
        "recency_days": recency_days,
        "booking_value": book_val,
        "score": score,
        "preferred_send_hour": pref_hour,
    }


def get_contact_score(user_id: str) -> dict[str, Any]:
    if not configured():
        return {"score": 0}
    with connection() as conn:
        row = conn.execute(
            """
            SELECT engagement, recency_days, booking_value, score, preferred_send_hour
            FROM contact_scores WHERE user_id = %s
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return recompute_contact_score(user_id)
    return {
        "user_id": user_id,
        "engagement": float(row[0] or 0),
        "recency_days": row[1],
        "booking_value": float(row[2] or 0),
        "score": float(row[3] or 0),
        "preferred_send_hour": row[4],
    }


def list_segments() -> list[dict[str, Any]]:
    defaults = [
        {
            "id": "seg_beach_in",
            "name": "Beach lovers (IN)",
            "rules": {"vibes_any": ["beach", "islands"], "home_country": "IN", "min_score": 0},
        },
        {
            "id": "seg_hiking",
            "name": "Hiking & trekking",
            "rules": {"vibes_any": ["hiking", "trekking", "hills"], "min_score": 10},
        },
        {
            "id": "seg_engaged",
            "name": "Engaged (score ≥ 40)",
            "rules": {"min_score": 40},
        },
        {
            "id": "seg_newsletter",
            "name": "All newsletter (digest-eligible)",
            "rules": {"min_score": 0},
        },
        {
            "id": "seg_heritage_in",
            "name": "Heritage / palaces (IN)",
            "rules": {"vibes_any": ["heritage", "city"], "home_country": "IN", "min_score": 0},
        },
    ]
    if not configured():
        return defaults
    with connection() as conn:
        rows = conn.execute(
            "SELECT id, name, rules FROM marketing_segments ORDER BY created_at"
        ).fetchall()
    if not rows:
        with connection() as conn:
            for s in defaults:
                conn.execute(
                    """
                    INSERT INTO marketing_segments (id, name, rules)
                    VALUES (%s, %s, %s::jsonb)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (s["id"], s["name"], _json(s["rules"])),
                )
            conn.commit()
        return defaults
    return [{"id": r[0], "name": r[1], "rules": r[2] or {}} for r in rows]


def user_matches_segment(user_id: str, rules: dict[str, Any]) -> bool:
    interests = get_interests(user_id)
    score = get_contact_score(user_id)
    vibe_ids = set()
    for v in interests.get("vibes") or []:
        if isinstance(v, str):
            vibe_ids.add(v.lower())
        elif isinstance(v, dict) and v.get("id"):
            vibe_ids.add(str(v["id"]).lower())
    any_vibes = [str(x).lower() for x in (rules.get("vibes_any") or [])]
    if any_vibes and not (vibe_ids & set(any_vibes)):
        return False
    hc = (rules.get("home_country") or "").upper()
    if hc and (interests.get("home_country") or "").upper() != hc:
        return False
    min_score = float(rules.get("min_score") or 0)
    if float(score.get("score") or 0) < min_score:
        return False
    return True


def digest_recipients(limit: int = 200) -> list[dict[str, Any]]:
    if not configured():
        return []
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT u.id, u.email, u.name, u.newsletter, ui.mail_frequency, ui.vibes, ui.home_country
            FROM users u
            LEFT JOIN user_interests ui ON ui.user_id = u.id
            WHERE u.newsletter = true
              AND u.email IS NOT NULL
              AND COALESCE(ui.mail_frequency, 'daily') IN ('daily', 'weekly')
            ORDER BY u.created_at DESC
            LIMIT %s
            """,
            (limit,),
        ).fetchall()
    out = []
    weekday = _now().weekday()  # Mon=0
    for r in rows:
        freq = (r[4] or "daily").lower()
        if freq == "weekly" and weekday != 0:
            continue
        out.append(
            {
                "user_id": r[0],
                "email": r[1],
                "name": r[2],
                "mail_frequency": freq,
                "vibes": r[5] or [],
                "home_country": r[6],
            }
        )
    return out


def users_matching_segment(rules: dict[str, Any], *, limit: int = 50) -> list[dict[str, Any]]:
    recips = digest_recipients(limit=max(int(limit) * 8, 80))
    matched: list[dict[str, Any]] = []
    for row in recips:
        uid = row.get("user_id")
        if not uid:
            continue
        if user_matches_segment(str(uid), rules or {}):
            matched.append(row)
        if len(matched) >= max(1, min(int(limit), 100)):
            break
    return matched


def get_user_email_row(user_id: str) -> dict[str, Any] | None:
    if not configured():
        return None
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, email, name, newsletter, unsubscribe_token, referral_code
            FROM users WHERE id = %s
            """,
            (user_id,),
        ).fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "email": row[1],
        "name": row[2],
        "newsletter": bool(row[3]),
        "unsubscribe_token": row[4],
        "referral_code": row[5],
    }


def attach_referral(referrer_code: str, referee_user_id: str) -> dict[str, Any]:
    if not configured():
        return {"ok": False}
    code = (referrer_code or "").strip().upper()
    if not code:
        return {"ok": False, "error": "missing_code"}
    with connection() as conn:
        ref = conn.execute(
            "SELECT id FROM users WHERE upper(referral_code) = %s",
            (code,),
        ).fetchone()
        if not ref:
            return {"ok": False, "error": "invalid_code"}
        if ref[0] == referee_user_id:
            return {"ok": False, "error": "self_referral"}
        rid = "ref_" + _jid()[:18]
        conn.execute(
            """
            INSERT INTO referrals (id, code, referrer_user_id, referee_user_id, status)
            VALUES (%s, %s, %s, %s, 'pending')
            """,
            (rid, code, ref[0], referee_user_id),
        )
        conn.commit()
    return {"ok": True, "id": rid}
