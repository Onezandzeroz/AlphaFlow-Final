"""
logging_setup.py — Structured logging via structlog.

JSON output in production, pretty console output in development.
"""

from __future__ import annotations

import logging
import sys

import structlog

from . import config


def setup_logging() -> None:
    """Configure structlog + stdlib logging — call once on startup."""
    level = getattr(logging, config.LOG_LEVEL.upper(), logging.INFO)

    # Stdlib root logger
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    # structlog processors
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if config.IS_PROD:
        # JSON output for production (PM2 / log aggregation)
        renderer = structlog.processors.JSONRenderer()
    else:
        # Pretty colored output for dev
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=shared_processors + [renderer],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    """Get a structured logger."""
    return structlog.get_logger(name)
