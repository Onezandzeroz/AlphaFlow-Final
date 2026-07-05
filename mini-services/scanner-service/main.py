"""
main.py — Entry point for the AlphaFlow Scanner Service.

Runs the FastAPI app via uvicorn on the configured PORT (default 3005).

Usage:
  Development:  uvicorn main:app --host 0.0.0.0 --port 3005 --reload
  Production:   pm2 start ecosystem.config.js (uses this script via python3)

Architecture:
  - FastAPI for async HTTP + multipart file uploads
  - SQLite (WAL mode) for scan_jobs + ocr_results persistence
  - cv2 for image enhancement (port of v10 pipeline)
  - PyMuPDF for PDF text extraction + rendering
  - pytesseract for OCR (dan+eng)
  - OpenRouter for VLM (vision models — unified with Hermes, same API key)
  - HMAC-SHA256 webhook signing (mirror of tokenpay pattern)

Mirrors the layout of tokenpay-access-service/index.ts.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src import config, data_layer
from src.logging_setup import get_logger, setup_logging
from src.routes import router

# ── Logging setup (must be first) ──────────────────────────────
setup_logging()
log = get_logger(__name__)


# ── Validate config on startup ─────────────────────────────────


def _validate_config() -> None:
    """Validate required env vars — fail fast if missing in production."""
    if config.IS_PROD:
        if config.API_SHARED_KEY == "scanner-dev-key-2026":
            log.error("FATAL: API_SHARED_KEY must be set in production (not the dev default)")
            sys.exit(1)
        if not config.OPENROUTER_API_KEY:
            log.error(
                "FATAL: OPENROUTER_API_KEY must be set in production. "
                "Use the same key as Hermes (unified AI source)."
            )
            sys.exit(1)
    elif not config.OPENROUTER_API_KEY:
        log.warning(
            "OPENROUTER_API_KEY not set — VLM extraction will be unavailable. "
            "Only Tesseract + Danish regex parser will be used (lower accuracy on PDFs). "
            "Set OPENROUTER_API_KEY in .env (same key as Hermes)."
        )


# ── Lifespan: startup + shutdown ───────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup + shutdown lifecycle."""
    # ── Startup ──
    log.info(
        "scanner.startup",
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        port=config.PORT,
        env=config.NODE_ENV,
    )

    _validate_config()

    # Initialize SQLite database
    data_layer.init_data_layer(config.DATABASE_PATH)
    log.info("scanner.db_ready", path=config.DATABASE_PATH)

    # Validate Tesseract is available
    try:
        import pytesseract
        version = pytesseract.get_tesseract_version()
        log.info("scanner.tesseract_ready", version=str(version))
    except Exception as e:
        log.warning("scanner.tesseract_missing", error=str(e),
                     hint="Install: sudo apt-get install -y tesseract-ocr tesseract-ocr-dan tesseract-ocr-eng")

    log.info("scanner.listening", port=config.PORT, vlm_enabled=bool(config.OPENROUTER_API_KEY))

    yield

    # ── Shutdown ──
    log.info("scanner.shutdown")
    # Give pending tasks a moment to complete
    await asyncio.sleep(0.1)


# ── App ────────────────────────────────────────────────────────


app = FastAPI(
    title=config.SERVICE_NAME,
    version=config.SERVICE_VERSION,
    description="Document scanning + OCR/VLM extraction for AlphaFlow",
    lifespan=lifespan,
)

# ── CORS (mirror tokenpay pattern) ─────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Access-Service-Key", "X-Company-Id", "X-User-Id"],
)

# ── Routes ─────────────────────────────────────────────────────
app.include_router(router)


# ── Error handlers ─────────────────────────────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    log.error("unhandled_exception", error=str(exc), path=str(request.url))
    from fastapi.responses import JSONResponse
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# ── Main ───────────────────────────────────────────────────────


def main() -> None:
    """Run the uvicorn server."""
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=config.PORT,
        reload=config.NODE_ENV == "development",
        log_level=config.LOG_LEVEL,
        access_log=True,
        workers=1,  # Single worker — match other mini-services (fork mode in PM2)
    )


if __name__ == "__main__":
    # Graceful shutdown via SIGTERM/SIGINT (PM2 sends SIGTERM)
    def _shutdown(signum, frame):
        log.info("scanner.signal_received", signal=signum)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    main()
