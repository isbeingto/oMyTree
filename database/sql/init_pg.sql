BEGIN;

CREATE TABLE IF NOT EXISTS tree_nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  parent_id TEXT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tree_edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL REFERENCES tree_nodes(id) ON DELETE CASCADE,
  target TEXT NOT NULL REFERENCES tree_nodes(id) ON DELETE CASCADE,
  label TEXT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tree_meta (
  key TEXT PRIMARY KEY,
  val JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tree_edges_source_idx ON tree_edges(source);
CREATE INDEX IF NOT EXISTS tree_edges_target_idx ON tree_edges(target);
CREATE INDEX IF NOT EXISTS tree_nodes_parent_idx ON tree_nodes(parent_id);

CREATE TABLE IF NOT EXISTS tree_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NULL,
  nodes JSONB NOT NULL,
  edges JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS tree_snapshots_tree_created_idx ON tree_snapshots(tree, created_at DESC);

COMMIT;
