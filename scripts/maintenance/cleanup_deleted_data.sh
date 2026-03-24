#!/usr/bin/env bash
# 数据库清理脚本 - T87 Database Cleanup
# 执行前请先备份数据库！

set -euo pipefail

# 获取 PG_DSN
if [[ -z "${PG_DSN:-}" ]]; then
  PG_DSN=$(grep -oP "PG_DSN:\s*['\"]\\K[^'\"]+(?=['\"])" /srv/oMyTree/ecosystem.config.js 2>/dev/null | head -1)
  export PG_DSN
fi

if [[ -z "${PG_DSN:-}" ]]; then
  echo "ERROR: PG_DSN not set"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "T87 DATABASE CLEANUP"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. 清理已删除树的所有关联数据
echo "1. 清理已删除的树及其关联数据..."
echo "   正在删除 deleted 树的 events..."
psql "$PG_DSN" -c "
  DELETE FROM events 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 node_summaries..."
psql "$PG_DSN" -c "
  DELETE FROM node_summaries 
  WHERE node_id IN (
    SELECT n.id FROM nodes n 
    JOIN trees t ON n.tree_id = t.id 
    WHERE t.status = 'deleted'
  )
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 memos..."
psql "$PG_DSN" -c "
  DELETE FROM memos 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 resume_snapshots..."
psql "$PG_DSN" -c "
  DELETE FROM resume_snapshots 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 evidence_items..."
psql "$PG_DSN" -c "
  DELETE FROM evidence_items 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 semantic_ledger_atoms..."
psql "$PG_DSN" -c "
  DELETE FROM semantic_ledger_atoms 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 tree_trail_events..."
psql "$PG_DSN" -c "
  DELETE FROM tree_trail_events 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 process_events..."
psql "$PG_DSN" -c "
  DELETE FROM process_events 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 outcome_drafts..."
psql "$PG_DSN" -c "
  DELETE FROM outcome_drafts 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 llm_error_events..."
psql "$PG_DSN" -c "
  DELETE FROM llm_error_events 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 telemetry_events..."
psql "$PG_DSN" -c "
  DELETE FROM telemetry_events 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 context_debug_logs..."
psql "$PG_DSN" -c "
  DELETE FROM context_debug_logs 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

# turns 通过 nodes 级联删除
echo "   正在删除 deleted 树的 turns (via nodes)..."
psql "$PG_DSN" -c "
  DELETE FROM turns 
  WHERE node_id IN (
    SELECT n.id FROM nodes n 
    JOIN trees t ON n.tree_id = t.id 
    WHERE t.status = 'deleted'
  )
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在删除 deleted 树的 nodes..."
psql "$PG_DSN" -c "
  DELETE FROM nodes 
  WHERE tree_id IN (SELECT id FROM trees WHERE status = 'deleted')
" 2>&1 | grep -E "DELETE|ERROR" || true

echo "   正在永久删除 deleted 状态的 trees..."
psql "$PG_DSN" -c "
  DELETE FROM trees WHERE status = 'deleted'
" 2>&1 | grep -E "DELETE|ERROR" || true

echo ""

# 2. 清理过期的验证 token
echo "2. 清理过期/已用的验证 token..."
psql "$PG_DSN" -c "
  DELETE FROM email_verification_tokens 
  WHERE expires_at < NOW() OR used_at IS NOT NULL
" 2>&1 | grep -E "DELETE|ERROR" || true

psql "$PG_DSN" -c "
  DELETE FROM password_reset_tokens 
  WHERE expires_at < NOW() OR used_at IS NOT NULL
" 2>&1 | grep -E "DELETE|ERROR" || true

echo ""

# 3. VACUUM 回收空间
echo "3. 执行 VACUUM ANALYZE..."
psql "$PG_DSN" -c "VACUUM ANALYZE" 2>&1 | head -5 || true

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "清理完成！"
echo "═══════════════════════════════════════════════════════════"

# 显示清理后的统计
echo ""
echo "清理后统计:"
psql "$PG_DSN" -c "
  SELECT 
    relname AS table_name,
    n_live_tup AS rows
  FROM pg_stat_user_tables
  WHERE n_live_tup > 0
  ORDER BY n_live_tup DESC
  LIMIT 15
"
