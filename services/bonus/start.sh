#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/web-v2/wynta-bonus"

# ── Kill both child processes on Ctrl-C or script exit ───────────────────────
cleanup() {
  echo ""
  echo "Stopping servers…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup INT TERM EXIT

# ── Free ports before starting ───────────────────────────────────────────────
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

free_port 8000
free_port 3000

echo "┌─────────────────────────────────────────────────┐"
echo "│  Bonus Service — dev start                       │"
echo "│                                                   │"
echo "│  Backend  →  http://localhost:8000                │"
echo "│  API docs →  http://localhost:8000/docs           │"
echo "│  Frontend →  http://localhost:3000                │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# ── Backend ───────────────────────────────────────────────────────────────────
echo "[backend]  starting uvicorn on :8000 …"
cd "$SCRIPT_DIR"
uv run uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "[frontend] starting Next.js on :3000 …"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Both servers running. Press Ctrl-C to stop."
echo ""

# Block until either process exits
wait "$BACKEND_PID" "$FRONTEND_PID"
