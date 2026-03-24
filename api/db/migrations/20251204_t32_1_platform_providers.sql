-- Migration: 20251204_t32_1_platform_providers
-- Description: T32-1 Admin Providers & Platform Model Pool
-- Creates platform_providers and platform_models tables for multi-vendor LLM support

BEGIN;

-- =============================================================================
-- 1. Create provider_kind enum type
-- =============================================================================
DO $$
BEGIN
  -- Use search_path-aware lookup so schema-isolated installs don't accidentally
  -- detect a type that exists in another schema (e.g. public) but isn't visible.
  IF to_regtype('provider_kind_type') IS NULL THEN
    CREATE TYPE provider_kind_type AS ENUM (
      'openai_native',      -- Direct OpenAI API
      'openai_compatible',  -- OpenAI-compatible APIs (VectorEngine, etc.)
      'gemini',             -- Google Gemini API
      'anthropic',          -- Anthropic Claude (future)
      'deepseek'            -- DeepSeek (future)
    );
  END IF;
END
$$;

-- =============================================================================
-- 2. Create platform_providers table
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Provider identification
  kind provider_kind_type NOT NULL,
  name TEXT NOT NULL,                      -- Display name, e.g. 'OpenAI', 'Google Gemini'
  slug TEXT NOT NULL UNIQUE,               -- URL-friendly identifier, e.g. 'openai', 'gemini'
  
  -- API configuration
  api_key_encrypted TEXT,                  -- Encrypted API key
  api_key_masked TEXT,                     -- Masked version for display (e.g. 'sk-...abc')
  base_url TEXT,                           -- Custom base URL (optional, for openai_compatible)
  
  -- Status
  enabled BOOLEAN NOT NULL DEFAULT false,  -- Whether this provider is active
  is_default BOOLEAN NOT NULL DEFAULT false, -- Whether this is the default provider
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_platform_providers_kind ON platform_providers(kind);
CREATE INDEX IF NOT EXISTS idx_platform_providers_enabled ON platform_providers(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_platform_providers_default ON platform_providers(is_default) WHERE is_default = true;

-- Ensure only one default provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_providers_single_default 
  ON platform_providers(is_default) WHERE is_default = true;

-- =============================================================================
-- 3. Create platform_models table
-- =============================================================================
CREATE TABLE IF NOT EXISTS platform_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Foreign key to provider
  provider_id UUID NOT NULL REFERENCES platform_providers(id) ON DELETE CASCADE,
  
  -- Model identification
  model_key TEXT NOT NULL,                 -- API model name, e.g. 'gpt-4o', 'gemini-2.0-flash'
  display_name TEXT NOT NULL,              -- Human-readable name
  description TEXT,                        -- Model description
  
  -- Availability flags
  enabled_for_users BOOLEAN NOT NULL DEFAULT false,  -- Users can select this model in Composer
  enabled_in_default BOOLEAN NOT NULL DEFAULT false, -- Part of "oMyTree Default" pool
  
  -- Metadata
  sort_order INTEGER DEFAULT 0,            -- For UI ordering
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one model per provider
  UNIQUE(provider_id, model_key)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_platform_models_provider ON platform_models(provider_id);
CREATE INDEX IF NOT EXISTS idx_platform_models_enabled_users ON platform_models(enabled_for_users) WHERE enabled_for_users = true;
CREATE INDEX IF NOT EXISTS idx_platform_models_enabled_default ON platform_models(enabled_in_default) WHERE enabled_in_default = true;

-- =============================================================================
-- 4. Auto-update trigger for updated_at
-- =============================================================================
CREATE OR REPLACE FUNCTION update_platform_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_platform_models_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_platform_providers_updated_at ON platform_providers;
CREATE TRIGGER trigger_platform_providers_updated_at
  BEFORE UPDATE ON platform_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_providers_updated_at();

DROP TRIGGER IF EXISTS trigger_platform_models_updated_at ON platform_models;
CREATE TRIGGER trigger_platform_models_updated_at
  BEFORE UPDATE ON platform_models
  FOR EACH ROW
  EXECUTE FUNCTION update_platform_models_updated_at();

-- =============================================================================
-- 5. Migrate existing llm_default_provider_config to new tables
-- =============================================================================
DO $$
DECLARE
  v_config JSONB;
  v_provider TEXT;
  v_api_key_encrypted TEXT;
  v_api_key_masked TEXT;
  v_base_url TEXT;
  v_default_model TEXT;
  v_provider_id UUID;
  v_provider_kind provider_kind_type;
BEGIN
  -- Get existing config from system_config
  SELECT value INTO v_config
  FROM system_config
  WHERE key = 'llm_default_provider_config';
  
  IF v_config IS NOT NULL THEN
    v_provider := v_config->>'provider';
    v_api_key_encrypted := v_config->>'api_key_encrypted';
    v_api_key_masked := v_config->>'api_key_masked';
    v_base_url := v_config->>'base_url';
    v_default_model := v_config->>'default_model';
    
    -- Map old provider names to new kind
    IF v_provider = 'gemini' THEN
      v_provider_kind := 'gemini';
      
      -- Insert Gemini provider if not exists
      INSERT INTO platform_providers (kind, name, slug, api_key_encrypted, api_key_masked, base_url, enabled, is_default)
      VALUES (
        'gemini',
        'Google Gemini',
        'gemini',
        v_api_key_encrypted,
        v_api_key_masked,
        COALESCE(v_base_url, 'https://generativelanguage.googleapis.com/v1beta/models'),
        true,
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        api_key_masked = EXCLUDED.api_key_masked,
        base_url = EXCLUDED.base_url,
        enabled = true,
        is_default = true,
        updated_at = NOW()
      RETURNING id INTO v_provider_id;
      
      -- Insert default model if specified
      IF v_default_model IS NOT NULL AND v_provider_id IS NOT NULL THEN
        INSERT INTO platform_models (provider_id, model_key, display_name, enabled_for_users, enabled_in_default, sort_order)
        VALUES (v_provider_id, v_default_model, v_default_model, true, true, 0)
        ON CONFLICT (provider_id, model_key) DO UPDATE SET
          enabled_for_users = true,
          enabled_in_default = true,
          updated_at = NOW();
      END IF;
      
    ELSIF v_provider = 'vectorengine' THEN
      -- VectorEngine is OpenAI-compatible
      INSERT INTO platform_providers (kind, name, slug, api_key_encrypted, api_key_masked, base_url, enabled, is_default)
      VALUES (
        'openai_compatible',
        'VectorEngine (OpenAI-compatible)',
        'vectorengine',
        v_api_key_encrypted,
        v_api_key_masked,
        COALESCE(v_base_url, 'https://api.vectorengine.ai/v1/chat/completions'),
        true,
        true
      )
      ON CONFLICT (slug) DO UPDATE SET
        api_key_encrypted = EXCLUDED.api_key_encrypted,
        api_key_masked = EXCLUDED.api_key_masked,
        base_url = EXCLUDED.base_url,
        enabled = true,
        is_default = true,
        updated_at = NOW()
      RETURNING id INTO v_provider_id;
      
      -- Insert default model if specified
      IF v_default_model IS NOT NULL AND v_provider_id IS NOT NULL THEN
        INSERT INTO platform_models (provider_id, model_key, display_name, enabled_for_users, enabled_in_default, sort_order)
        VALUES (v_provider_id, v_default_model, v_default_model, true, true, 0)
        ON CONFLICT (provider_id, model_key) DO UPDATE SET
          enabled_for_users = true,
          enabled_in_default = true,
          updated_at = NOW();
      END IF;
    END IF;
    
    RAISE NOTICE 'Migrated existing llm_default_provider_config to platform_providers';
  END IF;
  
  -- Always ensure OpenAI native provider exists (even without config)
  INSERT INTO platform_providers (kind, name, slug, enabled, is_default)
  VALUES ('openai_native', 'OpenAI', 'openai', false, false)
  ON CONFLICT (slug) DO NOTHING;
  
  -- Always ensure Gemini provider exists
  INSERT INTO platform_providers (kind, name, slug, base_url, enabled, is_default)
  VALUES ('gemini', 'Google Gemini', 'gemini', 'https://generativelanguage.googleapis.com/v1beta/models', false, false)
  ON CONFLICT (slug) DO NOTHING;
  
END
$$;

-- =============================================================================
-- 6. Add comments
-- =============================================================================
COMMENT ON TABLE platform_providers IS 'T32-1: Platform LLM provider configurations (admin-managed)';
COMMENT ON COLUMN platform_providers.kind IS 'Provider type: openai_native, openai_compatible, gemini, anthropic, deepseek';
COMMENT ON COLUMN platform_providers.slug IS 'URL-friendly unique identifier';
COMMENT ON COLUMN platform_providers.api_key_encrypted IS 'AES-256-GCM encrypted API key';
COMMENT ON COLUMN platform_providers.is_default IS 'If true, this provider is used for "oMyTree Default" quota';

COMMENT ON TABLE platform_models IS 'T32-1: Platform model pool - models available for users';
COMMENT ON COLUMN platform_models.enabled_for_users IS 'If true, users can select this model in Composer when using this provider';
COMMENT ON COLUMN platform_models.enabled_in_default IS 'If true, this model is part of the "oMyTree Default" pool';

COMMIT;
