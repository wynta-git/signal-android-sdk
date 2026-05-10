#!/usr/bin/env bash
# =============================================================================
# PAM — Instance 2 setup (App Layer: 172.31.44.32)
#
# Run as root or with sudo:
#   sudo bash deploy-instance2.sh
#
# Prerequisites:
#   - Repo pulled to /home/ubuntu/PAM from Bitbucket
#   - Python 3.12 installed
#   - Instance 1 setup done (deploy-instance1.sh ran successfully)
#   - ClickHouse running on this instance (ports 9000 + 8123)
#
# What this does:
#   1. Installs uv (Python package manager)
#   2. Writes .env files for api-service and event-processor
#   3. Creates virtualenvs and installs all Python dependencies
#   4. Runs ClickHouse migration (creates pam DB + events table)
#   5. Seeds MongoDB with a demo project and live API token
#   6. Creates systemd units for both services
#   7. Starts the services
#   8. Prints a ready-to-run curl test command
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"
INSTANCE2_IP="172.31.44.32"
REPO="/home/ubuntu/pam"
APP_USER="ubuntu"
PROJECT_ID="proj_demo"
PROJECT_NAME="Demo App"

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-instance2.sh"

# Run a command as the app user (avoids root-owned files in the repo)
as_user() { sudo -u "$APP_USER" env HOME="/home/$APP_USER" PATH="/home/$APP_USER/.local/bin:$PATH" "$@"; }

echo ""
echo "======================================================"
echo "  PAM — Instance 2 setup (App Layer)"
echo "  Host: $INSTANCE2_IP"
echo "======================================================"

# ── 1. verify repo ────────────────────────────────────────────────────────────
section "1. Checking repo"

[ -d "$REPO/services/api-service" ]      || die "Repo not found or incomplete at $REPO"
[ -d "$REPO/services/event-processor" ]  || die "event-processor dir missing in $REPO"
[ -d "$REPO/shared" ]                    || die "shared dir missing in $REPO"
ok "Repo found at $REPO"

info "Setting repo ownership to $APP_USER..."
chown -R "$APP_USER:$APP_USER" "$REPO"
ok "Ownership set"

# ── 2. check python ───────────────────────────────────────────────────────────
section "2. Checking Python"

PYTHON=$(command -v python3.12 2>/dev/null || command -v python3 2>/dev/null || true)
[ -z "$PYTHON" ] && die "Python 3 not found. Install python3.12 first."
PY_VER=$("$PYTHON" --version)
ok "$PY_VER at $PYTHON"

# ── 3. install uv ─────────────────────────────────────────────────────────────
section "3. Installing uv"

if as_user bash -c 'command -v uv' &>/dev/null; then
    ok "uv already installed: $(as_user uv --version)"
else
    info "Downloading and installing uv..."
    as_user bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
    ok "uv installed: $(as_user uv --version)"
fi

UV="$(as_user bash -c 'command -v uv')"

# ── 4. write .env files ───────────────────────────────────────────────────────
section "4. Writing .env files"

cat > "$REPO/services/api-service/.env" <<EOF
MONGO_URL=mongodb://$INSTANCE1_IP:27017
MONGO_DB=pam
MONGO_MIN_POOL_SIZE=5
MONGO_MAX_POOL_SIZE=50
REDIS_URL=redis://$INSTANCE1_IP:6379
REDIS_MAX_CONNECTIONS=20
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:9092
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
CORS_ORIGINS=["*"]
DEBUG=true
VERSION=0.1.0
EOF
chown "$APP_USER:$APP_USER" "$REPO/services/api-service/.env"
ok "api-service/.env written"

# ClickHouse runs on this same instance → use localhost
cat > "$REPO/services/event-processor/.env" <<EOF
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:9092
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_DLQ_TOPIC=pam.events.invalid.v1
KAFKA_CONSUMER_GROUP=event-processor
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
CLICKHOUSE_DATABASE=pam
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=
REDIS_URL=redis://$INSTANCE1_IP:6379
BATCH_SIZE=500
BATCH_TIMEOUT_SECONDS=5.0
DEBUG=true
VERSION=0.1.0
EOF
chown "$APP_USER:$APP_USER" "$REPO/services/event-processor/.env"
ok "event-processor/.env written"

# ── 5. install dependencies ───────────────────────────────────────────────────
section "5. Installing Python dependencies"

# Single venv for the whole repo — no per-service builds needed
VENV="$REPO/.venv"
info "Creating venv at $VENV..."
as_user "$UV" venv "$VENV" --python python3.12 --quiet
ok "Venv created"

info "Installing all service dependencies..."
as_user "$UV" pip install --python "$VENV/bin/python" \
    "fastapi>=0.115.0" \
    "uvicorn[standard]>=0.30.0" \
    "motor>=3.5.0" \
    "redis[asyncio]>=5.0.0" \
    "pydantic>=2.7.0" \
    "pydantic-settings>=2.3.0" \
    "structlog>=24.2.0" \
    "aiokafka>=0.10.0" \
    "clickhouse-connect>=0.7.0" \
    --quiet
ok "All dependencies installed"

# ── 6. run clickhouse migration ───────────────────────────────────────────────
section "6. Running ClickHouse migration"

info "Connecting to ClickHouse at localhost:8123 and running migrations..."
as_user bash -c "
    cd '$REPO/services/event-processor'
    PYTHONPATH='$REPO/services/event-processor:$REPO' '$VENV/bin/python' -m migrations.run
"
ok "Migration complete — pam database and pam.events table created"

# ── 7. seed mongodb ───────────────────────────────────────────────────────────
section "7. Seeding MongoDB"

info "Running seed.py against MongoDB at $INSTANCE1_IP:27017..."
SEED_OUTPUT=$(as_user bash -c "
    cd '$REPO'
    '$VENV/bin/python' infra/seed.py \
        --mongo 'mongodb://$INSTANCE1_IP:27017' \
        --db pam \
        --project-id '$PROJECT_ID' \
        --project-name '$PROJECT_NAME'
" 2>&1) || true

echo "$SEED_OUTPUT"

# Extract and persist the token
API_TOKEN=$(echo "$SEED_OUTPUT" | grep -oP 'pam_live_\S+' | head -1 || true)

if [ -n "$API_TOKEN" ]; then
    echo "$API_TOKEN" > "$REPO/.api_token"
    chown "$APP_USER:$APP_USER" "$REPO/.api_token"
    ok "Token saved to $REPO/.api_token"
else
    warn "Could not parse token from seed output."
    warn "The project may already exist — re-running seed is safe (it upserts)."
    warn "Retrieve existing token from MongoDB:"
    warn "  mongosh mongodb://$INSTANCE1_IP:27017/pam --eval 'db.tokens.find({project_id:\"$PROJECT_ID\"})'"
fi

# ── 8. create systemd service units ──────────────────────────────────────────
section "8. Creating systemd service units"

# api-service
cat > /etc/systemd/system/pam-api.service <<EOF
[Unit]
Description=PAM API Service
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$REPO/services/api-service
Environment="PYTHONPATH=$REPO/services/api-service:$REPO"
ExecStart=$REPO/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pam-api

[Install]
WantedBy=multi-user.target
EOF
ok "pam-api.service written"

# event-processor
cat > /etc/systemd/system/pam-processor.service <<EOF
[Unit]
Description=PAM Event Processor
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$REPO/services/event-processor
Environment="PYTHONPATH=$REPO/services/event-processor:$REPO"
ExecStart=$REPO/.venv/bin/python -m app.main
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pam-processor

[Install]
WantedBy=multi-user.target
EOF
ok "pam-processor.service written"

systemctl daemon-reload
systemctl enable pam-api pam-processor
ok "Services enabled at boot"

# ── 9. start services ─────────────────────────────────────────────────────────
section "9. Starting services"

systemctl restart pam-api
ok "pam-api started"

systemctl restart pam-processor
ok "pam-processor started"

# ── 10. readiness check ───────────────────────────────────────────────────────
section "10. Readiness check"

info "Waiting for api-service (up to 30s)..."
READY=false
for i in $(seq 1 15); do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8001/v1/ready" 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "503" ]; then
        BODY=$(curl -s "http://localhost:8001/v1/ready" 2>/dev/null || echo "{}")
        STATUS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "?")
        CHECKS=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin).get('checks',{}); print(', '.join(f'{k}={v}' for k,v in d.items()))" 2>/dev/null || echo "?")
        if [ "$STATUS" = "ok" ]; then
            ok "api-service is READY — $CHECKS"
        else
            warn "api-service is DEGRADED — $CHECKS"
            warn "Check logs: journalctl -u pam-api -n 40 --no-pager"
        fi
        READY=true
        break
    fi
    echo "    attempt $i/15 — waiting 2s (HTTP $HTTP_STATUS)..."
    sleep 2
done

if [ "$READY" = "false" ]; then
    warn "api-service did not respond after 30s."
    warn "Check logs: journalctl -u pam-api -n 60 --no-pager"
fi

# ── done — print test commands ────────────────────────────────────────────────
TOKEN_DISPLAY="${API_TOKEN:-$(cat "$REPO/.api_token" 2>/dev/null || echo '<get token from $REPO/.api_token>')}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo ""
echo "======================================================"
echo "  Instance 2 setup complete."
echo ""
echo "  Services:"
echo "    pam-api       http://$INSTANCE2_IP:8001  (journalctl -u pam-api -f)"
echo "    pam-processor consuming pam.events.raw.v1 (journalctl -u pam-processor -f)"
echo ""
echo "  API token: $TOKEN_DISPLAY"
echo ""
echo "── Smoke test ─────────────────────────────────────────"
echo ""
echo "  # 1. Check readiness"
echo "  curl -s http://$INSTANCE2_IP:8001/v1/ready | python3 -m json.tool"
echo ""
echo "  # 2. Send a track event"
cat <<CURLEOF
  curl -s -X POST http://$INSTANCE2_IP:8001/v1/track \\
    -H 'Authorization: Bearer $TOKEN_DISPLAY' \\
    -H 'Content-Type: application/json' \\
    -d '{
      "events": [{
        "event_id": "11111111-1111-1111-1111-111111111111",
        "event_name": "page_view",
        "user_id": "user_001",
        "timestamp": "$TIMESTAMP",
        "sdk": {"name": "web", "version": "1.0.0"},
        "properties": {"url": "/home", "referrer": "google"}
      }]
    }' | python3 -m json.tool
CURLEOF
echo ""
echo "  # 3. Verify in ClickHouse (wait ~5s for batch flush)"
echo "  curl -s 'http://localhost:8123/?query=SELECT+event_name,user_id,timestamp+FROM+pam.events_proj_demo+LIMIT+5+FORMAT+JSONEachRow'"
echo ""
echo "======================================================"
echo ""
