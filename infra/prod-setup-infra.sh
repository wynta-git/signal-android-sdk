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
# Credentials can be overridden via environment variables before running:
#   MONGO_ADMIN_PASS=secret REDIS_PASS=secret sudo bash setup-infra.sh
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
echo "  MongoDB:    admin / $MONGO_ADMIN_PASS  (port 27017)"
echo "  Redis:      pass=$REDIS_PASS            (port 6379)"
echo "  Kafka:      no auth                     (port 9092)"
echo "  ClickHouse: default / $CH_DEFAULT_PASS  (ports 8123, 9000)"
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
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
        | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" \
        > /etc/apt/sources.list.d/mongodb-org-7.0.list
    apt-get update -qq
    apt-get install -y -qq mongodb-org mongodb-mongosh
    ok "MongoDB 7.0 installed"

    info "Writing /etc/mongod.conf (auth disabled — temporary for user creation)..."
    cat > /etc/mongod.conf <<'MONGOCFG'
storage:
  dbPath: /var/lib/mongodb

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

net:
  port: 27017
  bindIp: 0.0.0.0

processManagement:
  timeZoneInfo: /usr/share/zoneinfo
MONGOCFG

    systemctl start mongod
    info "Waiting 5s for MongoDB to initialise..."
    sleep 5

    info "Creating admin user..."
    mongosh --quiet --eval "
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

    if mongosh --quiet \
            --username admin --password "$MONGO_ADMIN_PASS" \
            --authenticationDatabase admin \
            --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q '^1$'; then
        ok "MongoDB is up with authentication enabled"
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

    info "Configuring Redis (bind, password, protected-mode)..."
    # Bind to all interfaces
    sed -i 's/^bind 127\.0\.0\.1.*/bind 0.0.0.0/' "$REDIS_CFG"
    # Disable protected-mode (required when binding to 0.0.0.0 with password)
    sed -i 's/^protected-mode yes/protected-mode no/' "$REDIS_CFG"
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

    if redis-cli -a "$REDIS_PASS" ping 2>/dev/null | grep -q "PONG"; then
        ok "Redis is up on port 6379"
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
        sed -i "s|^advertised.listeners=.*|advertised.listeners=PLAINTEXT://$INSTANCE_IP:9092|" "$KAFKA_CFG"
    else
        echo "advertised.listeners=PLAINTEXT://$INSTANCE_IP:9092" >> "$KAFKA_CFG"
    fi
    # Set listeners (PLAINTEXT for clients + CONTROLLER for KRaft consensus)
    if grep -q '^listeners=' "$KAFKA_CFG"; then
        sed -i "s|^listeners=.*|listeners=PLAINTEXT://$INSTANCE_IP:9092,CONTROLLER://localhost:9093|" "$KAFKA_CFG"
    else
        echo "listeners=PLAINTEXT://$INSTANCE_IP:9092,CONTROLLER://localhost:9093" >> "$KAFKA_CFG"
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
                --bootstrap-server "localhost:9092" &>/dev/null 2>&1; then
            ok "Kafka is accepting connections on localhost:9092"
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

create_topic() {
    local topic="$1" partitions="$2"
    if "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" \
            --bootstrap-server "localhost:9092" --list 2>/dev/null | grep -qxF "$topic"; then
        ok "Already exists: $topic"
    else
        "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" \
            --bootstrap-server "localhost:9092" \
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

    systemctl enable clickhouse-server
    systemctl start clickhouse-server
    info "Waiting 8s for ClickHouse to start..."
    sleep 8

    if clickhouse-client --password "$CH_DEFAULT_PASS" \
            --query "SELECT 1" &>/dev/null 2>&1; then
        ok "ClickHouse is up (HTTP port 8123, native port 9000)"
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
echo "      27017  — MongoDB      (from app layer)"
echo "      6379   — Redis        (from app layer)"
echo "      9092   — Kafka        (from app layer)"
echo "      8123   — ClickHouse   (from app layer, HTTP)"
echo "      9000   — ClickHouse   (from app layer, native)"
echo ""
echo "    App layer inbound:"
echo "      8001–8006  — PAM services  (from your load balancer / clients)"
echo ""

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Infrastructure setup complete."
echo ""
echo "  Service       Port(s)         Credentials"
echo "  ─────────────────────────────────────────────────────"
echo "  MongoDB       27017           admin / $MONGO_ADMIN_PASS"
echo "  Redis         6379            pass: $REDIS_PASS"
echo "  Kafka         9092            (no auth, KRaft)"
echo "  ClickHouse    8123 / 9000     default / $CH_DEFAULT_PASS"
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
