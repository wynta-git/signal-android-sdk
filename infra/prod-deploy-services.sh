#!/usr/bin/env bash
# =============================================================================
# PAM — Services deploy (App Layer)
#
# Deploys ALL PAM Python services on a single server:
#   1. Installs uv (Python package manager)
#   2. Generates a JWT RS256 key pair (if not already present)
#   3. Creates a shared virtualenv and installs all Python deps
#   4. Writes .env files for every service
#   5. Runs ClickHouse migration (creates pam DB + events table)
#   6. Seeds MongoDB (project + API token + service accounts)
#   7. Registers all services as systemd units
#   8. Starts everything and runs readiness checks
#
# Run as root or with sudo on the app server:
#   sudo bash deploy-services.sh
#
# Prerequisites:
#   - Ubuntu 22.04, Python 3.12 installed
#   - Repo pulled to /home/ubuntu/pam (from Bitbucket/GitHub)
#   - Data layer (MongoDB, Redis, Kafka, ClickHouse) is up
#     Run setup-infra.sh on the data server first.
#   - ClickHouse is accessible at localhost:8123 (or set CH_HOST)
#
# Services deployed:
#   pam-api           port 8001  — public ingestion API
#   pam-auth          port 8002  — JWT auth service
#   pam-segmentation  port 8003  — segment engine
#   pam-campaign      port 8004  — campaign engine
#   pam-notif         port 8005  — notifications delivery (Kafka consumer)
#   pam-scheduler     port 8006  — scheduled campaign runner (Kafka consumer)
#   pam-processor     (no port)  — event Kafka → ClickHouse writer
#
# Override any default via environment variable before running:
#   INSTANCE1_IP=10.0.0.1 MONGO_PASS=secret sudo bash deploy-services.sh
# =============================================================================

set -euo pipefail

# ── config — override via env vars ───────────────────────────────────────────
INSTANCE1_IP="${INSTANCE1_IP:-172.31.40.172}"         # data layer IP
INSTANCE2_IP="${INSTANCE2_IP:-$(hostname -I | awk '{print $1}')}"  # this host
CH_HOST="${CH_HOST:-$INSTANCE1_IP}"                    # ClickHouse host
REPO="${REPO:-/home/ubuntu/pam}"
APP_USER="${APP_USER:-ubuntu}"
MONGO_PASS="${MONGO_PASS:-glgpam2026}"
REDIS_PASS="${REDIS_PASS:-glgpam2026}"
CH_PASS="${CH_PASS:-glg2026}"
MYSQL_HOST="${MYSQL_HOST:-$INSTANCE1_IP}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-wynta}"
MYSQL_PASS="${MYSQL_PASS:-glgapp2026}"
MYSQL_DB="${MYSQL_DB:-wynta_common}"
PRIVKEY_FILE="${PRIVKEY_FILE:-/home/ubuntu/pam-jwt-private.pem}"
PUBKEY_FILE="${PUBKEY_FILE:-/home/ubuntu/pam-jwt-public.pem}"
PROJECT_ID="${PROJECT_ID:-proj_demo}"
PROJECT_NAME="${PROJECT_NAME:-Demo App}"

# ── data layer ports (must match what was used in prod-setup-infra.sh) ────────
MONGO_PORT="${MONGO_PORT:-27017}"
REDIS_PORT="${REDIS_PORT:-6379}"
KAFKA_PORT="${KAFKA_PORT:-9092}"
KAFKA_SASL_USER="${KAFKA_SASL_USER:-}"   # leave empty for no-auth (PLAINTEXT)
KAFKA_SASL_PASS="${KAFKA_SASL_PASS:-}"
CH_HTTP_PORT="${CH_HTTP_PORT:-8123}"
CH_NATIVE_PORT="${CH_NATIVE_PORT:-9000}"

VENV="$REPO/.venv"

# URL-encode passwords for use in MongoDB/Redis connection strings
url_encode() { python3 -c "import urllib.parse, sys; print(urllib.parse.quote_plus(sys.argv[1]))" "$1"; }
MONGO_PASS_ENC=$(url_encode "$MONGO_PASS")
REDIS_PASS_ENC=$(url_encode "$REDIS_PASS")
MYSQL_PASS_ENC=$(url_encode "$MYSQL_PASS")

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-services.sh"

# Run a command as the app user so files are not created as root
as_user() {
    sudo -u "$APP_USER" env \
        HOME="/home/$APP_USER" \
        PATH="/home/$APP_USER/.local/bin:$PATH" \
        "$@"
}

echo ""
echo "======================================================"
echo "  PAM — Services Deploy (App Layer)"
echo "  Repo:      $REPO"
echo "  Data host: $INSTANCE1_IP"
echo "  App host:  $INSTANCE2_IP"
echo "======================================================"

# ── 1. repo and python check ──────────────────────────────────────────────────
section "1. Checking prerequisites"

for svc in api-service auth-service event-processor segmentation-engine \
           campaign-engine notifications-engine scheduler-service; do
    [ -d "$REPO/services/$svc" ] || die "Missing service directory: $REPO/services/$svc"
done
[ -d "$REPO/shared" ] || die "Shared package not found at $REPO/shared"
ok "Repo structure verified at $REPO"

PYTHON=$(command -v python3.12 2>/dev/null || command -v python3 2>/dev/null || true)
[ -z "$PYTHON" ] && die "Python 3.12 not found. Install it first: apt-get install python3.12"
ok "$("$PYTHON" --version) at $PYTHON"

info "Pulling latest code from git..."
as_user git -C "$REPO" pull --ff-only
ok "Repo is up to date"

info "Setting repo ownership to $APP_USER..."
chown -R "$APP_USER:$APP_USER" "$REPO"
ok "Ownership set"

# ── 2. install uv ─────────────────────────────────────────────────────────────
section "2. Installing uv"

if as_user bash -c 'command -v uv' &>/dev/null; then
    ok "uv already installed: $(as_user uv --version)"
else
    info "Downloading and installing uv..."
    as_user bash -c 'curl -LsSf https://astral.sh/uv/install.sh | sh'
    ok "uv installed: $(as_user uv --version)"
fi

UV="$(as_user bash -c 'command -v uv')"

# ── 3. JWT RS256 key pair ─────────────────────────────────────────────────────
section "3. JWT key pair"

if [ ! -f "$PRIVKEY_FILE" ]; then
    info "No private key found — generating a new RS256 key pair..."
    openssl genrsa -out "$PRIVKEY_FILE" 2048 2>/dev/null
    openssl rsa -in "$PRIVKEY_FILE" -pubout -out "$PUBKEY_FILE" 2>/dev/null
    chmod 600 "$PRIVKEY_FILE"
    chown "$APP_USER:$APP_USER" "$PRIVKEY_FILE" "$PUBKEY_FILE"
    ok "Generated: $PRIVKEY_FILE"
    ok "Generated: $PUBKEY_FILE"
else
    ok "Private key found at $PRIVKEY_FILE"
    if [ ! -f "$PUBKEY_FILE" ]; then
        openssl rsa -in "$PRIVKEY_FILE" -pubout -out "$PUBKEY_FILE" 2>/dev/null
        chown "$APP_USER:$APP_USER" "$PUBKEY_FILE"
        ok "Derived public key at $PUBKEY_FILE"
    fi
fi

# Escape newlines so the key fits on one line in .env files
PRIVKEY_ESCAPED=$(sed ':a;N;$!ba;s/\n/\\n/g' "$PRIVKEY_FILE")
PUBKEY_ESCAPED=$(sed ':a;N;$!ba;s/\n/\\n/g' "$PUBKEY_FILE")

# ── 4. shared venv + all dependencies ────────────────────────────────────────
section "4. Shared virtualenv and dependencies"

info "Creating virtualenv at $VENV..."
as_user "$UV" venv "$VENV" --python python3.12 --quiet
ok "Virtualenv ready"

info "Installing all service dependencies (this may take a minute)..."
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
    "PyJWT[crypto]>=2.8.0" \
    "bcrypt>=4.1.0" \
    "apscheduler>=3.10.0" \
    "croniter>=2.0.0" \
    "tzdata" \
    "httpx>=0.27.0" \
    "jinja2>=3.1.0" \
    "google-auth>=2.29.0" \
    "requests>=2.31.0" \
    "aioboto3>=12.0.0" \
    --quiet
ok "All Python packages installed"

info "Installing pam-shared (editable)..."
as_user "$UV" pip install --python "$VENV/bin/python" -e "$REPO/shared" --quiet
ok "pam-shared installed"

# ── 5. .env files ─────────────────────────────────────────────────────────────
section "5. Writing .env files"

# api-service — port 8001
cat > "$REPO/services/api-service/.env" <<EOF
MONGO_URL=mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin
MONGO_DB=pam
MONGO_MIN_POOL_SIZE=5
MONGO_MAX_POOL_SIZE=50
REDIS_URL=redis://:$REDIS_PASS_ENC@$INSTANCE1_IP:$REDIS_PORT
REDIS_MAX_CONNECTIONS=20
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:$KAFKA_PORT
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_SASL_USERNAME=$KAFKA_SASL_USER
KAFKA_SASL_PASSWORD=$KAFKA_SASL_PASS
COMMON_DB_HOST=$MYSQL_HOST
COMMON_DB_PORT=$MYSQL_PORT
COMMON_DB_USER=$MYSQL_USER
COMMON_DB_PASSWORD=$MYSQL_PASS_ENC
COMMON_DB_NAME=$MYSQL_DB
CORS_ORIGINS=["*"]
DEBUG=false
VERSION=0.1.0
EOF
chmod 644 "$REPO/services/api-service/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/api-service/.env"
ok "api-service/.env"

# auth-service — port 8002 (mode 600: contains private key)
cat > "$REPO/services/auth-service/.env" <<EOF
MONGO_URL=mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin
MONGO_DB=pam
JWT_PRIVATE_KEY="$PRIVKEY_ESCAPED"
JWT_TOKEN_TTL=3600
EXTERNAL_JWT_SECRET_KEY=
DEBUG=false
VERSION=0.1.0
EOF
chmod 600 "$REPO/services/auth-service/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/auth-service/.env"
ok "auth-service/.env  (mode 600)"

# event-processor — Kafka → ClickHouse (no HTTP port)
cat > "$REPO/services/event-processor/.env" <<EOF
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:$KAFKA_PORT
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_DLQ_TOPIC=pam.events.invalid.v1
KAFKA_CONSUMER_GROUP=event-processor
KAFKA_SASL_USERNAME=$KAFKA_SASL_USER
KAFKA_SASL_PASSWORD=$KAFKA_SASL_PASS
CLICKHOUSE_HOST=$CH_HOST
CLICKHOUSE_PORT=$CH_HTTP_PORT
CLICKHOUSE_DATABASE=pam
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=$CH_PASS
REDIS_URL=redis://:$REDIS_PASS_ENC@$INSTANCE1_IP:$REDIS_PORT
BATCH_SIZE=500
BATCH_TIMEOUT_SECONDS=5.0
DEBUG=false
VERSION=0.1.0
EOF
chmod 644 "$REPO/services/event-processor/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/event-processor/.env"
ok "event-processor/.env"

# segmentation-engine — port 8003
cat > "$REPO/services/segmentation-engine/.env" <<EOF
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:$KAFKA_PORT
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_CONSUMER_GROUP=segmentation-trigger
KAFKA_SASL_USERNAME=$KAFKA_SASL_USER
KAFKA_SASL_PASSWORD=$KAFKA_SASL_PASS
MONGO_URL=mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin
MONGO_DATABASE=pam
CLICKHOUSE_HOST=$CH_HOST
CLICKHOUSE_PORT=$CH_HTTP_PORT
CLICKHOUSE_DATABASE=pam
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=$CH_PASS
REDIS_URL=redis://:$REDIS_PASS_ENC@$INSTANCE1_IP:$REDIS_PORT
SEGMENT_CACHE_TTL_SECONDS=300
SYSTEM_JWT_PUBLIC_KEY="$PUBKEY_ESCAPED"
DEBUG=false
VERSION=0.1.0
EOF
chmod 644 "$REPO/services/segmentation-engine/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/segmentation-engine/.env"
ok "segmentation-engine/.env"

# campaign-engine — port 8004
cat > "$REPO/services/campaign-engine/.env" <<EOF
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:$KAFKA_PORT
KAFKA_EVENTS_TOPIC=pam.events.raw.v1
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_CONSUMER_GROUP=campaign-trigger
KAFKA_SASL_USERNAME=$KAFKA_SASL_USER
KAFKA_SASL_PASSWORD=$KAFKA_SASL_PASS
MONGO_URL=mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin
MONGO_DATABASE=pam
REDIS_URL=redis://:$REDIS_PASS_ENC@$INSTANCE1_IP:$REDIS_PORT
SEGMENT_CACHE_TTL_SECONDS=300
SYSTEM_JWT_PUBLIC_KEY="$PUBKEY_ESCAPED"
DEBUG=false
VERSION=0.1.0
EOF
chmod 644 "$REPO/services/campaign-engine/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/campaign-engine/.env"
ok "campaign-engine/.env"

# notifications-engine — port 8005 (Kafka consumer)
cat > "$REPO/services/notifications-engine/.env" <<EOF
MONGO_URL=mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin
MONGO_DATABASE=pam
REDIS_URL=redis://:$REDIS_PASS_ENC@$INSTANCE1_IP:$REDIS_PORT
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:$KAFKA_PORT
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_DELIVERY_TOPIC=pam.notifications.delivery.v1
KAFKA_CONSUMER_GROUP=notif-sender
KAFKA_BATCH_SIZE=10000
KAFKA_BATCH_TIMEOUT_MS=1000
KAFKA_SASL_USERNAME=$KAFKA_SASL_USER
KAFKA_SASL_PASSWORD=$KAFKA_SASL_PASS
TEMPLATE_CACHE_TTL_SECONDS=300
DEBUG=false
VERSION=0.1.0
EOF
chmod 644 "$REPO/services/notifications-engine/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/notifications-engine/.env"
ok "notifications-engine/.env"

# scheduler-service — port 8006 (Kafka consumer)
cat > "$REPO/services/scheduler-service/.env" <<EOF
MONGO_URL=mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin
MONGO_DATABASE=pam
KAFKA_BOOTSTRAP_SERVERS=$INSTANCE1_IP:$KAFKA_PORT
KAFKA_SCHEDULER_TOPIC=pam.campaigns.schedule.v1
KAFKA_DLQ_TOPIC=pam.campaigns.schedule.dlq.v1
KAFKA_SEND_TOPIC=pam.campaigns.send.v1
KAFKA_CONSUMER_GROUP=scheduler-service
KAFKA_SASL_USERNAME=$KAFKA_SASL_USER
KAFKA_SASL_PASSWORD=$KAFKA_SASL_PASS
REDIS_URL=redis://:$REDIS_PASS@$INSTANCE1_IP:6379
POLL_INTERVAL_SECONDS=1
MAX_LOCK_BATCH=10
STALE_LOCK_TIMEOUT_SECONDS=300
MAX_RETRY_COUNT=3
DEBUG=false
VERSION=0.1.0
EOF
chmod 644 "$REPO/services/scheduler-service/.env"
chown "$APP_USER:$APP_USER" "$REPO/services/scheduler-service/.env"
ok "scheduler-service/.env"

# ── 6. ClickHouse — create database ──────────────────────────────────────────
section "6. ClickHouse — create pam database"

info "Creating pam database (events tables created per-brand later)..."
curl -s -f -X POST "http://$INSTANCE1_IP:$CH_HTTP_PORT/" \
    -u "default:$CH_PASS" \
    --data "CREATE DATABASE IF NOT EXISTS pam"
ok "ClickHouse database 'pam' ready"

# ── 7. seed MongoDB ───────────────────────────────────────────────────────────
section "7. MongoDB seed"

info "Running seed.py (upserts project + API token — safe to re-run)..."
SEED_OUTPUT=$(as_user bash -c "
    cd '$REPO'
    '$VENV/bin/python' infra/seed.py \
        --mongo "mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin" \
        --db pam \
        --project-id '$PROJECT_ID' \
        --project-name '$PROJECT_NAME'
" 2>&1) || true
echo "$SEED_OUTPUT"

API_TOKEN=$(echo "$SEED_OUTPUT" | grep -oP 'pam_live_\S+' | head -1 || true)
if [ -n "$API_TOKEN" ]; then
    echo "$API_TOKEN" > "$REPO/.api_token"
    chown "$APP_USER:$APP_USER" "$REPO/.api_token"
    ok "API token saved to $REPO/.api_token"
else
    warn "Could not parse token from seed output — it may already exist."
    warn "Retrieve it from MongoDB:"
    warn "  mongosh 'mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/pam?authSource=admin' \\"
    warn "    --eval 'db.tokens.find({project_id:\"$PROJECT_ID\"}).pretty()'"
fi

# ── 8. seed service accounts ──────────────────────────────────────────────────
section "8. Service account seed"

SEED_ACCOUNTS="$REPO/scripts/seed_service_accounts.py"
if [ -f "$SEED_ACCOUNTS" ]; then
    info "Seeding auth-service accounts (campaign-engine, segmentation-engine, etc.)..."
    as_user env \
        MONGO_URL="mongodb://admin:$MONGO_PASS_ENC@$INSTANCE1_IP:$MONGO_PORT/?authSource=admin" \
        MONGO_DB="pam" \
        "$VENV/bin/python" "$SEED_ACCOUNTS"
    ok "Service accounts seeded"
else
    warn "Seed script not found at $SEED_ACCOUNTS — skipping service account setup"
fi

# ── 9. systemd units ──────────────────────────────────────────────────────────
section "9. Creating systemd units"

write_unit() {
    local name="$1" desc="$2" workdir="$3" exec_start="$4" pythonpath="$5"
    cat > "/etc/systemd/system/${name}.service" <<EOF
[Unit]
Description=$desc
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$workdir
Environment="PYTHONPATH=$pythonpath"
ExecStart=$exec_start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$name

[Install]
WantedBy=multi-user.target
EOF
    ok "${name}.service"
}

write_unit "pam-api" \
    "PAM API Service" \
    "$REPO/services/api-service" \
    "$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001" \
    "$REPO/services/api-service:$REPO"

write_unit "pam-auth" \
    "PAM Auth Service" \
    "$REPO/services/auth-service" \
    "$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8002" \
    "$REPO/services/auth-service:$REPO"

write_unit "pam-segmentation" \
    "PAM Segmentation Engine" \
    "$REPO/services/segmentation-engine" \
    "$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8003" \
    "$REPO/services/segmentation-engine:$REPO"

write_unit "pam-campaign" \
    "PAM Campaign Engine" \
    "$REPO/services/campaign-engine" \
    "$VENV/bin/uvicorn app.main:app --host 0.0.0.0 --port 8004" \
    "$REPO/services/campaign-engine:$REPO"

write_unit "pam-notif" \
    "PAM Notifications Engine" \
    "$REPO/services/notifications-engine" \
    "$VENV/bin/python -m app.main" \
    "$REPO/services/notifications-engine:$REPO"

write_unit "pam-scheduler" \
    "PAM Scheduler Service" \
    "$REPO/services/scheduler-service" \
    "$VENV/bin/python -m app.main" \
    "$REPO/services/scheduler-service:$REPO"

write_unit "pam-processor" \
    "PAM Event Processor" \
    "$REPO/services/event-processor" \
    "$VENV/bin/python -m app.main" \
    "$REPO/services/event-processor:$REPO"

systemctl daemon-reload
systemctl enable pam-api pam-auth pam-segmentation pam-campaign pam-notif pam-scheduler pam-processor
ok "All units enabled at boot"

# ── 10. start services ────────────────────────────────────────────────────────
section "10. Starting services"

for unit in pam-api pam-auth pam-segmentation pam-campaign pam-notif pam-scheduler pam-processor; do
    systemctl restart "$unit"
    ok "$unit started"
done

# ── 11. readiness checks ──────────────────────────────────────────────────────
section "11. Readiness checks"

check_http() {
    local unit="$1" port="$2" path="$3"
    local READY=false
    info "Checking $unit on :$port$path (up to 30s)..."
    for i in $(seq 1 15); do
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port$path" 2>/dev/null || echo "000")
        if [ "$STATUS" = "200" ] || [ "$STATUS" = "503" ]; then
            ok "$unit → HTTP $STATUS"
            READY=true
            break
        fi
        sleep 2
    done
    [ "$READY" = "false" ] && warn "$unit did not respond — check: journalctl -u $unit -n 40 --no-pager"
}

check_http "pam-api"          8001 "/v1/ready"
check_http "pam-auth"         8002 "/v1/health"
check_http "pam-segmentation" 8003 "/health"
check_http "pam-campaign"     8004 "/health"
check_http "pam-notif"        8005 "/health"
check_http "pam-scheduler"    8006 "/health"

# pam-processor has no HTTP endpoint
if systemctl is-active --quiet pam-processor; then
    ok "pam-processor is running"
else
    warn "pam-processor is not active — check: journalctl -u pam-processor -n 40 --no-pager"
fi

# ── done ──────────────────────────────────────────────────────────────────────
TOKEN_DISPLAY="${API_TOKEN:-$(cat "$REPO/.api_token" 2>/dev/null || echo '<retrieve from MongoDB>')}"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo ""
echo "======================================================"
echo "  Services deploy complete."
echo ""
echo "  Service           Port    Logs"
echo "  ─────────────────────────────────────────────────────────────────"
echo "  pam-api           8001    journalctl -u pam-api -f"
echo "  pam-auth          8002    journalctl -u pam-auth -f"
echo "  pam-segmentation  8003    journalctl -u pam-segmentation -f"
echo "  pam-campaign      8004    journalctl -u pam-campaign -f"
echo "  pam-notif         8005    journalctl -u pam-notif -f"
echo "  pam-scheduler     8006    journalctl -u pam-scheduler -f"
echo "  pam-processor     —       journalctl -u pam-processor -f"
echo ""
echo "  API token: $TOKEN_DISPLAY"
echo ""
echo "── Smoke tests ─────────────────────────────────────────"
echo ""
echo "  # 1. Readiness"
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
        "properties": {"url": "/home"}
      }]
    }' | python3 -m json.tool
CURLEOF
echo ""
echo "  # 3. Verify event reached ClickHouse (wait ~5s for batch flush)"
echo "  curl -s 'http://$CH_HOST:8123/?query=SELECT+event_name,user_id+FROM+pam.events_${PROJECT_ID}+LIMIT+5+FORMAT+JSONEachRow'"
echo ""
echo "  # 4. Auth service token"
cat <<CURLEOF
  curl -s -X POST http://$INSTANCE2_IP:8002/v1/system/token \\
    -H 'Content-Type: application/json' \\
    -d '{"username": "campaign-engine", "password": "<password from seed>"}' \\
    | python3 -m json.tool
CURLEOF
echo ""
echo "======================================================"
echo ""
