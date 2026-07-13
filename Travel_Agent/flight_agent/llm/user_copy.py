"""User-facing copy helpers — plain language only."""

from __future__ import annotations

import re

from flight_agent.llm.booking_requirements import (
    all_travelers_complete,
    next_traveler_details_prompt,
    passenger_slot_plan,
)
from flight_agent.models.agent import SessionContext


def passengers_question_prompt(ctx: SessionContext) -> str:
    offer = ctx.selected_offer_index
    intro = f"Great choice — **option {offer}**!" if offer else "Before I check the fare,"
    return (
        f"{intro}\n\n"
        "**How many passengers** are travelling?\n\n"
        "- **Adults** (12+)\n"
        "- **Children** (2–11), if any\n"
        "- **Infants** (under 2), if any\n\n"
        "Example: *2 adults, 1 child* or *1 adult only*"
    )


def service_preference_question(ctx: SessionContext) -> str:
    return (
        "**Would you like any additional services?**\n\n"
        "- **Seat** — preferred seat\n"
        "- **Baggage** — extra luggage\n"
        "- **Both** — seat and baggage\n"
        "- **None** or **skip** — no extras"
    )


def next_step_hint(ctx: SessionContext) -> str:
    if ctx.awaiting_cancel_confirmation:
        return cancel_confirmation_prompt(
            {"booking_id": ctx.pending_cancel_booking_id or ctx.booking_id}
        )
    if ctx.booking_id:
        return post_booking_help_prompt(ctx)
    if ctx.awaiting_payment_confirmation and not ctx.payment_confirmed:
        return "Reply **YES** when you're ready to confirm your booking and get your ticket."
    if ctx.awaiting_service_preference and not ctx.service_preference:
        return "Tell me: **seat**, **baggage**, **both**, or **skip**."
    if ctx.prebook_id and ctx.service_preference and ctx.service_preference != "none":
        return "Pick an add-on from the list, or say **skip**."
    if ctx.awaiting_booking_confirmation and not ctx.booking_confirmed:
        return "Check your details above, then reply **YES** to continue."
    if ctx.verified_offer_id and not all_travelers_complete(ctx):
        if len(passenger_slot_plan(ctx)) > 1:
            return next_traveler_details_prompt(ctx)
        req = ctx.booking_requirements or {}
        doc = "Aadhaar/ID" if req.get("route_type") == "domestic" else "passport"
        return f"Send name, email, phone, DOB, gender & **{doc}**."
    if ctx.selected_offer_index and not ctx.passengers_confirmed:
        return "Tell me **how many passengers** (adults, children, infants)."
    if ctx.last_search_results:
        return "Say **option 1** (or another number), then I'll ask about passengers."
    return "Tell me where you're flying from, to, and your travel date."


def strip_thinking_tags(text: str) -> str:
    if not text:
        return text
    cleaned = re.sub(r"<think[^>]*>.*?", "", text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL | re.IGNORECASE)
    return cleaned.strip()


def sanitize_assistant_text(text: str, session: SessionContext | None = None) -> str:
    if not text:
        return text
    text = strip_thinking_tags(text)
    if is_technical_error(text):
        return contextual_fallback_prompt(session) if session else ""
    for old, new in (
        ("LiteAPI", "our flight system"),
        ("liteapi", "our flight system"),
        ("prebook", "booking hold"),
        ("Prebook", "Booking hold"),
        ("transactionId", "payment reference"),
        ("serviceId", "add-on"),
        ("offerId", "flight option"),
        ("id_card", "government ID"),
    ):
        text = text.replace(old, new)
    if is_technical_error(text):
        return contextual_fallback_prompt(session) if session else ""
    return text


def is_technical_error(text: str) -> bool:
    lower = text.lower()
    if any(
        m in lower
        for m in (
            "nameerror",
            "not defined",
            "traceback",
            "exception",
            "attributeerror",
            "typeerror",
            "keyerror",
            "importerror",
            "syntaxerror",
            "graphrecursion",
        )
    ):
        return True
    if re.search(r"(^|\n)\s*file\s+\S+", lower):
        return True
    if re.search(r"(^|\n)\s*line\s+\d+", lower):
        return True
    return False


def contextual_fallback_prompt(session: SessionContext) -> str:
    """What the user should do next when the model reply is empty/bad."""
    if session.awaiting_payment_confirmation and not session.payment_confirmed:
        from flight_agent.llm.confirmation import payment_summary_prompt

        return payment_summary_prompt(session)
    if session.awaiting_booking_confirmation and not session.booking_confirmed:
        from flight_agent.llm.confirmation import booking_summary_prompt

        return booking_summary_prompt(session)
    if session.awaiting_service_preference and not session.service_preference:
        return service_preference_question(session)
    if session.verified_offer_id and not all_travelers_complete(session):
        return "Thanks — I still need a few more details.\n\n" + next_traveler_details_prompt(
            session
        )
    if session.selected_offer_index and not session.passengers_confirmed:
        return passengers_question_prompt(session)
    return next_step_hint(session) or clarification_prompt()


def booking_details_user_prompt(booking: dict) -> str:
    if not booking or not booking.get("found"):
        return (
            "I couldn't find that booking.\n\n"
            "Share your **booking ID** or **airline PNR + last name**, "
            "or say **list my bookings**."
        )
    bid = booking.get("booking_id") or "—"
    pnr = booking.get("airline_pnr") or "—"
    status = booking.get("status") or "—"
    segs = booking.get("segments_summary") or []
    route = "—"
    if segs:
        s = segs[0]
        route = f"{s.get('from', '?')} → {s.get('to', '?')}"
    return (
        f"**Your booking**\n\n"
        f"- **Status:** {status}\n"
        f"- **Booking ID:** `{bid}`\n"
        f"- **Airline PNR:** {pnr}\n"
        f"- **Route:** {route}\n\n"
        "Say **cancel booking** to cancel, or **list my bookings**."
    )


def booking_list_user_prompt(payload: dict) -> str:
    bookings = payload.get("bookings") or []
    if not bookings:
        return "No bookings found. Share a **booking ID**, or book a new flight."
    lines = [f"**Found {len(bookings)} booking(s):**", ""]
    for i, b in enumerate(bookings[:8], start=1):
        segs = b.get("segments_summary") or []
        route = "—"
        if segs:
            route = f"{segs[0].get('from', '?')} → {segs[0].get('to', '?')}"
        lines.append(
            f"{i}. **{b.get('status') or '—'}** · {route}\n"
            f"   ID: `{b.get('booking_id') or '—'}` · PNR: {b.get('airline_pnr') or '—'}"
        )
    lines.append("\nReply with a **booking ID** for details.")
    return "\n".join(lines)


def cancel_confirmation_prompt(booking: dict | None = None) -> str:
    booking = booking or {}
    bid = booking.get("booking_id") or "this booking"
    pnr = booking.get("airline_pnr")
    extra = f" (PNR **{pnr}**)" if pnr else ""
    return (
        f"You're about to **cancel** booking `{bid}`{extra}.\n\n"
        "Reply **YES** to confirm, or **NO** to keep the ticket."
    )


def cancel_result_user_prompt(result: dict) -> str:
    bid = result.get("booking_id") or "—"
    pnr = result.get("airline_pnr") or "—"
    status = result.get("status") or "—"
    if result.get("already_cancelled"):
        return f"Booking `{bid}` is already cancelled (status: **{status}**)."
    if result.get("cancelled"):
        return (
            f"**Booking cancelled.**\n\n"
            f"- **Booking ID:** `{bid}`\n"
            f"- **Status:** {status}\n"
            f"- **Airline PNR:** {pnr}"
        )
    return (
        f"{result.get('message') or 'Cancellation could not be confirmed yet.'}\n\n"
        f"- **Booking ID:** `{bid}`\n"
        f"- **Status:** {status}\n"
        f"- **Airline PNR:** {pnr}"
    )


def post_booking_help_prompt(session: SessionContext) -> str:
    bid = session.booking_id or (session.last_booking or {}).get("booking_id")
    lines = ["Your ticket is ready. You can:"]
    if bid:
        lines.append(f"- **retrieve booking** (ID `{bid}`)")
    else:
        lines.append("- **retrieve booking** or share a booking ID / PNR")
    lines.append("- **list my bookings**")
    lines.append("- **cancel booking**")
    return "\n".join(lines)


def is_generic_clarification(text: str) -> bool:
    stripped = text.strip().lower()
    return stripped.startswith("sorry, i didn't") or stripped.startswith(
        "sorry, i did not"
    )


def clarification_prompt() -> str:
    return (
        "Sorry, I didn't quite catch that.\n\n"
        "I'm your **flight booking assistant**. Tell me "
        "**from, to, and date** (e.g. *Mumbai to Delhi on 8 July*), "
        "or say what you'd like next."
    )
