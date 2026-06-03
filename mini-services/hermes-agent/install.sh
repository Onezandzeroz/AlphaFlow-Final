#!/usr/bin/env bash
# ============================================================
#  Hermes Agent — Add-on Installer
#  Run this from the ROOT of your Next.js project.
#  Usage:  curl -sL <script-url> | bash   OR   bash install-hermes.sh
# ============================================================

set -euo pipefail

BOLD='\033[1m'
DIM='\033[2m'
AMBER='\033[38;5;214m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${AMBER}🏛  Hermes:${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${RED}  ⚠${NC} $*"; }

# ── Pre-flight checks ──────────────────────────────────────────
log "Add-on Installer starting…"

if ! command -v bun &>/dev/null && ! command -v npm &>/dev/null; then
  warn "Neither bun nor npm found. Please install one first."
  exit 1
fi

if [ ! -f "package.json" ]; then
  warn "No package.json found. Run this from the root of your Next.js project."
  exit 1
fi

PKG_MANAGER="bun"
if ! command -v bun &>/dev/null; then
  PKG_MANAGER="npm"
fi

# ── Step 1: Create mini-services directory ────────────────────
MINI_SERVICES_DIR="mini-services/hermes-agent"

log "Step 1/5 — Creating mini-service directory…"
mkdir -p "$MINI_SERVICES_DIR"
ok "Created $MINI_SERVICES_DIR/"

# ── Step 2: Copy backend files ──────────────────────────────
log "Step 2/5 — Setting up backend mini-service…"

# Write package.json
cat > "$MINI_SERVICES_DIR/package.json" << 'PKGJSON'
{
  "name": "@alphaflow/hermes-agent",
  "version": "1.0.0",
  "description": "Hermes AI Accounting Consultant — overlay agent add-on",
  "main": "index.ts",
  "scripts": {
    "dev": "bun --hot index.ts",
    "start": "bun index.ts"
  },
  "dependencies": {
    "socket.io": "^4.8.0",
    "z-ai-web-dev-sdk": "^0.0.18"
  }
}
PKGJSON
ok "  package.json"

# ── Step 3: Copy frontend components ──────────────────────────
log "Step 3/5 — Setting up frontend overlay components…"

HERMES_DIR="src/components/hermes"
mkdir -p "$HERMES_DIR"
ok "  Created $HERMES_DIR/"

# Copy all frontend files if they exist in the current directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_FILES=(
  "types.ts"
  "useHermesSocket.ts"
  "HermesOverlay.tsx"
  "HermesFab.tsx"
  "HermesPanel.tsx"
  "HermesNotificationCard.tsx"
  "index.ts"
)

for FILE in "${FRONTEND_FILES[@]}"; do
  if [ -f "$SCRIPT_DIR/frontend/$FILE" ]; then
    cp "$SCRIPT_DIR/frontend/$FILE" "$HERMES_DIR/$FILE"
    ok "  Copied $HERMES_DIR/$FILE"
  fi
done

# ── Step 4: Install dependencies ─────────────────────────────
log "Step 4/5 — Installing dependencies…"

if [ "$PKG_MANAGER" = "bun" ]; then
  (cd "$MINI_SERVICES_DIR" && bun install) 2>/dev/null
  bun add socket.io-client 2>/dev/null
else
  (cd "$MINI_SERVICES_DIR" && npm install) 2>/dev/null
  npm install socket.io-client --save 2>/dev/null
fi
ok "  Dependencies installed"

# ── Step 5: Done ────────────────────────────────────────────
echo ""
log "Installation complete!"
echo ""
echo -e "${BOLD}  What was installed:${NC}"
echo "    Backend:   $MINI_SERVICES_DIR/  (Socket.IO + LLM, port 3004)"
echo "    Frontend:  $HERMES_DIR/         (overlay UI components)"
echo ""
echo -e "${BOLD}  Next steps:${NC}"
echo "    1. Copy the backend source files into $MINI_SERVICES_DIR/"
echo "       (config.ts, knowledge-base.ts, tenant-provider.ts, utils.ts, index.ts)"
echo ""
echo "    2. Add to your root layout or page:"
echo "       ${DIM}import { HermesOverlay } from '@/components/hermes'${NC}"
echo "       ${DIM}<HermesOverlay tenantId=\"your-tenant\" userId=\"user-1\" userName=\"Name\" />${NC}"
echo ""
echo "    3. Start the Hermes mini-service:"
echo "       ${DIM}cd $MINI_SERVICES_DIR && bun run dev${NC}"
echo ""
echo "    4. Start your Next.js dev server as usual."
echo ""
echo -e "${BOLD}  Full guide: HERMES-ADDON.md${NC}"
echo ""
