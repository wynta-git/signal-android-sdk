#!/usr/bin/env bash
# =============================================================================
# PAM — Scheduler Service deploy (App Layer: 172.31.44.32)
#
# Run as root or with sudo on Instance 2:
#   sudo bash deploy-scheduler.sh
#
# Prerequisites:
#   - deploy-instance2.sh has already run (shared venv exists at $REPO/.venv)
#   - deploy-instance1.sh has run (Kafka topics pam.campaigns.schedule.v1 exist)
#   - Instance 1 (Kafka / MongoDB / Redis) is up
#
# What this does:
#   1. Verifies repo and shared venv
#   2. Installs scheduler-service deps (croniter)
#   3. Writes .env for scheduler-service
#   4. Creates and enables systemd unit pam-scheduler
#   5. Starts the service
#   6. Readiness check on /health (port 8080)
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"
INSTANCE2_IP="172.31.44.32"
REPO="/home/ubuntu/pam"
APP_USER="ubuntu"
SERVICE_DIR="$REPO/services/scheduler-service"
VENV="$REPO/.venv"
PORT=8080

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-scheduler.sh"

as_user() { sudo -u "$APP_USER" env HOME="/home/$APP_USER" PATH="/home/$APP_USER/.local/bin:$PATH" "$@"; }

echo ""
echo "======================================================"
echo "  PAM — Scheduler Service deploy"
echo "  Host: $INSTANCE2_IP  →  port $PORT"
echo "======================================================"

# ── 1. verify repo and venv ───────────────────────────────────────────────────
section "1. Checking repo and venv"

[ -d "$SERVICE_DIR" ]        || die "scheduler-service dir not found at $SERVICE_DIR"
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

# ── 2. install scheduler-service deps ────────────────────────────────────────
section "2. Installing scheduler-service dependencies"

UV="$(as_user bash -c 'command -v uv')"

info "Installing scheduler-service deps into shared venv..."
as_user "$UV" pip install --python "$VENV/bin/python" \
    "croniter>=2.0.0" \
    --quiet
ok "scheduler-service deps installed"

# ── 3. write .env ─────────────────────────────────────────────────────────────
section "3. Writing .env"

cat > "$SERVICE_DIR/.env" <<EOF
MONGO_URL=mongodb://admin:glgpam2026@$INSTANCE1_IP:27017
MONGO_DATABASE=pam

KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:9092
KAFKA_SCHEDULER_TOPIC=pam.campaigns.schedule.v1
KAFKA_DLQ_TOPIC=pam.campaigns.schedule.dlq.v1
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_CONSUMER_GROUP=scheduler-service

REDIS_URL=redis://:glgpam2026@$INSTANCE1_IP:6379

POLL_INTERVAL_SECONDS=1
MAX_LOCK_BATCH=10
STALE_LOCK_TIMEOUT_SECONDS=300
MAX_RETRY_COUNT=3

DEBUG=false
VERSION=0.1.0
EOF
chown "$APP_USER:$APP_USER" "$SERVICE_DIR/.env"
ok "scheduler-service/.env written"

# ── 4. create systemd unit ────────────────────────────────────────────────────
section "4. Creating systemd unit"

cat > /etc/systemd/system/pam-scheduler.service <<EOF
[Unit]
Description=PAM Scheduler Service
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
SyslogIdentifier=pam-scheduler

[Install]
WantedBy=multi-user.target
EOF
ok "pam-scheduler.service written"

systemctl daemon-reload
systemctl enable pam-scheduler
ok "pam-scheduler enabled at boot"

# ── 5. start service ──────────────────────────────────────────────────────────
section "5. Starting service"

systemctl restart pam-scheduler
ok "pam-scheduler started"

# ── 6. readiness check ────────────────────────────────────────────────────────
section "6. Readiness check"

info "Waiting for scheduler-service on port $PORT (up to 30s)..."
READY=false
for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        ok "scheduler-service is READY (HTTP 200 /health)"
        READY=true
        break
    fi
    echo "    attempt $i/15 — waiting 2s (HTTP $HTTP_STATUS)..."
    sleep 2
done

if [ "$READY" = "false" ]; then
    warn "scheduler-service did not respond after 30s."
    warn "Check logs: journalctl -u pam-scheduler -n 60 --no-pager"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Scheduler Service deploy complete."
echo ""
echo "  Service:  pam-scheduler"
echo "  Health:   http://$INSTANCE2_IP:$PORT/health"
echo "  Logs:     journalctl -u pam-scheduler -f"
echo ""
echo "  Scale horizontally by running this script on"
echo "  additional instances — MongoDB atomic locks prevent"
echo "  duplicate campaign execution."
echo "======================================================"
echo ""
