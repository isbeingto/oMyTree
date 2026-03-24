-- T90: Draft uploads for new tree genesis UX
-- Allow uploads before a tree exists (tree_id nullable)

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'uploads'
      AND column_name = 'tree_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE uploads
      ALTER COLUMN tree_id DROP NOT NULL;
  END IF;
END $$;

COMMIT;
