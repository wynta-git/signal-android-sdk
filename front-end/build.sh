#!/usr/bin/env bash
set -euo pipefail

# QA endpoint
QA_BASE="https://qa-app.fozilpartners.com"
export NEXT_PUBLIC_COPILOT_API_URL="https://qa-ai-engine.fozilpartners.com"
export NEXT_PUBLIC_CHAT_URL="https://qa-chat.fozilpartners.com/chat/"

# Prod endpoint
# QA_BASE="https://api.wynta.com"
# export NEXT_PUBLIC_COPILOT_API_URL="https://ai-agents.wynta.com"
# export NEXT_PUBLIC_CHAT_URL="https://chat.wynta.com/chat"

export NEXT_PUBLIC_BONUS_API_URL="$QA_BASE"
export NEXT_PUBLIC_AUTH_API_URL="$QA_BASE"
export NEXT_PUBLIC_SEG_API_URL="$QA_BASE"
export NEXT_PUBLIC_CAMPAIGN_API_URL="$QA_BASE"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"
DEPLOY_DIR="/var/www/wynta-pam-app"

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

echo "==> Deploying to $DEPLOY_DIR..."
SUDO=""
if [ ! -w "$(dirname "$DEPLOY_DIR")" ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi
$SUDO mkdir -p "$DEPLOY_DIR"
$SUDO rsync -a --delete "$DIST_DIR/" "$DEPLOY_DIR/"

echo ""
echo "Deploy complete."
echo ""
echo "Deployment layout:"
echo "  $DEPLOY_DIR/          → wynta-web  (https://qa-app.fozilpartners.com/)"
echo "  $DEPLOY_DIR/bonus/    → wynta-bonus (https://qa-app.fozilpartners.com/bonus)"
echo "  $DEPLOY_DIR/crm/      → wynta-crm  (https://qa-app.fozilpartners.com/crm)"
