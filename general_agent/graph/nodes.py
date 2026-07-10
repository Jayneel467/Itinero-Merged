"""
Graph nodes for the Itinero orchestrator agent.

Two nodes today:
  - agent_node      : the single LLM reasoning step (handles normal conversation
                      and tool routing). Injects a fresh datetime-aware system
                      prompt on every turn.
  - supervisor_node : handoff stub. Triggered when `escalate_to_supervisor` is
                      called. When supervisor_agent/ is fully built by the team,
                      replace the TODO block inside with a real invocation.

When this grows into multi-agent, new specialist nodes get added here alongside
`agent_node`, and `graph/workflow.py` wires the routing between them.
"""
import logging

from langchain_core.messages import SystemMessage, AIMessage

from models.state import AgentState
from llm.model import get_llm_with_tools
from llm.prompts import build_system_prompt

logger = logging.getLogger(__name__)

# The signal string that escalate_to_supervisor tool returns.
# Kept in sync with llm/tools.py and graph/workflow.py.
_ESCALATION_SIGNAL = "ESCALATE_TO_SUPERVISOR"


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


def supervisor_node(state: AgentState):
    """
    Handoff node — triggered when the `escalate_to_supervisor` tool fires.

    This is an intentional stub. The supervisor_agent/ folder (being built by
    another team member) will contain the real SupervisorAgent. When it's ready,
    replace the TODO block below with a direct invocation:

        # TODO: Replace stub with real supervisor when supervisor_agent/ is ready
        # import sys, os
        # sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../supervisor_agent'))
        # from agent import build_supervisor_agent
        # supervisor = build_supervisor_agent()
        # return supervisor.handle(state)

    Until then, the node:
    1. Logs the escalation with full task/reason detail.
    2. Returns a clear, friendly "connecting you" message to the user.
    """
    # Extract escalation details from the most recent tool message.
    task_info = ""
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", None) == "tool":
            content = msg.content or ""
            if _ESCALATION_SIGNAL in content:
                task_info = content
                break

    logger.info("Supervisor handoff triggered | %s", task_info)

    # --- TODO: Invoke real supervisor_agent here when it's ready ---

    handoff_reply = (
        "On it — I'm connecting you with our specialist planning team. 🔗\n\n"
        "The **Supervisor Agent** will take it from here and coordinate everything "
        "you need across hotels, flights, and itinerary planning.\n\n"
        "_Your request has been captured. The supervisor pipeline will be live shortly — "
        "the team is actively building it._"
    )

    return {"messages": [AIMessage(content=handoff_reply)]}
