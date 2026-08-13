"""Fixed journey workflows: signup onboarding, digests, booking follow-up."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from supervisor import marketing_store as store
from supervisor.marketing_mailer import (
    send_signup_spark,
    send_trip_idea,
    send_signup_offer,
    send_digest_for_user,
    send_booking_followup,
)
from supervisor.marketing_store import _now

log = logging.getLogger("itinero.marketing.workflows")


def enroll_signup_onboarding(user_id: str, *, newsletter: bool = True) -> dict[str, Any]:
    """Called from complete_signup — day-0 marketing clock starts here."""
    if not user_id:
        return {"ok": False}
    store.ensure_user_marketing_row(user_id)
    if not newsletter:
        return {"ok": True, "enrolled": False, "reason": "newsletter_off"}
    now = _now()
    store.enqueue_workflow(
        user_id=user_id,
        workflow="signup_onboarding",
        step="spark",
        due_at=now,
    )
    store.enqueue_workflow(
        user_id=user_id,
        workflow="signup_onboarding",
        step="trip_idea",
        due_at=now + timedelta(days=1),
    )
    store.enqueue_workflow(
        user_id=user_id,
        workflow="signup_onboarding",
        step="offer",
        due_at=now + timedelta(days=3),
    )
    store.enqueue_workflow(
        user_id=user_id,
        workflow="signup_onboarding",
        step="handoff",
        due_at=now + timedelta(days=7),
    )
    return {"ok": True, "enrolled": True}


def enroll_booking_followup(user_id: str, destination: str = "") -> None:
    if not user_id:
        return
    store.enqueue_workflow(
        user_id=user_id,
        workflow="booking_followup",
        step="more_like",
        due_at=_now() + timedelta(days=2),
        payload={"destination": destination},
    )


def mark_user_activated(user_id: str) -> None:
    """Skip remaining onboarding if they already searched/booked."""
    store.cancel_workflow(user_id, "signup_onboarding")


async def process_due_runs(limit: int = 100, *, drain: bool = False, max_loops: int = 8) -> dict[str, Any]:
    """Run due workflows. drain=True keeps pulling until none due (author→mail same tick)."""
    if drain:
        all_results: list[dict[str, Any]] = []
        loops = 0
        while loops < max(1, int(max_loops)):
            loops += 1
            out = await process_due_runs(limit=limit, drain=False)
            all_results.extend(out.get("results") or [])
            if not out.get("processed"):
                break
        return {
            "ok": True,
            "processed": len(all_results),
            "loops": loops,
            "results": all_results,
        }

    runs = store.due_workflow_runs(limit=limit)
    results = []
    for run in runs:
        rid = run["id"]
        uid = run.get("user_id")
        wf = run.get("workflow")
        step = run.get("step")
        try:
            if wf == "signup_onboarding" and uid:
                user = store.get_user_email_row(uid)
                if not user or not user.get("newsletter"):
                    store.complete_workflow_run(rid, "cancelled")
                    results.append({"id": rid, "status": "cancelled"})
                    continue
                if step == "spark":
                    out = await send_signup_spark(uid)
                elif step == "trip_idea":
                    out = await send_trip_idea(uid)
                elif step == "offer":
                    out = await send_signup_offer(uid)
                elif step == "handoff":
                    out = await send_digest_for_user(uid)
                else:
                    out = {"ok": True, "skipped": True}
                store.complete_workflow_run(rid, "done" if out.get("ok") else "failed")
                results.append({"id": rid, "step": step, "result": out})
            elif wf == "booking_followup" and uid and step == "more_like":
                dest = (run.get("payload") or {}).get("destination") or ""
                out = await send_booking_followup(uid, dest)
                store.complete_workflow_run(rid, "done" if out.get("ok") else "failed")
                results.append({"id": rid, "result": out})
            elif wf == "search_curate":
                from supervisor.demand_campaign import process_search_curate_run

                out = await process_search_curate_run(run)
                results.append({"id": rid, "result": out})
            else:
                store.complete_workflow_run(rid, "skipped")
                results.append({"id": rid, "status": "skipped"})
        except Exception as e:
            log.exception("workflow run failed %s", rid)
            store.complete_workflow_run(rid, "failed")
            results.append({"id": rid, "error": str(e)})
    return {"ok": True, "processed": len(results), "results": results}


async def run_daily_digests(limit: int = 200) -> dict[str, Any]:
    recipients = store.digest_recipients(limit=limit)
    sent = 0
    skipped = 0
    errors = 0
    for r in recipients:
        # skip users still in early onboarding (< 7 days) — optional: allow if handoff done
        try:
            out = await send_digest_for_user(r["user_id"])
            if out.get("ok") and not out.get("skipped"):
                sent += 1
            else:
                skipped += 1
            store.recompute_contact_score(r["user_id"])
        except Exception:
            errors += 1
            log.exception("digest failed for %s", r.get("user_id"))
    return {"ok": True, "sent": sent, "skipped": skipped, "errors": errors, "candidates": len(recipients)}
