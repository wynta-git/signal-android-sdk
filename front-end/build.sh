#!/usr/bin/env bash
set -euo pipefail

QA_BASE="https://qa-app.fozilpartners.com"
export NEXT_PUBLIC_BONUS_API_URL="$QA_BASE"
export NEXT_PUBLIC_AUTH_API_URL="$QA_BASE"
export NEXT_PUBLIC_SEG_API_URL="$QA_BASE"
export NEXT_PUBLIC_CAMPAIGN_API_URL="$QA_BASE"
export NEXT_PUBLIC_COPILOT_API_URL="https://qa-ai-engine.fozilpartners.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

cd "$SCRIPT_DIR"

echo "==> Installing workspace dependencies..."
npm install

echo "==> Cleaning previous build..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

echo "==> Building wynta-bonus..."
cd "$SCRIPT_DIR/wynta-bonus"
npm run build
mkdir -p "$DIST_DIR/bonus"
cp -r out/. "$DIST_DIR/bonus/"

echo "==> Building wynta-crm..."
cd "$SCRIPT_DIR/wynta-crm"
npm run build
mkdir -p "$DIST_DIR/crm"
cp -r out/. "$DIST_DIR/crm/"

echo "==> Building wynta-web (shell)..."
cd "$SCRIPT_DIR/wynta-web"
npm run build
cp -r out/. "$DIST_DIR/"

echo ""
echo "Build complete. Static output written to: $DIST_DIR"
echo ""
echo "Deployment layout:"
echo "  dist/          → wynta-web  (served at /)"
echo "  dist/bonus/    → wynta-bonus (served at /bonus)"
echo "  dist/crm/      → wynta-crm  (served at /crm)"
