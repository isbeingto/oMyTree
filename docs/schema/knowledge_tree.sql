CREATE TABLE IF NOT EXISTS knowledge_tree (
  id BIGSERIAL PRIMARY KEY,
  parent_id BIGINT REFERENCES knowledge_tree(id) ON DELETE SET NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_tree_parent ON knowledge_tree(parent_id);
