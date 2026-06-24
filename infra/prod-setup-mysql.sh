#!/usr/bin/env bash
# =============================================================================
# PAM — MySQL 8.0 setup (Data Layer)
#
# Installs MySQL 8.0 and creates the wynta_common database.
# Run on the data layer server (Instance 1).
#
# Usage:
#   sudo bash prod-setup-mysql.sh
#
# Override defaults:
#   MYSQL_ROOT_PASS='secret' MYSQL_PORT=3306 sudo bash prod-setup-mysql.sh
# =============================================================================

set -euo pipefail

MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-glgmysql2026}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_BIND="${MYSQL_BIND:-0.0.0.0}"
DB_NAME="${DB_NAME:-wynta_common}"
APP_USER="${APP_USER:-wynta}"
APP_PASS="${APP_PASS:-glgapp2026}"

ok()      { echo "  [OK]  $*"; }
info()    { echo "  [--]  $*"; }
warn()    { echo "  [!!]  $*"; }
section() { echo ""; echo "── $* ──────────────────────────────────────────────"; }

[ "$EUID" -ne 0 ] && { echo "Run with sudo"; exit 1; }

echo ""
echo "======================================================"
echo "  PAM — MySQL 8.0 Setup"
echo "  Port:     $MYSQL_PORT"
echo "  Root:     root / $MYSQL_ROOT_PASS"
echo "  Database: $DB_NAME"
echo "  App user: $APP_USER / $APP_PASS"
echo ""
echo "  Press Ctrl+C within 5s to abort."
echo "======================================================"
sleep 5

# ── 1. Install ────────────────────────────────────────────────────────────────
section "1. Installing MySQL 8.0"

if systemctl is-active --quiet mysql 2>/dev/null; then
    ok "MySQL already running — skipping install"
else
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq mysql-server
    ok "MySQL installed"

    # ── 2. Configure ─────────────────────────────────────────────────────────
    section "2. Configuring MySQL"

    info "Setting port and bind address..."
    cat > /etc/mysql/mysql.conf.d/pam.cnf <<EOF
[mysqld]
port            = $MYSQL_PORT
bind-address    = $MYSQL_BIND
mysqlx          = 0
EOF
    ok "Config written to /etc/mysql/mysql.conf.d/pam.cnf"

    systemctl restart mysql
    systemctl enable mysql
    sleep 3

    # ── 3. Secure and create users ────────────────────────────────────────────
    section "3. Setting root password and creating app user"

    info "Configuring root user..."
    mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '$MYSQL_ROOT_PASS';"
    mysql -u root -p"$MYSQL_ROOT_PASS" -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED WITH caching_sha2_password BY '$MYSQL_ROOT_PASS'; GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
    ok "Root user configured"

    info "Creating database '$DB_NAME' and app user '$APP_USER'..."
    mysql -u root -p"$MYSQL_ROOT_PASS" \
        -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    mysql -u root -p"$MYSQL_ROOT_PASS" \
        -e "CREATE USER IF NOT EXISTS '$APP_USER'@'%' IDENTIFIED WITH caching_sha2_password BY '$APP_PASS';"
    mysql -u root -p"$MYSQL_ROOT_PASS" \
        -e "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$APP_USER'@'%'; FLUSH PRIVILEGES;"
    ok "Database '$DB_NAME' and user '$APP_USER' ready"

    # ── 4. Verify ─────────────────────────────────────────────────────────────
    section "4. Verification"

    if mysql -u root -p"$MYSQL_ROOT_PASS" -P "$MYSQL_PORT" \
            -e "SELECT 1;" &>/dev/null 2>&1; then
        ok "MySQL is up on port $MYSQL_PORT"
    else
        warn "MySQL check failed — check: journalctl -u mysql -n 30 --no-pager"
    fi
fi

echo ""
echo "======================================================"
echo "  MySQL setup complete."
echo ""
echo "  Service    Port    Credentials"
echo "  ──────────────────────────────────────────────────"
echo "  MySQL      $MYSQL_PORT   root / $MYSQL_ROOT_PASS"
echo "  MySQL      $MYSQL_PORT   $APP_USER / $APP_PASS  (db: $DB_NAME)"
echo ""
echo "  Open in AWS SG: port $MYSQL_PORT from app layer"
echo "======================================================"
echo ""
