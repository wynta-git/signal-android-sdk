#!/usr/bin/env bash
# =============================================================================
# PAM — Infrastructure setup (Data Layer)
#
# Installs and configures from scratch:
#   MongoDB 7.0, Redis, Apache Kafka 3.7 (KRaft, no ZooKeeper), ClickHouse
#
# Tested on: Ubuntu 22.04 LTS (x86_64)
# Run as root or with sudo:
#   sudo bash setup-infra.sh
#
# Credentials and ports can be overridden via environment variables:
#   MONGO_ADMIN_PASS=secret MONGO_PORT=27018 sudo bash setup-infra.sh
#
# After this script completes, the data layer is ready.
# Deploy the app layer on Instance 2 with:
#   sudo bash infra/deploy-services.sh
# =============================================================================

set -euo pipefail

# ── config — override via env vars before running ────────────────────────────
INSTANCE_IP="${INSTANCE_IP:-$(hostname -I | awk '{print $1}')}"
MONGO_ADMIN_PASS="${MONGO_ADMIN_PASS:-glgpam2026}"
REDIS_PASS="${REDIS_PASS:-glgpam2026}"
CH_DEFAULT_PASS="${CH_DEFAULT_PASS:-glg2026}"
KAFKA_VERSION="${KAFKA_VERSION:-3.7.1}"
KAFKA_INSTALL_DIR="${KAFKA_INSTALL_DIR:-/opt/kafka}"
APP_USER="${APP_USER:-ubuntu}"

# ── distro override (auto-detected; set manually if lsb_release returns an unsupported name) ──
# Supported MongoDB 7.0 values: focal, jammy, noble
MONGO_DISTRO="${MONGO_DISTRO:-}"

# ── ports — override via env vars before running ─────────────────────────────
MONGO_PORT="${MONGO_PORT:-27017}"
REDIS_PORT="${REDIS_PORT:-6379}"
KAFKA_PORT="${KAFKA_PORT:-9092}"
KAFKA_CONTROLLER_PORT="${KAFKA_CONTROLLER_PORT:-9093}"
KAFKA_INTERNAL_PORT="${KAFKA_INTERNAL_PORT:-19092}"   # localhost-only PLAINTEXT for admin tools
KAFKA_SASL_USER="${KAFKA_SASL_USER:-}"                # leave empty to skip SASL setup
KAFKA_SASL_PASS="${KAFKA_SASL_PASS:-}"
CH_HTTP_PORT="${CH_HTTP_PORT:-8123}"
CH_NATIVE_PORT="${CH_NATIVE_PORT:-9000}"

# ── helpers ───────────────────────────────────────────────────────────────────
ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash setup-infra.sh"

echo ""
echo "======================================================"
echo "  PAM — Infrastructure Setup"
echo "  Host IP:    $INSTANCE_IP"
echo "  MongoDB:    admin / $MONGO_ADMIN_PASS  (port $MONGO_PORT)"
echo "  Redis:      pass=$REDIS_PASS            (port $REDIS_PORT)"
echo "  Kafka:      ${KAFKA_SASL_USER:+SASL user=$KAFKA_SASL_USER}${KAFKA_SASL_USER:-no auth}  (port $KAFKA_PORT)"
echo "  ClickHouse: default / $CH_DEFAULT_PASS  (ports $CH_HTTP_PORT, $CH_NATIVE_PORT)"
echo ""
echo "  Press Ctrl+C within 5s to abort."
echo "======================================================"
sleep 5

# ── 0. system prerequisites ───────────────────────────────────────────────────
section "0. System update and prerequisites"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    curl gnupg wget ca-certificates lsb-release \
    apt-transport-https software-properties-common \
    openjdk-21-jre-headless
ok "System prerequisites installed (including Java 21)"

# ── 1. MongoDB 7.0 ────────────────────────────────────────────────────────────
section "1. MongoDB 7.0"

if systemctl is-active --quiet mongod 2>/dev/null; then
    ok "MongoDB already running — skipping install"
else
    info "Adding MongoDB 7.0 apt repository..."
    # Map the detected codename to the nearest MongoDB-supported Ubuntu release
    if [ -z "$MONGO_DISTRO" ]; then
        _DISTRO=$(lsb_release -cs)
        case "$_DISTRO" in
            focal|jammy|noble) MONGO_DISTRO="$_DISTRO" ;;
            *)                 MONGO_DISTRO="jammy"; warn "Unsupported distro '$_DISTRO' — using jammy repo for MongoDB (override with MONGO_DISTRO=)" ;;
        esac
    fi
    info "Using MongoDB repo for: $MONGO_DISTRO"
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
        | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/ubuntu ${MONGO_DISTRO}/mongodb-org/7.0 multiverse" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update -qq
    apt-get install -y -qq mongodb-org mongodb-mongosh
    ok "MongoDB 7.0 installed"

    info "Writing /etc/mongod.conf (auth disabled — temporary for user creation)..."
    cat > /etc/mongod.conf <<MONGOCFG
storage:
  dbPath: /var/lib/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: $MONGO_PORT
  bindIp: 0.0.0.0

processManagement:
  timeZoneInfo: /usr/share/zoneinfo
MONGOCFG

    systemctl start mongod
    info "Waiting 5s for MongoDB to initialise..."
    sleep 5

    info "Creating admin user..."
    mongosh --quiet --port "$MONGO_PORT" --eval "
        var db = db.getSiblingDB('admin');
        if (db.getUser('admin') === null) {
            db.createUser({
                user: 'admin',
                pwd: '$MONGO_ADMIN_PASS',
                roles: [{role: 'root', db: 'admin'}]
            });
            print('admin user created');
        } else {
            print('admin user already exists — skipping');
        }
    "
    ok "Admin user ready"

    info "Enabling authentication in /etc/mongod.conf..."
    cat >> /etc/mongod.conf <<'MONGOCFG'

security:
  authorization: enabled
MONGOCFG

    systemctl restart mongod
    systemctl enable mongod
    info "Waiting 5s for MongoDB with auth..."
    sleep 5

    if mongosh --quiet --port "$MONGO_PORT" \
            --username admin --password "$MONGO_ADMIN_PASS" \
            --authenticationDatabase admin \
            --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q '^1$'; then
        ok "MongoDB is up with authentication enabled (port $MONGO_PORT)"
    else
        warn "MongoDB auth ping failed — check: journalctl -u mongod -n 50"
    fi
fi

# ── 2. Redis ──────────────────────────────────────────────────────────────────
section "2. Redis"

if systemctl is-active --quiet redis-server 2>/dev/null; then
    ok "Redis already running — skipping install"
else
    apt-get install -y -qq redis-server
    ok "Redis installed"

    REDIS_CFG="/etc/redis/redis.conf"

    info "Configuring Redis (bind, port, password, protected-mode)..."
    # Bind to all interfaces
    sed -i 's/^bind 127\.0\.0\.1.*/bind 0.0.0.0/' "$REDIS_CFG"
    # Disable protected-mode (required when binding to 0.0.0.0 with password)
    sed -i 's/^protected-mode yes/protected-mode no/' "$REDIS_CFG"
    # Set port
    sed -i "s/^port .*/port $REDIS_PORT/" "$REDIS_CFG"
    # Set password — replace existing requirepass line or append
    if grep -q '^requirepass' "$REDIS_CFG"; then
        sed -i "s/^requirepass .*/requirepass $REDIS_PASS/" "$REDIS_CFG"
    elif grep -q '^# requirepass' "$REDIS_CFG"; then
        sed -i "s/^# requirepass .*/requirepass $REDIS_PASS/" "$REDIS_CFG"
    else
        echo "requirepass $REDIS_PASS" >> "$REDIS_CFG"
    fi
    ok "Redis config updated"

    systemctl restart redis-server
    systemctl enable redis-server
    sleep 2

    if redis-cli -p "$REDIS_PORT" -a "$REDIS_PASS" ping 2>/dev/null | grep -q "PONG"; then
        ok "Redis is up on port $REDIS_PORT"
    else
        warn "Redis PING failed — check: journalctl -u redis-server -n 30"
    fi
fi

# ── 3. Apache Kafka (KRaft — no ZooKeeper) ───────────────────────────────────
section "3. Apache Kafka $KAFKA_VERSION (KRaft)"

if [ -f "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" ]; then
    ok "Kafka already installed at $KAFKA_INSTALL_DIR — skipping download"
else
    KAFKA_TGZ="kafka_2.13-${KAFKA_VERSION}.tgz"
    KAFKA_URL="https://downloads.apache.org/kafka/${KAFKA_VERSION}/${KAFKA_TGZ}"

    info "Downloading Kafka $KAFKA_VERSION from Apache..."
    wget -q "$KAFKA_URL" -O "/tmp/$KAFKA_TGZ" || \
        wget -q "https://archive.apache.org/dist/kafka/${KAFKA_VERSION}/${KAFKA_TGZ}" -O "/tmp/$KAFKA_TGZ"
    tar -xzf "/tmp/$KAFKA_TGZ" -C /opt/
    mv "/opt/kafka_2.13-${KAFKA_VERSION}" "$KAFKA_INSTALL_DIR"
    rm -f "/tmp/$KAFKA_TGZ"
    ok "Kafka extracted to $KAFKA_INSTALL_DIR"
fi

KAFKA_CFG="$KAFKA_INSTALL_DIR/config/kraft/server.properties"

if systemctl is-active --quiet kafka 2>/dev/null; then
    ok "Kafka already running — skipping init"
else
    info "Configuring Kafka KRaft server.properties..."
    # Set the advertised listener to this instance's IP
    if grep -q '^advertised.listeners=' "$KAFKA_CFG"; then
        sed -i "s|^advertised.listeners=.*|advertised.listeners=PLAINTEXT://$INSTANCE_IP:$KAFKA_PORT|" "$KAFKA_CFG"
    else
        echo "advertised.listeners=PLAINTEXT://$INSTANCE_IP:$KAFKA_PORT" >> "$KAFKA_CFG"
    fi
    # Set listeners (PLAINTEXT for clients + CONTROLLER for KRaft consensus)
    if grep -q '^listeners=' "$KAFKA_CFG"; then
        sed -i "s|^listeners=.*|listeners=PLAINTEXT://0.0.0.0:$KAFKA_PORT,CONTROLLER://localhost:$KAFKA_CONTROLLER_PORT|" "$KAFKA_CFG"
    else
        echo "listeners=PLAINTEXT://0.0.0.0:$KAFKA_PORT,CONTROLLER://localhost:$KAFKA_CONTROLLER_PORT" >> "$KAFKA_CFG"
    fi
    # Update KRaft controller quorum voters port
    if grep -q '^controller.quorum.voters=' "$KAFKA_CFG"; then
        sed -i "s|^controller.quorum.voters=.*|controller.quorum.voters=1@localhost:$KAFKA_CONTROLLER_PORT|" "$KAFKA_CFG"
    else
        echo "controller.quorum.voters=1@localhost:$KAFKA_CONTROLLER_PORT" >> "$KAFKA_CFG"
    fi
    # Use a dedicated log directory
    if grep -q '^log.dirs=' "$KAFKA_CFG"; then
        sed -i "s|^log.dirs=.*|log.dirs=$KAFKA_INSTALL_DIR/kraft-logs|" "$KAFKA_CFG"
    else
        echo "log.dirs=$KAFKA_INSTALL_DIR/kraft-logs" >> "$KAFKA_CFG"
    fi
    ok "KRaft server.properties updated"

    info "Formatting Kafka storage (KRaft)..."
    mkdir -p "$KAFKA_INSTALL_DIR/kraft-logs"
    CLUSTER_UUID=$("$KAFKA_INSTALL_DIR/bin/kafka-storage.sh" random-uuid)
    "$KAFKA_INSTALL_DIR/bin/kafka-storage.sh" format \
        --cluster-id "$CLUSTER_UUID" \
        --config "$KAFKA_CFG" \
        --ignore-formatted
    ok "Kafka storage formatted (cluster-id: $CLUSTER_UUID)"

    chown -R "$APP_USER:$APP_USER" "$KAFKA_INSTALL_DIR" 2>/dev/null || true

    info "Creating Kafka systemd unit..."
    cat > /etc/systemd/system/kafka.service <<EOF
[Unit]
Description=Apache Kafka (KRaft)
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$APP_USER
ExecStart=$KAFKA_INSTALL_DIR/bin/kafka-server-start.sh $KAFKA_CFG
ExecStop=$KAFKA_INSTALL_DIR/bin/kafka-server-stop.sh
Restart=on-failure
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal
SyslogIdentifier=kafka

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable kafka
    systemctl start kafka
    ok "Kafka systemd unit created and started"

    info "Waiting 15s for Kafka to be ready..."
    sleep 15

    MAX_TRIES=10
    KAFKA_UP=false
    for i in $(seq 1 $MAX_TRIES); do
        if "$KAFKA_INSTALL_DIR/bin/kafka-broker-api-versions.sh" \
                --bootstrap-server "localhost:$KAFKA_PORT" &>/dev/null 2>&1; then
            ok "Kafka is accepting connections on localhost:$KAFKA_PORT"
            KAFKA_UP=true
            break
        fi
        echo "    attempt $i/$MAX_TRIES — waiting 3s..."
        sleep 3
    done
    [ "$KAFKA_UP" = "false" ] && warn "Kafka not responding — check: journalctl -u kafka -n 50"
fi

# Create Kafka topics (idempotent — skips existing)
section "3a. Creating Kafka topics"

# Use the internal PLAINTEXT port if SASL is already configured on the main port
KAFKA_CFG="$KAFKA_INSTALL_DIR/config/kraft/server.properties"
if grep -q 'sasl.enabled.mechanisms' "$KAFKA_CFG" 2>/dev/null; then
    KAFKA_ADMIN_PORT="$KAFKA_INTERNAL_PORT"
    info "SASL already enabled — using internal PLAINTEXT port $KAFKA_ADMIN_PORT for admin tools"
else
    KAFKA_ADMIN_PORT="$KAFKA_PORT"
fi

create_topic() {
    local topic="$1" partitions="$2"
    if "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" \
            --bootstrap-server "localhost:$KAFKA_ADMIN_PORT" --list 2>/dev/null | grep -qxF "$topic"; then
        ok "Already exists: $topic"
    else
        "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" \
            --bootstrap-server "localhost:$KAFKA_ADMIN_PORT" \
            --create \
            --topic "$topic" \
            --partitions "$partitions" \
            --replication-factor 1
        ok "Created: $topic  (partitions=$partitions)"
    fi
}

create_topic "pam.events.raw.v1"              3
create_topic "pam.events.invalid.v1"          1
create_topic "pam.campaigns.send.v1"          12
create_topic "pam.campaigns.schedule.v1"      4
create_topic "pam.campaigns.schedule.dlq.v1"  1
create_topic "pam.notifications.delivery.v1"  12

# ── 3b. Kafka SASL/SCRAM-SHA-256 (optional — only runs when KAFKA_SASL_USER is set) ──
if [ -n "$KAFKA_SASL_USER" ] && [ -n "$KAFKA_SASL_PASS" ]; then
    section "3b. Kafka SASL/SCRAM-SHA-256"

    KAFKA_CFG="$KAFKA_INSTALL_DIR/config/kraft/server.properties"

    # Step 1 — create SCRAM user NOW while Kafka is still accepting plain connections.
    # Use internal port if SASL already enabled (re-run), else use main port.
    if grep -q 'sasl.enabled.mechanisms' "$KAFKA_CFG" 2>/dev/null; then
        SCRAM_BS="localhost:$KAFKA_INTERNAL_PORT"
    else
        SCRAM_BS="localhost:$KAFKA_PORT"
    fi
    info "Creating SCRAM user '$KAFKA_SASL_USER' via $SCRAM_BS..."
    "$KAFKA_INSTALL_DIR/bin/kafka-configs.sh" \
        --bootstrap-server "$SCRAM_BS" \
        --alter \
        --add-config "SCRAM-SHA-256=[iterations=8192,password=$KAFKA_SASL_PASS]" \
        --entity-type users \
        --entity-name "$KAFKA_SASL_USER"
    ok "SCRAM user '$KAFKA_SASL_USER' created"

    # Step 2 — update server.properties to enable SASL_PLAINTEXT on main port
    #           and keep a localhost-only PLAINTEXT port for admin tools.
    info "Updating listeners — SASL_PLAINTEXT on $KAFKA_PORT, PLAINTEXT on 127.0.0.1:$KAFKA_INTERNAL_PORT..."
    sed -i "s|^listeners=.*|listeners=SASL_PLAINTEXT://0.0.0.0:$KAFKA_PORT,PLAINTEXT://127.0.0.1:$KAFKA_INTERNAL_PORT,CONTROLLER://localhost:$KAFKA_CONTROLLER_PORT|" "$KAFKA_CFG"
    sed -i "s|^advertised.listeners=.*|advertised.listeners=SASL_PLAINTEXT://$INSTANCE_IP:$KAFKA_PORT,PLAINTEXT://127.0.0.1:$KAFKA_INTERNAL_PORT|" "$KAFKA_CFG"
    grep -qxF 'inter.broker.listener.name=PLAINTEXT' "$KAFKA_CFG" || \
        echo 'inter.broker.listener.name=PLAINTEXT' >> "$KAFKA_CFG"
    grep -qxF 'sasl.enabled.mechanisms=SCRAM-SHA-256' "$KAFKA_CFG" || \
        echo 'sasl.enabled.mechanisms=SCRAM-SHA-256' >> "$KAFKA_CFG"
    if grep -q '^listener.security.protocol.map=' "$KAFKA_CFG"; then
        sed -i "s|^listener.security.protocol.map=.*|listener.security.protocol.map=PLAINTEXT:PLAINTEXT,SASL_PLAINTEXT:SASL_PLAINTEXT,CONTROLLER:PLAINTEXT|" "$KAFKA_CFG"
    else
        echo 'listener.security.protocol.map=PLAINTEXT:PLAINTEXT,SASL_PLAINTEXT:SASL_PLAINTEXT,CONTROLLER:PLAINTEXT' >> "$KAFKA_CFG"
    fi
    ok "server.properties updated for SASL"

    # Step 3 — restart so new listeners take effect
    systemctl restart kafka
    info "Waiting 15s for Kafka to restart..."
    sleep 15
    if "$KAFKA_INSTALL_DIR/bin/kafka-broker-api-versions.sh" \
            --bootstrap-server "localhost:$KAFKA_INTERNAL_PORT" &>/dev/null 2>&1; then
        ok "Kafka accepting connections on internal PLAINTEXT port $KAFKA_INTERNAL_PORT"
    else
        warn "Kafka not responding on $KAFKA_INTERNAL_PORT — check: journalctl -u kafka -n 50"
    fi
    ok "SASL setup complete — external port $KAFKA_PORT requires SCRAM-SHA-256 auth"
else
    info "KAFKA_SASL_USER not set — skipping SASL setup (Kafka running in PLAINTEXT mode)"
fi

# ── 4. ClickHouse ─────────────────────────────────────────────────────────────
section "4. ClickHouse"

if systemctl is-active --quiet clickhouse-server 2>/dev/null; then
    ok "ClickHouse already running — skipping install"
else
    info "Adding ClickHouse apt repository..."
    curl -fsSL 'https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key' \
        | gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg
    ARCH=$(dpkg --print-architecture)
    echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg arch=${ARCH}] \
https://packages.clickhouse.com/deb stable main" \
        > /etc/apt/sources.list.d/clickhouse.list
    apt-get update -qq
    apt-get install -y clickhouse-server clickhouse-client
    ok "ClickHouse installed"

    info "Configuring ClickHouse password for 'default' user..."
    mkdir -p /etc/clickhouse-server/users.d
    cat > /etc/clickhouse-server/users.d/pam-password.xml <<CHEOF
<clickhouse>
    <users>
        <default>
            <password>$CH_DEFAULT_PASS</password>
            <access_management>1</access_management>
        </default>
    </users>
</clickhouse>
CHEOF

    info "Configuring ClickHouse to listen on all interfaces..."
    mkdir -p /etc/clickhouse-server/config.d
    cat > /etc/clickhouse-server/config.d/pam-listen.xml <<'CHEOF'
<clickhouse>
    <listen_host>0.0.0.0</listen_host>
</clickhouse>
CHEOF

    info "Configuring ClickHouse ports..."
    cat > /etc/clickhouse-server/config.d/pam-ports.xml <<CHEOF
<clickhouse>
    <http_port>$CH_HTTP_PORT</http_port>
    <tcp_port>$CH_NATIVE_PORT</tcp_port>
</clickhouse>
CHEOF

    systemctl enable clickhouse-server
    systemctl start clickhouse-server
    info "Waiting 8s for ClickHouse to start..."
    sleep 8

    if clickhouse-client --password "$CH_DEFAULT_PASS" --port "$CH_NATIVE_PORT" \
            --query "SELECT 1" &>/dev/null 2>&1; then
        ok "ClickHouse is up (HTTP port $CH_HTTP_PORT, native port $CH_NATIVE_PORT)"
    else
        warn "ClickHouse query failed — check: journalctl -u clickhouse-server -n 50"
    fi
fi

# ── 5. firewall notice ────────────────────────────────────────────────────────
section "5. Firewall / Security Group reminder"

echo ""
warn "Ensure the following ports are open between instances (AWS SG / iptables):"
echo ""
echo "    Data layer inbound (this host):"
echo "      $MONGO_PORT   — MongoDB      (from app layer)"
echo "      $REDIS_PORT   — Redis        (from app layer)"
echo "      $KAFKA_PORT   — Kafka        (from app layer)"
echo "      $CH_HTTP_PORT — ClickHouse   (from app layer, HTTP)"
echo "      $CH_NATIVE_PORT — ClickHouse (from app layer, native)"
echo ""
echo "    App layer inbound:"
echo "      8001–8006  — PAM services  (from your load balancer / clients)"
echo ""

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Infrastructure setup complete."
echo ""
echo "  Service       Port(s)                   Credentials"
echo "  ─────────────────────────────────────────────────────"
echo "  MongoDB       $MONGO_PORT               admin / $MONGO_ADMIN_PASS"
echo "  Redis         $REDIS_PORT               pass: $REDIS_PASS"
echo "  Kafka         $KAFKA_PORT               (no auth, KRaft)"
echo "  ClickHouse    $CH_HTTP_PORT / $CH_NATIVE_PORT   default / $CH_DEFAULT_PASS"
echo ""
echo "  Kafka topics:"
echo "    pam.events.raw.v1                 (3 partitions)"
echo "    pam.events.invalid.v1             (1 partition)"
echo "    pam.campaigns.send.v1             (12 partitions)"
echo "    pam.campaigns.schedule.v1         (4 partitions)"
echo "    pam.campaigns.schedule.dlq.v1     (1 partition)"
echo "    pam.notifications.delivery.v1     (12 partitions)"
echo ""
echo "  Next: on the app server, run:"
echo "    git clone <repo> /home/ubuntu/pam"
echo "    sudo bash /home/ubuntu/pam/infra/deploy-services.sh"
echo "======================================================"
echo ""
