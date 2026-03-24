-- T27-7: Default LLM provider config stored in system_config
-- Adds a placeholder key for admin-configured default provider

INSERT INTO system_config (key, value)
VALUES ('llm_default_provider_config', '{"provider":"vectorengine","base_url":"https://api.vectorengine.ai/v1/chat/completions","default_model":"gpt-4o","api_key_encrypted":null,"api_key_masked":null,"updated_by":null,"updated_at":null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN system_config.value IS 'JSON payload for configuration values (may include encrypted fields such as api_key_encrypted)';
