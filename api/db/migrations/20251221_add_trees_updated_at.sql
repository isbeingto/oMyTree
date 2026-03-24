-- Add updated_at column to trees table
-- Required by export service which queries this column for tree metadata

BEGIN;

ALTER TABLE trees
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Set updated_at to created_at for existing rows  
UPDATE trees SET updated_at = created_at WHERE updated_at = now() AND updated_at != created_at;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_trees_updated_at ON trees(updated_at DESC);

COMMIT;
