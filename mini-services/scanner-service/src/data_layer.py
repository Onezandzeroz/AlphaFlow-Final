"""
data_layer.py — SQLite data layer for AlphaFlow Scanner Service.

Mirrors the pattern from tokenpay-access-service/src/data-layer.ts:
  - WAL mode for concurrent read/write safety
  - Auto-creates schema on startup (no migration tool)
  - Self-initializing via CREATE TABLE IF NOT EXISTS

Tables:
  - scan_jobs   — one row per scan request (sync or async)
  - ocr_results — extracted OCR data, persisted for audit trail
"""

from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Module-level connection (single-threaded access via FastAPI's event loop)
_db: sqlite3.Connection | None = None


def init_data_layer(db_path: str) -> sqlite3.Connection:
    """Initialize the SQLite database — must be called once on startup."""
    global _db

    # Ensure parent directory exists
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(
        db_path,
        detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
        check_same_thread=False,  # FastAPI async — we manage access
    )
    conn.row_factory = sqlite3.Row

    # ── Pragmas (mirror tokenpay pattern) ──
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA synchronous = NORMAL")  # Faster than FULL, still safe with WAL

    # ── Schema ──
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS scan_jobs (
            id              TEXT PRIMARY KEY,
            user_id         TEXT,
            company_id      TEXT NOT NULL,
            filename        TEXT NOT NULL,
            file_hash       TEXT,                  -- SHA-256, for caching
            file_size       INTEGER NOT NULL,
            mime_type       TEXT,
            status          TEXT NOT NULL DEFAULT 'queued',  -- queued|processing|done|failed
            stage           TEXT,                  -- upload|pdf_render|enhance|ocr|vlm|validate
            progress        INTEGER DEFAULT 0,     -- 0-100
            error           TEXT,
            processing_ms   INTEGER,
            pages_processed INTEGER DEFAULT 0,
            processor       TEXT,                  -- text_pdf|tesseract|vlm|hybrid
            created_at      TEXT NOT NULL,
            updated_at      TEXT NOT NULL,
            completed_at    TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_scan_jobs_company ON scan_jobs(company_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scan_jobs_user    ON scan_jobs(user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_scan_jobs_status  ON scan_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_scan_jobs_hash    ON scan_jobs(file_hash);

        CREATE TABLE IF NOT EXISTS ocr_results (
            id              TEXT PRIMARY KEY,
            scan_job_id     TEXT NOT NULL,
            amount          REAL,
            date            TEXT,                  -- YYYY-MM-DD
            vat_percent     REAL,
            currency        TEXT DEFAULT 'DKK',
            confidence      INTEGER DEFAULT 0,
            description     TEXT,
            document_type   TEXT,                  -- receipt|invoice|credit_note|unknown
            supplier_name   TEXT,
            supplier_cvr    TEXT,
            invoice_number  TEXT,
            due_date        TEXT,
            subtotal        REAL,
            vat_amount      REAL,
            raw_text        TEXT,                  -- raw OCR text or VLM response
            raw_lines_json  TEXT,                  -- JSON array of strings
            line_items_json TEXT,                  -- JSON array of line items
            extensions_json TEXT,                  -- JSON: vendorMatch, accountSuggestion, etc.
            needs_review    INTEGER DEFAULT 1,     -- 0|1
            created_at      TEXT NOT NULL,
            FOREIGN KEY (scan_job_id) REFERENCES scan_jobs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_ocr_results_job    ON ocr_results(scan_job_id);
        CREATE INDEX IF NOT EXISTS idx_ocr_results_company ON ocr_results(scan_job_id);
        """
    )
    conn.commit()

    _db = conn
    return conn


def _get_db() -> sqlite3.Connection:
    if _db is None:
        raise RuntimeError("Database not initialized — call init_data_layer() first")
    return _db


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Scan Jobs ───────────────────────────────────────────────────


def create_scan_job(
    job_id: str,
    user_id: str | None,
    company_id: str,
    filename: str,
    file_size: int,
    mime_type: str,
    file_hash: str | None = None,
) -> dict[str, Any]:
    """Insert a new scan job in 'queued' status."""
    now = _now_iso()
    _get_db().execute(
        """
        INSERT INTO scan_jobs (id, user_id, company_id, filename, file_hash, file_size, mime_type,
                               status, stage, progress, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'upload', 0, ?, ?)
        """,
        (job_id, user_id, company_id, filename, file_hash, file_size, mime_type, now, now),
    )
    _get_db().commit()
    return get_scan_job(job_id)  # type: ignore[return-value]


def update_scan_job_status(
    job_id: str,
    status: str,
    stage: str | None = None,
    progress: int | None = None,
    error: str | None = None,
    processing_ms: int | None = None,
    pages_processed: int | None = None,
    processor: str | None = None,
) -> None:
    """Update a scan job's status and stage."""
    now = _now_iso()
    completed_at = now if status in ("done", "failed") else None
    _get_db().execute(
        """
        UPDATE scan_jobs
        SET status = ?, stage = COALESCE(?, stage), progress = COALESCE(?, progress),
            error = ?, processing_ms = ?, pages_processed = ?,
            processor = COALESCE(?, processor), updated_at = ?,
            completed_at = COALESCE(?, completed_at)
        WHERE id = ?
        """,
        (status, stage, progress, error, processing_ms, pages_processed, processor, now, completed_at, job_id),
    )
    _get_db().commit()


def get_scan_job(job_id: str) -> dict[str, Any] | None:
    """Fetch a scan job by ID."""
    row = _get_db().execute("SELECT * FROM scan_jobs WHERE id = ?", (job_id,)).fetchone()
    return dict(row) if row else None


def get_scan_job_by_hash(file_hash: str, company_id: str) -> dict[str, Any] | None:
    """Check if we have a recent successful scan for this file hash (cache hit)."""
    row = _get_db().execute(
        """
        SELECT * FROM scan_jobs
        WHERE file_hash = ? AND company_id = ? AND status = 'done'
        ORDER BY completed_at DESC LIMIT 1
        """,
        (file_hash, company_id),
    ).fetchone()
    return dict(row) if row else None


# ── OCR Results ─────────────────────────────────────────────────


def save_ocr_result(
    result_id: str,
    scan_job_id: str,
    amount: float | None,
    date: str | None,
    vat_percent: float | None,
    currency: str,
    confidence: int,
    description: str | None,
    document_type: str | None,
    supplier_name: str | None,
    supplier_cvr: str | None,
    invoice_number: str | None,
    due_date: str | None,
    subtotal: float | None,
    vat_amount: float | None,
    raw_text: str | None,
    raw_lines: list[str],
    line_items: list[dict[str, Any]],
    extensions: dict[str, Any],
    needs_review: bool = True,
) -> None:
    """Persist an OCR result. Mirrors what the JS version discards (audit trail)."""
    now = _now_iso()
    _get_db().execute(
        """
        INSERT INTO ocr_results (id, scan_job_id, amount, date, vat_percent, currency, confidence,
                                 description, document_type, supplier_name, supplier_cvr,
                                 invoice_number, due_date, subtotal, vat_amount,
                                 raw_text, raw_lines_json, line_items_json, extensions_json,
                                 needs_review, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            result_id, scan_job_id, amount, date, vat_percent, currency, confidence,
            description, document_type, supplier_name, supplier_cvr,
            invoice_number, due_date, subtotal, vat_amount,
            raw_text,
            json.dumps(raw_lines, ensure_ascii=False),
            json.dumps(line_items, ensure_ascii=False),
            json.dumps(extensions, ensure_ascii=False),
            1 if needs_review else 0,
            now,
        ),
    )
    _get_db().commit()


def get_ocr_result_by_job(scan_job_id: str) -> dict[str, Any] | None:
    """Fetch the OCR result for a scan job."""
    row = _get_db().execute(
        "SELECT * FROM ocr_results WHERE scan_job_id = ?", (scan_job_id,)
    ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["raw_lines"] = json.loads(d.pop("raw_lines_json") or "[]")
    d["line_items"] = json.loads(d.pop("line_items_json") or "[]")
    d["extensions"] = json.loads(d.pop("extensions_json") or "{}")
    d["needs_review"] = bool(d.pop("needs_review"))
    return d


# ── Stats ───────────────────────────────────────────────────────


def get_stats() -> dict[str, Any]:
    """Return service stats for /health and /stats endpoints."""
    db = _get_db()
    total = db.execute("SELECT COUNT(*) as c FROM scan_jobs").fetchone()["c"]
    done = db.execute("SELECT COUNT(*) as c FROM scan_jobs WHERE status = 'done'").fetchone()["c"]
    failed = db.execute("SELECT COUNT(*) as c FROM scan_jobs WHERE status = 'failed'").fetchone()["c"]
    processing = db.execute("SELECT COUNT(*) as c FROM scan_jobs WHERE status IN ('queued', 'processing')").fetchone()["c"]
    avg_ms_row = db.execute("SELECT AVG(processing_ms) as avg FROM scan_jobs WHERE status = 'done' AND processing_ms IS NOT NULL").fetchone()
    avg_ms = int(avg_ms_row["avg"] or 0)
    return {
        "total_jobs": total,
        "completed": done,
        "failed": failed,
        "in_progress": processing,
        "avg_processing_ms": avg_ms,
    }
