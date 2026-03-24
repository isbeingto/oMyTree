-- T35-3: Tree summary observability (error fields)

BEGIN;

ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS tree_summary_last_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS tree_summary_last_error_at TIMESTAMPTZ NULL;

COMMIT;
