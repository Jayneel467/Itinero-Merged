"""Demand campaign agent: search signal → Gemini curate package/explore → mail.

Example: user searches Vrindavan → if no active package, Gemini authors + publishes
a Vrindavan package (and Explore row) → traveler gets a trip-idea style email.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import timedelta
from typing import Any

from supervisor import marketing_store as store
from supervisor.marketing_store import _now

log = logging.getLogger("itinero.demand_campaign")

_SLUG_RE = re.compile(r"[^a-z0-9\-]+")


def search_mail_delay() -> timedelta:
    """Hours to wait before search-place mail. 0 = same cron tick (staging)."""
    raw = (os.getenv("MARKETING_SEARCH_MAIL_DELAY_HOURS") or "4").strip()
    try:
        hours = float(raw)
    except ValueError:
        hours = 4.0
    return timedelta(hours=max(0.0, hours))


def _slugify(raw: str) -> str:
    s = str(raw or "").strip().lower().replace(" ", "-")
    return _SLUG_RE.sub("", s).strip("-")[:60] or "place"


def _city_from_payload(payload: dict | None) -> tuple[str, str]:
    p = payload or {}
    city = str(p.get("city") or p.get("destination") or p.get("q") or "").strip()
    country = str(p.get("country") or "").strip()
    return city, country


def find_active_package(city: str, *, market: str | None = None) -> dict[str, Any] | None:
    needle = str(city or "").strip().lower()
    if not needle:
        return None
    try:
        from supervisor.packages_structured import list_packages

        rows = list_packages(q=needle, market=market).get("packages") or []
    except Exception:
        log.exception("list_packages failed for %s", city)
        return None
    for pkg in rows:
        dests = " ".join(str(d) for d in (pkg.get("destinations") or [])).lower()
        title = str(pkg.get("title") or "").lower()
        stay = str((pkg.get("stay") or {}).get("city") or "").lower()
        if needle in dests or needle in title or needle in stay:
            return pkg
    return None


def find_explore_destination(city: str) -> dict[str, Any] | None:
    needle = str(city or "").strip().lower()
    if not needle:
        return None
    try:
        from supervisor.explore_structured import find_destination, list_destinations

        by_id = find_destination(_slugify(needle))
        if by_id:
            return by_id
        rows = list_destinations(q=needle).get("destinations") or []
        for d in rows:
            if needle == str(d.get("city") or "").lower() or needle in str(d.get("city") or "").lower():
                return d
    except Exception:
        log.exception("explore lookup failed for %s", city)
    return None


def curate_place(
    city: str,
    *,
    market: str = "IN",
    country: str | None = None,
    publish: bool = True,
) -> dict[str, Any]:
    """If package missing, Gemini-author + check + reverify + publish. Same for Explore."""
    place = str(city or "").strip()
    if not place:
        return {"ok": False, "error": "city_required"}
    market_s = str(market or "IN").strip().upper() or "IN"

    existing_pkg = find_active_package(place, market=market_s)
    existing_exp = find_explore_destination(place)
    out: dict[str, Any] = {
        "ok": True,
        "city": place,
        "package": existing_pkg,
        "explore": existing_exp,
        "created_package": False,
        "created_explore": False,
        "gemini": False,
    }

    if existing_pkg and existing_exp:
        out["reason"] = "already_active"
        return out

    # Existing package / explore slugs for LLM avoid-list
    try:
        from supervisor.packages_structured import list_packages

        existing_slugs = [
            str(p.get("slug") or p.get("id") or "")
            for p in (list_packages(market=market_s).get("packages") or [])
        ]
    except Exception:
        existing_slugs = []
    try:
        from supervisor.explore_structured import list_destinations

        existing_ids = [
            str(d.get("id") or d.get("slug") or "")
            for d in (list_destinations(market=market_s).get("destinations") or [])
        ]
    except Exception:
        existing_ids = []

    if not existing_pkg:
        from supervisor.package_factory.llm_author import llm_author_package_for_place
        from supervisor.package_factory.checker import check_template
        from supervisor.package_factory.reverify import reverify_template_sync
        from supervisor.package_factory.publisher import publish_to_live, save_draft

        authored = llm_author_package_for_place(
            place,
            market=market_s,
            country=country,
            existing_slugs=existing_slugs,
        )
        out["gemini"] = True
        out["package_author"] = {
            "ok": authored.get("ok"),
            "provider": authored.get("provider"),
            "error": authored.get("error"),
        }
        pkgs = authored.get("packages") or []
        if pkgs:
            pkg = pkgs[0]
            checked = check_template(pkg)
            pkg = checked.get("package") or pkg
            save_draft(pkg)
            if checked.get("ok") or str((pkg.get("pipeline") or {}).get("status") or "") != "rejected":
                rev = reverify_template_sync(pkg, probe_live=False)
                pkg = rev.get("package") or pkg
                save_draft(pkg)
                if publish:
                    pub = publish_to_live(pkg, require_reverified=False)
                    out["package_publish"] = pub
                    if pub.get("ok"):
                        out["created_package"] = True
                        out["package"] = find_active_package(place, market=market_s) or pkg
            else:
                out["package_check"] = checked

    if not existing_exp:
        from supervisor.explore_factory.llm_author import llm_author_destination_for_place
        from supervisor.explore_factory.checker import check_destination
        from supervisor.explore_factory.reverify import reverify_destination
        from supervisor.explore_factory.publisher import publish_to_live as publish_explore
        from supervisor.explore_factory.publisher import save_draft as save_explore_draft

        authored = llm_author_destination_for_place(
            place,
            market=market_s,
            country=country,
            existing_ids=existing_ids,
        )
        out["gemini"] = True
        out["explore_author"] = {
            "ok": authored.get("ok"),
            "provider": authored.get("provider"),
            "error": authored.get("error"),
        }
        dests = authored.get("destinations") or []
        if dests:
            dest = dests[0]
            # Allow missing coords: checker may still pass with warnings
            if not dest.get("lat") and not dest.get("lng"):
                # Mathura/Vrindavan-ish fallback if LLM omitted coords
                if "vrindavan" in place.lower() or "mathura" in place.lower():
                    dest["lat"], dest["lng"] = 27.5806, 77.7006
            checked = check_destination(dest)
            dest = checked.get("destination") or dest
            save_explore_draft(dest)
            rev = reverify_destination(dest, probe_live=False)
            dest = rev.get("destination") or dest
            save_explore_draft(dest)
            if publish:
                pub = publish_explore(dest, require_reverified=False)
                out["explore_publish"] = pub
                if pub.get("ok"):
                    out["created_explore"] = True
                    out["explore"] = find_explore_destination(place) or dest

    out["ok"] = bool(out.get("package") or out.get("explore") or out.get("created_package") or out.get("created_explore"))
    if not out["ok"] and not existing_pkg:
        out["error"] = out.get("package_author", {}).get("error") or "curate_failed"
    return out


def enroll_search_campaign(
    user_id: str | None,
    *,
    city: str,
    country: str | None = None,
    market: str | None = None,
    lead_email: str | None = None,
) -> dict[str, Any]:
    """Enqueue curate for a searched place; mail only when under anti-spam caps.

    Catalog curation can always run. Email is optional and rate-limited so
    searching 5 cities never means 5 inbox hits.
    """
    place = str(city or "").strip()
    if not place or (not user_id and not lead_email):
        return {"ok": False, "error": "missing_user_or_city"}
    slug = _slugify(place)
    market_s = (market or "IN").strip().upper()
    payload = {"city": place, "country": country or "", "market": market_s, "slug": slug}
    camp = f"search_place_{slug}"

    # Mail requires a signed-in user with newsletter consent. Lead-only has no
    # consent row; FE also never sends lead_email. Curate catalog anyway.
    mail_ok = (
        store.marketing_send_allowed(
            user_id=user_id,
            to_email=lead_email,
            campaign=camp,
        )
        if user_id
        else {"ok": False, "reason": "no_user_consent_row"}
    )
    want_mail = bool(user_id) and bool(mail_ok.get("ok"))

    # Don't stack multiple pending search campaigns for one person
    if _user_has_pending_search_curate(user_id, lead_email):
        return {
            "ok": True,
            "mode": "skipped_pending",
            "reason": "pending_search_curate",
            "want_mail": want_mail,
        }

    existing = find_active_package(place, market=market_s)
    if existing:
        if not want_mail:
            return {
                "ok": True,
                "mode": "skip_mail_existing",
                "reason": mail_ok.get("reason"),
                "package": existing.get("slug"),
            }
        rid = store.enqueue_workflow(
            user_id=user_id,
            lead_email=lead_email,
            workflow="search_curate",
            step=f"mail_{slug}",
            due_at=_now() + search_mail_delay(),
            payload={**payload, "package_slug": existing.get("slug") or existing.get("id")},
        )
        return {"ok": True, "mode": "mail_existing", "run_id": rid, "package": existing.get("slug")}

    rid = store.enqueue_workflow(
        user_id=user_id,
        lead_email=lead_email,
        workflow="search_curate",
        step=f"author_{slug}",
        due_at=_now(),
        payload={**payload, "want_mail": want_mail, "mail_skip_reason": mail_ok.get("reason")},
    )
    return {
        "ok": True,
        "mode": "author_then_mail" if want_mail else "author_only",
        "run_id": rid,
        "want_mail": want_mail,
        "reason": None if want_mail else mail_ok.get("reason"),
    }


def enroll_from_search_events(
    events: list,
    *,
    user_id: str | None,
    lead_email: str | None = None,
    market: str | None = None,
) -> list[dict[str, Any]]:
    """Enroll at most one place per event flush (anti-spam)."""
    results = []
    seen_cities: set[str] = set()
    for ev in events or []:
        et = str(ev.get("type") or ev.get("event_type") or "")
        if et != "search":
            continue
        city, country = _city_from_payload(ev.get("payload") if isinstance(ev.get("payload"), dict) else {})
        if len(city) < 2:
            continue
        # Skip airport codes / tiny strings
        if len(city) <= 3 and city.isupper():
            continue
        key = city.strip().lower()
        if key in seen_cities:
            continue
        seen_cities.add(key)
        # One demand campaign enrollment per flush
        results.append(
            enroll_search_campaign(
                user_id,
                city=city,
                country=country,
                market=market,
                lead_email=lead_email,
            )
        )
        break
    return results


def _user_has_pending_search_curate(user_id: str | None, lead_email: str | None = None) -> bool:
    if not store.configured():
        return False
    from supervisor.db import connection

    with connection() as conn:
        if user_id:
            row = conn.execute(
                """
                SELECT 1 FROM workflow_runs
                WHERE status = 'pending' AND workflow = 'search_curate' AND user_id = %s
                LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        elif lead_email:
            row = conn.execute(
                """
                SELECT 1 FROM workflow_runs
                WHERE status = 'pending' AND workflow = 'search_curate'
                  AND lower(lead_email) = lower(%s)
                LIMIT 1
                """,
                (lead_email,),
            ).fetchone()
        else:
            return False
    return bool(row)


async def process_search_curate_run(run: dict[str, Any]) -> dict[str, Any]:
    """Handle one workflow_runs row for search_curate."""
    from supervisor.marketing_mailer import send_place_campaign

    rid = run["id"]
    uid = run.get("user_id")
    step = str(run.get("step") or "")
    payload = run.get("payload") if isinstance(run.get("payload"), dict) else {}
    city = str(payload.get("city") or "").strip()
    country = str(payload.get("country") or "").strip() or None
    market = str(payload.get("market") or "IN").strip().upper()
    slug = str(payload.get("slug") or _slugify(city))

    if step.startswith("author_"):
        curated = curate_place(city, market=market, country=country, publish=True)
        pkg = curated.get("package") or {}
        pkg_slug = str(pkg.get("slug") or pkg.get("id") or payload.get("package_slug") or "")
        want_mail = payload.get("want_mail")
        if want_mail is None:
            want_mail = True
        # Prefer mailing when we actually created something new; always re-check caps
        created = bool(curated.get("created_package") or curated.get("created_explore"))
        camp = f"search_place_{slug}"
        gate = store.marketing_send_allowed(
            user_id=uid,
            to_email=run.get("lead_email"),
            campaign=camp,
        )
        should_mail = bool(want_mail) and gate.get("ok") and (created or bool(pkg_slug))
        if should_mail:
            store.enqueue_workflow(
                user_id=uid,
                lead_email=run.get("lead_email"),
                workflow="search_curate",
                step=f"mail_{slug}",
                due_at=_now() + search_mail_delay(),
                payload={
                    **payload,
                    "package_slug": pkg_slug,
                    "curate": {
                        "created_package": curated.get("created_package"),
                        "created_explore": curated.get("created_explore"),
                        "error": curated.get("error"),
                    },
                },
            )
        store.complete_workflow_run(rid, "done" if curated.get("ok") or curated.get("package") else "failed")
        return {
            "ok": True,
            "step": step,
            "curate": curated,
            "mailed": should_mail,
            "mail_skip": None if should_mail else (gate.get("reason") or "no_mail"),
        }

    if step.startswith("mail_"):
        if not uid:
            store.complete_workflow_run(rid, "skipped")
            return {"ok": False, "error": "no_user"}
        # Final gate (another mail may have gone out since enqueue)
        gate = store.marketing_send_allowed(
            user_id=uid,
            to_email=run.get("lead_email"),
            campaign=f"search_place_{slug}",
        )
        if not gate.get("ok"):
            store.complete_workflow_run(rid, "skipped")
            return {"ok": True, "skipped": True, "reason": gate.get("reason")}
        out = await send_place_campaign(
            uid,
            city=city,
            package_slug=str(payload.get("package_slug") or ""),
        )
        status = "done" if out.get("ok") and not out.get("skipped") else (
            "skipped" if out.get("skipped") else "failed"
        )
        store.complete_workflow_run(rid, status)
        return {"ok": True, "step": step, "mail": out}

    store.complete_workflow_run(rid, "skipped")
    return {"ok": True, "skipped": True, "step": step}
