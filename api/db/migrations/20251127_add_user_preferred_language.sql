-- Migration: 20251127_add_user_preferred_language
-- Description: Add preferred_language to users for basic i18n

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) NOT NULL DEFAULT 'en';

COMMIT;
