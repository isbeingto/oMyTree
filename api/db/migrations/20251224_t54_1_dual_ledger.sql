-- T54-1 Dual Ledger: TreeTrail events, Semantic Ledger atoms, resume snapshots, and anchors (append-only)

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) TreeTrail event stream (append-only)
CREATE TABLE IF NOT EXISTS tree_trail_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL CHECK (actor IN ('user', 'assistant', 'system')),
  type TEXT NOT NULL CHECK (length(type) > 0),
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  turn_id UUID REFERENCES turns(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tree_trail_events_tree_ts_desc ON tree_trail_events(tree_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_tree_trail_events_tree_type_ts_desc ON tree_trail_events(tree_id, type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_tree_trail_events_node_ts_desc ON tree_trail_events(node_id, ts DESC);

-- 2) Semantic Ledger atoms (append-only / versioned)
CREATE TABLE IF NOT EXISTS semantic_ledger_atoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL CHECK (kind IN ('claim', 'open_loop', 'decision', 'rejection', 'evidence_mention', 'note')),
  subkind TEXT NULL CHECK (subkind IS NULL OR subkind IN ('fact', 'inference', 'hypothesis', 'plan', 'question')),
  text TEXT NOT NULL CHECK (length(text) > 0),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence DOUBLE PRECISION,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_semantic_ledger_atoms_tree_ts_desc ON semantic_ledger_atoms(tree_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_semantic_ledger_atoms_sources_gin ON semantic_ledger_atoms USING GIN (sources);
CREATE INDEX IF NOT EXISTS idx_semantic_ledger_atoms_tree_kind_ts_desc ON semantic_ledger_atoms(tree_id, kind, ts DESC);

-- 3) Resume snapshots (immutable versions)
CREATE TABLE IF NOT EXISTS resume_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  scope_node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode TEXT NOT NULL CHECK (mode IN ('incremental', 'full')),
  based_on_snapshot_id UUID NULL REFERENCES resume_snapshots(id) ON DELETE SET NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  diary TEXT,
  pinned BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_resume_snapshots_tree_ts_desc ON resume_snapshots(tree_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_resume_snapshots_tree_pinned_ts_desc ON resume_snapshots(tree_id, pinned DESC, ts DESC);
CREATE INDEX IF NOT EXISTS idx_resume_snapshots_tree_scope_ts_desc ON resume_snapshots(tree_id, scope_node_id, ts DESC);

-- 4) Snapshot anchors (flagging nodes with snapshot markers)
CREATE TABLE IF NOT EXISTS snapshot_anchors (
  snapshot_id UUID NOT NULL REFERENCES resume_snapshots(id) ON DELETE CASCADE,
  anchor_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, anchor_node_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_anchors_anchor_node ON snapshot_anchors(anchor_node_id);

COMMIT;
