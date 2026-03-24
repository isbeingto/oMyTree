-- P2: Branch Summary storage (Context v4)
-- Adds:
-- - branch_summaries: per-branch structured summaries (JSONB) + searchable text
-- - branch_references: audit trail of cross-branch references (explicit/semantic/manual)

BEGIN;

CREATE TABLE IF NOT EXISTS branch_summaries (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tree_id            UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  branch_id          TEXT NOT NULL,
  branch_root_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  branch_tip_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  summary            JSONB NOT NULL,
  summary_text       TEXT NOT NULL,
  node_count         INTEGER NOT NULL DEFAULT 0,
  total_tokens       INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  summarized_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uniqueness: one "current" summary row per (tree_id, branch_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_branch_summaries_tree_branch
  ON branch_summaries(tree_id, branch_id);

CREATE INDEX IF NOT EXISTS idx_branch_summaries_tree_id
  ON branch_summaries(tree_id);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_branch_root
  ON branch_summaries(branch_root_node_id);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_branch_tip
  ON branch_summaries(branch_tip_node_id);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_updated_at
  ON branch_summaries(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_branch_summaries_summary_gin
  ON branch_summaries USING gin(summary);

COMMENT ON TABLE branch_summaries IS
  'P2: Branch-level conversation summaries (structured JSON + plain text).';
COMMENT ON COLUMN branch_summaries.branch_id IS
  'Unique identifier for the branch thread segment (e.g., \"branch-<root>-to-<tip>\").';
COMMENT ON COLUMN branch_summaries.summary IS
  'Structured summary payload (e.g., {overview,key_points,conclusions,open_questions}).';
COMMENT ON COLUMN branch_summaries.summary_text IS
  'Plain text summary for semantic matching and quick display.';

CREATE TABLE IF NOT EXISTS branch_references (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tree_id              UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  source_node_id       UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  source_branch_id     TEXT NOT NULL,
  referenced_branch_id TEXT NOT NULL,
  reference_type       TEXT NOT NULL,
  confidence_score     DOUBLE PRECISION NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_references_source_node
  ON branch_references(source_node_id);
CREATE INDEX IF NOT EXISTS idx_branch_references_tree_id
  ON branch_references(tree_id);
CREATE INDEX IF NOT EXISTS idx_branch_references_created_at
  ON branch_references(created_at DESC);

COMMENT ON TABLE branch_references IS
  'P2: Track cross-branch reference patterns (explicit/semantic/manual).';
COMMENT ON COLUMN branch_references.reference_type IS
  'explicit: user mention; semantic: detected by similarity; manual: user selected.';

COMMIT;

