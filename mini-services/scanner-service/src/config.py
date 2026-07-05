"""
config.py — Centralized configuration for the scanner service.

Reads from environment variables with sensible defaults.
Mirrors the pattern from tokenpay-access-service/index.ts.
"""

from __future__ import annotations

import os


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


# ── Server ─────────────────────────────────────────────────────
PORT: int = _env_int("PORT", 3005)
NODE_ENV: str = _env("NODE_ENV", "development")
IS_PROD: bool = NODE_ENV == "production"

# ── Auth ───────────────────────────────────────────────────────
API_SHARED_KEY: str = _env("API_SHARED_KEY", "scanner-dev-key-2026")

# ── Database ───────────────────────────────────────────────────
DATABASE_PATH: str = _env("DATABASE_PATH", "./data/scanner.db")

# ── VLM (Vision Language Model) via OpenRouter ─────────────────
# Unified with Hermes — uses the same OPENROUTER_API_KEY so all AI
# models are sourced from OpenRouter (more model variety, one key).
# OpenRouter exposes an OpenAI-compatible /chat/completions endpoint
# that supports vision models (e.g. anthropic/claude-sonnet-4.5,
# google/gemini-2.5-flash, etc.).
#
# Migration note: the scanner-service previously called the Anthropic
# SDK directly (ANTHROPIC_API_KEY / ANTHROPIC_MODEL). Those env vars
# are now DEPRECATED — OpenRouter is the single source. The old vars
# are kept only as a fallback so a stale .env doesn't break the service.
OPENROUTER_API_KEY: str = _env("OPENROUTER_API_KEY", "") or _env("ANTHROPIC_API_KEY", "")
OPENROUTER_BASE_URL: str = _env("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
# Default model — a strong vision-capable model on OpenRouter. Override
# via OPENROUTER_VLM_MODEL to use a different one (e.g. a cheaper/free one).
# Browse vision models at: https://openrouter.ai/models?capabilities=image
OPENROUTER_VLM_MODEL: str = _env("OPENROUTER_VLM_MODEL", "anthropic/claude-sonnet-4.5")
OPENROUTER_APP_NAME: str = _env("OPENROUTER_APP_NAME", "AlphaFlow")
OPENROUTER_APP_URL: str = _env("APP_URL", _env("OPENROUTER_APP_URL", "https://alphaflow.dk"))
VLM_MAX_TOKENS: int = _env_int("VLM_MAX_TOKENS", 4096)

# Deprecated — kept only for backward compatibility with old .env files.
# If OPENROUTER_API_KEY is unset but ANTHROPIC_API_KEY is set, we fall
# back to it (see OPENROUTER_API_KEY above). This model slug is NOT used
# anymore — OPENROUTER_VLM_MODEL replaces ANTHROPIC_MODEL.
ANTHROPIC_MODEL: str = _env("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

# ── Webhook ────────────────────────────────────────────────────
HOST_CALLBACK_URL: str = _env("HOST_CALLBACK_URL", "")

# ── Limits ─────────────────────────────────────────────────────
MAX_FILE_SIZE_MB: int = _env_int("MAX_FILE_SIZE_MB", 10)
MAX_FILE_SIZE_BYTES: int = MAX_FILE_SIZE_MB * 1024 * 1024
MAX_PAGES: int = _env_int("MAX_PAGES", 10)

# ── OCR ────────────────────────────────────────────────────────
TESSERACT_LANG: str = _env("TESSERACT_LANG", "dan+eng")

# ── Logging ────────────────────────────────────────────────────
LOG_LEVEL: str = _env("LOG_LEVEL", "info").lower()

# ── Service identity ───────────────────────────────────────────
SERVICE_NAME: str = "AlphaFlow Scanner Service"
SERVICE_VERSION: str = "1.0.0"
