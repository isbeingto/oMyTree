-- Migration: 20251130_t25_2_password_reset
-- Description: Add password reset tokens table for T25-2 Password Reset Flow

BEGIN;

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint on token
  CONSTRAINT uq_password_reset_token UNIQUE (token)
);

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token 
  ON password_reset_tokens(token);

-- Index for cleanup of used tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_unused 
  ON password_reset_tokens(user_id, used_at) 
  WHERE used_at IS NULL;

COMMIT;
