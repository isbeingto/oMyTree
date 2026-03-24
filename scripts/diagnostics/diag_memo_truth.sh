#!/bin/bash
# =============================================================================
# T83 Memo System Diagnostic Script
# diag_memo_truth.sh - 验证 Memo 系统 UI↔API↔DB 一致性
#
# 用法:
#   export TREE_ID="<your-tree-id>"      # 必需
#   export BASE_URL="http://localhost:3000"  # 可选，默认 localhost:3000
#   export SESSION_COOKIE="next-auth.session-token=..."  # 可选，用于认证
#   bash tools/scripts/diagnose/diag_memo_truth.sh
#
# 创建日期: 2025-01-XX
# 任务卡: T83
# =============================================================================

set -euo pipefail

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
BASE_URL="${BASE_URL:-http://localhost:3000}"
API_BASE="${BASE_URL}/api"
TREE_ID="${TREE_ID:-}"
SESSION_COOKIE="${SESSION_COOKIE:-}"

# 检查必需参数
if [[ -z "$TREE_ID" ]]; then
    echo -e "${RED}ERROR: TREE_ID is required${NC}"
    echo "Usage: export TREE_ID=<tree-id> && bash $0"
    exit 1
fi

echo "=============================================="
echo "T83 Memo System Diagnostic"
echo "=============================================="
echo -e "Base URL: ${BLUE}${BASE_URL}${NC}"
echo -e "Tree ID:  ${BLUE}${TREE_ID}${NC}"
echo "=============================================="
echo ""

# 构建 curl 参数
CURL_OPTS="-s"
if [[ -n "$SESSION_COOKIE" ]]; then
    CURL_OPTS="$CURL_OPTS -H \"Cookie: $SESSION_COOKIE\""
fi

# ============================================
# Test 1: GET /api/memo/latest
# ============================================
echo -e "${YELLOW}[1] Testing GET /api/memo/latest${NC}"
LATEST_RESPONSE=$(curl -s "${API_BASE}/memo/latest?tree_id=${TREE_ID}")

if echo "$LATEST_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: $(echo "$LATEST_RESPONSE" | jq -r '.error')${NC}"
else
    echo -e "${GREEN}✓ Response received${NC}"
    
    # 提取关键字段
    HAS_MEMO=$(echo "$LATEST_RESPONSE" | jq -r '.memo != null')
    CURRENT_MAX=$(echo "$LATEST_RESPONSE" | jq -r '.meta.current_max_node_seq // "N/A"')
    MEMO_TO_SEQ=$(echo "$LATEST_RESPONSE" | jq -r '.meta.memo_to_node_seq // "N/A"')
    IS_OUTDATED=$(echo "$LATEST_RESPONSE" | jq -r '.meta.is_outdated // "N/A"')
    
    echo "  - has_memo: $HAS_MEMO"
    echo "  - current_max_node_seq: $CURRENT_MAX"
    echo "  - memo_to_node_seq: $MEMO_TO_SEQ"
    echo "  - is_outdated: $IS_OUTDATED"
    
    # 检测 is_outdated 逻辑 bug
    if [[ "$HAS_MEMO" == "true" && "$CURRENT_MAX" != "N/A" && "$MEMO_TO_SEQ" != "N/A" ]]; then
        if [[ "$CURRENT_MAX" -lt "$MEMO_TO_SEQ" && "$IS_OUTDATED" == "false" ]]; then
            echo -e "  ${YELLOW}⚠ BUG DETECTED: current_max_node_seq ($CURRENT_MAX) < memo_to_node_seq ($MEMO_TO_SEQ) but is_outdated=false${NC}"
            echo -e "  ${YELLOW}  This indicates the metrics use different counting methods${NC}"
        fi
    fi
fi
echo ""

# ============================================
# Test 2: GET /api/memo/history
# ============================================
echo -e "${YELLOW}[2] Testing GET /api/memo/history${NC}"
HISTORY_RESPONSE=$(curl -s "${API_BASE}/memo/history?tree_id=${TREE_ID}&limit=10")

if echo "$HISTORY_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
    echo -e "${RED}✗ Error: $(echo "$HISTORY_RESPONSE" | jq -r '.error')${NC}"
else
    echo -e "${GREEN}✓ Response received${NC}"
    
    HISTORY_COUNT=$(echo "$HISTORY_RESPONSE" | jq -r '.history | length')
    echo "  - history count: $HISTORY_COUNT"
    
    # 检查 based_on_memo_id 链
    CHAIN_BROKEN=true
    if [[ "$HISTORY_COUNT" -gt 0 ]]; then
        LINKED_COUNT=$(echo "$HISTORY_RESPONSE" | jq '[.history[] | select(.based_on_memo_id != null)] | length')
        echo "  - memos with based_on_memo_id: $LINKED_COUNT / $HISTORY_COUNT"
        
        if [[ "$LINKED_COUNT" -eq 0 ]]; then
            echo -e "  ${YELLOW}⚠ CHAIN BROKEN: All memos have null based_on_memo_id${NC}"
        else
            CHAIN_BROKEN=false
        fi
    fi
fi
echo ""

# ============================================
# Test 3: Sessions API (check for 404)
# ============================================
echo -e "${YELLOW}[3] Testing GET /api/process/sessions (Sessions API)${NC}"
SESSIONS_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_BASE}/process/sessions?tree_id=${TREE_ID}")
SESSIONS_STATUS=$(echo "$SESSIONS_RESPONSE" | tail -1)
SESSIONS_BODY=$(echo "$SESSIONS_RESPONSE" | sed '$d')

if [[ "$SESSIONS_STATUS" == "404" ]]; then
    echo -e "${RED}✗ 404 Not Found - Missing rewrite in next.config.mjs${NC}"
    echo -e "  ${YELLOW}⚠ BUG: /api/process/:path* rewrite is missing${NC}"
elif [[ "$SESSIONS_STATUS" == "200" ]]; then
    echo -e "${GREEN}✓ 200 OK${NC}"
    echo "  Response length: $(echo "$SESSIONS_BODY" | wc -c) bytes"
else
    echo -e "${YELLOW}? Status: $SESSIONS_STATUS${NC}"
fi
echo ""

# ============================================
# Test 4: Check Memo Chain via DB (if psql available)
# ============================================
echo -e "${YELLOW}[4] Checking Memo chain in database${NC}"
if command -v psql &> /dev/null; then
    PG_DSN="${PG_DSN:-}"
    if [[ -n "$PG_DSN" ]]; then
        echo "  Querying memos table..."
        DB_RESULT=$(psql "$PG_DSN" -t -c "SELECT id, to_node_seq, based_on_memo_id FROM memos WHERE tree_id = '${TREE_ID}' ORDER BY created_at DESC LIMIT 5;" 2>/dev/null || echo "QUERY_FAILED")
        
        if [[ "$DB_RESULT" != "QUERY_FAILED" ]]; then
            echo -e "${GREEN}✓ DB query successful${NC}"
            echo "$DB_RESULT" | head -10
        else
            echo -e "${YELLOW}? DB query failed (check PG_DSN)${NC}"
        fi
    else
        echo "  PG_DSN not set, skipping DB check"
    fi
else
    echo "  psql not available, skipping DB check"
fi
echo ""

# ============================================
# Summary
# ============================================
echo "=============================================="
echo "DIAGNOSTIC SUMMARY"
echo "=============================================="

echo ""
echo "Key Metrics from /api/memo/latest:"
echo "  - current_max_node_seq: COUNT(*) of user-role nodes only"
echo "  - memo_to_node_seq: branchNodes.length (all nodes in path)"
echo "  - is_outdated formula: current_max_node_seq > memo_to_node_seq"
echo ""

echo "Known Issues Detected:"
echo "  1. [is_outdated] Uses mismatched metrics → always shows '已是最新'"
echo "  2. [Chain] based_on_memo_id not written (missing link_to_previous param)"
echo "  3. [Sessions] /api/process/sessions may return 404 (missing rewrite)"
echo ""

echo "See /docs/audit/memo_truth_map_v1.md for full analysis"
echo "=============================================="
