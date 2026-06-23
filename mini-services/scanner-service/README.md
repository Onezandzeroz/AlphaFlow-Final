# AlphaFlow Scanner Service

Python-based mini-service for document scanning, OCR, and VLM extraction.
Extracted from the main AlphaFlow app to a standalone service for better
scalability, language ecosystem (Python's OCR/ML stack is more capable),
and independent deployment.

## Overview

- **Language:** Python 3.11+
- **Framework:** FastAPI + uvicorn
- **Database:** SQLite (WAL mode, auto-creating schema)
- **Port:** 3005 (next free in AlphaFlow's 3001–3009 mini-service range)
- **Communication:** REST HTTP via `X-Access-Service-Key` shared secret

## Capabilities

| Feature | Implementation |
|---|---|
| PDF processing | PyMuPDF (pure wheel — no cairo/pango deps) |
| Text PDF extraction | `page.get_text()` — **50× faster than VLM** for text PDFs |
| Scanned PDF → image | Render at 300 DPI → VLM |
| Image enhancement | cv2 port of v10 8-step pipeline (brightness, denoise, contrast, sharpen, S-curve, whiten) |
| OCR | Tesseract via `pytesseract` (dan+eng) |
| VLM | Anthropic SDK → Claude Sonnet 4 (direct, no Z.ai proxy) |
| Danish parsing | Full port of `receipt-parser.ts` (754 LOC regex) |
| Danish validation | CVR Mod-11, EAN-13 check digit, IBAN MOD-97 (via python-stdnum) |
| Document classification | receipt / invoice / credit_note / unknown |
| Account suggestion | Danish keyword → FSR 4-digit account number |
| Caching | SHA-256 file hash → instant re-scan |
| Audit trail | All OCR results persisted to SQLite |
| Webhook | HMAC-SHA256 signed callbacks to host app |

## Installation

```bash
cd mini-services/scanner-service

# 1. Install system dependencies (Ubuntu/Debian)
sudo apt-get install -y python3.11 python3.11-venv \
  tesseract-ocr tesseract-ocr-dan tesseract-ocr-eng \
  libgl1-mesa-glx libglib2.0-0

# 2. Run installer (creates venv, installs Python deps, creates .env)
bash install.sh

# 3. Edit .env — add your Anthropic API key
#    Get one at: https://console.anthropic.com/
nano .env

# 4. Activate venv and start dev server
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 3005 --reload
```

## API

### `GET /health`
Public health check. Returns service status + uptime + stats.

### `POST /api/v1/scan`
Synchronous scan. Backward-compatible with the old `/api/ocr/pdf` endpoint.

**Headers:**
- `X-Access-Service-Key` (required) — shared secret
- `X-Company-Id` (required) — tenant ID forwarded from host session
- `X-User-Id` (optional) — user ID forwarded from host session

**Body:** `multipart/form-data` with `file` field (PDF, JPEG, PNG, WebP, etc., max 10 MB)

**Response:** VLMApiResponse-compatible JSON + `_extensions` block:
```json
{
  "text": "...",
  "amount": 1234.56,
  "date": "2026-01-15",
  "vatPercent": 25,
  "confidence": 87,
  "rawLines": ["..."],
  "vlmLines": [{"description": "...", "quantity": 1, "unitPrice": 987.65, "vatPercent": 25}],
  "vlmDescription": "...",
  "_extensions": {
    "processor": "vlm|tesseract|text_pdf|hybrid|cache",
    "documentType": "receipt|invoice|credit_note|unknown",
    "supplierName": "Acme ApS",
    "supplierCvr": "12345678",
    "invoiceNumber": "F-2026-001",
    "dueDate": "2026-01-30",
    "subtotal": 987.65,
    "vatAmount": 246.91,
    "currency": "DKK",
    "needsReview": false,
    "accountSuggestion": {
      "accountNumber": "4100",
      "accountName": "Konsulentydelser",
      "confidence": 0.87
    },
    "imageQuality": {"blurScore": 245.3, "brightness": 188.7}
  },
  "_meta": {
    "scanJobId": "scn_...",
    "processingMs": 4523,
    "cached": false
  }
}
```

### `POST /api/v1/scan/async`
Async scan — returns job ID immediately, process in background.

### `GET /api/v1/jobs/{job_id}`
Poll job status. Returns `result` when `status == "done"`.

### `GET /api/v1/stats`
Service statistics (requires auth).

## Environment Variables

See `.env.example` for all options. Key ones:

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3005 | Listen port |
| `API_SHARED_KEY` | `scanner-dev-key-2026` | Shared secret for inbound auth |
| `DATABASE_PATH` | `./data/scanner.db` | SQLite path |
| `ANTHROPIC_API_KEY` | (empty) | Required for VLM (Claude Sonnet 4) |
| `MAX_FILE_SIZE_MB` | 10 | Upload size limit |
| `MAX_PAGES` | 10 | Max PDF pages to process |
| `HOST_CALLBACK_URL` | (empty) | Webhook URL for async callbacks |

## PM2 (Production)

See `ecosystem.config.example.js` in the project root. The scanner-service entry
is added to the existing PM2 config:

```js
{
  name: 'scanner-service',
  script: 'main.py',
  cwd: `${process.cwd()}/mini-services/scanner-service`,
  interpreter: 'python3',
  env: { ... },
  exec_mode: 'fork',
  instances: 1,
  max_memory_restart: '512M',
}
```

## Architecture

```
mini-services/scanner-service/
├── main.py                 # FastAPI entry, uvicorn, lifespan
├── requirements.txt
├── .env.example
├── install.sh              # One-shot installer
├── data/                   # Auto-created
│   └── scanner.db          # SQLite (WAL mode)
└── src/
    ├── config.py           # Centralized env config
    ├── logging_setup.py    # structlog JSON/pretty logging
    ├── data_layer.py       # SQLite CRUD (scan_jobs + ocr_results)
    ├── image_enhance.py    # cv2 8-step v10 pipeline + quality assessment
    ├── danish_parser.py    # Port of receipt-parser.ts (754 LOC)
    ├── danish_validate.py  # CVR/EAN/IBAN + document classification + account suggestion
    ├── pdf_processor.py    # PyMuPDF: text extraction + 300 DPI rendering
    ├── vlm_client.py       # Anthropic SDK + Pydantic schema + retry
    ├── ocr_engine.py       # Hybrid pipeline orchestration
    ├── webhook.py          # HMAC-SHA256 webhook dispatch
    └── routes.py           # FastAPI route handlers
```

## Pipeline

```
1. Receive file → validate size → create scan_job (SQLite)
2. SHA-256 cache lookup → return cached if hit
3. Route by file type:
   ├─ PDF with text layer → PyMuPDF.get_text() → Danish parser (FAST — no VLM)
   ├─ PDF without text → render 300 DPI PNG → VLM
   └─ Image → enhance (v10) → Tesseract
       └─ If confidence < 60 → VLM fallback
4. Danish validation & enrichment:
   - CVR extraction + Mod-11 checksum
   - Document type classification (receipt/invoice/credit_note)
   - Account suggestion (Danish keyword → FSR account)
5. Compute weighted confidence (vs hardcoded 85 in old code)
6. Persist OCR result to SQLite (audit trail — old version discarded this!)
7. Return VLMApiResponse-compatible JSON + _extensions
```

## Migration from JS version

The old `/api/ocr/pdf` endpoint (Next.js API route) is replaced by this service.
The host app's `src/lib/ocr/vlm-client.ts` is updated to call `/api/scanner/scan`
instead of `/api/ocr/pdf`. The response shape is backward-compatible.

Old JS dependencies that can be removed from the host app's `package.json`:
- `tesseract.js` (now server-side via pytesseract)
- `pdfjs-dist` (replaced by PyMuPDF)
- `canvas` (replaced by cv2)
- `react-easy-crop` (orphan — never used)
