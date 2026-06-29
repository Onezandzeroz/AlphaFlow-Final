#!/usr/bin/env bash
# ============================================================
# setup-services.sh — First-time setup for AlphaFlow mini-services
# ============================================================
# Run this ONCE after cloning the repo and before starting PM2.
#
# Usage:
#   chmod +x setup-services.sh
#   ./setup-services.sh
#
# What it does:
#   1. Installs dependencies for each mini-service (bun install)
#   2. Generates the Prisma client for services that use PostgreSQL
#   3. Verifies the setup by checking that @prisma/client exists
#
# Prerequisites:
#   - bun installed (https://bun.sh)
#   - Node.js 18+ installed
#   - Root project already has bun install run
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SERVICES=(hermes-agent knowledge-service tokenpay-access-service)

echo "╔═══════════════════════════════════════════════════════════╗"
echo "║  AlphaFlow Mini-Services Setup                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Project root: $PROJECT_ROOT"
echo ""

# ─── Step 1: Install dependencies ────────────────────────────
echo "━━━ Step 1: Installing dependencies ━━━"
echo ""

for svc in "${SERVICES[@]}"; do
  SVC_DIR="$PROJECT_ROOT/mini-services/$svc"
  if [ -d "$SVC_DIR" ]; then
    echo "→ Installing $svc..."
    cd "$SVC_DIR"
    bun install 2>&1 | tail -3
    echo "  ✓ $svc dependencies installed"
    echo ""
  else
    echo "  ⚠ $svc directory not found — skipping"
  fi
done

# ─── Step 2: Generate Prisma clients ─────────────────────────
echo "━━━ Step 2: Generating Prisma clients ━━━"
echo ""

PRISMA_SERVICES=(hermes-agent knowledge-service)

for svc in "${PRISMA_SERVICES[@]}"; do
  SVC_DIR="$PROJECT_ROOT/mini-services/$svc"
  if [ -d "$SVC_DIR" ]; then
    echo "→ Generating Prisma client for $svc..."
    cd "$SVC_DIR"
    npx prisma generate --schema=../../prisma/schema.prisma 2>&1 | tail -3
    echo "  ✓ $svc Prisma client generated"
    echo ""
  fi
done

# ─── Step 3: Verify ──────────────────────────────────────────
echo "━━━ Step 3: Verifying setup ━━━"
echo ""

ALL_OK=true

for svc in "${PRISMA_SERVICES[@]}"; do
  CLIENT_PATH="$PROJECT_ROOT/mini-services/$svc/node_modules/.prisma/client/index.js"
  if [ -f "$CLIENT_PATH" ]; then
    echo "  ✓ $svc — Prisma client found"
  else
    echo "  ✗ $svc — Prisma client NOT found (run manually: cd mini-services/$svc && npx prisma generate --schema=../../prisma/schema.prisma)"
    ALL_OK=false
  fi
done

# Also verify notification-ws (no Prisma, just dependencies)
for svc in notification-ws-service; do
  if [ -d "$PROJECT_ROOT/mini-services/$svc/node_modules" ]; then
    echo "  ✓ $svc — dependencies installed"
  else
    echo "  ✗ $svc — dependencies not installed"
    ALL_OK=false
  fi
done

echo ""
if [ "$ALL_OK" = true ]; then
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  ✓ All services are ready!                              ║"
  echo "║                                                           ║"
  echo "║  Next steps:                                              ║"
  echo "║    1. Copy .env.example to .env and fill in values       ║"
  echo "║    2. Update ecosystem.config.js with your env vars      ║"
  echo "║    3. Run: pm2 start ecosystem.config.js                 ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
else
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║  ⚠ Some services need manual setup — see above          ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  exit 1
fi
