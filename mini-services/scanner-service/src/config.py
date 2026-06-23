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

# ── VLM ────────────────────────────────────────────────────────
ANTHROPIC_API_KEY: str = _env("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL: str = _env("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")
VLM_MAX_TOKENS: int = _env_int("VLM_MAX_TOKENS", 4096)

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
