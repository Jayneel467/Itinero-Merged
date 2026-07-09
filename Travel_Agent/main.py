#!/usr/bin/env python3
"""
Interactive CLI for the Flight Agent.

Run from Travel_Agent folder:
  python main.py

Workflow mode (for other developers):
  python main.py --workflow
"""

import argparse
import asyncio
import json
import sys

from flight_agent import FlightAgent, FlightAgentInput, SessionContext
from flight_agent.logging_config import configure_logging, get_logger

logger = get_logger(__name__)


async def flight_repl() -> None:
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

            print(f"\nFlight Agent: {result.response}\n")
            if result.error:
                logger.warning("turn_error", error=result.error)
    finally:
        await agent.aclose()


async def workflow_repl() -> None:
    from travel_agent import FlightWorkflowBridge

    configure_logging()
    bridge = FlightWorkflowBridge()
    await bridge.warm_up()
    session: dict | None = None

    print("Workflow bridge (Travel → Flight) — type 'quit' to stop\n")

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

            handoff = await bridge.handle(
                user_input,
                session_id="cli-workflow",
                session_context=session,
            )
            session = handoff.get("session_context")
            print(f"\n[{handoff['agent']} → {handoff['sub_agent']}] {handoff['response']}\n")
            if handoff.get("itinerary_payload"):
                print("Itinerary payload:")
                print(json.dumps(handoff["itinerary_payload"], indent=2))
                print()
    finally:
        await bridge.close()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

    parser = argparse.ArgumentParser(description="Flight Agent CLI")
    parser.add_argument(
        "--workflow",
        action="store_true",
        help="Run through Travel Agent workflow bridge (for integration testing)",
    )
    args = parser.parse_args()

    if args.workflow:
        asyncio.run(workflow_repl())
    else:
        asyncio.run(flight_repl())
