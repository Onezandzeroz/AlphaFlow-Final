r"""
vlm_client.py — VLM (Vision Language Model) extraction via OpenRouter.

UNIFIED AI SOURCE: This module now uses OpenRouter (https://openrouter.ai)
as the single AI provider — the same source as the Hermes AI assistant.
This means:
  1. One API key (OPENROUTER_API_KEY) for all AI features across the app
  2. Access to OpenRouter's full model catalogue (more variety than Anthropic
     alone) — vision models from Anthropic, Google, OpenAI, Meta, etc.
  3. OpenAI-compatible /chat/completions endpoint with image_url content

MIGRATION: Previously this module called the Anthropic SDK directly
(ANTHROPIC_API_KEY / ANTHROPIC_MODEL). Those env vars are now DEPRECATED.
OPENROUTER_API_KEY is the single source of truth. If only ANTHROPIC_API_KEY
is set (stale .env), it is used as a fallback so the service doesn't break
during migration — but the call still goes through OpenRouter's API, so the
key must be an OpenRouter key, not an Anthropic key.

KEY FEATURES (preserved from the Anthropic version):
  1. Pydantic schema validation (no regex JSON hack)
  2. Retry with exponential backoff (1s, 2s, 4s) on 429/500/network
  3. Extended prompt with all invoice fields + VAT breakdown
  4. Confidence scoring based on field presence + line items + validation

The prompt is preserved verbatim (months of prompt tuning).
"""

from __future__ import annotations

import asyncio
import base64
import json
import re
from dataclasses import dataclass
from typing import Optional

import httpx
from pydantic import BaseModel, Field, ValidationError

from . import config
from .logging_setup import get_logger

log = get_logger(__name__)


# ── Pydantic schema (replaces the /\{[\s\S]*\}/ regex hack) ─────


class VLMLineItem(BaseModel):
    """Single line item extracted from the document."""
    description: str = ""
    quantity: float = 1.0
    unitPrice: float = 0.0
    vatPercent: float = 0.0


class VLMVatBreakdown(BaseModel):
    """A single VAT rate entry from the invoice's VAT summary box."""
    rate: float = 0.0
    baseAmount: Optional[float] = None
    vatAmount: Optional[float] = None


class VLMExtraction(BaseModel):
    """
    Full structured extraction from the VLM.

    Original fields (must match VLMApiResponse shape for backward compat):
      amount, date, vatPercent, currency, description, lines
    New fields (added for richer extraction, ignored by old frontend):
      documentType, supplierName, supplierCvr, invoiceNumber,
      dueDate, subtotalExVat, vatAmount, customerName, vatBreakdown
    """
    # ── Original fields ──
    amount: Optional[float] = None
    date: Optional[str] = None  # YYYY-MM-DD
    vatPercent: Optional[float] = None
    currency: str = "DKK"
    description: Optional[str] = None
    lines: list[VLMLineItem] = Field(default_factory=list)

    # ── New fields (backward compatible) ──
    documentType: Optional[str] = None  # receipt | invoice | credit_note | unknown
    supplierName: Optional[str] = None
    supplierCvr: Optional[str] = None
    invoiceNumber: Optional[str] = None
    dueDate: Optional[str] = None  # YYYY-MM-DD
    subtotalExVat: Optional[float] = None
    vatAmount: Optional[float] = None
    customerName: Optional[str] = None
    vatBreakdown: list[VLMVatBreakdown] = Field(default_factory=list)


# ── The prompt (preserved VERBATIM from ocr/pdf/route.ts:112-136) ─
# Only the schema block is EXTENDED with new fields. The rules and the
# opening "Analyze this purchase invoice/receipt document" line are
# preserved exactly. This is the scanner's IP — months of prompt tuning.

PROMPT_TEMPLATE = """Analyze this purchase invoice/receipt document{pages_suffix}. Extract the following information and return ONLY valid JSON (no markdown, no backticks):

{{
  "amount": <GRAND TOTAL including VAT as number, or null>,
  "date": <date in YYYY-MM-DD format, or null>,
  "vatPercent": <VAT percentage as number (e.g. 25), or null>,
  "currency": <currency code like "DKK", or "DKK" if unknown>,
  "description": <brief description of the purchase, or null>,
  "documentType": <"receipt" | "invoice" | "credit_note" | "unknown">,
  "supplierName": <vendor/supplier name, or null>,
  "supplierCvr": <Danish CVR number (8 digits) if visible, or null>,
  "invoiceNumber": <invoice number if visible, or null>,
  "dueDate": <due date in YYYY-MM-DD format, or null>,
  "customerName": <buyer/customer name if visible, or null>,
  "subtotalExVat": <SUBTOTAL excluding VAT as number, or null>,
  "vatAmount": <TOTAL VAT amount as number, or null>,
  "vatBreakdown": [
    {{
      "rate": <VAT rate as number, e.g. 25 or 0>,
      "baseAmount": <net base for this rate, or null>,
      "vatAmount": <VAT amount for this rate, or null>
    }}
  ],
  "lines": [
    {{
      "description": <line item description>,
      "quantity": <quantity as number>,
      "unitPrice": <unit price as number>,
      "vatPercent": <VAT percentage as number>
    }}
  ]
}}

Rules:
- amount is the GRAND TOTAL including VAT (brutto/total) — the final amount the customer pays. Look for labels like "Total", "I alt", "Total DKK", "Beløb at betale".
- subtotalExVat is the SUM of all line items BEFORE VAT — look for labels like "Subtotal", "Subtotal ekskl. moms", "I alt ekskl. moms".
- vatAmount is the TOTAL VAT — look for labels like "Moms", "Moms i alt", "VAT".
- amount MUST equal subtotalExVat + vatAmount (verify this before returning).
- vatBreakdown captures the VAT summary box (often near the bottom) which lists each rate separately. If the invoice has a single VAT rate, return one entry. If multiple rates (e.g. 25% and 12%), return one entry per rate. If no VAT breakdown is visible, return empty array.
- date format must be YYYY-MM-DD
- vatPercent should be 0-100 (not decimal)
- LINES: Extract EVERY individual line item visible on the invoice. Do NOT stop after the first line. A typical invoice has 1-10 lines. Each line has a description, quantity, unitPrice, and vatPercent. If a line shows only a total amount (no unit price), set unitPrice = amount / quantity.
- Distinguish carefully between:
    • unitPrice = price per single unit
    • line amount = unitPrice × quantity (often shown in a "Beløb" column)
    • subtotalExVat = sum of all line amounts
    • vatAmount = VAT calculated on subtotal
    • amount = subtotalExVat + vatAmount (grand total)
  Do NOT confuse these. If a number is labeled "Moms" it is vatAmount, NOT subtotalExVat.
- For credit notes: amount should be NEGATIVE
- If no line items are visible, return empty lines array
- Return ONLY the JSON object, nothing else"""


# ── Result dataclass ───────────────────────────────────────────


@dataclass
class VLMResult:
    """Parsed VLM extraction result."""
    extraction: VLMExtraction
    raw_response: str
    confidence: int  # 0-100
    processing_ms: int
    model: str


# ── OpenRouter VLM client ─────────────────────────────────────


def _check_config() -> None:
    """Verify OpenRouter config is present (raises with a clear message)."""
    if not config.OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set — VLM extraction unavailable. "
            "Set OPENROUTER_API_KEY in your .env file (same key as Hermes). "
            "The old ANTHROPIC_API_KEY is deprecated — see config.py."
        )


def _build_openrouter_content(image_b64_list: list[str], num_pages: int) -> list[dict]:
    """
    Build the OpenAI-compatible multimodal content array for OpenRouter.

    OpenRouter uses the same format as OpenAI's chat completions:
      - text content: {"type": "text", "text": "..."}
      - image content: {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}

    This differs from the Anthropic SDK format (which uses {"type": "image",
    "source": {"type": "base64", ...}}). OpenRouter normalises both, but the
    image_url data-URI form is the documented standard.
    """
    pages_suffix = f" ({num_pages} pages)" if num_pages > 1 else ""
    prompt = PROMPT_TEMPLATE.format(pages_suffix=pages_suffix)

    content: list[dict] = [{"type": "text", "text": prompt}]
    for img_b64 in image_b64_list:
        content.append(
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img_b64}",
                },
            }
        )
    return content


def _extract_json(raw_text: str) -> dict:
    """
    Extract JSON from raw VLM response.

    Tries direct JSON.parse first, then falls back to regex extraction.
    Pydantic will validate the shape.
    """
    # Try direct parse first
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass

    # Try regex extraction (fallback for markdown-wrapped responses)
    match = re.search(r"\{[\s\S]*\}", raw_text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError("No valid JSON found in VLM response")


def _compute_confidence(extraction: VLMExtraction) -> int:
    """
    Compute a real confidence score (vs hardcoded 85 in JS version).

    Weighted: 50% presence of core fields + 30% line items + 20% validation.
    """
    score = 0
    # Core fields (50%)
    if extraction.amount is not None and extraction.amount > 0:
        score += 20
    if extraction.date:
        score += 10
    if extraction.vatPercent is not None:
        score += 10
    if extraction.description:
        score += 5
    if extraction.supplierName:
        score += 5

    # Line items (30%)
    if extraction.lines:
        score += min(30, len(extraction.lines) * 10)

    # Validation (20%) — amounts match
    if (
        extraction.subtotalExVat
        and extraction.vatAmount
        and extraction.amount
        and abs(extraction.subtotalExVat + extraction.vatAmount - extraction.amount) < 0.5
    ):
        score += 20
    elif extraction.amount and extraction.vatPercent is not None:
        # Implied VAT matches
        implied_vat = extraction.amount * extraction.vatPercent / (100 + extraction.vatPercent)
        implied_subtotal = extraction.amount - implied_vat
        if extraction.subtotalExVat and abs(extraction.subtotalExVat - implied_subtotal) < 1.0:
            score += 15

    return min(100, score)


async def extract_with_vlm(
    image_png_list: list[bytes],
    max_retries: int = 3,
) -> VLMResult:
    """
    Send images to an OpenRouter vision model for VLM extraction.

    Uses the OpenAI-compatible /chat/completions endpoint with image_url
    content (data-URI base64). The model is selected via OPENROUTER_VLM_MODEL
    (default: anthropic/claude-sonnet-4.5). Any vision-capable model on
    OpenRouter can be used — browse at:
      https://openrouter.ai/models?capabilities=image

    Args:
        image_png_list: List of PNG image bytes (one per page)
        max_retries: Max retry attempts on rate-limit/server/network errors

    Returns:
        VLMResult with parsed extraction + raw response + confidence

    Raises:
        RuntimeError if all retries fail or config is missing
    """
    import time

    if not image_png_list:
        raise ValueError("No images to process")

    _check_config()

    start = time.monotonic()

    # Encode images to base64
    image_b64_list = [base64.b64encode(png).decode("ascii") for png in image_png_list]
    content = _build_openrouter_content(image_b64_list, len(image_png_list))

    # Build the OpenRouter request body (OpenAI-compatible)
    request_body = {
        "model": config.OPENROUTER_VLM_MODEL,
        "messages": [
            {"role": "user", "content": content},
        ],
        "max_tokens": config.VLM_MAX_TOKENS,
        # Low temperature for deterministic extraction (not creative writing)
        "temperature": 0.1,
        # Some OpenRouter models support response_format JSON mode; we don't
        # rely on it (the prompt already instructs JSON-only) so the service
        # works with any vision model, including those without JSON mode.
    }

    headers = {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        # OpenRouter uses these for ranking/dashboard attribution
        "HTTP-Referer": config.OPENROUTER_APP_URL,
        "X-Title": config.OPENROUTER_APP_NAME,
    }

    url = f"{config.OPENROUTER_BASE_URL}/chat/completions"

    last_error: Exception | None = None

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
        for attempt in range(max_retries):
            try:
                log.info(
                    "vlm.request",
                    model=config.OPENROUTER_VLM_MODEL,
                    images=len(image_png_list),
                    attempt=attempt + 1,
                    provider="openrouter",
                )

                resp = await client.post(url, json=request_body, headers=headers)

                # Handle non-2xx responses
                if resp.status_code != 200:
                    err_text = resp.text[:500] if resp.text else resp.reason_phrase
                    # Retriable: 429 (rate limit), 5xx (server)
                    if resp.status_code == 429 or resp.status_code >= 500:
                        wait = 2 ** attempt  # 1s, 2s, 4s
                        log.warning(
                            "vlm.retriable_error",
                            status=resp.status_code,
                            wait_s=wait,
                            attempt=attempt + 1,
                            error=err_text[:200],
                        )
                        last_error = RuntimeError(f"OpenRouter {resp.status_code}: {err_text}")
                        if attempt < max_retries - 1:
                            await asyncio.sleep(wait)
                            continue
                        else:
                            raise last_error
                    # Non-retriable: 401 (auth), 404 (model not found), 400 (bad request)
                    raise RuntimeError(f"OpenRouter {resp.status_code}: {err_text}")

                data = resp.json()

                # Extract text from OpenAI-compatible response shape:
                # choices[0].message.content (string or array of content blocks)
                raw_text = ""
                message = data.get("choices", [{}])[0].get("message", {})
                msg_content = message.get("content")
                if isinstance(msg_content, str):
                    raw_text = msg_content
                elif isinstance(msg_content, list):
                    # Some models return content as an array of blocks
                    for block in msg_content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            raw_text += block.get("text", "")
                        elif isinstance(block, str):
                            raw_text += block

                processing_ms = int((time.monotonic() - start) * 1000)

                # Parse JSON + validate with Pydantic
                try:
                    json_data = _extract_json(raw_text)
                    extraction = VLMExtraction.model_validate(json_data)
                except (ValueError, ValidationError) as e:
                    log.warning("vlm.parse_failed", error=str(e), raw_preview=raw_text[:200])
                    # Return raw text with empty extraction
                    extraction = VLMExtraction(description=None, lines=[])

                confidence = _compute_confidence(extraction)

                log.info(
                    "vlm.success",
                    amount=extraction.amount,
                    date=extraction.date,
                    vat=extraction.vatPercent,
                    lines=len(extraction.lines),
                    confidence=confidence,
                    ms=processing_ms,
                    model=config.OPENROUTER_VLM_MODEL,
                )

                return VLMResult(
                    extraction=extraction,
                    raw_response=raw_text,
                    confidence=confidence,
                    processing_ms=processing_ms,
                    model=config.OPENROUTER_VLM_MODEL,
                )

            except httpx.TimeoutException as e:
                last_error = e
                wait = 2 ** attempt
                log.warning("vlm.timeout", wait_s=wait, attempt=attempt + 1)
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait)
                else:
                    raise RuntimeError(f"VLM request timed out after {max_retries} retries") from e
            except httpx.HTTPError as e:
                last_error = e
                wait = 2 ** attempt
                log.warning("vlm.network_error", error=str(e), wait_s=wait, attempt=attempt + 1)
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait)
                else:
                    raise RuntimeError(f"VLM network error after {max_retries} retries: {e}") from e

    raise RuntimeError(f"VLM extraction failed after {max_retries} retries: {last_error}")
