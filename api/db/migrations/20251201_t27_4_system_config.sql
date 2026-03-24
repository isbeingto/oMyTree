-- T27-4: System configuration table for Kill Switch and other global settings
-- Migration: 20251201_t27_4_system_config.sql

-- System config table (key-value store with JSON values)
CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default Kill Switch setting (enabled by default)
INSERT INTO system_config (key, value) 
VALUES ('official_llm_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Comment for documentation
COMMENT ON TABLE system_config IS 'Global system configuration (key-value store)';
COMMENT ON COLUMN system_config.key IS 'Configuration key (e.g., official_llm_enabled)';
COMMENT ON COLUMN system_config.value IS 'JSON value for the configuration';
