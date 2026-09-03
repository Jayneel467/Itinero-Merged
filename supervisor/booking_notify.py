"""Fire-and-forget booking confirmation emails after successful pay."""

from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any

from supervisor.email_service import send_booking_confirmation

logger = logging.getLogger(__name__)


def resolve_checkout_email(
    *,
    session: dict[str, Any] | None = None,
    intent: dict[str, Any] | None = None,
    explicit: str | None = None,
) -> str | None:
    """Best-effort email for checkout receipts - intent, session contact, request body."""
    mail = (explicit or "").strip()
    if mail and "@" in mail:
        return mail.lower()

    if intent:
        mail = (intent.get("email") or "").strip()
        if mail and "@" in mail:
            return mail.lower()
        payload = intent.get("payload") if isinstance(intent.get("payload"), dict) else {}
        mail = (payload.get("contact") or {}).get("email") or (payload.get("holder") or {}).get("email")
        mail = (mail or "").strip()
        if mail and "@" in mail:
            return mail.lower()

    sess = session if isinstance(session, dict) else {}
    for key in ("booking_contact", "flight_contact"):
        block = sess.get(key)
        if isinstance(block, dict):
            mail = (block.get("email") or "").strip()
            if mail and "@" in mail:
                return mail.lower()

    ctx = sess.get("flight_context") if isinstance(sess.get("flight_context"), dict) else {}
    travelers = ctx.get("travelers_draft") if isinstance(ctx.get("travelers_draft"), list) else []
    if travelers and isinstance(travelers[0], dict):
        mail = (travelers[0].get("email") or "").strip()
        if mail and "@" in mail:
            return mail.lower()

    return None


def _display_ref_from_payment(payment_id: str | None) -> str | None:
    tail = (payment_id or "").strip()[-6:].upper()
    return f"ITN-{tail}" if tail else None


def _pax_names(booking: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for key in ("passengers", "travelers", "guests"):
        rows = booking.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            name = " ".join(
                str(row.get(k) or "").strip()
                for k in ("firstName", "first_name", "lastName", "last_name")
                if row.get(k)
            ).strip()
            if not name:
                name = str(row.get("name") or "").strip()
            if name:
                names.append(name)
    return names


def _segment_bits(booking: dict[str, Any]) -> dict[str, str]:
    segs = booking.get("segments_summary") or booking.get("segments") or []
    if not isinstance(segs, list) or not segs:
        return {}
    first = segs[0] if isinstance(segs[0], dict) else {}
    last = segs[-1] if isinstance(segs[-1], dict) else first
    airline = (
        first.get("airline")
        or first.get("airline_name")
        or booking.get("airline")
        or ""
    )
    flight_no = first.get("flight_number") or first.get("flightNumber") or ""
    dep = first.get("departure") or first.get("depart_at") or first.get("departure_time") or ""
    arr = last.get("arrival") or last.get("arrive_at") or last.get("arrival_time") or ""
    origin = first.get("origin") or first.get("from") or ""
    dest = last.get("destination") or last.get("to") or ""
    duration = first.get("duration") or booking.get("duration") or ""
    cabin = first.get("cabin") or booking.get("cabin") or ""
    stops = first.get("stops")
    if stops is None:
        stops = booking.get("stops")
    if isinstance(stops, (int, float)):
        stops_label = "Direct" if int(stops) == 0 else f"{int(stops)} stop{'s' if int(stops) != 1 else ''}"
    else:
        stops_label = str(stops or "Direct")
    route = ""
    if origin and dest:
        route = f"{origin} → {dest}"
    return {
        "airline": str(airline or ""),
        "flight_number": str(flight_no or ""),
        "depart_at": str(dep or ""),
        "arrive_at": str(arr or ""),
        "origin": str(origin or "").upper()[:3],
        "destination": str(dest or "").upper()[:3],
        "duration": str(duration or ""),
        "cabin": str(cabin or "Economy"),
        "stops": stops_label,
        "route": route,
    }


def _build_details(
    *,
    kind: str,
    result: dict[str, Any],
    extras: dict[str, Any] | None,
    payment_id: str | None,
    pending: bool,
) -> dict[str, Any]:
    booking = result.get("booking") if isinstance(result.get("booking"), dict) else {}
    extra = extras or {}
    ref = (
        booking.get("airline_pnr")
        or booking.get("booking_ref")
        or booking.get("booking_id")
        or booking.get("hotel_confirmation_code")
        or booking.get("confirmation_code")
        or extra.get("booking_ref")
        or _display_ref_from_payment(payment_id)
    )
    seg = _segment_bits(booking)
    route = extra.get("route") or seg.get("route") or booking.get("route")
    contact = booking.get("contact") if isinstance(booking.get("contact"), dict) else {}
    details: dict[str, Any] = {
        "booking_ref": ref,
        "route": route,
        "airline": extra.get("airline") or seg.get("airline") or booking.get("airline"),
        "flight_number": extra.get("flight_number") or seg.get("flight_number"),
        "depart_at": extra.get("depart_at") or seg.get("depart_at"),
        "arrive_at": extra.get("arrive_at") or seg.get("arrive_at"),
        "travel_date": extra.get("travel_date") or booking.get("travel_date") or booking.get("depart_date"),
        "origin": extra.get("origin") or seg.get("origin"),
        "destination": extra.get("destination") or seg.get("destination"),
        "duration": extra.get("duration") or seg.get("duration") or booking.get("duration"),
        "cabin": extra.get("cabin") or seg.get("cabin") or booking.get("cabin") or "Economy",
        "stops": extra.get("stops") or seg.get("stops") or "Direct",
        "passengers": extra.get("passengers") or _pax_names(booking),
        "guest_name": extra.get("guest_name")
        or booking.get("guest_name")
        or (
            (booking.get("contact") or {}).get("name")
            if isinstance(booking.get("contact"), dict)
            else None
        )
        or extra.get("contact_name"),
        "email": extra.get("email") or contact.get("email"),
        "phone": extra.get("phone")
        or (
            f"+{contact.get('phone_country_code') or '91'} {contact.get('phone')}"
            if contact.get("phone")
            else None
        ),
        "hotel_name": extra.get("hotel_name") or booking.get("hotel_name") or booking.get("name"),
        "check_in": (
            extra.get("check_in")
            or extra.get("checkIn")
            or booking.get("check_in")
            or booking.get("checkin")
            or booking.get("checkIn")
        ),
        "check_out": (
            extra.get("check_out")
            or extra.get("checkOut")
            or booking.get("check_out")
            or booking.get("checkout")
            or booking.get("checkOut")
        ),
        "room_name": extra.get("room_name") or booking.get("room_name") or booking.get("room_type"),
        "guests": extra.get("guests") or booking.get("guests"),
        "amount": extra.get("amount") or booking.get("total_price") or booking.get("price"),
        "currency": extra.get("currency") or booking.get("currency") or "INR",
        "status": "pending" if pending else "confirmed",
        "payment_id": payment_id,
    }
    if pending:
        details["subject"] = (
            "Payment received - your Itinero flight ticket is being issued"
            if kind == "flight"
            else "Payment received - your Itinero hotel booking is being confirmed"
        )
        details["note"] = (
            result.get("error")
            or "Your payment was captured. Our team is finishing the supplier booking - "
            "you'll get another email once the confirmation is ready."
        )
    return details


def _blank(value: Any) -> bool:
    s = str(value or "").strip()
    return (not s) or s in {"-", "-", "--:--", "None", "null"}


def enrich_extras_from_trip(
    extras: dict[str, Any] | None,
    *,
    booking_ref: str | None = None,
    payment_id: str | None = None,
) -> dict[str, Any]:
    """Fill missing schedule / pax from Neon trip when the client omitted them."""
    out = dict(extras or {})
    need = any(
        _blank(out.get(k))
        for k in (
            "depart_at",
            "arrive_at",
            "passengers",
            "origin",
            "destination",
            "duration",
            "airline",
            "flight_number",
        )
    )
    if not need:
        return out

    try:
        from supervisor.ledger import find_trip_by_booking_refs

        trip = find_trip_by_booking_refs(
            booking_ref=booking_ref or out.get("booking_ref"),
            payment_id=payment_id,
        )
    except Exception:
        traceback.print_exc()
        trip = None
    if not isinstance(trip, dict):
        return out

    legs = trip.get("legs") if isinstance(trip.get("legs"), list) else []
    flight = next((l for l in legs if isinstance(l, dict) and l.get("type") == "flight"), None)
    if not flight:
        return out

    snap = flight.get("flightSnapshot") if isinstance(flight.get("flightSnapshot"), dict) else {}
    segs = flight.get("segmentsSummary") if isinstance(flight.get("segmentsSummary"), list) else []
    first = segs[0] if segs and isinstance(segs[0], dict) else {}

    dep = (
        first.get("departure")
        or flight.get("departureTime")
        or (snap.get("departure") or {}).get("time")
    )
    arr = (
        first.get("arrival")
        or flight.get("arrivalTime")
        or (snap.get("arrival") or {}).get("time")
    )
    if _blank(out.get("depart_at")) and dep:
        out["depart_at"] = str(dep)
    if _blank(out.get("arrive_at")) and arr:
        out["arrive_at"] = str(arr)

    origin = (
        trip.get("origin")
        or first.get("from")
        or (snap.get("departure") or {}).get("airport")
    )
    dest = (
        trip.get("destination")
        or first.get("to")
        or (snap.get("arrival") or {}).get("airport")
    )
    if _blank(out.get("origin")) and origin:
        out["origin"] = str(origin).upper()[:3]
    if _blank(out.get("destination")) and dest:
        out["destination"] = str(dest).upper()[:3]
    if _blank(out.get("route")) and out.get("origin") and out.get("destination"):
        out["route"] = f"{out['origin']} → {out['destination']}"

    if _blank(out.get("airline")):
        air = flight.get("airline") or first.get("airline")
        if not air:
            sa = snap.get("airline")
            air = sa.get("name") if isinstance(sa, dict) else sa
        if air:
            out["airline"] = air
    if _blank(out.get("flight_number")):
        out["flight_number"] = (
            snap.get("flightNumber")
            or first.get("flight_number")
            or flight.get("flightNumber")
        )
    if _blank(out.get("duration")):
        mins = first.get("duration_minutes")
        if isinstance(mins, (int, float)) and mins > 0:
            h, m = divmod(int(mins), 60)
            out["duration"] = f"{h}h {m:02d}m" if h else f"{m}m"
        else:
            out["duration"] = flight.get("duration") or snap.get("duration")
    if _blank(out.get("cabin")):
        out["cabin"] = snap.get("cabin") or "Economy"
    if _blank(out.get("stops")):
        stops = flight.get("stops")
        if stops == 0 or stops == "0":
            out["stops"] = "Direct"
        elif stops is not None:
            out["stops"] = str(stops)
    if _blank(out.get("travel_date")):
        raw = trip.get("departDate") or flight.get("departDate") or first.get("departure")
        if raw:
            out["travel_date"] = str(raw)[:10]

    if _blank(out.get("passengers")):
        names: list[str] = []
        for row in trip.get("passengers") or []:
            if not isinstance(row, dict):
                continue
            name = " ".join(
                str(row.get(k) or "").strip()
                for k in ("firstName", "first_name", "lastName", "last_name")
                if row.get(k)
            ).strip() or str(row.get("name") or "").strip()
            if name:
                names.append(name)
        if names:
            out["passengers"] = names
        else:
            contact = trip.get("contact") if isinstance(trip.get("contact"), dict) else {}
            if contact.get("name"):
                out["passengers"] = [str(contact["name"])]

    contact = trip.get("contact") if isinstance(trip.get("contact"), dict) else {}
    if _blank(out.get("email")) and contact.get("email"):
        out["email"] = contact.get("email")
    if _blank(out.get("phone")) and contact.get("phone"):
        cc = contact.get("phone_country_code") or contact.get("phoneCountryCode") or "91"
        out["phone"] = f"+{cc} {contact.get('phone')}"
    if _blank(out.get("amount")) and flight.get("price") is not None:
        out["amount"] = flight.get("price")
    if _blank(out.get("currency")) and flight.get("currency"):
        out["currency"] = flight.get("currency")

    return out


def schedule_booking_email(
    *,
    kind: str,
    to_email: str | None,
    result: dict[str, Any],
    extras: dict[str, Any] | None = None,
    payment_id: str | None = None,
    force_pending: bool = False,
) -> None:
    """Fire-and-forget SMTP confirmation after checkout."""
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(
            send_booking_email_smtp(
                kind=kind,
                to_email=to_email,
                result=result,
                extras=extras,
                payment_id=payment_id,
                force_pending=force_pending,
            )
        )
    except RuntimeError:
        asyncio.run(
            send_booking_email_smtp(
                kind=kind,
                to_email=to_email,
                result=result,
                extras=extras,
                payment_id=payment_id,
                force_pending=force_pending,
            )
        )


async def send_booking_email_smtp(
    *,
    kind: str,
    to_email: str | None,
    result: dict[str, Any] | None = None,
    extras: dict[str, Any] | None = None,
    payment_id: str | None = None,
    force_pending: bool = False,
    allow_unconfirmed: bool = False,
) -> dict[str, Any]:
    """Send booking mail via Zoho SMTP and return the result (for trip / manual send)."""
    mail = (to_email or "").strip()
    if not mail or "@" not in mail:
        return {"ok": False, "error": "invalid_email", "message": "Valid email is required."}

    payload = result if isinstance(result, dict) else {}
    confirmed = bool(payload.get("ok"))
    pending = bool(force_pending or (not confirmed and payment_id and payload.get("payment_ready")))
    if not confirmed and not pending:
        if not allow_unconfirmed:
            logger.warning(
                "booking_email_skipped not_confirmed kind=%s payment_id=%s error=%s",
                kind,
                payment_id,
                payload.get("error"),
            )
            return {"ok": False, "error": "not_confirmed", "message": "Booking is not confirmed yet."}
        payload = {**payload, "ok": True}
        confirmed = True

    details = _build_details(
        kind=kind,
        result=payload,
        extras=enrich_extras_from_trip(
            extras,
            booking_ref=(extras or {}).get("booking_ref") if isinstance(extras, dict) else None,
            payment_id=payment_id,
        ),
        payment_id=payment_id,
        pending=pending,
    )
    try:
        out = await send_booking_confirmation(kind=kind, to_email=mail, details=details)
        if not out.get("ok"):
            logger.warning("booking_email_failed kind=%s to=%s err=%s", kind, mail, out.get("error"))
        return out
    except Exception as exc:
        logger.exception("booking_email_exception kind=%s to=%s", kind, mail)
        traceback.print_exc()
        return {"ok": False, "error": "smtp_error", "message": str(exc)[:200]}
