/**
 * T32-2: User BYOK Provider Settings API
 * 
 * Endpoints:
 *   GET    /api/account/user-providers                    - List user's BYOK providers
 *   GET    /api/account/user-providers/:kind              - Get provider detail + models
 *   PUT    /api/account/user-providers/:kind              - Save provider (key + enabled)
 *   DELETE /api/account/user-providers/:kind              - Delete provider and its models
 *   POST   /api/account/user-providers/:kind/fetch-models - Fetch model list using user key
 *   POST   /api/account/user-providers/:kind/test         - Test connection with a random enabled model
 *   PUT    /api/account/user-providers/:kind/models       - Batch update enabled models
 * 
 * Uses user_llm_providers + user_llm_models tables
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { getStrictAuthUserId, isDemoUserId } from '../lib/auth_user.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../lib/api_key_crypto.js';
import { withTraceId } from '../lib/trace.js';
import { recordByokBound } from '../services/telemetry.js';
import { writeAuditLog } from '../lib/audit_log.js';
import { createUserKeyProvider } from '../services/llm/providers/user_key.js';
import { isLlmError, mapLlmError, recordLlmErrorEvent } from '../services/llm/errors.js';
import { isModelWhitelisted } from '../services/llm/model_policies.js';
import { fetchOllamaModels, testOllamaConnection } from '../services/llm/drivers/ollama.js';

const VALID_KINDS = new Set(['openai', 'google', 'anthropic', 'deepseek', 'ollama']);
const KIND_TO_DISPLAY = { openai: 'OpenAI', google: 'Google AI', anthropic: 'Anthropic Claude', deepseek: 'DeepSeek', ollama: 'Ollama (Local)' };

function isByokModelWhitelisted(kind, modelKey) {
  return isModelWhitelisted(kind, modelKey);
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res?.locals?.traceId ?? req?.headers?.['x-trace-id'] ?? null;
}

function invalid(res, status, code, message, hint = null) {
  return res.status(status).json(
    withTraceId(res, {
      ok: false,
      error: code,
      message: message || code,
      hint,
    })
  );
}

/**
 * Fetch models from provider API
 */
async function fetchModelsFromProvider(kind, apiKey) {
  const models = [];

  if (kind === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    (data.models || [])
      .filter((m) => {
        const name = m.name || '';
        const methods = m.supportedGenerationMethods || [];
        return (
          name.includes('gemini') &&
          methods.includes('generateContent') &&
          !name.includes('embedding') &&
          !name.includes('aqa')
        );
      })
      .forEach((m) => {
        models.push({
          model_key: m.name.replace('models/', ''),
          display_name: m.displayName || m.name.replace('models/', ''),
          description: m.description || '',
        });
      });

    // Sort: newer versions first
    models.sort((a, b) => {
      const getVersion = (id) => {
        const match = id.match(/gemini-(\d+\.?\d*)/);
        return match ? parseFloat(match[1]) : 0;
      };
      const getPriority = (id) => (id.includes('preview') || id.includes('exp') ? 1 : 0);
      const versionDiff = getVersion(b.model_key) - getVersion(a.model_key);
      if (versionDiff !== 0) return versionDiff;
      return getPriority(a.model_key) - getPriority(b.model_key);
    });
  } else if (kind === 'openai') {
    const url = 'https://api.openai.com/v1/models';
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    (data.data || [])
      .filter((m) => {
        const id = m.id || '';
        return (
          (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('chatgpt')) &&
          !id.includes('instruct') &&
          !id.includes('vision') &&
          !id.includes('realtime') &&
          !id.includes('audio') &&
          !id.includes('codex')
        );
      })
      .forEach((m) => {
        models.push({
          model_key: m.id,
          display_name: m.id,
          description: m.owned_by || '',
        });
      });

    // Sort: newer models first
    models.sort((a, b) => {
      const getScore = (id) => {
        if (id.startsWith('gpt-5.2')) return 200;
        if (id.startsWith('gpt-5.1')) return 190;
        if (id === 'gpt-5' || id === 'gpt-5-mini') return 180;
        if (id.startsWith('gpt-5')) return 175;
        if (id.startsWith('gpt-4.1')) return 150;
        if (id.startsWith('gpt-4o')) return 140;
        if (id.startsWith('gpt-4')) return 100;
        if (id.startsWith('gpt-3.5')) return 60;
        return 0;
      };
      return getScore(b.model_key) - getScore(a.model_key);
    });
  } else if (kind === 'anthropic') {
    // Anthropic has a models list API that returns models the API key can access
    const modelsUrl = 'https://api.anthropic.com/v1/models';
    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
      // 401/403 means invalid/suspended key
      if (response.status === 401 || response.status === 403) {
        throw new Error(errorMessage || 'Invalid API key');
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    const modelList = data.data || [];

    // Map API response to our model format
    // Only include chat-capable models (exclude embedding models, etc.)
    modelList
      .filter((m) => {
        const id = m.id || '';
        // Include claude models for chat
        return id.startsWith('claude-');
      })
      .forEach((m) => {
        models.push({
          model_key: m.id,
          display_name: m.display_name || m.id,
          description: m.created_at ? `Released: ${m.created_at.split('T')[0]}` : '',
        });
      });

    // Sort by model generation (newest first)
    models.sort((a, b) => {
      const getScore = (id) => {
        // Claude 4.x series
        if (id.includes('opus-4-6')) return 210;
        if (id.includes('opus-4-5')) return 200;
        if (id.includes('sonnet-4-5')) return 195;
        if (id.includes('haiku-4-5')) return 190;
        if (id.includes('opus-4-1')) return 185;
        if (id.includes('opus-4-')) return 180;
        if (id.includes('sonnet-4-')) return 175;
        // Claude 3.7 series
        if (id.includes('3-7-sonnet')) return 150;
        // Claude 3.5 series
        if (id.includes('3-5-sonnet')) return 140;
        if (id.includes('3-5-haiku')) return 135;
        // Claude 3 series
        if (id.includes('3-opus')) return 100;
        if (id.includes('3-sonnet')) return 90;
        if (id.includes('3-haiku')) return 80;
        return 0;
      };
      return getScore(b.model_key) - getScore(a.model_key);
    });
  } else if (kind === 'deepseek') {
    // DeepSeek uses OpenAI-compatible API, so we can fetch models
    const url = 'https://api.deepseek.com/models';
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const data = await response.json();
    (data.data || [])
      .filter((m) => {
        const id = m.id || '';
        // Only include chat models (deepseek-chat, deepseek-reasoner)
        return id.includes('deepseek');
      })
      .forEach((m) => {
        models.push({
          model_key: m.id,
          display_name: m.id,
          description: m.owned_by || 'DeepSeek',
        });
      });

    // If API doesn't return models, provide defaults
    if (models.length === 0) {
      models.push(
        { model_key: 'deepseek-chat', display_name: 'DeepSeek Chat', description: 'General chat model (DeepSeek-V3)' },
        { model_key: 'deepseek-reasoner', display_name: 'DeepSeek Reasoner', description: 'Advanced reasoning model (DeepSeek-R1)' },
      );
    }

    // Sort: reasoner first, then chat
    models.sort((a, b) => {
      const getScore = (id) => {
        if (id.includes('reasoner')) return 100;
        if (id.includes('chat')) return 90;
        return 0;
      };
      return getScore(b.model_key) - getScore(a.model_key);
    });
  } else if (kind === 'ollama') {
    // Ollama: fetch locally installed models via /api/tags
    // For Ollama, apiKey is actually the base_url (or we use the provider's base_url)
    const baseUrl = apiKey; // For Ollama, we pass base_url in place of apiKey in the caller
    const ollamaModels = await fetchOllamaModels(baseUrl || 'http://localhost:11434');
    models.push(...ollamaModels);
  }

  return models;
}

export default function createUserProvidersRouter() {
  const router = express.Router();

  /**
   * GET /api/account/user-providers
   * List all BYOK providers configured by the user
   */
  router.get('/api/account/user-providers', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);

      if (isDemoUserId(userId)) {
        return res.json(withTraceId(res, { ok: true, providers: [], is_demo: true }));
      }

      const { rows } = await client.query(
        `SELECT id, kind, display_name, api_key_masked, base_url, enabled, test_passed, test_passed_at, created_at, updated_at
         FROM user_llm_providers
         WHERE user_id = $1
         ORDER BY kind`,
        [userId]
      );

      // Count enabled models per provider
      const countRes = await client.query(
        `SELECT ulp.kind, COUNT(ulm.id) FILTER (WHERE ulm.enabled) AS enabled_count
         FROM user_llm_providers ulp
         LEFT JOIN user_llm_models ulm ON ulm.user_provider_id = ulp.id
         WHERE ulp.user_id = $1
         GROUP BY ulp.kind`,
        [userId]
      );
      const modelCounts = {};
      for (const row of countRes.rows) {
        modelCounts[row.kind] = parseInt(row.enabled_count, 10) || 0;
      }

      const providers = rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        display_name: row.display_name || KIND_TO_DISPLAY[row.kind] || row.kind,
        api_key_masked: row.api_key_masked,
        base_url: row.base_url,
        enabled: row.enabled,
        test_passed: row.test_passed,
        test_passed_at: row.test_passed_at,
        enabled_model_count: modelCounts[row.kind] || 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));

      return res.json(withTraceId(res, { ok: true, providers }));
    } catch (error) {
      console.error('[user-providers] GET list failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/account/user-providers/:kind
   * Get single provider detail + its models
   */
  router.get('/api/account/user-providers/:kind', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const kind = req.params.kind?.toLowerCase();

      if (!VALID_KINDS.has(kind)) {
        return invalid(res, 400, 'INVALID_KIND', `Kind must be one of: ${[...VALID_KINDS].join(', ')}`);
      }

      if (isDemoUserId(userId)) {
        return res.json(withTraceId(res, { ok: true, provider: null, models: [], is_demo: true }));
      }

      const { rows: providerRows } = await client.query(
        `SELECT id, kind, display_name, api_key_masked, base_url, enabled, test_passed, test_passed_at, created_at, updated_at
         FROM user_llm_providers
         WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
      );

      if (providerRows.length === 0) {
        // No provider configured yet
        return res.json(
          withTraceId(res, {
            ok: true,
            provider: null,
            models: [],
          })
        );
      }

      const provider = providerRows[0];

      // Get models
      const { rows: modelRows } = await client.query(
        `SELECT id, model_key, display_name, description, enabled, sort_order
         FROM user_llm_models
         WHERE user_provider_id = $1
         ORDER BY sort_order, model_key`,
        [provider.id]
      );

      const models = modelRows.map((m) => ({
        id: m.id,
        model_key: m.model_key,
        display_name: m.display_name || m.model_key,
        description: m.description,
        enabled: m.enabled,
        sort_order: m.sort_order,
      }));

      return res.json(
        withTraceId(res, {
          ok: true,
          provider: {
            id: provider.id,
            kind: provider.kind,
            display_name: provider.display_name || KIND_TO_DISPLAY[provider.kind] || provider.kind,
            api_key_masked: provider.api_key_masked,
            base_url: provider.base_url,
            enabled: provider.enabled,
            test_passed: provider.test_passed,
            test_passed_at: provider.test_passed_at,
            created_at: provider.created_at,
            updated_at: provider.updated_at,
          },
          models,
        })
      );
    } catch (error) {
      console.error('[user-providers] GET single failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * PUT /api/account/user-providers/:kind
   * Create or update a provider (api_key, enabled, base_url)
   * 
   * Body: { api_key?: string, enabled?: boolean, base_url?: string }
   */
  router.put('/api/account/user-providers/:kind', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const kind = req.params.kind?.toLowerCase();

      if (!VALID_KINDS.has(kind)) {
        return invalid(res, 400, 'INVALID_KIND', `Kind must be one of: ${[...VALID_KINDS].join(', ')}`);
      }

      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot configure providers');
      }

      const { api_key, enabled, base_url } = req.body || {};

      // Validate api_key if provided (skip for Ollama which doesn't need a key)
      if (kind !== 'ollama' && api_key !== undefined) {
        if (typeof api_key !== 'string' || api_key.trim().length < 10) {
          return invalid(res, 400, 'INVALID_API_KEY', 'API key is too short');
        }
        if (api_key.length > 500) {
          return invalid(res, 400, 'INVALID_API_KEY', 'API key is too long');
        }
      }

      // For Ollama, validate base_url instead
      if (kind === 'ollama') {
        const ollamaUrl = base_url || 'http://localhost:11434';
        try {
          new URL(ollamaUrl);
        } catch {
          return invalid(res, 400, 'INVALID_URL', 'Invalid Ollama URL. Example: http://localhost:11434');
        }
      }

      // Check if provider already exists
      const { rows: existing } = await client.query(
        `SELECT id, api_key_encrypted FROM user_llm_providers WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
      );

      let providerId;
      let isNew = false;

      if (existing.length > 0) {
        // Update existing
        providerId = existing[0].id;
        const updates = [];
        const values = [providerId];
        let idx = 2;

        if (kind !== 'ollama' && api_key !== undefined) {
          const encrypted = encryptApiKey(api_key.trim());
          const masked = maskApiKey(api_key.trim());
          updates.push(`api_key_encrypted = $${idx++}`);
          values.push(encrypted);
          updates.push(`api_key_masked = $${idx++}`);
          values.push(masked);
          // Reset test_passed when key changes
          updates.push(`test_passed = false`);
          updates.push(`test_passed_at = NULL`);
        }
        if (enabled !== undefined) {
          updates.push(`enabled = $${idx++}`);
          values.push(!!enabled);
        }
        if (base_url !== undefined) {
          updates.push(`base_url = $${idx++}`);
          values.push(base_url?.trim() || null);
          // For Ollama, reset test_passed when URL changes
          if (kind === 'ollama') {
            updates.push(`test_passed = false`);
            updates.push(`test_passed_at = NULL`);
          }
        }

        if (updates.length > 0) {
          await client.query(
            `UPDATE user_llm_providers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1`,
            values
          );
        }
      } else {
        // Create new
        if (kind !== 'ollama' && !api_key) {
          return invalid(res, 400, 'API_KEY_REQUIRED', 'API key is required for new provider');
        }

        isNew = true;

        // Ollama: no API key, store base_url only
        const encrypted = kind === 'ollama' ? null : encryptApiKey(api_key.trim());
        const masked = kind === 'ollama' ? null : maskApiKey(api_key.trim());
        const ollamaBaseUrl = kind === 'ollama' ? (base_url?.trim() || 'http://localhost:11434') : (base_url?.trim() || null);

        const insertRes = await client.query(
          `INSERT INTO user_llm_providers (user_id, kind, display_name, api_key_encrypted, api_key_masked, base_url, enabled, test_passed)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false)
           RETURNING id`,
          [userId, kind, KIND_TO_DISPLAY[kind] || kind, encrypted, masked, ollamaBaseUrl, enabled ?? false]
        );
        providerId = insertRes.rows[0].id;

        // Record telemetry
        await recordByokBound(userId, kind);

        // Audit log
        await writeAuditLog(
          {
            actorUserId: userId,
            actorRole: 'user',
            action: 'user.byok_provider.create',
            targetType: 'user_llm_provider',
            targetId: String(providerId),
            ip: getClientIp(req),
            traceId: getTraceId(res, req),
            metadata: { kind },
          },
          client
        );
      }

      console.log(`[user-providers] User ${userId.slice(0, 8)}... ${isNew ? 'created' : 'updated'} provider ${kind}`);

      return res.json(
        withTraceId(res, {
          ok: true,
          provider_id: providerId,
          kind,
          message: isNew ? 'Provider created' : 'Provider updated',
        })
      );
    } catch (error) {
      console.error('[user-providers] PUT failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * DELETE /api/account/user-providers/:kind
   * Delete a provider and all its models
   * Also resets preferred_llm_provider if it was pointing to this provider
   */
  router.delete('/api/account/user-providers/:kind', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const kind = req.params.kind?.toLowerCase();

      if (!VALID_KINDS.has(kind)) {
        return invalid(res, 400, 'INVALID_KIND', `Kind must be one of: ${[...VALID_KINDS].join(', ')}`);
      }

      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot delete providers');
      }

      const { rowCount } = await client.query(
        `DELETE FROM user_llm_providers WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
      );

      if (rowCount === 0) {
        return invalid(res, 404, 'NOT_FOUND', 'Provider not found');
      }

      // Check if user's preferred_llm_provider was pointing to this deleted provider
      const { rows: userRows } = await client.query(
        `SELECT preferred_llm_provider, enable_advanced_context FROM users WHERE id = $1`,
        [userId]
      );
      const currentProvider = userRows[0]?.preferred_llm_provider;
      const advancedEnabled = userRows[0]?.enable_advanced_context;

      if (currentProvider === kind) {
        // Find another enabled BYOK provider to use
        const { rows: remainingProviders } = await client.query(
          `SELECT kind FROM user_llm_providers WHERE user_id = $1 AND enabled = true ORDER BY kind LIMIT 1`,
          [userId]
        );

        let newProvider = 'omytree-default';
        let newAdvanced = false;

        if (remainingProviders.length > 0) {
          // Use another BYOK provider
          newProvider = remainingProviders[0].kind;
          newAdvanced = advancedEnabled; // Keep advanced mode if other BYOK providers exist
        } else {
          // No more BYOK providers - disable advanced mode
          newAdvanced = false;
        }

        await client.query(
          `UPDATE users SET preferred_llm_provider = $1, enable_advanced_context = $2, updated_at = NOW() WHERE id = $3`,
          [newProvider, newAdvanced, userId]
        );

        console.log(`[user-providers] User ${userId.slice(0, 8)}... provider reset from ${kind} to ${newProvider} (advanced=${newAdvanced})`);
      }

      // Audit log
      await writeAuditLog(
        {
          actorUserId: userId,
          actorRole: 'user',
          action: 'user.byok_provider.delete',
          targetType: 'user_llm_provider',
          targetId: String(kind),
          ip: getClientIp(req),
          traceId: getTraceId(res, req),
          metadata: { kind },
        },
        client
      );

      console.log(`[user-providers] User ${userId.slice(0, 8)}... deleted provider ${kind}`);

      return res.json(withTraceId(res, { ok: true, message: 'Provider deleted' }));
    } catch (error) {
      console.error('[user-providers] DELETE failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/user-providers/:kind/fetch-models
   * Fetch model list from provider API using user's key
   * Saves models to user_llm_models table
   */
  router.post('/api/account/user-providers/:kind/fetch-models', async (req, res) => {
    const client = await pool.connect();
    const startTime = Date.now();

    try {
      const userId = await getStrictAuthUserId(req, client);
      const kind = req.params.kind?.toLowerCase();

      if (!VALID_KINDS.has(kind)) {
        return invalid(res, 400, 'INVALID_KIND', `Kind must be one of: ${[...VALID_KINDS].join(', ')}`);
      }

      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot fetch models');
      }

      // Get provider
      const { rows: providerRows } = await client.query(
        `SELECT id, api_key_encrypted, base_url FROM user_llm_providers WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
      );

      if (providerRows.length === 0) {
        if (kind === 'ollama') {
          return invalid(res, 404, 'NO_PROVIDER', 'Ollama not configured. Set the connection URL first.');
        }
        return invalid(res, 404, 'NO_PROVIDER', 'Provider not configured. Add API key first.');
      }

      const provider = providerRows[0];

      // For Ollama, use base_url for fetching models (no API key needed)
      // For other providers, decrypt the API key
      let fetchKey;
      if (kind === 'ollama') {
        fetchKey = provider.base_url || 'http://localhost:11434';
      } else {
        fetchKey = decryptApiKey(provider.api_key_encrypted);
      }

      // Fetch models
      const fetchedModels = await fetchModelsFromProvider(kind, fetchKey);

      // Get existing models to preserve enabled status
      const { rows: existingModels } = await client.query(
        `SELECT model_key, enabled FROM user_llm_models WHERE user_provider_id = $1`,
        [provider.id]
      );
      const existingEnabled = {};
      for (const m of existingModels) {
        existingEnabled[m.model_key] = m.enabled;
      }

      // Upsert models (preserve enabled status if already exists)
      await client.query('BEGIN');
      try {
        for (let i = 0; i < fetchedModels.length; i++) {
          const m = fetchedModels[i];
          const wasEnabled = existingEnabled[m.model_key];
          const enabled = wasEnabled ?? false;

          await client.query(
            `INSERT INTO user_llm_models (user_provider_id, model_key, display_name, description, enabled, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_provider_id, model_key) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               description = EXCLUDED.description,
               sort_order = EXCLUDED.sort_order,
               updated_at = NOW()`,
            [provider.id, m.model_key, m.display_name, m.description, enabled, i]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }

      const latency = Date.now() - startTime;
      console.log(
        `[user-providers] User ${userId.slice(0, 8)}... fetched ${fetchedModels.length} models for ${kind} (${latency}ms)`
      );

      return res.json(
        withTraceId(res, {
          ok: true,
          kind,
          models: fetchedModels.map((m, i) => ({
            model_key: m.model_key,
            display_name: m.display_name,
            description: m.description,
            enabled: existingEnabled[m.model_key] ?? false,
            sort_order: i,
          })),
          count: fetchedModels.length,
          latency,
        })
      );
    } catch (error) {
      console.error('[user-providers] fetch-models failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'FETCH_FAILED', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/user-providers/:kind/test
   * Test connection with user-specified model or first enabled model
   * Updates test_passed and test_passed_at on success
   * 
   * Body: { model?: string } - optional model to test with
   */
  router.post('/api/account/user-providers/:kind/test', async (req, res) => {
    const client = await pool.connect();
    const testStart = Date.now();

    try {
      const userId = await getStrictAuthUserId(req, client);
      const kind = req.params.kind?.toLowerCase();

      if (!VALID_KINDS.has(kind)) {
        return invalid(res, 400, 'INVALID_KIND', `Kind must be one of: ${[...VALID_KINDS].join(', ')}`);
      }

      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot test providers');
      }

      // Get provider
      const { rows: providerRows } = await client.query(
        `SELECT id, api_key_encrypted, base_url FROM user_llm_providers WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
      );

      if (providerRows.length === 0) {
        return invalid(res, 404, 'NO_PROVIDER', 'Provider not configured');
      }

      const provider = providerRows[0];

      // Use user-specified model if provided, otherwise get first enabled model
      let testModel = req.body?.model;

      if (!testModel) {
        // Fallback: Get first enabled model from DB
        const { rows: modelRows } = await client.query(
          `SELECT model_key FROM user_llm_models WHERE user_provider_id = $1 AND enabled = true LIMIT 1`,
          [provider.id]
        );

        if (modelRows.length === 0) {
          return invalid(
            res,
            400,
            'NO_ENABLED_MODELS',
            'No models enabled. Please enable at least one model before testing.',
            'Select models and save your selection first.'
          );
        }
        testModel = modelRows[0].model_key;
      }

      // Ollama: use dedicated test function (no API key needed)
      if (kind === 'ollama') {
        const baseUrl = provider.base_url || 'http://localhost:11434';
        try {
          const result = await testOllamaConnection(baseUrl, testModel);

          if (result.ok) {
            await client.query(
              `UPDATE user_llm_providers SET test_passed = true, test_passed_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [provider.id]
            );
            console.log(`[user-providers] User ${userId.slice(0, 8)}... tested ollama: success (${result.elapsed_ms}ms)`);
            return res.json(
              withTraceId(res, {
                ok: true,
                success: true,
                kind,
                model_tested: testModel,
                elapsed_ms: result.elapsed_ms,
                message: `Ollama connection successful! Response: "${result.response}"`,
              })
            );
          } else {
            await client.query(
              `UPDATE user_llm_providers SET test_passed = false, updated_at = NOW() WHERE id = $1`,
              [provider.id]
            );
            return res.status(503).json(
              withTraceId(res, {
                ok: false,
                success: false,
                kind,
                model_tested: testModel,
                elapsed_ms: result.elapsed_ms,
                error: {
                  code: 'OLLAMA_TEST_FAILED',
                  provider: 'ollama',
                  message: result.response || 'Ollama connection test failed',
                },
                message: result.response || 'Ollama connection test failed',
              })
            );
          }
        } catch (ollamaErr) {
          await client.query(
            `UPDATE user_llm_providers SET test_passed = false, updated_at = NOW() WHERE id = $1`,
            [provider.id]
          );
          return res.status(503).json(
            withTraceId(res, {
              ok: false,
              success: false,
              kind,
              model_tested: testModel,
              error: {
                code: 'OLLAMA_TEST_FAILED',
                provider: 'ollama',
                message: ollamaErr.message,
              },
              message: ollamaErr.message,
            })
          );
        }
      }

      const apiKey = decryptApiKey(provider.api_key_encrypted);

      // Create user provider and test
      const userProvider = createUserKeyProvider(kind, apiKey);

      try {
        await userProvider.callChat({
          messages: [{ role: 'user', content: 'Hi, reply with just "ok".' }],
          options: {
            model: testModel,
          },
        });

        // Success - update test_passed
        await client.query(
          `UPDATE user_llm_providers SET test_passed = true, test_passed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [provider.id]
        );

        const elapsed = Date.now() - testStart;
        console.log(`[user-providers] User ${userId.slice(0, 8)}... tested ${kind}: success (${elapsed}ms)`);

        return res.json(
          withTraceId(res, {
            ok: true,
            success: true,
            kind,
            model_tested: testModel,
            elapsed_ms: elapsed,
            message: 'Connection successful! Your API key is working.',
          })
        );
      } catch (llmError) {
        // Test failed
        await client.query(
          `UPDATE user_llm_providers SET test_passed = false, updated_at = NOW() WHERE id = $1`,
          [provider.id]
        );

        const elapsed = Date.now() - testStart;
        const normalized = isLlmError(llmError) ? llmError : mapLlmError(llmError, { provider: kind, isByok: true });

        await recordLlmErrorEvent({
          pool,
          userId,
          treeId: null,
          provider: normalized.provider,
          errorCode: normalized.code,
          message: normalized.message,
          rawError: normalized.raw || llmError?.message,
          isByok: true,
          traceId: res.locals?.traceId,
        });

        return res.status(normalized.status).json(
          withTraceId(res, {
            ok: false,
            success: false,
            kind,
            model_tested: testModel,
            elapsed_ms: elapsed,
            error: {
              code: normalized.code,
              provider: normalized.provider,
              message: normalized.message,
            },
            message: normalized.message,
          })
        );
      }
    } catch (error) {
      console.error('[user-providers] test failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * PUT /api/account/user-providers/:kind/models
   * Batch update enabled status for models
   * 
   * Body: { models: [{ model_key: string, enabled: boolean }] }
   */
  router.put('/api/account/user-providers/:kind/models', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      const kind = req.params.kind?.toLowerCase();

      if (!VALID_KINDS.has(kind)) {
        return invalid(res, 400, 'INVALID_KIND', `Kind must be one of: ${[...VALID_KINDS].join(', ')}`);
      }

      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot update models');
      }

      const { models } = req.body || {};
      if (!Array.isArray(models)) {
        return invalid(res, 400, 'INVALID_MODELS', 'models must be an array');
      }

      // Enforce whitelist: allow disabling any model, but reject enabling a non-whitelisted model.
      for (const m of models) {
        if (typeof m?.model_key !== 'string' || typeof m?.enabled !== 'boolean') continue;
        if (m.enabled === true && !isByokModelWhitelisted(kind, m.model_key)) {
          return invalid(
            res,
            400,
            'MODEL_NOT_WHITELISTED',
            `Model not whitelisted: ${m.model_key}`,
            kind === 'google' ? 'Currently only Gemini 3 series models are allowed for Google BYOK.' : null
          );
        }
      }

      // Get provider
      const { rows: providerRows } = await client.query(
        `SELECT id, test_passed FROM user_llm_providers WHERE user_id = $1 AND kind = $2`,
        [userId, kind]
      );

      if (providerRows.length === 0) {
        return invalid(res, 404, 'NO_PROVIDER', 'Provider not configured');
      }

      const providerId = providerRows[0].id;

      // Update enabled status for each model
      await client.query('BEGIN');
      try {
        for (const m of models) {
          if (typeof m.model_key !== 'string' || typeof m.enabled !== 'boolean') continue;
          await client.query(
            `UPDATE user_llm_models SET enabled = $1, updated_at = NOW()
             WHERE user_provider_id = $2 AND model_key = $3`,
            [m.enabled, providerId, m.model_key]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }

      console.log(`[user-providers] User ${userId.slice(0, 8)}... updated ${models.length} models for ${kind}`);

      return res.json(withTraceId(res, { ok: true, message: 'Models updated', count: models.length }));
    } catch (error) {
      console.error('[user-providers] PUT models failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/account/available-models
   * Get all models available to user in Composer:
   * - oMyTree Default: ALL platform models with enabled_for_users = true (cross-provider)
   * - BYOK providers: User's configured providers with test_passed = true
   */
  router.get('/api/account/available-models', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);
      const isDemo = isDemoUserId(userId);
      let enableAdvancedContext = false;

      if (!isDemo) {
        const advRow = await client.query(
          'SELECT enable_advanced_context FROM users WHERE id = $1',
          [userId]
        );
        enableAdvancedContext = Boolean(advRow.rows[0]?.enable_advanced_context);
      }

      // Get ALL platform models that are enabled for users (cross-provider, for oMyTree Default)
      const { rows: platformRows } = await client.query(
        `SELECT pp.slug, pp.name as provider_name,
                pm.model_key, pm.display_name, pm.description
         FROM platform_providers pp
         JOIN platform_models pm ON pm.provider_id = pp.id
         WHERE pp.enabled = true AND pm.enabled_for_users = true
         ORDER BY pp.name, pm.sort_order`
      );

      // Build oMyTree Default with ALL user-available platform models
      let defaultProvider = null;
      if (platformRows.length > 0) {
        const defaultModels = platformRows.map((row) => ({
          id: row.model_key,
          name: row.display_name,
          description: row.description || '',
          enabled: enableAdvancedContext ? false : true,
          disabled_reason: enableAdvancedContext
            ? '高级模式开启后不可选择平台默认模型'
            : null,
        }));

        defaultProvider = {
          id: 'omytree-default',
          name: 'oMyTree Default',
          badge: 'Platform',
          models: defaultModels,
          isByok: false,
          disabled: enableAdvancedContext,
          disabled_reason: enableAdvancedContext
            ? '高级模式开启后不可选择平台默认模型'
            : null,
        };
      }

      // Get BYOK providers — always show BYOK entry, even if user hasn't configured any
      // Also get Ollama provider separately
      const byokProviders = [];
      let ollamaProvider = null;
      if (!isDemo) {
        const { rows: byokRows } = await client.query(
          `SELECT ulp.kind, ulp.display_name,
                  ulm.model_key, ulm.display_name as model_name, ulm.description
           FROM user_llm_providers ulp
           JOIN user_llm_models ulm ON ulm.user_provider_id = ulp.id
           WHERE ulp.user_id = $1 AND ulp.enabled = true AND ulp.test_passed = true AND ulm.enabled = true
                 AND ulp.kind != 'ollama'
           ORDER BY ulp.kind, ulm.sort_order`,
          [userId]
        );

        const allByokModels = [];
        for (const row of byokRows) {
          if (!isByokModelWhitelisted(row.kind, row.model_key)) {
            continue;
          }
          // Track provider kind for display grouping
          const providerLabel = row.display_name || KIND_TO_DISPLAY[row.kind] || row.kind;
          allByokModels.push({
            id: row.model_key,
            name: row.model_name || row.model_key,
            description: row.description || '',
            enabled: true,
            providerKind: row.kind,
            providerLabel,
          });
        }

        // Always include BYOK entry — empty models array means user hasn't configured yet
        byokProviders.push({
          id: 'byok',
          name: 'BYOK',
          badge: 'BYOK',
          models: allByokModels,
          hasApiKey: allByokModels.length > 0,
          isByok: true,
          notConfigured: allByokModels.length === 0,
        });

        // Get Ollama models separately
        const { rows: ollamaRows } = await client.query(
          `SELECT ulp.kind, ulp.display_name, ulp.base_url,
                  ulm.model_key, ulm.display_name as model_name, ulm.description
           FROM user_llm_providers ulp
           JOIN user_llm_models ulm ON ulm.user_provider_id = ulp.id
           WHERE ulp.user_id = $1 AND ulp.kind = 'ollama' AND ulp.enabled = true AND ulp.test_passed = true AND ulm.enabled = true
           ORDER BY ulm.sort_order`,
          [userId]
        );

        const ollamaModels = ollamaRows.map((row) => ({
          id: row.model_key,
          name: row.model_name || row.model_key,
          description: row.description || '',
          enabled: true,
        }));

        // Check if Ollama is configured (even if no models yet)
        const { rows: ollamaConfigRows } = await client.query(
          `SELECT id, base_url, test_passed FROM user_llm_providers WHERE user_id = $1 AND kind = 'ollama'`,
          [userId]
        );
        const ollamaConfigured = ollamaConfigRows.length > 0;
        const ollamaBaseUrl = ollamaConfigRows[0]?.base_url || 'http://localhost:11434';

        ollamaProvider = {
          id: 'ollama',
          name: 'Ollama (Local)',
          badge: 'Local',
          models: ollamaModels,
          hasApiKey: false,
          isByok: false,
          isOllama: true,
          ollamaBaseUrl,
          notConfigured: !ollamaConfigured,
        };
      }

      // Combine: oMyTree Default first, then BYOK, then Ollama
      const allProviders = [];
      if (enableAdvancedContext) {
        allProviders.push(...byokProviders);
        if (ollamaProvider) {
          allProviders.push(ollamaProvider);
        }
        if (defaultProvider) {
          allProviders.push(defaultProvider);
        }
      } else {
        if (defaultProvider) {
          allProviders.push(defaultProvider);
        }
        allProviders.push(...byokProviders);
        if (ollamaProvider) {
          allProviders.push(ollamaProvider);
        }
      }

      return res.json(
        withTraceId(res, {
          ok: true,
          providers: allProviders,
          is_demo: isDemo,
          enable_advanced_context: enableAdvancedContext,
        })
      );
    } catch (error) {
      console.error('[available-models] GET failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'INTERNAL_ERROR', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/user-providers/ollama/sync-models
   *
   * 浏览器端获取 Ollama 模型列表后，将模型列表同步到数据库。
   * Body: { base_url, models: [{ model_key, display_name, description }] }
   */
  router.post('/api/account/user-providers/ollama/sync-models', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot sync models');
      }

      const { base_url, models } = req.body || {};
      if (!Array.isArray(models) || models.length === 0) {
        return invalid(res, 422, 'INVALID_MODELS', 'models array is required');
      }

      const sanitizedBaseUrl = (typeof base_url === 'string' ? base_url.trim() : 'http://localhost:11434').replace(/\/+$/, '');

      // Upsert provider
      const { rows: [provider] } = await client.query(
        `INSERT INTO user_llm_providers (user_id, kind, base_url, enabled, test_passed)
         VALUES ($1, 'ollama', $2, true, false)
         ON CONFLICT (user_id, kind) DO UPDATE SET
           base_url = EXCLUDED.base_url,
           enabled = true,
           updated_at = NOW()
         RETURNING id`,
        [userId, sanitizedBaseUrl]
      );

      // Get existing models to preserve enabled status
      const { rows: existingModels } = await client.query(
        `SELECT model_key, enabled FROM user_llm_models WHERE user_provider_id = $1`,
        [provider.id]
      );
      const existingEnabled = {};
      for (const m of existingModels) {
        existingEnabled[m.model_key] = m.enabled;
      }

      // Upsert models
      await client.query('BEGIN');
      try {
        for (let i = 0; i < models.length; i++) {
          const m = models[i];
          if (!m.model_key) continue;
          const enabled = existingEnabled[m.model_key] ?? false;
          await client.query(
            `INSERT INTO user_llm_models (user_provider_id, model_key, display_name, description, enabled, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_provider_id, model_key) DO UPDATE SET
               display_name = EXCLUDED.display_name,
               description = EXCLUDED.description,
               sort_order = EXCLUDED.sort_order,
               updated_at = NOW()`,
            [provider.id, m.model_key, m.display_name || m.model_key, m.description || '', enabled, i]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }

      console.log(`[user-providers] User ${userId.slice(0, 8)}... synced ${models.length} Ollama models`);

      return res.json(
        withTraceId(res, {
          ok: true,
          kind: 'ollama',
          models: models.map((m, i) => ({
            model_key: m.model_key,
            display_name: m.display_name || m.model_key,
            description: m.description || '',
            enabled: existingEnabled[m.model_key] ?? false,
            sort_order: i,
          })),
          count: models.length,
        })
      );
    } catch (error) {
      console.error('[user-providers] sync-models failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'SYNC_FAILED', error.message);
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/user-providers/ollama/mark-tested
   *
   * 浏览器端直连 Ollama 测试成功后，标记 provider 为已测试。
   * Body: { success: boolean, elapsed_ms?: number, model?: string }
   */
  router.post('/api/account/user-providers/ollama/mark-tested', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getStrictAuthUserId(req, client);
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER_FORBIDDEN', 'Demo users cannot mark providers');
      }

      const { success, elapsed_ms, model } = req.body || {};
      if (typeof success !== 'boolean') {
        return invalid(res, 422, 'INVALID_SUCCESS', 'success (boolean) is required');
      }

      const { rowCount } = await client.query(
        `UPDATE user_llm_providers SET test_passed = $1, updated_at = NOW()
         WHERE user_id = $2 AND kind = 'ollama'`,
        [success, userId]
      );

      if (rowCount === 0) {
        return invalid(res, 404, 'PROVIDER_NOT_FOUND', 'Ollama provider not found');
      }

      const logMsg = success
        ? `[user-providers] User ${userId.slice(0, 8)}... marked Ollama tested: success (${elapsed_ms || '?'}ms, model=${model || '?'})`
        : `[user-providers] User ${userId.slice(0, 8)}... marked Ollama tested: failed`;
      console.log(logMsg);

      return res.json(
        withTraceId(res, {
          ok: true,
          kind: 'ollama',
          test_passed: success,
          elapsed_ms: elapsed_ms || null,
          model: model || null,
        })
      );
    } catch (error) {
      console.error('[user-providers] mark-tested failed:', error);
      const status = error.status || 500;
      return invalid(res, status, error.code || 'MARK_FAILED', error.message);
    } finally {
      client.release();
    }
  });

  return router;
}

// Re-export helper for auth
import { getAuthUserIdForRequest } from '../lib/auth_user.js';
