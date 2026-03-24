-- T85-Optimization: Provider File Cache
-- Caches file IDs uploaded to external providers (Gemini, Anthropic) to avoid redundant uploads
-- Gemini Files API TTL: ~48 hours, Anthropic Files API TTL: ~24 hours

CREATE TABLE IF NOT EXISTS provider_file_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,  -- 'gemini', 'anthropic', 'openai'
  provider_file_id TEXT NOT NULL,  -- file_uri for Gemini, file_id for Anthropic
  mime_type TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (upload_id, provider)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_provider_file_cache_lookup 
  ON provider_file_cache(upload_id, provider, expires_at);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_provider_file_cache_expires 
  ON provider_file_cache(expires_at);

COMMENT ON TABLE provider_file_cache IS 'Caches external provider file IDs to avoid redundant uploads within TTL period';
COMMENT ON COLUMN provider_file_cache.provider_file_id IS 'Gemini: file_uri, Anthropic: file_id, OpenAI: file_id';
COMMENT ON COLUMN provider_file_cache.expires_at IS 'Conservative TTL: Gemini ~24h (actual 48h), Anthropic ~12h (actual 24h)';
