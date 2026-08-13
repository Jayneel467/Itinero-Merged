"""LLM capability router for Vero — thinking-first, hard locks only when needed.

Hard locks (must stay rule-based):
  - Mid-booking payment / prebook sticky
  - Companion safety (handled in general_agent)
  - Auth / money APIs (not chat routing)

Everything else prefers a small LLM classify call; regex is fallback only.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Literal

log = logging.getLogger("itinero.intent_router")

Capability = Literal[
    "flights",
    "itinerary",
    "research",
    "payment",
    "supervisor",
]

_VALID = {"flights", "itinerary", "research", "payment", "supervisor"}

# Map legacy specialist names → capabilities Vero can actually serve live
_LEGACY_TO_CAP = {
    "visa": "research",
    "sports": "research",
    "hotels": "research",
    "train": "research",
    "bus": "research",
}

_ROUTER_PROMPT = """You route one traveler message to a Vero capability.
Return JSON only: {{"capability":"...","confidence":0.0,"reason":"short"}}

Capabilities:
- flights — search/book/pay flights, dates, cabin, passengers, route X to Y for flying
- itinerary — multi-day trip plan, vacation outline, day-by-day (not a single flight search)
- research — food, weather, places, hotels stay search, trains, buses, visa, events, facts, culture
- payment — ONLY when they are confirming/paying an existing hold (yes pay, pay now)
- supervisor — greetings, thanks, vague hi with no travel ask

Rules:
- Prefer research over itinerary for "where to eat / weather / visa / train / bus / hotel stay".
- Prefer flights when they name a city pair WITH fly/flight OR a clear depart date for a route.
- Prefer itinerary for "plan a trip", "N-day", "itinerary", vacation planning without a ticket ask.
- Never invent capabilities. If unsure between research and itinerary, pick research.
- confidence 0-1.

User message:
{message}

Session hints (may be empty):
{hints}
"""


def _env_flag(name: str, default: str = "1") -> bool:
    return (os.getenv(name) or default).strip().lower() not in ("0", "false", "off", "no")


def llm_router_enabled() -> bool:
    return _env_flag("VERO_LLM_ROUTER", "1")


def hard_lock_capability(message: str, session: dict[str, Any]) -> Capability | None:
    """Non-negotiable sticky locks — money path must not be re-routed by LLM."""
    text = (message or "").strip()
    ctx = session.get("flight_context") or {}

    if ctx.get("awaiting_payment_confirmation") or ctx.get("payment_ready"):
        if len(text.split()) <= 12:
            return "payment"

    deep = any(
        ctx.get(k)
        for k in (
            "prebook_id",
            "booking_id",
            "verified_offer_id",
            "selected_offer_id",
            "awaiting_booking_confirmation",
            "awaiting_payment_confirmation",
        )
    )
    if deep and (
        len(text.split()) <= 4
        or re.search(r"\b(yes|ok|okay|confirm|pay|book|hold|proceed)\b", text, re.I)
    ):
        if ctx.get("awaiting_payment_confirmation") or ctx.get("payment_ready"):
            return "payment"
        return "flights"

    # Narrow sticky trip: only while collecting a pending slot AND last ask matches
    pending = session.get("pending_trip_slot")
    if pending in {"destination", "dates", "travelers"}:
        from supervisor.architecture import resolve_place_reply

        if pending == "destination" and resolve_place_reply(text):
            return "itinerary"
        if pending in {"dates", "travelers"} and len(text.split()) <= 8:
            if not re.search(
                r"\b(flight|fly|book|hotel|visa|weather|train|bus|eat|food)\b", text, re.I
            ):
                return "itinerary"

    return None


def _session_hints(session: dict[str, Any]) -> str:
    bits = []
    if session.get("pending_trip_slot"):
        bits.append(f"pending_trip_slot={session.get('pending_trip_slot')}")
    if session.get("active_specialist"):
        bits.append(f"last_specialist={session.get('active_specialist')}")
    ctx = session.get("flight_context") or {}
    if ctx.get("prebook_id"):
        bits.append("has_prebook")
    if ctx.get("last_search_results"):
        bits.append("has_flight_results")
    if session.get("dietary_preference"):
        bits.append(f"diet={session.get('dietary_preference')}")
    hist = session.get("history") or []
    if hist:
        last_a = next((h for h in reversed(hist) if h.get("role") == "assistant"), None)
        if last_a:
            bits.append(f"last_assistant={(last_a.get('content') or '')[:120]}")
    return "; ".join(bits) or "(none)"


def _call_llm_router(message: str, session: dict[str, Any]) -> dict[str, Any] | None:
    if not (os.getenv("OPENAI_API_KEY") or "").strip():
        return None
    try:
        from openai import OpenAI

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = (os.getenv("VERO_ROUTER_MODEL") or os.getenv("ITINERO_MODEL") or "gpt-4o-mini").strip()
        prompt = _ROUTER_PROMPT.format(message=message.strip()[:800], hints=_session_hints(session)[:500])
        resp = client.chat.completions.create(
            model=model,
            temperature=0,
            max_tokens=80,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a JSON capability router for a travel agent."},
                {"role": "user", "content": prompt},
            ],
            timeout=8.0,
        )
        raw = (resp.choices[0].message.content or "").strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        cap = str(data.get("capability") or "").strip().lower()
        if cap in _LEGACY_TO_CAP:
            cap = _LEGACY_TO_CAP[cap]
        if cap not in _VALID:
            return None
        conf = float(data.get("confidence") or 0)
        return {"capability": cap, "confidence": conf, "reason": str(data.get("reason") or "")[:120]}
    except Exception as exc:  # noqa: BLE001
        log.debug("LLM router failed: %s", exc)
        return None


def heuristic_capability(message: str, session: dict[str, Any]) -> Capability:
    """Slim fallback when LLM router is off or fails — not the primary brain."""
    text = (message or "").strip()
    lower = text.lower()

    if lower in {"hi", "hello", "hey", "hii", "thanks", "thank you", "thx"}:
        return "supervisor"

    if re.search(r"\b(plan\s+(a|my|our)\s+trip|itinerary|\d+\s*-?\s*day\s+(trip|plan)|vacation)\b", text, re.I):
        session["trip_flow"] = True
        if not session.get("pending_trip_slot"):
            session["pending_trip_slot"] = "destination"
        return "itinerary"

    if re.search(
        r"\b(flight|flights|fly|airfare|depart|one[\s-]?way|round[\s-]?trip)\b", text, re.I
    ) or (
        re.search(r"\bto\b", text, re.I)
        and re.search(r"\b(20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2})\b", text, re.I)
        and not re.search(r"\b(trip|plan|itinerary|hotel|eat|food|visa|train|bus)\b", text, re.I)
    ):
        return "flights"

    # Default open-ended travel asks → research (Vero tools), not stubs
    if len(text.split()) >= 2 or "?" in text:
        return "research"
    return "supervisor"


def route_capability(message: str, session: dict[str, Any]) -> Capability:
    """Primary entry: hard lock → LLM router → heuristic fallback."""
    locked = hard_lock_capability(message, session)
    if locked:
        session["route_reason"] = f"hard_lock:{locked}"
        return locked

    if llm_router_enabled():
        judged = _call_llm_router(message, session)
        if judged and float(judged.get("confidence") or 0) >= 0.45:
            cap = judged["capability"]
            session["route_reason"] = f"llm:{cap}:{judged.get('confidence')}:{judged.get('reason')}"
            if cap == "itinerary":
                session["trip_flow"] = True
                if not session.get("pending_trip_slot"):
                    session["pending_trip_slot"] = "destination"
            return cap  # type: ignore[return-value]
        if judged:
            session["route_reason"] = f"llm_low_conf:{judged}"

    cap = heuristic_capability(message, session)
    session["route_reason"] = f"heuristic:{cap}"
    return cap
