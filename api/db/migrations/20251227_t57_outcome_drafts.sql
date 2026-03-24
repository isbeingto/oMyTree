-- T57-1: Outcome drafts (outline + evidence gaps) derived from resume snapshots

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS outcome_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES resume_snapshots(id) ON DELETE CASCADE,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('decision', 'brief', 'report')),
  outline_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  gap_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, outcome_type)
);

CREATE INDEX IF NOT EXISTS idx_outcome_drafts_tree ON outcome_drafts(tree_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcome_drafts_snapshot ON outcome_drafts(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_outcome_drafts_type ON outcome_drafts(outcome_type);

COMMIT;
