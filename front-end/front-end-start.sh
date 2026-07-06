#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── API endpoint configuration ────────────────────────────────────────────────
# Bonus runs locally; all other services point at the QA environment.
QA_BASE="https://qa-app.fozilpartners.com"
#QA_BASE="https://api.wynta.com"
#QA_BASE="http://127.0.0.1:8002"


export NEXT_PUBLIC_BONUS_API_URL="http://localhost:8010"
export NEXT_PUBLIC_AUTH_API_URL="http://127.0.0.1:8002"
export NEXT_PUBLIC_SEG_API_URL="${QA_BASE}"
export NEXT_PUBLIC_CAMPAIGN_API_URL="${QA_BASE}"
# ─────────────────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  echo "Stopping server…"
  kill "$WEB_PID" 2>/dev/null || true
  wait "$WEB_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup INT TERM EXIT

free_port() {
  local port=$1
  local pids
  pids=$(lsof -ti :"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo "[ports]    killing process(es) on :$port (PID $pids)"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
}

free_port 3000

echo "┌─────────────────────────────────────────────────┐"
echo "│  Wynta Platform — dev start                       │"
echo "│                                                   │"
echo "│  Web    →  http://localhost:3000                  │"
echo "│  Bonus  →  http://localhost:3000/bonus            │"
echo "│  CRM    →  http://localhost:3000/crm              │"
echo "└─────────────────────────────────────────────────┘"
echo ""

echo "[web]      starting Next.js on :3000 …"
(cd "$SCRIPT_DIR/wynta-web" && npm run dev) &
WEB_PID=$!

echo ""
echo "Server running. Press Ctrl-C to stop."
echo ""

wait "$WEB_PID"
