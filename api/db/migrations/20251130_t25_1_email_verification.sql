-- Migration: 20251130_t25_1_email_verification
-- Description: Add email verification tokens table for T25-1 Email Verification Flow

BEGIN;

-- Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint on token
  CONSTRAINT uq_email_verification_token UNIQUE (token)
);

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token 
  ON email_verification_tokens(token);

-- Index for cleanup of used tokens
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user_unused 
  ON email_verification_tokens(user_id, used_at) 
  WHERE used_at IS NULL;

COMMIT;
