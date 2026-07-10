"""
CLI entrypoint for the Itinero orchestrator agent.

Run with: python main.py
"""
from general_agent.config import validate_config
from general_agent.logging_config import configure_logging
from general_agent.agent import build_agent


def main():
    configure_logging()
    validate_config()
    itinero = build_agent()

    thread_id = "cli-session-1"  # one conversation "memory" per thread_id

    print("Itinero - your AI travel assistant. Type 'exit' to quit.\n")

    while True:
        user_input = input("You: ").strip()
        if user_input.lower() in {"exit", "quit"}:
            break
        if not user_input:
            continue

        reply = itinero.invoke(user_input, thread_id=thread_id)
        print(f"\nItinero: {reply}\n")


if __name__ == "__main__":
    main()
