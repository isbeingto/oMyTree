-- T27-2: Add preferred_llm_provider column to users table
-- This allows users to choose between "omytree-default" and their own API keys

BEGIN;

-- Add preferred_llm_provider column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_llm_provider TEXT DEFAULT 'omytree-default';

-- Add constraint to ensure valid values
-- Allowed: 'omytree-default', 'openai', 'google'
ALTER TABLE users
ADD CONSTRAINT users_preferred_llm_provider_check
CHECK (preferred_llm_provider IN ('omytree-default', 'openai', 'google'));

COMMIT;
