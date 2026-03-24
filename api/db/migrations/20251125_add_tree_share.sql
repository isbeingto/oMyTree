ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS share_token TEXT NULL,
  ADD COLUMN IF NOT EXISTS share_enabled_at TIMESTAMPTZ NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_trees_share_token
  ON trees(share_token)
  WHERE share_token IS NOT NULL;
