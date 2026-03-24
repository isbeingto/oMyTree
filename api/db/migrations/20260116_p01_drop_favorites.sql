-- 20260116_p01_drop_favorites.sql
-- Phase C: Remove favorites table from schema

BEGIN;

-- Drop favorites table (and any dependent views/constraints) if present.
DROP TABLE IF EXISTS favorites CASCADE;

COMMIT;
