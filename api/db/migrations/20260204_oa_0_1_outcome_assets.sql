-- 20260204_oa_0_1_outcome_assets.sql
-- OA-0.1: Outcome asset mapping + workspace outcome_kb_id
--
-- Purpose:
-- - Persist a stable mapping between Layer2 outcomes and Layer3 (WeKnora) documents
-- - Store a workspace-scoped "Outcome Assets" Knowledge Base id for auto-reuse

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- workspaces.outcome_kb_id (nullable)
DO $$
BEGIN
  IF to_regclass('workspaces') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = to_regclass('workspaces')
        AND attname = 'outcome_kb_id'
        AND NOT attisdropped
    ) THEN
      ALTER TABLE workspaces
        ADD COLUMN outcome_kb_id TEXT NULL;
    END IF;
  END IF;
END
$$;

-- outcome_assets: mapping (workspace_id, outcome_id) -> (knowledge_base_id, document_id)
CREATE TABLE IF NOT EXISTS outcome_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  outcome_id UUID NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,

  knowledge_base_id TEXT NOT NULL,
  document_id TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, outcome_id)
);

CREATE INDEX IF NOT EXISTS idx_outcome_assets_workspace_id
  ON outcome_assets(workspace_id);

CREATE INDEX IF NOT EXISTS idx_outcome_assets_tree_id_created_at
  ON outcome_assets(tree_id, created_at DESC);

COMMIT;

