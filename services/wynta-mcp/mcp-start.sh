#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Kill child process on Ctrl-C or script exit ──────────────────────────────
cleanup() {
  echo ""
  echo "Stopping MCP server…"
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
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

MCP_PORT="${MCP_PORT:-8082}"

free_port "$MCP_PORT"

echo "┌─────────────────────────────────────────────────┐"
echo "│  Wynta MCP Server — dev start                    │"
echo "│                                                   │"
echo "│  MCP  →  http://localhost:$MCP_PORT               │"
echo "└─────────────────────────────────────────────────┘"
echo ""

# ── Server ────────────────────────────────────────────────────────────────────
echo "[server]   starting MCP on :$MCP_PORT …"
cd "$SCRIPT_DIR"
if command -v uv &>/dev/null; then
  unset VIRTUAL_ENV
  uv run python -m wynta_mcp.server &
else
  "$SCRIPT_DIR/.venv/bin/python" -m wynta_mcp.server &
fi
SERVER_PID=$!

echo ""
echo "Server running. Press Ctrl-C to stop."
echo ""

# Block until process exits
wait "$SERVER_PID"
