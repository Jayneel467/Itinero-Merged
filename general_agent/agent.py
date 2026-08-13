"""
Public entrypoint for the Itinero orchestrator agent.

This is the one module other code (main.py, the itinerary agent,
an MCP server, an API layer) should import from. The internal layout
(models/, providers/, services/, llm/, graph/) can be reorganized freely
later without breaking anything that imports from here.
"""
import json
import logging
import re
from langchain_core.messages import AIMessage, HumanMessage

from graph.workflow import build_graph
import itinerary_bridge
from services.user_facing import sanitize_user_facing_text, strip_duplicate_card_lists
from services.page_aware import format_left_page_brief, try_answer_from_ui_page
from services.live_unknowns import instant_live_guard, skip_all_instant
from services.companion_safety import classify_companion, classify_voice_caution
from services.sarvam_voice import resolve_thread_language
from services.voice_localize import maybe_localize_voice_reply
from services.respect_address import apply_respect_state, voice_respect_instruction

try:
    from general_agent.runtime import (
        extract_tool_names,
        invoke_config,
        start_turn,
    )
except ImportError:  # flat import when cwd is general_agent/
    from runtime import extract_tool_names, invoke_config, start_turn  # type: ignore

_log = logging.getLogger(__name__)


def _address_fields(trip_context: dict) -> dict:
    ctx = trip_context if isinstance(trip_context, dict) else {}
    return {
        "preferred_name": str(ctx.get("preferred_name") or "").strip(),
        "address_style": str(ctx.get("address_style") or "respectful"),
    }


def _pack(turn, path: str, payload: dict, *, tools: list | None = None) -> dict:
    """Attach production turn telemetry to every agent response."""
    meta = turn.finish(path=path, tools=tools or [])
    out = dict(payload)
    out["agent_meta"] = meta
    return out


class ItineroAgent:
    """Thin public wrapper around the compiled LangGraph app.

    Internally this orchestrates research + itinerary engines. Externally
    every reply is Vero — never expose specialist / supervisor names.
    """

    def __init__(self):
        self._app = build_graph()

    def invoke(self, message: str, thread_id: str = "default") -> str:
        """Send one user message and get back the agent's reply text."""
        res = self.invoke_with_cards(message, thread_id=thread_id)
        return res["reply"]

    def invoke_with_cards(
        self,
        message: str,
        thread_id: str = "default",
        page_context: dict | None = None,
        voice_mode: bool = False,
        spoken_language: str | None = None,
        traveler: dict | None = None,
    ) -> dict:
        """Send one user message and get back both reply text and cards metadata (if any).

        Routing: trip_context["engine"] decides who owns this turn. When it's
        "itinerary" (set by graph/nodes.py::itinerary_node on handoff), the
        message is driven straight into the itinerary planning session via
        itinerary_bridge — Vero's conversational LLM is not called for that turn.
        Otherwise this falls through to the normal Vero (general) graph.

        Unified memory: every itinerary-flow turn is ALSO appended to Vero's
        own `messages` list (via update_state's add_messages reducer), so
        Vero's own conversation history has no blind spot for what happened
        during deeper planning.

        page_context: optional UI browsing state (flights/hotels results on
        the left). Stored under trip_context["ui_page"] so the system prompt
        can help the user through what they're looking at.
        """
        turn = start_turn(message, thread_id)
        config = invoke_config(thread_id)

        snapshot = self._app.get_state(config)
        trip_context = dict((snapshot.values or {}).get("trip_context", {}) or {})

        invoke_ctx: dict = {}
        invoke_ctx["voice_mode"] = bool(voice_mode)
        trip_context["voice_mode"] = bool(voice_mode)
        lang, reply_script = resolve_thread_language(
            message,
            incoming_spoken=spoken_language,
            prev_spoken=trip_context.get("spoken_language") or trip_context.get("user_language"),
            prev_script=trip_context.get("reply_script"),
        )
        spoken_language = lang
        invoke_ctx["spoken_language"] = lang
        invoke_ctx["user_language"] = lang
        invoke_ctx["reply_script"] = reply_script
        trip_context["spoken_language"] = lang
        trip_context["user_language"] = lang
        trip_context["reply_script"] = reply_script
        respect_patch = apply_respect_state(
            trip_context,
            message,
            spoken_language=lang,
            traveler=traveler if isinstance(traveler, dict) else None,
        )
        invoke_ctx.update(respect_patch)
        trip_context.update(respect_patch)
        if isinstance(traveler, dict):
            nat = str(
                traveler.get("passport_nationality")
                or traveler.get("nationality")
                or ""
            ).strip()
            if nat:
                invoke_ctx["passport_nationality"] = nat
                invoke_ctx["nationality"] = nat
                trip_context["passport_nationality"] = nat
                trip_context["nationality"] = nat
            home_airport = str(traveler.get("home_airport") or "").strip().upper()
            if home_airport and not trip_context.get("origin"):
                invoke_ctx["home_airport"] = home_airport
                trip_context["home_airport"] = home_airport
        if page_context and isinstance(page_context, dict):
            # UI hints only — never trust client offer/prebook/transaction IDs
            # as authority to create LiteAPI holds.
            safe_page = {
                k: page_context.get(k)
                for k in ("screen", "path", "title")
                if page_context.get(k) is not None
            }
            search_in = page_context.get("search") if isinstance(page_context.get("search"), dict) else {}
            search = {
                k: search_in[k]
                for k in (
                    "origin",
                    "destination",
                    "depart_date",
                    "return_date",
                    "city",
                    "check_in",
                    "check_out",
                    "guests",
                    "rooms",
                    "adults",
                    "children",
                )
                if search_in.get(k) is not None
            }
            if search:
                safe_page["search"] = search
            invoke_ctx["ui_page"] = safe_page
            trip_context["ui_page"] = safe_page
            screen = safe_page.get("screen")
            if screen in ("flights", "passenger_info") and search.get("origin"):
                # Left page is source of truth for route/dates display.
                invoke_ctx["origin"] = search["origin"]
                trip_context["origin"] = search["origin"]
                if search.get("destination"):
                    invoke_ctx["destination"] = search["destination"]
                    trip_context["destination"] = search["destination"]
                if search.get("depart_date"):
                    invoke_ctx["checkin"] = search["depart_date"]
                    trip_context["checkin"] = search["depart_date"]
                if search.get("return_date"):
                    invoke_ctx["checkout"] = search["return_date"]
                    trip_context["checkout"] = search["return_date"]
            if screen == "passenger_info":
                booking_in = (
                    page_context.get("booking")
                    if isinstance(page_context.get("booking"), dict)
                    else {}
                )
                # Display-only fields. Strip hold/payment identifiers so forged
                # page_context cannot drive prebook/complete.
                _deny = {
                    "offer_id",
                    "offerId",
                    "prebook_id",
                    "prebookId",
                    "transaction_id",
                    "transactionId",
                    "booking_id",
                    "bookingId",
                    "secret_key",
                    "client_secret",
                    "payment_id",
                    "paymentId",
                }
                booking = {
                    k: v
                    for k, v in booking_in.items()
                    if k not in _deny and not str(k).lower().endswith(("_secret", "secret_key"))
                }
                if booking:
                    # Prefer server-side selected_flight; only fill gaps for UI talk.
                    existing = trip_context.get("selected_flight")
                    if isinstance(existing, dict) and existing:
                        merged = {**booking, **{k: existing[k] for k in existing if existing.get(k) is not None}}
                        invoke_ctx["selected_flight"] = merged
                        trip_context["selected_flight"] = merged
                    else:
                        invoke_ctx["selected_flight"] = booking
                        trip_context["selected_flight"] = booking
            if screen == "hotels" and search.get("city"):
                if not trip_context.get("destination"):
                    invoke_ctx["destination"] = search["city"]
                    trip_context["destination"] = search["city"]
                if not trip_context.get("checkin") and search.get("check_in"):
                    invoke_ctx["checkin"] = search["check_in"]
                    trip_context["checkin"] = search["check_in"]
                if not trip_context.get("checkout") and search.get("check_out"):
                    invoke_ctx["checkout"] = search["check_out"]
                    trip_context["checkout"] = search["check_out"]
        companion_mode = classify_companion(message)
        invoke_ctx["companion_mode"] = companion_mode or ""
        if companion_mode:
            trip_context["companion_mode"] = companion_mode
            if companion_mode == "stacked_crisis":
                trip_context["companion_stack"] = "stacked_crisis"
        else:
            trip_context.pop("companion_mode", None)
        if trip_context.get("companion_stack"):
            invoke_ctx["companion_stack"] = trip_context["companion_stack"]
        voice_caution = classify_voice_caution(message)
        invoke_ctx["voice_caution"] = voice_caution or ""
        if voice_caution:
            trip_context["voice_caution"] = voice_caution
        else:
            trip_context.pop("voice_caution", None)

        if invoke_ctx:
            self._app.update_state(config, {"trip_context": invoke_ctx})

        safety_break = companion_mode in (
            "medical_emergency", "safety_emergency", "disaster", "stacked_crisis",
        )
        if (
            trip_context.get("engine") == "itinerary"
            and not itinerary_bridge.is_exit_request(message)
            and not safety_break
        ):
            itin_state = trip_context.get("itinerary_state") or {}
            result = itinerary_bridge.continue_itinerary_session(itin_state, message)
            reply_text = sanitize_user_facing_text(result["reply"])

            if result["complete"]:
                trip_context.update(itinerary_bridge.extract_final_result(result["state"]))
                trip_context["engine"] = "general"
                trip_context.pop("itinerary_state", None)
            else:
                trip_context["itinerary_state"] = result["state"]

            if voice_mode:
                reply_text = maybe_localize_voice_reply(
                    reply_text,
                    True,
                    spoken_language,
                    reply_script=trip_context.get("reply_script"),
                    respect_instruction=voice_respect_instruction(trip_context),
                )
            self._app.update_state(config, {
                "trip_context": trip_context,
                "messages": [HumanMessage(content=message), AIMessage(content=reply_text)],
            })
            return _pack(
                turn,
                "itinerary_bridge",
                {"reply": reply_text, "cards": result.get("cards"), **_address_fields(trip_context)},
            )

        if trip_context.get("engine") == "itinerary":
            # Exit request — drop the itinerary session and let Vero handle
            # this message normally below.
            trip_context.pop("itinerary_state", None)
            trip_context["engine"] = "general"
            self._app.update_state(config, {"trip_context": trip_context})

        guard = None if companion_mode else instant_live_guard(message)
        if guard:
            reply_text = sanitize_user_facing_text(guard)
            if voice_mode:
                reply_text = maybe_localize_voice_reply(
                    reply_text,
                    True,
                    spoken_language,
                    reply_script=trip_context.get("reply_script"),
                    respect_instruction=voice_respect_instruction(trip_context),
                )
            self._app.update_state(config, {
                "messages": [HumanMessage(content=message), AIMessage(content=reply_text)],
            })
            return _pack(
                turn,
                "live_unknown_guard",
                {"reply": reply_text, "cards": None, **_address_fields(trip_context)},
            )

        if (
            page_context
            and isinstance(page_context, dict)
            and not companion_mode
            and not skip_all_instant(message)
        ):
            instant = try_answer_from_ui_page(message, page_context)
            if instant:
                reply_text = sanitize_user_facing_text(instant)
                if voice_mode:
                    reply_text = maybe_localize_voice_reply(
                        reply_text,
                        True,
                        spoken_language,
                        reply_script=trip_context.get("reply_script"),
                        respect_instruction=voice_respect_instruction(trip_context),
                    )
                self._app.update_state(config, {
                    "trip_context": {"ui_page": page_context, **respect_patch},
                    "messages": [HumanMessage(content=message), AIMessage(content=reply_text)],
                })
                return _pack(
                    turn,
                    "page_aware_instant",
                    {"reply": reply_text, "cards": None, **_address_fields(trip_context)},
                )

        human_content = message
        if page_context and isinstance(page_context, dict):
            brief = format_left_page_brief(page_context)
            if brief:
                human_content = f"{brief}\n\n{message}"

        try:
            result = self._app.invoke(
                {"messages": [HumanMessage(content=human_content)], "trip_context": invoke_ctx},
                config=config,
            )
        except Exception as exc:
            # Recursion / provider failures → honest degrade, never invent bookings.
            turn.degraded = True
            turn.error = type(exc).__name__
            _log.exception("vero graph invoke failed: %s", exc)
            reply_text = (
                "I hit a temporary limit processing that. "
                "Try a shorter ask, or send it again in a moment."
            )
            return _pack(
                turn,
                "graph_error",
                {"reply": reply_text, "cards": None, **_address_fields(trip_context)},
            )
        all_msgs = result.get("messages", [])
        reply_text = sanitize_user_facing_text(all_msgs[-1].content if all_msgs else "")
        tools_used = extract_tool_names(all_msgs)

        # Only look at tool messages from THIS turn — i.e. messages that come
        # AFTER the last HumanMessage.  Scanning all historical tool messages
        # caused cards from a flight/hotel search 3 turns ago to re-appear
        # in every subsequent response (the "sticking cards" bug).
        last_human_idx = None
        for i, msg in enumerate(all_msgs):
            if getattr(msg, "type", None) == "human":
                last_human_idx = i
        current_turn_msgs = (
            all_msgs[last_human_idx + 1:] if last_human_idx is not None else all_msgs
        )

        cards_data = None
        for msg in reversed(current_turn_msgs):
            if getattr(msg, "type", None) == "tool":
                content = str(msg.content or "")
                marker = "[CARDS_DATA:"
                if marker not in content:
                    continue
                try:
                    start_idx = content.index(marker) + len(marker)
                    blob = content[start_idx:].lstrip()
                    # Prefer balanced JSON object — rindex(']') breaks on URLs / arrays
                    if blob.startswith("{"):
                        depth = 0
                        end = None
                        in_str = False
                        esc = False
                        for i, ch in enumerate(blob):
                            if in_str:
                                if esc:
                                    esc = False
                                elif ch == "\\":
                                    esc = True
                                elif ch == '"':
                                    in_str = False
                                continue
                            if ch == '"':
                                in_str = True
                                continue
                            if ch == "{":
                                depth += 1
                            elif ch == "}":
                                depth -= 1
                                if depth == 0:
                                    end = i + 1
                                    break
                        if end:
                            cards_data = json.loads(blob[:end])
                            break
                    end_idx = content.rindex("]")
                    json_str = content[start_idx:end_idx].strip()
                    cards_data = json.loads(json_str)
                    break
                except Exception:
                    pass

        # Escalation this turn: prefer itinerary-produced cards (live LiteAPI
        # results). Drop leftover quick-search cards from the same turn.
        new_trip_context = result.get("trip_context", {}) or {}
        if new_trip_context.get("pending_cards"):
            cards_data = new_trip_context["pending_cards"]
        elif new_trip_context.get("engine") == "itinerary":
            cards_data = None

        if voice_mode:
            reply_text = maybe_localize_voice_reply(
                reply_text,
                True,
                spoken_language,
                reply_script=trip_context.get("reply_script"),
                respect_instruction=voice_respect_instruction(trip_context),
            )

        left_nav = new_trip_context.get("pending_left_nav")
        continue_booking = re.search(
            r"\b(continue|proceed|finish|complete).{0,40}\b(book|passenger|payment)\b"
            r"|\b(book|passenger|payment).{0,20}\b(continue|proceed)\b"
            r"|\blet'?s continue\b",
            message,
            re.I,
        )
        if (
            continue_booking
            and (new_trip_context.get("selected_flight") or trip_context.get("selected_flight"))
            and not (isinstance(left_nav, dict) and left_nav.get("type"))
        ):
            left_nav = {"type": "open_passenger_details"}
        if isinstance(left_nav, dict) and left_nav.get("type"):
            allowed = {
                "open_passenger_details",
                "open_flight_search",
                "open_hotel_search",
                "open_payment",
                "navigate",
            }
            nav_type = str(left_nav.get("type") or "")
            if nav_type not in allowed:
                left_nav = None
            elif nav_type == "open_passenger_details" and not (
                new_trip_context.get("selected_flight") or trip_context.get("selected_flight")
            ):
                left_nav = None
        if isinstance(left_nav, dict) and left_nav.get("type"):
            if "```itinero-action" not in (reply_text or ""):
                try:
                    fence = "```itinero-action\n" + json.dumps(left_nav, ensure_ascii=False) + "\n```"
                    reply_text = ((reply_text or "").rstrip() + "\n\n" + fence).strip()
                except Exception:
                    pass
            if re.search(r"\bno flights?\b|\bstill no flights\b", reply_text or "", re.I):
                o = left_nav.get("origin") or ""
                d = left_nav.get("destination") or ""
                dt = left_nav.get("depart_date") or ""
                reply_text = re.sub(
                    r"(?is)(still\s+)?no flights?[^.!?]*[.!?]?",
                    f"Opening live fares {o} → {d}" + (f" on {dt}" if dt else "") + " on the left. ",
                    reply_text,
                    count=1,
                )

        places = None
        if isinstance(cards_data, dict) and cards_data.get("type") in ("places", "events"):
            places = cards_data.get("items")
        # Cards already render in UI — never also dump a numbered menu in chat text.
        reply_text = strip_duplicate_card_lists(reply_text, cards_data)
        return _pack(
            turn,
            "react_graph",
            {
                "reply": reply_text,
                "cards": cards_data,
                "places": places,
                **_address_fields({**trip_context, **new_trip_context}),
            },
            tools=tools_used,
        )

    def stream(self, message: str, thread_id: str = "default"):
        config = invoke_config(thread_id)
        yield from self._app.stream(
            {"messages": [HumanMessage(content=message)], "trip_context": {}},
            config=config,
        )



def build_agent() -> ItineroAgent:
    """Factory - construct a ready-to-use ItineroAgent instance."""
    return ItineroAgent()
