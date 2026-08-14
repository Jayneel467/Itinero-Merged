"""Site feedback — email support + durable local log."""

from __future__ import annotations

import html
import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_FEEDBACK_PATH = Path(__file__).resolve().parent / "data" / "feedback.jsonl"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_CATEGORIES = {
    "bug",
    "idea",
    "booking",
    "payment",
    "vero",
    "other",
}


def _support_inbox() -> str:
    return (
        (os.getenv("FEEDBACK_TO_EMAIL") or "").strip()
        or (os.getenv("SUPPORT_EMAIL") or "").strip()
        or (os.getenv("VITE_SUPPORT_EMAIL") or "").strip()
        or "support@itinero.company"
    )


def _append_log(row: dict[str, Any]) -> None:
    _FEEDBACK_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _FEEDBACK_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")


def validate_feedback(
    *,
    message: str | None,
    email: str | None = None,
    category: str | None = None,
    rating: int | None = None,
) -> dict[str, Any]:
    body = (message or "").strip()
    if len(body) < 10:
        return {
            "ok": False,
            "error": "message_too_short",
            "message": "Tell us a bit more (at least a sentence).",
        }
    if len(body) > 4000:
        return {
            "ok": False,
            "error": "message_too_long",
            "message": "Keep feedback under 4000 characters.",
        }
    mail = (email or "").strip().lower()
    if mail and not _EMAIL_RE.match(mail):
        return {
            "ok": False,
            "error": "invalid_email",
            "message": "That email doesn’t look valid.",
        }
    cat = (category or "other").strip().lower()
    if cat not in _CATEGORIES:
        cat = "other"
    score = None
    if rating is not None:
        try:
            score = int(rating)
        except (TypeError, ValueError):
            return {
                "ok": False,
                "error": "invalid_rating",
                "message": "Rating must be 1–5.",
            }
        if score < 1 or score > 5:
            return {
                "ok": False,
                "error": "invalid_rating",
                "message": "Rating must be 1–5.",
            }
    return {
        "ok": True,
        "message": body,
        "email": mail or None,
        "category": cat,
        "rating": score,
    }


async def submit_feedback(
    *,
    message: str,
    email: str | None = None,
    category: str | None = None,
    rating: int | None = None,
    page_path: str | None = None,
    user_agent: str | None = None,
    device_id: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    checked = validate_feedback(
        message=message,
        email=email,
        category=category,
        rating=rating,
    )
    if not checked.get("ok"):
        return checked

    feedback_id = f"FB-{uuid.uuid4().hex[:10].upper()}"
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "id": feedback_id,
        "createdAt": now,
        "category": checked["category"],
        "rating": checked["rating"],
        "email": checked["email"],
        "message": checked["message"],
        "pagePath": (page_path or "").strip()[:300] or None,
        "userAgent": (user_agent or "").strip()[:400] or None,
        "deviceId": (device_id or "").strip()[:80] or None,
        "userId": (user_id or "").strip()[:80] or None,
    }
    try:
        _append_log(row)
    except Exception:
        # Still try email if logging fails
        pass

    inbox = _support_inbox()
    subject = f"[Itinero feedback] {checked['category']} · {feedback_id}"
    rating_line = f"Rating: {checked['rating']}/5\n" if checked["rating"] else ""
    text = (
        f"Feedback id: {feedback_id}\n"
        f"Category: {checked['category']}\n"
        f"{rating_line}"
        f"From: {checked['email'] or '(anonymous)'}\n"
        f"Page: {row['pagePath'] or '-'}\n"
        f"Device: {row['deviceId'] or '-'}\n"
        f"When: {now}\n"
        f"\n---\n\n"
        f"{checked['message']}\n"
    )
    safe_msg = html.escape(checked["message"]).replace("\n", "<br/>")
    html_body = (
        f"<p><strong>Feedback id:</strong> {html.escape(feedback_id)}<br/>"
        f"<strong>Category:</strong> {html.escape(checked['category'])}<br/>"
        f"{'<strong>Rating:</strong> ' + str(checked['rating']) + '/5<br/>' if checked['rating'] else ''}"
        f"<strong>From:</strong> {html.escape(checked['email'] or '(anonymous)')}<br/>"
        f"<strong>Page:</strong> {html.escape(row['pagePath'] or '-')}</p>"
        f"<p>{safe_msg}</p>"
    )

    emailed = False
    email_error = None
    try:
        from supervisor.email_service import send_email, smtp_configured

        if smtp_configured():
            out = await send_email(
                to=inbox,
                subject=subject,
                plain=text,
                html=html_body,
                reply_to=checked["email"],
            )
            emailed = bool(out.get("ok"))
            if not emailed:
                email_error = out.get("error") or out.get("message")
        else:
            # Still accept feedback locally in sandbox/dev
            email_error = "smtp_not_configured"
            try:
                from supervisor.email_service import _dev_mode

                if _dev_mode():
                    print(f"[itinero-feedback] DEV {feedback_id}\n{text[:800]}", flush=True)
            except Exception:
                pass
    except Exception as exc:
        email_error = type(exc).__name__

    return {
        "ok": True,
        "feedbackId": feedback_id,
        "emailed": emailed,
        "message": (
            "Thanks — we got your feedback."
            + (" We’ll follow up by email if you left an address." if checked["email"] else "")
        ),
        "warning": None if emailed else email_error,
    }
