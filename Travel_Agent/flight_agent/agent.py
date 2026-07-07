"""Flight Agent public entry point."""

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.errors import GraphRecursionError

from flight_agent.config import get_settings
from flight_agent.graph.state import NodeDependencies
from flight_agent.graph.workflow import build_flight_graph
from flight_agent.llm.nlp import FlightNLP
from flight_agent.llm.confirmation import apply_user_confirmation
from flight_agent.llm.query_understanding import analyze_user_query, apply_query_hints
from flight_agent.llm.user_copy import clarification_prompt, is_technical_error, sanitize_assistant_text
from flight_agent.llm.tools import TOOL_TO_INTENT
from flight_agent.logging_config import configure_logging, get_logger
from flight_agent.models.agent import FlightAgentInput, FlightAgentOutput, SessionContext
from flight_agent.models.intents import FlightIntent
from flight_agent.providers.liteapi_provider import LiteAPIProvider
from flight_agent.services.flight_service import FlightService

logger = get_logger(__name__)


def _final_response(messages: list) -> str:
    """Return the last assistant text message (after any tool loop)."""
    for msg in reversed(messages):
        if isinstance(msg, AIMessage) and msg.content and not msg.tool_calls:
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return ""


def _intent_from_tool(tool_name: str | None) -> FlightIntent:
    if tool_name and tool_name in TOOL_TO_INTENT:
        return TOOL_TO_INTENT[tool_name]
    return FlightIntent.GENERAL


class FlightAgent:
    """
    Production Flight Agent orchestrated by LangGraph.

    The LLM selects LiteAPI tools based on conversation context.
    """

    def __init__(
        self,
        *,
        flight_service: FlightService | None = None,
        nlp: FlightNLP | None = None,
    ) -> None:
        settings = get_settings()
        provider = LiteAPIProvider(settings)
        self._flight_service = flight_service or FlightService(provider, settings)
        self._nlp = nlp or FlightNLP(settings)
        deps = NodeDependencies(flight_service=self._flight_service, nlp=self._nlp)
        self._graph = build_flight_graph(deps)

    async def run(self, input_data: FlightAgentInput) -> FlightAgentOutput:
        """Process a user message through the LangGraph tool-calling loop."""
        session = input_data.session_context or SessionContext()
        apply_user_confirmation(input_data.message, session)
        query_hints = analyze_user_query(input_data.message, session)
        apply_query_hints(input_data.message, session, query_hints)
        logger.info(
            "agent_run_start",
            session_id=input_data.session_id,
            message_preview=input_data.message[:80],
            intents=query_hints.intents,
            booking_step=query_hints.booking_step,
        )

        messages: list = []
        for turn in input_data.history[-12:]:
            role = turn.get("role", "")
            content = turn.get("content", "")
            if not content:
                continue
            if role == "user":
                messages.append(HumanMessage(content=content))
            elif role == "assistant":
                messages.append(AIMessage(content=content))
        messages.append(HumanMessage(content=input_data.message))

        initial_state = {
            "messages": messages,
            "session": session,
            "last_tool": None,
            "operation_result": None,
            "error": None,
            "user_message": input_data.message,
            "query_hints": query_hints,
        }

        settings = get_settings()
        try:
            final_state = await self._graph.ainvoke(
                initial_state,
                config={"recursion_limit": settings.agent_recursion_limit},
            )
        except GraphRecursionError:
            logger.warning("agent_recursion_limit", limit=settings.agent_recursion_limit)
            return FlightAgentOutput(
                response=clarification_prompt(
                    "Let's take it step by step — share your trip or booking details."
                ),
                intent=FlightIntent.GENERAL,
                session_context=session,
                operation_result=(
                    {
                        "offers": session.last_search_results[:5],
                        "total_offers": len(session.last_search_results),
                    }
                    if session.last_search_results
                    else None
                ),
                error=None,
                needs_follow_up=True,
            )
        except Exception as exc:
            logger.exception("agent_run_failed", error=str(exc))
            return FlightAgentOutput(
                response=clarification_prompt(),
                intent=FlightIntent.GENERAL,
                session_context=session,
                operation_result=None,
                error=None,
                needs_follow_up=True,
            )
        last_tool = final_state.get("last_tool")
        intent = _intent_from_tool(last_tool)
        response = sanitize_assistant_text(_final_response(final_state.get("messages") or []))
        if not response.strip():
            response = clarification_prompt()
        elif is_technical_error(response):
            response = clarification_prompt()

        raw_error = final_state.get("error")
        user_error = None
        if raw_error and not is_technical_error(str(raw_error)):
            user_error = sanitize_assistant_text(str(raw_error))

        output = FlightAgentOutput(
            response=response,
            intent=intent,
            session_context=final_state.get("session") or session,
            operation_result=final_state.get("operation_result"),
            error=user_error,
            needs_follow_up=not last_tool and bool(response),
        )

        logger.info(
            "agent_run_complete",
            intent=intent.value,
            last_tool=last_tool,
            has_error=bool(output.error),
        )
        return output

    async def aclose(self) -> None:
        """Release provider resources."""
        await self._flight_service.close()

    async def warm_up(self) -> None:
        """Pre-open LiteAPI connection for lower first-search latency."""
        await self._flight_service._provider.warm_up()


def create_flight_agent() -> FlightAgent:
    """Factory function for dependency injection / MCP server wiring."""
    configure_logging()
    return FlightAgent()
