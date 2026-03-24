#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="/srv/oMyTree/logs"
PASS_LOG="${LOG_DIR}/weknora_guard.pass"
ERR_LOG="${LOG_DIR}/weknora_guard.err"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOSTNAME=$(hostname)
WEBHOOK_URL="${WEBHOOK_URL:-}"

fail_messages=()

check_http() {
  local name=$1
  local url=$2
  if ! curl -sf "$url" >/dev/null; then
    fail_messages+=("$name health check failed: $url")
  fi
}

check_tcp() {
  local name=$1
  local host=$2
  local port=$3
  if ! timeout 2 bash -c "</dev/tcp/${host}/${port}" 2>/dev/null; then
    fail_messages+=("$name port check failed: ${host}:${port}")
  fi
}

check_http "weknora" "http://127.0.0.1:8081/health"
check_tcp "docreader" "127.0.0.1" "50051"
check_http "qdrant" "http://127.0.0.1:6333/collections"

send_webhook() {
  local status=$1
  local message=$2
  if [[ -z "$WEBHOOK_URL" ]]; then
    return
  fi
  local payload
  payload=$(cat <<EOF
{"name":"weknora_guard","status":"${status}","timestamp":"${TIMESTAMP}","hostname":"${HOSTNAME}","message":"${message}"}
EOF
)
  curl -sS -X POST -H "Content-Type: application/json" -d "$payload" "$WEBHOOK_URL" >/dev/null 2>&1 || true
}

if [[ ${#fail_messages[@]} -eq 0 ]]; then
  echo "[${TIMESTAMP}] PASS - WeKnora/docreader/qdrant healthy" >> "$PASS_LOG"
  send_webhook "PASS" "All checks passed"
  exit 0
fi

fail_msg="[${TIMESTAMP}] FAIL - ${fail_messages[*]}"
echo "$fail_msg" >> "$ERR_LOG"
send_webhook "FAIL" "${fail_messages[*]}"
echo "$fail_msg" >&2
exit 1
