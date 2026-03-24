-- Migration: 20260205_add_anthropic_deepseek_providers
-- Description: Add Anthropic Claude and DeepSeek to platform providers
-- This adds support for Claude and DeepSeek in the admin providers management

BEGIN;

-- =============================================================================
-- Add Anthropic Claude provider
-- =============================================================================
INSERT INTO platform_providers (kind, name, slug, base_url, enabled, is_default)
VALUES (
  'anthropic',
  'Anthropic Claude',
  'anthropic',
  'https://api.anthropic.com/v1/messages',
  false,
  false
)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- Add DeepSeek provider
-- =============================================================================
INSERT INTO platform_providers (kind, name, slug, base_url, enabled, is_default)
VALUES (
  'deepseek',
  'DeepSeek',
  'deepseek',
  'https://api.deepseek.com/v1/chat/completions',
  false,
  false
)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON COLUMN platform_providers.kind IS 'Provider type: openai_native, openai_compatible, gemini, anthropic, deepseek';

COMMIT;
