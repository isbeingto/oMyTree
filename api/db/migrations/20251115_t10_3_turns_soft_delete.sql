-- T10-3 Tree Rollback: add soft delete support for turns

-- Ensure turns table includes status column for pending/completed/failed tracking.
-- This makes the migration sequence robust when applied from an empty database.
ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE turns
  ALTER COLUMN status SET DEFAULT 'completed';

ALTER TABLE turns
  ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ NULL;

-- Index to quickly scan active turns ordered by creation time
CREATE INDEX IF NOT EXISTS idx_turns_created_active
  ON turns (created_at DESC)
  WHERE soft_deleted_at IS NULL;

-- Ensure pending-turn lookups remain fast when filtering by status + activity
CREATE INDEX IF NOT EXISTS idx_turns_status_active
  ON turns (status)
  WHERE soft_deleted_at IS NULL;
