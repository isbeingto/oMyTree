-- T31-2: Add registration_country for coarse user geo insight
-- - Adds nullable registration_country column on users
-- - Indexes the column to speed up admin aggregation

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_country TEXT;

CREATE INDEX IF NOT EXISTS idx_users_registration_country
  ON users(registration_country);

COMMIT;
