#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/wynta-bonus"

# ── Kill child process on Ctrl-C or script exit ──────────────────────────────
cleanup() {
  echo ""
  echo "Stopping server…"
  kill "$FRONTEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
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

free_port 3000

echo "┌─────────────────────────────────────────────────┐"
echo "│  Bonus Frontend — dev start                      │"
echo "│                                                   │"
echo "│  Frontend →  http://localhost:3000                │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# ── Frontend ──────────────────────────────────────────────────────────────────
echo "[frontend] starting Next.js on :3000 …"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Server running. Press Ctrl-C to stop."
echo ""

# Block until process exits
wait "$FRONTEND_PID"
