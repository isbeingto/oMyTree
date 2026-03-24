-- Migration: 20251204_t32_2_migrate_user_byok
-- Description: Migrate existing user API keys from user_api_keys to user_llm_providers/user_llm_models
-- This migrates data from T27 tables to T32 tables

BEGIN;

-- 1. Migrate user_api_keys to user_llm_providers
-- For each user that has a key in user_api_keys, create an entry in user_llm_providers
DO $$
BEGIN
  IF to_regclass('user_llm_providers') IS NOT NULL
     AND to_regclass('user_api_keys') IS NOT NULL
  THEN
    INSERT INTO user_llm_providers (
      user_id,
      kind,
      display_name,
      api_key_encrypted,
      api_key_masked,
      enabled,
      test_passed,
      created_at,
      updated_at
    )
    SELECT
      uak.user_id,
      uak.provider::text as kind,
      CASE
        WHEN uak.provider::text = 'openai' THEN 'OpenAI'
        WHEN uak.provider::text = 'google' THEN 'Google AI'
        ELSE uak.provider::text
      END as display_name,
      uak.api_key_encrypted,
      NULL as api_key_masked,
      true as enabled,
      false as test_passed,
      uak.created_at,
      uak.updated_at
    FROM user_api_keys uak
    WHERE NOT EXISTS (
      SELECT 1 FROM user_llm_providers ulp
      WHERE ulp.user_id = uak.user_id AND ulp.kind = uak.provider::text
    );
  ELSE
    RAISE NOTICE 'Skipping T32-2 provider migration: missing user_llm_providers or user_api_keys';
  END IF;
END
$$;

-- 2. Migrate user_enabled_models to user_llm_models
-- For each enabled model, link it to the user's provider
DO $$
BEGIN
  IF to_regclass('user_llm_models') IS NOT NULL
     AND to_regclass('user_llm_providers') IS NOT NULL
     AND to_regclass('user_enabled_models') IS NOT NULL
  THEN
    INSERT INTO user_llm_models (
      user_provider_id,
      model_key,
      display_name,
      description,
      enabled,
      sort_order,
      created_at,
      updated_at
    )
    SELECT
      ulp.id as user_provider_id,
      uem.model_id as model_key,
      COALESCE(uem.model_name, uem.model_id) as display_name,
      uem.model_description as description,
      uem.enabled,
      0 as sort_order,
      uem.created_at,
      uem.updated_at
    FROM user_enabled_models uem
    JOIN user_llm_providers ulp ON ulp.user_id = uem.user_id AND ulp.kind = uem.provider
    WHERE NOT EXISTS (
      SELECT 1 FROM user_llm_models ulm
      WHERE ulm.user_provider_id = ulp.id AND ulm.model_key = uem.model_id
    );
  ELSE
    RAISE NOTICE 'Skipping T32-2 model migration: missing user_llm_models/user_llm_providers/user_enabled_models';
  END IF;
END
$$;

COMMIT;

-- Log migration stats
DO $$
DECLARE
  v_providers_migrated INTEGER;
  v_models_migrated INTEGER;
BEGIN
  IF to_regclass('user_llm_providers') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_providers_migrated FROM user_llm_providers;
  ELSE
    v_providers_migrated := 0;
  END IF;

  IF to_regclass('user_llm_models') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_models_migrated FROM user_llm_models;
  ELSE
    v_models_migrated := 0;
  END IF;

  RAISE NOTICE 'T32-2 Migration complete: % providers, % models', v_providers_migrated, v_models_migrated;
END $$;
