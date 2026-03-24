#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ROOT_DIR=$(cd "$SCRIPT_DIR/.." && pwd)
# shellcheck source=./verify_common.sh
. "$SCRIPT_DIR/verify_common.sh"

VERBOSE=0
for arg in "$@"; do
  case "$arg" in
    -v|--verbose)
      VERBOSE=1
      ;;
  esac
done

if [ -t 1 ]; then
  GREEN=$(printf '\033[32m')
  RED=$(printf '\033[31m')
  YELLOW=$(printf '\033[33m')
  RESET=$(printf '\033[0m')
else
  GREEN=""
  RED=""
  YELLOW=""
  RESET=""
fi

pass() {
  printf '%sPASS%s %s\n' "$GREEN" "$RESET" "$1"
}

warn() {
  printf '%sWARN%s %s\n' "$YELLOW" "$RESET" "$1"
}

fail() {
  printf '%sFAIL%s %s\n' "$RED" "$RESET" "$1"
  if [ "${CHECK_CONTEXT-default}" = "default" ]; then
    HAS_FAILURE=1
  fi
}

info() {
  printf '[verify-ui] %s\n' "$1"
}

HAS_FAILURE=0
TMP_FILES=""
LAST_RESPONSE_FILE=""

FRONTEND_HOST=${FRONTEND_HOST:-127.0.0.1}
set +e
FRONTEND_PORT_VALUE=$(resolve_port "$FRONTEND_HOST" "$DEFAULT_FRONTEND_PRIMARY_PORT" "$DEFAULT_FRONTEND_FALLBACK_PORT" /)
resolve_rc=$?
set -e
if [ "$resolve_rc" -ne 0 ]; then
  case ${RESOLVE_PORT_SOURCE-unset} in
    env-failed)
      fail "FRONTEND_PORT=${FRONTEND_PORT:-?} is unreachable on ${FRONTEND_HOST}"
      exit 1
      ;;
    unreachable)
      fail "Unable to reach frontend on ports ${DEFAULT_FRONTEND_PRIMARY_PORT}/${DEFAULT_FRONTEND_FALLBACK_PORT}"
      exit 1
      ;;
    *)
      fail "Failed to resolve frontend port (source=${RESOLVE_PORT_SOURCE-unset})"
      exit 1
      ;;
  esac
fi

cleanup() {
  for f in $TMP_FILES; do
    [ -f "$f" ] && rm -f "$f"
  done
}
trap 'cleanup' EXIT INT HUP TERM

if [ "$VERBOSE" -eq 1 ]; then
  CURL_FLAGS="-sS -m 15 -v"
else
  CURL_FLAGS="-sS -m 15"
fi

JQ_CMD=""
if [ -x /usr/bin/jq ]; then
  JQ_CMD=/usr/bin/jq
elif command -v jq >/dev/null 2>&1; then
  candidate=$(command -v jq)
  case "$candidate" in
    *node_modules/jq*)
      ;;
    *)
      JQ_CMD=$candidate
      ;;
  esac
fi

if [ -n "$JQ_CMD" ]; then
  USE_JQ=1
else
  USE_JQ=0
  warn "jq not found; falling back to grep-based checks"
fi

strip_trailing_slash() {
  printf '%s' "$1" | sed 's:/*$::'
}

if [ "${NEXT_PUBLIC_API_BASE-}" != "" ]; then
  API_BASE=$(strip_trailing_slash "$NEXT_PUBLIC_API_BASE")
  info "Using explicit NEXT_PUBLIC_API_BASE=${API_BASE}"
else
  if [ "${API_PROXY_TARGET-}" = "" ]; then
    API_BASE="http://${FRONTEND_HOST}:${FRONTEND_PORT_VALUE}"
    info "Using rewrites via detected frontend ${API_BASE}"
  else
    API_BASE=$(strip_trailing_slash "$API_PROXY_TARGET")
    info "Using rewrites via API_PROXY_TARGET=${API_BASE}"
  fi
fi

case ${RESOLVE_PORT_SOURCE-unset} in
  env)
    info "FRONTEND_PORT provided: ${FRONTEND_PORT_VALUE}"
    ;;
  fallback)
    info "Detected frontend fallback port ${FRONTEND_PORT_VALUE}"
    ;;
  unreachable)
    warn "Unable to reach frontend on ports ${DEFAULT_FRONTEND_PRIMARY_PORT}/${DEFAULT_FRONTEND_FALLBACK_PORT}; proceeding with ${FRONTEND_PORT_VALUE}"
    ;;
  *)
    info "Detected frontend port ${FRONTEND_PORT_VALUE}"
    ;;
esac

case "$API_BASE" in
  *3100*)
    backend_note="Connected to mock backend"
    ;;
  *8000*)
    backend_note="Connected to real backend"
    ;;
  *)
    backend_note="Using backend ${API_BASE}"
    ;;
esac
info "$backend_note"

BACKEND_MODE="real"
if printf '%s' "${API_PROXY_TARGET-http://127.0.0.1:3100}" | grep '127\\.0\\.0\\.1:3100' >/dev/null 2>&1; then
  BACKEND_MODE="mock"
fi
if [ "$VERBOSE" -eq 1 ]; then
  info "Detected backend mode: ${BACKEND_MODE}"
fi

assert_json_has_keys() {
  file=$1
  shift
  for key in "$@"; do
    if [ "$USE_JQ" -eq 1 ]; then
      if ! "$JQ_CMD" -e "has(\"$key\")" "$file" >/dev/null 2>&1; then
        fail "Response missing key '$key'"
        "$JQ_CMD" '.' "$file" >&2 || true
        return 1
      fi
    else
      if ! grep -q '"'"$key"'"' "$file"; then
        fail "Response missing key '$key'"
        cat "$file" >&2
        return 1
      fi
    fi
  done
  return 0
}

assert_json_predicate() {
  file=$1
  description=$2
  jq_expr=$3
  if [ "$USE_JQ" -eq 1 ]; then
    if "$JQ_CMD" -e "$jq_expr" "$file" >/dev/null 2>&1; then
      pass "$description"
      return 0
    fi
    fail "$description"
    "$JQ_CMD" '.' "$file" >&2 || true
    return 1
  fi
  return 0
}

http_request() {
  method=$1
  path=$2
  body=$3
  expected_status=$4
  label=$5

  tmp=$(mktemp)
  TMP_FILES="$TMP_FILES $tmp"
  status_file=$(mktemp)
  TMP_FILES="$TMP_FILES $status_file"

  base=${API_BASE%/}
  case "$base" in
    */api)
      trimmed_path=$(printf '%s' "$path" | sed 's#^/api##')
      url="${base}${trimmed_path}"
      ;;
    *)
      url="${base}${path}"
      ;;
  esac

# shellcheck disable=SC2086
  set -- $CURL_FLAGS -w '%{http_code}' -o "$tmp"
  if [ "$method" != "GET" ]; then
    set -- "$@" -X "$method" -H "Content-Type: application/json" -d "$body"
  fi
  set -- "$@" "$url"

  if ! curl "$@" >"$status_file" 2>&1; then
    fail "$label (${method} ${path}) curl error"
    if [ -s "$status_file" ]; then
      cat "$status_file" >&2
    fi
    return 1
  fi

  status=$(tr -d '\r' <"$status_file" | tail -n 1)
  if [ "$status" != "$expected_status" ]; then
    body_text=$(cat "$tmp" 2>/dev/null || true)
    fail "$label (${method} ${path}) returned status ${status}; expected ${expected_status}"
    if [ -n "$body_text" ]; then
      printf '%s\n' "$body_text" >&2
    fi
    return 1
  fi

  LAST_RESPONSE_FILE="$tmp"
  pass "$label (${method} ${path}) status ${status}"
  return 0
}

run_success_checks() {
  info "Checking /api/branch/suggest"
  if ! http_request POST /api/branch/suggest '{"conversation":"demo","last_node":"root"}' 200 "branch suggest"; then
    return 1
  fi
  tmp="$LAST_RESPONSE_FILE"
  assert_json_has_keys "$tmp" trace_id candidates || return 1
  assert_json_predicate "$tmp" "branch suggest returns array candidates" '.candidates | type == "array"' || true
  candidate_id=""
  if [ "$USE_JQ" -eq 1 ]; then
    candidate_id=$("$JQ_CMD" -r '.candidates[0].id // empty' "$tmp" 2>/dev/null || printf '')
    if [ -z "$candidate_id" ]; then
      fail "branch suggest response missing candidates[0].id"
      return 1
    fi
  else
    candidate_id="cand1"
    warn "Falling back to default candidate_id because jq is unavailable"
  fi
  if [ "$VERBOSE" -eq 1 ]; then
    info "branch confirm candidate_id=${candidate_id}"
  fi
  rm -f "$tmp"

  info "Checking /api/branch/confirm"
  confirm_payload=$(printf '{"candidate_id":"%s","action":"accept"}' "$candidate_id")
  if ! http_request POST /api/branch/confirm "$confirm_payload" 200 "branch confirm"; then
    return 1
  fi
  tmp="$LAST_RESPONSE_FILE"
  assert_json_has_keys "$tmp" ok trace_id || return 1
  rm -f "$tmp"

  info "Checking /api/events/replay"
  if ! http_request POST /api/events/replay '{"treeId":"demo","to":"1970-01-01T00:00:00Z"}' 200 "events replay"; then
    return 1
  fi
  tmp="$LAST_RESPONSE_FILE"
  assert_json_has_keys "$tmp" ok || return 1
  rm -f "$tmp"

  info "Checking /api/tree/demo"
  if ! http_request GET /api/tree/demo "" 200 "tree snapshot"; then
    return 1
  fi
  tmp="$LAST_RESPONSE_FILE"
  assert_json_has_keys "$tmp" id || return 1
  rm -f "$tmp"

  info "Checking /api/tree/empty"
  if ! http_request GET /api/tree/empty "" 200 "tree empty"; then
    return 1
  fi
  tmp="$LAST_RESPONSE_FILE"
  assert_json_has_keys "$tmp" id nodes || return 1
  assert_json_predicate "$tmp" "empty tree has zero nodes" '.nodes | type == "array" and length == 0' || true
  rm -f "$tmp"

  info "Checking /api/tree/delay"
  if ! http_request GET /api/tree/delay "" 200 "tree delay"; then
    return 1
  fi
  tmp="$LAST_RESPONSE_FILE"
  assert_json_has_keys "$tmp" id nodes || return 1
  if [ "$BACKEND_MODE" = "mock" ]; then
    assert_json_predicate "$tmp" "delay tree has at least one node" '.nodes | type == "array" and length >= 1' || return 1
  else
    info "Skipping node-count assertion for /api/tree/delay on real backend"
  fi
  rm -f "$tmp"

  return 0
}

probe_error_endpoint() {
  info "Probing /api/tree/error for intentional 500"
  if http_request GET /api/tree/error "" 500 "tree error"; then
    tmp="$LAST_RESPONSE_FILE"
    if [ "$USE_JQ" -eq 1 ] && [ -n "$tmp" ]; then
      assert_json_has_keys "$tmp" error code || true
      assert_json_predicate "$tmp" \
        "tree error returns string error/code" \
        '(.error | type == "string") and (((.code | type) == "string") or ((.code | type) == "number")) and (if has("message") then ((.message | type == "string") or (.message == null)) else true end)' || true
    fi
    [ -n "$tmp" ] && rm -f "$tmp"
  fi
}

run_success_checks || true
if [ "$BACKEND_MODE" = "mock" ]; then
  probe_error_endpoint
else
  info "Skipping /api/tree/error probe for real backend"
fi

if [ "$HAS_FAILURE" -ne 0 ]; then
  info "verify-ui finished with failures"
  exit 1
fi

SKIP_BUILD_VALUE=${SKIP_BUILD:-auto}
SKIP_BUILD_CANON=$(printf '%s' "$SKIP_BUILD_VALUE" | tr '[:upper:]' '[:lower:]')
RUN_BUILD=0
BUILD_REASON=""

case $SKIP_BUILD_CANON in
  1|true|yes)
    BUILD_REASON="SKIP_BUILD=${SKIP_BUILD_VALUE}"
    ;;
  0|false|no)
    RUN_BUILD=1
    BUILD_REASON="SKIP_BUILD override (${SKIP_BUILD_VALUE})"
    ;;
  auto)
    if [ "${RESOLVE_PORT_SOURCE}" = "fallback" ]; then
      RUN_BUILD=1
      BUILD_REASON="fallback port ${FRONTEND_PORT_VALUE} detected (development)"
    else
      BUILD_REASON="default skip on port ${FRONTEND_PORT_VALUE}"
    fi
    ;;
  *)
    BUILD_REASON="unrecognized SKIP_BUILD=${SKIP_BUILD_VALUE}; skipping build"
    ;;
esac

if [ "$RUN_BUILD" -eq 1 ]; then
  info "Running build (${BUILD_REASON})"
  cd "$ROOT_DIR"
  if npm run build >/dev/null; then
    pass "Build completed"
  else
    fail "Build failed"
    exit 1
  fi
else
  info "Skipping build (${BUILD_REASON})"
fi

info "verify-ui complete"
