"""Published airline baggage + likely terminals for Vero booking Q&A."""
from __future__ import annotations

import re
from typing import Any, Optional

INDIA_IATA = {
    "AMD", "ATQ", "BBI", "BDQ", "BHO", "BLR", "BOM", "CCU", "CJB", "COK",
    "DED", "DEL", "GAU", "GOI", "GOX", "GWL", "HYD", "IDR", "IMF", "IXB",
    "IXC", "IXE", "IXJ", "IXL", "IXM", "IXR", "IXU", "IXZ", "JAI", "JDH",
    "JLR", "LKO", "MAA", "NAG", "PAT", "PNQ", "RPR", "SXR", "STV", "TRV",
    "TRZ", "UDR", "VGA", "VNS", "VTZ",
}

TERMINAL_HINT = {
    "QP:BOM": "T2",
    "6E:BOM": "T2",
    "SG:BOM": "T1",
    "G8:BOM": "T1",
    "AI:BOM": "T2",
    "UK:BOM": "T2",
    "IX:BOM": "T2",
    "QP:DEL": "T1",
    "6E:DEL": "T1",
    "SG:DEL": "T1",
    "AI:DEL": "T3",
    "UK:DEL": "T3",
    "IX:DEL": "T1",
    "QP:BLR": "T1",
    "6E:BLR": "T1",
    "AI:BLR": "T2",
}

BAGGAGE = {
    "QP": {
        "name": "Akasa Air",
        "domestic": {
            "cabin": "7 kg cabin (1 bag, max 115 cm L+W+H) + 3 kg personal item under the seat",
            "checked": "15 kg check-in, 1 piece on standard/Plus fares",
            "extra": (
                "Lite/unbundled fares can include **0 kg** check-in. Student fares: **25 kg**. "
                "Stretch/Flex sometimes **20 kg**. Airport extra is roughly ₹600–700/kg — cheaper "
                "if you add kg on Akasa before travel. One piece max 32 kg / 158 cm."
            ),
        },
        "international": {
            "cabin": "7 kg cabin + 3 kg personal item",
            "checked": "usually 30 kg / 2 pieces (Phuket often 20 kg / 1 piece)",
            "extra": "Confirm the sector on your e-ticket. Airport extra on Gulf sectors is steeper than domestic.",
        },
    },
    "6E": {
        "name": "IndiGo",
        "domestic": {
            "cabin": "7 kg cabin (1 piece, typically 55×35×25 cm) + a small personal item",
            "checked": "15 kg check-in on regular Saver/Super Saver; Flexi/Super 6E can be higher",
            "extra": "IndiGo Lite-style fares may exclude free check-in. Pre-buy extra kg in the IndiGo app.",
        },
        "international": {
            "cabin": "7 kg cabin + personal item",
            "checked": "usually 20–30 kg depending on sector and fare",
            "extra": "Gulf / SEA sectors vary — use the kg printed on your IndiGo ticket if it differs.",
        },
    },
    "SG": {
        "name": "SpiceJet",
        "domestic": {
            "cabin": "7 kg cabin (1 piece)",
            "checked": "15 kg check-in on standard SpiceSaver/SpiceMax-style fares",
            "extra": "Unbundled fares can be cabin-only. Prepaid extra kg is cheaper than the airport.",
        },
        "international": {
            "cabin": "7 kg cabin",
            "checked": "typically 20–30 kg by sector",
            "extra": "Use the allowance printed on the ticket for Gulf/SEA.",
        },
    },
    "AI": {
        "name": "Air India",
        "domestic": {
            "cabin": "7 kg cabin (1 piece) + a small personal item",
            "checked": "15 kg economy check-in on most domestic fares; higher on Flex / business",
            "extra": "Air India still prints allowance on the e-ticket — trust that if it differs.",
        },
        "international": {
            "cabin": "7–8 kg cabin (route/cabin dependent)",
            "checked": "typically 20–25 kg economy; piece concept (2 × 23 kg) on some long-haul",
            "extra": "Long-haul can be piece-based. Read the ticket.",
        },
    },
    "IX": {
        "name": "Air India Express",
        "domestic": {
            "cabin": "7 kg cabin",
            "checked": "15 kg check-in on regular fares",
            "extra": "Value/Lite fares may drop free check-in.",
        },
        "international": {
            "cabin": "7 kg cabin",
            "checked": "typically 20–30 kg by Gulf/SEA sector",
            "extra": "Ticket print wins if it disagrees.",
        },
    },
    "UK": {
        "name": "Vistara / Air India",
        "domestic": {
            "cabin": "7 kg cabin + personal item",
            "checked": "15 kg economy; Club Vistara / business higher",
            "extra": "Now under Air India — e-ticket kg is the source of truth.",
        },
        "international": {
            "cabin": "7–8 kg cabin",
            "checked": "often 2 × 23 kg on long-haul economy",
            "extra": "Piece concept on many intl tickets.",
        },
    },
    "GF": {
        "name": "Gulf Air",
        "domestic": None,
        "international": {
            "cabin": "7 kg cabin (1 piece) + a small personal item",
            "checked": "typically 30 kg economy (2 pieces on many fares) India–Gulf",
            "extra": "Falcon Gold / business is higher. Trust the e-ticket if it shows pieces.",
        },
    },
    "EK": {
        "name": "Emirates",
        "domestic": None,
        "international": {
            "cabin": "7 kg cabin + a small personal item",
            "checked": "usually 25–35 kg economy depending on fare",
            "extra": "Emirates prints kg on the ticket — that number wins.",
        },
    },
    "EY": {
        "name": "Etihad",
        "domestic": None,
        "international": {
            "cabin": "7 kg cabin + personal item",
            "checked": "typically 25–30 kg economy India–AUH",
            "extra": "Ticket print wins.",
        },
    },
    "QR": {
        "name": "Qatar Airways",
        "domestic": None,
        "international": {
            "cabin": "7 kg cabin + personal item",
            "checked": "typically 25–30 kg economy; 2 × 23 kg on many long-haul tickets",
            "extra": "Qatar is often piece-based on long-haul — read the e-ticket.",
        },
    },
}


def _code(val: Any) -> str:
    return str(val or "").upper().strip()[:3]


def _airline_code(val: Any) -> str:
    return str(val or "").upper().strip()[:2]


def is_india_airport(code: Any) -> bool:
    return _code(code) in INDIA_IATA


def is_domestic_india(origin: Any, dest: Any) -> bool:
    return is_india_airport(origin) and is_india_airport(dest)


def likely_terminal(airline_code: Any, airport: Any) -> str:
    a = _airline_code(airline_code)
    p = _code(airport)
    if not a or not p:
        return ""
    return TERMINAL_HINT.get(f"{a}:{p}") or ""


def _ticket_label(raw: Any) -> str:
    if raw is None or raw == "":
        return ""
    if isinstance(raw, dict):
        parts = [raw.get("cabin"), raw.get("checked"), raw.get("cabin_kg"), raw.get("checked_kg")]
        return " · ".join(str(p) for p in parts if p is not None and p != "")
    return str(raw).strip()


def _is_zero_allowance(label: Any) -> bool:
    s = " ".join(str(label or "").strip().lower().split())
    if not s:
        return False
    if s in {"none", "nil", "not included", "no bag", "no bags"}:
        return True
    if re.match(r"^0+(\s*(kg|kgs|pc|pcs|piece|pieces))?$", s):
        return True
    if re.match(r"^0\s*kg", s):
        return True
    return False


def baggage_facts(
    *,
    airline_code: Any = "",
    airline_name: Any = "",
    origin: Any = "",
    dest: Any = "",
    ticket_cabin: Any = None,
    ticket_checked: Any = None,
) -> dict:
    code = _airline_code(airline_code)
    spec = BAGGAGE.get(code)
    domestic = is_domestic_india(origin, dest)
    lane = None
    if spec:
        lane = (spec.get("domestic") if domestic else spec.get("international")) or spec.get("domestic") or spec.get("international")
    ticket_c = _ticket_label(ticket_cabin)
    ticket_k = _ticket_label(ticket_checked)
    zero_c = _is_zero_allowance(ticket_c)
    zero_k = _is_zero_allowance(ticket_k)
    positive = (bool(ticket_c) and not zero_c) or (bool(ticket_k) and not zero_k)
    supplier_zero = (zero_c or zero_k) and not positive and bool(ticket_c or ticket_k)

    if supplier_zero:
        return {
            "airline": (spec or {}).get("name") or airline_name or code or "this airline",
            "code": code,
            "domestic": domestic,
            "from_ticket": True,
            "supplier_zero": True,
            "cabin": (
                f"supplier fare shows **{ticket_c}** cabin included"
                if ticket_c
                else "supplier fare shows **0 kg cabin** included"
            ),
            "checked": (
                f"supplier fare shows **{ticket_k}** checked included"
                if ticket_k
                else "supplier fare shows **0 kg checked** included"
            ),
            "extra": (
                f"{(lane or {}).get('extra') or ''} "
                f"Published {(spec or {}).get('name') or 'carrier'} policy is often more generous "
                "than this fare line (cabin ~7 kg is common) — confirm in the airline app / boarding pass."
            ).strip(),
        }

    from_ticket = bool(positive)
    default_checked = (
        "15 kg check-in on a typical India domestic economy fare (basic/unbundled can be 0 kg)"
        if domestic
        else "check-in kg is printed on your e-ticket for this international sector"
    )
    return {
        "airline": (spec or {}).get("name") or airline_name or code or "this airline",
        "code": code,
        "domestic": domestic,
        "from_ticket": from_ticket,
        "supplier_zero": False,
        "cabin": ticket_c or (lane or {}).get("cabin") or "7 kg cabin on most Indian LCC / full-service economy tickets",
        "checked": ticket_k or (lane or {}).get("checked") or default_checked,
        "extra": (lane or {}).get("extra") or "If you need more weight, buy extra kg online before the airport counter.",
    }


def format_baggage_reply(
    facts: dict,
    *,
    flight_no: Any = "",
    origin: Any = "",
    dest: Any = "",
    origin_city: Any = "",
    dest_city: Any = "",
) -> str:
    f = facts or {}
    label = " ".join(p for p in (f.get("airline"), flight_no) if p)
    route = " → ".join(p for p in (origin_city or origin, dest_city or dest) if p)
    if f.get("supplier_zero"):
        ticket_note = (
            "That’s what **this ticket stored** (often “0 checked / 0 carry-on”). It is **not** always IndiGo’s published cabin rule — "
            "confirm in the airline app or at the airport before you pack."
        )
    elif f.get("from_ticket"):
        ticket_note = "This is what’s on **your ticket snapshot** in Itinero."
    elif f.get("domestic"):
        ticket_note = (
            "Your e-ticket didn’t store a custom bag line, so this is **published domestic allowance** "
            "for this carrier — basic/unbundled fares can drop check-in to 0 kg."
        )
    else:
        ticket_note = (
            "Your e-ticket didn’t store a custom bag line, so this is the **usual published allowance** "
            "for this carrier — confirm in the airline app."
        )
    lite_hint = ""
    if not f.get("from_ticket") and f.get("code") == "QP" and f.get("domestic"):
        lite_hint = " A ~₹4k BOM–DEL Akasa fare is almost always **Plus (15 kg)**, not Lite."
    lines = [
        f"On **{label or 'this flight'}**" + (f" ({route})" if route else "") + ":",
        "",
        f"**Cabin** — {f.get('cabin')}.",
        f"**Check-in** — {f.get('checked')}.",
        "",
        f"{ticket_note}{lite_hint}",
        f.get("extra") or "",
    ]
    return "\n".join(p for p in lines if p is not None)


def format_terminal_reply(
    *,
    airline_code: Any = "",
    airline_name: Any = "",
    flight_no: Any = "",
    origin: Any = "",
    dest: Any = "",
    origin_city: Any = "",
    dest_city: Any = "",
    dep_terminal: Any = "",
    arr_terminal: Any = "",
) -> str:
    label = " ".join(p for p in (airline_name or airline_code, flight_no) if p)
    dep_hint = dep_terminal or likely_terminal(airline_code, origin)
    arr_hint = arr_terminal or likely_terminal(airline_code, dest)
    lines = [f"**{label or 'This flight'}** {origin or ''} → {dest or ''}".strip()]
    o = origin_city or origin or "origin"
    d = dest_city or dest or "arrival"
    if dep_hint:
        sure = " (usual for this airline here; confirm on the boarding pass / airport screens)" if not dep_terminal else ""
        lines.append(f"**{o} ({origin})** — depart **{dep_hint}**{sure}.")
    else:
        lines.append(
            f"**{o} ({origin or 'origin'})** — terminal isn’t stored on this booking. "
            "Check the airline app / airport screens. I won’t invent a gate."
        )
    if arr_hint:
        sure = " (typical for this airline; follow flight-number screens)" if not arr_terminal else ""
        lines.append(f"**{d} ({dest})** — arrive **{arr_hint}**{sure}.")
    lines.append("Gates only show on airport screens the day of travel — I never invent those.")
    return "\n".join(lines)


def first_flight_leg(ui_page: Optional[dict]) -> Optional[dict]:
    if not isinstance(ui_page, dict):
        return None
    detail = ui_page.get("detail") or {}
    for leg in detail.get("legs") or []:
        if isinstance(leg, dict) and str(leg.get("type") or "").lower() == "flight":
            return leg
    booking = ui_page.get("booking") or {}
    if booking.get("airline") or booking.get("flight_number"):
        return {
            "type": "flight",
            "airline": booking.get("airline"),
            "airline_code": booking.get("airline_code"),
            "flight_number": booking.get("flight_number"),
            "origin": booking.get("origin"),
            "destination": booking.get("destination"),
            "origin_label": booking.get("origin_label"),
            "destination_label": booking.get("destination_label"),
            "pnr": booking.get("pnr") or booking.get("booking_id"),
            "dep_terminal": booking.get("dep_terminal"),
            "arr_terminal": booking.get("arr_terminal"),
            "baggage_cabin": booking.get("baggage_cabin"),
            "baggage_checked": booking.get("baggage_checked"),
        }
    return None
