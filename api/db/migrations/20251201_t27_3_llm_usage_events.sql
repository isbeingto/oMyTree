-- T27-3: LLM Usage Events table for quota tracking
-- Records each LLM call for quota enforcement

BEGIN;

-- Create llm_usage_events table
CREATE TABLE IF NOT EXISTS llm_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- 'omytree-default', 'openai', 'google'
  is_byok BOOLEAN NOT NULL DEFAULT FALSE,  -- true if using user's own API key
  tokens_input INTEGER,  -- optional: track input tokens
  tokens_output INTEGER,  -- optional: track output tokens
  tree_id UUID,  -- optional: which tree this was for
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient quota queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created 
  ON llm_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_usage_user_provider_created 
  ON llm_usage_events(user_id, provider, created_at DESC);

-- Index for daily/monthly aggregation queries
CREATE INDEX IF NOT EXISTS idx_llm_usage_created_at 
  ON llm_usage_events(created_at);

COMMIT;
