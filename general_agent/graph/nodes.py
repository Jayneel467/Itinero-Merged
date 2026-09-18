"""
Graph nodes for the Itinero orchestrator agent.

Two nodes:
  - agent_node      : the single LLM reasoning step (handles normal conversation
                      and tool routing). Injects a fresh datetime-aware system
                      prompt on every turn.
  - itinerary_node  : hands the conversation off to the real ITINERARY_AGENT
                      multi-agent system via itinerary_bridge.py. This node
                      only runs the FIRST itinerary turn — subsequent turns are
                      routed directly by general_agent/agent.py while
                      trip_context["engine"] == "itinerary", bypassing this
                      graph entirely until the itinerary session completes.

When this grows into multi-agent, new specialist nodes get added here alongside
`agent_node`, and `graph/workflow.py` wires the routing between them.
"""
import json
import logging
import re
import uuid

from langchain_core.messages import SystemMessage, AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig

from models.state import AgentState
from llm.model import deepseek_configured, get_llm_for_turn, get_llm_with_tools, get_planner_llm
from llm.prompts import build_system_prompt
import itinerary_bridge

logger = logging.getLogger(__name__)

# The signal string that escalate_to_itinerary tool returns.
# Kept in sync with llm/tools.py and graph/workflow.py.
_ESCALATION_SIGNAL = "ESCALATE_TO_ITINERARY"

_PLANNER_EXTRA = (
    "\n\n[Lane: planner/synth — DeepSeek, cost-saver] "
    "You are writing the user-facing travel answer. Do NOT invent live fares, "
    "gates, or availability. If the history already contains tool results, "
    "synthesize them clearly. For real flights, hotels, or booking, ask the traveler "
    "for their dates and departure city so we can search real options."
)

_MAX_TOOL_CHARS = 6000
_MAX_AI_CHARS_CHEAP = 4000

_INVOKE_PATTERN = re.compile(
    r"<\s*(?:[\uff5c|]{1,2}\s*DSML\s*[\uff5c|]{1,2}\s*)?invoke\s+name=[\"']?([a-zA-Z0-9_-]+)[\"']?\s*>(.*?)</\s*(?:[\uff5c|]{1,2}\s*DSML\s*[\uff5c|]{1,2}\s*)?invoke\s*>",
    re.DOTALL | re.IGNORECASE,
)
_PARAM_PATTERN = re.compile(
    r"<\s*(?:[\uff5c|]{1,2}\s*DSML\s*[\uff5c|]{1,2}\s*)?parameter\s+name=[\"']?([a-zA-Z0-9_-]+)[\"']?[^>]*>(.*?)</\s*(?:[\uff5c|]{1,2}\s*DSML\s*[\uff5c|]{1,2}\s*)?parameter\s*>",
    re.DOTALL | re.IGNORECASE,
)
_CALLS_WRAPPER = re.compile(
    r"<\s*(?:[\uff5c|]{1,2}\s*DSML\s*[\uff5c|]{1,2}\s*)?calls\s*>|</\s*(?:[\uff5c|]{1,2}\s*DSML\s*[\uff5c|]{1,2}\s*)?calls\s*>",
    re.DOTALL | re.IGNORECASE,
)
_TOOL_CALL_TAG = re.compile(
    r"<(?:tool_call|function_call)>\s*(.*?)\s*</(?:tool_call|function_call)>",
    re.DOTALL | re.IGNORECASE,
)
_DEEPSEEK_SPECIAL_TOOL = re.compile(
    r"<｜tool call begin｜>function<｜tool sep｜>([a-zA-Z0-9_-]+)\s*\n(.*?)<｜tool call end｜>",
    re.DOTALL,
)


def _coerce_param_value(val_str: str, is_string: bool = False):
    s = val_str.strip()
    if is_string:
        return s
    if s.lower() == "true":
        return True
    if s.lower() == "false":
        return False
    if s.isdigit():
        return int(s)
    try:
        if (s.startswith("{") and s.endswith("}")) or (s.startswith("[") and s.endswith("]")):
            return json.loads(s)
    except Exception:
        pass
    return s


def _parse_tool_calls_from_text(content: str) -> tuple[list[dict], str]:
    """Detects and extracts tool calls embedded in model output text (such as
    DeepSeek DSML `<invoke name="...">...<parameter...` or XML/markdown).
    Returns (tool_calls, cleaned_content).
    """
    if not content or not isinstance(content, str):
        return [], content or ""

    tool_calls = []
    cleaned = content

    # 1. DeepSeek / DSML XML <invoke name="...">...</invoke>
    invoke_matches = list(_INVOKE_PATTERN.finditer(content))
    if invoke_matches:
        for m in invoke_matches:
            func_name = m.group(1).strip()
            body = m.group(2).strip()
            args = {}

            param_matches = list(_PARAM_PATTERN.finditer(body))
            if param_matches:
                for pm in param_matches:
                    pname = pm.group(1).strip()
                    ptext = pm.group(2).strip()
                    is_str = 'string="true"' in pm.group(0).lower() or "string='true'" in pm.group(0).lower()
                    args[pname] = _coerce_param_value(ptext, is_str)
            elif body.startswith("{") and body.endswith("}"):
                try:
                    parsed = json.loads(body)
                    if isinstance(parsed, dict):
                        args = parsed
                except Exception:
                    pass

            if func_name == "escalate_to_itinerary" and "task_description" not in args:
                reason = str(args.pop("reason", "") or "escalating to itinerary planning")
                args = {
                    "task_description": json.dumps(args),
                    "reason": reason,
                }

            tool_calls.append({
                "name": func_name,
                "args": args,
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "tool_call",
            })

        cleaned = _INVOKE_PATTERN.sub("", cleaned)
        cleaned = _CALLS_WRAPPER.sub("", cleaned).strip()

    # 2. <tool_call> / <function_call> JSON tags
    if not tool_calls:
        tc_matches = list(_TOOL_CALL_TAG.finditer(cleaned))
        if tc_matches:
            for m in tc_matches:
                raw_json = m.group(1).strip()
                try:
                    data = json.loads(raw_json)
                    if isinstance(data, dict):
                        func_name = data.get("name") or data.get("function")
                        args = data.get("arguments") or data.get("parameters") or data.get("args") or {}
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except Exception:
                                pass
                        if func_name:
                            if func_name == "escalate_to_itinerary" and isinstance(args, dict) and "task_description" not in args:
                                reason = str(args.pop("reason", "") or "escalating to itinerary planning")
                                args = {
                                    "task_description": json.dumps(args),
                                    "reason": reason,
                                }
                            tool_calls.append({
                                "name": func_name,
                                "args": args if isinstance(args, dict) else {},
                                "id": f"call_{uuid.uuid4().hex[:8]}",
                                "type": "tool_call",
                            })
                except Exception:
                    pass
            cleaned = _TOOL_CALL_TAG.sub("", cleaned).strip()

    # 3. DeepSeek special token format
    if not tool_calls and "<｜tool" in cleaned:
        for m in _DEEPSEEK_SPECIAL_TOOL.finditer(cleaned):
            func_name = m.group(1).strip()
            body = m.group(2).strip()
            if body.startswith("```json"):
                body = body[7:].strip()
            if body.endswith("```"):
                body = body[:-3].strip()
            try:
                args = json.loads(body)
            except Exception:
                args = {}
            if func_name == "escalate_to_itinerary" and "task_description" not in args:
                reason = str(args.pop("reason", "") or "escalating to itinerary planning")
                args = {
                    "task_description": json.dumps(args),
                    "reason": reason,
                }
            tool_calls.append({
                "name": func_name,
                "args": args if isinstance(args, dict) else {},
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "tool_call",
            })
        cleaned = _DEEPSEEK_SPECIAL_TOOL.sub("", cleaned)
        cleaned = cleaned.replace("<｜tool calls｜>", "").strip()

    return tool_calls, cleaned


def _cap_message_content(message, limit: int):
    content = getattr(message, "content", None)
    if not isinstance(content, str) or len(content) <= limit:
        return message
    extra = ""
    marker = "[CARDS_DATA:"
    if marker in content:
        i = content.index(marker)
        extra = "\n" + content[i : i + 1200]
    new_content = content[:limit] + "\n…[truncated for cost]" + extra
    try:
        return message.model_copy(update={"content": new_content})
    except Exception:
        if getattr(message, "type", None) == "tool":
            return ToolMessage(
                content=new_content,
                tool_call_id=getattr(message, "tool_call_id", "") or "",
            )
        return AIMessage(content=new_content)


def _trim_history_for_lane(messages: list, lane: str) -> list:
    if lane not in ("planner", "synth"):
        return messages
    out = []
    for m in messages:
        t = getattr(m, "type", None)
        if t == "tool":
            out.append(_cap_message_content(m, _MAX_TOOL_CHARS))
        elif t == "ai":
            out.append(_cap_message_content(m, _MAX_AI_CHARS_CHEAP))
        else:
            out.append(m)
    return out


def agent_node(state: AgentState):
    """The single reasoning node: calls the LLM (with tools bound) on the
    current message history and returns its reply, which may include tool
    calls that the graph will route to the tools node.

    A fresh system prompt is injected on every turn so the agent always has
    the correct current date/time and the latest confirmed trip state.

    Dual-LLM: OpenAI handles tool/booking turns; DeepSeek handles plan-only
    and post-tool synthesis when DEEPSEEK_API_KEY is set.
    """
    messages = list(state["messages"])
    trip_context = state.get("trip_context", {}) or {}

    # Strip existing system messages to avoid duplication
    non_system_messages = [m for m in messages if m.type != "system"]

    # Lane from recent history, then window to that lane (never mid tool-pair).
    peek = non_system_messages[-24:] if len(non_system_messages) > 24 else non_system_messages
    llm, lane = get_llm_for_turn(peek, trip_context)
    try:
        from llm.cost_planner import message_window as _cost_window

        win = _cost_window(lane)
    except Exception:
        win = 10 if lane in ("planner", "synth") else 16
    if len(non_system_messages) > win:
        non_system_messages = non_system_messages[-win:]
        while non_system_messages and getattr(non_system_messages[0], "type", None) == "tool":
            non_system_messages = non_system_messages[1:]
    non_system_messages = _trim_history_for_lane(non_system_messages, lane)

    # Inject fresh system message (rebuilds with current datetime and trip state each turn)
    system_body = build_system_prompt(trip_context, lane=lane)
    if lane in ("planner", "synth"):
        system_body = system_body + _PLANNER_EXTRA
    fresh_system = SystemMessage(content=system_body)
    final_messages = [fresh_system] + non_system_messages

    try:
        response = llm.invoke(final_messages)
    except Exception as exc:
        logger.exception("agent_node LLM invocation error lane=%s: %s", lane, exc)
        response = None
        # Planner/synth failure → one retry on OpenAI tools lane.
        if lane in ("planner", "synth"):
            try:
                logger.warning("vero_llm falling back to OpenAI tools after %s failure", lane)
                response = get_llm_with_tools().invoke(
                    [SystemMessage(content=build_system_prompt(trip_context, lane="tools"))]
                    + non_system_messages
                )
                lane = "tools_fallback"
            except Exception as exc2:
                logger.exception("agent_node OpenAI fallback failed: %s", exc2)
        else:
            # Tools/OpenAI failure (dead local proxy, timeout) → DeepSeek so chat still answers.
            if deepseek_configured():
                try:
                    logger.warning("vero_llm falling back to DeepSeek planner after %s failure", lane)
                    planner = get_planner_llm()
                    response = planner.bind(max_tokens=700).invoke(
                        [
                            SystemMessage(
                                content=build_system_prompt(trip_context, lane="planner")
                                + _PLANNER_EXTRA
                            )
                        ]
                        + non_system_messages
                    )
                    lane = "planner_fallback"
                except Exception as exc2:
                    logger.exception("agent_node planner fallback failed: %s", exc2)
        if response is None:
            return {
                "messages": [
                    AIMessage(
                        content="I ran into a temporary connection issue. Please try your request again."
                    )
                ]
            }

    # If the LLM returned tool calls in text (e.g. DeepSeek DSML / XML tags)
    # rather than the structured tool_calls field, parse them into tool_calls.
    tool_calls = getattr(response, "tool_calls", None) or []
    if not tool_calls and isinstance(getattr(response, "content", None), str):
        parsed_tcs, cleaned_content = _parse_tool_calls_from_text(response.content)
        if parsed_tcs:
            try:
                response = response.model_copy(update={"content": cleaned_content, "tool_calls": parsed_tcs})
            except Exception:
                response.content = cleaned_content
                response.tool_calls = parsed_tcs
            tool_calls = parsed_tcs
            logger.info("Parsed %d text-embedded tool call(s) from LLM output: %s", len(parsed_tcs), [t["name"] for t in parsed_tcs])

    updates = {"messages": [response]}
    try:
        from llm.cost_planner import record_turn

        subject = str((trip_context or {}).get("cost_subject") or "")
        cost = record_turn(lane=lane, subject=subject)
        updates["trip_context"] = {"vero_cost": cost, "vero_last_lane": lane}
    except Exception:
        pass
    logger.info("vero_llm lane=%s done tool_calls=%s", lane, bool(tool_calls))

    if tool_calls:
        # If planning_mode is full_trip and the LLM issued search_flights and/or search_hotels,
        # fuse them into escalate_to_itinerary so the handoff to ITINERARY_AGENT runs cleanly.
        is_full_trip = str(trip_context.get("planning_mode") or "").lower() == "full_trip"
        flight_tc = next((tc for tc in tool_calls if tc.get("name") == "search_flights"), None)
        hotel_tc = next((tc for tc in tool_calls if tc.get("name") == "search_hotels"), None)
        has_escalate = any(tc.get("name") == "escalate_to_itinerary" for tc in tool_calls)

        if (is_full_trip or (flight_tc and hotel_tc)) and not has_escalate and (flight_tc or hotel_tc):
            f_args = (flight_tc.get("args") or {}) if flight_tc else {}
            h_args = (hotel_tc.get("args") or {}) if hotel_tc else {}
            dest = (
                f_args.get("destination")
                or h_args.get("destination")
                or h_args.get("location")
                or trip_context.get("destination")
                or ""
            )
            orig = (
                f_args.get("origin")
                or f_args.get("departure")
                or trip_context.get("origin")
                or trip_context.get("departure")
                or ""
            )
            cin = (
                f_args.get("departure_date")
                or h_args.get("checkin")
                or h_args.get("check_in")
                or trip_context.get("checkin")
                or ""
            )
            cout = (
                f_args.get("return_date")
                or h_args.get("checkout")
                or h_args.get("check_out")
                or trip_context.get("checkout")
                or ""
            )
            pax = int(
                f_args.get("adults")
                or h_args.get("adults")
                or trip_context.get("adults")
                or 1
            )
            pref = (
                h_args.get("destination")
                if h_args.get("destination") and h_args.get("destination") != dest
                else (trip_context.get("preferences") or "")
            )
            esc_data = {
                "origin": orig,
                "destination": dest,
                "checkin": cin,
                "checkout": cout,
                "travelers": {"adults": pax},
                "preferences": pref,
                "trip_type": "round_trip" if cout else "one_way",
                "scope": "full",
            }
            other_tcs = [tc for tc in tool_calls if tc.get("name") not in ("search_flights", "search_hotels")]
            esc_tc = {
                "name": "escalate_to_itinerary",
                "args": {
                    "task_description": json.dumps(esc_data),
                    "reason": "Full trip with flights and hotels requested",
                },
                "id": f"call_{uuid.uuid4().hex[:8]}",
                "type": "tool_call",
            }
            tool_calls = other_tcs + [esc_tc]
            try:
                response = response.model_copy(update={"tool_calls": tool_calls})
            except Exception:
                response.tool_calls = tool_calls
            updates["messages"] = [response]
            logger.info("Fused search_flights/search_hotels into escalate_to_itinerary: %s", esc_data)

        names = ", ".join(tc["name"] for tc in tool_calls)
        logger.info("Agent requested tool call(s): %s", names)

        # Enrich escalate_to_itinerary with known trip_context if missing in call
        for tc in tool_calls:
            if tc.get("name") == "escalate_to_itinerary":
                tc_args = tc.get("args") or {}
                raw_desc = tc_args.get("task_description", "")
                desc_data = {}
                try:
                    if raw_desc and str(raw_desc).startswith("{"):
                        desc_data = json.loads(raw_desc)
                except Exception:
                    pass
                ctx_origin = trip_context.get("origin") or trip_context.get("departure")
                ctx_dest = trip_context.get("destination")
                ctx_in = trip_context.get("checkin") or trip_context.get("check_in")
                ctx_out = trip_context.get("checkout") or trip_context.get("check_out")
                ctx_adults = trip_context.get("adults")
                if not desc_data.get("origin") and ctx_origin:
                    desc_data["origin"] = ctx_origin
                if not desc_data.get("destination") and ctx_dest:
                    desc_data["destination"] = ctx_dest
                if not desc_data.get("checkin") and ctx_in:
                    desc_data["checkin"] = ctx_in
                if not desc_data.get("checkout") and ctx_out:
                    desc_data["checkout"] = ctx_out
                if not desc_data.get("travelers") and ctx_adults:
                    desc_data["travelers"] = {"adults": int(ctx_adults)}
                if desc_data:
                    tc_args["task_description"] = json.dumps(desc_data)
                    tc["args"] = tc_args

        # Intercept update_trip_context tool calls and write directly to state.
        # JSON-string fields (selected_flight, selected_hotel, return_flight,
        # leg_data) are parsed into real dicts so the context is always clean.
        new_context = dict(trip_context or {})
        for tc in tool_calls:
            if tc["name"] == "update_trip_context":
                args = tc.get("args", {})

                # JSON fields: parse from string to dict if the LLM serialised them
                json_fields = ("selected_flight", "selected_hotel", "return_flight")
                for field in json_fields:
                    if field in args and isinstance(args[field], str):
                        import json as _json
                        try:
                            args[field] = _json.loads(args[field])
                        except Exception:
                            pass  # keep as string if unparseable

                # Multi-destination leg: merge into the legs array
                leg_index = args.pop("leg_index", None)
                leg_data_raw = args.pop("leg_data", None)
                if leg_index is not None and leg_data_raw is not None:
                    import json as _json
                    try:
                        leg_data = (
                            _json.loads(leg_data_raw)
                            if isinstance(leg_data_raw, str)
                            else leg_data_raw
                        )
                        existing_legs = list(state.get("trip_context", {}).get("legs", []))
                        # Extend list to fit leg_index (1-based)
                        while len(existing_legs) < leg_index:
                            existing_legs.append({})
                        existing_legs[leg_index - 1].update(leg_data)
                        new_context["legs"] = existing_legs
                        logger.info("Multi-destination: updated leg %d", leg_index)
                    except Exception as e:
                        logger.warning("Failed to merge leg_data: %s", e)

                # Save all remaining non-empty values at top level
                for k, v in args.items():
                    if v is None:
                        continue
                    if isinstance(v, str) and not v.strip():
                        continue
                    # selected_flight dicts must match quick_flight_search cache
                    # (select_searched_flight). Block LLM-fabricated offer ids.
                    if k == "selected_flight" and isinstance(v, dict):
                        cached = (new_context.get("quick_flight_search") or {}).get("results") or []
                        fid = str(v.get("flight_id") or "").strip()
                        oid = str(v.get("offer_id") or v.get("offerId") or "").strip()
                        match = None
                        if fid:
                            match = next(
                                (f for f in cached if isinstance(f, dict) and str(f.get("flight_id") or "") == fid),
                                None,
                            )
                        if match is None and oid:
                            match = next(
                                (
                                    f
                                    for f in cached
                                    if isinstance(f, dict)
                                    and str(f.get("offer_id") or f.get("offerId") or "").strip() == oid
                                ),
                                None,
                            )
                        cache_oid = (
                            str(match.get("offer_id") or match.get("offerId") or "").strip()
                            if isinstance(match, dict)
                            else ""
                        )
                        if match is None or (oid and cache_oid and oid != cache_oid):
                            logger.warning(
                                "Rejecting update_trip_context selected_flight not in quick_flight_search"
                            )
                            continue
                        new_context[k] = match
                        continue
                    new_context[k] = v

        if new_context:
            updates["trip_context"] = new_context
            logger.info("Agent state updated: %s", list(new_context.keys()))

    return updates



def itinerary_node(state: AgentState, config: RunnableConfig):
    """
    Itinerary hand-off node — triggered when `escalate_to_itinerary` fires.

    Hands the conversation off to the real ITINERARY_AGENT multi-agent system
    (ITINERARY_AGENT/ai_travel_planner) via itinerary_bridge, which drives
    ITINERARY_AGENT's own LangGraph nodes one turn at a time — no changes to
    ITINERARY_AGENT itself, and no blocking console I/O.

    trip_context["engine"] flips to "itinerary" so that on the NEXT user
    message, general_agent/agent.py routes straight into
    itinerary_bridge.continue_itinerary_session(...) instead of calling the
    LLM again — Vero stays out of the loop until the itinerary session
    completes (or the user asks to go back to chat).
    """
    thread_id = config.get("configurable", {}).get("thread_id", "default")

    # ── Extract task_description from escalation signal ────────────────────
    task_description = ""
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", None) == "tool":
            content = msg.content or ""
            if _ESCALATION_SIGNAL in content:
                task_m = re.search(r"task=(.+?)(?:\|reason=|$)", content, re.DOTALL)
                if task_m:
                    task_description = task_m.group(1).strip()
                break

    logger.info("Itinerary node: handing off | thread=%s | task=%s", thread_id, task_description[:120])

    itin_state, reply_text, cards = itinerary_bridge.start_itinerary_session(state, task_description)

    merged_context = dict(state.get("trip_context", {}) or {})
    merged_context["engine"] = "itinerary"
    merged_context["itinerary_state"] = itin_state
    if cards:
        merged_context["pending_cards"] = cards

    return {
        "messages": [AIMessage(content=reply_text)],
        "trip_context": merged_context,
    }
