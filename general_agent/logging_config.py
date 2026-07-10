"""
Logging setup for the Itinero agent.

Deliberately lightweight - stdlib `logging` with a consistent format, no
new dependency. This is a local, always-available complement to LangSmith
tracing (see README): LangSmith gives you the full trace tree when you have
network access to it, this gives you a plain log file/console output that
works even offline. Swap the formatter for `structlog` later if you want
richer structured (JSON) output - call sites use the standard
`logging.getLogger(__name__)` pattern throughout, so nothing else changes.
"""
import logging
import sys


def configure_logging(level: int = logging.INFO) -> None:
    """Call once at startup (see main.py) to set up console logging with a
    consistent, greppable format across all modules."""
    logging.basicConfig(
        level=level,
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        stream=sys.stdout,
    )
