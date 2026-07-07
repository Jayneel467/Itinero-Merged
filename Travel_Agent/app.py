#!/usr/bin/env python3
"""Streamlit UI — friendly flight booking assistant."""

from __future__ import annotations

import asyncio
import sys
from typing import Any

import streamlit as st

from flight_agent import FlightAgent, FlightAgentInput, SessionContext
from flight_agent.config import get_settings
from flight_agent.llm.user_copy import (
    clarification_prompt,
    id_document_label,
    next_step_hint,
    sanitize_assistant_text,
    step_status,
)
from flight_agent.logging_config import configure_logging
from flight_agent.models.intents import FlightIntent

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

QUICK_PROMPTS = [
    "Mumbai to Delhi on 8 July 2026",
    "Show cheapest economy flights",
    "Verify option 1",
    "YES",
]


def _run_agent(
    message: str,
    session: SessionContext,
    history: list[dict[str, str]],
) -> Any:
    agent: FlightAgent = st.session_state.agent
    loop = st.session_state.event_loop
    return loop.run_until_complete(
        agent.run(
            FlightAgentInput(
                message=message,
                session_context=session,
                history=history,
            )
        )
    )


def _warm_liteapi() -> None:
    """Pre-open HTTP connection so first search is faster."""
    if st.session_state.get("liteapi_warmed"):
        return
    agent: FlightAgent = st.session_state.agent
    loop = st.session_state.event_loop
    try:
        loop.run_until_complete(agent.warm_up())
        st.session_state.liteapi_warmed = True
    except Exception:
        st.session_state.liteapi_warmed = True


def _settings_fingerprint() -> str:
    get_settings.cache_clear()
    s = get_settings()
    return (
        f"{s.primary_llm_provider}:{s.llm_fallback}:{s.groq_model}:"
        f"{s.groq_fallback_model}:{s.openai_model}:{s.default_currency}:{s.openai_api_key[:8]}"
    )


def _init_session_state() -> None:
    configure_logging()
    if "event_loop" not in st.session_state:
        st.session_state.event_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(st.session_state.event_loop)

    fingerprint = _settings_fingerprint()
    if st.session_state.get("settings_fingerprint") != fingerprint:
        st.session_state.agent = FlightAgent()
        st.session_state.settings_fingerprint = fingerprint
        st.session_state.liteapi_warmed = False
        st.session_state.initialized = True
    elif "initialized" not in st.session_state:
        st.session_state.agent = FlightAgent()
        st.session_state.liteapi_warmed = False
        st.session_state.initialized = True

    st.session_state.setdefault("session_context", SessionContext())
    st.session_state.setdefault("turns", [])
    _warm_liteapi()


def _format_price(amount: Any, currency: str | None = None) -> str:
    cur = (currency or get_settings().default_currency or "INR").upper()
    if amount is None:
        return "—"
    try:
        value = float(amount)
    except (TypeError, ValueError):
        return str(amount)
    if cur == "INR":
        return f"₹{value:,.0f}"
    return f"{cur} {value:,.2f}"


def _offer_rows(offers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for offer in offers[:8]:
        segs = offer.get("segments_summary") or [{}]
        first = segs[0] if segs else {}
        currency = offer.get("currency") or get_settings().default_currency
        rows.append(
            {
                "Option": offer.get("index"),
                "Airline": first.get("airline") or "—",
                "From": first.get("from") or "—",
                "To": first.get("to") or "—",
                "Departs": (first.get("departure") or "—")[:16],
                "Price": _format_price(offer.get("total_price"), currency),
                "Stops": offer.get("stops"),
            }
        )
    return rows


def _friendly_error(exc: Exception) -> str:
    return clarification_prompt()


def _render_flight_results(operation: dict[str, Any] | None, session: SessionContext) -> None:
    offers = []
    if operation and operation.get("offers"):
        offers = operation["offers"]
    elif session.last_search_results:
        offers = session.last_search_results
    if not offers:
        return
    rows = _offer_rows(offers)
    if rows:
        st.markdown("##### ✈️ Flights found")
        st.dataframe(rows, use_container_width=True, hide_index=True)
        st.caption("Reply with **option 1**, **option 2**, etc. to check price & availability.")


def _render_verified_flight(operation: dict[str, Any] | None, session: SessionContext) -> None:
    data = operation or session.last_verified_offer
    if not data or data.get("verified") is False:
        if data and data.get("verified") is False:
            st.warning("That flight is no longer available. Try another option.")
        return
    pricing = data.get("pricing") or {}
    price = pricing.get("total")
    currency = pricing.get("currency")
    idx = session.selected_offer_index
    st.success(
        f"Option **{idx}** is available · **{_format_price(price, currency)}** — "
        "share your traveler details when ready."
    )


def _render_booking_confirmed(operation: dict[str, Any] | None, session: SessionContext) -> None:
    data = operation or session.last_booking
    if not data and not session.booking_id:
        return
    pnr = (data or {}).get("airline_pnr") or (data or {}).get("booking_ref")
    status = (data or {}).get("status") or "Confirmed"
    st.balloons()
    st.success(f"**Booking confirmed!** Status: {status}")
    if pnr:
        st.markdown(f"Your airline reference (PNR): **{pnr}**")
    st.caption("Check your email for the full itinerary.")


def _render_extras(operation: dict[str, Any] | None) -> None:
    if not operation or not operation.get("groups"):
        return
    st.markdown("##### 🧳 Optional add-ons")
    for group in operation.get("groups") or []:
        gtype = str(group.get("type") or "Extra").replace("_", " ").title()
        st.markdown(f"**{gtype}**")
        for opt in group.get("options") or []:
            price = _format_price(opt.get("price"), opt.get("currency"))
            name = opt.get("name") or "Option"
            st.markdown(f"- {name} — **{price}**")
    st.caption("Say what you'd like, or type **skip** to continue without add-ons.")


def _render_assistant_turn(turn: dict[str, Any]) -> None:
    session: SessionContext = turn.get("session") or SessionContext()
    operation = turn.get("operation_result")
    intent = turn.get("intent", FlightIntent.GENERAL.value)
    content = sanitize_assistant_text(turn.get("content") or "")

    if content:
        st.markdown(content)

    if intent == FlightIntent.SEARCH_FLIGHTS.value:
        _render_flight_results(operation, session)
    elif intent == FlightIntent.VERIFY_OFFER.value:
        _render_verified_flight(operation, session)
    elif intent in {FlightIntent.PREBOOK.value, FlightIntent.ATTACH_SERVICES.value}:
        _render_extras(operation)
    elif intent == FlightIntent.COMPLETE_BOOKING.value:
        _render_booking_confirmed(operation, session)

    if turn.get("error"):
        st.warning(sanitize_assistant_text(str(turn["error"])))


def _render_sidebar() -> None:
    ctx: SessionContext = st.session_state.session_context
    with st.sidebar:
        st.header("✈️ Flight Agent")
        st.caption("I help you **search, choose & book flights** — nothing else.")

        st.markdown("##### Your progress")
        for label, done in step_status(ctx):
            st.markdown(f"{'✅' if done else '○'} {label}")

        st.divider()
        st.markdown("##### 👉 Next step")
        st.info(next_step_hint(ctx))

        if ctx.booking_requirements:
            st.caption(f"ID needed: **{id_document_label(ctx)}**")

        if ctx.selected_offer_index:
            st.caption(f"Selected: **Option {ctx.selected_offer_index}**")

        st.divider()
        st.markdown("##### Quick messages")
        for text in QUICK_PROMPTS:
            if st.button(text, use_container_width=True, key=f"quick_{text}"):
                st.session_state.pending_prompt = text
                st.rerun()

        st.divider()
        if st.button("🔄 Start over", use_container_width=True):
            st.session_state.turns = []
            st.session_state.session_context = SessionContext()
            st.rerun()


def _render_welcome() -> None:
    st.markdown(
        """
        **Welcome!** I'm your flight booking assistant.

        1. **Tell me your trip** — *Mumbai to Delhi on 8 July*
        2. **Pick a flight** — *option 1*
        3. **How many passengers?** — adults, children, infants
        4. **Share your details** — I'll tell you exactly what's needed
        5. **Any extras?** — seat, baggage, or skip
        6. **Confirm** — reply *YES* to book
        """
    )
    st.caption("Domestic India flights need Aadhaar/govt ID — not passport.")


def main() -> None:
    st.set_page_config(
        page_title="Flight Agent",
        page_icon="✈️",
        layout="wide",
        initial_sidebar_state="expanded",
    )
    _init_session_state()
    _render_sidebar()

    st.title("✈️ Flight Agent")
    st.caption("Search · compare · book — flights only")

    if not st.session_state.turns:
        _render_welcome()

    for turn in st.session_state.turns:
        with st.chat_message(turn["role"]):
            if turn["role"] == "user":
                st.markdown(turn["content"])
            else:
                _render_assistant_turn(turn)

    pending = st.session_state.pop("pending_prompt", None)
    prompt = pending or st.chat_input("Where would you like to fly? e.g. Mumbai to Delhi on 8 July")

    if prompt:
        history = [{"role": t["role"], "content": t["content"]} for t in st.session_state.turns]
        st.session_state.turns.append({"role": "user", "content": prompt})

        try:
            with st.spinner("Finding the best options for you…"):
                result = _run_agent(prompt, st.session_state.session_context, history)
            st.session_state.session_context = result.session_context
            st.session_state.turns.append(
                {
                    "role": "assistant",
                    "content": sanitize_assistant_text(result.response or "How can I help with your flight?"),
                    "intent": result.intent.value,
                    "operation_result": result.operation_result,
                    "error": result.error,
                    "session": result.session_context,
                }
            )
        except Exception as exc:
            st.session_state.turns.append(
                {
                    "role": "assistant",
                    "content": _friendly_error(exc),
                    "intent": FlightIntent.GENERAL.value,
                    "operation_result": None,
                    "error": None,
                    "session": st.session_state.session_context,
                }
            )

        st.rerun()


if __name__ == "__main__":
    main()
