"""
Public entrypoint for the Itinero orchestrator agent.

This is the one module other code (main.py, a future supervisor agent, an
MCP server, an API layer) should import from. The internal layout
(models/, providers/, services/, llm/, graph/) can be reorganized freely
later without breaking anything that imports from here.
"""
from langchain_core.messages import HumanMessage

from graph.workflow import build_graph


def _extract_places_from_messages(messages) -> list:
    """Pull structured places from search_places tool message content."""
    try:
        from services.travel_service import extract_places_json
    except ImportError:
        try:
            from general_agent.services.travel_service import extract_places_json
        except ImportError:
            return []

    places: list = []
    for msg in messages or []:
        if getattr(msg, "type", None) != "tool":
            continue
        name = getattr(msg, "name", None) or ""
        content = getattr(msg, "content", None) or ""
        if name and name != "search_places" and "PLACES_JSON" not in str(content):
            continue
        found = extract_places_json(str(content))
        if found:
            places = found  # keep latest search_places batch
    return places


class ItineroAgent:
    """Thin public wrapper around the compiled LangGraph app."""

    def __init__(self):
        self._app = build_graph()
        # Set after each invoke — structured Places for Vero cards.
        self.last_places: list = []

    def invoke(self, message: str, thread_id: str = "default") -> str:
        """Send one user message and get back the agent's reply text.

        `thread_id` scopes conversation memory - use a distinct id per
        conversation/session so unrelated users/sessions don't share
        history.

        After invoke, `self.last_places` holds any structured place cards
        from a `search_places` tool call (may be empty).
        """
        config = {"configurable": {"thread_id": thread_id}}
        result = self._app.invoke(
            {"messages": [HumanMessage(content=message)], "trip_context": {}},
            config=config,
        )
        messages = result.get("messages") or []
        self.last_places = _extract_places_from_messages(messages)
        content = messages[-1].content if messages else ""
        return content

    def stream(self, message: str, thread_id: str = "default"):
        """Yield incremental graph updates for one user message - useful
        for a future streaming UI or when this agent is called from a
        supervisor that wants intermediate progress."""
        config = {"configurable": {"thread_id": thread_id}}
        yield from self._app.stream(
            {"messages": [HumanMessage(content=message)], "trip_context": {}},
            config=config,
        )


def build_agent() -> ItineroAgent:
    """Factory - construct a ready-to-use ItineroAgent instance."""
    return ItineroAgent()
