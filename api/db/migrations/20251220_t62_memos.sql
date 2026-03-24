-- T62: Memos table for Session Memo persistence and relay mechanism
-- Supports incremental updates via based_on_memo_id linking

CREATE TABLE IF NOT EXISTS memos (
  id TEXT PRIMARY KEY,
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  scope_root_node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  from_node_seq INT NOT NULL DEFAULT 0,  -- First node sequence covered
  to_node_seq INT NOT NULL,              -- Last node sequence covered (for delta calc)
  memo_json JSONB NOT NULL,              -- { bullets: [...], coverage: {...} }
  based_on_memo_id TEXT REFERENCES memos(id) ON DELETE SET NULL,
  
  CONSTRAINT memo_id_format CHECK (id ~ '^M_[a-zA-Z0-9]+$')
);

-- Index for efficient latest memo lookup
CREATE INDEX IF NOT EXISTS idx_memos_tree_created ON memos(tree_id, created_at DESC);

-- Index for relay chain traversal
CREATE INDEX IF NOT EXISTS idx_memos_based_on ON memos(based_on_memo_id);

-- Permissions
-- NOTE: Migrations are typically applied by a privileged role. The runtime API role
-- must be able to read/write memos to enable persistence.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE memos TO linzhi;

COMMENT ON TABLE memos IS 'T62: Session memo persistence with incremental relay support';
COMMENT ON COLUMN memos.to_node_seq IS 'Last node sequence covered - used to calculate delta for next memo';
COMMENT ON COLUMN memos.based_on_memo_id IS 'Previous memo this one is based on (relay baton)';
