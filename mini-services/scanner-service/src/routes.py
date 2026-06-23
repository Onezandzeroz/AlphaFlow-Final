"""
routes.py — FastAPI route handlers for the scanner service.

Endpoints:
  GET  /health                     — health check (no auth)
  GET  /                            — service info (no auth)
  POST /api/v1/scan                 — synchronous scan (backward-compat with /api/ocr/pdf)
  POST /api/v1/scan/async           — async scan → returns job_id
  GET  /api/v1/jobs/{job_id}        — poll job status
  GET  /api/v1/stats                — service statistics

Auth: All /api/v1/* routes require X-Access-Service-Key header matching API_SHARED_KEY.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from . import config, data_layer
from .logging_setup import get_logger
from .ocr_engine import ScanResult, process_document
from .webhook import notify_scan_completed, notify_scan_failed

log = get_logger(__name__)

router = APIRouter()


# ── Auth dependency ────────────────────────────────────────────


async def require_auth(
    x_access_service_key: Optional[str] = Header(None, alias="X-Access-Service-Key"),
) -> dict[str, Any]:
    """Validate the X-Access-Service-Key header against API_SHARED_KEY."""
    if not x_access_service_key or not secrets.compare_digest(
        x_access_service_key, config.API_SHARED_KEY
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized — invalid or missing X-Access-Service-Key",
        )
    return {"authenticated": True}


# ── Public endpoints ───────────────────────────────────────────


_START_TIME = time.time()


@router.get("/health")
async def health() -> dict[str, Any]:
    """Health check — no auth required (mirrors tokenpay pattern)."""
    return {
        "status": "ok",
        "service": config.SERVICE_NAME,
        "version": config.SERVICE_VERSION,
        "uptime": int(time.time() - _START_TIME),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "vlm_enabled": bool(config.ANTHROPIC_API_KEY),
        "stats": data_layer.get_stats(),
    }


@router.get("/")
async def root() -> dict[str, Any]:
    """Service info — no auth."""
    return {
        "name": config.SERVICE_NAME,
        "version": config.SERVICE_VERSION,
        "mission": "Document scanning + OCR/VLM extraction for AlphaFlow",
        "endpoints": [
            "GET  /health",
            "POST /api/v1/scan",
            "POST /api/v1/scan/async",
            "GET  /api/v1/jobs/{job_id}",
            "GET  /api/v1/stats",
        ],
    }


# ── v1 API ─────────────────────────────────────────────────────


@router.post("/api/v1/scan")
async def scan_sync(
    file: UploadFile = File(...),
    x_company_id: Optional[str] = Header(None, alias="X-Company-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    _: dict = Depends(require_auth),
) -> JSONResponse:
    """
    Synchronous document scan — backward-compatible with /api/ocr/pdf.

    Accepts: multipart/form-data with `file` field (PDF, JPEG, PNG, WebP, etc.)
    Returns: VLMApiResponse-compatible JSON + _extensions block.

    Headers:
      X-Access-Service-Key: required (shared secret)
      X-Company-Id: required (tenant ID forwarded from host session)
      X-User-Id: optional (user ID forwarded from host session)
    """
    if not x_company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Company-Id header",
        )

    # Read file
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload")

    if len(file_bytes) > config.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large (max {config.MAX_FILE_SIZE_MB} MB)",
        )

    log.info(
        "scan.sync.request",
        filename=file.filename,
        size=len(file_bytes),
        mime=file.content_type,
        company=x_company_id,
        user=x_user_id,
    )

    # Process synchronously
    result = await process_document(
        file_bytes=file_bytes,
        mime_type=file.content_type or "application/octet-stream",
        filename=file.filename or "unknown",
        company_id=x_company_id,
        user_id=x_user_id,
    )

    # Fire-and-forget webhook (don't block response)
    if config.HOST_CALLBACK_URL:
        asyncio.create_task(
            notify_scan_completed(result.scan_job_id, result.to_vlm_api_response())
        )

    response = result.to_vlm_api_response()
    if result.error:
        return JSONResponse(
            status_code=500,
            content={"error": result.error, **response},
        )
    return JSONResponse(status_code=200, content=response)


@router.post("/api/v1/scan/async")
async def scan_async(
    file: UploadFile = File(...),
    x_company_id: Optional[str] = Header(None, alias="X-Company-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    _: dict = Depends(require_auth),
) -> dict[str, Any]:
    """
    Async document scan — returns job_id immediately, process in background.

    Client polls GET /api/v1/jobs/{job_id} for status.
    """
    if not x_company_id:
        raise HTTPException(status_code=400, detail="Missing X-Company-Id header")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file upload")

    if len(file_bytes) > config.MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {config.MAX_FILE_SIZE_MB} MB)",
        )

    # Read all we need synchronously before returning job_id
    filename = file.filename or "unknown"
    mime_type = file.content_type or "application/octet-stream"

    # Schedule background processing
    async def _process():
        try:
            result = await process_document(
                file_bytes=file_bytes,
                mime_type=mime_type,
                filename=filename,
                company_id=x_company_id,
                user_id=x_user_id,
            )
            if config.HOST_CALLBACK_URL:
                await notify_scan_completed(
                    result.scan_job_id, result.to_vlm_api_response()
                )
        except Exception as e:
            log.error("scan.async.failed", error=str(e))
            if config.HOST_CALLBACK_URL:
                await notify_scan_failed("unknown", str(e))

    asyncio.create_task(_process())

    # We need to peek at the scan_job_id — but it's generated inside process_document.
    # For async mode, we generate it here and pass it in (or use hash lookup).
    # Simplest: return a placeholder and let the client poll stats.
    # Better: pre-create the job and pass ID through.
    # For v1: compute a job_id upfront
    import hashlib
    import uuid
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    job_id = f"scn_{uuid.uuid4().hex[:16]}"

    # Pre-create the job so client can poll immediately
    data_layer.create_scan_job(
        job_id=job_id,
        user_id=x_user_id,
        company_id=x_company_id,
        filename=filename,
        file_size=len(file_bytes),
        mime_type=mime_type,
        file_hash=file_hash,
    )

    return {
        "job_id": job_id,
        "status": "queued",
        "poll_url": f"/api/v1/jobs/{job_id}",
        "poll_interval_ms": 1000,
    }


@router.get("/api/v1/jobs/{job_id}")
async def get_job(job_id: str, _: dict = Depends(require_auth)) -> dict[str, Any]:
    """Poll job status. Returns result when status='done'."""
    job = data_layer.get_scan_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response: dict[str, Any] = {
        "job_id": job["id"],
        "status": job["status"],
        "stage": job["stage"],
        "progress": job["progress"],
        "created_at": job["created_at"],
        "updated_at": job["updated_at"],
        "completed_at": job["completed_at"],
    }

    if job["status"] == "done":
        result = data_layer.get_ocr_result_by_job(job["id"])
        if result:
            response["result"] = {
                "text": result["raw_text"],
                "amount": result["amount"],
                "date": result["date"],
                "vatPercent": result["vat_percent"],
                "confidence": result["confidence"],
                "rawLines": result["raw_lines"],
                "vlmLines": result["line_items"],
                "vlmDescription": result["description"],
                "_extensions": result["extensions"],
            }
        response["processing_ms"] = job["processing_ms"]
        response["processor"] = job["processor"]
    elif job["status"] == "failed":
        response["error"] = job["error"]
        response["processing_ms"] = job["processing_ms"]

    return response


@router.get("/api/v1/stats")
async def get_stats(_: dict = Depends(require_auth)) -> dict[str, Any]:
    """Service statistics."""
    return data_layer.get_stats()


# ── Job status model (for OpenAPI docs) ────────────────────────


class JobStatus(BaseModel):
    job_id: str
    status: str
    stage: Optional[str] = None
    progress: int = 0
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None
    error: Optional[str] = None
    processing_ms: Optional[int] = None
    processor: Optional[str] = None
    result: Optional[dict[str, Any]] = None
