"""Structured logging for the Flight Agent."""

from __future__ import annotations

import logging
import sys

import structlog

from flight_agent.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level, logging.INFO)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
        cache_logger_on_first_use=True,
    )
    logging.basicConfig(format="%(message)s", stream=sys.stderr, level=level)


def get_logger(name: str):
    return structlog.get_logger(name)
