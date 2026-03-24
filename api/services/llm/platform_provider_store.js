/**
 * Platform Provider Store
 *
 * Provides helper functions to resolve platform-level LLM providers/models
 * from the platform_providers/platform_models tables.
 */

import { pool, getClient } from '../../db/pool.js';
import { decryptApiKey } from '../../lib/api_key_crypto.js';
import { filterWhitelistedModels, getWhitelistedModels, isModelWhitelisted } from './model_policies.js';

// Default fallbacks
const DEFAULT_OPENAI_MODEL = process.env.LLM_MODEL || 'gpt-4o';
const DEFAULT_GEMINI_MODEL = process.env.GOOGLE_LLM_MODEL || 'gemini-2.0-flash';

/**
 * Resolve a platform provider (and its default model) from DB.
 *
 * @param {object} params
 * @param {string|null} [params.providerHint] - optional slug/kind hint (e.g., 'openai', 'gemini')
 * @param {string|null} [params.modelHint] - optional model key hint; when providerHint is 'omytree-default' or missing, use this to infer the correct provider
 * @returns {Promise<{providerId: string, slug: string, name: string, kind: string, apiKey: string|null, baseUrl: string|null, defaultModel: string|null, enabledModels?: string[]}>}
 */
export async function getPlatformProviderConfig({ providerHint = null, modelHint = null } = {}) {
  const client = await getClient();
  try {
    const normalizedHint = typeof providerHint === 'string' ? providerHint.trim().toLowerCase() : null;
    const normalizedModelHint = typeof modelHint === 'string' ? modelHint.trim() : null;

    // 1) Preferred provider by hint (slug)
    let providerRow = null;
    
    // 1a) If providerHint is 'omytree-default' or missing and modelHint is provided,
    //     look up the provider that owns this model
    if ((!normalizedHint || normalizedHint === 'omytree-default') && normalizedModelHint) {
      const { rows } = await client.query(
        `SELECT pp.id, pp.slug, pp.name, pp.kind, pp.api_key_encrypted, pp.base_url, pp.enabled, pp.is_default
         FROM platform_providers pp
         JOIN platform_models pm ON pm.provider_id = pp.id
         WHERE pp.enabled = true AND pm.model_key = $1 AND pm.enabled_for_users = true
         LIMIT 1`,
        [normalizedModelHint]
      );
      providerRow = rows[0] || null;
      if (providerRow) {
        console.log(`[platform_provider_store] Inferred provider "${providerRow.slug}" from model "${normalizedModelHint}"`);
      }
    }
    
    // 1b) Try by provider slug hint
    if (!providerRow && normalizedHint && normalizedHint !== 'omytree-default') {
      const { rows } = await client.query(
        `SELECT id, slug, name, kind, api_key_encrypted, base_url, enabled, is_default
         FROM platform_providers
         WHERE enabled = true AND slug = $1
         LIMIT 1`,
        [normalizedHint]
      );
      providerRow = rows[0] || null;
    }

    // 2) Default provider
    if (!providerRow) {
      const { rows } = await client.query(
        `SELECT id, slug, name, kind, api_key_encrypted, base_url, enabled, is_default
         FROM platform_providers
         WHERE enabled = true
         ORDER BY is_default DESC, updated_at DESC
         LIMIT 1`
      );
      providerRow = rows[0] || null;
    }

    if (!providerRow) {
      return null;
    }

    // Get default model: prefer enabled_in_default, otherwise first model
    const modelResult = await client.query(
      `SELECT model_key
       FROM platform_models
       WHERE provider_id = $1
       ORDER BY enabled_in_default DESC, sort_order ASC, model_key ASC
       LIMIT 1`,
      [providerRow.id]
    );
    const defaultModelFromDb = modelResult.rows[0]?.model_key || null;

    // Enabled models for runtime validation: include user-enabled and default-enabled.
    const enabledModelsResult = await client.query(
      `SELECT model_key
       FROM platform_models
       WHERE provider_id = $1
         AND (enabled_for_users = true OR enabled_in_default = true)
       ORDER BY enabled_in_default DESC, enabled_for_users DESC, sort_order ASC, model_key ASC`,
      [providerRow.id]
    );
    const enabledModelsRaw = enabledModelsResult.rows.map(r => r.model_key).filter(Boolean);
    let enabledModels =
      providerRow.kind === 'gemini'
        ? filterWhitelistedModels('google', enabledModelsRaw)
        : enabledModelsRaw;

    // Map kind -> fallback model
    const geminiWhitelist = providerRow.kind === 'gemini' ? getWhitelistedModels('google') : null;
    const fallbackModel =
      providerRow.kind === 'gemini'
        ? (geminiWhitelist?.[0] || DEFAULT_GEMINI_MODEL)
        : DEFAULT_OPENAI_MODEL;

    let resolvedDefaultModel = defaultModelFromDb || fallbackModel;
    if (providerRow.kind === 'gemini' && resolvedDefaultModel && !isModelWhitelisted('google', resolvedDefaultModel)) {
      resolvedDefaultModel = enabledModels?.[0] || fallbackModel;
    }

    if (providerRow.kind === 'gemini' && Array.isArray(enabledModels) && enabledModels.length === 0) {
      if (resolvedDefaultModel && isModelWhitelisted('google', resolvedDefaultModel)) {
        enabledModels = [resolvedDefaultModel];
      }
    }

    let apiKey = null;
    if (providerRow.api_key_encrypted) {
      try {
        apiKey = decryptApiKey(providerRow.api_key_encrypted);
      } catch (err) {
        console.warn('[platform_provider_store] Failed to decrypt key for provider', providerRow.slug, err.message);
      }
    }

    return {
      providerId: providerRow.id,
      slug: providerRow.slug,
      name: providerRow.name,
      kind: providerRow.kind,
      apiKey,
      baseUrl: providerRow.base_url || null,
      defaultModel: resolvedDefaultModel,
      enabledModels,
    };
  } finally {
    client.release();
  }
}

export default {
  getPlatformProviderConfig,
};
