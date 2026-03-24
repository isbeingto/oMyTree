-- T30-0: LLM error events log
-- Records structured error codes for provider failures (BYOK + platform)

BEGIN;

CREATE TABLE IF NOT EXISTS llm_error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  tree_id UUID NULL,
  provider TEXT NOT NULL,
  error_code TEXT NOT NULL,
  message TEXT,
  raw_error TEXT,
  is_byok BOOLEAN DEFAULT FALSE,
  trace_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_error_user_created
  ON llm_error_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_error_provider_created
  ON llm_error_events(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_llm_error_created
  ON llm_error_events(created_at);

COMMIT;
