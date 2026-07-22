#!/usr/bin/env bash
# =============================================================================
# PAM — Instance 1 setup (Data Layer: 172.31.6.243)
#
# Run as root or with sudo:
#   sudo bash deploy-instance1.sh
#
# What this does:
#   1. Locates your Kafka installation
#   2. Checks advertised.listeners — updates to private IP if pointing to localhost
#   3. Restarts Kafka if config was changed
#   4. Creates Kafka topics  (pam.events.raw.v1 and pam.events.invalid.v1)
#   5. Verifies MongoDB and Redis are reachable
# =============================================================================

set -euo pipefail

INSTANCE1_IP="172.31.6.243"

# ── helpers ───────────────────────────────────────────────────────────────────
ok()   { echo "  [OK]  $*"; }
info() { echo "  [--]  $*"; }
warn() { echo "  [!!]  $*"; }
die()  { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash deploy-instance1.sh"

echo ""
echo "======================================================"
echo "  PAM — Instance 1 setup (Data Layer)"
echo "  Host: $INSTANCE1_IP"
echo "======================================================"

# ── 1. locate kafka ───────────────────────────────────────────────────────────
section "1. Locating Kafka"

KAFKA_HOME=""
for candidate in /opt/kafka /home/ubuntu/kafka /kafka /usr/local/kafka; do
    if [ -f "$candidate/bin/kafka-topics.sh" ]; then
        KAFKA_HOME="$candidate"
        break
    fi
done

# Fall back: derive from running process
if [ -z "$KAFKA_HOME" ]; then
    PROC_BIN=$(ps aux | grep -oP '[^ ]+/bin/kafka-server-start\.sh' | head -1 || true)
    [ -n "$PROC_BIN" ] && KAFKA_HOME=$(dirname "$(dirname "$PROC_BIN")")
fi

[ -z "$KAFKA_HOME" ] && die "Cannot find Kafka. Set KAFKA_HOME manually and re-run."
ok "Kafka home: $KAFKA_HOME"

KAFKA_BIN="$KAFKA_HOME/bin"

# ── 2. locate kafka config ────────────────────────────────────────────────────
section "2. Checking Kafka advertised.listeners"

KAFKA_CFG=""
# Try to find from running process args first (most reliable)
KAFKA_CFG=$(ps aux | grep -oP "$KAFKA_HOME/config/[^ ]+" | grep '\.properties' | head -1 || true)

# Fall back to common paths
if [ -z "$KAFKA_CFG" ]; then
    for cfg in \
        "$KAFKA_HOME/config/kraft/server.properties" \
        "$KAFKA_HOME/config/server.properties"; do
        if [ -f "$cfg" ]; then
            KAFKA_CFG="$cfg"
            break
        fi
    done
fi

if [ -z "$KAFKA_CFG" ]; then
    warn "Could not find Kafka config file. Skipping advertised.listeners check."
    warn "Manually ensure this line exists in your Kafka config:"
    warn "  advertised.listeners=PLAINTEXT://$INSTANCE1_IP:9092"
else
    ok "Config file: $KAFKA_CFG"
    CURRENT_ADV=$(grep -E '^advertised\.listeners' "$KAFKA_CFG" | head -1 || true)

    if [ -z "$CURRENT_ADV" ]; then
        warn "advertised.listeners not set — adding it."
        echo "advertised.listeners=PLAINTEXT://$INSTANCE1_IP:9092" >> "$KAFKA_CFG"
        RESTART_NEEDED=true
    elif echo "$CURRENT_ADV" | grep -qF "$INSTANCE1_IP"; then
        ok "advertised.listeners already uses $INSTANCE1_IP — no change."
        RESTART_NEEDED=false
    elif echo "$CURRENT_ADV" | grep -qE 'localhost|127\.0\.0\.1'; then
        warn "advertised.listeners points to localhost — updating to $INSTANCE1_IP"
        cp "$KAFKA_CFG" "${KAFKA_CFG}.bak.$(date +%Y%m%d%H%M%S)"
        sed -i "s|^advertised\.listeners=.*|advertised.listeners=PLAINTEXT://$INSTANCE1_IP:9092|" "$KAFKA_CFG"
        ok "Config updated. Backup saved alongside original."
        RESTART_NEEDED=true
    else
        ok "advertised.listeners: $CURRENT_ADV (looks OK, skipping change)"
        RESTART_NEEDED=false
    fi

    # ── 3. restart kafka if config changed ────────────────────────────────────
    if [ "${RESTART_NEEDED:-false}" = "true" ]; then
        info "Restarting Kafka..."
        RESTARTED=false
        for unit in kafka kafka-server kafka-broker; do
            if systemctl is-active --quiet "$unit" 2>/dev/null || \
               systemctl is-enabled --quiet "$unit" 2>/dev/null; then
                systemctl restart "$unit"
                ok "Restarted via systemd unit: $unit"
                RESTARTED=true
                break
            fi
        done

        if [ "$RESTARTED" = "false" ]; then
            warn "No systemd unit found for Kafka."
            warn "Stop Kafka manually, then re-run this script."
            warn "  $KAFKA_BIN/kafka-server-stop.sh"
            warn "  $KAFKA_BIN/kafka-server-start.sh -daemon $KAFKA_CFG"
            exit 1
        fi

        info "Waiting 10s for Kafka to be ready after restart..."
        sleep 10
    fi
fi

# ── 4. verify kafka is accepting connections ──────────────────────────────────
section "4. Verifying Kafka is up"

MAX_TRIES=10
for i in $(seq 1 $MAX_TRIES); do
    if "$KAFKA_BIN/kafka-broker-api-versions.sh" \
            --bootstrap-server "localhost:9092" &>/dev/null 2>&1; then
        ok "Kafka is responding on localhost:9092"
        break
    fi
    if [ "$i" -eq "$MAX_TRIES" ]; then
        die "Kafka not responding after $MAX_TRIES attempts. Check: systemctl status kafka"
    fi
    echo "    attempt $i/$MAX_TRIES — waiting 3s..."
    sleep 3
done

# ── 5. create kafka topics ────────────────────────────────────────────────────
section "5. Creating Kafka topics"

create_topic() {
    local topic="$1"
    local partitions="$2"

    if "$KAFKA_BIN/kafka-topics.sh" \
            --bootstrap-server "localhost:9092" \
            --list 2>/dev/null | grep -qxF "$topic"; then
        ok "Already exists: $topic"
    else
        "$KAFKA_BIN/kafka-topics.sh" \
            --bootstrap-server "localhost:9092" \
            --create \
            --topic "$topic" \
            --partitions "$partitions" \
            --replication-factor 1
        ok "Created: $topic (partitions=$partitions)"
    fi
}

create_topic "pam.events.raw.v1"              3
create_topic "pam.events.invalid.v1"          1
create_topic "pam.campaigns.send.v1"          12
create_topic "pam.campaigns.schedule.v1"      4
create_topic "pam.campaigns.schedule.dlq.v1"  1
create_topic "pam.notifications.delivery.v1"  12
create_topic "pam.campaigns.send.grouped.email.v1" 12

# ── 6. verify mongodb ─────────────────────────────────────────────────────────
section "6. Verifying MongoDB"

if command -v mongosh &>/dev/null; then
    if mongosh --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q '^1$'; then
        ok "MongoDB is up (mongosh)"
    else
        warn "MongoDB ping failed. Check: sudo systemctl status mongod"
    fi
elif command -v mongo &>/dev/null; then
    if mongo --quiet --eval "db.adminCommand('ping').ok" 2>/dev/null | grep -q '^1$'; then
        ok "MongoDB is up (mongo)"
    else
        warn "MongoDB ping failed. Check: sudo systemctl status mongod"
    fi
else
    warn "mongosh/mongo CLI not found — cannot ping MongoDB from here."
    warn "Ensure MongoDB is running and port 27017 is accessible from Instance 2."
fi

# ── 7. verify redis ───────────────────────────────────────────────────────────
section "7. Verifying Redis"

if command -v redis-cli &>/dev/null; then
    if redis-cli -h "$INSTANCE1_IP" ping 2>/dev/null | grep -q "PONG"; then
        ok "Redis is up (bound to $INSTANCE1_IP:6379)"
    else
        warn "Redis did not respond to PING. Check: sudo systemctl status redis"
    fi
else
    warn "redis-cli not found — cannot ping Redis from here."
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo ""
echo "======================================================"
echo "  Instance 1 setup complete."
echo ""
echo "  Topics ready:"
echo "    pam.events.raw.v1                 (3 partitions)"
echo "    pam.events.invalid.v1             (1 partition)"
echo "    pam.campaigns.send.v1             (12 partitions)"
echo "    pam.campaigns.schedule.v1         (4 partitions)"
echo "    pam.campaigns.schedule.dlq.v1     (1 partition)"
echo "    pam.notifications.delivery.v1     (12 partitions)"
echo ""
echo "  Next: SSH into Instance 2 (172.31.44.32) and run:"
echo "    sudo bash /home/ubuntu/pam/infra/deploy-instance2.sh"
echo "======================================================"
echo ""
