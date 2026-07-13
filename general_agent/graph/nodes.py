"""
Graph nodes for the Itinero orchestrator agent.

Two nodes today:
  - agent_node      : the single LLM reasoning step (handles normal conversation
                      and tool routing). Injects a fresh datetime-aware system
                      prompt on every turn.
  - itinerary_node  : handoff node. Triggered when `escalate_to_itinerary` is
                      called. When itinerary_agent/ is built and ready to integrate,
                      replace the TODO block inside with a direct invocation —
                      one line change, nothing else needs to move.

When this grows into multi-agent, new specialist nodes get added here alongside
`agent_node`, and `graph/workflow.py` wires the routing between them.
"""
import logging

from langchain_core.messages import SystemMessage, AIMessage

from models.state import AgentState
from llm.model import get_llm_with_tools
from llm.prompts import build_system_prompt

logger = logging.getLogger(__name__)

# The signal string that escalate_to_itinerary tool returns.
# Kept in sync with llm/tools.py and graph/workflow.py.
_ESCALATION_SIGNAL = "ESCALATE_TO_ITINERARY"


def agent_node(state: AgentState):
    """The single reasoning node: calls the LLM (with tools bound) on the
    current message history and returns its reply, which may include tool
    calls that the graph will route to the tools node.

    A fresh system prompt is injected on every turn so the agent always has
    the correct current date/time — not a frozen import-time snapshot.
    """
    llm = get_llm_with_tools()
    messages = list(state["messages"])

    # Always use a fresh system message (rebuilds with current datetime each turn).
    fresh_system = SystemMessage(content=build_system_prompt())
    if messages and messages[0].type == "system":
        # Replace the existing (possibly stale) system message.
        messages = [fresh_system] + messages[1:]
    else:
        messages = [fresh_system] + messages

    response = llm.invoke(messages)

    tool_calls = getattr(response, "tool_calls", None)
    if tool_calls:
        names = ", ".join(tc["name"] for tc in tool_calls)
        logger.info("Agent requested tool call(s): %s", names)

    return {"messages": [response]}


def itinerary_node(state: AgentState):
    """
    Handoff node — triggered when the `escalate_to_itinerary` tool fires.

    Architecture note:
    The itinerary_agent/ is being built as an independent agent. When it's
    ready to integrate, replace the TODO block below with a single call:

        # TODO: Replace stub with real itinerary_agent when it's ready to integrate
        # import sys, os
        # sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../itinerary_agent'))
        # from agent import build_itinerary_agent
        # itinerary = build_itinerary_agent()
        # return itinerary.handle(state)

    Until then, the node:
    1. Logs the escalation with full task/reason detail.
    2. Returns a friendly "on it" message to the user.
    """
    # Extract escalation details from the most recent tool message.
    task_info = ""
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", None) == "tool":
            content = msg.content or ""
            if _ESCALATION_SIGNAL in content:
                task_info = content
                break

    logger.info("Itinerary Agent handoff triggered | %s", task_info)

    # --- TODO: Invoke real itinerary_agent here when it's ready to integrate ---

    handoff_reply = (
        "On it — handing this off to the Itinerary Agent now. 🗓️\n\n"
        "It'll put together everything you need — day-by-day plan, hotels, "
        "flights, and the full logistics.\n\n"
        "_Your request has been captured. The itinerary pipeline will be live shortly — "
        "the team is actively building it._"
    )

    return {"messages": [AIMessage(content=handoff_reply)]}
