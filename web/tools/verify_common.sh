#!/usr/bin/env sh
# Shared helpers for LinZhi UI verification scripts.
# This file is intended to be sourced; do not `set -e` or `set -u` here.

DEFAULT_FRONTEND_HOST=${DEFAULT_FRONTEND_HOST:-127.0.0.1}
DEFAULT_FRONTEND_PRIMARY_PORT=${DEFAULT_FRONTEND_PRIMARY_PORT:-3000}
DEFAULT_FRONTEND_FALLBACK_PORT=${DEFAULT_FRONTEND_FALLBACK_PORT:-3001}
: "${RESOLVE_PORT_SOURCE:=unset}"

curl_status() {
  host=${1:-$DEFAULT_FRONTEND_HOST}
  port=$2
  path=${3:-/}
  timeout=${4:-2}
  scheme=${5:-http}

  if [ -z "$port" ]; then
    printf '000'
    return 1
  fi

  url="${scheme}://${host}:${port}${path}"
  status=$(curl -sS -m "$timeout" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || printf '000')
  printf '%s' "$status"
  [ "$status" = "000" ] && return 1
  return 0
}

resolve_port() {
  host=${1:-$DEFAULT_FRONTEND_HOST}
  primary=${2:-$DEFAULT_FRONTEND_PRIMARY_PORT}
  fallback=${3:-$DEFAULT_FRONTEND_FALLBACK_PORT}
  probe_path=${4:-/}
  timeout=${5:-2}
  explicit_port=${FRONTEND_PORT:-}

  if [ -n "$explicit_port" ]; then
    status=$(curl_status "$host" "$explicit_port" "$probe_path" "$timeout" || printf '000')
    if [ "$status" = "000" ]; then
      RESOLVE_PORT_SOURCE="env-failed"
      printf '%s' "$explicit_port"
      return 1
    fi
    RESOLVE_PORT_SOURCE="env"
    printf '%s' "$explicit_port"
    return 0
  fi

  status=$(curl_status "$host" "$primary" "$probe_path" "$timeout" || printf '000')
  if [ "$status" != "000" ]; then
    RESOLVE_PORT_SOURCE="primary"
    printf '%s' "$primary"
    return 0
  fi

  status=$(curl_status "$host" "$fallback" "$probe_path" "$timeout" || printf '000')
  if [ "$status" != "000" ]; then
    RESOLVE_PORT_SOURCE="fallback"
    printf '%s' "$fallback"
    return 0
  fi

  RESOLVE_PORT_SOURCE="unreachable"
  printf '%s' "$primary"
  return 1
}
