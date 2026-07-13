"""LLM intent detector — routes general chat vs flight booking (no regex rules)."""

from __future__ import annotations

from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext

logger = get_logger(__name__)

RouteKind = Literal["general_chat", "flight_booking", "manage_booking"]


class IntentDecision(BaseModel):
    """Structured intent from the LLM."""

    route: RouteKind = Field(
        description=(
            "general_chat = off-topic / greetings only with no flight context; "
            "flight_booking = search, pick, passengers, traveler details, book, pay, seats; "
            "manage_booking = retrieve, list, cancel, status of an existing booking"
        )
    )
    reason: str = Field(default="", description="Short reason for the route choice")


_INTENT_SYSTEM = """You classify messages for a FLIGHT booking assistant (after General Agent handoff).

Routes:
- general_chat: ONLY pure greetings with no trip context
- flight_booking: search, pick options, passengers, traveler details, seats, baggage,
  yes/confirm/pay, fare questions, airline questions, show/find flights
- manage_booking: retrieve, list, cancel, status / PNR of an existing booking

Critical:
- Prefer flight_booking whenever the user mentions cities, dates, options, fares, or booking.
- If Session shows active booking (search results, verified, prebook, awaiting yes/pay),
  short replies like "yes", "2", "ok", "skip", emails, phones, names → flight_booking
- If Session has booking_id or awaiting cancel → manage_booking for cancel/retrieve/status
- When unsure → flight_booking (tools will call live flight data)
"""


def _session_hint(session: SessionContext) -> str:
    return (
        f"has_search_results={bool(session.last_search_results)} "
        f"selected_offer={session.selected_offer_index} "
        f"verified={bool(session.verified_offer_id)} "
        f"prebook={bool(session.prebook_id)} "
        f"booking_id={session.booking_id or False} "
        f"awaiting_book_yes={session.awaiting_booking_confirmation} "
        f"awaiting_pay_yes={session.awaiting_payment_confirmation} "
        f"awaiting_cancel_yes={session.awaiting_cancel_confirmation}"
    )


async def classify_intent(
    llm,
    *,
    user_message: str,
    session: SessionContext,
) -> IntentDecision:
    """Inside Flight Agent: booking work stays on flight_booking / manage_booking tools."""
    text = (user_message or "").strip()

    # Post-book / cancel → manage tools (still Flight Agent + LiteAPI)
    if session.awaiting_cancel_confirmation or (
        session.booking_id
        and any(k in text.lower() for k in ("cancel", "retrieve", "status", "pnr", "list", "my booking"))
    ):
        return IntentDecision(route="manage_booking", reason="session_manage")

    # Any active flight booking progress → flight_booking tools only
    if (
        session.last_search_results
        or session.verified_offer_id
        or session.prebook_id
        or session.awaiting_booking_confirmation
        or session.awaiting_payment_confirmation
        or session.awaiting_service_preference
        or session.selected_offer_index is not None
        or session.travelers_draft
        or session.passengers_confirmed
        or session.search_context
        or session.booking_id
    ):
        return IntentDecision(route="flight_booking", reason="session_active_booking")

    # Pure greeting only → short chat; everything else → booking tools
    if text.lower() in {"hi", "hello", "hey", "hii", "thanks", "thank you"}:
        return IntentDecision(route="general_chat", reason="greeting")

    try:
        structured = llm.with_structured_output(IntentDecision)
        result = await structured.ainvoke(
            [
                SystemMessage(
                    content=_INTENT_SYSTEM + f"\n\nSession: {_session_hint(session)}"
                ),
                HumanMessage(content=user_message),
            ]
        )
        decision = (
            result
            if isinstance(result, IntentDecision)
            else IntentDecision.model_validate(result)
        )
        # Never leave booking-ish messages on general_chat
        if decision.route == "general_chat":
            return IntentDecision(route="flight_booking", reason="force_flight_booking")
        logger.info("intent_classified", route=decision.route, reason=decision.reason)
        return decision
    except Exception as exc:
        logger.warning("intent_classify_failed", error=str(exc))
        return IntentDecision(route="flight_booking", reason="fallback")
