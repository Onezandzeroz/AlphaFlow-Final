#!/usr/bin/env bash
# ─── AlphaFlow Scanner Service — Installer ──────────────────────
# Usage: bash install.sh
#
# Creates a Python venv, installs dependencies, and verifies Tesseract.
# Run from the service root: mini-services/scanner-service/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "  ╔════════════════════════════════════════════════════════╗"
echo "  ║  AlphaFlow Scanner Service — Installer                  ║"
echo "  ╚════════════════════════════════════════════════════════╝"
echo ""

# ── 1. Python check ────────────────────────────────────────────
PYTHON_BIN=""
for v in python3.11 python3.12 python3.13 python3; do
  if command -v "$v" >/dev/null 2>&1; then
    PYTHON_BIN="$v"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "  ✗ Python 3.11+ not found. Install with:"
  echo "    sudo apt-get install -y python3.11 python3.11-venv python3-pip"
  exit 1
fi

echo "  ✓ Using: $($PYTHON_BIN --version)"

# ── 2. System dependencies check ───────────────────────────────
echo ""
echo "  Checking system dependencies..."

if ! command -v tesseract >/dev/null 2>&1; then
  echo "  ⚠ Tesseract not found. Install with:"
  echo "    sudo apt-get install -y tesseract-ocr tesseract-ocr-dan tesseract-ocr-eng"
else
  echo "  ✓ Tesseract: $(tesseract --version 2>&1 | head -1)"
fi

# ── 3. Create venv ─────────────────────────────────────────────
echo ""
echo "  Creating virtual environment (.venv)..."

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi

# shellcheck disable=SC1091
source .venv/bin/activate

echo "  ✓ Virtual environment activated"

# ── 4. Install Python dependencies ─────────────────────────────
echo ""
echo "  Installing Python dependencies..."
pip install --upgrade pip --quiet
pip install -r requirements.txt

echo "  ✓ Dependencies installed"

# ── 5. Create data directory ───────────────────────────────────
mkdir -p data
echo "  ✓ data/ directory ready"

# ── 6. Environment file ────────────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "  ✓ Created .env from .env.example (edit and add ANTHROPIC_API_KEY)"
else
  echo "  ✓ .env already exists"
fi

# ── 7. Done ────────────────────────────────────────────────────
echo ""
echo "  ╔════════════════════════════════════════════════════════╗"
echo "  ║  Installation complete!                                 ║"
echo "  ║                                                          ║"
echo "  ║  Next steps:                                             ║"
echo "  ║    1. Edit .env and add your ANTHROPIC_API_KEY           ║"
echo "  ║    2. Start dev server:                                  ║"
echo "  ║         source .venv/bin/activate                        ║"
echo "  ║         uvicorn main:app --host 0.0.0.0 --port 3005 \\    ║"
echo "  ║           --reload                                       ║"
echo "  ║                                                          ║"
echo "  ║  Production (PM2):                                       ║"
echo "  ║    pm2 start ecosystem.config.js                         ║"
echo "  ╚════════════════════════════════════════════════════════╝"
echo ""
