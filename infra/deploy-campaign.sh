#!/usr/bin/env bash
# =============================================================================
# PAM — Campaign Engine deploy (App Layer: 172.31.44.32)
#
# Run as root or with sudo on Instance 2:
#   sudo bash deploy-campaign.sh
#
# Prerequisites:
#   - deploy-instance2.sh has already run (shared venv exists at $REPO/.venv)
#   - Instance 1 (Kafka / MongoDB / Redis) is up
#
# What this does:
#   1. Verifies repo and shared venv
#   2. Installs campaign-engine-specific deps (apscheduler)
#   3. Writes .env for campaign-engine
#   4. Creates and enables systemd unit pam-campaign
#   5. Starts the service
#   6. Readiness check on /health
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"
INSTANCE2_IP="172.31.44.32"
REPO="/home/ubuntu/pam"
APP_USER="ubuntu"
SERVICE_DIR="$REPO/services/campaign-engine"
VENV="$REPO/.venv"
PORT=8004

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-campaign.sh"

as_user() { sudo -u "$APP_USER" env HOME="/home/$APP_USER" PATH="/home/$APP_USER/.local/bin:$PATH" "$@"; }

echo ""
echo "======================================================"
echo "  PAM — Campaign Engine deploy"
echo "  Host: $INSTANCE2_IP  →  port $PORT"
echo "======================================================"

# ── 1. verify repo and venv ───────────────────────────────────────────────────
section "1. Checking repo and venv"

[ -d "$SERVICE_DIR" ]        || die "campaign-engine dir not found at $SERVICE_DIR"
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

# ── 2. install campaign-engine deps ──────────────────────────────────────────
section "2. Installing campaign-engine dependencies"

UV="$(as_user bash -c 'command -v uv')"

info "Installing campaign-engine deps into shared venv..."
as_user "$UV" pip install --python "$VENV/bin/python" \
    "apscheduler>=3.10.0" \
    "httpx>=0.27.0" \
    --quiet
ok "campaign-engine deps installed"

# ── 3. write .env ─────────────────────────────────────────────────────────────
section "3. Writing .env"

cat > "$SERVICE_DIR/.env" <<EOF
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:9092
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_CONSUMER_GROUP=campaign-trigger

MONGO_URL=mongodb://admin:glgpam2026@$INSTANCE1_IP:27017
MONGO_DATABASE=pam

REDIS_URL=redis://:glgpam2026@$INSTANCE1_IP:6379
SEGMENT_CACHE_TTL_SECONDS=300

ONEOFF_POLL_INTERVAL_SECONDS=60

DEBUG=true
VERSION=0.1.0
EOF
chown "$APP_USER:$APP_USER" "$SERVICE_DIR/.env"
ok "campaign-engine/.env written"

# ── 4. create systemd unit ────────────────────────────────────────────────────
section "4. Creating systemd unit"

cat > /etc/systemd/system/pam-campaign.service <<EOF
[Unit]
Description=PAM Campaign Engine
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
SyslogIdentifier=pam-campaign

[Install]
WantedBy=multi-user.target
EOF
ok "pam-campaign.service written"

systemctl daemon-reload
systemctl enable pam-campaign
ok "pam-campaign enabled at boot"

# ── 5. start service ──────────────────────────────────────────────────────────
section "5. Starting service"

systemctl restart pam-campaign
ok "pam-campaign started"

# ── 6. readiness check ────────────────────────────────────────────────────────
section "6. Readiness check"

info "Waiting for campaign-engine on port $PORT (up to 30s)..."
READY=false
for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/health" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        ok "campaign-engine is READY (HTTP 200 /health)"
        READY=true
        break
    fi
    echo "    attempt $i/15 — waiting 2s (HTTP $HTTP_STATUS)..."
    sleep 2
done

if [ "$READY" = "false" ]; then
    warn "campaign-engine did not respond after 30s."
    warn "Check logs: journalctl -u pam-campaign -n 60 --no-pager"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Campaign Engine deploy complete."
echo ""
echo "  Service:  pam-campaign"
echo "  Endpoint: http://$INSTANCE2_IP:$PORT"
echo "  Logs:     journalctl -u pam-campaign -f"
echo ""
echo "── Smoke tests ────────────────────────────────────────"
echo ""
echo "  # Health"
echo "  curl -s http://$INSTANCE2_IP:$PORT/health"
echo ""
echo "  # Create a notification template"
cat <<CURLEOF
  curl -s -X POST 'http://$INSTANCE2_IP:$PORT/v1/projects/proj_demo/templates' \\
    -H 'Content-Type: application/json' \\
    -d '{
      "name": "Cart Recovery Push",
      "channel": "push",
      "body": {
        "title": "You left something behind!",
        "message": "Your cart is waiting. Complete your purchase now."
      }
    }' | python3 -m json.tool
CURLEOF
echo ""
echo "  # Create an event-triggered campaign (replace tmpl_id with one from above)"
cat <<CURLEOF
  curl -s -X POST 'http://$INSTANCE2_IP:$PORT/v1/projects/proj_demo/campaigns' \\
    -H 'Content-Type: application/json' \\
    -d '{
      "name": "Cart Abandonment Recovery",
      "trigger": {"type": "event", "event_name": "cart_abandoned"},
      "audience": {"all": true},
      "channel": "push",
      "template_id": "<tmpl_id from above>",
      "rate_limit": {"per_user_per_day": 1},
      "delay": {"minutes": 30}
    }' | python3 -m json.tool
CURLEOF
echo ""
echo "  # Activate the campaign (replace camp_id)"
echo "  curl -s -X POST 'http://$INSTANCE2_IP:$PORT/v1/projects/proj_demo/campaigns/<camp_id>/activate' | python3 -m json.tool"
echo ""
echo "  # List campaigns"
echo "  curl -s 'http://$INSTANCE2_IP:$PORT/v1/projects/proj_demo/campaigns' | python3 -m json.tool"
echo ""
echo "======================================================"
echo ""
