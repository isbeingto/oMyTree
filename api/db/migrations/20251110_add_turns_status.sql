-- Ensure turns table includes status column for pending/completed/failed tracking
ALTER TABLE IF EXISTS turns
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

ALTER TABLE IF EXISTS turns
  ALTER COLUMN status SET DEFAULT 'completed';

DO $$
BEGIN
  IF to_regclass('turns') IS NOT NULL THEN
    UPDATE turns
       SET status = 'completed'
     WHERE status IS NULL
        OR status NOT IN ('pending', 'completed', 'failed');
  END IF;
END
$$;
