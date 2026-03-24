-- T15-6 Tree ownership hardening
-- Ensure every tree row belongs to a concrete user and backfill demo ownership.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure the column exists (older environments may miss it)
DO $$
BEGIN
  IF to_regclass('trees') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_attribute
      WHERE attrelid = to_regclass('trees')
        AND attname = 'user_id'
        AND NOT attisdropped
    ) THEN
      ALTER TABLE trees
        ADD COLUMN user_id uuid;
    END IF;
  END IF;
END
$$;

-- Ensure demo user exists and capture its id, migrating legacy demo trees.
DO $$
DECLARE
  demo_id uuid;
  legacy_demo_id uuid;
BEGIN
  INSERT INTO users (name, email)
  VALUES ('Demo User', 'demo@omytree.local')
  ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW()
  RETURNING id INTO demo_id;

  SELECT id INTO legacy_demo_id
  FROM users
  WHERE email = 'demo_guest@omytree.local'
  LIMIT 1;

  UPDATE trees
  SET user_id = demo_id
  WHERE user_id IS NULL
     OR (legacy_demo_id IS NOT NULL AND user_id = legacy_demo_id);
END
$$;

-- Backfill any rows referencing non-existing users to demo as a safety net.
WITH orphaned AS (
  SELECT t.id
  FROM trees t
  LEFT JOIN users u ON u.id = t.user_id
  WHERE u.id IS NULL
)
UPDATE trees t
SET user_id = (
  SELECT id FROM users WHERE email = 'demo@omytree.local' LIMIT 1
)
WHERE t.id IN (SELECT id FROM orphaned);

ALTER TABLE trees
  DROP CONSTRAINT IF EXISTS trees_user_id_fkey;

ALTER TABLE trees
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE trees
  ADD CONSTRAINT trees_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_trees_user_id ON trees(user_id);

COMMIT;
