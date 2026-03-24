-- P0: Rolling Summary storage (Context v4)
-- Adds node_summaries.rolling_summary JSONB for long-path context compression.

BEGIN;

ALTER TABLE node_summaries
  ADD COLUMN IF NOT EXISTS rolling_summary JSONB NULL;

COMMENT ON COLUMN node_summaries.rolling_summary IS
  'P0: Rolling summary JSON payload for context window compression (e.g., {text, meta:{last_node_id, compressed_turn_count,...}}).';

COMMIT;

