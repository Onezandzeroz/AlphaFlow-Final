"""
webhook.py — HMAC-SHA256 webhook signing + dispatch.

Mirrors the pattern from tokenpay-access-service/src/notification.ts:
  - Signs payload body with API_SHARED_KEY using HMAC-SHA256
  - Sends with X-Scanner-Signature + X-Scanner-Event headers
  - Fire-and-forget (failures logged, never block scan)
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from typing import Any

import httpx

from . import config
from .logging_setup import get_logger

log = get_logger(__name__)


def sign_payload(body: str, secret: str = config.API_SHARED_KEY) -> str:
    """Sign a payload body with HMAC-SHA256 → hex digest."""
    return hmac.new(
        secret.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


async def send_webhook(
    event: str,
    payload: dict[str, Any],
    callback_url: str | None = None,
) -> bool:
    """
    Send a signed webhook to the host app.

    Args:
        event: Event name (e.g. "scan.completed", "scan.failed")
        payload: Dict to send as JSON body
        callback_url: Override HOST_CALLBACK_URL (optional)

    Returns:
        True if delivered, False on failure (logged but not raised)
    """
    url = callback_url or config.HOST_CALLBACK_URL
    if not url:
        return False

    body = json.dumps(payload, ensure_ascii=False, default=str)
    signature = sign_payload(body)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Scanner-Signature": signature,
                    "X-Scanner-Event": event,
                },
            )
            if response.status_code < 300:
                log.info("webhook.delivered", event=event, url=url, status=response.status_code)
                return True
            log.warning(
                "webhook.failed",
                event=event,
                url=url,
                status=response.status_code,
                body=response.text[:200],
            )
            return False
    except Exception as e:
        log.warning("webhook.error", event=event, url=url, error=str(e))
        return False


async def notify_scan_completed(scan_job_id: str, result: dict[str, Any]) -> None:
    """Fire-and-forget webhook for scan completion."""
    await send_webhook(
        event="scan.completed",
        payload={
            "event": "scan.completed",
            "scanJobId": scan_job_id,
            "result": result,
        },
    )


async def notify_scan_failed(scan_job_id: str, error: str) -> None:
    """Fire-and-forget webhook for scan failure."""
    await send_webhook(
        event="scan.failed",
        payload={
            "event": "scan.failed",
            "scanJobId": scan_job_id,
            "error": error,
        },
    )
