"""Hotel Agent — stay specialist under Itinerary Agent.

Conversational only in this package (no frontend/backend API changes).
Collects city + dates; live LiteAPI hotel search stays on Manual booking / supervisor.
"""

from __future__ import annotations

import re

from flight_agent.logging_config import get_logger
from flight_agent.models.agent import SessionContext
from flight_agent.models.intents import FlightIntent

from itinero.models import OrchestratorOutput

logger = get_logger(__name__)

_CITY = re.compile(
    r"\b(?:in|at|near|for)\s+([A-Za-z][A-Za-z\s]{1,24}?)"
    r"(?:\s+(?:hotel|hotels|resort|stay|from|on|check))?|"
    r"\bhotels?\s+(?:in|at|near)\s+([A-Za-z][A-Za-z\s]{1,24})\b|"
    r"\bstay\s+(?:in|at)\s+([A-Za-z][A-Za-z\s]{1,24})\b",
    re.I,
)
_DATE = re.compile(
    r"\b(\d{1,2})\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"(?:\s*,?\s*(\d{4}))?\b"
    r"|\b(\d{4})-(\d{2})-(\d{2})\b",
    re.I,
)


def _hotel_ctx(session: SessionContext) -> dict:
    raw = getattr(session, "hotel_context", None)
    if isinstance(raw, dict):
        return dict(raw)
    # Fallback if model not yet updated
    sc = session.search_context or {}
    nested = sc.get("hotel") if isinstance(sc.get("hotel"), dict) else {}
    return dict(nested)


def _save_hotel_ctx(session: SessionContext, data: dict) -> None:
    if hasattr(session, "hotel_context"):
        session.hotel_context = data
    else:
        sc = dict(session.search_context or {})
        sc["hotel"] = data
        session.search_context = sc


def _extract_city(message: str) -> str | None:
    m = _CITY.search(message or "")
    if not m:
        # bare "Goa hotels" / "Mumbai hotel"
        m2 = re.search(
            r"\b([A-Za-z]{3,})\s+hotels?\b|\bhotels?\s+([A-Za-z]{3,})\b",
            message or "",
            re.I,
        )
        if m2:
            return (m2.group(1) or m2.group(2) or "").strip().title() or None
        return None
    city = (m.group(1) or m.group(2) or m.group(3) or "").strip()
    city = re.sub(r"\s+(hotels?|resorts?|stay)$", "", city, flags=re.I).strip()
    if city.lower() in {"a", "the", "my", "our", "some", "any"}:
        return None
    return city.title() if city else None


class HotelAgent:
    """
    Hotel specialist.

    Called by Itinerary Agent (General Agent → Itinerary → Hotel).
    """

    async def aclose(self) -> None:
        return None

    async def run(
        self,
        *,
        message: str,
        session: SessionContext,
        path_prefix: list[str] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> OrchestratorOutput:
        """Handle a hotel / stay request conversationally."""
        path = list(path_prefix or [])
        if "hotel_agent" not in path:
            path.append("hotel_agent")

        ctx = _hotel_ctx(session)
        text = (message or "").strip()
        logger.info("hotel_agent_run", message_preview=text[:60], city=ctx.get("city"))

        city = _extract_city(text) or ctx.get("city")
        if city:
            ctx["city"] = city

        dates = [m.group(0) for m in _DATE.finditer(text)]
        if dates:
            if not ctx.get("check_in"):
                ctx["check_in"] = dates[0]
            if len(dates) >= 2 and not ctx.get("check_out"):
                ctx["check_out"] = dates[1]
            elif len(dates) == 1 and ctx.get("check_in") and not ctx.get("check_out"):
                # second turn may only send checkout
                if dates[0] != ctx.get("check_in"):
                    ctx["check_out"] = dates[0]

        _save_hotel_ctx(session, ctx)

        if not ctx.get("city"):
            reply = (
                "I can help with **hotels**.\n\n"
                "Which **city** are you staying in?\n\n"
                "Example: *hotels in Goa* or *stay in Mumbai*"
            )
        elif not ctx.get("check_in"):
            reply = (
                f"Got it — hotels in **{ctx['city']}**.\n\n"
                "What are your **check-in** and **check-out** dates?\n\n"
                "Example: *12 August to 15 August*"
            )
        elif not ctx.get("check_out"):
            reply = (
                f"**{ctx['city']}** · check-in **{ctx['check_in']}**.\n\n"
                "And your **check-out** date?"
            )
        else:
            reply = (
                f"Hotel stay noted:\n\n"
                f"- **City:** {ctx['city']}\n"
                f"- **Check-in:** {ctx['check_in']}\n"
                f"- **Check-out:** {ctx['check_out']}\n\n"
                "Live hotel rates in this chat specialist are still connected through "
                "**Manual booking** on the site (same LiteAPI inventory).\n\n"
                "I can also book **flights** here — e.g. *Mumbai to Delhi on 26 July* — "
                "or continue your **trip plan**."
            )

        return OrchestratorOutput(
            response=reply,
            intent=FlightIntent.GENERAL,
            session_context=session,
            route_path=path,
            routed_to="hotel_agent",
            operation_result={"hotel_context": ctx},
        )
