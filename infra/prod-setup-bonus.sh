#!/usr/bin/env bash
# =============================================================================
# PAM — Bonus service infrastructure setup (run on Instance 1 / data layer)
#
# Creates:
#   - MySQL: wynta_bonus database + wynta_bonus user
#   - Kafka: pam.bonus.raw.v1 and pam.bonus.invalid.v1 topics
#
# Run as root on Instance 1:
#   sudo MYSQL_ROOT_PASS='...' BONUS_DB_PASS='...' bash infra/prod-setup-bonus.sh
# =============================================================================

set -euo pipefail

MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-}"
BONUS_DB_USER="${BONUS_DB_USER:-wynta_bonus}"
BONUS_DB_PASS="${BONUS_DB_PASS:-}"
BONUS_DB_NAME="${BONUS_DB_NAME:-wynta_bonus}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
KAFKA_INSTALL_DIR="${KAFKA_INSTALL_DIR:-/opt/kafka}"
KAFKA_INTERNAL_PORT="${KAFKA_INTERNAL_PORT:-19092}"

ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
die()     { echo "  [XX]  ERROR: $*" >&2; exit 1; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash infra/prod-setup-bonus.sh"
[ -z "$MYSQL_ROOT_PASS" ] && die "MYSQL_ROOT_PASS is required"
[ -z "$BONUS_DB_PASS" ]   && die "BONUS_DB_PASS is required"

echo ""
echo "======================================================"
echo "  PAM — Bonus Infrastructure Setup"
echo "  MySQL DB:   $BONUS_DB_NAME"
echo "  MySQL user: $BONUS_DB_USER"
echo "======================================================"
sleep 3

# ── 1. MySQL ──────────────────────────────────────────────────────────────────
section "1. MySQL — bonus database and user"

mysql -u root -p"$MYSQL_ROOT_PASS" -h 127.0.0.1 -P "$MYSQL_PORT" <<SQL
CREATE DATABASE IF NOT EXISTS \`$BONUS_DB_NAME\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '$BONUS_DB_USER'@'%' IDENTIFIED BY '$BONUS_DB_PASS';
ALTER USER '$BONUS_DB_USER'@'%' IDENTIFIED BY '$BONUS_DB_PASS';

GRANT ALL PRIVILEGES ON \`$BONUS_DB_NAME\`.* TO '$BONUS_DB_USER'@'%';
GRANT SELECT ON \`wynta_common\`.* TO '$BONUS_DB_USER'@'%';
FLUSH PRIVILEGES;
SQL
ok "Database '$BONUS_DB_NAME' and user '$BONUS_DB_USER' ready"

# Verify connection
if mysql -u "$BONUS_DB_USER" -p"$BONUS_DB_PASS" -h 127.0.0.1 -P "$MYSQL_PORT" \
        "$BONUS_DB_NAME" -e "SELECT 1;" &>/dev/null; then
    ok "Connection verified for '$BONUS_DB_USER'@localhost"
else
    die "Could not connect as '$BONUS_DB_USER' — check credentials"
fi

# ── 2. Kafka topics ───────────────────────────────────────────────────────────
section "2. Kafka — bonus topics"

create_topic() {
    local topic="$1" partitions="$2"
    if "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" \
            --bootstrap-server "localhost:$KAFKA_INTERNAL_PORT" --list 2>/dev/null \
            | grep -qxF "$topic"; then
        ok "Already exists: $topic"
    else
        "$KAFKA_INSTALL_DIR/bin/kafka-topics.sh" \
            --bootstrap-server "localhost:$KAFKA_INTERNAL_PORT" \
            --create \
            --topic "$topic" \
            --partitions "$partitions" \
            --replication-factor 1
        ok "Created: $topic  (partitions=$partitions)"
    fi
}

create_topic "pam.bonus.raw.v1"     3
create_topic "pam.bonus.invalid.v1" 1

echo ""
echo "======================================================"
echo "  Bonus infra setup complete."
echo ""
echo "  MySQL  DB:   $BONUS_DB_NAME"
echo "  MySQL  user: $BONUS_DB_USER / $BONUS_DB_PASS"
echo ""
echo "  Next: on the app server, re-run prod-deploy-services.sh"
echo "  with BONUS_DB_PASS='$BONUS_DB_PASS'"
echo "======================================================"
echo ""
