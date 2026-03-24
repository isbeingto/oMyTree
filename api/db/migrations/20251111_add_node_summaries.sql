-- T5-2 Lens: node summaries table
CREATE TABLE IF NOT EXISTS node_summaries (
  node_id UUID PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  path_summary TEXT,
  parent_summary TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_node_summaries_updated_at
  ON node_summaries (updated_at DESC);
