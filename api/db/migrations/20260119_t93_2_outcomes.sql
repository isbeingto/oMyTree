-- T93-2: Outcomes (Layer2) anchored to a node

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  anchor_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,

  title TEXT,
  conclusion TEXT,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  derived_from_outcome_id UUID REFERENCES outcomes(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN ('generating', 'generated', 'edited')),

  prompt_version TEXT,
  generation_input JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, tree_id, anchor_node_id)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_tree_created_at
  ON outcomes(tree_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_user_created_at
  ON outcomes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_created_at
  ON outcomes(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outcomes_derived_from_outcome
  ON outcomes(derived_from_outcome_id)
  WHERE derived_from_outcome_id IS NOT NULL;

COMMIT;
