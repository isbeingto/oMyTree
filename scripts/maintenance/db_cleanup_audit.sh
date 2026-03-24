#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <postgres_dsn> [label]" >&2
  echo "Example: $0 'postgres://user:pass@127.0.0.1:5432/omytree?sslmode=disable' omytree" >&2
  exit 1
fi

DSN="$1"
LABEL="${2:-}"
PSQL=(psql "$DSN" -v ON_ERROR_STOP=1 -P pager=off)

print_header() {
  local title="$1"
  echo ""
  echo "============================================================"
  echo "$title"
  echo "============================================================"
}

print_header "Database Cleanup Audit ${LABEL:+($LABEL)}"

"${PSQL[@]}" -Atqc "
SELECT
  'database=' || current_database() ||
  ', stats_reset=' || COALESCE(stats_reset::text, 'null')
FROM pg_stat_database
WHERE datname = current_database();
"

print_header "Legacy Tree Table Access Snapshot"
"${PSQL[@]}" -c "
WITH legacy(table_name) AS (
  VALUES
    ('tree_nodes'),
    ('tree_edges'),
    ('tree_meta'),
    ('tree_snapshots'),
    ('tree_index'),
    ('tree_node'),
    ('tree_event'),
    ('branch_candidate')
),
legacy_stats AS (
  SELECT
    l.table_name,
    c.oid,
    pg_total_relation_size(c.oid) AS total_bytes,
    st.seq_scan,
    st.idx_scan,
    st.n_tup_ins,
    st.n_tup_upd,
    st.n_tup_del,
    st.n_live_tup
  FROM legacy l
  LEFT JOIN pg_class c
    ON c.relname = l.table_name
   AND c.relnamespace = 'public'::regnamespace
  LEFT JOIN pg_stat_user_tables st
    ON st.relid = c.oid
)
SELECT
  table_name,
  CASE WHEN oid IS NULL THEN 'absent' ELSE 'present' END AS status,
  COALESCE(pg_size_pretty(total_bytes), '0 bytes') AS table_size,
  COALESCE(seq_scan, 0) AS seq_scan,
  COALESCE(idx_scan, 0) AS idx_scan,
  COALESCE(n_tup_ins, 0) AS n_tup_ins,
  COALESCE(n_tup_upd, 0) AS n_tup_upd,
  COALESCE(n_tup_del, 0) AS n_tup_del,
  COALESCE(n_live_tup, 0) AS n_live_tup
FROM legacy_stats
ORDER BY table_name;
"

print_header "Duplicate Index Definitions (Exact Match)"
"${PSQL[@]}" -c "
WITH idx AS (
  SELECT
    i.indexrelid,
    t.relname AS table_name,
    c.relname AS index_name,
    i.indisunique,
    i.indisprimary,
    am.amname AS access_method,
    i.indkey::text AS indkey,
    COALESCE(pg_get_expr(i.indpred, i.indrelid), '') AS predicate,
    COALESCE(pg_get_expr(i.indexprs, i.indrelid), '') AS exprs
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_class t ON t.oid = i.indrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN pg_am am ON am.oid = c.relam
  WHERE n.nspname = 'public'
),
dup AS (
  SELECT
    a.table_name,
    a.index_name AS index_a,
    b.index_name AS index_b,
    a.indisunique AS unique_a,
    b.indisunique AS unique_b,
    a.indisprimary AS primary_a,
    b.indisprimary AS primary_b
  FROM idx a
  JOIN idx b
    ON a.table_name = b.table_name
   AND a.indexrelid < b.indexrelid
   AND a.access_method = b.access_method
   AND a.indkey = b.indkey
   AND a.predicate = b.predicate
   AND a.exprs = b.exprs
)
SELECT
  table_name,
  index_a,
  unique_a,
  primary_a,
  index_b,
  unique_b,
  primary_b
FROM dup
ORDER BY table_name, index_a, index_b;
"

print_header "idx_scan=0 Candidate Indexes (Non-Constraint Only)"
"${PSQL[@]}" -c "
WITH candidates AS (
  SELECT
    t.relname AS table_name,
    i.relname AS index_name,
    s.idx_scan,
    pg_relation_size(i.oid) AS index_bytes,
    st.n_live_tup,
    (st.n_tup_ins + st.n_tup_upd + st.n_tup_del) AS write_ops,
    pg_get_indexdef(i.oid) AS index_def
  FROM pg_stat_user_indexes s
  JOIN pg_index ix ON ix.indexrelid = s.indexrelid
  JOIN pg_class i ON i.oid = s.indexrelid
  JOIN pg_class t ON t.oid = s.relid
  LEFT JOIN pg_stat_user_tables st ON st.relid = t.oid
  LEFT JOIN pg_constraint c ON c.conindid = i.oid
  WHERE s.schemaname = 'public'
    AND s.idx_scan = 0
    AND NOT ix.indisprimary
    AND NOT ix.indisunique
    AND c.oid IS NULL
)
SELECT
  table_name,
  index_name,
  idx_scan,
  pg_size_pretty(index_bytes) AS index_size,
  COALESCE(n_live_tup, 0) AS n_live_tup,
  COALESCE(write_ops, 0) AS write_ops,
  'DROP INDEX CONCURRENTLY IF EXISTS ' || quote_ident(index_name) || ';' AS drop_sql
FROM candidates
ORDER BY index_bytes DESC, table_name, index_name;
"

print_header "Summary"
"${PSQL[@]}" -Atqc "
WITH candidates AS (
  SELECT pg_relation_size(i.oid) AS index_bytes
  FROM pg_stat_user_indexes s
  JOIN pg_index ix ON ix.indexrelid = s.indexrelid
  JOIN pg_class i ON i.oid = s.indexrelid
  LEFT JOIN pg_constraint c ON c.conindid = i.oid
  WHERE s.schemaname = 'public'
    AND s.idx_scan = 0
    AND NOT ix.indisprimary
    AND NOT ix.indisunique
    AND c.oid IS NULL
)
SELECT
  'candidate_count=' || COUNT(*) ||
  ', candidate_total_size=' || COALESCE(pg_size_pretty(SUM(index_bytes)), '0 bytes')
FROM candidates;
"

echo ""
echo "Audit complete."
