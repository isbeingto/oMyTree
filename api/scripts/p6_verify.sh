#!/usr/bin/env bash
set -euo pipefail

API_BASE=${API_BASE:-"http://127.0.0.1:8000"}
TRACE_ID=${TRACE_ID:-"trace-$(date +%s%N)"}
JQ=${JQ:-jq}

if ! command -v "$JQ" >/dev/null 2>&1; then
  echo "jq is required for verification (set JQ=/path/to/jq to override)." >&2
  exit 1
fi

SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
API_DIR="$(cd -- "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd -P)"
AUDIT_FILE=${AUDIT_FILE:-"$API_DIR/logs/audit.ndjson"}

GREEN="\033[32m"
RED="\033[31m"
BOLD="\033[1m"
RESET="\033[0m"

sanitized_trace=${TRACE_ID//[^a-zA-Z0-9]/}
if [[ -z "$sanitized_trace" ]]; then
  sanitized_trace="p6"
fi
sanitized_trace=${sanitized_trace:0:32}
TREE_ID=${TREE_ID:-"p6-${sanitized_trace}"}
LAST_NODE=${LAST_NODE:-"root"}

REQ_STATUS=""
REQ_BODY=""

info_step() {
  local message=$1
  echo -e "${BOLD}$message${RESET}"
}

pass_step() {
  local message=$1
  echo -e "${GREEN}PASS${RESET} $message"
}

fail_step() {
  local message=$1
  local status=${2:-$REQ_STATUS}
  local body=${3:-$REQ_BODY}
  echo -e "${RED}FAIL${RESET} $message" >&2
  echo "Status: $status" >&2
  if [[ -n "$body" ]]; then
    echo "Response:" >&2
    echo "$body" >&2
  fi
  exit 1
}

request() {
  local method=$1
  local path=$2
  local payload=${3:-""}
  local response

  if [[ -n "$payload" ]]; then
    response=$(curl -sS -X "$method" \
      -H "Content-Type: application/json" \
      -H "X-Trace-Id: $TRACE_ID" \
      --data "$payload" \
      "$API_BASE$path" \
      -w '\n%{http_code}')
  else
    response=$(curl -sS -X "$method" \
      -H "Content-Type: application/json" \
      -H "X-Trace-Id: $TRACE_ID" \
      "$API_BASE$path" \
      -w '\n%{http_code}')
  fi

  REQ_STATUS=${response##*$'\n'}
  REQ_BODY=${response%$'\n'$REQ_STATUS}
}

assert_status() {
  local expected=$1
  if [[ "$REQ_STATUS" != "$expected" ]]; then
    fail_step "Expected HTTP $expected" "$REQ_STATUS"
  fi
}

assert_jq() {
  local expr=$1
  local description=$2
  shift 2
  local jq_args=()
  while [[ $# -gt 0 ]]; do
    jq_args+=("$1")
    shift
  done
  if ! echo "$REQ_BODY" | "$JQ" -e "${jq_args[@]}" "$expr" >/dev/null; then
    fail_step "$description"
  fi
}

assert_equals() {
  local expr=$1
  local expected=$2
  local description=$3
  if ! echo "$REQ_BODY" | "$JQ" -e --arg expected "$expected" "$expr == \$expected" >/dev/null; then
    fail_step "$description"
  fi
}

extract_jq() {
  local expr=$1
  echo "$REQ_BODY" | "$JQ" -r "$expr"
}

info_step "P6 verification against $API_BASE (tree: $TREE_ID, trace: $TRACE_ID)"

info_step "→ /api/branch/suggest"
suggest_payload=$(printf '{"conversation":"%s","last_node":"%s"}' "$TREE_ID" "$LAST_NODE")
request POST "/api/branch/suggest" "$suggest_payload"
assert_status 200
assert_equals '.trace_id' "$TRACE_ID" "branch/suggest response must echo trace id from routes/branch.js"
assert_jq '.candidates | length == 1' "branch/suggest must return exactly one candidate"
assert_jq '.candidates[0].id | type == "string" and startswith("cand_")' "candidate id must start with cand_ per routes/branch.js"
assert_equals '.candidates[0].parent_id' "$LAST_NODE" "candidate parent must match provided last_node"
assert_equals '.candidates[0].title' "Follow-up for $LAST_NODE" "candidate title must match generator in routes/branch.js"
assert_jq '.candidates[0].summary == null' "candidate summary must be null"
assert_equals '.candidates[0].status' "candidate" "candidate status must be candidate"
assert_jq '.candidates[0].source.ai_confidence == null and .candidates[0].source.reason == null' "candidate source must expose null ai_confidence and reason"
pass_step "/api/branch/suggest contract verified"
CANDIDATE_ID=$(extract_jq '.candidates[0].id')

info_step "→ /api/branch/confirm (accept)"
confirm_payload=$(printf '{"candidate_id":"%s","action":"accept"}' "$CANDIDATE_ID")
request POST "/api/branch/confirm" "$confirm_payload"
assert_status 200
assert_equals '.trace_id' "$TRACE_ID" "branch/confirm must echo trace id"
assert_jq '.ok == true' "branch/confirm must return ok:true"
assert_jq '.new_node.id | type == "string" and startswith("node_")' "branch/confirm must create node_* id"
assert_equals '.new_node.parent_id' "$LAST_NODE" "confirmed node parent must match candidate"
assert_equals '.new_node.title' "Follow-up for $LAST_NODE" "confirmed node title must match candidate"
assert_equals '.new_node.status' "confirmed" "confirmed node status must be confirmed"
pass_step "/api/branch/confirm accept contract verified"
NEW_NODE_ID=$(extract_jq '.new_node.id')

info_step "→ /api/branch/confirm (idempotent accept)"
request POST "/api/branch/confirm" "$confirm_payload"
assert_status 200
assert_equals '.trace_id' "$TRACE_ID" "idempotent confirm must echo trace id"
assert_jq '.ok == true' "idempotent confirm must return ok:true"
assert_equals '.new_node.id' "$NEW_NODE_ID" "idempotent confirm must return same node id"
assert_equals '.new_node.parent_id' "$LAST_NODE" "idempotent confirm must keep parent"
assert_equals '.new_node.status' "confirmed" "idempotent confirm must keep status"
assert_equals '.new_node.title' "Follow-up for $LAST_NODE" "idempotent confirm must keep title"
pass_step "/api/branch/confirm idempotency verified"

audit_count() {
  if [[ -f "$AUDIT_FILE" ]]; then
    "$JQ" -s --arg tree "$TREE_ID" '[ .[] | select(.type == "events.replay" and .tree_id == $tree) ] | length' "$AUDIT_FILE"
  else
    echo 0
  fi
}

info_step "→ /api/events/replay"
audit_before=$(audit_count)
replay_payload=$(printf '{"treeId":"%s","to":"head"}' "$TREE_ID")
request POST "/api/events/replay" "$replay_payload"
audit_after=$(audit_count)
assert_status 200
assert_equals '.trace_id' "$TRACE_ID" "events/replay must echo trace id"
assert_jq '.ok == true' "events/replay must report ok:true"
assert_jq 'has("reverted_to")' "events/replay must include reverted_to field"
if (( audit_after <= audit_before )); then
  fail_step "events.replay must append audit log entry" "$REQ_STATUS" "$REQ_BODY"
fi
pass_step "/api/events/replay contract and audit verified"

info_step "→ /api/tree/$TREE_ID"
request GET "/api/tree/$TREE_ID"
assert_status 200
assert_equals '.trace_id' "$TRACE_ID" "tree response must echo trace id"
assert_equals '.id' "$TREE_ID" "tree id must match"
assert_jq '.nodes | type == "array" and length >= 1' "tree must return nodes array"
assert_jq '.nodes | map(select(.id == $node and .parent_id == $parent and .status == "confirmed" and .title == $title)) | length == 1' "tree must include confirmed node with expected fields" --arg node "$NEW_NODE_ID" --arg parent "$LAST_NODE" --arg title "Follow-up for $LAST_NODE"
assert_jq '.nodes | all(has("parent_id") and has("title") and has("summary") and has("status") and has("updated_at"))' "tree nodes must expose required fields"
pass_step "/api/tree contract verified"

info_step "→ /api/branch/confirm (error envelope)"
error_payload='{"candidate_id":"","action":"invalid"}'
request POST "/api/branch/confirm" "$error_payload"
assert_status 400
assert_jq '(keys | sort) == ["code","detail","error","hint"]' "error envelope must include {error,code,hint,detail}"
assert_jq '(.error|type=="string") and (.code|type=="string") and (.hint|type=="string") and ((.detail==null) or (.detail|type=="string"))' "error envelope fields must be strings with optional detail"
assert_equals '.error' "candidate_id is required" "error message must match routes/branch.js"
assert_equals '.code' "invalid_candidate" "error code must match routes/branch.js"
assert_equals '.hint' "Provide the candidate identifier returned from suggest" "error hint must match routes/branch.js"
pass_step "Error envelope contract verified"

echo -e "${GREEN}✔ P6 verification complete.${RESET}"
