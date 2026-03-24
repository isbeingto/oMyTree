-- T33-1: Context controls baseline fields
-- Adds user-level flag + tree-level context profile/memory scope + optional tree summary

BEGIN;

-- 1) Users: advanced context toggle (default off)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS enable_advanced_context BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Trees: context profile + memory scope + optional tree-level summary
ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS context_profile TEXT NOT NULL DEFAULT 'lite',
  ADD COLUMN IF NOT EXISTS memory_scope TEXT NOT NULL DEFAULT 'branch',
  ADD COLUMN IF NOT EXISTS tree_summary JSONB NULL;

-- Enforce allowed enum-like values for context_profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_trees_context_profile'
      AND conrelid = 'trees'::regclass
  ) THEN
    ALTER TABLE trees
      ADD CONSTRAINT chk_trees_context_profile
      CHECK (context_profile IN ('lite', 'standard', 'max'));
  END IF;
END$$;

-- Enforce allowed enum-like values for memory_scope
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_trees_memory_scope'
      AND conrelid = 'trees'::regclass
  ) THEN
    ALTER TABLE trees
      ADD CONSTRAINT chk_trees_memory_scope
      CHECK (memory_scope IN ('branch', 'tree'));
  END IF;
END$$;

COMMIT;
