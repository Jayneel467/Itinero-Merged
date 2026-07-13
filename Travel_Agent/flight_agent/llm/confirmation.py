"""User confirmation detection and booking summary prompts."""

from __future__ import annotations

from flight_agent.llm.booking_requirements import ensure_travelers_draft, passenger_slot_plan
from flight_agent.models.agent import SessionContext

_CONFIRM_EXACT = frozenset(
    {
        "yes",
        "y",
        "confirm",
        "confirmed",
        "ok",
        "okay",
        "proceed",
        "book",
        "book it",
        "go ahead",
        "sure",
        "yep",
        "yeah",
        "pay",
        "pay now",
    }
)

_CONFIRM_PREFIXES = (
    "yes ",
    "confirm ",
    "book ",
    "proceed ",
    "ok ",
    "okay ",
    "pay ",
)


def is_user_confirmation(text: str) -> bool:
    """True when the user explicitly confirms booking or payment."""
    normalized = text.strip().lower().rstrip(".!")
    if normalized in _CONFIRM_EXACT:
        return True
    return any(normalized.startswith(prefix) for prefix in _CONFIRM_PREFIXES)


_DENY_EXACT = frozenset(
    {
        "no",
        "n",
        "nope",
        "nah",
        "don't",
        "dont",
        "do not",
        "stop",
        "keep",
        "keep it",
        "cancel cancel",
    }
)


def is_user_denial(text: str) -> bool:
    """True when the user declines confirmation."""
    normalized = text.strip().lower().rstrip(".!")
    return normalized in _DENY_EXACT or normalized.startswith("no ")


def reset_booking_flow(session: SessionContext) -> None:
    """Clear confirmation state when starting a new search or offer."""
    session.awaiting_booking_confirmation = False
    session.booking_confirmed = False
    session.awaiting_payment_confirmation = False
    session.payment_confirmed = False
    session.payment_captured = False
    session.passengers_confirmed = False
    session.service_preference = None
    session.awaiting_service_preference = False
    session.awaiting_cancel_confirmation = False
    session.cancel_confirmed = False
    session.pending_cancel_booking_id = None
    session.traveler_draft = {}
    session.travelers_draft = []
    session.current_traveler_index = 0
    session.publishable_key = None
    session.secret_key = None
    session.transaction_id = None
    session.prebook_id = None


def apply_service_preference(message: str, session: SessionContext) -> None:
    """Parse user reply about seats/baggage before showing add-on lists."""
    if not session.awaiting_service_preference:
        return
    text = message.strip().lower()
    if text in {"skip", "none", "no", "no thanks", "nothing", "nope", "nah"}:
        session.service_preference = "none"
        session.awaiting_service_preference = False
        # Before hold → ask booking YES. After hold → ask payment YES.
        if session.prebook_id:
            session.awaiting_payment_confirmation = True
        else:
            session.awaiting_booking_confirmation = True
            session.booking_confirmed = False
        return
    if "both" in text or ("seat" in text and "bag" in text):
        session.service_preference = "both"
        session.awaiting_service_preference = False
        return
    if "seat" in text or "window" in text or "aisle" in text:
        session.service_preference = "seats"
        session.awaiting_service_preference = False
        return
    if "bag" in text or "luggage" in text:
        session.service_preference = "baggage"
        session.awaiting_service_preference = False
        return
    if text in {"yes", "ok", "okay"}:
        return


def apply_user_confirmation(message: str, session: SessionContext) -> None:
    """Set confirmation flags when the user replies yes/confirm."""
    apply_service_preference(message, session)
    if session.awaiting_cancel_confirmation:
        if is_user_denial(message):
            session.awaiting_cancel_confirmation = False
            session.cancel_confirmed = False
            session.pending_cancel_booking_id = None
            return
        if is_user_confirmation(message):
            session.cancel_confirmed = True
            return
    if not is_user_confirmation(message):
        return
    if session.awaiting_booking_confirmation:
        session.booking_confirmed = True
    if session.awaiting_payment_confirmation and not session.awaiting_service_preference:
        session.payment_confirmed = True


def booking_summary_prompt(session: SessionContext) -> str:
    """Ask the user to confirm traveler details before prebook."""
    ensure_travelers_draft(session)
    plan = passenger_slot_plan(session)
    drafts = session.travelers_draft or [session.traveler_draft]
    offer = session.selected_offer_index
    verified = session.last_verified_offer or {}
    pricing = verified.get("pricing") or {}
    price = pricing.get("total")
    currency = pricing.get("currency") or "INR"
    price_line = f"**{currency} {price}**" if price else "the verified fare"

    req = session.booking_requirements or {}
    route_note = req.get("route_note", "")
    lines = [
        "Please **confirm** your booking details before I proceed:",
        "",
    ]
    if route_note:
        lines.extend([route_note, ""])

    if len(plan) > 1:
        for i, slot in enumerate(plan):
            draft = drafts[i] if i < len(drafts) else {}
            name = (
                f"{draft.get('passenger_first_name', '')} "
                f"{draft.get('passenger_last_name', '')}"
            ).strip()
            email = draft.get("contact_email", "—")
            phone = (
                f"+{draft.get('contact_phone_country_code', '')} "
                f"{draft.get('contact_phone_number', '')}"
            ).strip()
            if slot.get("needs_contact"):
                lines.append(
                    f"- **{slot['label']}:** {name or '—'} · {email} · {phone}"
                )
            else:
                lines.append(
                    f"- **{slot['label']}:** {name or '—'} · DOB {draft.get('passenger_birthday', '—')}"
                )
    else:
        draft = session.traveler_draft
        name = f"{draft.get('passenger_first_name', '')} {draft.get('passenger_last_name', '')}".strip()
        lines.extend(
            [
                f"- **Passenger:** {name or '—'}",
                f"- **Email:** {draft.get('contact_email', '—')}",
                f"- **Phone:** +{draft.get('contact_phone_country_code', '')} "
                f"{draft.get('contact_phone_number', '—')}",
            ]
        )

    lines.extend(
        [
            f"- **Flight option:** #{offer}" if offer else "- **Flight:** verified offer",
            f"- **Fare:** {price_line}",
            "",
            "Reply **YES** or **CONFIRM** to proceed with prebook, or tell me what to change.",
        ]
    )
    return "\n".join(lines)


def payment_summary_prompt(session: SessionContext) -> str:
    """Ask the user to confirm booking before completing payment."""
    from flight_agent.config import get_settings

    prebook = session.last_prebook or {}
    price = prebook.get("price")
    currency = prebook.get("currency") or "INR"
    price_line = f"**{currency} {price}**" if price else "the held fare"
    settings = get_settings()
    if settings.liteapi_use_payment_sdk:
        if session.payment_captured:
            return (
                f"Payment received for {price_line}.\n\n"
                "Reply **YES** or click **Issue ticket** to get your booking confirmation.\n\n"
                "Say **NO** if you want to stop here."
            )
        return (
            f"Your flight is on hold. Total fare: {price_line}.\n\n"
            "Pay securely with your **card** in the payment box below "
            "(test card: `4242 4242 4242 4242`, any future expiry, any CVC).\n\n"
            "After payment succeeds, click **Issue ticket** or reply **YES**.\n\n"
            "Say **NO** if you want to stop here (the hold may expire)."
        )

    return (
        f"Your flight is on hold. Total fare: {price_line}.\n\n"
        "Reply **YES** or **CONFIRM** to issue your ticket. "
        "Sandbox mode: booking completes on your LiteAPI credit line (no card charged).\n\n"
        "Say **NO** if you want to stop here (the hold may expire)."
    )
