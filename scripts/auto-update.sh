#!/bin/bash
# G.A.C.A. Auto-Update Script
# Checks for git changes, pulls updates, syncs providers, restarts service
#
# Usage:
#   ./scripts/auto-update.sh          # Run once
#   ./scripts/auto-update.sh --cron   # Run from cron (less verbose)
#
# Cron example (every 6 hours):
#   0 */6 * * * /root/gaca-core/scripts/auto-update.sh --cron >> /root/gaca-core/logs/auto-update.log 2>&1

set -e

GACA_DIR="/root/gaca-core"
LOG_DIR="$GACA_DIR/logs"
CRON_MODE=false

if [[ "$1" == "--cron" ]]; then
  CRON_MODE=true
fi

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

mkdir -p "$LOG_DIR"

cd "$GACA_DIR"

# Check if git repo exists
if [ ! -d ".git" ]; then
  log "ERROR: Not a git repository. Run 'git init' first."
  exit 1
fi

# Check for remote
REMOTE=$(git remote 2>/dev/null | head -1)
if [ -z "$REMOTE" ]; then
  log "ERROR: No git remote configured."
  exit 1
fi

# Fetch latest changes
log "Fetching from $REMOTE..."
git fetch "$REMOTE" 2>/dev/null

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
LOCAL=$(git rev-parse HEAD)
REMOTE_REF=$(git rev-parse "$REMOTE/$BRANCH" 2>/dev/null || echo "")

if [ -z "$REMOTE_REF" ]; then
  log "WARNING: Remote branch $REMOTE/$BRANCH not found."
  exit 0
fi

if [ "$LOCAL" = "$REMOTE_REF" ]; then
  if [ "$CRON_MODE" = false ]; then
    log "Already up to date."
  fi
  exit 0
fi

# Changes detected
log "Updates available: $LOCAL -> $REMOTE_REF"
log "Pulling changes..."

git pull "$REMOTE" "$BRANCH"

# Check if dependencies changed
if git diff "$LOCAL" "$REMOTE_REF" --name-only | grep -q "package.json"; then
  log "package.json changed — installing dependencies..."
  npm install --production 2>/dev/null
fi

# Check if schema changed
if git diff "$LOCAL" "$REMOTE_REF" --name-only | grep -q "prisma/schema.prisma"; then
  log "Prisma schema changed — running db push..."
  npx prisma db push --skip-generate 2>/dev/null
  npx prisma generate 2>/dev/null
fi

# Check if providers/models changed
if git diff "$LOCAL" "$REMOTE_REF" --name-only | grep -q "src/core/types.ts"; then
  log "Provider definitions changed — syncing database..."
  npx tsx scripts/sync-providers.ts
fi

# Restart service
if pm2 list 2>/dev/null | grep -q "gaca-core"; then
  log "Restarting gaca-core PM2 process..."
  pm2 restart gaca-core
else
  log "gaca-core not in PM2 — skipping restart."
fi

log "Auto-update complete!"
