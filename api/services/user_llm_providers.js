/**
 * User LLM Provider Store (BYOK)
 *
 * Centralized helpers for fetching user-scoped BYOK provider configs
 * from user_llm_providers + user_llm_models.
 */

import { pool, getClient } from '../db/pool.js';
import { decryptApiKey } from '../lib/api_key_crypto.js';

function normalizeKind(kind) {
  const normalized = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  if (normalized === 'google' || normalized === 'gemini') return 'google';
  if (normalized === 'openai') return 'openai';
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  if (normalized === 'deepseek') return 'deepseek';
  return null;
}

/**
 * Load BYOK provider config for a user.
 * Requires provider to be enabled, test_passed, and to have at least one enabled model.
 *
 * @param {string} userId
 * @param {string} kind - "openai" | "google"
 * @returns {Promise<{ apiKey: string, baseUrl: string | null, enabledModels: string[], kind: string } | null>}
 */
export async function getUserByokProviderConfig(userId, kind) {
  const normalizedKind = normalizeKind(kind);
  if (!userId || !normalizedKind) {
    return null;
  }

  const client = await getClient();
  try {
    const providerRes = await client.query(
      `SELECT id, api_key_encrypted, base_url, enabled, test_passed
       FROM user_llm_providers
       WHERE user_id = $1 AND kind = $2
       LIMIT 1`,
      [userId, normalizedKind]
    );

    if (providerRes.rowCount === 0) {
      return null;
    }

    const provider = providerRes.rows[0];
    if (!provider.enabled || !provider.test_passed || !provider.api_key_encrypted) {
      return null;
    }

    const modelsRes = await client.query(
      `SELECT model_key
       FROM user_llm_models
       WHERE user_provider_id = $1 AND enabled = true
       ORDER BY sort_order, model_key`,
      [provider.id]
    );

    const enabledModels = modelsRes.rows.map((row) => row.model_key).filter(Boolean);
    if (enabledModels.length === 0) {
      return null;
    }

    const apiKey = decryptApiKey(provider.api_key_encrypted);
    if (!apiKey) {
      return null;
    }

    return {
      apiKey,
      baseUrl: provider.base_url || null,
      enabledModels,
      kind: normalizedKind,
    };
  } catch (error) {
    console.warn(
      `[user-llm-providers] Failed to load BYOK provider ${normalizedKind} for user=${userId?.slice(0, 8)}...`,
      error?.message || error
    );
    return null;
  } finally {
    client.release();
  }
}

export async function hasUserByokProvider(userId, kind) {
  const config = await getUserByokProviderConfig(userId, kind);
  return Boolean(config?.apiKey);
}

/**
 * Look up a user's BYOK provider by model key.
 * Used when frontend sends provider='byok' + model=<key>
 * and we need to find which provider owns the model.
 *
 * @param {string} userId
 * @param {string} modelKey - e.g. 'gpt-4o', 'deepseek-chat'
 * @returns {Promise<{ apiKey: string, baseUrl: string | null, enabledModels: string[], kind: string } | null>}
 */
export async function getUserByokProviderByModel(userId, modelKey) {
  if (!userId || !modelKey) return null;

  const client = await getClient();
  try {
    const { rows } = await client.query(
      `SELECT ulp.id, ulp.kind, ulp.api_key_encrypted, ulp.base_url
       FROM user_llm_providers ulp
       JOIN user_llm_models ulm ON ulm.user_provider_id = ulp.id
       WHERE ulp.user_id = $1
         AND ulp.enabled = true
         AND ulp.test_passed = true
         AND ulm.model_key = $2
         AND ulm.enabled = true
       LIMIT 1`,
      [userId, modelKey.trim()]
    );

    if (rows.length === 0) return null;

    const provider = rows[0];
    if (!provider.api_key_encrypted) return null;

    const apiKey = decryptApiKey(provider.api_key_encrypted);
    if (!apiKey) return null;

    // Also load all enabled models for this provider (for allowedModels)
    const modelsRes = await client.query(
      `SELECT model_key FROM user_llm_models
       WHERE user_provider_id = $1 AND enabled = true
       ORDER BY sort_order, model_key`,
      [provider.id]
    );
    const enabledModels = modelsRes.rows.map(r => r.model_key).filter(Boolean);

    return {
      apiKey,
      baseUrl: provider.base_url || null,
      enabledModels,
      kind: normalizeKind(provider.kind),
    };
  } catch (error) {
    console.warn(
      `[user-llm-providers] getUserByokProviderByModel failed for user=${userId?.slice(0, 8)}... model=${modelKey}`,
      error?.message || error
    );
    return null;
  } finally {
    client.release();
  }
}

/**
 * Check if user has at least one active BYOK provider that passed tests and has enabled models.
 * Falls back to legacy user_api_keys rows if present.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function hasActiveUserProviders(userId) {
  if (!userId) {
    return false;
  }

  const client = await getClient();
  try {
    // Primary: providers that are enabled AND test_passed AND have at least one enabled model
    const { rows } = await client.query(
      `SELECT COUNT(*)::INT AS count
       FROM user_llm_providers ulp
       JOIN user_llm_models ulm ON ulm.user_provider_id = ulp.id
       WHERE ulp.user_id = $1
         AND ulp.enabled = TRUE
         AND ulp.test_passed = TRUE
         AND ulm.enabled = TRUE`,
      [userId]
    );
    if ((rows[0]?.count || 0) > 0) {
      return true;
    }

    // Legacy fallback: user_api_keys table (if still populated)
    const legacy = await client.query(
      `SELECT COUNT(*)::INT AS count
       FROM user_api_keys
       WHERE user_id = $1`,
      [userId]
    );
    return (legacy.rows[0]?.count || 0) > 0;
  } catch (error) {
    console.warn('[user-llm-providers] hasActiveUserProviders failed:', error?.message || error);
    return false;
  } finally {
    client.release();
  }
}

export default {
  getUserByokProviderConfig,
  getUserByokProviderByModel,
  hasUserByokProvider,
  hasActiveUserProviders,
};
