-- T31-0: Daily LLM usage aggregation + tree counters
-- - Adds model column to llm_usage_events for richer auditing
-- - Creates llm_usage_daily rollup table
-- - Adds node_count / branch_count to trees with backfill

BEGIN;

-- 1) Enrich raw usage events with model (nullable for legacy rows)
ALTER TABLE llm_usage_events
  ADD COLUMN IF NOT EXISTS model TEXT;

-- 2) Daily aggregation table (per user / provider / model / BYOK flag)
CREATE TABLE IF NOT EXISTS llm_usage_daily (
  usage_date     DATE        NOT NULL,
  user_id        UUID        NOT NULL,
  provider       TEXT        NOT NULL,
  is_byok        BOOLEAN     NOT NULL DEFAULT FALSE,
  model          TEXT        NOT NULL,
  requests       INTEGER     NOT NULL DEFAULT 0,
  tokens_input   INTEGER     NOT NULL DEFAULT 0,
  tokens_output  INTEGER     NOT NULL DEFAULT 0,
  tokens_total   INTEGER     NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usage_date, user_id, provider, is_byok, model)
);

-- Backfill historical daily aggregates from existing events
INSERT INTO llm_usage_daily (
  usage_date, user_id, provider, is_byok, model,
  requests, tokens_input, tokens_output, tokens_total
)
SELECT
  DATE(created_at) AS usage_date,
  user_id,
  provider,
  is_byok,
  COALESCE(NULLIF(model, ''), 'unknown') AS model,
  COUNT(*) AS requests,
  COALESCE(SUM(tokens_input), 0) AS tokens_input,
  COALESCE(SUM(tokens_output), 0) AS tokens_output,
  COALESCE(SUM(tokens_input), 0) + COALESCE(SUM(tokens_output), 0) AS tokens_total
FROM llm_usage_events
GROUP BY DATE(created_at), user_id, provider, is_byok, COALESCE(NULLIF(model, ''), 'unknown')
ON CONFLICT (usage_date, user_id, provider, is_byok, model)
DO UPDATE SET
  requests      = llm_usage_daily.requests + EXCLUDED.requests,
  tokens_input  = llm_usage_daily.tokens_input  + EXCLUDED.tokens_input,
  tokens_output = llm_usage_daily.tokens_output + EXCLUDED.tokens_output,
  tokens_total  = llm_usage_daily.tokens_total + EXCLUDED.tokens_total,
  updated_at    = now();

-- 3) Tree counters: total nodes + leaf-as-branch approximation
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS node_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS branch_count INTEGER NOT NULL DEFAULT 0;

-- Backfill counters from existing active nodes
WITH active_nodes AS (
  SELECT id, tree_id, parent_id
  FROM nodes
  WHERE soft_deleted_at IS NULL
),
node_counts AS (
  SELECT tree_id, COUNT(*)::INTEGER AS node_count
  FROM active_nodes
  GROUP BY tree_id
),
leaf_counts AS (
  SELECT an.tree_id, COUNT(*)::INTEGER AS branch_count
  FROM active_nodes an
  LEFT JOIN active_nodes c ON c.parent_id = an.id
  WHERE c.id IS NULL
  GROUP BY an.tree_id
),
merged AS (
  SELECT
    COALESCE(n.tree_id, l.tree_id) AS tree_id,
    COALESCE(n.node_count, 0) AS node_count,
    COALESCE(l.branch_count, 0) AS branch_count
  FROM node_counts n
  FULL OUTER JOIN leaf_counts l ON l.tree_id = n.tree_id
)
UPDATE trees t
SET
  node_count = COALESCE(m.node_count, 0),
  branch_count = COALESCE(m.branch_count, 0)
FROM merged m
WHERE t.id = m.tree_id;

COMMIT;
