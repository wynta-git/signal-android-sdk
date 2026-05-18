#!/usr/bin/env bash
# One-time patch: update Mongo and Redis URLs in .env files with credentials.
# Run as: sudo bash patch-credentials.sh

set -euo pipefail

REPO="/home/ubuntu/pam"

ok()   { echo "  [OK]  $*"; }
die()  { echo "  [XX]  ERROR: $*" >&2; exit 1; }

[ "$EUID" -ne 0 ] && die "Run with sudo: sudo bash patch-credentials.sh"

# ── api-service ───────────────────────────────────────────────────────────────
ENV="$REPO/services/api-service/.env"
[ -f "$ENV" ] || die "$ENV not found"

sed -i 's|MONGO_URL=mongodb://[^@]*@\?172|MONGO_URL=mongodb://admin:glgpam2026@172|' "$ENV"
sed -i 's|REDIS_URL=redis://[^@]*@\?172|REDIS_URL=redis://:glgpam2026@172|'         "$ENV"
ok "api-service/.env updated"

# ── event-processor ───────────────────────────────────────────────────────────
ENV="$REPO/services/event-processor/.env"
[ -f "$ENV" ] || die "$ENV not found"

sed -i 's|REDIS_URL=redis://[^@]*@\?172|REDIS_URL=redis://:glgpam2026@172|' "$ENV"
ok "event-processor/.env updated"

# ── verify ────────────────────────────────────────────────────────────────────
echo ""
echo "── api-service/.env ────────────────────────────────────"
cat "$REPO/services/api-service/.env"
echo ""
echo "── event-processor/.env ────────────────────────────────"
cat "$REPO/services/event-processor/.env"
echo ""

# ── restart services ──────────────────────────────────────────────────────────
systemctl restart pam-api pam-processor
ok "Services restarted"

systemctl is-active pam-api      && ok "pam-api      is running" || echo "  [!!]  pam-api      failed — check: journalctl -u pam-api -n 40"
systemctl is-active pam-processor && ok "pam-processor is running" || echo "  [!!]  pam-processor failed — check: journalctl -u pam-processor -n 40"
