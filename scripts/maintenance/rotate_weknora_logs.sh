#!/usr/bin/env bash
set -euo pipefail

LOGROTATE_CONF="/srv/oMyTree/infra/logrotate/omytree-weknora.conf"
STATE_FILE="/srv/oMyTree/logs/logrotate.weknora.state"

if [[ ! -f "$LOGROTATE_CONF" ]]; then
  echo "logrotate config missing: $LOGROTATE_CONF" >&2
  exit 1
fi

logrotate -s "$STATE_FILE" "$LOGROTATE_CONF"
