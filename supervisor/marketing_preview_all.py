#!/usr/bin/env python3
"""Generate HTML fixtures + optionally SMTP-send every marketing template for UI QA."""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent if (ROOT / "supervisor").is_dir() else ROOT))

# ensure supervisor package root is on path
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / "supervisor" / ".env")
load_dotenv()

from supervisor import marketing_templates as tpl
from supervisor.marketing_mailer import (
    default_trip_cards,
    preview_template,
    API_BASE,
)

FIXTURE_DIR = Path(__file__).resolve().parent / "email_fixtures"
TEMPLATES = [
    "signup_spark",
    "signup_trip_idea",
    "signup_offer",
    "daily_digest",
    "booking_more_like",
    "dedicated_offer",
]


def write_fixtures() -> list[Path]:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    cards = default_trip_cards(["hiking", "beach", "biking"])
    offer = {
        "code": "WELCOME10",
        "title": "Welcome - 10% off packages",
        "copy": "New here? Save 10% on Itinero packages (our margin). Supplier fares unchanged.",
        "image_url": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
    }
    unsub = "preview_token"
    sid = "preview_send"
    files = []

    mapping = {
        "signup_spark": tpl.signup_spark_html(
            name="Jayneel", send_id=sid, unsub_token=unsub, api_base=API_BASE
        ),
        "signup_trip_idea": tpl.trip_idea_html(
            name="Jayneel", cards=cards, send_id=sid, unsub_token=unsub, api_base=API_BASE
        ),
        "signup_offer": tpl.offer_html(
            name="Jayneel", offer=offer, send_id=sid, unsub_token=unsub, api_base=API_BASE
        ),
        "daily_digest": tpl.digest_html(
            name="Jayneel",
            cards=cards,
            offer=offer,
            send_id=sid,
            unsub_token=unsub,
            api_base=API_BASE,
        ),
        "booking_more_like": tpl.booking_more_like_html(
            name="Jayneel",
            destination="Manali",
            cards=cards,
            send_id=sid,
            unsub_token=unsub,
            api_base=API_BASE,
        ),
        "dedicated_offer": tpl.offer_html(
            name="Jayneel",
            offer={
                **offer,
                "code": "HIKE15",
                "title": "Hiking season - 15% off hills packages",
                "image_url": "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=900&q=80",
            },
            send_id=sid,
            unsub_token=unsub,
            api_base=API_BASE,
        ),
    }

    index_rows = []
    for name, html in mapping.items():
        path = FIXTURE_DIR / f"{name}.html"
        path.write_text(html, encoding="utf-8")
        files.append(path)
        index_rows.append(f'<li><a href="{name}.html">{name}</a></li>')

    index = FIXTURE_DIR / "index.html"
    index.write_text(
        f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Itinero marketing email fixtures</title>
<style>body{{font-family:system-ui;padding:32px;background:#eef2f7}} a{{color:#f97316;font-weight:700}}</style>
</head><body>
<h1>Itinero marketing emails</h1>
<p>Open each file to review UI in the browser.</p>
<ul>{''.join(index_rows)}</ul>
</body></html>
""",
        encoding="utf-8",
    )
    files.append(index)
    return files


async def send_all(to_email: str) -> None:
    """Send without requiring DB — uses SMTP + inline brand assets only."""
    import asyncio
    from supervisor.email_service import _smtp_send_message, smtp_configured, _from_addr
    from supervisor.marketing_templates import build_marketing_message

    if not smtp_configured():
        print("SMTP not configured")
        return

    cards = default_trip_cards(["hiking", "beach", "biking"])
    offer = {
        "code": "WELCOME10",
        "title": "Welcome - 10% off packages",
        "copy": "New here? Save 10% on Itinero packages (our margin). Supplier fares unchanged.",
        "image_url": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=900&q=80",
    }
    hike = {
        **offer,
        "code": "HIKE15",
        "title": "Hiking season - 15% off hills packages",
        "image_url": "https://images.unsplash.com/photo-1551632811-561732d1e306?auto=format&fit=crop&w=900&q=80",
    }
    unsub = "preview"
    sid = "local_preview"
    payloads = [
        (
            "signup_spark",
            "[Preview] Where should your next weekend go?",
            tpl.signup_spark_html(name="Jayneel", send_id=sid, unsub_token=unsub, api_base=API_BASE),
            tpl.signup_spark_plain(name="Jayneel"),
        ),
        (
            "signup_trip_idea",
            "[Preview] A few trip ideas with your name on them",
            tpl.trip_idea_html(name="Jayneel", cards=cards, send_id=sid, unsub_token=unsub, api_base=API_BASE),
            "Your trip ideas on Itinero",
        ),
        (
            "signup_offer",
            "[Preview] Your code WELCOME10 is ready",
            tpl.offer_html(name="Jayneel", offer=offer, send_id=sid, unsub_token=unsub, api_base=API_BASE),
            "Use WELCOME10 on Itinero packages",
        ),
        (
            "daily_digest",
            "[Preview] Fresh trip ideas, picked for you",
            tpl.digest_html(name="Jayneel", cards=cards, offer=offer, send_id=sid, unsub_token=unsub, api_base=API_BASE),
            "Your Itinero digest",
        ),
        (
            "booking_more_like",
            "[Preview] More like Manali",
            tpl.booking_more_like_html(
                name="Jayneel", destination="Manali", cards=cards, send_id=sid, unsub_token=unsub, api_base=API_BASE
            ),
            "More like Manali",
        ),
        (
            "dedicated_offer",
            "[Preview] HIKE15 - hiking season offer",
            tpl.offer_html(name="Jayneel", offer=hike, send_id=sid, unsub_token=unsub, api_base=API_BASE),
            "Use HIKE15 on Itinero packages",
        ),
    ]
    for name, subject, html_body, plain in payloads:
        print(f"Sending {name} → {to_email} ...", flush=True)
        msg = build_marketing_message(
            to=to_email,
            subject=subject,
            html_body=html_body,
            plain=plain,
            from_addr=_from_addr(booking=False),
        )
        try:
            await asyncio.to_thread(_smtp_send_message, msg)
            print("  ok", flush=True)
        except Exception as e:
            print("  FAILED", e, flush=True)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--send", metavar="EMAIL", help="SMTP-send every template to this address")
    p.add_argument("--fixtures-only", action="store_true")
    args = p.parse_args()
    files = write_fixtures()
    print("Wrote fixtures:")
    for f in files:
        print(" ", f)
    if args.fixtures_only or not args.send:
        return
    asyncio.run(send_all(args.send))


if __name__ == "__main__":
    main()
