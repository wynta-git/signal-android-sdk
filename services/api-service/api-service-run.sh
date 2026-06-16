#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Kill child process on Ctrl-C or script exit ──────────────────────────────
cleanup() {
  echo ""
  echo "Stopping server…"
  kill "$BACKEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup INT TERM EXIT

# ── Free port before starting ────────────────────────────────────────────────
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

free_port 8001

echo "┌─────────────────────────────────────────────────┐"
echo "│  API Service — dev start                         │"
echo "│                                                   │"
echo "│  Backend  →  http://localhost:8001                │"
echo "│  API docs →  http://localhost:8001/docs           │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# ── Backend ───────────────────────────────────────────────────────────────────
echo "[backend]  starting uvicorn on :8001 …"
cd "$SCRIPT_DIR"
if command -v uv &>/dev/null; then
  uv run uvicorn app.main:app --reload --port 8001 &
else
  "$SCRIPT_DIR/.venv/bin/uvicorn" app.main:app --reload --port 8001 &
fi
BACKEND_PID=$!

echo ""
echo "Server running. Press Ctrl-C to stop."
echo ""

# Block until process exits
wait "$BACKEND_PID"
