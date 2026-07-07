"""User confirmation detection and booking summary prompts."""

from __future__ import annotations

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
        "haan",
        "han",
        "ji",
        "theek",
        "theek hai",
        "thik hai",
        "sahi",
        "bilkul",
        "kar do",
        "kardo",
        "chalega",
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
    "haan ",
    "ji ",
    "theek ",
)


def is_user_confirmation(text: str) -> bool:
    """True when the user explicitly confirms booking or payment."""
    normalized = text.strip().lower().rstrip(".!")
    if normalized in _CONFIRM_EXACT:
        return True
    return any(normalized.startswith(prefix) for prefix in _CONFIRM_PREFIXES)


def reset_booking_flow(session: SessionContext) -> None:
    """Clear confirmation state when starting a new search or offer."""
    session.awaiting_booking_confirmation = False
    session.booking_confirmed = False
    session.awaiting_payment_confirmation = False
    session.payment_confirmed = False
    session.passengers_confirmed = False
    session.service_preference = None
    session.awaiting_service_preference = False


def apply_service_preference(message: str, session: SessionContext) -> None:
    """Parse user reply about seats/baggage before showing add-on lists."""
    if not session.awaiting_service_preference:
        return
    text = message.strip().lower()
    if text in {"skip", "none", "no", "no thanks", "nothing", "nope", "nah"}:
        session.service_preference = "none"
        session.awaiting_service_preference = False
        session.awaiting_payment_confirmation = True
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
    if not is_user_confirmation(message):
        return
    if session.awaiting_booking_confirmation:
        session.booking_confirmed = True
    if session.awaiting_payment_confirmation and not session.awaiting_service_preference:
        session.payment_confirmed = True


def booking_summary_prompt(session: SessionContext) -> str:
    """Ask the user to confirm traveler details before prebook."""
    draft = session.traveler_draft
    name = f"{draft.get('passenger_first_name', '')} {draft.get('passenger_last_name', '')}".strip()
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
    lines.extend(
        [
            f"- **Passenger:** {name or '—'}",
            f"- **Email:** {draft.get('contact_email', '—')}",
            f"- **Phone:** +{draft.get('contact_phone_country_code', '')} {draft.get('contact_phone_number', '—')}",
            f"- **Flight option:** #{offer}" if offer else "- **Flight:** verified offer",
            f"- **Fare:** {price_line}",
            "",
            "Reply **YES** or **CONFIRM** to proceed with prebook, or tell me what to change.",
        ]
    )
    return "\n".join(lines)


def payment_summary_prompt(session: SessionContext) -> str:
    """Ask the user to confirm payment before completing the booking."""
    prebook = session.last_prebook or {}
    price = prebook.get("price")
    currency = prebook.get("currency") or "INR"
    price_line = f"**{currency} {price}**" if price else "the prebooked amount"

    return (
        f"Prebook is ready. Total to pay: {price_line}.\n\n"
        "Reply **YES** or **CONFIRM** to complete payment and issue your ticket, "
        "or say **cancel** to stop."
    )
