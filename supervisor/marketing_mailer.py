"""Marketing mail transport + content assembly (SMTP, ESP-swappable)."""

from __future__ import annotations

import logging
import os
from typing import Any

from supervisor.email_service import send_email, smtp_configured
from supervisor import marketing_store as store
from supervisor import marketing_templates as tpl

log = logging.getLogger("itinero.marketing")

SITE = os.getenv("PUBLIC_SITE_URL", "https://itinero.company").rstrip("/")
API_BASE = (os.getenv("PUBLIC_API_URL") or os.getenv("API_PUBLIC_URL") or SITE).rstrip("/")

DIGEST_SUBJECTS = {
    "A": "Where should your next weekend go?",
    "B": "Fresh trip ideas, picked for you",
}


def _from_addr() -> str:
    return (
        (os.getenv("SMTP_FROM") or os.getenv("EMAIL_FROM") or "Itinero <noreply@itinero.company>")
        .strip()
    )


async def send_marketing(
    *,
    to: str,
    subject: str,
    html_body: str,
    plain: str,
    campaign: str,
    template: str,
    user_id: str | None = None,
    variant: str | None = None,
    payload: dict | None = None,
) -> dict[str, Any]:
    """Send via SMTP; log to email_sends. Swap body of this fn for ESP later."""
    if not to or "@" not in to:
        return {"ok": False, "error": "no_email"}
    gate = store.marketing_send_allowed(user_id=user_id, to_email=to, campaign=campaign)
    if not gate.get("ok"):
        return {"ok": True, "skipped": True, "reason": gate.get("reason") or "rate_limited", "gate": gate}

    sid = store.log_email_send(
        to_email=to,
        campaign=campaign,
        template=template,
        subject=subject,
        user_id=user_id,
        variant=variant,
        status="queued",
        payload=payload,
    )
    # Rewrite HTML with real send_id for tracking if placeholder used
    html_final = html_body.replace("SEND_ID_PLACEHOLDER", sid)

    if not smtp_configured():
        from supervisor.db import connection, configured

        if configured():
            with connection() as conn:
                conn.execute(
                    "UPDATE email_sends SET status = 'failed', payload = payload || %s::jsonb WHERE id = %s",
                    (store._json({"error": "smtp_unset"}), sid),
                )
                conn.commit()
        return {"ok": False, "error": "smtp_unset", "send_id": sid, "message": "SMTP not configured"}

    unsub_url = None
    try:
        import re as _re

        m = _re.search(
            r"(https?://[^\s\"']+/api/newsletter/unsubscribe\?token=[^\"'\s]+)",
            html_final,
        )
        if m:
            unsub_url = m.group(1)
    except Exception:
        unsub_url = None
    msg = tpl.build_marketing_message(
        to=to,
        subject=subject,
        html_body=html_final,
        plain=plain,
        from_addr=_from_addr(),
        unsub_url=unsub_url,
    )
    # send_email expects raw fields; use low-level path
    from supervisor.email_service import _smtp_send_message

    import asyncio

    try:
        await asyncio.to_thread(_smtp_send_message, msg)
        from supervisor.db import connection, configured

        if configured():
            with connection() as conn:
                conn.execute(
                    "UPDATE email_sends SET status = 'sent' WHERE id = %s",
                    (sid,),
                )
                conn.commit()
        return {"ok": True, "send_id": sid}
    except Exception as e:
        log.exception("marketing send failed")
        from supervisor.db import connection, configured

        if configured():
            with connection() as conn:
                conn.execute(
                    "UPDATE email_sends SET status = 'failed', payload = payload || %s::jsonb WHERE id = %s",
                    (store._json({"error": str(e)[:200]}), sid),
                )
                conn.commit()
        return {"ok": False, "error": "send_failed", "send_id": sid, "message": str(e)}


def default_trip_cards(
    vibes: list | None = None,
    home_country: str | None = None,
    destinations: list | None = None,
    *,
    exclude_city: str | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Rank live Explore catalog by user vibes, saved destinations, and home market."""
    vibe_ids: set[str] = set()
    for v in vibes or []:
        if isinstance(v, str):
            vibe_ids.add(v.lower())
        elif isinstance(v, dict) and v.get("id"):
            vibe_ids.add(str(v["id"]).lower())

    dest_names: set[str] = set()
    for d in destinations or []:
        if isinstance(d, str) and d.strip():
            dest_names.add(d.strip().lower())
        elif isinstance(d, dict):
            for key in ("city", "name", "id", "slug"):
                val = d.get(key)
                if val:
                    dest_names.add(str(val).strip().lower())

    hc = (home_country or "").upper()
    exclude = (exclude_city or "").strip().lower()

    catalog: list[dict[str, Any]] = []
    try:
        from supervisor.explore_structured import list_destinations

        rows = list_destinations(market=hc or None).get("destinations") or []
        for row in rows:
            slug = str(row.get("slug") or row.get("id") or "").strip()
            city = str(row.get("city") or "").strip()
            if not city:
                continue
            image = str(row.get("image") or "").strip()
            catalog.append(
                {
                    "city": city,
                    "blurb": str(row.get("blurb") or "").strip(),
                    "image": image,
                    "href": f"{SITE}/explore/{slug}" if slug else f"{SITE}/explore",
                    "themes": [str(t).lower() for t in (row.get("themes") or [])],
                    "markets": [str(m).upper() for m in (row.get("markets") or [])],
                    "trending": int(row.get("trendingScore") or 0),
                }
            )
    except Exception:
        log.exception("explore catalog load failed; using fallback cards")

    if not catalog:
        # Hard fallback if Explore JSON missing
        catalog = [
            {
                "city": "Manali",
                "blurb": "Himalayan valleys, trails, and apple-orchard air.",
                "image": "https://images.unsplash.com/photo-1626621341517-bbf3d9990a23?auto=format&fit=crop&w=900&q=80",
                "href": f"{SITE}/explore/manali",
                "themes": ["hiking", "hills", "trekking", "adventure"],
                "markets": ["IN"],
                "trending": 80,
            },
            {
                "city": "Bali",
                "blurb": "Rice terraces, surf, and temple sunsets.",
                "image": "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=900&q=80",
                "href": f"{SITE}/explore/bali",
                "themes": ["beach", "adventure", "wellness"],
                "markets": [],
                "trending": 90,
            },
            {
                "city": "Amsterdam",
                "blurb": "Canals, bikes, and golden-hour bridges.",
                "image": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?auto=format&fit=crop&w=900&q=80",
                "href": f"{SITE}/explore/amsterdam",
                "themes": ["biking", "city", "culture"],
                "markets": [],
                "trending": 85,
            },
        ]

    scored: list[tuple[int, dict[str, Any]]] = []
    for c in catalog:
        city_l = str(c.get("city") or "").lower()
        if exclude and (exclude == city_l or exclude in city_l):
            continue
        score = int(c.get("trending") or 0) // 10
        themes = set(c.get("themes") or [])
        if vibe_ids:
            score += 20 * len(vibe_ids & themes)
        if dest_names and (city_l in dest_names or any(n in city_l for n in dest_names)):
            score += 40
        markets = c.get("markets") or []
        if hc and (hc in markets or "*" in markets):
            score += 8
        if not vibe_ids and not dest_names:
            score += 1
        scored.append((score, c))

    scored.sort(key=lambda x: (-x[0], -int(x[1].get("trending") or 0), str(x[1].get("city") or "")))
    picked = [c for s, c in scored if s > 0][:limit]
    if len(picked) < min(3, limit):
        # Fill with top trending leftovers
        seen = {str(c.get("city") or "").lower() for c in picked}
        for _, c in scored:
            key = str(c.get("city") or "").lower()
            if key in seen:
                continue
            picked.append(c)
            seen.add(key)
            if len(picked) >= limit:
                break
    return picked[:limit]


async def send_signup_spark(user_id: str) -> dict[str, Any]:
    user = store.get_user_email_row(user_id)
    if not user or not user.get("email") or not user.get("newsletter"):
        return {"ok": False, "error": "no_consent"}
    unsub = store.ensure_user_marketing_row(user_id)
    # provisional send_id embedded after log — build with placeholder then replace
    html_body = tpl.signup_spark_html(
        name=user.get("name") or "",
        send_id="SEND_ID_PLACEHOLDER",
        unsub_token=unsub or user.get("unsubscribe_token") or "",
        api_base=API_BASE,
    )
    return await send_marketing(
        to=user["email"],
        subject="Where should your next weekend go?",
        html_body=html_body,
        plain=tpl.signup_spark_plain(name=user.get("name") or ""),
        campaign="signup_spark",
        template="signup_spark",
        user_id=user_id,
    )


async def send_trip_idea(user_id: str) -> dict[str, Any]:
    user = store.get_user_email_row(user_id)
    if not user or not user.get("email") or not user.get("newsletter"):
        return {"ok": False, "error": "no_consent"}
    interests = store.get_interests(user_id)
    cards = default_trip_cards(
        interests.get("vibes"),
        interests.get("home_country"),
        interests.get("destinations"),
    )
    unsub = user.get("unsubscribe_token") or store.ensure_user_marketing_row(user_id)
    html_body = tpl.trip_idea_html(
        name=user.get("name") or "",
        cards=cards,
        send_id="SEND_ID_PLACEHOLDER",
        unsub_token=unsub,
        api_base=API_BASE,
    )
    plain = "Your trip ideas on Itinero:\n" + "\n".join(
        f"- {c['city']}: {c['href']}" for c in cards[:3]
    )
    return await send_marketing(
        to=user["email"],
        subject="A few trip ideas with your name on them",
        html_body=html_body,
        plain=plain,
        campaign="signup_trip_idea",
        template="signup_trip_idea",
        user_id=user_id,
    )


async def send_signup_offer(user_id: str) -> dict[str, Any]:
    user = store.get_user_email_row(user_id)
    if not user or not user.get("email") or not user.get("newsletter"):
        return {"ok": False, "error": "no_consent"}
    interests = store.get_interests(user_id)
    vibe_ids = []
    for v in interests.get("vibes") or []:
        if isinstance(v, str):
            vibe_ids.append(v)
        elif isinstance(v, dict) and v.get("id"):
            vibe_ids.append(str(v["id"]))
    offers = store.list_offers(vibes=vibe_ids or None)
    offer = offers[0] if offers else {
        "code": "WELCOME10",
        "title": "Welcome - 10% off packages",
        "copy": "Save on Itinero packages.",
        "image_url": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
    }
    unsub = user.get("unsubscribe_token") or store.ensure_user_marketing_row(user_id)
    html_body = tpl.offer_html(
        name=user.get("name") or "",
        offer=offer,
        send_id="SEND_ID_PLACEHOLDER",
        unsub_token=unsub,
        api_base=API_BASE,
    )
    return await send_marketing(
        to=user["email"],
        subject=f"Your code {offer.get('code')} is ready",
        html_body=html_body,
        plain=f"Use code {offer.get('code')} on Itinero packages. {SITE}/packages",
        campaign="signup_offer",
        template="signup_offer",
        user_id=user_id,
        payload={"offer_code": offer.get("code")},
    )


async def send_digest_for_user(user_id: str) -> dict[str, Any]:
    user = store.get_user_email_row(user_id)
    if not user or not user.get("email") or not user.get("newsletter"):
        return {"ok": False, "error": "no_consent"}
    interests = store.get_interests(user_id)
    if (interests.get("mail_frequency") or "daily") == "off":
        return {"ok": False, "error": "frequency_off"}
    # Respect global caps (e.g. already got a search/offer mail today)
    gate = store.marketing_send_allowed(
        user_id=user_id, to_email=user["email"], campaign="daily_digest"
    )
    if not gate.get("ok"):
        return {"ok": True, "skipped": True, "reason": gate.get("reason"), "gate": gate}
    cards = default_trip_cards(
        interests.get("vibes"),
        interests.get("home_country"),
        interests.get("destinations"),
    )
    if not cards:
        return {"ok": True, "skipped": True, "reason": "no_content"}
    offers = store.list_offers()
    offer = offers[0] if offers else None
    variant = store.get_or_assign_ab_variant(user_id, "daily_digest")
    subject = DIGEST_SUBJECTS.get(variant, DIGEST_SUBJECTS["A"])
    store.maybe_lock_ab_winner("daily_digest")
    unsub = user.get("unsubscribe_token") or store.ensure_user_marketing_row(user_id)
    html_body = tpl.digest_html(
        name=user.get("name") or "",
        cards=cards,
        offer=offer,
        send_id="SEND_ID_PLACEHOLDER",
        unsub_token=unsub,
        api_base=API_BASE,
    )
    plain = "Your Itinero digest:\n" + "\n".join(f"- {c['city']}: {c['href']}" for c in cards)
    return await send_marketing(
        to=user["email"],
        subject=subject,
        html_body=html_body,
        plain=plain,
        campaign="daily_digest",
        template="daily_digest",
        user_id=user_id,
        variant=variant,
    )


async def send_place_campaign(
    user_id: str,
    *,
    city: str,
    package_slug: str = "",
) -> dict[str, Any]:
    """Mail after search demand: package link if ready, else explore / trip cards."""
    user = store.get_user_email_row(user_id)
    if not user or not user.get("email") or not user.get("newsletter"):
        return {"ok": False, "error": "no_consent"}
    if (store.get_interests(user_id).get("mail_frequency") or "daily") == "off":
        return {"ok": False, "error": "frequency_off"}

    place = str(city or "").strip() or "your destination"
    interests = store.get_interests(user_id)
    cards = default_trip_cards(
        interests.get("vibes"),
        interests.get("home_country"),
        interests.get("destinations"),
        exclude_city=None,
        limit=3,
    )

    pkg_slug = str(package_slug or "").strip()
    pkg_href = f"{SITE}/packages/{pkg_slug}" if pkg_slug else f"{SITE}/packages?q={place}"
    exp_slug = place.lower().replace(" ", "-")
    # Prefer package as lead card
    lead = {
        "city": place,
        "blurb": f"A ready Itinero trip idea for {place}. Open packages to pick dates.",
        "image": (cards[0].get("image") if cards else "")
        or "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
        "href": pkg_href,
    }
    # Dedupe city from rest
    rest = [c for c in cards if str(c.get("city") or "").lower() != place.lower()][:2]
    mail_cards = [lead] + rest

    unsub = user.get("unsubscribe_token") or store.ensure_user_marketing_row(user_id)
    html_body = tpl.booking_more_like_html(
        name=user.get("name") or "",
        destination=place,
        cards=mail_cards,
        send_id="SEND_ID_PLACEHOLDER",
        unsub_token=unsub,
        api_base=API_BASE,
    )
    # Soften headline copy for search (reuse template but subject is place-specific)
    subject = f"A {place} trip idea for you"
    plain = (
        f"You looked at {place}.\n"
        f"Open the package: {pkg_href}\n"
        f"Or explore: {SITE}/explore/{exp_slug}\n"
    )
    return await send_marketing(
        to=user["email"],
        subject=subject,
        html_body=html_body,
        plain=plain,
        campaign=f"search_place_{_slug_safe(place)}",
        template="search_place_idea",
        user_id=user_id,
        payload={"city": place, "package_slug": pkg_slug},
    )


def _slug_safe(raw: str) -> str:
    import re

    s = str(raw or "").strip().lower().replace(" ", "-")
    return re.sub(r"[^a-z0-9\-]+", "", s)[:40] or "place"


async def send_booking_followup(user_id: str, destination: str = "") -> dict[str, Any]:
    user = store.get_user_email_row(user_id)
    if not user or not user.get("email") or not user.get("newsletter"):
        return {"ok": False, "error": "no_consent"}
    interests = store.get_interests(user_id)
    cards = default_trip_cards(
        interests.get("vibes"),
        interests.get("home_country"),
        interests.get("destinations"),
        exclude_city=destination,
    )
    unsub = user.get("unsubscribe_token") or store.ensure_user_marketing_row(user_id)
    html_body = tpl.booking_more_like_html(
        name=user.get("name") or "",
        destination=destination or "your trip",
        cards=cards,
        send_id="SEND_ID_PLACEHOLDER",
        unsub_token=unsub,
        api_base=API_BASE,
    )
    return await send_marketing(
        to=user["email"],
        subject=f"More like {destination or 'your trip'}",
        html_body=html_body,
        plain=f"More destinations like {destination} on Itinero: {SITE}/explore",
        campaign="booking_followup",
        template="booking_more_like",
        user_id=user_id,
    )


async def preview_template(template: str, to_email: str, user_id: str | None = None) -> dict[str, Any]:
    """Admin preview - always sends (bypasses already_sent by unique campaign name)."""
    name = "Traveller"
    unsub = "preview"
    cards = default_trip_cards(["hiking", "beach"])
    offer = (store.list_offers() or [{}])[0]
    if template == "signup_spark":
        html_body = tpl.signup_spark_html(name=name, send_id="SEND_ID_PLACEHOLDER", unsub_token=unsub, api_base=API_BASE)
        subject = "[Preview] Welcome spark"
        plain = tpl.signup_spark_plain(name=name)
    elif template == "signup_trip_idea":
        html_body = tpl.trip_idea_html(name=name, cards=cards, send_id="SEND_ID_PLACEHOLDER", unsub_token=unsub, api_base=API_BASE)
        subject = "[Preview] Trip ideas"
        plain = "preview"
    elif template == "signup_offer" or template == "dedicated_offer":
        html_body = tpl.offer_html(name=name, offer=offer, send_id="SEND_ID_PLACEHOLDER", unsub_token=unsub, api_base=API_BASE)
        subject = "[Preview] Offer"
        plain = "preview"
    elif template == "booking_more_like":
        html_body = tpl.booking_more_like_html(name=name, destination="Manali", cards=cards, send_id="SEND_ID_PLACEHOLDER", unsub_token=unsub, api_base=API_BASE)
        subject = "[Preview] More like"
        plain = "preview"
    else:
        html_body = tpl.digest_html(name=name, cards=cards, offer=offer, send_id="SEND_ID_PLACEHOLDER", unsub_token=unsub, api_base=API_BASE)
        subject = "[Preview] Digest"
        plain = "preview"
    # use unique campaign so already_sent_today doesn't block
    import time

    return await send_marketing(
        to=to_email,
        subject=subject,
        html_body=html_body,
        plain=plain,
        campaign=f"preview_{template}_{int(time.time())}",
        template=template,
        user_id=user_id,
    )


async def broadcast_to_segment(
    *,
    template: str,
    segment_id: str,
    limit: int = 25,
) -> dict[str, Any]:
    """Ops send of an existing template to a named segment. Caps still apply per user."""
    allowed = {
        "signup_spark",
        "signup_trip_idea",
        "signup_offer",
        "daily_digest",
        "booking_more_like",
    }
    tmpl = str(template or "daily_digest").strip()
    if tmpl not in allowed:
        return {"ok": False, "error": "unknown_template"}
    segs = {str(s.get("id")): s for s in store.list_segments()}
    seg = segs.get(str(segment_id or "").strip())
    if not seg:
        return {"ok": False, "error": "unknown_segment"}
    cap = max(1, min(int(limit or 25), 50))
    users = store.users_matching_segment(seg.get("rules") or {}, limit=cap)
    sent = skipped = errors = 0
    details: list[dict[str, Any]] = []
    for row in users:
        uid = str(row.get("user_id") or "")
        try:
            if tmpl == "signup_spark":
                out = await send_signup_spark(uid)
            elif tmpl == "signup_trip_idea":
                out = await send_trip_idea(uid)
            elif tmpl == "signup_offer":
                out = await send_signup_offer(uid)
            elif tmpl == "booking_more_like":
                out = await send_booking_followup(uid, "")
            else:
                out = await send_digest_for_user(uid)
            if out.get("ok") and not out.get("skipped"):
                sent += 1
            elif out.get("skipped") or out.get("ok"):
                skipped += 1
            else:
                errors += 1
            details.append(
                {
                    "user_id": uid,
                    "result": out.get("reason")
                    or out.get("error")
                    or ("sent" if out.get("ok") and not out.get("skipped") else "skipped"),
                }
            )
        except Exception as e:
            errors += 1
            details.append({"user_id": uid, "result": str(e)[:120]})
    return {
        "ok": True,
        "segment_id": seg["id"],
        "segment": seg.get("name"),
        "template": tmpl,
        "candidates": len(users),
        "sent": sent,
        "skipped": skipped,
        "errors": errors,
        "results": details[:20],
    }
