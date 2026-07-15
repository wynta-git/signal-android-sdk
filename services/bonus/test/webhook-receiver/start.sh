#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8999

cleanup() {
  echo ""
  echo "Stopping…"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
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
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

free_port "$PORT"

echo "┌─────────────────────────────────────────────────┐"
echo "│  Bonus Webhook Test Receiver — dev start          │"
echo "│                                                   │"
echo "│  Receiver →  http://localhost:$PORT                │"
echo "│  Events   →  http://localhost:$PORT/events         │"
echo "│                                                   │"
echo "│  Point a site's webhook_config url at:            │"
echo "│  http://localhost:$PORT/api/v1/bonus/wallet-update │"
echo "└─────────────────────────────────────────────────┘"
echo ""

if command -v uv &>/dev/null; then
  uv run uvicorn main:app --reload --port "$PORT" &
else
  "$SCRIPT_DIR/.venv/bin/uvicorn" main:app --reload --port "$PORT" &
fi
SERVER_PID=$!

echo ""
echo "Press Ctrl-C to stop."
echo ""

wait "$SERVER_PID"
