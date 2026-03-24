-- T58-3: Evidence Attachment 1.0
-- Create evidence_items and node_evidence_links tables

-- Evidence items table (URL, file, or text evidence)
CREATE TABLE IF NOT EXISTS evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  
  -- Evidence type: 'url', 'file', or 'text'
  type VARCHAR(20) NOT NULL CHECK (type IN ('url', 'file', 'text')),
  
  -- Metadata
  title VARCHAR(500) NOT NULL,
  summary TEXT,
  
  -- Type-specific fields
  source_url TEXT,           -- For type='url': the URL
  stored_path TEXT,          -- For type='file': relative path in data/evidence_uploads/
  text_content TEXT,         -- For type='text': the actual text content
  
  -- File metadata (for type='file')
  file_name VARCHAR(500),
  file_size BIGINT,
  mime_type VARCHAR(200),
  
  -- Tags for categorization
  tags TEXT[],
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT url_evidence_has_url CHECK (type != 'url' OR source_url IS NOT NULL),
  CONSTRAINT file_evidence_has_path CHECK (type != 'file' OR stored_path IS NOT NULL),
  CONSTRAINT text_evidence_has_content CHECK (type != 'text' OR text_content IS NOT NULL)
);

-- Node-evidence link table (many-to-many)
CREATE TABLE IF NOT EXISTS node_evidence_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  evidence_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  
  -- When this evidence was attached to this node
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate links
  UNIQUE(node_id, evidence_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_evidence_items_tree_id ON evidence_items(tree_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_type ON evidence_items(type);
CREATE INDEX IF NOT EXISTS idx_evidence_items_created_at ON evidence_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_items_tags ON evidence_items USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_node_evidence_links_node_id ON node_evidence_links(node_id);
CREATE INDEX IF NOT EXISTS idx_node_evidence_links_evidence_id ON node_evidence_links(evidence_id);
CREATE INDEX IF NOT EXISTS idx_node_evidence_links_created_at ON node_evidence_links(created_at DESC);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_evidence_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_items_updated_at
  BEFORE UPDATE ON evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION update_evidence_items_updated_at();
