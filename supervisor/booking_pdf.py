"""Branded booking confirmation PDF (matches frontend e-ticket layout)."""

from __future__ import annotations

import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

_DIR = Path(__file__).resolve().parent
_ASSETS = _DIR / "email_assets"
_LOGO = _ASSETS / "itinero-logo-badge.png"
_FALLBACK_LOGO = _DIR.parent / "itinero" / "public" / "itinero-logo.png"
_VERO = _ASSETS / "vero-avatar.png"
_FALLBACK_VERO = _DIR.parent / "itinero" / "public" / "vero-chatbot.png"

# Brand
_NAVY = (0 / 255, 20 / 255, 57 / 255)
_ORANGE = (233 / 255, 110 / 255, 51 / 255)
_INK = (17 / 255, 24 / 255, 39 / 255)
_MUTED = (107 / 255, 114 / 255, 128 / 255)
_LINE = (229 / 255, 231 / 255, 235 / 255)
_GRAY = (245 / 255, 247 / 255, 250 / 255)
_CREAM = (255 / 255, 247 / 255, 237 / 255)
_WHITE = (1.0, 1.0, 1.0)
_GREEN = (5 / 255, 150 / 255, 105 / 255)

_AIRPORTS: dict[str, dict[str, str]] = {
    "DEL": {
        "city": "New Delhi",
        "name": "Indira Gandhi",
        "full": "Indira Gandhi International",
        "terminals": "Terminal 1, 2 & 3",
        "tip": "Confirm T1 vs T3 on your e-ticket. Morning banks get busy - reach 2.5 hours early.",
    },
    "BOM": {
        "city": "Mumbai",
        "name": "Chhatrapati Shivaji Maharaj",
        "full": "Chhatrapati Shivaji Maharaj International",
        "terminals": "T1 & T2",
        "tip": "International usually T2. Build buffer for traffic.",
    },
    "BLR": {
        "city": "Bengaluru",
        "name": "Kempegowda",
        "full": "Kempegowda International",
        "terminals": "T1 & T2",
        "tip": "Allow extra time for the airport approach road.",
    },
    "HYD": {
        "city": "Hyderabad",
        "name": "Rajiv Gandhi",
        "full": "Rajiv Gandhi International",
        "terminals": "Domestic & International",
        "tip": "One terminal complex - follow airline signs.",
    },
    "MAA": {
        "city": "Chennai",
        "name": "Chennai International",
        "full": "Chennai International",
        "terminals": "T1, T2 & T4",
        "tip": "Confirm domestic vs international terminal.",
    },
    "DXB": {
        "city": "Dubai",
        "name": "Dubai International",
        "full": "Dubai International",
        "terminals": "T1, T2 & T3",
        "tip": "Metro and taxis are well signed from arrivals.",
    },
    "AUH": {
        "city": "Abu Dhabi",
        "name": "Zayed International",
        "full": "Zayed International",
        "terminals": "Terminal A",
        "tip": "Follow airline signs for Terminal A.",
    },
    "LHR": {
        "city": "London",
        "name": "Heathrow",
        "full": "London Heathrow",
        "terminals": "T2, T3, T4 & T5",
        "tip": "Confirm terminal on your booking - Heathrow has several.",
    },
    "SIN": {
        "city": "Singapore",
        "name": "Changi",
        "full": "Singapore Changi",
        "terminals": "T1, T2, T3 & T4",
        "tip": "Follow airline signs; MRT connects terminals.",
    },
}


def _safe_ascii(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    s = (
        s.replace("\u20b9", "Rs.")
        .replace("\u2192", "->")
        .replace("\u2013", "-")
        .replace("\u2014", "-")
        .replace("\u00a0", " ")
        .replace("\u00b7", "|")
    )
    return "".join(ch if ord(ch) < 256 else "?" for ch in s)


def _money(amount: Any, currency: str = "INR") -> str:
    try:
        n = float(amount)
    except (TypeError, ValueError):
        return _safe_ascii(amount) or "--"
    cur = (currency or "INR").upper()
    if cur == "INR":
        return f"Rs. {n:,.2f}"
    return f"{cur} {n:,.2f}"


def _parse_dt(raw: Any) -> datetime | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    for fmt in (
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(s[:26].split("+")[0].split(".")[0], fmt.replace("%z", ""))
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.split("+")[0].split("Z")[0])
    except ValueError:
        return None


def pretty_clock(raw: Any) -> str:
    dt = _parse_dt(raw)
    if not dt:
        m = re.search(r"(\d{1,2}:\d{2})", str(raw or ""))
        return m.group(1) if m else "--:--"
    return dt.strftime("%H:%M")


def pretty_travel_date(raw: Any) -> str:
    dt = _parse_dt(raw)
    if not dt:
        return _safe_ascii(raw)
    return dt.strftime("%a, %d %b %Y")


def pretty_when(raw: Any) -> str:
    dt = _parse_dt(raw)
    if not dt:
        return _safe_ascii(raw)
    return dt.strftime("%d %b %Y, %H:%M")


def pretty_hotel_date(raw: Any) -> str:
    if not raw:
        return "-"
    if isinstance(raw, dict):
        d = str(raw.get("date") or raw.get("formatted") or raw.get("raw") or "").strip()
        day = str(raw.get("day") or "").strip()
        if d and day:
            return f"{d} ({day})"
        if d:
            return d
    s = str(raw).strip()
    if s.startswith("{") and ("date" in s or "day" in s):
        import ast
        try:
            parsed = ast.literal_eval(s)
            if isinstance(parsed, dict):
                return pretty_hotel_date(parsed)
        except Exception:
            pass
    dt = _parse_dt(raw)
    if dt:
        return dt.strftime("%d %b %Y (%a)")
    return _safe_ascii(s) or "-"


def pretty_issued(raw: Any = None) -> str:
    dt = _parse_dt(raw) or datetime.now()
    return dt.strftime("%d %b %Y, %I:%M %p").lstrip("0").replace(" 0", " ")


def _split_route(route: Any) -> tuple[str, str]:
    s = str(route or "")
    m = re.search(r"\b([A-Z]{3})\b.*?\b([A-Z]{3})\b", s.upper())
    if m:
        return m.group(1), m.group(2)
    parts = re.split(r"\s*(?:→|->|-|-|to)\s*", s, maxsplit=1, flags=re.I)
    if len(parts) == 2:
        a = re.sub(r"[^A-Za-z]", "", parts[0])[-3:].upper()
        b = re.sub(r"[^A-Za-z]", "", parts[1])[:3].upper()
        if len(a) == 3 and len(b) == 3:
            return a, b
    return "", ""


def airport_info(code: str) -> dict[str, str]:
    c = (code or "").upper().strip()
    meta = _AIRPORTS.get(c, {})
    return {
        "code": c or "-",
        "city": meta.get("city") or c or "-",
        "name": meta.get("name") or c or "-",
        "full": meta.get("full") or meta.get("name") or c or "-",
        "terminals": meta.get("terminals") or "",
        "tip": meta.get("tip") or "",
    }


def _title_case_name(name: str) -> str:
    s = _safe_ascii(name)
    if not s:
        return ""
    if s.isupper() or s.islower():
        return " ".join(p.capitalize() for p in s.split())
    return s


def _pax_list(details: dict[str, Any]) -> list[str]:
    pax = details.get("passengers")
    names: list[str] = []
    if isinstance(pax, list):
        for row in pax:
            if isinstance(row, dict):
                name = " ".join(
                    str(row.get(k) or "").strip()
                    for k in ("firstName", "first_name", "lastName", "last_name")
                    if row.get(k)
                ).strip() or str(row.get("name") or "").strip()
            else:
                name = str(row or "").strip()
            if name:
                names.append(_title_case_name(name))
        if names:
            return names
    elif pax:
        return [_title_case_name(str(pax))]
    for key in ("guest_name", "contact_name", "passenger_name"):
        guest = details.get(key)
        if guest:
            return [_title_case_name(str(guest))]
    # last resort: derive from email local-part only if it looks like a person name
    return []


def _draw_wordmark(c, x: float, y: float, size: float = 16) -> None:
    c.setFont("Helvetica-Bold", size)
    c.setFillColorRGB(*_NAVY)
    c.drawString(x, y, "itin")
    w = c.stringWidth("itin", "Helvetica-Bold", size)
    c.setFillColorRGB(*_ORANGE)
    c.drawString(x + w, y, "ero")


def _draw_barcode(c, seed: str, x: float, y: float, w: float, h: float) -> None:
    src = re.sub(r"[^A-Z0-9]", "", (seed or "ITINERO").upper()) or "ITINERO"
    bits = ""
    for ch in src:
        n = ord(ch)
        bits += ("11010" if n % 2 else "10110") + ("001" if n % 3 else "100")
    bits = f"1101{bits}{bits[:18]}1101"
    unit = w / max(len(bits), 1)
    cx = x
    c.setFillColorRGB(*_INK)
    for bit in bits:
        bar_w = unit * (1.15 if bit == "1" else 0.55)
        if bit == "1":
            c.rect(cx, y, max(0.55, bar_w), h, fill=1, stroke=0)
        cx += unit


def _try_image(path: Path):
    try:
        if path.is_file():
            from reportlab.lib.utils import ImageReader

            return ImageReader(str(path))
    except Exception:
        return None
    return None


def _rounded_rect(c, x, y, w, h, r=8, fill=1, stroke=0):
    c.roundRect(x, y, w, h, r, fill=fill, stroke=stroke)


def _build_flight_pdf_reportlab(details: dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    pending = str(details.get("status") or "").lower() == "pending"
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    m = 36
    content_w = width - m * 2

    origin_code = (details.get("origin") or "").upper() or _split_route(details.get("route"))[0]
    dest_code = (details.get("destination") or "").upper() or _split_route(details.get("route"))[1]
    origin = airport_info(origin_code)
    dest = airport_info(dest_code)
    dep_clock = pretty_clock(details.get("depart_at"))
    arr_clock = pretty_clock(details.get("arrive_at"))
    travel_date = pretty_travel_date(details.get("depart_at") or details.get("travel_date"))
    booking_id = _safe_ascii(details.get("booking_ref") or "ITN")
    airline = _safe_ascii(details.get("airline") or "Airline")
    flight_no = _safe_ascii(details.get("flight_number") or "")
    cabin = _safe_ascii(details.get("cabin") or "Economy")
    stops = _safe_ascii(details.get("stops") or "Direct") or "Direct"
    duration = _safe_ascii(details.get("duration") or "")
    money = _money(details.get("amount"), str(details.get("currency") or "INR"))
    status = "PENDING" if pending else "PAID"
    passengers = _pax_list(details)
    email = _safe_ascii(details.get("email") or details.get("contact_email") or "")
    phone = _safe_ascii(details.get("phone") or details.get("contact_phone") or "")
    issued = pretty_issued(details.get("issued_at"))

    # White page
    c.setFillColorRGB(*_WHITE)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    y = height - 48

    # Header: navbar logo on a white plate (never merges into page white… wait PDF is white page)
    # On white PDF page, dark logo is fine without plate - just draw wordmark/logo cleanly.
    logo = (
        _try_image(_FALLBACK_LOGO)
        or _try_image(_ASSETS / "itinero-logo-dark.png")
        or _try_image(_LOGO)
    )
    if logo:
        c.drawImage(logo, m, y - 6, width=110, height=24, mask="auto", preserveAspectRatio=True, anchor="sw")
    else:
        _draw_wordmark(c, m, y, 18)

    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 12)
    title = "PAYMENT RECEIPT" if pending else "CONFIRMED E-TICKET"
    c.drawRightString(width - m, y + 6, title)
    c.setFont("Helvetica", 8)
    c.setFillColorRGB(*_MUTED)
    c.drawRightString(width - m, y - 8, "Passenger itinerary  |  Show at check-in")
    c.drawRightString(width - m, y - 20, f"Issued {issued}")

    y -= 36
    c.setStrokeColorRGB(*_ORANGE)
    c.setLineWidth(3)
    c.line(m, y, width - m, y)
    y -= 18

    # Airline row
    air_h = 52
    c.setFillColorRGB(*_WHITE)
    c.setStrokeColorRGB(*_LINE)
    c.setLineWidth(0.9)
    _rounded_rect(c, m, y - air_h, content_w, air_h, 10, fill=1, stroke=1)

    code_badge = (flight_no[:2] or airline[:2] or "FL").upper()
    c.setFillColorRGB(*_ORANGE)
    _rounded_rect(c, m + 12, y - air_h + 8, 36, 36, 8, fill=1, stroke=0)
    c.setFillColorRGB(*_WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(m + 30, y - air_h + 20, code_badge[:2])

    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(m + 58, y - 22, airline[:40])
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 9)
    meta = "  |  ".join(x for x in [flight_no, cabin, stops] if x)
    c.drawString(m + 58, y - 38, meta[:70])
    # No second wordmark here - header already brands the page.
    y -= air_h + 12

    # Booking reference bar
    bar_h = 50
    c.setFillColorRGB(*_NAVY)
    _rounded_rect(c, m, y - bar_h, content_w, bar_h, 10, fill=1, stroke=0)
    c.setFillColorRGB(196 / 255, 210 / 255, 232 / 255)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 16, y - 16, "BOOKING REFERENCE")
    c.setFillColorRGB(*_WHITE)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(m + 16, y - 38, booking_id[:28])

    pill_w = 56
    pill_x = width / 2 - pill_w / 2
    c.setFillColorRGB(*_WHITE)
    _rounded_rect(c, pill_x, y - 34, pill_w, 18, 9, fill=1, stroke=0)
    c.setFillColorRGB(*(_GREEN if status == "PAID" else _ORANGE))
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(width / 2, y - 28, status)

    if travel_date:
        c.setFillColorRGB(*_WHITE)
        c.setFont("Helvetica-Bold", 10)
        c.drawRightString(width - m - 16, y - 28, travel_date)
    y -= bar_h + 22

    # Route schedule
    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(m, y, "DEPART")
    c.drawRightString(width - m, y, "ARRIVE")

    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(m, y - 30, dep_clock)
    c.drawRightString(width - m, y - 30, arr_clock)

    mid = width / 2
    if duration:
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(mid, y - 8, duration)
    c.setStrokeColorRGB(*_ORANGE)
    c.setLineWidth(2)
    c.line(mid - 78, y - 28, mid - 8, y - 28)
    c.line(mid + 8, y - 28, mid + 78, y - 28)
    c.setFillColorRGB(*_ORANGE)
    c.circle(mid, y - 28, 4, fill=1, stroke=0)
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 8)
    c.drawCentredString(mid, y - 44, stops)

    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(m, y - 58, origin["code"])
    c.drawRightString(width - m, y - 58, dest["code"])
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 10)
    c.drawString(m, y - 74, origin["city"][:28])
    c.drawRightString(width - m, y - 74, dest["city"][:28])
    c.setFont("Helvetica", 8)
    c.drawString(m, y - 88, origin["name"][:34])
    c.drawRightString(width - m, y - 88, dest["name"][:34])
    y -= 108

    # Airport cards
    card_w = (content_w - 12) / 2
    card_h = 124

    def airport_card(x: float, title: str, ap: dict[str, str]) -> None:
        c.setFillColorRGB(*_GRAY)
        _rounded_rect(c, x, y - card_h, card_w, card_h, 10, fill=1, stroke=0)
        c.setFillColorRGB(*_ORANGE)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 12, y - 16, title)
        c.setFillColorRGB(*_INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 12, y - 34, _safe_ascii(ap["full"])[:34])
        c.setFillColorRGB(*_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(x + 12, y - 48, _safe_ascii(ap["city"])[:34])
        ty = y - 66
        if ap.get("terminals"):
            c.setFillColorRGB(*_INK)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x + 12, ty, f"Terminals: {_safe_ascii(ap['terminals'])}"[:44])
            ty -= 14
        if ap.get("tip"):
            c.setFillColorRGB(*_MUTED)
            c.setFont("Helvetica", 7)
            tip = _safe_ascii(ap["tip"])
            words = tip.split()
            line = ""
            lines_left = 3
            for w in words:
                if lines_left <= 0:
                    break
                trial = f"{line} {w}".strip()
                if c.stringWidth(trial, "Helvetica", 7) > card_w - 24:
                    c.drawString(x + 12, ty, line)
                    ty -= 11
                    lines_left -= 1
                    line = w
                else:
                    line = trial
            if line and lines_left > 0:
                c.drawString(x + 12, ty, line)

    airport_card(m, "DEPARTURE AIRPORT", origin)
    airport_card(m + card_w + 12, "ARRIVAL AIRPORT", dest)
    y -= card_h + 12

    # Passenger + contact
    pax_h = 72
    c.setFillColorRGB(*_WHITE)
    c.setStrokeColorRGB(*_LINE)
    c.setLineWidth(0.9)
    _rounded_rect(c, m, y - pax_h, content_w, pax_h, 10, fill=1, stroke=1)
    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 14, y - 16, "PASSENGER(S)")
    c.drawString(m + content_w / 2 + 8, y - 16, "CONTACT")
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica", 10)
    if passengers:
        for i, name in enumerate(passengers[:2]):
            c.setFillColorRGB(*_ORANGE if i == 0 else _INK)
            c.setFont("Helvetica-Bold" if i == 0 else "Helvetica", 10)
            c.drawString(m + 14, y - 36 - i * 16, f"{i + 1}. {name}"[:42])
    else:
        c.setFillColorRGB(*_MUTED)
        c.drawString(m + 14, y - 36, "Passenger details on file")
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica", 9)
    if email:
        c.drawString(m + content_w / 2 + 8, y - 36, email[:36])
    if phone:
        c.drawString(m + content_w / 2 + 8, y - 52, phone[:28])
    y -= pax_h + 12

    # Amount + barcode
    pay_h = 62
    pay_w = content_w * 0.58 - 6
    c.setFillColorRGB(*_CREAM)
    _rounded_rect(c, m, y - pay_h, pay_w, pay_h, 10, fill=1, stroke=0)
    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 14, y - 16, "AMOUNT PAID")
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(m + 14, y - 40, money[:28])
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(m + 14, y - 54, "completed" if not pending else "payment received")

    bar_x = m + pay_w + 12
    bar_w = content_w - pay_w - 12
    c.setFillColorRGB(*_WHITE)
    c.setStrokeColorRGB(*_LINE)
    _rounded_rect(c, bar_x, y - pay_h, bar_w, pay_h, 10, fill=1, stroke=1)
    _draw_barcode(c, booking_id, bar_x + 12, y - pay_h + 24, bar_w - 24, 28)
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(bar_x + bar_w / 2, y - pay_h + 10, booking_id[:24])
    y -= pay_h + 14

    # Vero strip
    vero_h = 52
    c.setFillColorRGB(*_NAVY)
    _rounded_rect(c, m, y - vero_h, content_w, vero_h, 10, fill=1, stroke=0)
    vero_img = _try_image(_VERO) or _try_image(_FALLBACK_VERO)
    text_x = m + 16
    if vero_img:
        c.drawImage(vero_img, m + 12, y - vero_h + 6, width=40, height=40, mask="auto", preserveAspectRatio=True)
        text_x = m + 62
    c.setFillColorRGB(*_WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(text_x, y - 20, "Need help? Ask Vero")
    c.setFillColorRGB(210 / 255, 220 / 255, 236 / 255)
    c.setFont("Helvetica", 8)
    c.drawString(
        text_x,
        y - 36,
        "Open Itinero and tap Vero for terminals, baggage, a hotel near arrival, or a cab.",
    )
    y -= vero_h + 18

    # Footer
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(
        m,
        max(28, y - 4),
        "Issued by Itinero. Gate numbers appear on airport screens - we never invent them.",
    )
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(width - m, max(28, y - 4), "itinero + Vero")

    c.showPage()
    c.save()
    return buf.getvalue()


def _build_hotel_pdf_reportlab(details: dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    pending = str(details.get("status") or "").lower() == "pending"
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    m = 40
    content_w = width - 2 * m

    # Header
    c.setFillColorRGB(*_NAVY)
    c.rect(0, height - 78, width, 78, fill=1, stroke=0)
    c.setFillColorRGB(*_ORANGE)
    c.rect(0, height - 82, width, 4, fill=1, stroke=0)
    logo = _try_image(_FALLBACK_LOGO) or _try_image(_LOGO)
    if logo:
        c.drawImage(logo, m, height - 52, width=110, height=24, mask="auto", preserveAspectRatio=True)
    else:
        c.setFillColorRGB(*_WHITE)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(m, height - 36, "itinero")
    c.setFillColorRGB(253 / 255, 186 / 255, 116 / 255)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(
        width - m,
        height - 36,
        "PAYMENT RECEIPT" if pending else "HOTEL VOUCHER",
    )

    y = height - 112
    hotel_name = _safe_ascii(details.get("hotel_name") or "Hotel stay")
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(m, y, hotel_name[:46])
    y -= 18
    room = _safe_ascii(details.get("room_name") or "")
    if room:
        c.setFillColorRGB(*_MUTED)
        c.setFont("Helvetica", 10)
        c.drawString(m, y, room[:60])
        y -= 10
    y -= 14

    # Navy reference bar
    ref = _safe_ascii(details.get("booking_ref") or "-")
    bar_h = 52
    c.setFillColorRGB(*_NAVY)
    _rounded_rect(c, m, y - bar_h, content_w, bar_h, 10, fill=1, stroke=0)
    c.setFillColorRGB(196 / 255, 210 / 255, 232 / 255)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 14, y - 16, "BOOKING REFERENCE")
    c.setFillColorRGB(*_WHITE)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(m + 14, y - 36, ref[:36])
    c.setFillColorRGB(*_GREEN if not pending else _ORANGE)
    c.setFont("Helvetica-Bold", 8)
    c.drawRightString(width - m - 14, y - 28, "CONFIRMED" if not pending else "PENDING")
    y -= bar_h + 16

    # Check-in / check-out cards
    cin = pretty_hotel_date(details.get("check_in"))
    cout = pretty_hotel_date(details.get("check_out"))
    card_w = (content_w - 12) / 2
    card_h = 64
    for i, (label, value) in enumerate((("CHECK-IN", cin), ("CHECK-OUT", cout))):
        x = m + i * (card_w + 12)
        c.setFillColorRGB(*_CREAM)
        _rounded_rect(c, x, y - card_h, card_w, card_h, 10, fill=1, stroke=0)
        c.setFillColorRGB(*_ORANGE)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(x + 12, y - 16, label)
        c.setFillColorRGB(*_INK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 12, y - 38, value[:45])
    y -= card_h + 14

    # Guest + contact
    guest = _title_case_name(str(details.get("guest_name") or ""))
    guests_sub = _safe_ascii(details.get("guests") or "")
    email = _safe_ascii(details.get("email") or "")
    phone = _safe_ascii(details.get("phone") or "")
    pax_h = 70
    c.setFillColorRGB(*_WHITE)
    c.setStrokeColorRGB(*_LINE)
    c.setLineWidth(0.9)
    _rounded_rect(c, m, y - pax_h, content_w, pax_h, 10, fill=1, stroke=1)
    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 14, y - 16, "GUEST")
    c.drawString(m + content_w / 2 + 8, y - 16, "CONTACT")
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(m + 14, y - 36, (guest or "Guest on file")[:35])
    if guests_sub:
        c.setFillColorRGB(*_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(m + 14, y - 50, guests_sub[:35])
    c.setFont("Helvetica", 9)
    if email:
        c.drawString(m + content_w / 2 + 8, y - 34, email[:36])
    if phone:
        c.drawString(m + content_w / 2 + 8, y - 50, phone[:28])
    y -= pax_h + 14

    # Amount + barcode
    money = _money(details.get("amount"), str(details.get("currency") or "INR"))
    pay_h = 62
    pay_w = content_w * 0.58 - 6
    c.setFillColorRGB(*_CREAM)
    _rounded_rect(c, m, y - pay_h, pay_w, pay_h, 10, fill=1, stroke=0)
    c.setFillColorRGB(*_ORANGE)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(m + 14, y - 16, "AMOUNT PAID")
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(m + 14, y - 40, money[:28])
    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(m + 14, y - 54, "completed" if not pending else "payment received")

    bar_x = m + pay_w + 12
    bar_w = content_w - pay_w - 12
    c.setFillColorRGB(*_WHITE)
    c.setStrokeColorRGB(*_LINE)
    _rounded_rect(c, bar_x, y - pay_h, bar_w, pay_h, 10, fill=1, stroke=1)
    _draw_barcode(c, ref, bar_x + 12, y - pay_h + 24, bar_w - 24, 28)
    c.setFillColorRGB(*_INK)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(bar_x + bar_w / 2, y - pay_h + 10, ref[:24])
    y -= pay_h + 14

    # Vero strip
    vero_h = 52
    c.setFillColorRGB(*_NAVY)
    _rounded_rect(c, m, y - vero_h, content_w, vero_h, 10, fill=1, stroke=0)
    vero_img = _try_image(_VERO) or _try_image(_FALLBACK_VERO)
    text_x = m + 16
    if vero_img:
        c.drawImage(vero_img, m + 12, y - vero_h + 6, width=40, height=40, mask="auto", preserveAspectRatio=True)
        text_x = m + 62
    c.setFillColorRGB(*_WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(text_x, y - 20, "Need help? Ask Vero")
    c.setFillColorRGB(210 / 255, 220 / 255, 236 / 255)
    c.setFont("Helvetica", 8)
    c.drawString(
        text_x,
        y - 36,
        "Open Itinero and tap Vero for late checkout, nearby food, or a cab.",
    )
    y -= vero_h + 18

    c.setFillColorRGB(*_MUTED)
    c.setFont("Helvetica", 7)
    c.drawString(
        m,
        max(28, y - 4),
        "Present this voucher at check-in with a government ID. Issued by Itinero.",
    )
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(width - m, max(28, y - 4), "itinero + Vero")

    c.showPage()
    c.save()
    return buf.getvalue()


def _build_minimal_pdf(lines: list[str]) -> bytes:
    """Fallback PDF 1.4 writer if reportlab is unavailable."""

    def _pdf_escape(s: str) -> str:
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    content_cmds = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"]
    first = True
    for raw in lines:
        line = _pdf_escape((raw or " ")[:110])
        if first:
            content_cmds.append(f"({line}) Tj")
            first = False
        else:
            content_cmds.append("T*")
            content_cmds.append(f"({line}) Tj")
    content_cmds.append("ET")
    stream = "\n".join(content_cmds).encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
    )
    objects.append(
        f"4 0 obj<< /Length {len(stream)} >>stream\n".encode("ascii")
        + stream
        + b"\nendstream\nendobj\n"
    )
    objects.append(b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")

    out = BytesIO()
    out.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for obj in objects:
        offsets.append(out.tell())
        out.write(obj)
    xref_pos = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    out.write(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.write(f"{off:010d} 00000 n \n".encode("ascii"))
    out.write(
        f"trailer<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode(
            "ascii"
        )
    )
    return out.getvalue()


def build_booking_pdf(*, kind: str, details: dict[str, Any]) -> tuple[bytes, str]:
    """Return (pdf_bytes, filename) for flight or hotel confirmation."""
    k = (kind or "flight").strip().lower()
    ref = _safe_ascii(details.get("booking_ref") or "booking")[:40]
    safe_ref = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in ref) or "booking"
    name = (
        f"itinero-hotel-voucher-{safe_ref}.pdf"
        if k == "hotel"
        else f"itinero-eticket-{safe_ref}.pdf"
    )

    try:
        if k == "hotel":
            return _build_hotel_pdf_reportlab(details), name
        return _build_flight_pdf_reportlab(details), name
    except Exception as exc:
        # Last-resort text PDF (should rarely hit if reportlab is installed).
        import logging

        logging.getLogger(__name__).warning("booking_pdf reportlab failed: %s", exc)
        pending = str(details.get("status") or "").lower() == "pending"
        lines = [
            "itinero - CONFIRMED E-TICKET" if not pending else "itinero - PAYMENT RECEIPT",
            "",
            f"Reference: {_safe_ascii(details.get('booking_ref') or '-')}",
            f"Route: {_safe_ascii(details.get('route') or '-')}",
            f"Airline: {_safe_ascii(details.get('airline') or '')}",
            f"Flight: {_safe_ascii(details.get('flight_number') or '')}",
            f"Depart: {pretty_when(details.get('depart_at'))}",
            f"Arrive: {pretty_when(details.get('arrive_at'))}",
            f"Passengers: {', '.join(_pax_list(details))}",
            f"Amount: {_money(details.get('amount'), str(details.get('currency') or 'INR'))}",
            "",
            "Present this PDF with a government ID at the airport.",
            "Gate numbers appear on airport screens - Itinero never invents them.",
            "Support: support@itinero.company",
        ]
        return _build_minimal_pdf(lines), name
