#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cleanup() {
  echo ""
  echo "Stopping…"
  kill "$UI_PID" 2>/dev/null || true
  wait "$UI_PID" 2>/dev/null || true
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

cd "$SCRIPT_DIR"

# ── Ensure .env.local exists ──────────────────────────────────────────────────
if [[ ! -f .env.local ]]; then
  echo "[env]      .env.local not found — copying from .env.local.example"
  cp .env.local.example .env.local
  echo "[env]      Edit .env.local and set S2S_CLIENT_ID and S2S_CLIENT_SECRET, then re-run."
  exit 1
fi

# ── Install deps if needed ────────────────────────────────────────────────────
if [[ ! -d node_modules ]]; then
  echo "[npm]      installing dependencies…"
  npm install --silent
fi

free_port 3010

echo "┌─────────────────────────────────────────────────┐"
echo "│  Bonus Client Test — dev start                   │"
echo "│                                                   │"
echo "│  UI  →  http://localhost:3010                     │"
echo "│                                                   │"
echo "│  Bonus service must be running on :8010           │"
echo "│  (run services/bonus/bonus-start.sh separately)   │"
echo "└─────────────────────────────────────────────────┘"
echo ""

npm run dev &
UI_PID=$!

echo ""
echo "Press Ctrl-C to stop."
echo ""

wait "$UI_PID"
