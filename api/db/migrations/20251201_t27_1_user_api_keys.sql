-- Migration: 20251201_t27_1_user_api_keys
-- Description: Add user_api_keys table for BYOK (Bring Your Own Key) support

BEGIN;

-- Provider enum type (extensible)
DO $$
BEGIN
  -- Use search_path-aware lookup so schema-isolated installs don't accidentally
  -- detect a type that exists in another schema (e.g. public) but isn't visible.
  IF to_regtype('llm_provider_type') IS NULL THEN
    CREATE TYPE llm_provider_type AS ENUM ('openai', 'google');
  END IF;
END
$$;

-- User API Keys table
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider llm_provider_type NOT NULL,
  label TEXT,  -- Optional user-friendly name
  api_key_encrypted TEXT NOT NULL,  -- Encrypted API key
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Each user can only have one key per provider
  UNIQUE(user_id, provider)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_provider ON user_api_keys(provider);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_api_keys_updated_at ON user_api_keys;
CREATE TRIGGER trigger_user_api_keys_updated_at
  BEFORE UPDATE ON user_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_user_api_keys_updated_at();

COMMIT;
