"""
Public entrypoint for the Itinero orchestrator agent.

This is the one module other code (main.py, a future supervisor agent, an
MCP server, an API layer) should import from. The internal layout
(models/, providers/, services/, llm/, graph/) can be reorganized freely
later without breaking anything that imports from here.
"""
from langchain_core.messages import HumanMessage

from graph.workflow import build_graph


class ItineroAgent:
    """Thin public wrapper around the compiled LangGraph app."""

    def __init__(self):
        self._app = build_graph()

    def invoke(self, message: str, thread_id: str = "default") -> str:
        """Send one user message and get back the agent's reply text.

        `thread_id` scopes conversation memory - use a distinct id per
        conversation/session so unrelated users/sessions don't share
        history.
        """
        config = {"configurable": {"thread_id": thread_id}}
        result = self._app.invoke(
            {"messages": [HumanMessage(content=message)], "trip_context": {}},
            config=config,
        )
        return result["messages"][-1].content

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
