#!/usr/bin/env bash
# =============================================================================
# PAM — Auth Service deploy (App Layer: 172.31.44.32)
#
# Run as root or with sudo on Instance 2:
#   sudo bash deploy-auth.sh
#
# Prerequisites:
#   - deploy-instance2.sh has already run (shared venv exists at $REPO/.venv)
#   - Instance 1 (MongoDB) is up
#   - RS256 key pair generated and private key placed at $PRIVKEY_FILE
#     (see Key setup below)
#
# Key setup (run once, before this script):
#   openssl genrsa -out /home/ubuntu/pam-jwt-private.pem 2048
#   openssl rsa -in /home/ubuntu/pam-jwt-private.pem -pubout -out /home/ubuntu/pam-jwt-public.pem
#   chmod 600 /home/ubuntu/pam-jwt-private.pem
#   # Then distribute pam-jwt-public.pem to segmentation/campaign .env as SYSTEM_JWT_PUBLIC_KEY
#
# What this does:
#   1. Verifies repo, venv, and private key file
#   2. Installs auth-service-specific deps (PyJWT[crypto], bcrypt)
#   3. Writes .env for auth-service (embeds private key from file)
#   4. Creates and enables systemd unit pam-auth
#   5. Starts the service
#   6. Readiness check on /health
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"
INSTANCE2_IP="172.31.44.32"
REPO="/home/ubuntu/pam"
APP_USER="ubuntu"
SERVICE_DIR="$REPO/services/auth-service"
VENV="$REPO/.venv"
PORT=8002
PRIVKEY_FILE="/home/ubuntu/pam-jwt-private.pem"

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-auth.sh"

as_user() { sudo -u "$APP_USER" env HOME="/home/$APP_USER" PATH="/home/$APP_USER/.local/bin:$PATH" "$@"; }

echo ""
echo "======================================================"
echo "  PAM — Auth Service deploy"
echo "  Host: $INSTANCE2_IP  →  port $PORT"
echo "======================================================"

# ── 1. verify repo, venv, and private key ────────────────────────────────────
section "1. Checking repo, venv, and key"

[ -d "$SERVICE_DIR" ]        || die "auth-service dir not found at $SERVICE_DIR"
[ -d "$REPO/shared" ]        || die "shared dir missing at $REPO/shared"
[ -f "$VENV/bin/python" ]    || die "Shared venv not found at $VENV — run deploy-instance2.sh first"
ok "Repo at $REPO"
ok "Venv at $VENV"

if [ ! -f "$PRIVKEY_FILE" ]; then
    die "Private key not found at $PRIVKEY_FILE. Generate it first:
    openssl genrsa -out $PRIVKEY_FILE 2048
    chmod 600 $PRIVKEY_FILE"
fi
ok "Private key found at $PRIVKEY_FILE"

info "Pulling latest changes from git..."
as_user git -C "$REPO" pull --ff-only
ok "Repo up to date"

info "Setting repo ownership to $APP_USER..."
chown -R "$APP_USER:$APP_USER" "$REPO"
ok "Ownership set"

# ── 2. install auth-service deps ─────────────────────────────────────────────
section "2. Installing auth-service dependencies"

UV="$(as_user bash -c 'command -v uv')"

info "Installing PyJWT and bcrypt into shared venv..."
as_user "$UV" pip install --python "$VENV/bin/python" \
    "PyJWT[crypto]>=2.8.0" \
    "bcrypt>=4.1.0" \
    --quiet
ok "auth-service deps installed"

# ── 3. write .env ─────────────────────────────────────────────────────────────
section "3. Writing .env"

# Read private key and escape newlines for .env (double-quoted multiline value)
PRIVKEY_ESCAPED=$(sed ':a;N;$!ba;s/\n/\\n/g' "$PRIVKEY_FILE")

cat > "$SERVICE_DIR/.env" <<EOF
MONGO_URL=mongodb://admin:glgpam2026@$INSTANCE1_IP:27017/?authSource=admin
MONGO_DB=pam

JWT_PRIVATE_KEY="$PRIVKEY_ESCAPED"
JWT_TOKEN_TTL=3600

DEBUG=true
VERSION=0.1.0
EOF
chmod 600 "$SERVICE_DIR/.env"
chown "$APP_USER:$APP_USER" "$SERVICE_DIR/.env"
ok "auth-service/.env written (mode 600)"

# ── 4. seed service accounts ──────────────────────────────────────────────────
section "4. Seeding service accounts"

info "Running seed_service_accounts.py (upsert — safe to re-run)..."
as_user env \
    MONGO_URL="mongodb://admin:glgpam2026@$INSTANCE1_IP:27017/?authSource=admin" \
    MONGO_DB="pam" \
    "$VENV/bin/python" "$REPO/scripts/seed_service_accounts.py"
ok "Service accounts seeded"

# ── 5. create systemd unit ────────────────────────────────────────────────────
section "5. Creating systemd unit"

cat > /etc/systemd/system/pam-auth.service <<EOF
[Unit]
Description=PAM Auth Service
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SERVICE_DIR
Environment="PYTHONPATH=$SERVICE_DIR:$REPO"
ExecStart=$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port $PORT
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pam-auth

[Install]
WantedBy=multi-user.target
EOF
ok "pam-auth.service written"

systemctl daemon-reload
systemctl enable pam-auth
ok "pam-auth enabled at boot"

# ── 6. start service ──────────────────────────────────────────────────────────
section "6. Starting service"

systemctl restart pam-auth
ok "pam-auth started"

# ── 7. readiness check ────────────────────────────────────────────────────────
section "7. Readiness check"

info "Waiting for auth-service on port $PORT (up to 30s)..."
READY=false
for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/v1/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        ok "auth-service is READY (HTTP 200 /v1/health)"
        READY=true
        break
    fi
    echo "    attempt $i/15 — waiting 2s (HTTP $HTTP_STATUS)..."
    sleep 2
done

if [ "$READY" = "false" ]; then
    warn "auth-service did not respond after 30s."
    warn "Check logs: journalctl -u pam-auth -n 60 --no-pager"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Auth Service deploy complete."
echo ""
echo "  Service:  pam-auth"
echo "  Endpoint: http://$INSTANCE2_IP:$PORT"
echo "  Logs:     journalctl -u pam-auth -f"
echo ""
echo "── Next step: update consumer services ────────────────"
echo ""
echo "  Copy the public key to segmentation-engine and campaign-engine .env:"
echo ""
echo "  PUB=\$(cat /home/ubuntu/pam-jwt-public.pem | tr '\\n' '|' | sed 's/|/\\\\n/g')"
echo "  echo \"SYSTEM_JWT_PUBLIC_KEY=\\\"\$PUB\\\"\" >> $REPO/services/segmentation-engine/.env"
echo "  echo \"SYSTEM_JWT_PUBLIC_KEY=\\\"\$PUB\\\"\" >> $REPO/services/campaign-engine/.env"
echo "  systemctl restart pam-segmentation pam-campaign"
echo ""
echo "── Smoke tests ────────────────────────────────────────"
echo ""
echo "  # Health"
echo "  curl -s http://$INSTANCE2_IP:$PORT/v1/health"
echo ""
echo "  # Get a system token (replace password with value from seed script)"
cat <<CURLEOF
  curl -s -X POST 'http://$INSTANCE2_IP:$PORT/v1/system/token' \\
    -H 'Content-Type: application/json' \\
    -d '{"username": "campaign-engine", "password": "change-me-campaign-engine"}' \\
    | python3 -m json.tool
CURLEOF
echo ""
echo "======================================================"
echo ""
