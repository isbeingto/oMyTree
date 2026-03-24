-- T84: File Upload & Evidence Backbone v0
-- Creates evidence_items and node_evidence_links tables for file/url/text evidence storage

BEGIN;

-- evidence_items: stores uploaded file/url/text evidence
CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('url', 'file', 'text')),
  title TEXT NOT NULL,
  summary TEXT,
  source_url TEXT,
  stored_path TEXT,
  text_content TEXT,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_evidence_items_tree_id ON evidence_items(tree_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_type ON evidence_items(type);
CREATE INDEX IF NOT EXISTS idx_evidence_items_created_at ON evidence_items(created_at DESC);

-- node_evidence_links: many-to-many link between nodes and evidence
CREATE TABLE IF NOT EXISTS node_evidence_links (
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (node_id, evidence_id)
);

-- Index for listing evidence attached to a node
CREATE INDEX IF NOT EXISTS idx_node_evidence_links_evidence_id ON node_evidence_links(evidence_id);

COMMIT;
