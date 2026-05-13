#!/usr/bin/env bash
# Create (or recreate) a single shared venv for the entire PAM monorepo.
# Usage:
#   ./setup-venv.sh           — create .venv and install everything
#   ./setup-venv.sh --reset   — delete existing .venv first, then reinstall

set -euo pipefail

VENV_DIR=".venv"


PY="/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12"
echo "Using Python: $PY ($("$PY" --version))"

# ── optional reset ────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--reset" ]]; then
  echo "Removing existing $VENV_DIR ..."
  rm -rf "$VENV_DIR"
fi

# ── create venv if it doesn't exist ──────────────────────────────────────────
if [[ ! -d "$VENV_DIR" ]]; then
  echo "Creating venv at $VENV_DIR ..."
  "$PY" -m venv "$VENV_DIR"
fi

# ── activate ──────────────────────────────────────────────────────────────────
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# ── upgrade pip / setuptools ──────────────────────────────────────────────────
pip install --quiet --upgrade pip setuptools wheel

# ── install all monorepo deps ─────────────────────────────────────────────────
echo "Installing monorepo requirements ..."
pip install -r requirements.txt

echo ""
echo "Done. Activate with:  source $VENV_DIR/bin/activate"

source .venv/bin/activate
