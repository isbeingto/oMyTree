#!/usr/bin/env bash
# safe-rebuild-web.sh
# Safely rebuild and restart omytree-web, ensuring build completes before restart
#
# Usage:
#   ./safe-rebuild-web.sh
#
# What it does:
#   1. Navigate to /srv/oMyTree/web
#   2. Run npm run build and wait for completion
#   3. Only restart PM2 if build succeeds
#   4. Show logs after restart

set -euo pipefail

cd /srv/oMyTree/web

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Next.js build..."

if npm run build; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Build completed successfully."
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting PM2 service..."
    pm2 restart omytree-web
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] PM2 restart complete."
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Showing recent logs..."
    pm2 logs omytree-web --lines 20 --nostream
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Build failed! Not restarting PM2."
    exit 1
fi
