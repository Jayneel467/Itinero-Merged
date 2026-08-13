"""Transactional email via SMTP (Zoho). OTP + booking confirmations."""

from __future__ import annotations

import asyncio
import os
import smtplib
import traceback
from email.message import EmailMessage
from typing import Any

from supervisor.email_copy import scrub_em_marks


def _from_addr(*, booking: bool = False) -> str:
    if booking:
        return (
            os.getenv("BOOKING_FROM_EMAIL")
            or os.getenv("SMTP_FROM")
            or os.getenv("OTP_FROM_EMAIL")
            or "Itinero <donotreply@itinero.company>"
        ).strip()
    return (
        os.getenv("OTP_FROM_EMAIL")
        or os.getenv("SMTP_FROM")
        or os.getenv("BOOKING_FROM_EMAIL")
        or "Itinero <donotreply@itinero.company>"
    ).strip()


def smtp_configured() -> bool:
    return bool(
        (os.getenv("SMTP_HOST") or "").strip()
        and (os.getenv("SMTP_USER") or "").strip()
        and (os.getenv("SMTP_PASSWORD") or "").strip()
    )


def _smtp_configured() -> bool:
    return smtp_configured()


def smtp_ping() -> str:
    """Connect + STARTTLS + login without sending. Returns unset | ready | error."""
    if not smtp_configured():
        return "unset"
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    port = int(os.getenv("SMTP_PORT") or "587")
    timeout = min(int(os.getenv("SMTP_HEALTH_TIMEOUT") or "5"), 15)
    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=timeout) as server:
                server.login(user, password)
        else:
            with smtplib.SMTP(host, port, timeout=timeout) as server:
                server.ehlo()
                server.starttls()
                server.ehlo()
                server.login(user, password)
        return "ready"
    except Exception:
        return "error"


def _smtp_send_message(msg: EmailMessage) -> None:
    """Low-level SMTP send. Scrubs em/en dashes on Subject only (bodies scrubbed at build)."""
    if "Subject" in msg:
        msg.replace_header("Subject", scrub_em_marks(msg["Subject"]))
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    port = int(os.getenv("SMTP_PORT") or "587")
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=25) as server:
            server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=25) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.send_message(msg)


def _dev_mode() -> bool:
    return (os.getenv("ITINERO_AUTH_DEV") or "").strip().lower() in {"1", "true", "yes"}


async def send_email(
    *,
    to: str,
    subject: str,
    plain: str,
    html: str | None = None,
) -> dict[str, Any]:
    mail = (to or "").strip()
    if not mail or "@" not in mail:
        return {"ok": False, "error": "invalid_email"}

    if _smtp_configured():
        msg = EmailMessage()
        msg["Subject"] = scrub_em_marks(subject)
        msg["From"] = _from_addr()
        msg["To"] = mail
        msg.set_content(scrub_em_marks(plain))
        if html:
            msg.add_alternative(scrub_em_marks(html), subtype="html")
        try:
            await asyncio.to_thread(_smtp_send_message, msg)
            return {"ok": True, "channel": "smtp"}
        except Exception:
            traceback.print_exc()
            return {"ok": False, "error": "smtp_error", "message": "Could not send email. Try again."}

    dev = _dev_mode()
    if dev:
        print(f"[itinero-email] DEV → {mail}: {subject}\n{plain[:500]}", flush=True)
        return {"ok": True, "channel": "dev"}

    return {
        "ok": False,
        "error": "smtp_not_configured",
        "message": "Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.",
    }


async def send_otp_email(*, to: str, code: str) -> dict[str, Any]:
    """Branded OTP email with inline logo (same path as booking mail)."""
    from supervisor.email_templates import build_otp_message

    mail = (to or "").strip()
    if not mail or "@" not in mail:
        return {"ok": False, "message": "Invalid email address."}

    subject = "Your Itinero verification code"
    from_addr = _from_addr(booking=False)

    if _smtp_configured():
        msg = build_otp_message(to=mail, code=code, from_addr=from_addr, subject=subject)
        try:
            await asyncio.to_thread(_smtp_send_message, msg)
            return {"ok": True, "channel": "smtp"}
        except Exception:
            traceback.print_exc()
            return {"ok": False, "message": "Could not send email. Try again."}

    if _dev_mode():
        print(f"[itinero-auth] DEV OTP EMAIL {mail}: {code}", flush=True)
        return {"ok": True, "channel": "dev"}

    return {
        "ok": False,
        "message": "Email OTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD.",
    }


async def send_booking_confirmation(
    *,
    kind: str,
    to_email: str,
    details: dict[str, Any],
) -> dict[str, Any]:
    """Flight/hotel confirmation - same Zoho SMTP path as OTP."""
    from supervisor.email_templates import build_booking_confirmation_message

    mail = (to_email or "").strip()
    if not mail or "@" not in mail:
        return {"ok": False, "error": "invalid_email"}

    subject = details.get("subject") or (
        "Your Itinero flight is confirmed"
        if kind == "flight"
        else "Your Itinero hotel stay is confirmed"
    )
    from_addr = _from_addr(booking=True)

    if _smtp_configured():
        msg = build_booking_confirmation_message(
            to=mail,
            kind=kind,
            details=details,
            from_addr=from_addr,
            subject=subject,
        )
        try:
            await asyncio.to_thread(_smtp_send_message, msg)
            return {"ok": True, "channel": "smtp", "kind": kind}
        except Exception:
            traceback.print_exc()
            return {"ok": False, "error": "smtp_error", "message": "Could not send confirmation email."}

    if _dev_mode():
        plain_preview = details.get("booking_ref") or kind
        print(f"[itinero-email] DEV booking {kind} → {mail}: ref={plain_preview}", flush=True)
        return {"ok": True, "channel": "dev", "kind": kind}

    return {
        "ok": False,
        "error": "smtp_not_configured",
        "message": "Booking confirmation email requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD.",
    }


async def send_package_confirmation(*, booking: dict[str, Any]) -> dict[str, Any]:
    """Package confirmation with full itinerary PDF - same SMTP path as flight/hotel."""
    from supervisor.email_templates import build_package_confirmation_message

    guest = booking.get("guest") if isinstance(booking.get("guest"), dict) else {}
    mail = str(guest.get("email") or "").strip()
    if not mail or "@" not in mail:
        return {"ok": False, "error": "invalid_email"}

    from_addr = _from_addr(booking=True)

    if _smtp_configured():
        msg = build_package_confirmation_message(
            to=mail,
            booking=booking,
            from_addr=from_addr,
        )
        try:
            await asyncio.to_thread(_smtp_send_message, msg)
            return {"ok": True, "channel": "smtp", "kind": "package"}
        except Exception:
            traceback.print_exc()
            return {"ok": False, "error": "smtp_error", "message": "Could not send package confirmation email."}

    if _dev_mode():
        ref = booking.get("bookingId") or "package"
        print(f"[itinero-email] DEV package → {mail}: ref={ref}", flush=True)
        return {"ok": True, "channel": "dev", "kind": "package"}

    return {
        "ok": False,
        "error": "smtp_not_configured",
        "message": "Package confirmation email requires SMTP_HOST, SMTP_USER, SMTP_PASSWORD.",
    }
