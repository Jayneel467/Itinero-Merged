#!/usr/bin/env python3
"""Streamlit UI — architecture entry: Start → General Agent → Flight path."""

from __future__ import annotations

import asyncio
import sys
from typing import Any

import streamlit as st

from flight_agent import SessionContext
from flight_agent.config import get_settings
from flight_agent.llm.user_copy import contextual_fallback_prompt, sanitize_assistant_text
from flight_agent.logging_config import configure_logging
from flight_agent.models.intents import FlightIntent
from itinero import GeneralAgent, OrchestratorInput

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


_PATH_LABELS = {
    "start": "Start",
    "general_agent": "General Agent",
    "itinerary_planner": "Itinerary Planner",
    "travel_agent": "Travel Agent",
    "flight_booking": "Flight Booking",
    "hotel_agent": "Hotel Agent",
    "train_booking": "Train Booking",
    "bus_booking": "Bus Booking",
    "payment": "Payment",
}


def _format_path(path: list[str]) -> str:
    labels = [_PATH_LABELS.get(p, p) for p in path]
    return " → ".join(labels) if labels else "—"


def _run_orchestrator(message: str, session: SessionContext, history: list[dict[str, str]]) -> Any:
    agent: GeneralAgent = st.session_state.agent
    loop = st.session_state.event_loop
    return loop.run_until_complete(
        agent.run(
            OrchestratorInput(message=message, session_context=session, history=history)
        )
    )


def _append_turn(role: str, content: str, intent: str | None = None, route: str | None = None) -> None:
    turn: dict[str, Any] = {"role": role, "content": content}
    if intent:
        turn["intent"] = intent
    if route:
        turn["route"] = route
    st.session_state.turns.append(turn)


def _handle_agent_message(prompt: str) -> None:
    history = [{"role": t["role"], "content": t["content"]} for t in st.session_state.turns]
    _append_turn("user", prompt)

    try:
        with st.spinner("Routing via General Agent…"):
            result = _run_orchestrator(prompt, st.session_state.session_context, history)
        st.session_state.session_context = result.session_context
        st.session_state.last_route_path = result.route_path
        st.session_state.last_routed_to = result.routed_to
        st.session_state.booking_ready = result.booking_ready
        st.session_state.payment_ready = result.payment_ready
        content = sanitize_assistant_text(
            result.response or contextual_fallback_prompt(result.session_context),
            result.session_context,
        )
        intent = getattr(result.intent, "value", None) or FlightIntent.GENERAL.value
        route = _format_path(result.route_path)
    except Exception:
        content = contextual_fallback_prompt(st.session_state.session_context)
        intent = FlightIntent.GENERAL.value
        route = None

    _append_turn("assistant", content, intent, route)


def _init() -> None:
    configure_logging()
    if "event_loop" not in st.session_state:
        st.session_state.event_loop = asyncio.new_event_loop()
        asyncio.set_event_loop(st.session_state.event_loop)
    get_settings.cache_clear()
    settings = get_settings()
    fingerprint = (
        f"ga:{settings.openai_model}:{settings.openai_api_key[:8]}"
    )
    if st.session_state.get("settings_fingerprint") != fingerprint:
        st.session_state.agent = GeneralAgent()
        st.session_state.settings_fingerprint = fingerprint
    st.session_state.setdefault("session_context", SessionContext())
    st.session_state.setdefault("turns", [])
    st.session_state.setdefault("last_route_path", [])
    st.session_state.setdefault("last_routed_to", "general_agent")
    st.session_state.setdefault("booking_ready", False)
    st.session_state.setdefault("payment_ready", False)


def main() -> None:
    st.set_page_config(page_title="Itinero", page_icon="✈️", layout="centered")
    _init()

    st.title("Itinero")
    st.caption("General Agent → Itinerary → Travel → Flight Booking")

    st.sidebar.markdown("### Architecture path")
    st.sidebar.code(_format_path(st.session_state.last_route_path) or "Start → General Agent", language=None)
    st.sidebar.caption(f"Routed to: **{st.session_state.last_routed_to}**")
    if st.session_state.booking_ready:
        st.sidebar.success("Booking path active")
    if st.session_state.payment_ready:
        st.sidebar.info("Hold ready — payment at checkout")
    st.sidebar.caption("Payment / ticketing: backend checkout (not this agent)")

    if st.sidebar.button("Start over"):
        st.session_state.turns = []
        st.session_state.session_context = SessionContext()
        st.session_state.last_route_path = []
        st.session_state.last_routed_to = "general_agent"
        st.session_state.booking_ready = False
        st.session_state.payment_ready = False
        st.rerun()

    if not st.session_state.turns:
        st.markdown(
            "Ask the **General Agent** anything travel-related. "
            "Flight search/booking is fully connected:\n\n"
            "`Start → General Agent → Itinerary Planner → Travel Agent → Flight Booking`\n\n"
            "Example: **Mumbai to Delhi on 26 July**"
        )

    for turn in st.session_state.turns:
        with st.chat_message(turn["role"]):
            st.markdown(turn["content"])
            if turn["role"] == "assistant" and turn.get("route"):
                st.caption(f"Path: {turn['route']}")

    prompt = st.chat_input("Ask General Agent (flights, trip help…)")
    if not prompt:
        return

    _handle_agent_message(prompt)
    st.rerun()


if __name__ == "__main__":
    main()
