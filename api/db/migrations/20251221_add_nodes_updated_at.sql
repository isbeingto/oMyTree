-- Add updated_at column to nodes table
-- Required by export service which queries this column

BEGIN;

ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Set updated_at to created_at for existing rows (if needed)
UPDATE nodes SET updated_at = created_at WHERE updated_at = now() AND updated_at != created_at;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at DESC);

COMMIT;
