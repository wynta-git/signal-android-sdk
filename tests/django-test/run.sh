#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../../front-end"
DIST_DIR="$FRONTEND_DIR/dist"
VENV_DIR="$SCRIPT_DIR/.venv"
PORT="${PORT:-8000}"

BUILD_FRONTEND=0
for arg in "$@"; do
  case "$arg" in
    --build) BUILD_FRONTEND=1 ;;
  esac
done

# --- optional front-end build ---
if [ "$BUILD_FRONTEND" -eq 1 ]; then
  echo "==> Building front-end..."
  cd "$FRONTEND_DIR" && bash build.sh
fi

cd "$SCRIPT_DIR"

# --- verify dist dirs exist ---
if [ ! -d "$DIST_DIR/bonus" ]; then
  echo "ERROR: $DIST_DIR/bonus not found. Run with --build first." >&2
  exit 1
fi
if [ ! -d "$DIST_DIR/crm" ]; then
  echo "ERROR: $DIST_DIR/crm not found. Run with --build first." >&2
  exit 1
fi

# --- python venv ---
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "==> Installing requirements..."
pip install -q -r requirements.txt

# --- collect static files ---
echo "==> Collecting static files..."
python manage.py collectstatic --noinput --clear

# --- run dev server ---
echo ""
echo "Starting Django dev server on http://localhost:$PORT"
echo "  /product/bonus/  →  wynta-bonus"
echo "  /product/crm/    →  wynta-crm"
echo ""
python manage.py runserver "$PORT"
