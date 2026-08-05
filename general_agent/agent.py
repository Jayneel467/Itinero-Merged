"""
Public entrypoint for the Itinero orchestrator agent.

This is the one module other code (main.py, the itinerary agent,
an MCP server, an API layer) should import from. The internal layout
(models/, providers/, services/, llm/, graph/) can be reorganized freely
later without breaking anything that imports from here.
"""
import json
from langchain_core.messages import AIMessage, HumanMessage

from graph.workflow import build_graph
import itinerary_bridge


class ItineroAgent:
    """Thin public wrapper around the compiled LangGraph app."""

    def __init__(self):
        self._app = build_graph()

    def invoke(self, message: str, thread_id: str = "default") -> str:
        """Send one user message and get back the agent's reply text."""
        res = self.invoke_with_cards(message, thread_id=thread_id)
        return res["reply"]

    def invoke_with_cards(self, message: str, thread_id: str = "default") -> dict:
        """Send one user message and get back both reply text and cards metadata (if any).

        Routing: trip_context["engine"] decides who owns this turn. When it's
        "itinerary" (set by graph/nodes.py::itinerary_node on handoff), the
        message is driven straight into the real ITINERARY_AGENT session via
        itinerary_bridge — Vero's LLM is not called at all for that turn.
        Otherwise this falls through to the normal General Agent graph.

        Unified memory: every itinerary-flow turn is ALSO appended to Vero's
        own `messages` list (via update_state's add_messages reducer), so
        Vero's own conversation history has no blind spot for what happened
        during the hand-off — not just the truncated summary left behind in
        trip_context once the session completes.
        """
        config = {"configurable": {"thread_id": thread_id}}

        snapshot = self._app.get_state(config)
        trip_context = dict((snapshot.values or {}).get("trip_context", {}) or {})

        if trip_context.get("engine") == "itinerary" and not itinerary_bridge.is_exit_request(message):
            itin_state = trip_context.get("itinerary_state") or {}
            result = itinerary_bridge.continue_itinerary_session(itin_state, message)
            reply_text = result["reply"]

            if result["complete"]:
                trip_context.update(itinerary_bridge.extract_final_result(result["state"]))
                trip_context["engine"] = "general"
                trip_context.pop("itinerary_state", None)
            else:
                trip_context["itinerary_state"] = result["state"]

            self._app.update_state(config, {
                "trip_context": trip_context,
                "messages": [HumanMessage(content=message), AIMessage(content=reply_text)],
            })
            return {"reply": reply_text, "cards": result.get("cards")}

        if trip_context.get("engine") == "itinerary":
            # Exit request — drop the itinerary session and let Vero handle
            # this message normally below.
            trip_context.pop("itinerary_state", None)
            trip_context["engine"] = "general"
            self._app.update_state(config, {"trip_context": trip_context})

        result = self._app.invoke(
            {"messages": [HumanMessage(content=message)], "trip_context": {}},
            config=config,
        )
        all_msgs = result.get("messages", [])
        reply_text = all_msgs[-1].content if all_msgs else ""

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
                if "[CARDS_DATA:" in content:
                    try:
                        start_idx = content.index("[CARDS_DATA:") + len("[CARDS_DATA:")
                        end_idx = content.rindex("]")
                        json_str = content[start_idx:end_idx].strip()
                        cards_data = json.loads(json_str)
                        break
                    except Exception:
                        pass

        # If escalation fired THIS turn (engine flipped general -> itinerary),
        # the reply is the itinerary hand-off's own confirmation message,
        # which never legitimately carries cards. If the LLM also called
        # search_flights/search_hotels in the same turn (against prompt
        # guidance — see llm/prompts.py's TOOL CALL DISCIPLINE), that tool's
        # cards would otherwise leak onto an unrelated message. Drop them.
        new_trip_context = result.get("trip_context", {}) or {}
        if new_trip_context.get("engine") == "itinerary":
            cards_data = None

        return {
            "reply": reply_text,
            "cards": cards_data,
        }

    def stream(self, message: str, thread_id: str = "default"):
        config = {"configurable": {"thread_id": thread_id}}
        yield from self._app.stream(
            {"messages": [HumanMessage(content=message)], "trip_context": {}},
            config=config,
        )



def build_agent() -> ItineroAgent:
    """Factory - construct a ready-to-use ItineroAgent instance."""
    return ItineroAgent()
