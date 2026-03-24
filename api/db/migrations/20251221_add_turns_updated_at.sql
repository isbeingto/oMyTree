-- Add updated_at column to turns table
-- Required by export service which queries this column for turn metadata

BEGIN;

ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Set updated_at to created_at for existing rows  
UPDATE turns SET updated_at = created_at WHERE updated_at = now() AND updated_at != created_at;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_turns_updated_at ON turns(updated_at DESC);

COMMIT;
