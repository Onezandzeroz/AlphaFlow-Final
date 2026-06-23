"""
pdf_processor.py — PDF processing via PyMuPDF (fitz).

Replaces the existing pdfjs-dist + node-canvas combo with a single pure-Python
wheel (no cairo/pango/graphicmagick system deps).

KEY IMPROVEMENT vs JS version:
  - For text-based PDFs (most e-invoices), extract text directly via get_text()
    → skip VLM entirely (50× faster, no Claude API cost).
  - For scanned/image-only PDFs, render pages to PNG at 300 DPI (vs old 144 DPI)
    and hand off to OCR/VLM pipeline.

Public API:
  - process_pdf(pdf_bytes) → PdfProcessResult
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import cv2
import numpy as np
from PIL import Image

if TYPE_CHECKING:
    import fitz  # PyMuPDF

from . import config
from .logging_setup import get_logger

log = get_logger(__name__)


# ── Types ───────────────────────────────────────────────────────


@dataclass
class PdfPage:
    """A single PDF page — either text or rendered image."""
    page_number: int  # 1-indexed
    text: str | None = None  # Direct text extraction (text PDFs)
    image_png: bytes | None = None  # Rendered PNG (scanned PDFs)


@dataclass
class PdfProcessResult:
    """Result of PDF processing — pages + classification."""
    is_text_pdf: bool  # True if PDF has extractable text (skip VLM)
    pages: list[PdfPage] = field(default_factory=list)
    total_pages: int = 0
    processing_notes: list[str] = field(default_factory=list)


# ── PDF processing ─────────────────────────────────────────────


def process_pdf(
    pdf_bytes: bytes,
    max_pages: int | None = None,
    render_dpi: int = 300,
) -> PdfProcessResult:
    """
    Process a PDF: detect if it has a text layer, and either extract text
    or render pages to PNG.

    Args:
        pdf_bytes: Raw PDF file bytes
        max_pages: Maximum pages to process (default: config.MAX_PAGES)
        render_dpi: DPI for rendering scanned PDFs (default: 300, vs old 144)

    Returns:
        PdfProcessResult with either text pages (fast path) or image pages.
    """
    if max_pages is None:
        max_pages = config.MAX_PAGES

    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise RuntimeError(
            "PyMuPDF not installed. Run: pip install PyMuPDF"
        ) from e

    result = PdfProcessResult(is_text_pdf=False)
    notes = result.processing_notes

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    result.total_pages = doc.page_count
    pages_to_process = min(doc.page_count, max_pages)

    if doc.page_count > max_pages:
        notes.append(f"PDF has {doc.page_count} pages — processing first {max_pages} only")

    # ── Detect: is this a text PDF or a scanned (image-only) PDF? ──
    # Strategy: extract text from first 2 pages. If total extracted text is
    # >50 chars, treat as text PDF. Otherwise treat as scanned.
    sample_text = ""
    sample_pages = min(2, pages_to_process)
    for i in range(sample_pages):
        page = doc[i]
        sample_text += page.get_text("text")

    # Clean — strip whitespace, count meaningful chars
    meaningful_chars = len(sample_text.strip())
    result.is_text_pdf = meaningful_chars > 50

    if result.is_text_pdf:
        notes.append(f"Text PDF detected ({meaningful_chars} chars in first {sample_pages} pages) — using fast text extraction")
        log.info(
            "pdf.text_extract",
            pages=pages_to_process,
            sample_chars=meaningful_chars,
        )

        for i in range(pages_to_process):
            page = doc[i]
            text = page.get_text("text")
            if text.strip():
                result.pages.append(PdfPage(page_number=i + 1, text=text))
            else:
                # Page has no text — render it (might be a scan mixed into text PDF)
                png_bytes = _render_page_to_png(page, render_dpi)
                result.pages.append(PdfPage(page_number=i + 1, image_png=png_bytes))
    else:
        notes.append(f"Scanned PDF detected ({meaningful_chars} chars in sample) — rendering at {render_dpi} DPI")
        log.info(
            "pdf.scanned_render",
            pages=pages_to_process,
            dpi=render_dpi,
        )

        for i in range(pages_to_process):
            page = doc[i]
            png_bytes = _render_page_to_png(page, render_dpi)
            result.pages.append(PdfPage(page_number=i + 1, image_png=png_bytes))

    doc.close()
    return result


def _render_page_to_png(page: "fitz.Page", dpi: int = 300) -> bytes:
    """
    Render a fitz Page to PNG bytes at the given DPI.

    PyMuPDF uses 72 DPI as default, so zoom = dpi / 72.
    """
    zoom = dpi / 72.0
    matrix = fitz_matrix(zoom, zoom)  # type: ignore[name-defined]
    # Render via pixmap (RGB)
    pixmap = page.get_pixmap(matrix=matrix, alpha=False)

    # Convert to PNG bytes via PIL (more reliable than pixmap.tobytes for various formats)
    pil_img = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)

    # If image is huge, downscale to MAX_OUTPUT_DIM (3500px) for memory safety
    max_dim = 3500
    if max(pil_img.width, pil_img.height) > max_dim:
        ratio = max_dim / max(pil_img.width, pil_img.height)
        new_size = (int(pil_img.width * ratio), int(pil_img.height * ratio))
        pil_img = pil_img.resize(new_size, Image.LANCZOS)

    buf = io.BytesIO()
    pil_img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def fitz_matrix(x: float, y: float):
    """Wrapper to import fitz.Matrix lazily."""
    import fitz
    return fitz.Matrix(x, y)


# ── Image utility (also used by ocr_engine for standalone images) ──


def load_image_from_bytes(image_bytes: bytes) -> np.ndarray:
    """
    Load raw image bytes (JPEG/PNG/WebP/BMP/TIFF/HEIC) into a cv2 BGR array.
    Handles HEIC via pillow-heif if installed.
    """
    # Register HEIC opener if available
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass

    pil_img = Image.open(io.BytesIO(image_bytes))
    if pil_img.mode == "RGBA":
        # Composite onto white background (PNG with transparency)
        bg = Image.new("RGB", pil_img.size, (255, 255, 255))
        bg.paste(pil_img, mask=pil_img.split()[-1])
        pil_img = bg
    elif pil_img.mode != "RGB":
        pil_img = pil_img.convert("RGB")

    img_array = np.array(pil_img)
    return cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
