#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Kill all child processes on Ctrl-C or script exit ────────────────────────
cleanup() {
  echo ""
  echo "Stopping servers…"
  kill "$BONUS_PID" "$CRM_PID" "$WEB_PID" 2>/dev/null || true
  wait "$BONUS_PID" "$CRM_PID" "$WEB_PID" 2>/dev/null || true
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
free_port 3001
free_port 3002

echo "┌─────────────────────────────────────────────────┐"
echo "│  Wynta Platform — dev start                       │"
echo "│                                                   │"
echo "│  Web    →  http://localhost:3000                  │"
echo "│  Bonus  →  http://localhost:3000/bonus            │"
echo "│  CRM    →  http://localhost:3000/crm              │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# ── Bonus ─────────────────────────────────────────────────────────────────────
echo "[bonus]    starting Next.js on :3001 …"
cd "$SCRIPT_DIR/wynta-bonus"
npm run dev &
BONUS_PID=$!

# ── CRM ───────────────────────────────────────────────────────────────────────
echo "[crm]      starting Next.js on :3002 …"
cd "$SCRIPT_DIR/wynta-crm"
npm run dev &
CRM_PID=$!

# ── Web (entry + proxy) ───────────────────────────────────────────────────────
echo "[web]      starting Next.js on :3000 …"
cd "$SCRIPT_DIR/wynta-web"
npm run dev &
WEB_PID=$!

echo ""
echo "All servers running. Press Ctrl-C to stop."
echo ""

# Block until any process exits
wait "$WEB_PID"
