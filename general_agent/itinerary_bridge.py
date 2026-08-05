"""
Itinerary Bridge
================
Connects the general agent (Vero) to the ITINERARY_AGENT specialist.

Responsibilities:
  1. Add the ITINERARY_AGENT package to sys.path so its imports resolve.
  2. Parse the task_description string from the escalate_to_itinerary signal.
  3. Map Vero's trip_context + message history → ITINERARY_AGENT's AppState —
     for a single-destination trip, or for EACH leg of a multi_destination trip.
  4. Drive ITINERARY_AGENT's own LangGraph node functions one turn at a time
     (never the blocking console loop from ai_travel_planner.main) so a
     handoff can live inside a single HTTP request/response cycle.
  5. For multi_destination trips, sequentially drive one full single-leg
     session per leg (search → select → prebook → draft → hotels → final),
     then stitch each leg's finished itinerary into one combined reply.
  6. Extract flight/hotel search results into UI "cards" data, matching the
     same [CARDS_DATA]-style contract the old search_flights/search_hotels
     tools produced, so the UI's card-selection component still renders
     during a real booking flow.
  7. Extract the final itinerary summary from the completed state.

Design rules:
  - This is the ONLY file that knows about both packages — all coupling lives here.
  - ITINERARY_AGENT internals are untouched (no changes to main.py, nodes, workflow).
  - General agent nodes/state are untouched by this file (bridge receives and
    returns plain dicts); general_agent/agent.py and graph/nodes.py own the
    trip_context["engine"] / trip_context["itinerary_state"] persistence.
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
from datetime import date, timedelta
from typing import Any

logger = logging.getLogger(__name__)

# ── Resolve ITINERARY_AGENT package path ──────────────────────────────────────
# This file lives at: general_agent/itinerary_bridge.py
# ITINERARY_AGENT lives at: ../ITINERARY_AGENT/
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_THIS_DIR)                       # 37).Itinero/
_ITINERARY_PKG = os.path.join(_PROJECT_ROOT, "ITINERARY_AGENT")  # 37).Itinero/ITINERARY_AGENT/

for _p in [_PROJECT_ROOT, _ITINERARY_PKG]:
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Now we can safely import from both packages
from ai_travel_planner.state.models import (
    AppState,
    CabinClass,
    FlightOption,
    FlightSearchParams,
    TripType,
    WorkflowStage,
    PendingAction,
    UserPreferences,
    MealPlan,
)

from services.card_mapping import flight_cards as _map_flight_cards, hotel_cards as _map_hotel_cards


# ─────────────────────────────────────────────────────────────────────────────
# Task-description parser
#
# escalate_to_itinerary's OWN docstring (llm/tools.py) tells the LLM to send
# task_description as a JSON string matching a specific schema (origin,
# destination, checkin, checkout, travelers{adults,children,infants},
# budget, extra_info{preferences,...}, ...). This parser previously only
# understood an OLDER pipe-separated format ("destination: X | checkin: X |
# ..."), which the current tool doesn't produce — so whenever the LLM
# escalates by packing trip details into task_description JSON without ALSO
# calling update_trip_context first (a valid, documented pattern the tool's
# own schema explicitly supports), parsing silently produced every field as
# empty. Confirmed live: an escalation like that landed in build_app_state_
# from_handoff with origin="" and destination="" — no flight/hotel search
# had anything to search for. Try JSON first (the real current format);
# fall back to the pipe format only if that fails (defensive, in case
# anything ever sends the old shape).
# ─────────────────────────────────────────────────────────────────────────────

def _parse_task_description(task_description: str) -> dict[str, Any]:
    """Parse task_description (JSON per escalate_to_itinerary's schema, with
    a pipe-separated legacy format as fallback) into a structured dict."""
    result: dict[str, Any] = {
        "destination": None,
        "departure": None,
        "checkin": None,
        "checkout": None,
        "trip_type": None,
        "budget": None,
        "adults": 1,
        "children": 0,
        "infants": 0,
        "visa_required": None,
        "accessibility": None,
        "occasion": None,
        "preferences": None,
    }

    if not task_description:
        return result

    try:
        data = json.loads(task_description)
    except (json.JSONDecodeError, TypeError):
        data = None

    if isinstance(data, dict):
        result["destination"] = data.get("destination")
        result["departure"] = data.get("origin")
        result["checkin"] = data.get("checkin")
        result["checkout"] = data.get("checkout")
        result["trip_type"] = data.get("trip_type")
        raw_budget = data.get("budget")
        if raw_budget:
            num = re.sub(r"[^\d.]", "", str(raw_budget).split()[0])
            result["budget"] = float(num) if num else None
        travelers = data.get("travelers") or {}
        if isinstance(travelers, dict):
            result["adults"] = int(travelers.get("adults", 1) or 1)
            result["children"] = int(travelers.get("children", 0) or 0)
            result["infants"] = int(travelers.get("infants", 0) or 0)
        extra = data.get("extra_info") or {}
        if isinstance(extra, dict):
            result["visa_required"] = extra.get("visa_required")
            result["accessibility"] = extra.get("accessibility")
            result["occasion"] = extra.get("occasion")
            result["preferences"] = extra.get("preferences")
        return result

    # Legacy pipe-separated fallback.
    segments = [s.strip() for s in task_description.split("|")]
    for seg in segments:
        if ":" not in seg:
            continue
        key, _, value = seg.partition(":")
        key = key.strip().lower().replace(" ", "_")
        value = value.strip()

        if key == "destination":
            result["destination"] = value
        elif key == "departure":
            result["departure"] = value
        elif key == "checkin":
            result["checkin"] = value
        elif key == "checkout":
            result["checkout"] = value
        elif key == "budget":
            num = re.sub(r"[^\d.]", "", value.split()[0]) if value else ""
            result["budget"] = float(num) if num else None
        elif key == "travelers":
            for field, key_name in [("adults", "adults"), ("children", "children"), ("infants", "infants")]:
                m = re.search(rf"{key_name}\s*:\s*(\d+)", value)
                if m:
                    result[field] = int(m.group(1))
        elif key == "extra_info":
            for field, pattern in [
                ("visa_required", r"visa_required\s*:\s*(\w+)"),
                ("accessibility", r"accessibility\s*:\s*([^,}]+)"),
                ("occasion", r"occasion\s*:\s*([^,}]+)"),
                ("preferences", r"preferences\s*:\s*([^}]+)"),
            ]:
                m = re.search(pattern, value)
                if m:
                    result[field] = m.group(1).strip()

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Markdown normalization — ITINERARY_AGENT's own message formatters produce
# CLI-console-styled text (unicode box-drawing dividers, indented lists,
# emoji headers) meant for a rich-console terminal, not the UI's markdown
# renderer. This converts that text into clean CommonMark so it displays
# properly, without touching ITINERARY_AGENT's formatters themselves.
# ─────────────────────────────────────────────────────────────────────────────

_DIVIDER_RE = re.compile(r"[═─]+")
_ITINERARY_TITLE_RE = re.compile(r"^\U0001F5FA️?\s")  # 🗺️
_CONFIRMATION_BANNER_RE = re.compile(r"^(✅|\U0001F389)\s")  # ✅ or 🎉
_DAY_HEADER_RE = re.compile(r"^Day\s+\d+\s*[—-]")
_NUMBERED_OPTION_RE = re.compile(r"^(\d+)\.\s+(.+)$")
_TIME_ACTIVITY_RE = re.compile(r"^(\d{1,2}:\d{2})\s{2,}(\S.*)$")


def to_markdown(text: str) -> str:
    """Convert ITINERARY_AGENT's CLI-styled reply text into clean markdown."""
    if not text:
        return text

    out: list[str] = []
    for raw_line in text.split("\n"):
        stripped = raw_line.strip()

        if not stripped:
            out.append("")
            continue

        if _DIVIDER_RE.fullmatch(stripped):
            out.append("---")
            continue

        if _ITINERARY_TITLE_RE.match(stripped):
            out.append(f"## {stripped}")
            continue

        if _CONFIRMATION_BANNER_RE.match(stripped):
            out.append(f"**{stripped}**")
            continue

        if _DAY_HEADER_RE.match(stripped):
            out.append(f"### {stripped}")
            continue

        m = _NUMBERED_OPTION_RE.match(stripped)
        if m:
            out.append(f"{m.group(1)}. **{m.group(2)}**")
            continue

        leading = len(raw_line) - len(raw_line.lstrip(" "))
        m = _TIME_ACTIVITY_RE.match(stripped)
        if m and leading >= 2:
            out.append(f"- **{m.group(1)}** {m.group(2)}")
            continue

        if stripped.startswith("\U0001F4A1"):  # 💡 — nests under the preceding bullet
            out.append(f"  - *{stripped[1:].strip()}*")
            continue

        if stripped.startswith("\U0001F4DD"):  # 📝 — standalone day-level note
            out.append(f"*{stripped[1:].strip()}*")
            continue

        if leading >= 2:
            # Same top-level marker as time-activity lines so a day's hotel
            # label / key-value details group into one coherent list.
            out.append(f"- {stripped}")
            continue

        out.append(stripped)

    return "\n".join(out)


def _safe_date(val: Any) -> date | None:
    """Parse ISO date string → date object. Returns None on any failure."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    try:
        return date.fromisoformat(str(val).strip())
    except (ValueError, TypeError):
        return None


def _cabin_class(name: str | None) -> CabinClass:
    cabin_map = {
        "economy": CabinClass.ECONOMY,
        "premium economy": CabinClass.PREMIUM_ECONOMY,
        "business": CabinClass.BUSINESS,
        "first": CabinClass.FIRST,
    }
    return cabin_map.get((name or "economy").lower(), CabinClass.ECONOMY)


def _budget_per_person(raw_budget: Any, adults: int) -> float | None:
    if not raw_budget:
        return None
    num = re.sub(r"[^\d.]", "", str(raw_budget).split()[0])
    return float(num) / max(adults, 1) if num else None


def _resolve_flight_endpoint(place: str) -> str:
    """Resolve a city name to the IATA airport code LiteAPI's real flight
    search actually requires (FlightAgent, untouched, passes this straight
    through with no resolution of its own — a plain city name 400s).
    Falls back to the original string on any failure — never worse than
    before. See services/location_resolver.py."""
    try:
        from services import location_resolver
        return location_resolver.resolve_airport_code(place) or place
    except Exception as e:
        logger.warning("Bridge: airport code resolution failed for '%s': %s", place, e)
        return place


# ─────────────────────────────────────────────────────────────────────────────
# AppState builder — shared by both the single-leg path and each leg of a
# multi_destination trip.
# ─────────────────────────────────────────────────────────────────────────────

def _build_app_state(
    *,
    origin: str,
    destination: str,
    checkin: date | None,
    checkout: date | None,
    adults: int,
    children: int,
    budget_per_person: float | None,
    cabin_class: CabinClass,
    preferences_text: str,
    message_history: list[dict[str, str]],
    trip_type_hint: str | None = None,
) -> AppState:
    # `checkout` is ambiguous on its own — it's the date the HOTEL stay ends,
    # which is set even for a one-way trip with no return flight. Trusting
    # "checkout present -> must be round-trip" (the old heuristic) sends a
    # false return leg to LiteAPI, which comes back as a garbled combined
    # outbound+return "journey" (confirmed live: every result showed
    # "BOM -> BOM" instead of "BOM -> GOI" for a one-way search). Prefer the
    # EXPLICIT trip_type Vero already sends in escalate_to_itinerary's
    # schema when it says "one_way" — only fall back to the checkout-based
    # guess when trip_type wasn't provided at all.
    explicit_one_way = (trip_type_hint or "").lower() == "one_way"
    trip_type = TripType.ONE_WAY if explicit_one_way else (
        TripType.ROUND_TRIP if checkout else TripType.ONE_WAY
    )
    return_date = None if explicit_one_way else checkout

    search_params = FlightSearchParams(
        origin=_resolve_flight_endpoint(origin) if origin else origin,
        destination=_resolve_flight_endpoint(destination) if destination else destination,
        departure_date=checkin,
        return_date=return_date,
        adults=adults,
        children=children,
        cabin_class=cabin_class,
        trip_type=trip_type,
        max_budget_per_person=budget_per_person,
    )

    sightseeing = [
        p.strip() for p in (preferences_text or "").split(",")
        if p.strip() and preferences_text.lower() not in ("none", "n/a", "")
    ]
    preferences = UserPreferences(
        sightseeing_interests=sightseeing,
        meal_preference=MealPlan.BREAKFAST,
    )

    state = AppState()
    state.trip.search_params = search_params
    state.trip.trip_type = trip_type
    state.trip.is_complete = True
    state.preferences = preferences

    # Skip GREETING + REQUIREMENT_COLLECTION — Vero already gathered this.
    state.set_stage(WorkflowStage.FLIGHT_SEARCH_CONFIRMATION)
    state.set_pending_action(PendingAction.SEARCH_FLIGHTS)

    state.conversation.message_history = list(message_history)
    state.conversation.turn_count = len(message_history)

    logger.info(
        "Bridge: built leg AppState — %s → %s | %s → %s | %d adult(s) | budget/person: %s",
        origin, destination, checkin, checkout, adults, budget_per_person,
    )
    return state


def _vero_history_as_messages(general_agent_state: dict[str, Any]) -> list[dict[str, str]]:
    """Copy Vero's conversation so far into ITINERARY_AGENT's own message_history
    shape, for conversational continuity at hand-off."""
    messages = general_agent_state.get("messages", [])
    history: list[dict[str, str]] = []
    for msg in messages:
        role = getattr(msg, "type", None)
        content = getattr(msg, "content", "")
        if role == "human":
            history.append({"role": "user", "content": str(content)})
        elif role == "ai":
            if str(content).strip():
                history.append({"role": "assistant", "content": str(content)})
    return history


def build_app_state_from_handoff(
    general_agent_state: dict[str, Any],
    task_description: str,
) -> AppState:
    """Build an ITINERARY_AGENT AppState for a single-destination trip
    (one_way / round_trip) from Vero's context."""
    parsed = _parse_task_description(task_description)
    trip_ctx = general_agent_state.get("trip_context", {}) or {}

    origin = (
        trip_ctx.get("departure") or trip_ctx.get("origin") or parsed.get("departure") or ""
    )
    destination = trip_ctx.get("destination") or parsed.get("destination") or ""
    checkin = _safe_date(
        trip_ctx.get("checkin") or trip_ctx.get("check_in") or parsed.get("checkin")
    )
    checkout = _safe_date(
        trip_ctx.get("checkout") or trip_ctx.get("check_out") or parsed.get("checkout")
    )
    adults = int(trip_ctx.get("adults", parsed.get("adults", 1)) or 1)
    children = int(trip_ctx.get("children", parsed.get("children", 0)) or 0)
    budget_per_person = _budget_per_person(trip_ctx.get("budget") or parsed.get("budget"), adults)
    cabin_class = _cabin_class(trip_ctx.get("cabin_class"))
    preferences_text = parsed.get("preferences") or trip_ctx.get("preferences") or ""
    trip_type_hint = trip_ctx.get("trip_type") or parsed.get("trip_type")

    state = _build_app_state(
        origin=origin,
        destination=destination,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        children=children,
        budget_per_person=budget_per_person,
        cabin_class=cabin_class,
        preferences_text=preferences_text,
        message_history=_vero_history_as_messages(general_agent_state),
        trip_type_hint=trip_type_hint,
    )
    _apply_preselected_flight(state, trip_ctx)
    return state


def _apply_preselected_flight(state: AppState, trip_ctx: dict[str, Any]) -> None:
    """
    If the user already picked a specific flight via Vero's quick search
    (select_searched_flight — see llm/tools.py) BEFORE escalating, skip the
    redundant re-search/re-selection stages entirely: land the driven session
    straight on FLIGHT_PREBOOK_CONFIRMATION for that exact flight.

    Only fires for a STRUCTURED selection (a dict — written deterministically
    by select_searched_flight's cache lookup). The legacy free-text
    trip_context["selected_flight"] string (from update_trip_context, when
    the user described a flight Vero never searched for herself) is left for
    the itinerary agent's own requirement text — no fast path for that case,
    since there's no verified FlightOption to skip ahead with.
    """
    selected = trip_ctx.get("selected_flight")
    if not isinstance(selected, dict):
        return
    try:
        flight = FlightOption(**selected)
    except Exception:
        logger.warning("Bridge: trip_context['selected_flight'] present but not a valid FlightOption — ignoring fast path.")
        return

    # Reuse the real FlightAgent.select_flight() (pure Python, no LLM call) so
    # total_price is recomputed for the CURRENT traveler count — the quick
    # search that produced this option may have used a different adults/
    # children figure than what's confirmed now.
    from ai_travel_planner.graph.nodes import _get_flight_agent

    passengers = {
        "adults": state.trip.search_params.adults,
        "children": state.trip.search_params.children,
    }
    response = _get_flight_agent().select_flight(flight, passengers)

    state.flights.selected_flight = response.selected_flight
    state.flights.selection_made = True
    state.set_stage(WorkflowStage.FLIGHT_PREBOOK_CONFIRMATION)
    state.set_pending_action(PendingAction.PREBOOK_FLIGHT)
    logger.info(
        "Bridge: pre-selected flight applied — %s %s, skipping search/selection stages.",
        flight.airline, flight.flight_number,
    )


def _build_leg_app_state(
    leg: dict[str, Any],
    trip_ctx: dict[str, Any],
    message_history: list[dict[str, str]],
) -> AppState:
    """Build an ITINERARY_AGENT AppState for ONE leg of a multi_destination trip.

    Leg dicts come from trip_context["legs"] (populated by Vero's
    update_trip_context(leg_index=..., leg_data=...) mechanism) with keys:
    from, to, departure_date, nights, hotel_checkin, hotel_checkout.
    Travelers/budget/cabin class are shared across legs (Vero collects them
    once at the top level, not per-leg).
    """
    origin = leg.get("from") or trip_ctx.get("origin") or ""
    destination = leg.get("to") or ""
    checkin = _safe_date(leg.get("departure_date"))

    checkout = _safe_date(leg.get("hotel_checkout"))
    if checkout is None and checkin is not None and leg.get("nights"):
        try:
            checkout = checkin + timedelta(days=int(leg["nights"]))
        except (TypeError, ValueError):
            checkout = None

    travelers = trip_ctx.get("travelers") or {}
    adults = int(trip_ctx.get("adults", travelers.get("adults", 1)) or 1)
    children = int(trip_ctx.get("children", travelers.get("children", 0)) or 0)

    # NOTE: budget is the trip's TOTAL budget, not split per leg — ITINERARY_AGENT
    # has no per-leg budget concept, so each leg is searched against the same
    # overall budget-per-person figure. A deliberate simplification, not a bug.
    budget_per_person = _budget_per_person(trip_ctx.get("budget"), adults)
    cabin_class = _cabin_class(trip_ctx.get("cabin_class"))
    preferences_text = trip_ctx.get("preferences") or ""

    # A multi_destination leg is inherently one-way for flight-search purposes
    # (you fly TO this leg's destination and continue on to the next leg, not
    # back) — `checkout` here is purely the hotel stay's end date, same
    # ambiguity as the single-trip case. See _build_app_state's trip_type_hint.
    return _build_app_state(
        origin=origin,
        destination=destination,
        checkin=checkin,
        checkout=checkout,
        adults=adults,
        children=children,
        budget_per_person=budget_per_person,
        cabin_class=cabin_class,
        preferences_text=preferences_text,
        message_history=message_history,
        trip_type_hint="one_way",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Turn-based driver — replaces the old blocking console loop
# ─────────────────────────────────────────────────────────────────────────────
#
# ITINERARY_AGENT's own main.py drives its graph by calling node functions
# directly (one node per turn) instead of compiled_graph.invoke(), because some
# stages need to pause for user input and others should auto-chain. We reuse
# that exact stage classification here — it's the correct shape for HTTP, it
# just needs "wait for the next request" instead of "block on console.input()".

def _node_map() -> dict[str, Any]:
    from ai_travel_planner.graph.nodes import (
        node_flight_search_confirmation,
        node_flight_search,
        node_flight_selection,
        node_flight_prebook_confirmation,
        node_flight_prebook,
        node_draft_itinerary,
        node_draft_itinerary_review,
        node_hotel_search,
        node_hotel_selection,
        node_hotel_prebook_confirmation,
        node_hotel_prebook,
        node_final_itinerary,
        node_error,
    )

    return {
        WorkflowStage.FLIGHT_SEARCH_CONFIRMATION.value: node_flight_search_confirmation,
        WorkflowStage.FLIGHT_SEARCH.value:              node_flight_search,
        WorkflowStage.FLIGHT_SELECTION.value:           node_flight_selection,
        WorkflowStage.FLIGHT_PREBOOK_CONFIRMATION.value: node_flight_prebook_confirmation,
        WorkflowStage.FLIGHT_PREBOOK.value:             node_flight_prebook,
        WorkflowStage.DRAFT_ITINERARY.value:            node_draft_itinerary,
        WorkflowStage.DRAFT_ITINERARY_REVIEW.value:     node_draft_itinerary_review,
        WorkflowStage.HOTEL_SEARCH.value:               node_hotel_search,
        WorkflowStage.HOTEL_SELECTION.value:            node_hotel_selection,
        WorkflowStage.HOTEL_PREBOOK_CONFIRMATION.value: node_hotel_prebook_confirmation,
        WorkflowStage.HOTEL_PREBOOK.value:              node_hotel_prebook,
        WorkflowStage.FINAL_ITINERARY.value:            node_final_itinerary,
        WorkflowStage.ERROR.value:                      node_error,
    }


# Stages that auto-advance without user input (mirrors ai_travel_planner/main.py).
_AUTO_ADVANCE = {
    WorkflowStage.FLIGHT_SEARCH.value,
    WorkflowStage.FLIGHT_PREBOOK.value,
    WorkflowStage.DRAFT_ITINERARY.value,
    WorkflowStage.HOTEL_PREBOOK.value,
    WorkflowStage.FINAL_ITINERARY.value,
}

# Safety cap on auto-advance chaining within one HTTP turn — mirrors the loop
# guard in general_agent/graph/workflow.py::_route_after_tools.
_MAX_AUTO_ADVANCE_STEPS = 15

# Phrases that let the user bail out of the itinerary flow back to Vero.
# ITINERARY_AGENT's own stage machine has no such exit path internally, and we
# are not allowed to add one there — so the escape hatch lives here instead.
_EXIT_PHRASES = (
    "back to chat",
    "talk to vero",
    "cancel itinerary",
    "stop planning",
    "exit itinerary",
    "never mind",
)


def is_exit_request(user_input: str) -> bool:
    """True if the user's message is asking to leave the itinerary flow."""
    low = (user_input or "").strip().lower()
    return any(phrase in low for phrase in _EXIT_PHRASES)


def _stage_of(state_dict: dict[str, Any]) -> str:
    return str(state_dict.get("current_stage", WorkflowStage.FLIGHT_SEARCH_CONFIRMATION.value))


def _new_assistant_messages(state_dict: dict[str, Any], old_count: int) -> tuple[list[str], int]:
    history = state_dict.get("conversation", {}).get("message_history", [])
    new_msgs = [m["content"] for m in history[old_count:] if m.get("role") == "assistant"]
    return new_msgs, len(history)


def _inject_user_input(state_dict: dict[str, Any], user_input: str) -> None:
    state_dict["last_user_input"] = user_input
    conv = state_dict.setdefault("conversation", {})
    history = conv.setdefault("message_history", [])
    history.append({"role": "user", "content": user_input})
    conv["last_user_message"] = user_input
    conv["turn_count"] = conv.get("turn_count", 0) + 1


def _run_node(node_map: dict[str, Any], stage: str, state_dict: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    """Run the node for `stage`. Returns (new_state_dict, unknown_stage)."""
    node_fn = node_map.get(stage)
    if node_fn is None:
        logger.warning("Bridge: no node for stage '%s' — treating session as complete.", stage)
        return state_dict, True
    logger.info("Bridge: running node for stage: %s", stage)
    return node_fn(state_dict), False


# ─────────────────────────────────────────────────────────────────────────────
# Cards — map ITINERARY_AGENT's FlightOption/HotelOption results into the same
# [CARDS_DATA]-style shape the (now-removed) search_flights/search_hotels
# tools used to produce, so the UI's existing card-selection component keeps
# working during a real booking flow.
# ─────────────────────────────────────────────────────────────────────────────

def _flight_cards(state_dict: dict[str, Any]) -> dict[str, Any] | None:
    flights = (state_dict.get("flights") or {}).get("search_results") or []
    params = ((state_dict.get("trip") or {}).get("search_params")) or {}
    return _map_flight_cards(
        flights,
        title=f"Flights: {params.get('origin', '')} -> {params.get('destination', '')}",
        subtitle=f"Departure: {params.get('departure_date', '')} · {params.get('adults', 1)} passenger(s)",
    )


def _hotel_cards(state_dict: dict[str, Any], day_label: str) -> dict[str, Any] | None:
    hotels = ((state_dict.get("hotels") or {}).get("search_results_by_day") or {}).get(day_label) or []
    return _map_hotel_cards(hotels, title=f"Hotels for {day_label}", subtitle=f"{len(hotels)} option(s)")


def _cards_for_transition(prev_stage: str, state_dict: dict[str, Any]) -> dict[str, Any] | None:
    """Cards are only meaningful right after the node that produced fresh
    search results ran THIS turn — not on every subsequent turn while still
    sitting in a selection stage (avoids the 'sticking cards' problem)."""
    if prev_stage == WorkflowStage.FLIGHT_SEARCH.value:
        return _flight_cards(state_dict)
    if prev_stage == WorkflowStage.HOTEL_SEARCH.value:
        day_label = (state_dict.get("hotels") or {}).get("current_search_day")
        if day_label:
            return _hotel_cards(state_dict, day_label)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Single-leg session driver (internal) — exactly the original single-trip
# logic, unchanged, just renamed so the multi-leg wrapper below can reuse it
# per leg without touching this behaviour.
# ─────────────────────────────────────────────────────────────────────────────

def _start_leg_session(app_state: AppState) -> tuple[dict[str, Any], str, dict[str, Any] | None]:
    """Run the entry node for this session's stage.

    Normally that's FLIGHT_SEARCH_CONFIRMATION, but build_app_state_from_handoff
    may have already fast-forwarded `app_state.current_stage` to
    FLIGHT_PREBOOK_CONFIRMATION (a pre-selected flight from Vero's quick
    search — see _apply_preselected_flight) — so this must run whatever
    stage the state actually carries, not a hardcoded one.
    """
    state_dict = app_state.model_dump(mode="json")
    start_count = len(state_dict.get("conversation", {}).get("message_history", []))

    node_map = _node_map()
    entry_stage = _stage_of(state_dict)

    # Fast-path landing spot (a flight was pre-selected via Vero's quick
    # search — see _apply_preselected_flight): node_flight_prebook_confirmation
    # only asks yes/no, it never shows WHICH flight — that summary is normally
    # produced by node_flight_selection, which we've skipped entirely. Surface
    # it explicitly here, using the same formatter the normal flow uses, so
    # the user sees what they're confirming — and stop for this turn (same as
    # node_flight_selection itself would) rather than also running the
    # confirmation node immediately, which would just re-ask the same
    # yes/no question a second time since there's no real answer yet.
    if (
        entry_stage == WorkflowStage.FLIGHT_PREBOOK_CONFIRMATION.value
        and (state_dict.get("flights") or {}).get("selection_made")
    ):
        from ai_travel_planner.graph.nodes import _get_itinerary_agent
        live_state = AppState.model_validate(state_dict)
        live_state.add_assistant_message(_get_itinerary_agent().format_flight_selected_message(live_state))
        state_dict = live_state.model_dump(mode="json")
        replies, _ = _new_assistant_messages(state_dict, start_count)
        reply_text = "\n\n".join(replies) if replies else "Ready to pre-book this flight?"
        return state_dict, reply_text, None

    state_dict, _ = _run_node(node_map, entry_stage, state_dict)
    replies, _ = _new_assistant_messages(state_dict, start_count)

    reply_text = "\n\n".join(replies) if replies else "Let's get your trip planned — shall I search for flights?"
    return state_dict, reply_text, None


def _continue_leg_session(
    state_dict: dict[str, Any],
    user_input: str,
) -> tuple[dict[str, Any], str, bool, dict[str, Any] | None]:
    node_map = _node_map()

    _inject_user_input(state_dict, user_input)
    msg_count = len(state_dict.get("conversation", {}).get("message_history", [])) - 1

    stage = _stage_of(state_dict)
    state_dict, unknown = _run_node(node_map, stage, state_dict)
    cards = None if unknown else _cards_for_transition(stage, state_dict)

    steps = 0
    while not unknown and _stage_of(state_dict) in _AUTO_ADVANCE and steps < _MAX_AUTO_ADVANCE_STEPS:
        stage = _stage_of(state_dict)
        state_dict, unknown = _run_node(node_map, stage, state_dict)
        cards = cards or (None if unknown else _cards_for_transition(stage, state_dict))
        steps += 1

    if steps >= _MAX_AUTO_ADVANCE_STEPS:
        logger.warning("Bridge: auto-advance loop guard triggered at stage=%s", _stage_of(state_dict))

    replies, msg_count = _new_assistant_messages(state_dict, msg_count)
    reply_text = "\n\n".join(replies) if replies else "Let's continue — what would you like to do next?"

    is_complete = unknown or _stage_of(state_dict) == WorkflowStage.COMPLETED.value
    return state_dict, reply_text, is_complete, cards


# ─────────────────────────────────────────────────────────────────────────────
# Public driver — single-destination trips behave exactly as before; a
# multi_destination trip is driven as a sequence of independent leg sessions,
# stitched together into one combined reply/result at the end.
# ─────────────────────────────────────────────────────────────────────────────

def _is_multi_leg(general_agent_state: dict[str, Any]) -> list[dict[str, Any]] | None:
    trip_ctx = general_agent_state.get("trip_context", {}) or {}
    legs = trip_ctx.get("legs")
    if trip_ctx.get("trip_type") == "multi_destination" and legs:
        return legs
    return None


def start_itinerary_session(
    general_agent_state: dict[str, Any],
    task_description: str,
) -> tuple[dict[str, Any], str]:
    """Public entry point — see _start_itinerary_session_raw. Normalizes the
    reply text into clean markdown (see to_markdown) before returning, the
    single guaranteed point of coverage regardless of which internal path
    produced it."""
    state, reply_text = _start_itinerary_session_raw(general_agent_state, task_description)
    return state, to_markdown(reply_text)


def _start_itinerary_session_raw(
    general_agent_state: dict[str, Any],
    task_description: str,
) -> tuple[dict[str, Any], str]:
    """Begin a new ITINERARY_AGENT session from a Vero handoff. Builds AppState
    (single-leg, or leg 1 of a multi_destination trip) and runs the entry
    node. Returns (state_dict, reply_text) for this turn.
    """
    legs = _is_multi_leg(general_agent_state)
    logger.info(
        "Bridge: starting itinerary session | multi_leg=%s | task=%s",
        bool(legs), (task_description or "")[:120],
    )

    if legs:
        trip_ctx = general_agent_state.get("trip_context", {}) or {}
        history = _vero_history_as_messages(general_agent_state)
        leg0_state = _build_leg_app_state(legs[0], trip_ctx, history)
        leg_dict, reply_text, _ = _start_leg_session(leg0_state)

        wrapper = {
            "mode": "multi_leg",
            "legs": legs,
            "leg_idx": 0,
            "completed_summaries": [],
            "completed_totals": [],
            "current_session": leg_dict,
        }
        header = f"**Leg 1 of {len(legs)}: {legs[0].get('from', '?')} → {legs[0].get('to', '?')}**\n\n"
        return wrapper, header + reply_text

    app_state = build_app_state_from_handoff(general_agent_state, task_description)
    state_dict, reply_text, _ = _start_leg_session(app_state)
    return state_dict, reply_text


def continue_itinerary_session(
    state_dict: dict[str, Any],
    user_input: str,
) -> dict[str, Any]:
    """Public entry point — see _continue_itinerary_session_raw. Normalizes
    the reply text into clean markdown (see to_markdown) before returning,
    the single guaranteed point of coverage regardless of which of that
    function's several return paths produced it."""
    result = _continue_itinerary_session_raw(state_dict, user_input)
    result["reply"] = to_markdown(result["reply"])
    return result


def _continue_itinerary_session_raw(
    state_dict: dict[str, Any],
    user_input: str,
) -> dict[str, Any]:
    """
    Advance an in-progress ITINERARY_AGENT session by one user turn.

    Returns a dict: {"state": <new state_dict>, "reply": str, "complete": bool,
    "cards": dict | None}. For a multi_destination trip, "complete" only
    becomes True once every leg has finished; "state" carries the multi-leg
    wrapper dict across turns.
    """
    if state_dict.get("mode") != "multi_leg":
        leg_dict, reply_text, is_complete, cards = _continue_leg_session(state_dict, user_input)
        return {"state": leg_dict, "reply": reply_text, "complete": is_complete, "cards": cards}

    legs = state_dict["legs"]
    leg_idx = state_dict["leg_idx"]
    leg_dict, reply_text, leg_complete, cards = _continue_leg_session(
        state_dict["current_session"], user_input
    )
    state_dict["current_session"] = leg_dict

    if not leg_complete:
        return {"state": state_dict, "reply": reply_text, "complete": False, "cards": cards}

    # This leg finished — file its result and either start the next leg or
    # stitch everything into one combined final reply.
    result = extract_itinerary_result(leg_dict)
    leg_spec = legs[leg_idx]
    state_dict["completed_summaries"].append(
        (f"{leg_spec.get('from', '?')} → {leg_spec.get('to', '?')}", reply_text)
    )
    state_dict["completed_totals"].append(result.get("grand_total") or 0)

    next_idx = leg_idx + 1
    if next_idx < len(legs):
        trip_ctx = {}  # per-leg builder only needs shared travelers/budget, already
                       # baked into the leg specs' own dict by Vero — safe to pass {}
                       # here since _build_leg_app_state falls back to leg fields.
        # Re-derive shared fields (adults/budget/etc.) from the just-finished
        # leg's own search params so they carry forward consistently.
        prev_params = (leg_dict.get("trip") or {}).get("search_params") or {}
        trip_ctx = {
            "adults": prev_params.get("adults", 1),
            "children": prev_params.get("children", 0),
            "budget": None,  # already folded into budget_per_person on leg 1; avoid re-dividing
        }
        next_state = _build_leg_app_state(legs[next_idx], trip_ctx, [])
        # Preserve the running per-person budget instead of re-deriving from a
        # (now-cleared) trip_ctx budget string.
        next_state.trip.search_params.max_budget_per_person = prev_params.get("max_budget_per_person")
        next_leg_dict, next_reply, _ = _start_leg_session(next_state)

        state_dict["leg_idx"] = next_idx
        state_dict["current_session"] = next_leg_dict
        header = f"**Leg {next_idx + 1} of {len(legs)}: {legs[next_idx].get('from', '?')} → {legs[next_idx].get('to', '?')}**\n\n"
        combined_reply = f"{reply_text}\n\n{'─' * 40}\n\n{header}{next_reply}"
        return {"state": state_dict, "reply": combined_reply, "complete": False, "cards": None}

    # All legs done — stitch the combined summary.
    grand_total = sum(state_dict["completed_totals"])
    parts = [f"# 🗺️ Your Complete Multi-Destination Trip ({len(legs)} legs)\n"]
    for route, summary in state_dict["completed_summaries"]:
        parts.append(f"## {route}\n\n{summary}")
    parts.append(f"\n---\n**Combined Grand Total (all legs): ₹{grand_total:,.0f} INR**")
    final_reply = "\n\n".join(parts)

    return {"state": state_dict, "reply": final_reply, "complete": True, "cards": None}


# ─────────────────────────────────────────────────────────────────────────────
# Result extractor
# ─────────────────────────────────────────────────────────────────────────────

def extract_itinerary_result(final_state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Extract the human-readable itinerary result and key trip data from a
    completed ITINERARY_AGENT (single-leg) state dict.

    Returns a dict merged into general agent's trip_context so Vero knows
    exactly what was planned.
    """
    result: dict[str, Any] = {}

    # Last assistant message = the final itinerary output
    history = final_state_dict.get("conversation", {}).get("message_history", [])
    assistant_msgs = [m["content"] for m in history if m.get("role") == "assistant"]
    if assistant_msgs:
        result["itinerary_summary"] = assistant_msgs[-1]

    # Flight prebook info
    flights = final_state_dict.get("flights", {})
    if flights:
        prebook = flights.get("prebook") or {}
        if prebook:
            result["flight_prebook_id"] = prebook.get("prebook_id")
            flight_data = prebook.get("flight") or {}
            origin = flight_data.get("origin", "")
            dest = flight_data.get("destination", "")
            airline = flight_data.get("airline", "")
            flight_num = flight_data.get("flight_number", "")
            dep_time = str(flight_data.get("departure_time", ""))[:10]
            result["selected_flight"] = (
                f"{airline} {flight_num} — {origin} → {dest} on {dep_time}"
            ).strip()

    # Hotel prebook info
    hotel_prebooks = final_state_dict.get("hotels", {}).get("prebooks") or {}
    if hotel_prebooks:
        result["hotel_prebook_ids"] = {
            label: pb.get("prebook_id")
            for label, pb in hotel_prebooks.items()
        }
        result["selected_hotels"] = {
            label: (pb.get("hotel") or {}).get("name", "Hotel")
            for label, pb in hotel_prebooks.items()
        }

    # Financial summary from final itinerary
    final_itin = final_state_dict.get("itinerary", {}).get("final") or {}
    if final_itin:
        result["grand_total"] = final_itin.get("grand_total")
        result["total_flight_cost"] = final_itin.get("total_flight_cost")
        result["total_hotel_cost"] = final_itin.get("total_hotel_cost")
        result["currency"] = final_itin.get("currency", "INR")
        result["itinerary_complete"] = True
    else:
        # Even without final itinerary, mark as done if we got to COMPLETED stage
        stage = final_state_dict.get("current_stage", "")
        result["itinerary_complete"] = (stage == WorkflowStage.COMPLETED.value)

    return result


def extract_final_result(state_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Extract the completed-session result for trip_context, whether the
    session was single-leg (delegates to extract_itinerary_result) or
    multi_leg (summarises across all completed legs).
    """
    if state_dict.get("mode") != "multi_leg":
        return extract_itinerary_result(state_dict)

    return {
        "itinerary_summary": "\n\n".join(s for _, s in state_dict.get("completed_summaries", []))[:500],
        "grand_total": sum(state_dict.get("completed_totals", [])),
        "currency": "INR",
        "itinerary_complete": True,
        "multi_destination_legs": len(state_dict.get("legs", [])),
    }
