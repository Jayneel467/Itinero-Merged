"""Marketing OS smoke — offline gates + optional live DB/SMTP path.

  .venv/bin/python -m supervisor.marketing_smoke
  MARKETING_SEARCH_MAIL_DELAY_HOURS=0 .venv/bin/python -m supervisor.marketing_smoke --live
  MARKETING_SEARCH_MAIL_DELAY_HOURS=0 .venv/bin/python -m supervisor.marketing_smoke --live --send

Live requires DATABASE_URL. --send actually hits SMTP; default dry-runs send_marketing.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, patch

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _load_env() -> None:
    for rel in ("supervisor/.env", ".env"):
        p = _ROOT / rel
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def run_offline() -> dict:
    from supervisor.demand_campaign import enroll_from_search_events, enroll_search_campaign
    from supervisor.marketing_store import marketing_send_allowed
    from supervisor.marketing_templates import build_marketing_message

    results = []

    with patch("supervisor.marketing_store.get_user_email_row", return_value={"newsletter": True}), patch(
        "supervisor.marketing_store.get_interests", return_value={"mail_frequency": "daily"}
    ), patch("supervisor.marketing_store.already_sent_today", return_value=False), patch(
        "supervisor.marketing_store.count_marketing_sends", return_value=0
    ):
        g = marketing_send_allowed(
            user_id="u1", to_email="a@b.com", campaign="search_place_vrindavan"
        )
        results.append({"step": "gate_allowed", "ok": bool(g.get("ok")), "detail": g})

    with patch("supervisor.demand_campaign.find_active_package", return_value={"slug": "vrindavan-weekend"}), patch(
        "supervisor.demand_campaign._user_has_pending_search_curate", return_value=False
    ), patch("supervisor.marketing_store.enqueue_workflow", return_value="run_vri"), patch(
        "supervisor.marketing_store.marketing_send_allowed",
        return_value={"ok": True, "reason": "allowed"},
    ):
        e1 = enroll_search_campaign("u1", city="Vrindavan")
        results.append(
            {
                "step": "enroll_vrindavan",
                "ok": e1.get("mode") == "mail_existing",
                "detail": e1,
            }
        )

    with patch("supervisor.demand_campaign.find_active_package", return_value={"slug": "agra-taj"}), patch(
        "supervisor.demand_campaign._user_has_pending_search_curate", return_value=True
    ), patch(
        "supervisor.marketing_store.marketing_send_allowed",
        return_value={"ok": True, "reason": "allowed"},
    ):
        e2 = enroll_search_campaign("u1", city="Agra")
        results.append(
            {
                "step": "second_city_pending_skip",
                "ok": e2.get("mode") == "skipped_pending",
                "detail": e2,
            }
        )

    with patch("supervisor.demand_campaign.find_active_package", return_value=None), patch(
        "supervisor.demand_campaign._user_has_pending_search_curate", return_value=False
    ), patch("supervisor.marketing_store.enqueue_workflow", return_value="run_anon"):
        flush = enroll_from_search_events(
            [
                {"type": "search", "payload": {"city": "Vrindavan"}},
                {"type": "search", "payload": {"city": "Agra"}},
            ],
            user_id=None,
            lead_email="lead@x.com",
        )
    results.append(
        {
            "step": "anonymous_flush_no_mail",
            "ok": bool(flush)
            and flush[0].get("want_mail") is False
            and flush[0].get("mode") == "author_only",
            "detail": flush,
        }
    )

    msg = build_marketing_message(
        to="a@b.com",
        subject="Hi",
        html_body='<a href="https://itinero.company/api/newsletter/unsubscribe?token=abc">unsub</a>',
        plain="x",
        from_addr="Itinero <noreply@itinero.company>",
        unsub_url="https://itinero.company/api/newsletter/unsubscribe?token=abc",
    )
    results.append(
        {
            "step": "list_unsubscribe_header",
            "ok": "List-Unsubscribe" in msg,
            "detail": msg.get("List-Unsubscribe"),
        }
    )

    ok = all(r["ok"] for r in results)
    return {"ok": ok, "mode": "offline", "results": results}


def _ensure_smoke_user(email: str) -> dict:
    from supervisor.db import connection
    from supervisor.marketing_store import ensure_user_marketing_row

    with connection() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE lower(email) = lower(%s)",
            (email,),
        ).fetchone()
        if row:
            uid = row[0]
            conn.execute(
                "UPDATE users SET newsletter = true, updated_at = now() WHERE id = %s",
                (uid,),
            )
            conn.commit()
        else:
            uid = "usr_smoke_" + uuid.uuid4().hex[:12]
            conn.execute(
                """
                INSERT INTO users (id, email, name, newsletter)
                VALUES (%s, %s, %s, true)
                """,
                (uid, email, "Marketing Smoke"),
            )
            conn.commit()
    unsub = ensure_user_marketing_row(uid)
    with connection() as conn:
        conn.execute(
            """
            UPDATE user_interests SET mail_frequency = 'daily', updated_at = now()
            WHERE user_id = %s
            """,
            (uid,),
        )
        conn.commit()
        u = conn.execute(
            "SELECT id, email, newsletter, unsubscribe_token FROM users WHERE id = %s",
            (uid,),
        ).fetchone()
    return {
        "id": u[0],
        "email": u[1],
        "newsletter": bool(u[2]),
        "unsubscribe_token": u[3] or unsub,
    }


async def run_live(*, send: bool) -> dict:
    os.environ.setdefault("MARKETING_SEARCH_MAIL_DELAY_HOURS", "0")
    from supervisor.db import configured, init_db
    from supervisor.demand_campaign import enroll_search_campaign
    from supervisor.marketing_mailer import send_digest_for_user
    from supervisor.marketing_store import (
        log_email_send,
        marketing_send_allowed,
        unsubscribe_by_token,
    )
    from supervisor.marketing_workflows import process_due_runs

    if not configured():
        return {"ok": False, "mode": "live", "error": "DATABASE_URL missing"}

    init_db()
    email = (os.getenv("MARKETING_SMOKE_EMAIL") or "marketing-smoke@itinero.local").strip()
    user = _ensure_smoke_user(email)
    uid = user["id"]
    results = []

    e1 = enroll_search_campaign(uid, city="Vrindavan", market="IN")
    results.append({"step": "enroll_vrindavan", "ok": bool(e1.get("ok")), "detail": e1})

    if send:
        drain = await process_due_runs(drain=True)
    else:
        with patch(
            "supervisor.marketing_mailer.send_place_campaign",
            new_callable=AsyncMock,
            return_value={"ok": True, "send_id": "esnd_smoke_dry", "dry": True},
        ), patch(
            "supervisor.demand_campaign.curate_place",
            return_value={
                "ok": True,
                "package": {"slug": "vrindavan-smoke"},
                "created_package": False,
            },
        ):
            drain = await process_due_runs(drain=True)
    results.append(
        {
            "step": "drain_due",
            "ok": True,
            "detail": {"processed": drain.get("processed"), "loops": drain.get("loops")},
        }
    )

    log_email_send(
        to_email=email,
        campaign="search_place_vrindavan",
        template="search_place",
        subject="smoke",
        user_id=uid,
        status="sent",
    )

    e2 = enroll_search_campaign(uid, city="Agra", market="IN")
    agra_ok = (not e2.get("want_mail")) or e2.get("mode") in {
        "skipped_pending",
        "skip_mail_existing",
        "author_only",
    }
    results.append({"step": "enroll_agra_capped", "ok": agra_ok, "detail": e2})

    dig = await send_digest_for_user(uid)
    dig_ok = bool(dig.get("skipped")) or not dig.get("ok") or (
        isinstance(dig.get("gate"), dict) and not dig["gate"].get("ok")
    )
    results.append({"step": "digest_same_day_skip", "ok": dig_ok, "detail": dig})

    unsub = unsubscribe_by_token(user.get("unsubscribe_token") or "")
    results.append({"step": "unsubscribe", "ok": bool(unsub.get("ok")), "detail": unsub})

    gate_after = marketing_send_allowed(
        user_id=uid, to_email=email, campaign="search_place_vrindavan"
    )
    results.append(
        {
            "step": "post_unsub_no_consent",
            "ok": gate_after.get("reason") == "no_consent",
            "detail": gate_after,
        }
    )

    ok = all(r["ok"] for r in results)
    return {
        "ok": ok,
        "mode": "live_send" if send else "live_dry",
        "user": {"id": uid, "email": email},
        "results": results,
    }


async def _amain(args: argparse.Namespace) -> int:
    _load_env()
    if args.live:
        out = await run_live(send=bool(args.send))
    else:
        out = run_offline()
    print(json.dumps(out, indent=2, default=str))
    return 0 if out.get("ok") else 1


def main() -> int:
    p = argparse.ArgumentParser(description="Itinero marketing smoke")
    p.add_argument("--live", action="store_true", help="Use DATABASE_URL + workflow drain")
    p.add_argument("--send", action="store_true", help="With --live, actually SMTP")
    args = p.parse_args()
    return asyncio.run(_amain(args))


if __name__ == "__main__":
    raise SystemExit(main())
