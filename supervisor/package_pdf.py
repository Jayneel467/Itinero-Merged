"""Branded package confirmation PDF with full day-by-day itinerary."""

from __future__ import annotations

from io import BytesIO
from typing import Any

from supervisor.booking_pdf import (
    _CREAM,
    _INK,
    _LINE,
    _MUTED,
    _NAVY,
    _ORANGE,
    _WHITE,
    _money,
    _rounded_rect,
    _safe_ascii,
    _title_case_name,
    _try_image,
    pretty_when,
    pretty_travel_date,
)

_DIR = __import__("pathlib").Path(__file__).resolve().parent
_FALLBACK_LOGO = _DIR.parent / "itinero" / "public" / "itinero-logo.png"
_LOGO = _DIR / "email_assets" / "itinero-logo-badge.png"


def _format_transfer(t: dict[str, Any]) -> str:
    mode = _safe_ascii(t.get("mode") or "road")
    origin = _safe_ascii(t.get("origin") or "")
    dest = _safe_ascii(t.get("destination") or "")
    mins = int(t.get("estimated_duration_minutes") or 0)
    route = f"{origin} -> {dest}" if origin and dest else origin or dest
    time = ""
    if mins >= 60:
        h, m = divmod(mins, 60)
        time = f" (~{h}h {m}m)" if m else f" (~{h}h)"
    elif mins:
        time = f" (~{mins}m)"
    return f"{mode.title()}: {route}{time}".strip()


def _draw_day(c, *, x: float, y: float, w: float, day: dict[str, Any]) -> float:
    """Draw one itinerary day block; return new y (top of next block)."""
    title = _safe_ascii(day.get("title") or f"Day {day.get('day')}")
    narrative = _safe_ascii(day.get("narrative") or day.get("description") or "")
    stay = _safe_ascii(day.get("stayCity") or day.get("hotel_city") or "")
    date = pretty_travel_date(day.get("date")) if day.get("date") else ""

    lines: list[str] = []
    if narrative:
        lines.append(narrative[:220])
    for act in (day.get("activities") or [])[:4]:
        lines.append(f"  - {_safe_ascii(act)[:70]}")
    for meal in (day.get("meals") or [])[:3]:
        lines.append(f"  Meal: {_safe_ascii(meal)[:50]}")
    for tr in (day.get("transfers") or [])[:2]:
        lines.append(f"  {_format_transfer(tr)[:72]}")
    if stay:
        lines.append(f"  Stay: {stay[:40]}")

    block_h = 36 + min(len(lines), 8) * 11
    c.setFillColorRGB(*_WHITE)
    c.setStrokeColorRGB(*_LINE)
    c.setLineWidth(0.6)
    _rounded_rect(c, x, y - block_h, w, block_h, 8, fill=1, stroke=1)

    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 8)
    head = f"Day {day.get('day', '?')}: {title[:48]}"
    c.drawString(x + 12, y - 16, head[:72])
    if date:
        c.setFillColorRGB(*_MUTED)
        c.setFont("Helvetica", 7)
        c.drawRightString(x + w - 12, y - 16, date[:24])

    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica", 8)
    ty = y - 30
    for line in lines[:8]:
        c.drawString(x + 12, ty, line[:90])
        ty -= 11

    return y - block_h - 8


def build_package_pdf(*, booking: dict[str, Any]) -> tuple[bytes, str]:
    """Return (pdf_bytes, filename) for a package booking record."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    pkg = booking.get("package") or {}
    stay = booking.get("stay") or {}
    guest = booking.get("guest") or {}
    flight = booking.get("flight") or {}
    payment = booking.get("payment") or {}

    booking_id = _safe_ascii(booking.get("bookingId") or "PKG")
    safe_ref = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in booking_id) or "package"
    filename = f"itinero-package-{safe_ref}.pdf"

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    m = 36
    content_w = width - m * 2

    def new_page_header(page_num: int) -> float:
        c.setFillColorRGB(*_WHITE)
        c.rect(0, 0, width, height, fill=1, stroke=0)
        y_top = height - 48
        logo = _try_image(_FALLBACK_LOGO) or _try_image(_LOGO)
        if logo:
            c.drawImage(logo, m, y_top - 6, width=110, height=24, mask="auto", preserveAspectRatio=True)
        c.setFillColorRGB(*_INK)
        c.setFont("Helvetica-Bold", 11)
        c.drawRightString(width - m, y_top + 4, "PACKAGE ITINERARY")
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(*_MUTED)
        c.drawRightString(width - m, y_top - 10, f"Page {page_num}")
        y = y_top - 28
        c.setStrokeColorRGB(*_ORANGE)
        c.setLineWidth(3)
        c.line(m, y, width - m, y)
        return y - 16

    y = new_page_header(1)

    # Title block
    c.setFillColorRGB(*_NAVY)
    bar_h = 56
    _rounded_rect(c, m, y - bar_h, content_w, bar_h, 10, fill=1, stroke=0)
    c.setFillColorRGB(196 / 255, 210 / 255, 232 / 255)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 14, y - 14, "BOOKING REFERENCE")
    c.setFillColorRGB(*_WHITE)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(m + 14, y - 34, booking_id[:32])
    c.setFont("Helvetica-Bold", 10)
    c.drawRightString(width - m - 14, y - 34, _safe_ascii(pkg.get("title") or "Package")[:40])
    y -= bar_h + 14

    # Summary rows
    guest_name = _title_case_name(
        " ".join(
            str(guest.get(k) or "").strip()
            for k in ("firstName", "lastName")
            if guest.get(k)
        )
    )
    rows = [
        ("Guest", guest_name),
        ("Email", _safe_ascii(guest.get("email") or "")),
        (
            "Dates",
            f"{pretty_when(stay.get('checkIn'))} - {pretty_when(stay.get('checkOut'))}",
        ),
        ("Hotel", _safe_ascii((stay.get("hotel") or {}).get("name") or "Hotel")),
        (
            "Room",
            _safe_ascii((stay.get("room") or {}).get("title") or (stay.get("room") or {}).get("board") or ""),
        ),
        (
            "Amount paid",
            _money(payment.get("totalCharged") or stay.get("total"), str(stay.get("currency") or "INR")),
        ),
    ]
    if flight:
        rows.append(
            (
                "Flight",
                f"{_safe_ascii(flight.get('origin') or '')} -> {_safe_ascii(flight.get('destination') or '')}",
            )
        )

    for label, value in rows:
        if not value:
            continue
        c.setFillColorRGB(*_MUTED)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(m, y, label.upper())
        c.setFillColorRGB(*_INK)
        c.setFont("Helvetica", 10)
        c.drawString(m + 100, y, value[:62])
        y -= 16

    y -= 8
    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(m, y, "DAY-BY-DAY ITINERARY")
    y -= 14

    days = list(pkg.get("itinerary") or [])
    page = 1
    for day in days:
        if y < 120:
            c.showPage()
            page += 1
            y = new_page_header(page)
            c.setFillColorRGB(*_ORANGE)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(m, y, "ITINERARY (continued)")
            y -= 14
        y = _draw_day(c, x=m, y=y, w=content_w, day=day)

    # Know before you go (first page footer area if room)
    know = list(pkg.get("knowBeforeYouGo") or [])[:4]
    if know and y > 100:
        y -= 6
        c.setFillColorRGB(*_CREAM)
        kh = 16 + len(know) * 22
        _rounded_rect(c, m, y - kh, content_w, kh, 8, fill=1, stroke=0)
        c.setFillColorRGB(*_ORANGE)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(m + 12, y - 14, "KNOW BEFORE YOU GO")
        ty = y - 28
        c.setFillColorRGB(*_INK)
        c.setFont("Helvetica", 8)
        for item in know:
            c.drawString(m + 12, ty, f"{_safe_ascii(item.get('title') or '')}: {_safe_ascii(item.get('body') or '')[:78]}")
            ty -= 20
        y -= kh + 8

    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(m, 28, "Issued by Itinero. Ground transfers and meals are estimates unless marked bookable.")
    c.drawRightString(width - m, 28, "support@itinero.company")

    c.showPage()
    c.save()
    return buf.getvalue(), filename
