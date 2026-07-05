"""
ocr_engine.py — Hybrid OCR/VLM pipeline orchestration.

The core of the scanner service. Implements the improved pipeline:

  1. SHA-256 cache lookup (skip if same file scanned before)
  2. Image quality assessment (Laplacian variance + brightness)
  3. Route by file type:
     - PDF with text layer → PyMuPDF text extraction (FAST — skip VLM)
     - PDF without text (scanned) → render pages → VLM
     - Image → enhance (v10 pipeline) → Tesseract + Danish parser
       → if confidence low → VLM fallback
  4. Danish field validation & enrichment (CVR, EAN, IBAN, document type)
  5. Vendor matching (via host API — out of scope for v1, returns null)
  6. Account suggestion (Danish keyword → FSR account)
  7. Compute weighted confidence + needsReview flag
  8. Persist OCR result to SQLite (audit trail)
  9. Return VLMApiResponse-compatible JSON

Public API:
  - process_document(file_bytes, mime_type, filename, company_id, user_id)
    → ScanResult
"""

from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from . import config, data_layer
from .danish_parser import parse_invoice_text, parse_receipt_text
from .danish_validate import (
    classify_document_type,
    extract_cvr_from_text,
    suggest_account,
    validate_cvr,
)
from .image_enhance import assess_image_quality, enhance_image_bytes
from .logging_setup import get_logger
from .pdf_processor import load_image_from_bytes, process_pdf
from .vlm_client import VLMResult, extract_with_vlm

log = get_logger(__name__)


# ── Result types ───────────────────────────────────────────────


@dataclass
class ScanResult:
    """Final scan result returned to the host app."""
    # ── VLMApiResponse-compatible fields (must match exactly) ──
    text: Optional[str]
    amount: Optional[float]
    date: Optional[str]
    vatPercent: Optional[float]
    confidence: int
    rawLines: list[str]
    vlmLines: list[dict[str, Any]]
    vlmDescription: Optional[str]

    # ── Extensions (backward compatible — old frontend ignores) ──
    extensions: dict[str, Any] = field(default_factory=dict)

    # ── Internal metadata ──
    scan_job_id: str = ""
    processing_ms: int = 0
    cached: bool = False
    error: Optional[str] = None

    def to_vlm_api_response(self) -> dict[str, Any]:
        """Convert to VLMApiResponse-compatible dict (matches src/lib/ocr/types.ts)."""
        return {
            "text": self.text,
            "amount": self.amount,
            "date": self.date,
            "vatPercent": self.vatPercent,
            "confidence": self.confidence,
            "rawLines": self.rawLines,
            "vlmLines": self.vlmLines,
            "vlmDescription": self.vlmDescription,
            "_extensions": self.extensions,
            "_meta": {
                "scanJobId": self.scan_job_id,
                "processingMs": self.processing_ms,
                "cached": self.cached,
            },
        }


# ── Tesseract OCR ──────────────────────────────────────────────


def _run_tesseract(image_png_bytes: bytes) -> tuple[str, int]:
    """
    Run Tesseract OCR on enhanced PNG bytes.
    Returns (raw_text, confidence_0_100).
    """
    try:
        import pytesseract
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(image_png_bytes))
        # Get text + per-word confidence
        data = pytesseract.image_to_data(
            img, lang=config.TESSERACT_LANG, output_type=pytesseract.Output.DICT
        )

        # Concatenate text
        text_parts = []
        confidences = []
        for i, txt in enumerate(data["text"]):
            if txt.strip():
                text_parts.append(txt)
                try:
                    conf = int(data["conf"][i])
                    if conf >= 0:
                        confidences.append(conf)
                except (ValueError, IndexError):
                    continue

        # Reconstruct text with line breaks
        # pytesseract returns text in word order; we need to detect line breaks
        full_text = pytesseract.image_to_string(img, lang=config.TESSERACT_LANG)

        avg_conf = int(sum(confidences) / len(confidences)) if confidences else 0
        return full_text, avg_conf

    except Exception as e:
        log.error("tesseract.failed", error=str(e))
        return "", 0


# ── Main pipeline ──────────────────────────────────────────────


async def process_document(
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    company_id: str,
    user_id: Optional[str] = None,
    use_cache: bool = True,
    progress_callback: Optional[callable] = None,
) -> ScanResult:
    """
    Process a document through the hybrid OCR/VLM pipeline.

    Args:
        file_bytes: Raw file bytes (PDF, JPEG, PNG, etc.)
        mime_type: MIME type (e.g. "application/pdf", "image/jpeg")
        filename: Original filename (for logging)
        company_id: Tenant ID (forwarded from host session)
        user_id: User ID (optional)
        use_cache: Check SHA-256 cache first (default True)
        progress_callback: async callable(progress: int, stage: str) — optional

    Returns:
        ScanResult with extracted data + extensions
    """
    start = time.monotonic()
    scan_job_id = f"scn_{uuid.uuid4().hex[:16]}"

    async def _progress(p: int, stage: str) -> None:
        if progress_callback:
            try:
                await progress_callback(p, stage)
            except Exception:
                pass

    await _progress(5, "upload")
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    file_size = len(file_bytes)
    log.info(
        "scan.start",
        job_id=scan_job_id,
        filename=filename,
        size_bytes=file_size,
        mime=mime_type,
        hash=file_hash[:16],
    )

    # ── Create scan job ──
    data_layer.create_scan_job(
        job_id=scan_job_id,
        user_id=user_id,
        company_id=company_id,
        filename=filename,
        file_size=file_size,
        mime_type=mime_type,
        file_hash=file_hash,
    )

    # ── Cache lookup ──
    if use_cache:
        cached_job = data_layer.get_scan_job_by_hash(file_hash, company_id)
        if cached_job:
            cached_result = data_layer.get_ocr_result_by_job(cached_job["id"])
            if cached_result:
                log.info("scan.cache_hit", job_id=scan_job_id, cached_from=cached_job["id"])
                # Mark current job as done (cached)
                data_layer.update_scan_job_status(
                    scan_job_id, status="done", stage="cache_hit",
                    progress=100, processing_ms=0, processor="cache",
                )
                return _build_cached_result(cached_result, scan_job_id, cached_job["id"])

    is_pdf = mime_type == "application/pdf" or filename.lower().endswith(".pdf")

    try:
        if is_pdf:
            result = await _process_pdf(file_bytes, scan_job_id, company_id, user_id, _progress)
        else:
            result = await _process_image(file_bytes, scan_job_id, company_id, user_id, _progress)

        # ── Persist result ──
        result_id = f"ocr_{uuid.uuid4().hex[:16]}"
        ext = result.extensions
        data_layer.save_ocr_result(
            result_id=result_id,
            scan_job_id=scan_job_id,
            amount=result.amount,
            date=result.date,
            vat_percent=result.vatPercent,
            currency=ext.get("currency", "DKK"),
            confidence=result.confidence,
            description=result.vlmDescription,
            document_type=ext.get("documentType"),
            supplier_name=ext.get("supplierName"),
            supplier_cvr=ext.get("supplierCvr"),
            invoice_number=ext.get("invoiceNumber"),
            due_date=ext.get("dueDate"),
            subtotal=ext.get("subtotal"),
            vat_amount=ext.get("vatAmount"),
            raw_text=result.text,
            raw_lines=result.rawLines,
            line_items=result.vlmLines,
            extensions=ext,
            needs_review=result.confidence < 70,
        )

        result.processing_ms = int((time.monotonic() - start) * 1000)
        result.scan_job_id = scan_job_id

        data_layer.update_scan_job_status(
            scan_job_id,
            status="done",
            stage="complete",
            progress=100,
            processing_ms=result.processing_ms,
            pages_processed=len(result.extensions.get("pagesProcessed", 1) or []) if isinstance(result.extensions.get("pagesProcessed"), list) else result.extensions.get("pagesProcessed", 1),
            processor=result.extensions.get("processor", "unknown"),
        )

        log.info(
            "scan.done",
            job_id=scan_job_id,
            ms=result.processing_ms,
            confidence=result.confidence,
            amount=result.amount,
            processor=result.extensions.get("processor"),
        )

        return result

    except Exception as e:
        processing_ms = int((time.monotonic() - start) * 1000)
        log.error("scan.failed", job_id=scan_job_id, error=str(e), ms=processing_ms)
        data_layer.update_scan_job_status(
            scan_job_id, status="failed", stage="error",
            error=str(e), processing_ms=processing_ms,
        )
        # Return error result (compatible with old API)
        return ScanResult(
            text=None,
            amount=None,
            date=None,
            vatPercent=None,
            confidence=0,
            rawLines=[],
            vlmLines=[],
            vlmDescription=None,
            extensions={
                "processor": "error",
                "error": str(e),
                "needsReview": True,
            },
            scan_job_id=scan_job_id,
            processing_ms=processing_ms,
            error=str(e),
        )


async def _process_pdf(
    pdf_bytes: bytes,
    scan_job_id: str,
    company_id: str,
    user_id: Optional[str],
    progress_cb,
) -> ScanResult:
    """Process a PDF — text extraction (fast) or VLM (scanned PDFs)."""
    await progress_cb(10, "pdf_render")

    pdf_result = process_pdf(pdf_bytes)

    await progress_cb(40, "ocr")

    text_pages = [p for p in pdf_result.pages if p.text]
    image_pages = [p for p in pdf_result.pages if p.image_png]

    # ── Fast path: text PDF → Danish parser (no VLM call) ──
    if text_pages and not image_pages:
        full_text = "\n".join(p.text for p in text_pages if p.text)
        log.info("pdf.text_path", chars=len(full_text), job_id=scan_job_id)

        return _build_result_from_text(
            full_text,
            scan_job_id,
            processor="text_pdf",
            pages=len(text_pages),
            source_notes=pdf_result.processing_notes,
        )

    # ── Slow path: scanned PDF → VLM ──
    if not config.ANTHROPIC_API_KEY:
        log.warning("pdf.no_vlm_key", job_id=scan_job_id, msg="ANTHROPIC_API_KEY not set — falling back to Tesseract")

        # Fall back to Tesseract on rendered images
        all_text = ""
        for page in image_pages:
            if page.image_png:
                enhanced_bytes, _ = enhance_image_bytes(page.image_png)
                page_text, _ = _run_tesseract(enhanced_bytes)
                all_text += page_text + "\n"
        return _build_result_from_text(
            all_text,
            scan_job_id,
            processor="tesseract",
            pages=len(image_pages),
            source_notes=pdf_result.processing_notes + ["VLM unavailable — Tesseract fallback"],
        )

    await progress_cb(60, "vlm")
    # Encode images and call VLM
    image_png_list = [p.image_png for p in image_pages if p.image_png]
    vlm_result = await extract_with_vlm(image_png_list)

    await progress_cb(90, "validate")

    # Combine with any text-page content (mixed PDF)
    combined_text = "\n".join(p.text for p in text_pages if p.text) + vlm_result.raw_response

    return _build_result_from_vlm(
        vlm_result,
        combined_text,
        scan_job_id,
        pages=len(pdf_result.pages),
        source_notes=pdf_result.processing_notes,
    )


async def _process_image(
    image_bytes: bytes,
    scan_job_id: str,
    company_id: str,
    user_id: Optional[str],
    progress_cb,
) -> ScanResult:
    """Process a standalone image — enhance → Tesseract → optional VLM fallback."""
    await progress_cb(15, "enhance")

    # ── Image quality assessment ──
    img_array = load_image_from_bytes(image_bytes)
    quality = assess_image_quality(img_array)
    log.info(
        "image.quality",
        job_id=scan_job_id,
        blur=quality["blur_score"],
        brightness=quality["brightness"],
        acceptable=quality["is_acceptable"],
    )

    # ── Enhance (v10 pipeline) ──
    enhanced_png, _ = enhance_image_bytes(image_bytes)

    await progress_cb(40, "ocr")

    # ── Tesseract OCR ──
    tesseract_text, tesseract_conf = _run_tesseract(enhanced_png)

    # ── Danish regex parser ──
    parsed_invoice = parse_invoice_text(tesseract_text)
    parsed_receipt = parse_receipt_text(tesseract_text)

    # Build base result from Tesseract
    amount = parsed_invoice.totalAmount or parsed_receipt.totalAmount
    date = parsed_invoice.date or parsed_receipt.date
    vat_percent = parsed_invoice.vatPercent or parsed_receipt.vatPercent

    line_items = [
        {
            "description": item.description,
            "quantity": item.quantity,
            "unitPrice": item.unitPrice,
            "vatPercent": item.vatPercent,
        }
        for item in parsed_invoice.lineItems
    ]

    # ── VLM fallback if Tesseract confidence is low ──
    use_vlm_fallback = (
        tesseract_conf < 60
        and config.ANTHROPIC_API_KEY
        and (amount is None or not line_items)
    )

    if use_vlm_fallback:
        await progress_cb(60, "vlm")
        log.info("image.vlm_fallback", job_id=scan_job_id, tesseract_conf=tesseract_conf)
        try:
            vlm_result = await extract_with_vlm([enhanced_png])
            # Take VLM result if better
            vlm_amount = vlm_result.extraction.amount
            vlm_lines = [
                {
                    "description": li.description,
                    "quantity": li.quantity,
                    "unitPrice": li.unitPrice,
                    "vatPercent": li.vatPercent,
                }
                for li in vlm_result.extraction.lines
            ]

            if vlm_amount and (amount is None or vlm_result.confidence > tesseract_conf):
                amount = vlm_amount
                date = vlm_result.extraction.date or date
                vat_percent = vlm_result.extraction.vatPercent or vat_percent
                line_items = vlm_lines or line_items
                description = vlm_result.extraction.description
                raw_text = vlm_result.raw_response
                confidence = vlm_result.confidence
                processor = "hybrid"
                ext_data = _build_vlm_extensions(vlm_result, tesseract_text)
            else:
                description = None
                raw_text = tesseract_text
                confidence = tesseract_conf
                processor = "tesseract"
                ext_data = _build_tesseract_extensions(tesseract_text, quality)
        except Exception as e:
            log.warning("image.vlm_fallback_failed", job_id=scan_job_id, error=str(e))
            description = None
            raw_text = tesseract_text
            confidence = tesseract_conf
            processor = "tesseract"
            ext_data = _build_tesseract_extensions(tesseract_text, quality)
    else:
        description = None
        raw_text = tesseract_text
        confidence = tesseract_conf
        processor = "tesseract"
        ext_data = _build_tesseract_extensions(tesseract_text, quality)

    await progress_cb(90, "validate")

    # ── Build rawLines for backward compat ──
    raw_lines = _build_raw_lines(description, amount, date, vat_percent, line_items)

    return ScanResult(
        text=raw_text,
        amount=amount,
        date=date,
        vatPercent=vat_percent,
        confidence=confidence,
        rawLines=raw_lines,
        vlmLines=line_items,
        vlmDescription=description,
        extensions={
            **ext_data,
            "processor": processor,
            "pagesProcessed": 1,
            "imageQuality": quality,
            "needsReview": confidence < 70,
        },
    )


# ── Result builders ────────────────────────────────────────────


def _build_result_from_text(
    text: str,
    scan_job_id: str,
    processor: str,
    pages: int,
    source_notes: list[str] | None = None,
) -> ScanResult:
    """Build a ScanResult from extracted text (text-PDF or Tesseract path)."""
    parsed_invoice = parse_invoice_text(text)
    parsed_receipt = parse_receipt_text(text)

    amount = parsed_invoice.totalAmount or parsed_receipt.totalAmount
    date = parsed_invoice.date or parsed_receipt.date
    vat_percent = parsed_invoice.vatPercent or parsed_receipt.vatPercent
    line_items = [
        {
            "description": item.description,
            "quantity": item.quantity,
            "unitPrice": item.unitPrice,
            "vatPercent": item.vatPercent,
        }
        for item in parsed_invoice.lineItems
    ]
    description = None

    # Confidence for text-PDF path: high if we found core fields
    confidence = 0
    if amount: confidence += 40
    if date: confidence += 20
    if vat_percent is not None: confidence += 20
    if line_items: confidence += 20

    # Danish enrichment
    cvr_raw = extract_cvr_from_text(text)
    cvr_validated = None
    if cvr_raw:
        cvr_result = validate_cvr(cvr_raw)
        cvr_validated = cvr_result.normalized if cvr_result.is_valid else cvr_raw

    doc_type = classify_document_type(text)
    account_suggestion = suggest_account(description or " ".join(item["description"] for item in line_items))

    raw_lines = _build_raw_lines(description, amount, date, vat_percent, line_items)

    extensions: dict[str, Any] = {
        "processor": processor,
        "pagesProcessed": pages,
        "documentType": doc_type,
        "supplierCvr": cvr_validated,
        "currency": "DKK",
        "needsReview": confidence < 70,
        "sourceNotes": source_notes or [],
    }
    if account_suggestion:
        extensions["accountSuggestion"] = account_suggestion

    return ScanResult(
        text=text,
        amount=amount,
        date=date,
        vatPercent=vat_percent,
        confidence=confidence,
        rawLines=raw_lines,
        vlmLines=line_items,
        vlmDescription=description,
        extensions=extensions,
    )


def _build_result_from_vlm(
    vlm_result: VLMResult,
    combined_text: str,
    scan_job_id: str,
    pages: int,
    source_notes: list[str] | None = None,
) -> ScanResult:
    """Build a ScanResult from a VLM extraction."""
    extraction = vlm_result.extraction

    line_items = [
        {
            "description": li.description,
            "quantity": li.quantity,
            "unitPrice": li.unitPrice,
            "vatPercent": li.vatPercent,
        }
        for li in extraction.lines
    ]

    raw_lines = _build_raw_lines(
        extraction.description, extraction.amount, extraction.date,
        extraction.vatPercent, line_items,
    )

    # Danish enrichment on combined text
    cvr_raw = extract_cvr_from_text(combined_text)
    cvr_validated = None
    if cvr_raw:
        cvr_result = validate_cvr(cvr_raw)
        cvr_validated = cvr_result.normalized if cvr_result.is_valid else cvr_raw

    doc_type = extraction.documentType or classify_document_type(combined_text)
    account_suggestion = suggest_account(
        extraction.description or " ".join(item["description"] for item in line_items)
    )

    extensions: dict[str, Any] = {
        "processor": "vlm",
        "pagesProcessed": pages,
        "documentType": doc_type,
        "currency": extraction.currency or "DKK",
        "supplierName": extraction.supplierName,
        "supplierCvr": cvr_validated or extraction.supplierCvr,
        "invoiceNumber": extraction.invoiceNumber,
        "dueDate": extraction.dueDate,
        "customerName": extraction.customerName,
        "subtotal": extraction.subtotalExVat,
        "vatAmount": extraction.vatAmount,
        "vatBreakdown": [
            {
                "rate": vb.rate,
                "baseAmount": vb.baseAmount,
                "vatAmount": vb.vatAmount,
            }
            for vb in extraction.vatBreakdown
        ],
        "model": vlm_result.model,
        "needsReview": vlm_result.confidence < 70,
        "sourceNotes": source_notes or [],
    }
    if account_suggestion:
        extensions["accountSuggestion"] = account_suggestion

    return ScanResult(
        text=vlm_result.raw_response,
        amount=extraction.amount,
        date=extraction.date,
        vatPercent=extraction.vatPercent,
        confidence=vlm_result.confidence,
        rawLines=raw_lines,
        vlmLines=line_items,
        vlmDescription=extraction.description,
        extensions=extensions,
    )


def _build_tesseract_extensions(text: str, quality: dict) -> dict[str, Any]:
    """Build extensions dict for Tesseract path."""
    cvr_raw = extract_cvr_from_text(text)
    cvr_validated = None
    if cvr_raw:
        cvr_result = validate_cvr(cvr_raw)
        cvr_validated = cvr_result.normalized if cvr_result.is_valid else cvr_raw

    doc_type = classify_document_type(text)
    account_suggestion = suggest_account(text)

    ext: dict[str, Any] = {
        "documentType": doc_type,
        "supplierCvr": cvr_validated,
        "currency": "DKK",
        "imageQuality": quality,
    }
    if account_suggestion:
        ext["accountSuggestion"] = account_suggestion
    return ext


def _build_vlm_extensions(vlm_result: VLMResult, tesseract_text: str) -> dict[str, Any]:
    """Build extensions dict for hybrid (Tesseract + VLM) path."""
    extraction = vlm_result.extraction
    cvr_raw = extract_cvr_from_text(tesseract_text)
    cvr_validated = None
    if cvr_raw:
        cvr_result = validate_cvr(cvr_raw)
        cvr_validated = cvr_result.normalized if cvr_result.is_valid else cvr_raw

    doc_type = extraction.documentType or classify_document_type(tesseract_text)
    account_suggestion = suggest_account(
        extraction.description or tesseract_text[:200]
    )

    ext: dict[str, Any] = {
        "documentType": doc_type,
        "currency": extraction.currency or "DKK",
        "supplierName": extraction.supplierName,
        "supplierCvr": cvr_validated or extraction.supplierCvr,
        "invoiceNumber": extraction.invoiceNumber,
        "dueDate": extraction.dueDate,
        "customerName": extraction.customerName,
        "subtotal": extraction.subtotalExVat,
        "vatAmount": extraction.vatAmount,
        "vatBreakdown": [
            {
                "rate": vb.rate,
                "baseAmount": vb.baseAmount,
                "vatAmount": vb.vatAmount,
            }
            for vb in extraction.vatBreakdown
        ],
        "model": vlm_result.model,
    }
    if account_suggestion:
        ext["accountSuggestion"] = account_suggestion
    return ext


def _build_raw_lines(
    description: Optional[str],
    amount: Optional[float],
    date: Optional[str],
    vat_percent: Optional[float],
    line_items: list[dict[str, Any]],
) -> list[str]:
    """Build rawLines array (mirror of ocr/pdf/route.ts:177-184)."""
    lines: list[str] = []
    if description:
        lines.append(description)
    if amount:
        lines.append(f"Total: {amount} DKK")
    if date:
        lines.append(f"Dato: {date}")
    if vat_percent is not None:
        lines.append(f"Moms: {vat_percent}%")
    for line in line_items:
        lines.append(f"{line.get('description', '')} - {line.get('quantity', 1)}x {line.get('unitPrice', 0)}")
    return lines


def _build_cached_result(cached: dict, scan_job_id: str, original_job_id: str) -> ScanResult:
    """Build a ScanResult from a cached OCR result."""
    raw_lines = cached.get("raw_lines", [])
    line_items = cached.get("line_items", [])
    extensions = cached.get("extensions", {})
    extensions["cached"] = True
    extensions["originalJobId"] = original_job_id

    return ScanResult(
        text=cached.get("raw_text"),
        amount=cached.get("amount"),
        date=cached.get("date"),
        vatPercent=cached.get("vat_percent"),
        confidence=cached.get("confidence", 0),
        rawLines=raw_lines,
        vlmLines=line_items,
        vlmDescription=cached.get("description"),
        extensions=extensions,
        scan_job_id=scan_job_id,
        processing_ms=0,
        cached=True,
    )
