"""Deterministic booking steps so LiteAPI flow continues when the LLM only chats."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from flight_agent.llm.tools import build_flight_tools
from flight_agent.llm.user_copy import passengers_question_prompt
from flight_agent.logging_config import get_logger
from flight_agent.models.agent import FlightAgentOutput, SessionContext
from flight_agent.models.intents import FlightIntent
from flight_agent.services.flight_service import CITY_IATA, FlightService

logger = get_logger(__name__)

_OPTION_RE = re.compile(
    r"(?:^|\b)(?:option|opt|#)\s*([1-9]\d?)\b|^([1-9]\d?)$",
    re.I,
)
_ADULTS_RE = re.compile(r"(\d+)\s*(?:adults?|adt|pax|passengers?|travellers?|travelers?)", re.I)
_CHILDREN_RE = re.compile(r"(\d+)\s*(?:children|child|kids?|chd)", re.I)
_INFANTS_RE = re.compile(r"(\d+)\s*(?:infants?|infant|babies|baby|inf)", re.I)
_SOLO_RE = re.compile(r"\b(?:only\s+me|just\s+me|solo|myself|1\s+person)\b", re.I)
_ROUTE_RE = re.compile(
    r"\b([A-Za-z][A-Za-z\s]{1,20}?)\s+to\s+([A-Za-z][A-Za-z\s]{1,20}?)\b",
    re.I,
)
_DATE_RE = re.compile(
    r"\b(\d{1,2})\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|"
    r"Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
    r"(?:\s*,?\s*(\d{4}))?\b"
    r"|\b(\d{4})-(\d{2})-(\d{2})\b",
    re.I,
)

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def _resolve_city(token: str) -> str | None:
    cleaned = " ".join(token.strip().upper().split())
    if len(cleaned) == 3 and cleaned.isalpha():
        return cleaned
    return CITY_IATA.get(cleaned)


def _parse_date(message: str) -> str | None:
    match = _DATE_RE.search(message)
    if not match:
        return None
    if match.group(4) and match.group(5) and match.group(6):
        return f"{match.group(4)}-{match.group(5)}-{match.group(6)}"
    day = int(match.group(1))
    month = _MONTHS.get(match.group(2).lower()[:3], _MONTHS.get(match.group(2).lower()))
    if not month:
        return None
    year = int(match.group(3)) if match.group(3) else datetime.utcnow().year
    # If month/day already passed this year, prefer next year for booking demos
    today = datetime.utcnow().date()
    try:
        dt = datetime(year, month, day).date()
    except ValueError:
        return None
    if not match.group(3) and dt < today:
        dt = datetime(year + 1, month, day).date()
    return dt.isoformat()


def parse_search_trip(message: str) -> dict[str, str] | None:
    route = _ROUTE_RE.search(message)
    date = _parse_date(message)
    if not route or not date:
        return None
    origin = _resolve_city(route.group(1))
    dest = _resolve_city(route.group(2))
    if not origin or not dest or origin == dest:
        return None
    return {"origin": origin, "destination": dest, "departure_date": date}


def parse_option_index(message: str, max_options: int) -> int | None:
    text = message.strip()
    if not text or max_options < 1:
        return None
    match = _OPTION_RE.search(text)
    if not match:
        return None
    raw = match.group(1) or match.group(2)
    try:
        idx = int(raw)
    except ValueError:
        return None
    if 1 <= idx <= max_options:
        return idx
    return None


def parse_passenger_counts(message: str) -> dict[str, int] | None:
    text = message.strip()
    if not text:
        return None
    if _SOLO_RE.search(text):
        return {"adults": 1, "children": 0, "infants": 0}

    adults = children = infants = None
    if m := _ADULTS_RE.search(text):
        adults = int(m.group(1))
    if m := _CHILDREN_RE.search(text):
        children = int(m.group(1))
    if m := _INFANTS_RE.search(text):
        infants = int(m.group(1))

    if adults is None and children is None and infants is None:
        if re.fullmatch(r"[1-9]\d?", text):
            adults = int(text)
        else:
            return None

    return {
        "adults": max(1, adults if adults is not None else 1),
        "children": max(0, children if children is not None else 0),
        "infants": max(0, infants if infants is not None else 0),
    }


def _tool_prompt(data: Any, fallback: str) -> str:
    if isinstance(data, dict):
        return str(data.get("user_prompt") or data.get("details_prompt") or fallback)
    return fallback


async def try_booking_progress(
    *,
    flight_service: FlightService,
    session: SessionContext,
    message: str,
) -> FlightAgentOutput | None:
    """
    Keep LiteAPI booking moving:
    search (route+date) → select option → passengers → verify.
    """
    tools = {t.name: t for t in build_flight_tools(flight_service, session)}

    # 0) Auto-search when user gives from/to/date and no results yet
    if not session.last_search_results:
        trip = parse_search_trip(message)
        if trip:
            logger.info("booking_progress_search", **trip)
            raw = await tools["search_flights"].ainvoke(trip)
            data = json.loads(raw) if isinstance(raw, str) else raw
            offers = session.last_search_results or (data or {}).get("offers") or []
            if not offers:
                return FlightAgentOutput(
                    response=_tool_prompt(data, "No flights found. Try another date."),
                    intent=FlightIntent.SEARCH_FLIGHTS,
                    session_context=session,
                    operation_result=data if isinstance(data, dict) else None,
                    needs_follow_up=True,
                )
            # Build a short option list for the user
            lines = [
                f"Here are flights **{trip['origin']} → {trip['destination']}** "
                f"on **{trip['departure_date']}**:",
                "",
            ]
            for offer in offers[:5]:
                idx = offer.get("index")
                segs = offer.get("segments_summary") or []
                airline = "Airline"
                dep = ""
                if segs:
                    airline = segs[0].get("airline") or airline
                    dep = segs[0].get("departure_time") or segs[0].get("depart") or ""
                price = offer.get("total_price")
                currency = offer.get("currency") or "INR"
                stops = offer.get("stops")
                stop_label = "Non-stop" if stops in (0, "0", None) else f"{stops} stop(s)"
                price_bit = f"{currency} {price}" if price is not None else "price on request"
                lines.append(
                    f"**Option {idx}:** {airline} · {dep} · {stop_label} · {price_bit}"
                )
            lines.extend(
                [
                    "",
                    "Reply with **option 1**, **option 2**, … then tell me how many passengers.",
                ]
            )
            return FlightAgentOutput(
                response="\n".join(lines),
                intent=FlightIntent.SEARCH_FLIGHTS,
                session_context=session,
                operation_result=data if isinstance(data, dict) else None,
                needs_follow_up=True,
            )
        return None

    if session.verified_offer_id:
        return None

    offers = session.last_search_results or []
    explicit_option = bool(re.search(r"(?:option|opt|#)\s*[1-9]\d?", message, re.I))
    opt = parse_option_index(message, len(offers))
    if (
        opt is not None
        and session.selected_offer_index is not None
        and not explicit_option
        and parse_passenger_counts(message)
    ):
        opt = None

    if opt is not None:
        session.selected_offer_index = opt
        oid = flight_service.select_offer_from_index(offers, opt)
        if oid:
            session.selected_offer_id = oid
        logger.info("booking_progress_select", option=opt)

        pax = parse_passenger_counts(message)
        if pax and re.search(r"adult|passenger|traveller|traveler|solo|only me", message, re.I):
            await tools["set_booking_passengers"].ainvoke(pax)
            raw_v = await tools["verify_flight_offer"].ainvoke({"offer_index": opt})
            data_v = json.loads(raw_v) if isinstance(raw_v, str) else raw_v
            return FlightAgentOutput(
                response=_tool_prompt(data_v, "Fare confirmed. Please share traveler details."),
                intent=FlightIntent.VERIFY_OFFER,
                session_context=session,
                operation_result=data_v if isinstance(data_v, dict) else None,
                needs_follow_up=True,
            )

        if not session.passengers_confirmed:
            return FlightAgentOutput(
                response=passengers_question_prompt(session),
                intent=FlightIntent.SEARCH_FLIGHTS,
                session_context=session,
                needs_follow_up=True,
            )

        raw_v = await tools["verify_flight_offer"].ainvoke({"offer_index": opt})
        data_v = json.loads(raw_v) if isinstance(raw_v, str) else raw_v
        return FlightAgentOutput(
            response=_tool_prompt(data_v, "Fare confirmed. Please share traveler details."),
            intent=FlightIntent.VERIFY_OFFER,
            session_context=session,
            operation_result=data_v if isinstance(data_v, dict) else None,
            needs_follow_up=True,
        )

    if session.selected_offer_index and not session.passengers_confirmed:
        pax = parse_passenger_counts(message)
        if not pax:
            return None
        logger.info("booking_progress_passengers", **pax)
        await tools["set_booking_passengers"].ainvoke(pax)
        raw_v = await tools["verify_flight_offer"].ainvoke(
            {"offer_index": session.selected_offer_index}
        )
        data_v = json.loads(raw_v) if isinstance(raw_v, str) else raw_v
        return FlightAgentOutput(
            response=_tool_prompt(data_v, "Fare confirmed. Please share traveler details."),
            intent=FlightIntent.VERIFY_OFFER,
            session_context=session,
            operation_result=data_v if isinstance(data_v, dict) else None,
            needs_follow_up=True,
        )

    return None
