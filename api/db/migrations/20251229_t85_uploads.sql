-- T85: Text Upload v0 — PostgreSQL bytea storage for text files
-- Creates uploads table for storing file content directly in database

BEGIN;

-- uploads: stores uploaded text files with bytea content
CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tree_id UUID NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  turn_id UUID REFERENCES turns(id) ON DELETE SET NULL,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  
  -- File metadata
  file_name TEXT NOT NULL,
  ext TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  
  -- File content (stored as bytea)
  content_bytes BYTEA NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_uploads_tree_created ON uploads(tree_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_sha256 ON uploads(sha256);
CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);

-- Turn-uploads join table for associating uploads with turns
CREATE TABLE IF NOT EXISTS turn_uploads (
  turn_id UUID NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (turn_id, upload_id)
);

-- Index for listing uploads attached to a turn
CREATE INDEX IF NOT EXISTS idx_turn_uploads_upload_id ON turn_uploads(upload_id);

COMMIT;
