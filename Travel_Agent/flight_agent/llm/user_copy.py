"""User-facing labels and hints — no technical jargon."""

from __future__ import annotations

import re

from flight_agent.models.agent import SessionContext

STEP_LABELS = [
    ("Find flights", "last_search_results"),
    ("Pick a flight", "selected_offer_index"),
    ("Passengers", "passengers_confirmed"),
    ("Confirm fare", "verified_offer_id"),
    ("Your details", "traveler_ready"),
    ("Add-ons", "service_preference"),
    ("Pay & book", "prebook_id"),
    ("Ticket issued", "booking_id"),
]


def _traveler_ready(ctx: SessionContext) -> bool:
    draft = ctx.traveler_draft or {}
    return bool(draft.get("passenger_first_name") and draft.get("contact_email"))


def step_status(ctx: SessionContext) -> list[tuple[str, bool]]:
    checks = {
        "last_search_results": bool(ctx.last_search_results),
        "selected_offer_index": bool(ctx.selected_offer_index),
        "passengers_confirmed": ctx.passengers_confirmed,
        "verified_offer_id": bool(ctx.verified_offer_id),
        "traveler_ready": _traveler_ready(ctx),
        "service_preference": bool(ctx.service_preference) or not ctx.awaiting_service_preference,
        "prebook_id": bool(ctx.prebook_id),
        "booking_id": bool(ctx.booking_id),
    }
    return [(label, checks[key]) for label, key in STEP_LABELS]


def passengers_question_prompt(ctx: SessionContext) -> str:
    search = ctx.search_context or {}
    offer = ctx.selected_offer_index
    intro = (
        f"Great choice — **option {offer}**!" if offer else "Before I check the fare,"
    )
    current = search.get("adults"), search.get("children"), search.get("infants")
    if any(v is not None for v in current) and ctx.passengers_confirmed:
        return ""
    return (
        f"{intro}\n\n"
        "**How many passengers** are travelling?\n\n"
        "Please tell me:\n"
        "- **Adults** (12+)\n"
        "- **Children** (2–11), if any\n"
        "- **Infants** (under 2), if any\n\n"
        "Example: *2 adults, 1 child* or *1 adult only*"
    )


def service_preference_question(ctx: SessionContext) -> str:
    """Ask what add-ons user wants BEFORE listing options."""
    return (
        "Your flight is held. **Would you like any extras?**\n\n"
        "Reply with one of:\n"
        "- **Seat** — preferred seat (window/aisle)\n"
        "- **Baggage** — extra luggage\n"
        "- **Both** — seat and baggage\n"
        "- **None** or **skip** — no extras, go straight to payment\n\n"
        "I'll show available options only after you tell me what you need."
    )


def next_step_hint(ctx: SessionContext) -> str:
    if ctx.booking_id:
        return "Your flight is booked. Save your PNR from the confirmation above."
    if ctx.awaiting_payment_confirmation and not ctx.payment_confirmed:
        return "Reply **YES** when you're ready to pay and get your ticket."
    if ctx.awaiting_service_preference and not ctx.service_preference:
        return "Tell me: **seat**, **baggage**, **both**, or **skip** (no extras)."
    if ctx.prebook_id and ctx.service_preference and ctx.service_preference != "none":
        return "Pick an add-on from the list, or say **skip** to pay."
    if ctx.awaiting_booking_confirmation and not ctx.booking_confirmed:
        return "Check your details above, then reply **YES** to continue."
    if ctx.traveler_draft and ctx.verified_offer_id:
        return "Share any missing details, or reply **YES** if everything looks correct."
    if ctx.verified_offer_id:
        req = ctx.booking_requirements or {}
        pax = ctx.search_context or {}
        pax_line = (
            f"{pax.get('adults', 1)} adult(s)"
            + (f", {pax.get('children')} child(ren)" if pax.get("children") else "")
            + (f", {pax.get('infants')} infant(s)" if pax.get("infants") else "")
        )
        doc = "Aadhaar/ID (no passport)" if req.get("route_type") == "domestic" else "passport"
        return f"Booking for **{pax_line}**. Send name, email, phone, DOB, gender & **{doc}**."
    if ctx.selected_offer_index and not ctx.passengers_confirmed:
        return "Tell me **how many passengers** (adults, children, infants) before I confirm the fare."
    if ctx.last_search_results:
        return "Say **option 1** (or another number), then I'll ask about passengers."
    return "Tell me where you're flying from, to, and your travel date."


def id_document_label(ctx: SessionContext) -> str:
    req = ctx.booking_requirements or {}
    if req.get("route_type") == "domestic":
        return "Aadhaar / govt ID (no passport)"
    return "Passport required"


def strip_thinking_tags(text: str) -> str:
    """Remove Qwen-style thinking blocks from model output."""
    if not text:
        return text
    cleaned = re.sub(r"<think[^>]*>.*?", "", text, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(
        r"<think>.*?</think>", "", cleaned, flags=re.DOTALL | re.IGNORECASE
    )
    return cleaned.strip()


def sanitize_assistant_text(text: str) -> str:
    """Remove technical terms users should not see."""
    if not text:
        return text
    text = strip_thinking_tags(text)
    if is_technical_error(text):
        return clarification_prompt()
    replacements = {
        "LiteAPI": "our flight system",
        "liteapi": "our flight system",
        "prebook": "booking hold",
        "Prebook": "Booking hold",
        "transactionId": "payment reference",
        "serviceId": "add-on",
        "offerId": "flight option",
        "id_card": "government ID",
        "build_flight_tools": "system",
        "NameError": "issue",
        "not defined": "missing",
    }
    result = text
    for old, new in replacements.items():
        result = result.replace(old, new)
    if is_technical_error(result):
        return clarification_prompt()
    return result


def is_technical_error(text: str) -> bool:
    """True if text looks like a code/system error, not a user message."""
    lower = text.lower()
    markers = (
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
        "  file ",
        "line ",
    )
    return any(m in lower for m in markers)


def clarification_prompt(context: str = "") -> str:
    """Ask the user to clarify when the agent is unsure."""
    base = (
        "Sorry, I didn't quite catch that.\n\n"
        "I'm your **flight booking assistant** — I can help you:\n"
        "- **Search flights** (e.g. *Mumbai to Delhi on 8 July*)\n"
        "- **Pick an option** (e.g. *option 1*)\n"
        "- **Book a ticket** (share your details when asked)\n\n"
        "Please tell me **where you're flying from, where to, and your date** — "
        "or repeat what you'd like me to do."
    )
    if context:
        return f"{base}\n\n({context})"
    return base
