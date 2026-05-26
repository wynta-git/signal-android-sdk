#!/usr/bin/env bash
# =============================================================================
# PAM — Notifications Engine deploy (App Layer: 172.31.44.32)
#
# Run as root or with sudo on Instance 2:
#   sudo bash deploy-notification.sh
#
# Prerequisites:
#   - deploy-instance2.sh has already run (shared venv exists at $REPO/.venv)
#   - Instance 1 (Kafka / MongoDB / Redis) is up
#   - pam.campaigns.send.v1 topic exists (created by campaign-engine deploy)
#
# What this does:
#   1. Verifies repo and shared venv
#   2. Installs notifications-engine-specific deps (jinja2, httpx)
#   3. Writes .env for notifications-engine
#   4. Creates and enables systemd unit pam-notif
#   5. Starts the service
#   6. Readiness check on /health (port 8080)
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"
INSTANCE2_IP="172.31.44.32"
REPO="/home/ubuntu/pam"
APP_USER="ubuntu"
SERVICE_DIR="$REPO/services/notifications-engine"
VENV="$REPO/.venv"
PORT=8080

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-notification.sh"

as_user() { sudo -u "$APP_USER" env HOME="/home/$APP_USER" PATH="/home/$APP_USER/.local/bin:$PATH" "$@"; }

echo ""
echo "======================================================"
echo "  PAM — Notifications Engine deploy"
echo "  Host: $INSTANCE2_IP  →  port $PORT"
echo "======================================================"

# ── 1. verify repo and venv ───────────────────────────────────────────────────
section "1. Checking repo and venv"

[ -d "$SERVICE_DIR" ]        || die "notifications-engine dir not found at $SERVICE_DIR"
[ -d "$REPO/shared" ]        || die "shared dir missing at $REPO/shared"
[ -f "$VENV/bin/python" ]    || die "Shared venv not found at $VENV — run deploy-instance2.sh first"
ok "Repo at $REPO"
ok "Venv at $VENV"

info "Pulling latest changes from git..."
as_user git -C "$REPO" pull --ff-only
ok "Repo up to date"

info "Setting repo ownership to $APP_USER..."
chown -R "$APP_USER:$APP_USER" "$REPO"
ok "Ownership set"

# ── 2. install notifications-engine deps ─────────────────────────────────────
section "2. Installing notifications-engine dependencies"

UV="$(as_user bash -c 'command -v uv')"

info "Installing notifications-engine deps into shared venv..."
as_user "$UV" pip install --python "$VENV/bin/python" \
    "jinja2>=3.1.0" \
    "httpx>=0.27.0" \
    --quiet
ok "notifications-engine deps installed"

# ── 3. write .env ─────────────────────────────────────────────────────────────
section "3. Writing .env"

cat > "$SERVICE_DIR/.env" <<EOF
MONGO_URL=mongodb://admin:glgpam2026@$INSTANCE1_IP:27017
MONGO_DATABASE=pam

REDIS_URL=redis://:glgpam2026@$INSTANCE1_IP:6379

KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:9092
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_DELIVERY_TOPIC=pam.notifications.delivery.v1
KAFKA_CONSUMER_GROUP=notif-sender
KAFKA_BATCH_SIZE=10000
KAFKA_BATCH_TIMEOUT_MS=1000

TEMPLATE_CACHE_TTL_SECONDS=300

DEBUG=false
VERSION=0.1.0
EOF
chown "$APP_USER:$APP_USER" "$SERVICE_DIR/.env"
ok "notifications-engine/.env written"

# ── 4. create systemd unit ────────────────────────────────────────────────────
section "4. Creating systemd unit"

cat > /etc/systemd/system/pam-notif.service <<EOF
[Unit]
Description=PAM Notifications Engine
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$SERVICE_DIR
Environment="PYTHONPATH=$SERVICE_DIR:$REPO"
ExecStart=$VENV/bin/python -m app.main
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pam-notif

[Install]
WantedBy=multi-user.target
EOF
ok "pam-notif.service written"

systemctl daemon-reload
systemctl enable pam-notif
ok "pam-notif enabled at boot"

# ── 5. start service ──────────────────────────────────────────────────────────
section "5. Starting service"

systemctl restart pam-notif
ok "pam-notif started"

# ── 6. readiness check ────────────────────────────────────────────────────────
section "6. Readiness check"

info "Waiting for notifications-engine on port $PORT (up to 30s)..."
READY=false
for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        ok "notifications-engine is READY (HTTP 200 /health)"
        READY=true
        break
    fi
    echo "    attempt $i/15 — waiting 2s (HTTP $HTTP_STATUS)..."
    sleep 2
done

if [ "$READY" = "false" ]; then
    warn "notifications-engine did not respond after 30s."
    warn "Check logs: journalctl -u pam-notif -n 60 --no-pager"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Notifications Engine deploy complete."
echo ""
echo "  Service:  pam-notif"
echo "  Health:   http://$INSTANCE2_IP:$PORT/health"
echo "  Logs:     journalctl -u pam-notif -f"
echo ""
echo "  Consuming: pam.campaigns.send.v1  (group: notif-sender)"
echo "  Producing: pam.notifications.delivery.v1"
echo ""
echo "── Smoke tests ────────────────────────────────────────"
echo ""
echo "  # Health check"
echo "  curl -s http://$INSTANCE2_IP:$PORT/health"
echo ""
echo "  # Tail live logs"
echo "  journalctl -u pam-notif -f"
echo ""
echo "  # Check delivery records in MongoDB"
echo "  mongosh 'mongodb://admin:glgpam2026@$INSTANCE1_IP:27017/pam?authSource=admin' \\"
echo "    --eval 'db.notification_deliveries.find().sort({attempted_at:-1}).limit(5).pretty()'"
echo ""
echo "======================================================"
echo ""
