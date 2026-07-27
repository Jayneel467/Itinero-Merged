"""Normalize Travel_Agent / LiteAPI offers into the shared UI FlightOffer shape."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

# Sandbox / vendor junk carriers that sometimes appear on invalid routes.
_JUNK_AIRLINE_RE = re.compile(
    r"nuit[eéè]e|nuitee|sandbox|test\s*air|dummy\s*air|fake\s*air",
    re.I,
)
_IATA_RE = re.compile(r"^[A-Z]{3}$")
# Outbound display duration beyond this is almost certainly a mapping bug.
_MAX_DURATION_MINUTES = 36 * 60
# English-looking tokens that are never airports (slot-parse leftovers).
_INVALID_IATA = frozenset(
    {
        "NEW", "THE", "FOR", "AND", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN",
        "HAD", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HAS", "HIM",
        "HIS", "HOW", "MAN", "OLD", "SEE", "TWO", "WAY", "WHO", "BOY", "DID",
        "ITS", "LET", "PUT", "SAY", "SHE", "TOO", "USE", "FLY", "AIR", "VIA",
    }
)


def _parse_duration_minutes(duration: str | None) -> int | None:
    if not duration or not isinstance(duration, str):
        return None
    h = re.search(r"(\d+)\s*h", duration, re.I)
    m = re.search(r"(\d+)\s*m", duration, re.I)
    if not h and not m:
        return None
    return (int(h.group(1)) if h else 0) * 60 + (int(m.group(1)) if m else 0)


def is_plausible_offer(
    ui: dict[str, Any],
    *,
    expected_origin: str = "",
    expected_dest: str = "",
) -> bool:
    """Drop sandbox junk / mapping bugs before they reach the UI."""
    airline = str(ui.get("airline") or "")
    if _JUNK_AIRLINE_RE.search(airline):
        return False

    origin = str(ui.get("origin") or "").upper().strip()
    dest = str(ui.get("destination") or "").upper().strip()
    if not _IATA_RE.match(origin) or not _IATA_RE.match(dest):
        return False
    if origin in _INVALID_IATA or dest in _INVALID_IATA:
        return False
    if origin == dest:
        return False

    exp_o = (expected_origin or "").upper().strip()
    exp_d = (expected_dest or "").upper().strip()
    if exp_o and _IATA_RE.match(exp_o) and origin != exp_o:
        return False
    if exp_d and _IATA_RE.match(exp_d) and dest != exp_d:
        return False

    mins = _parse_duration_minutes(ui.get("duration"))
    if mins is not None and (mins <= 0 or mins > _MAX_DURATION_MINUTES):
        return False

    try:
        price = float(ui.get("price") or 0)
    except (TypeError, ValueError):
        price = 0.0
    if price <= 0:
        return False

    return True


def _parse_time(value: str | None) -> str:
    if not value:
        return "--:--"
    # ISO or "2026-07-26T06:15:00"
    try:
        if "T" in value:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt.strftime("%H:%M")
        if len(value) >= 5 and value[2] == ":":
            return value[:5]
    except Exception:
        pass
    return value[:5] if value else "--:--"


def _direction(seg: dict[str, Any]) -> str:
    return str(seg.get("direction") or "").upper()


def _split_legs(
    segments: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split journey segments into outbound vs inbound.

    Round-trip LiteAPI journeys include both legs in one list. Display fields
    (origin/destination/times/duration/stops) must use OUTBOUND only — otherwise
    destination becomes the home airport and duration spans the whole trip
    (e.g. BOM 10:00 → BOM 10:20, 168h).
    """
    if not segments:
        return [], []

    outbound = [s for s in segments if _direction(s) == "OUTBOUND"]
    inbound = [s for s in segments if _direction(s) == "INBOUND"]

    if outbound or inbound:
        if not outbound:
            outbound = [s for s in segments if _direction(s) != "INBOUND"] or list(segments)
        return outbound, inbound

    # Untagged segments (one-way / connecting) — treat entire list as outbound
    return list(segments), []


def _duration_from_segments(segments: list[dict[str, Any]]) -> str:
    if not segments:
        return "—"
    first = segments[0].get("departure")
    last = segments[-1].get("arrival")
    try:
        if first and last:
            a = datetime.fromisoformat(str(first).replace("Z", "+00:00"))
            b = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
            mins = int((b - a).total_seconds() // 60)
            if mins < 0:
                # Same-day clock wrap only; dated ISO strings should not hit this
                mins += 24 * 60
            h, m = divmod(mins, 60)
            return f"{h}h {m:02d}m"
    except Exception:
        pass

    # Fallback: sum per-segment minutes when wall-clock parse fails
    total = 0
    have = False
    for seg in segments:
        dm = seg.get("duration_minutes")
        if dm is None:
            continue
        try:
            total += int(dm)
            have = True
        except (TypeError, ValueError):
            continue
    if have:
        h, m = divmod(total, 60)
        return f"{h}h {m:02d}m"
    return "—"


def _stops_for_leg(segments: list[dict[str, Any]], raw_stops: Any) -> int:
    """Stops = connections on the outbound leg only."""
    if segments:
        return max(0, len(segments) - 1)
    try:
        return int(raw_stops or 0)
    except (TypeError, ValueError):
        return 0


def offer_to_ui(raw: dict[str, Any], *, fallback_origin: str = "", fallback_dest: str = "") -> dict[str, Any]:
    """Map normalized agent offer (or already-UI offer) → FlightOffer dict."""
    segs = list(raw.get("segments_summary") or raw.get("segments") or [])

    # Prefer rebuilding from segments whenever present — timing fields on a
    # previously UI-shaped round-trip payload may still be wrong.
    if segs:
        outbound, inbound = _split_legs(segs)
        first = outbound[0] if outbound else {}
        last = outbound[-1] if outbound else {}
        airline = first.get("airline") or "Airline"
        flight_number = first.get("flight_number")
        origin = first.get("from") or fallback_origin
        destination = last.get("to") or fallback_dest
        price = raw.get("total_price") if raw.get("total_price") is not None else raw.get("price")
        try:
            price_f = float(price or 0)
        except (TypeError, ValueError):
            price_f = 0.0

        inbound_first = inbound[0] if inbound else {}
        inbound_last = inbound[-1] if inbound else {}

        return {
            "id": str(raw.get("offer_id") or raw.get("id") or f"offer-{raw.get('index', '')}"),
            "offer_id": raw.get("offer_id") or raw.get("id"),
            "airline": airline,
            "flight_number": flight_number,
            "origin": origin,
            "destination": destination,
            "depart_time": _parse_time(first.get("departure")),
            "arrive_time": _parse_time(last.get("arrival")),
            "duration": _duration_from_segments(outbound),
            "stops": _stops_for_leg(outbound, raw.get("stops")),
            "price": price_f,
            "currency": raw.get("currency") or "INR",
            "cabin": raw.get("cabin_class") or raw.get("cabin"),
            "fare_family": raw.get("fare_family"),
            "seats_remaining": raw.get("seats_remaining"),
            "baggage": raw.get("baggage"),
            "baggage_detail": raw.get("baggage_detail"),
            "amenities": raw.get("amenities") or [],
            "airline_logo": raw.get("airline_logo")
            or next((s.get("logo") for s in outbound if s.get("logo")), None),
            "is_cheapest": raw.get("is_cheapest"),
            "price_base": raw.get("price_base"),
            "price_taxes": raw.get("price_taxes"),
            "price_fees": raw.get("price_fees"),
            # Keep full journey for booking/verify; UI cards use outbound for the main row
            "segments": segs,
            "outbound_segments": outbound,
            "inbound_segments": inbound,
            "return_depart_time": _parse_time(inbound_first.get("departure")) if inbound else None,
            "return_arrive_time": _parse_time(inbound_last.get("arrival")) if inbound else None,
            "return_origin": inbound_first.get("from") if inbound else None,
            "return_destination": inbound_last.get("to") if inbound else None,
            "return_duration": _duration_from_segments(inbound) if inbound else None,
            "return_stops": _stops_for_leg(inbound, None) if inbound else None,
            "index": raw.get("index"),
            "raw": raw if "segments_summary" in raw or "offer_id" in raw else raw.get("raw"),
        }

    if raw.get("depart_time") and raw.get("price") is not None and raw.get("airline"):
        # Already UI-shaped, no segments to rebuild from
        return {
            "id": str(raw.get("id") or raw.get("offer_id") or ""),
            "offer_id": raw.get("offer_id") or raw.get("id"),
            "airline": raw.get("airline") or "Airline",
            "flight_number": raw.get("flight_number"),
            "origin": raw.get("origin") or fallback_origin,
            "destination": raw.get("destination") or fallback_dest,
            "depart_time": raw.get("depart_time"),
            "arrive_time": raw.get("arrive_time"),
            "duration": raw.get("duration") or "—",
            "stops": int(raw.get("stops") or 0),
            "price": float(raw.get("price") or 0),
            "currency": raw.get("currency") or "INR",
            "cabin": raw.get("cabin") or raw.get("cabin_class"),
            "fare_family": raw.get("fare_family"),
            "seats_remaining": raw.get("seats_remaining"),
            "baggage": raw.get("baggage"),
            "baggage_detail": raw.get("baggage_detail"),
            "amenities": raw.get("amenities") or [],
            "airline_logo": raw.get("airline_logo"),
            "is_cheapest": raw.get("is_cheapest"),
            "price_base": raw.get("price_base"),
            "price_taxes": raw.get("price_taxes"),
            "price_fees": raw.get("price_fees"),
            "segments": raw.get("segments") or raw.get("segments_summary") or [],
            "outbound_segments": raw.get("outbound_segments") or [],
            "inbound_segments": raw.get("inbound_segments") or [],
            "index": raw.get("index"),
            "raw": raw.get("raw"),
        }

    # Empty / unknown shape
    return {
        "id": str(raw.get("offer_id") or raw.get("id") or f"offer-{raw.get('index', '')}"),
        "offer_id": raw.get("offer_id") or raw.get("id"),
        "airline": raw.get("airline") or "Airline",
        "flight_number": raw.get("flight_number"),
        "origin": fallback_origin,
        "destination": fallback_dest,
        "depart_time": raw.get("depart_time") or "--:--",
        "arrive_time": raw.get("arrive_time") or "--:--",
        "duration": raw.get("duration") or "—",
        "stops": int(raw.get("stops") or 0),
        "price": float(raw.get("price") or raw.get("total_price") or 0),
        "currency": raw.get("currency") or "INR",
        "cabin": raw.get("cabin_class") or raw.get("cabin"),
        "fare_family": raw.get("fare_family"),
        "seats_remaining": raw.get("seats_remaining"),
        "baggage": raw.get("baggage"),
        "baggage_detail": raw.get("baggage_detail"),
        "amenities": raw.get("amenities") or [],
        "airline_logo": raw.get("airline_logo"),
        "is_cheapest": raw.get("is_cheapest"),
        "price_base": raw.get("price_base"),
        "price_taxes": raw.get("price_taxes"),
        "price_fees": raw.get("price_fees"),
        "segments": [],
        "outbound_segments": [],
        "inbound_segments": [],
        "index": raw.get("index"),
        "raw": raw,
    }


def normalize_search_list(
    results: list[dict[str, Any]] | None,
    *,
    origin: str = "",
    destination: str = "",
) -> list[dict[str, Any]]:
    out = []
    for item in results or []:
        ui = offer_to_ui(item, fallback_origin=origin, fallback_dest=destination)
        if is_plausible_offer(ui, expected_origin=origin, expected_dest=destination):
            out.append(ui)
    return out
