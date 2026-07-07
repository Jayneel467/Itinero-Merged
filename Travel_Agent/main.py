#!/usr/bin/env python3
"""
Interactive CLI for the Flight Agent.

Run: python main.py
Requires OPENAI_API_KEY (GPT) or GROQ_API_KEY (Groq), and API_KEY (LiteAPI) in .env
"""

import asyncio
import sys

from flight_agent import FlightAgent, FlightAgentInput, SessionContext
from flight_agent.logging_config import configure_logging, get_logger

logger = get_logger(__name__)


async def repl() -> None:
    configure_logging()
    agent = FlightAgent()
    session = SessionContext()

    print("Flight Agent — type 'quit' or 'exit' to stop\n")

    try:
        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\nGoodbye!")
                break

            if not user_input:
                continue
            if user_input.lower() in {"quit", "exit", "q"}:
                print("Goodbye!")
                break

            result = await agent.run(
                FlightAgentInput(message=user_input, session_context=session)
            )
            session = result.session_context

            print(f"\nAgent: {result.response}\n")
            if result.error:
                logger.warning("turn_error", error=result.error)
    finally:
        await agent.aclose()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(repl())
