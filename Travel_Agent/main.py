#!/usr/bin/env python3
"""CLI — General Agent entry. Run from Travel_Agent: python main.py"""

import asyncio
import sys

from flight_agent import SessionContext
from flight_agent.logging_config import configure_logging
from itinero import GeneralAgent, OrchestratorInput


async def main() -> None:
    configure_logging()
    agent = GeneralAgent()
    session = SessionContext()
    print("Itinero General Agent — type quit to stop")
    print("Path: Start → General Agent → Itinerary → Travel → Flight → Payment\n")
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
                OrchestratorInput(message=user_input, session_context=session)
            )
            session = result.session_context
            path = " → ".join(result.route_path) if result.route_path else "general_agent"
            print(f"\n[{path}]")
            print(f"Assistant: {result.response}\n")
    finally:
        await agent.aclose()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
