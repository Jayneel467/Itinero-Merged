"""
Chat model setup for the Itinero orchestrator agent.
"""
from langchain_openai import ChatOpenAI

from general_agent.config import MODEL_NAME, MODEL_TEMPERATURE, OPENAI_API_KEY
from llm.tools import ALL_TOOLS


def get_llm():
    """Return the base chat model, without tools bound."""
    return ChatOpenAI(
        model=MODEL_NAME,
        temperature=MODEL_TEMPERATURE,
        api_key=OPENAI_API_KEY,
        max_retries=5,
    )



def get_llm_with_tools():
    """Return the chat model with all tools bound - this is what the agent node calls."""
    return get_llm().bind_tools(ALL_TOOLS)
