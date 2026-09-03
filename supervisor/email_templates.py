"""Branded transactional email HTML (OTP, etc.)."""

from __future__ import annotations

import html
from email.message import EmailMessage
from pathlib import Path
from typing import Any

_DIR = Path(__file__).resolve().parent
_ASSETS = _DIR / "email_assets"
_LOGO_BADGE = _ASSETS / "itinero-logo-badge.png"
_LOGO_ON_WHITE = _ASSETS / "itinero-logo-on-white.png"
_LOGO_LIGHT = _ASSETS / "itinero-logo-light.png"
_LOGO_DARK = _ASSETS / "itinero-logo-dark.png"
_LOGO_MARK = _ASSETS / "itinero-mark.png"
_SENDER_AVATAR = _ASSETS / "itinero-sender-avatar.png"
_SENDER_AVATAR_128 = _ASSETS / "itinero-sender-avatar-128.png"
_VERO_AVATAR = _ASSETS / "vero-avatar.png"
_FALLBACK_LOGO = _DIR.parent / "itinero" / "public" / "itinero-logo.png"
_FALLBACK_MARK = _DIR.parent / "itinero" / "public" / "brand" / "itinero-mark.png"
_FALLBACK_SENDER = _DIR.parent / "itinero" / "public" / "brand" / "itinero-sender-avatar.png"
_FALLBACK_VERO = _DIR.parent / "itinero" / "public" / "vero-chatbot.png"

# Brand
_NAVY = "#001439"
_ORANGE = "#F97316"
_INK = "#0F172A"
_MUTED = "#64748B"
_LINE = "#E2E8F0"
_BG = "#EEF2F7"
_CREAM = "#FFF8F3"
_SITE = "https://itinero.company"

# Opaque white+wordmark PNG (not CSS plate). Gmail dark mode inverts CSS
# backgrounds to black but usually leaves images alone — a transparent dark
# wordmark then disappears; baking white into the PNG keeps "itin" visible.
_LOGO_IMG = (
    '<img src="cid:itinero-logo" alt="Itinero" width="148" height="62" '
    'style="display:block;width:148px;height:62px;border:0;outline:none;'
    'border-radius:12px;-ms-interpolation-mode:bicubic;" />'
)


def _logo_on_plate(*, align: str = "left") -> str:
    """Logo chip for navy header/footer — white is baked into the PNG."""
    return f"""<table role="presentation" cellspacing="0" cellpadding="0" align="{align}" style="border-collapse:separate;">
              <tr>
                <td align="center" valign="middle" bgcolor="#FFFFFF" style="background-color:#FFFFFF !important;border-radius:12px;padding:0;border:1px solid rgba(255,255,255,0.25);">
                  {_LOGO_IMG}
                </td>
              </tr>
            </table>"""


def _email_brand_header(*, label: str = "") -> str:
    """Logo on white plate (never merges into navy) + optional label."""
    label_html = (
        f'<span style="font-size:12px;font-weight:600;color:#94A3B8;">{html.escape(label)}</span>'
        if label
        else ""
    )
    return f"""<tr>
        <td style="background:{_NAVY};padding:18px 28px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td align="left" valign="middle">{_logo_on_plate(align="left")}</td>
              <td align="right" valign="middle">{label_html}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="height:4px;background:{_ORANGE};font-size:0;line-height:0;">&nbsp;</td>
      </tr>"""


def _read(path: Path) -> bytes | None:
    try:
        if path.is_file():
            return path.read_bytes()
    except Exception:
        return None
    return None


def logo_badge_bytes() -> bytes | None:
    """Dark wordmark on opaque white — safe for Gmail/OS dark-mode inversion."""
    return _read(_LOGO_ON_WHITE) or _read(_LOGO_BADGE) or _read(_LOGO_DARK)


def logo_mark_bytes() -> bytes | None:
    """Filled circular brand mark for email header + Gmail sender avatar."""
    return (
        _read(_LOGO_MARK)
        or _read(_FALLBACK_MARK)
        or _read(_SENDER_AVATAR_128)
        or _read(_SENDER_AVATAR)
        or _read(_FALLBACK_SENDER)
    )


def logo_dark_bytes() -> bytes | None:
    """Navy+orange wordmark for light backgrounds (footer / PDF)."""
    return _read(_LOGO_DARK) or _read(_LOGO_BADGE) or _read(_FALLBACK_LOGO)


def vero_avatar_bytes() -> bytes | None:
    return _read(_VERO_AVATAR) or _read(_FALLBACK_VERO)


def otp_plain(code: str) -> str:
    return (
        f"Your Itinero verification code is {code}.\n"
        f"Valid for 10 minutes. Don't share it with anyone.\n\n"
        f"Need help? Ask Vero in the Itinero app.\n"
        f"{_SITE} | support@itinero.company\n"
    )


def _digit_cells(code: str) -> str:
    digits = [c for c in str(code) if c.isdigit()][:6]
    while len(digits) < 6:
        digits.append("-")
    cells = []
    for i, d in enumerate(digits):
        pad = "4px" if i < len(digits) - 1 else "0"
        cells.append(
            f"""<td style="padding:0 {pad} 0 0;">
  <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:separate;">
    <tr>
      <td align="center" valign="middle" style="width:44px;height:54px;background:#FFFFFF;border:1.5px solid #FDBA74;border-radius:12px;font-size:26px;font-weight:800;color:{_NAVY};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:0;">
        {html.escape(d)}
      </td>
    </tr>
  </table>
</td>"""
        )
    return "".join(cells)


def otp_html(code: str, *, to_email: str = "") -> str:
    del to_email  # never show recipient address in the body
    digits = _digit_cells(code)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Your Itinero code</title>
</head>
<body style="margin:0;padding:0;background:{_BG};color-scheme:light only;supported-color-schemes:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:{_BG};">
    Your Itinero code - valid 10 minutes - don't share it
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};padding:36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid {_LINE};">

          <!-- Header -->
          {_email_brand_header(label="Verification")}

          <!-- Body -->
          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:{_ORANGE};">
                Sign in
              </p>
              <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:{_NAVY};font-weight:800;letter-spacing:-0.02em;">
                Your verification code
              </h1>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:{_MUTED};">
                Enter this code in Itinero to continue. It expires in
                <strong style="color:{_INK};">10 minutes</strong>.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">
                <tr>
                  <td align="center" style="background:{_CREAM};border:1px solid #FED7AA;border-radius:16px;padding:26px 16px 22px;">
                    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:{_ORANGE};">
                      One-time code
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
                      <tr>{digits}</tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 10px;">
                <tr>
                  <td style="background:#F8FAFC;border-radius:12px;padding:14px 16px;border:1px solid {_LINE};">
                    <p style="margin:0;font-size:13px;line-height:1.55;color:{_MUTED};">
                      <strong style="color:{_NAVY};">Keep this private.</strong>
                      Itinero will never ask you for this code on a call or chat.
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font-size:12px;line-height:1.55;color:#94A3B8;">
                Didn't request this? Ignore the email - nothing changes on your account.
              </p>
            </td>
          </tr>

          <!-- Ask Vero -->
          {_email_vero_strip()}

          <!-- Brand footer (matches marketing footer) -->
          {_email_brand_footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


def build_otp_message(
    *,
    to: str,
    code: str,
    from_addr: str,
    subject: str = "Your Itinero verification code",
) -> EmailMessage:
    from supervisor.email_copy import scrub_em_marks

    msg = EmailMessage()
    msg["Subject"] = scrub_em_marks(subject)
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(scrub_em_marks(otp_plain(code)))
    msg.add_alternative(scrub_em_marks(otp_html(code)), subtype="html")
    return _attach_inline_brand(msg, include_vero=True)


def _email_vero_strip() -> str:
    return f"""<tr>
            <td style="padding:24px 28px 8px;">
              <div style="height:1px;background:{_LINE};font-size:0;line-height:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 26px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="64" valign="middle" style="padding-right:14px;">
                    <img src="cid:vero-avatar" alt="Vero" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:28px;border:0;outline:none;" />
                  </td>
                  <td valign="middle">
                    <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:{_NAVY};">Need help? Ask Vero</p>
                    <p style="margin:0;font-size:13px;line-height:1.5;color:{_MUTED};">
                      Open Itinero and tap Vero for bookings, cancels, or trip questions.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>"""


def _email_brand_footer() -> str:
    return f"""<tr>
            <td style="background:{_NAVY};border-top:3px solid {_ORANGE};padding:28px 24px 24px;" align="center">
              {_logo_on_plate(align="center")}
              <p style="margin:16px 0 16px;font-size:13px;line-height:1.4;color:#FFFFFF;">
                Discover more <span style="color:{_ORANGE};font-weight:700;">everywhere.</span>
              </p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.6;font-weight:600;">
                <a href="{_SITE}/flights" style="color:#FFFFFF;text-decoration:none;">Flights</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/hotels" style="color:#FFFFFF;text-decoration:none;">Stays</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/packages" style="color:#FFFFFF;text-decoration:none;">Packages</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/explore" style="color:#FFFFFF;text-decoration:none;">Explore</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/trips" style="color:#FFFFFF;text-decoration:none;">Trips</a>
              </p>
              <p style="margin:0;font-size:11px;color:#94A3B8;">© 2026 Itinero | support@itinero.company</p>
            </td>
          </tr>"""


def _detail_row(label: str, value: str, *, last: bool = False) -> str:
    if not value:
        return ""
    border = "0" if last else f"1px solid {_LINE}"
    return f"""<tr>
      <td style="padding:10px 0;border-bottom:{border};width:38%;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:{_MUTED};vertical-align:top;">
        {html.escape(label)}
      </td>
      <td style="padding:10px 0;border-bottom:{border};font-size:14px;font-weight:600;color:{_INK};vertical-align:top;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        {value}
      </td>
    </tr>"""


def _title_case_name(name: str) -> str:
    s = str(name or "").strip()
    if not s:
        return ""
    if s.isupper() or s.islower():
        return " ".join(p.capitalize() for p in s.split())
    return s


def _format_money_html(amount: Any, currency: str = "INR") -> str:
    try:
        n = float(amount)
    except (TypeError, ValueError):
        return html.escape(str(amount or ""))
    cur = (currency or "INR").upper()
    if cur == "INR":
        return f"<strong>₹{n:,.2f}</strong>"
    return f"<strong>{html.escape(cur)} {n:,.2f}</strong>"


def _flight_schedule_html(details: dict) -> str:
    from supervisor.booking_pdf import (
        airport_info,
        pretty_clock,
        pretty_travel_date,
        _split_route,
    )

    origin_code = (details.get("origin") or "").upper() or _split_route(details.get("route"))[0]
    dest_code = (details.get("destination") or "").upper() or _split_route(details.get("route"))[1]
    origin = airport_info(origin_code)
    dest = airport_info(dest_code)
    dep = pretty_clock(details.get("depart_at"))
    arr = pretty_clock(details.get("arrive_at"))
    travel = pretty_travel_date(details.get("depart_at") or details.get("travel_date"))
    airline = html.escape(str(details.get("airline") or "Flight"))
    flight_no = html.escape(str(details.get("flight_number") or ""))
    cabin = html.escape(str(details.get("cabin") or "Economy"))
    stops = html.escape(str(details.get("stops") or "Direct"))
    duration = html.escape(str(details.get("duration") or ""))
    meta = " | ".join(x for x in [flight_no, cabin, stops] if x)

    return f"""
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border:1px solid #FFE0CC;border-radius:16px;overflow:hidden;background:{_CREAM};">
                <tr>
                  <td style="padding:16px 18px 8px;background:#FFFFFF;">
                    <p style="margin:0 0 2px;font-size:15px;font-weight:800;color:{_NAVY};">{airline}</p>
                    <p style="margin:0;font-size:12px;color:{_MUTED};">{meta}</p>
                  </td>
                  <td align="right" style="padding:16px 18px 8px;background:#FFFFFF;">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FFF7ED;border:1px solid #FED7AA;font-size:11px;font-weight:700;color:#9A3412;">{cabin}</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:8px 18px 16px;background:#FFFFFF;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="38%" valign="top">
                          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{_ORANGE};">Depart</p>
                          <p style="margin:0;font-size:28px;font-weight:800;color:{_NAVY};letter-spacing:-0.03em;">{html.escape(dep)}</p>
                          <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:{_INK};">{html.escape(origin['code'])}</p>
                          <p style="margin:2px 0 0;font-size:12px;color:{_MUTED};">{html.escape(origin['city'])}</p>
                        </td>
                        <td width="24%" align="center" valign="middle">
                          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:{_INK};">{duration or "&nbsp;"}</p>
                          <div style="height:2px;background:{_ORANGE};font-size:0;line-height:0;">&nbsp;</div>
                          <p style="margin:6px 0 0;font-size:11px;color:{_MUTED};">{stops}</p>
                        </td>
                        <td width="38%" align="right" valign="top">
                          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{_ORANGE};">Arrive</p>
                          <p style="margin:0;font-size:28px;font-weight:800;color:{_NAVY};letter-spacing:-0.03em;">{html.escape(arr)}</p>
                          <p style="margin:4px 0 0;font-size:15px;font-weight:700;color:{_INK};">{html.escape(dest['code'])}</p>
                          <p style="margin:2px 0 0;font-size:12px;color:{_MUTED};">{html.escape(dest['city'])}</p>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0;padding-top:12px;border-top:1px dashed #FFE0CC;font-size:12px;color:{_MUTED};">
                      {html.escape(travel) if travel else ""}
                    </p>
                  </td>
                </tr>
              </table>
"""


def _hotel_stay_html(details: dict) -> str:
    from supervisor.booking_pdf import pretty_hotel_date

    hotel = html.escape(str(details.get("hotel_name") or "Your hotel"))
    cin = html.escape(pretty_hotel_date(details.get("check_in")))
    cout = html.escape(pretty_hotel_date(details.get("check_out")))
    room = html.escape(str(details.get("room_name") or ""))
    guest = html.escape(_title_case_name(str(details.get("guest_name") or "")))
    return f"""
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border:1px solid #FFE0CC;border-radius:16px;overflow:hidden;background:#FFFFFF;">
                <tr>
                  <td style="padding:16px 18px 10px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{_ORANGE};">Stay</p>
                    <p style="margin:0;font-size:18px;font-weight:800;color:{_NAVY};">{hotel}</p>
                    {"<p style='margin:6px 0 0;font-size:13px;color:" + _MUTED + ";'>" + room + "</p>" if room else ""}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 18px 16px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="48%" valign="top" style="background:{_CREAM};border-radius:12px;padding:12px 14px;">
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:{_ORANGE};">Check-in</p>
                          <p style="margin:0;font-size:15px;font-weight:700;color:{_NAVY};">{cin}</p>
                        </td>
                        <td width="4%">&nbsp;</td>
                        <td width="48%" valign="top" style="background:{_CREAM};border-radius:12px;padding:12px 14px;">
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:{_ORANGE};">Check-out</p>
                          <p style="margin:0;font-size:15px;font-weight:700;color:{_NAVY};">{cout}</p>
                        </td>
                      </tr>
                    </table>
                    {"<p style='margin:12px 0 0;font-size:13px;color:" + _MUTED + ";'>Guest: <strong style='color:" + _INK + ";'>" + guest + "</strong></p>" if guest else ""}
                  </td>
                </tr>
              </table>
"""


def booking_confirmation_plain(*, kind: str, details: dict, pdf_attached: bool = True) -> str:
    from supervisor.booking_pdf import pretty_when, _money as pdf_money

    ref = details.get("booking_ref") or "-"
    amt = details.get("amount")
    cur = details.get("currency") or "INR"
    price_line = pdf_money(amt, str(cur)) if amt is not None else ""
    pending = str(details.get("status") or "").lower() == "pending"
    note = str(details.get("note") or "").strip()
    pay_id = details.get("payment_id")
    if kind == "flight":
        route = details.get("route") or "your route"
        if pending:
            body = (
                "We received your payment.\n\n"
                f"Route: {route}\n"
                f"Reference: {ref}\n"
            )
        else:
            body = (
                f"Your flight is confirmed.\n\n"
                f"Route: {route}\n"
                f"Booking reference: {ref}\n"
            )
        if details.get("airline"):
            body += f"Airline: {details.get('airline')}\n"
        if details.get("flight_number"):
            body += f"Flight: {details.get('flight_number')}\n"
        if details.get("depart_at"):
            body += f"Depart: {pretty_when(details.get('depart_at'))}\n"
        if details.get("arrive_at"):
            body += f"Arrive: {pretty_when(details.get('arrive_at'))}\n"
        pax = details.get("passengers")
        if isinstance(pax, list) and pax:
            body += "Passengers: " + ", ".join(_title_case_name(str(p)) for p in pax if p) + "\n"
    else:
        hotel = details.get("hotel_name") or "your hotel"
        cin = pretty_when(details.get("check_in")) or details.get("check_in") or ""
        cout = pretty_when(details.get("check_out")) or details.get("check_out") or ""
        if pending:
            body = (
                "We received your payment.\n\n"
                f"Property: {hotel}\n"
                f"Check-in: {cin} | Check-out: {cout}\n"
                f"Reference: {ref}\n"
            )
        else:
            body = (
                f"Your hotel stay is confirmed.\n\n"
                f"Property: {hotel}\n"
                f"Check-in: {cin} | Check-out: {cout}\n"
                f"Confirmation: {ref}\n"
            )
        if details.get("guest_name"):
            body += f"Guest: {_title_case_name(str(details.get('guest_name')))}\n"
        if details.get("room_name"):
            body += f"Room: {details.get('room_name')}\n"
    if price_line:
        body += f"Amount paid: {price_line}\n"
    if pay_id:
        body += f"Payment ID: {pay_id}\n"
    if note:
        body += f"\n{note}\n"
    if pdf_attached:
        body += "\nA PDF voucher/e-ticket is attached to this email.\n"
    body += (
        "\nView trips in the Itinero app.\n"
        f"{_SITE} | support@itinero.company\n"
    )
    return body


def booking_confirmation_html(*, kind: str, details: dict, pdf_attached: bool = True) -> str:
    from supervisor.booking_pdf import pretty_when

    pending = str(details.get("status") or "").lower() == "pending"
    ref = html.escape(str(details.get("booking_ref") or "-"))
    amt = details.get("amount")
    cur = str(details.get("currency") or "INR")
    note = html.escape(str(details.get("note") or "").strip())
    pay_id = html.escape(str(details.get("payment_id") or "").strip())

    amount_cell = _format_money_html(amt, cur) if amt is not None else ""
    schedule_html = ""

    if kind == "flight":
        eyebrow = "Flight booking"
        headline = "Payment received" if pending else "Flight confirmed"
        lede = (
            "We captured your payment. The airline ticket is still being issued - "
            "you’ll get another email once the PNR is ready."
            if pending
            else (
                "Your e-ticket is confirmed. A branded PDF is attached for check-in."
                if pdf_attached
                else "Your e-ticket is confirmed. Download your PDF anytime from My Trips."
            )
        )
        schedule_html = _flight_schedule_html(details)
        rows = []
        pax = details.get("passengers")
        if isinstance(pax, list) and pax:
            names = html.escape(", ".join(_title_case_name(str(p)) for p in pax if p))
            rows.append(_detail_row("Passengers", names))
        elif details.get("passengers"):
            rows.append(_detail_row("Passengers", html.escape(_title_case_name(str(details.get("passengers"))))))
        if details.get("email") or details.get("phone"):
            contact = " | ".join(
                x for x in [str(details.get("email") or ""), str(details.get("phone") or "")] if x
            )
            rows.append(_detail_row("Contact", html.escape(contact)))
    else:
        eyebrow = "Hotel booking"
        headline = "Payment received" if pending else "Hotel stay confirmed"
        lede = (
            "We captured your payment. We are finishing the property confirmation - "
            "you will get another email once the stay is locked in."
            if pending
            else (
                "Your stay is confirmed. A PDF voucher is attached for check-in."
                if pdf_attached
                else "Your stay is confirmed. Download your voucher anytime from My Trips."
            )
        )
        schedule_html = _hotel_stay_html(details)
        rows = []
        if details.get("email") or details.get("phone"):
            contact = " | ".join(
                x for x in [str(details.get("email") or ""), str(details.get("phone") or "")] if x
            )
            rows.append(_detail_row("Contact", html.escape(contact)))

    if amount_cell:
        rows.append(_detail_row("Amount paid", amount_cell))
    if pay_id:
        rows.append(
            _detail_row(
                "Payment ID",
                f'<span style="font-size:12px;color:{_MUTED};word-break:break-all;">{pay_id}</span>',
                last=True,
            )
        )

    details_table = "".join(r for r in rows if r)
    note_html = (
        f'<p style="margin:16px 0 0;padding:12px 14px;background:#F8FAFC;border:1px solid {_LINE};border-radius:12px;color:{_MUTED};font-size:13px;line-height:1.55;">{note}</p>'
        if note
        else ""
    )
    attach_note = (
        (
            '<p style="margin:16px 0 0;font-size:13px;color:#0F766E;font-weight:600;">'
            "PDF attached - save it with your booking reference."
            "</p>"
        )
        if pdf_attached
        else ""
    )
    status_pill = (
        '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#ECFDF3;color:#027A48;font-size:11px;font-weight:800;letter-spacing:0.04em;">CONFIRMED</span>'
        if not pending
        else '<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#FFF7ED;color:#9A3412;font-size:11px;font-weight:800;letter-spacing:0.04em;">PENDING</span>'
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>{html.escape(headline)}</title>
</head>
<body style="margin:0;padding:0;background:{_BG};color-scheme:light only;supported-color-schemes:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:{_BG};">
    {html.escape(headline)} - ref {ref}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};padding:36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid {_LINE};">
          {_email_brand_header(label="Booking")}
          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:{_ORANGE};">
                {html.escape(eyebrow)}
              </p>
              <h1 style="margin:0 0 10px;font-size:26px;line-height:1.25;color:{_NAVY};font-weight:800;letter-spacing:-0.02em;">
                {html.escape(headline)}
              </h1>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:{_MUTED};">
                {html.escape(lede)}
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background:{_NAVY};border-radius:14px;padding:16px 18px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C4D2E8;">
                            Booking reference
                          </p>
                          <p style="margin:0;font-size:20px;font-weight:800;color:#FFFFFF;letter-spacing:0.02em;">
                            {ref}
                          </p>
                        </td>
                        <td align="right" valign="middle">{status_pill}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              {schedule_html}

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">
                {details_table}
              </table>
              {attach_note}
              {note_html}
              <p style="margin:18px 0 0;font-size:13px;color:{_MUTED};">
                Manage this booking in
                <a href="{_SITE}/trips" style="color:{_ORANGE};font-weight:700;text-decoration:none;">My Trips</a>.
              </p>
            </td>
          </tr>
          {_email_vero_strip()}
          {_email_brand_footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _attach_inline_brand(msg: EmailMessage, *, include_vero: bool = True) -> EmailMessage:
    """Attach only CID images actually referenced in the HTML.

    Attaching unused assets (e.g. itinero-mark) makes Gmail show them as
    downloadable attachments even when disposition is inline.
    """
    html_part = msg.get_body(preferencelist=("html",))
    if html_part is None:
        return msg
    try:
        html_body = html_part.get_content()
    except Exception:
        html_body = str(html_part.get_payload(decode=True) or b"")

    def _needed(cid: str) -> bool:
        return f"cid:{cid}" in html_body

    logo = logo_badge_bytes()
    if logo and _needed("itinero-logo"):
        html_part.add_related(
            logo,
            maintype="image",
            subtype="png",
            cid="<itinero-logo>",
            filename="itinero-logo.png",
            disposition="inline",
        )
    mark = logo_mark_bytes()
    if mark and _needed("itinero-mark"):
        html_part.add_related(
            mark,
            maintype="image",
            subtype="png",
            cid="<itinero-mark>",
            filename="itinero-mark.png",
            disposition="inline",
        )
    if include_vero and _needed("vero-avatar"):
        vero = vero_avatar_bytes()
        if vero:
            html_part.add_related(
                vero,
                maintype="image",
                subtype="png",
                cid="<vero-avatar>",
                filename="vero-avatar.png",
                disposition="inline",
            )
    return msg


def _email_marketing_footer(*, unsub_url: str = "", prefs_url: str = "") -> str:
    """Same brand footer as transactional — logo plate + nav + unsub."""
    unsub_bit = ""
    if unsub_url or prefs_url:
        links = []
        if unsub_url:
            links.append(
                f'<a href="{html.escape(unsub_url)}" style="color:#94A3B8;text-decoration:underline;">Unsubscribe</a>'
            )
        if prefs_url:
            links.append(
                f'<a href="{html.escape(prefs_url)}" style="color:#94A3B8;text-decoration:underline;">Email preferences</a>'
            )
        unsub_bit = (
            f'<p style="margin:0 0 16px;font-size:11px;line-height:1.5;color:#94A3B8;">'
            f'{" · ".join(links)}</p>'
        )
    return f"""<tr>
            <td style="background:{_NAVY};border-top:3px solid {_ORANGE};padding:28px 24px 24px;" align="center">
              {_logo_on_plate(align="center")}
              <p style="margin:16px 0 16px;font-size:13px;line-height:1.4;color:#FFFFFF;">
                Discover more <span style="color:{_ORANGE};font-weight:700;">everywhere.</span>
              </p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.6;font-weight:600;">
                <a href="{_SITE}/flights" style="color:#FFFFFF;text-decoration:none;">Flights</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/hotels" style="color:#FFFFFF;text-decoration:none;">Stays</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/packages" style="color:#FFFFFF;text-decoration:none;">Packages</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/explore" style="color:#FFFFFF;text-decoration:none;">Explore</a>
                &nbsp;&nbsp;&nbsp;
                <a href="{_SITE}/trips" style="color:#FFFFFF;text-decoration:none;">Trips</a>
              </p>
              {unsub_bit}
              <p style="margin:0;font-size:11px;color:#94A3B8;">© 2026 Itinero | support@itinero.company</p>
            </td>
          </tr>"""


def _format_transfer_plain(t: dict) -> str:
    mode = str(t.get("mode") or "road").title()
    origin = str(t.get("origin") or "").strip()
    dest = str(t.get("destination") or "").strip()
    mins = int(t.get("estimated_duration_minutes") or 0)
    route = f"{origin} -> {dest}" if origin and dest else origin or dest
    time = ""
    if mins >= 60:
        h, m = divmod(mins, 60)
        time = f" (~{h}h {m}m)" if m else f" (~{h}h)"
    elif mins:
        time = f" (~{mins}m)"
    return f"{mode}: {route}{time}".strip()


def _package_itinerary_html(days: list) -> str:
    if not days:
        return ""
    blocks: list[str] = []
    for day in days[:12]:
        dnum = day.get("day") or "?"
        title = html.escape(str(day.get("title") or f"Day {dnum}"))
        narrative = html.escape(str(day.get("narrative") or day.get("description") or "")[:180])
        stay = html.escape(str(day.get("stayCity") or day.get("hotel_city") or ""))
        acts = [html.escape(str(a)[:72]) for a in (day.get("activities") or [])[:3]]
        meals = [html.escape(str(m)[:48]) for m in (day.get("meals") or [])[:2]]
        transfers = [_format_transfer_plain(t) for t in (day.get("transfers") or [])[:2]]
        act_html = "".join(
            f'<li style="margin:0 0 4px;font-size:13px;color:{_INK};">{a}</li>' for a in acts
        )
        meal_html = (
            f'<p style="margin:6px 0 0;font-size:12px;color:{_MUTED};">Meals: {", ".join(meals)}</p>'
            if meals
            else ""
        )
        tr_html = (
            f'<p style="margin:4px 0 0;font-size:12px;color:{_MUTED};">{" | ".join(html.escape(x) for x in transfers)}</p>'
            if transfers
            else ""
        )
        stay_html = (
            f'<p style="margin:6px 0 0;font-size:12px;font-weight:700;color:{_ORANGE};">Stay: {stay}</p>'
            if stay
            else ""
        )
        blocks.append(
            f"""<tr>
              <td style="padding:14px 16px;border-bottom:1px solid {_LINE};">
                <p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:{_ORANGE};">Day {dnum}</p>
                <p style="margin:0 0 6px;font-size:15px;font-weight:800;color:{_NAVY};">{title}</p>
                {f'<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:{_MUTED};">{narrative}</p>' if narrative else ""}
                {f'<ul style="margin:0;padding-left:18px;">{act_html}</ul>' if act_html else ""}
                {meal_html}{tr_html}{stay_html}
              </td>
            </tr>"""
        )
    more = ""
    if len(days) > 12:
        more = f'<p style="margin:12px 0 0;font-size:13px;color:{_MUTED};">+ {len(days) - 12} more days in your attached PDF.</p>'
    return f"""<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border:1px solid {_LINE};border-radius:14px;overflow:hidden;background:#FAFBFC;">
      <tr>
        <td style="padding:14px 16px;background:{_CREAM};border-bottom:1px solid {_LINE};">
          <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:{_NAVY};">Your day-by-day itinerary</p>
        </td>
      </tr>
      {"".join(blocks)}
    </table>{more}"""


def package_confirmation_plain(*, booking: dict, pdf_attached: bool = True) -> str:
    pkg = booking.get("package") or {}
    stay = booking.get("stay") or {}
    guest = booking.get("guest") or {}
    payment = booking.get("payment") or {}
    ref = str(booking.get("bookingId") or "")
    name = _title_case_name(
        " ".join(str(guest.get(k) or "").strip() for k in ("firstName", "lastName") if guest.get(k))
    )
    lines = [
        f"Your Itinero package is confirmed - {pkg.get('title') or 'Package'}.",
        "",
        f"Booking reference: {ref}",
        f"Guest: {name}",
        f"Email: {guest.get('email') or ''}",
        f"Dates: {stay.get('checkIn') or ''} to {stay.get('checkOut') or ''}",
        f"Hotel: {(stay.get('hotel') or {}).get('name') or 'Hotel'}",
        f"Amount paid: {payment.get('totalCharged') or stay.get('total') or ''} {stay.get('currency') or 'INR'}",
        "",
        "DAY-BY-DAY ITINERARY",
        "-" * 40,
    ]
    for day in (pkg.get("itinerary") or [])[:14]:
        lines.append(f"Day {day.get('day')}: {day.get('title') or ''}")
        if day.get("narrative"):
            lines.append(str(day.get("narrative"))[:200])
        for act in (day.get("activities") or [])[:3]:
            lines.append(f"  - {act}")
        if day.get("stayCity"):
            lines.append(f"  Stay: {day.get('stayCity')}")
        lines.append("")
    lines.extend(
        [
            ("Full itinerary PDF attached." if pdf_attached else "Download your itinerary PDF from My Trips."),
            f"View online: {_SITE}/packages/confirmation/{ref}",
            "",
            f"{_SITE} | support@itinero.company",
        ]
    )
    return "\n".join(lines)


def package_confirmation_html(*, booking: dict, pdf_attached: bool = True) -> str:
    from supervisor.booking_pdf import pretty_when

    pkg = booking.get("package") or {}
    stay = booking.get("stay") or {}
    guest = booking.get("guest") or {}
    payment = booking.get("payment") or {}
    flight = booking.get("flight") or {}
    ref = html.escape(str(booking.get("bookingId") or ""))
    title = html.escape(str(pkg.get("title") or "Package"))
    name = html.escape(
        _title_case_name(
            " ".join(str(guest.get(k) or "").strip() for k in ("firstName", "lastName") if guest.get(k))
        )
    )
    email = html.escape(str(guest.get("email") or ""))
    hotel = html.escape(str((stay.get("hotel") or {}).get("name") or "Hotel"))
    room = html.escape(str((stay.get("room") or {}).get("title") or (stay.get("room") or {}).get("board") or ""))
    dates = f"{html.escape(pretty_when(stay.get('checkIn')))} - {html.escape(pretty_when(stay.get('checkOut')))}"
    amount = _format_money_html(payment.get("totalCharged") or stay.get("total"), str(stay.get("currency") or "INR"))
    confirm_url = f"{_SITE}/packages/confirmation/{booking.get('bookingId') or ''}"

    rows = [
        _detail_row("Guest", name),
        _detail_row("Email", email),
        _detail_row("Dates", dates),
        _detail_row("Hotel", hotel),
        _detail_row("Room", room),
        _detail_row("Amount paid", amount, last=not bool(flight)),
    ]
    if flight:
        fl = html.escape(
            f"{flight.get('origin') or ''} -> {flight.get('destination') or ''} ({flight.get('airline') or 'Flight'})"
        )
        rows.append(_detail_row("Flight", fl, last=True))
    details_table = "".join(r for r in rows if r)
    itinerary_html = _package_itinerary_html(list(pkg.get("itinerary") or []))

    know = list(pkg.get("knowBeforeYouGo") or [])[:3]
    know_html = ""
    if know:
        items = "".join(
            f'<li style="margin:0 0 8px;font-size:13px;color:{_INK};"><strong>{html.escape(str(k.get("title") or ""))}</strong> - {html.escape(str(k.get("body") or "")[:120])}</li>'
            for k in know
        )
        know_html = f"""<p style="margin:18px 0 8px;font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:{_NAVY};">Know before you go</p>
        <ul style="margin:0;padding-left:18px;">{items}</ul>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your package is confirmed</title>
</head>
<body style="margin:0;padding:0;background:{_BG};color-scheme:light only;supported-color-schemes:light;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};padding:36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid {_LINE};">
          {_email_brand_header(label="Package")}
          <tr>
            <td style="padding:32px 28px 8px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:{_ORANGE};">Confirmed</p>
              <h1 style="margin:0 0 10px;font-size:26px;line-height:1.25;color:{_NAVY};font-weight:800;">{title}</h1>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:{_MUTED};">
                Your curated trip is booked. Save the PDF itinerary below - it has every day, transfer, and stay.
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;">
                <tr>
                  <td style="background:{_NAVY};border-radius:14px;padding:16px 18px;">
                    <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C4D2E8;">Booking reference</p>
                    <p style="margin:0;font-size:20px;font-weight:800;color:#FFFFFF;">{ref}</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 8px;">{details_table}</table>
              {itinerary_html}
              {know_html}
              <p style="margin:16px 0 0;font-size:13px;color:#0F766E;font-weight:600;">{"PDF itinerary attached - day-by-day plan for your dates." if pdf_attached else "Open My Trips anytime to download your itinerary PDF."}</p>
              <p style="margin:18px 0 0;font-size:13px;color:{_MUTED};">
                <a href="{confirm_url}" style="color:{_ORANGE};font-weight:700;text-decoration:none;">Open confirmation online</a>
                | <a href="{_SITE}/trips" style="color:{_ORANGE};font-weight:700;text-decoration:none;">My Trips</a>
              </p>
            </td>
          </tr>
          {_email_vero_strip()}
          {_email_brand_footer()}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def build_package_confirmation_message(
    *,
    to: str,
    booking: dict,
    from_addr: str,
    subject: str | None = None,
) -> EmailMessage:
    """Multipart package confirmation - branded HTML + itinerary PDF."""
    pkg = booking.get("package") or {}
    ref = str(booking.get("bookingId") or "")
    subj = subject or f"Your Itinero package is confirmed - {pkg.get('title') or ref}"

    pdf_attached = False
    pdf_bytes = b""
    filename = "itinero-package.pdf"
    try:
        from supervisor.package_pdf import build_package_pdf

        pdf_bytes, filename = build_package_pdf(booking=booking)
        pdf_attached = bool(pdf_bytes)
    except Exception:
        pdf_attached = False

    msg = EmailMessage()
    from supervisor.email_copy import scrub_em_marks

    msg["Subject"] = scrub_em_marks(subj)
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(scrub_em_marks(package_confirmation_plain(booking=booking, pdf_attached=pdf_attached)))
    msg.add_alternative(
        scrub_em_marks(package_confirmation_html(booking=booking, pdf_attached=pdf_attached)),
        subtype="html",
    )
    _attach_inline_brand(msg, include_vero=True)
    if pdf_attached and pdf_bytes:
        msg.add_attachment(
            pdf_bytes,
            maintype="application",
            subtype="pdf",
            filename=filename,
        )
    return msg


def build_booking_confirmation_message(
    *,
    to: str,
    kind: str,
    details: dict,
    from_addr: str,
    subject: str | None = None,
) -> EmailMessage:
    """Multipart booking confirmation - branded HTML + PDF attachment."""
    from supervisor.email_copy import scrub_em_marks

    k = (kind or "flight").strip().lower()
    pending = str(details.get("status") or "").lower() == "pending"
    if subject:
        subj = subject
    elif pending and k == "flight":
        subj = "Payment received - your Itinero flight ticket is being issued"
    elif pending:
        subj = "Payment received - your Itinero hotel booking is being confirmed"
    else:
        subj = f"Your Itinero {k} booking is confirmed - {details.get('booking_ref') or 'Itinero'}"

    pdf_attached = False
    pdf_bytes = b""
    filename = "itinero-booking.pdf"
    try:
        from supervisor.booking_pdf import build_booking_pdf

        pdf_bytes, filename = build_booking_pdf(kind=k, details=details)
        pdf_attached = bool(pdf_bytes)
    except Exception:
        pdf_attached = False

    msg = EmailMessage()
    msg["Subject"] = scrub_em_marks(subj)
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(
        scrub_em_marks(booking_confirmation_plain(kind=k, details=details, pdf_attached=pdf_attached))
    )
    msg.add_alternative(
        scrub_em_marks(booking_confirmation_html(kind=k, details=details, pdf_attached=pdf_attached)),
        subtype="html",
    )
    _attach_inline_brand(msg, include_vero=True)
    if pdf_attached and pdf_bytes:
        msg.add_attachment(
            pdf_bytes,
            maintype="application",
            subtype="pdf",
            filename=filename,
        )
    return msg


def build_booking_cancellation_message(
    *,
    to: str,
    kind: str,
    details: dict,
    from_addr: str,
) -> EmailMessage:
    from supervisor.email_copy import scrub_em_marks

    k = (kind or "booking").strip().lower()
    ref = html.escape(str(details.get("booking_ref") or details.get("booking_id") or "Itinero"))
    title = html.escape(str(details.get("title") or details.get("hotel_name") or k.title()))
    loyalty = details.get("loyalty_reversed")
    loyalty_line = (
        "<p style='color:#64748B;font-size:14px;'>Itinero Rewards earned on this booking were reversed.</p>"
        if loyalty
        else ""
    )
    subject = f"Your Itinero {k} booking was cancelled — {details.get('booking_ref') or ref}"
    plain = (
        f"Your Itinero {k} booking {details.get('booking_ref') or ''} was cancelled.\n"
        f"{details.get('title') or details.get('hotel_name') or k}\n"
        + ("Rewards on this booking were reversed.\n" if loyalty else "")
        + "If you didn't request this, reply to this email.\n"
    )
    inner = f"""
      {_email_brand_header(label="Cancellation")}
      <tr>
        <td style="background:#fff;padding:28px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{_ORANGE};">Cancelled</p>
          <h1 style="margin:0 0 12px;font-size:22px;color:{_NAVY};">Booking {ref}</h1>
          <p style="margin:0 0 16px;color:{_INK};font-size:15px;">{title} is cancelled. Any supplier refund follows the fare rules.</p>
          {loyalty_line}
          <p style="margin:18px 0 0;color:{_MUTED};font-size:13px;">This email is from Itinero only — ignore duplicate supplier mail if it arrives.</p>
        </td>
      </tr>
    """
    html_body = f"""<!DOCTYPE html><html><body style="margin:0;background:{_BG};font-family:Arial,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};">
        <tr><td align="center" style="padding:24px 12px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;">
            {inner}
          </table>
        </td></tr>
      </table>
    </body></html>"""
    msg = EmailMessage()
    msg["Subject"] = scrub_em_marks(subject)
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(scrub_em_marks(plain))
    msg.add_alternative(scrub_em_marks(html_body), subtype="html")
    _attach_inline_brand(msg, include_vero=False)
    return msg


def build_price_watch_message(
    *,
    to: str,
    details: dict,
    from_addr: str,
) -> EmailMessage:
    from supervisor.email_copy import scrub_em_marks

    origin = html.escape(str(details.get("origin") or ""))
    dest = html.escape(str(details.get("destination") or ""))
    price = details.get("price")
    was = details.get("wasPrice")
    cur = html.escape(str(details.get("currency") or "INR"))
    best = html.escape(str(details.get("bestDate") or ""))
    url = f"{_SITE}/flights?from={origin}&to={dest}" + (
        f"&depart={best}" if details.get("bestDate") else ""
    )
    subject = f"Price drop · {details.get('origin')} → {details.get('destination')}"
    plain = (
        f"Live min fare {details.get('origin')} → {details.get('destination')} is now {cur} {price} "
        f"(was {cur} {was})"
        + (f" around {details.get('bestDate')}.\n" if details.get("bestDate") else ".\n")
        + f"Book: {url}\n"
    )
    inner = f"""
      {_email_brand_header(label="Price watch")}
      <tr>
        <td style="background:#fff;padding:28px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:{_ORANGE};">Fare drop</p>
          <h1 style="margin:0 0 12px;font-size:22px;color:{_NAVY};">{origin} → {dest}</h1>
          <p style="margin:0 0 16px;color:{_INK};font-size:16px;">Live min <b>{cur} {html.escape(str(price))}</b> (was {cur} {html.escape(str(was))}){f" · best {best}" if best else ""}.</p>
          <p style="margin:0;"><a href="{html.escape(url)}" style="display:inline-block;background:{_ORANGE};color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">See flights</a></p>
        </td>
      </tr>
    """
    html_body = f"""<!DOCTYPE html><html><body style="margin:0;background:{_BG};font-family:Arial,sans-serif;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{_BG};">
        <tr><td align="center" style="padding:24px 12px;">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;">
            {inner}
          </table>
        </td></tr>
      </table>
    </body></html>"""
    msg = EmailMessage()
    msg["Subject"] = scrub_em_marks(subject)
    msg["From"] = from_addr
    msg["To"] = to
    msg.set_content(scrub_em_marks(plain))
    msg.add_alternative(scrub_em_marks(html_body), subtype="html")
    _attach_inline_brand(msg, include_vero=True)
    return msg
