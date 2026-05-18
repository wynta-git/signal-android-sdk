#!/usr/bin/env bash
# =============================================================================
# PAM — Segmentation Engine deploy (App Layer: 172.31.44.32)
#
# Run as root or with sudo on Instance 2:
#   sudo bash deploy-segmentation.sh
#
# Prerequisites:
#   - deploy-instance2.sh has already run (shared venv exists at $REPO/.venv)
#   - Instance 1 (Kafka / MongoDB / Redis) is up
#   - ClickHouse is running on this instance
#
# What this does:
#   1. Verifies repo and shared venv
#   2. Installs segmentation-engine-specific deps (apscheduler)
#   3. Writes .env for segmentation-engine
#   4. Creates and enables systemd unit pam-segmentation
#   5. Starts the service
#   6. Readiness check on /health
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"
INSTANCE2_IP="172.31.44.32"
REPO="/home/ubuntu/pam"
APP_USER="ubuntu"
SERVICE_DIR="$REPO/services/segmentation-engine"
VENV="$REPO/.venv"
PORT=8003

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-segmentation.sh"

as_user() { sudo -u "$APP_USER" env HOME="/home/$APP_USER" PATH="/home/$APP_USER/.local/bin:$PATH" "$@"; }

echo ""
echo "======================================================"
echo "  PAM — Segmentation Engine deploy"
echo "  Host: $INSTANCE2_IP  →  port $PORT"
echo "======================================================"

# ── 1. verify repo and venv ───────────────────────────────────────────────────
section "1. Checking repo and venv"

[ -d "$SERVICE_DIR" ]        || die "segmentation-engine dir not found at $SERVICE_DIR"
[ -d "$REPO/shared" ]        || die "shared dir missing at $REPO/shared"
[ -f "$VENV/bin/python" ]    || die "Shared venv not found at $VENV — run deploy-instance2.sh first"
ok "Repo at $REPO"
ok "Venv at $VENV"

info "Setting repo ownership to $APP_USER..."
chown -R "$APP_USER:$APP_USER" "$REPO"
ok "Ownership set"

# ── 2. install segmentation-engine deps ──────────────────────────────────────
section "2. Installing segmentation-engine dependencies"

UV="$(as_user bash -c 'command -v uv')"

info "Installing apscheduler into shared venv..."
as_user "$UV" pip install --python "$VENV/bin/python" \
    "apscheduler>=3.10.0" \
    --quiet
ok "apscheduler installed"

# ── 3. write .env ─────────────────────────────────────────────────────────────
section "3. Writing .env"

cat > "$SERVICE_DIR/.env" <<EOF
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:9092
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_CONSUMER_GROUP=segmentation-trigger

MONGO_URL=mongodb://admin:glgpam2026@$INSTANCE1_IP:27017
MONGO_DATABASE=pam

CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=pam
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=glg2026

REDIS_URL=redis://:glgpam2026@$INSTANCE1_IP:6379
SEGMENT_CACHE_TTL_SECONDS=300

DEBUG=true
VERSION=0.1.0
EOF
chown "$APP_USER:$APP_USER" "$SERVICE_DIR/.env"
ok "segmentation-engine/.env written"

# ── 4. create systemd unit ────────────────────────────────────────────────────
section "4. Creating systemd unit"

cat > /etc/systemd/system/pam-segmentation.service <<EOF
[Unit]
Description=PAM Segmentation Engine
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
SyslogIdentifier=pam-segmentation

[Install]
WantedBy=multi-user.target
EOF
ok "pam-segmentation.service written"

systemctl daemon-reload
systemctl enable pam-segmentation
ok "pam-segmentation enabled at boot"

# ── 5. start service ──────────────────────────────────────────────────────────
section "5. Starting service"

systemctl restart pam-segmentation
ok "pam-segmentation started"

# ── 6. readiness check ────────────────────────────────────────────────────────
section "6. Readiness check"

info "Waiting for segmentation-engine on port $PORT (up to 30s)..."
READY=false
for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        ok "segmentation-engine is READY (HTTP 200 /health)"
        READY=true
        break
    fi
    echo "    attempt $i/15 — waiting 2s (HTTP $HTTP_STATUS)..."
    sleep 2
done

if [ "$READY" = "false" ]; then
    warn "segmentation-engine did not respond after 30s."
    warn "Check logs: journalctl -u pam-segmentation -n 60 --no-pager"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Segmentation Engine deploy complete."
echo ""
echo "  Service:  pam-segmentation"
echo "  Endpoint: http://$INSTANCE2_IP:$PORT"
echo "  Logs:     journalctl -u pam-segmentation -f"
echo ""
echo "── Smoke tests ────────────────────────────────────────"
echo ""
echo "  # Health"
echo "  curl -s http://$INSTANCE2_IP:$PORT/health"
echo ""
echo "  # Create a segment"
cat <<CURLEOF
  curl -s -X POST 'http://$INSTANCE2_IP:$PORT/v1/segments?project_id=proj_demo' \\
    -H 'Content-Type: application/json' \\
    -d '{
      "segment_id": "seg_buyers_30d",
      "name": "Buyers last 30 days",
      "rule": {
        "version": 1,
        "match": "all",
        "filters": [{
          "type": "event",
          "event_name": "purchase_completed",
          "frequency": {"op": "gte", "count": 1},
          "time_window": {"last_days": 30}
        }]
      },
      "refresh_strategy": "on_event"
    }' | python3 -m json.tool
CURLEOF
echo ""
echo "  # List segments for a project"
echo "  curl -s 'http://$INSTANCE2_IP:$PORT/v1/segments?project_id=proj_demo' | python3 -m json.tool"
echo ""
echo "======================================================"
echo ""
