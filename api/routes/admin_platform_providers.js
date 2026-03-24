/**
 * Admin Platform Providers API
 * 
 * T32-1: Multi-vendor LLM provider management
 * 
 * Endpoints:
 *   GET    /api/admin/platform-providers           - List all providers
 *   GET    /api/admin/platform-providers/:id       - Get single provider
 *   PUT    /api/admin/platform-providers/:id       - Update provider (key/baseURL/enabled)
 *   POST   /api/admin/platform-providers/:id/fetch-models  - Fetch models from provider
 *   POST   /api/admin/platform-providers/:id/test  - Test connection
 *   PUT    /api/admin/platform-models/bulk         - Bulk update model flags
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../lib/api_key_crypto.js';
import { writeAuditLog } from '../lib/audit_log.js';
import { routeLLM } from '../services/llm/router.js';
import { PROVIDER_KINDS } from '../services/llm/types.js';
import { isModelWhitelisted } from '../services/llm/model_policies.js';

const router = express.Router();

// Map slug to provider kind
const SLUG_TO_KIND = {
  'openai': PROVIDER_KINDS.OPENAI_NATIVE,
  'gemini': PROVIDER_KINDS.GEMINI,
  'anthropic': PROVIDER_KINDS.ANTHROPIC,
  'deepseek': PROVIDER_KINDS.DEEPSEEK,
};

// Default base URLs
const DEFAULT_BASE_URLS = {
  'openai_native': 'https://api.openai.com/v1',
  'gemini': 'https://generativelanguage.googleapis.com/v1beta/models',
  'openai_compatible': null,  // Must be provided
  'anthropic': 'https://api.anthropic.com/v1',
  'deepseek': 'https://api.deepseek.com/v1',
};

async function ensureBuiltinProviders(client) {
  // Some installs might have run the original T32-1 migration before
  // anthropic/deepseek were added or may have incomplete seed data.
  // Ensure these providers exist so the admin UI can configure them.
  await client.query(
    `INSERT INTO platform_providers (kind, name, slug, base_url, enabled, is_default)
     VALUES
       ('openai_native', 'OpenAI', 'openai', $1, false, false),
       ('gemini', 'Google Gemini', 'gemini', $2, false, false),
       ('anthropic', 'Anthropic Claude', 'anthropic', $3, false, false),
       ('deepseek', 'DeepSeek', 'deepseek', $4, false, false)
     ON CONFLICT (slug) DO NOTHING`,
    [
      DEFAULT_BASE_URLS.openai_native,
      DEFAULT_BASE_URLS.gemini,
      DEFAULT_BASE_URLS.anthropic,
      DEFAULT_BASE_URLS.deepseek,
    ]
  );
}

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || null;
}

function getTraceId(res, req) {
  return res.locals?.traceId || req.headers?.['x-trace-id'] || null;
}

function buildError(res, status, code, message) {
  return res.status(status).json({
    ok: false,
    error: { code, message },
  });
}

/**
 * GET /api/admin/platform-providers
 * List all platform providers with their models
 */
router.get('/api/admin/platform-providers', async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureBuiltinProviders(client);

    // Get all providers
    const providersResult = await client.query(`
      SELECT 
        id, kind, name, slug, api_key_masked, base_url, 
        enabled, is_default, created_at, updated_at
      FROM platform_providers
      ORDER BY 
        CASE kind 
          WHEN 'openai_native' THEN 1 
          WHEN 'gemini' THEN 2 
          WHEN 'openai_compatible' THEN 3 
          WHEN 'anthropic' THEN 4
          WHEN 'deepseek' THEN 5
          ELSE 10 
        END
    `);
    
    // Get all models grouped by provider
    const modelsResult = await client.query(`
      SELECT 
        id, provider_id, model_key, display_name, description,
        enabled_for_users, enabled_in_default, sort_order
      FROM platform_models
      ORDER BY sort_order, model_key
    `);
    
    // Group models by provider_id
    const modelsByProvider = {};
    for (const model of modelsResult.rows) {
      const pid = model.provider_id;
      if (!modelsByProvider[pid]) {
        modelsByProvider[pid] = [];
      }
      modelsByProvider[pid].push({
        id: model.id,
        modelKey: model.model_key,
        displayName: model.display_name,
        description: null,
        enabledForUsers: model.enabled_for_users,
        enabledInDefault: model.enabled_in_default,
        sortOrder: model.sort_order,
      });
    }
    
    // Build response
    const providers = providersResult.rows.map(row => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      slug: row.slug,
      hasApiKey: !!row.api_key_masked,
      apiKeyMasked: row.api_key_masked || null,
      baseUrl: row.base_url || DEFAULT_BASE_URLS[row.kind] || null,
      enabled: row.enabled,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      models: modelsByProvider[row.id] || [],
    }));
    
    res.json({ ok: true, providers });
  } catch (error) {
    console.error('[admin/platform-providers] GET failed:', error);
    return buildError(res, 500, 'INTERNAL_ERROR', 'Failed to list providers');
  } finally {
    client.release();
  }
});

/**
 * GET /api/admin/platform-providers/:id
 * Get single provider with models
 */
router.get('/api/admin/platform-providers/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const providerResult = await client.query(`
      SELECT 
        id, kind, name, slug, api_key_masked, base_url, 
        enabled, is_default, created_at, updated_at
      FROM platform_providers
      WHERE id = $1
    `, [id]);
    
    if (providerResult.rows.length === 0) {
      return buildError(res, 404, 'NOT_FOUND', 'Provider not found');
    }
    
    const row = providerResult.rows[0];
    
    const modelsResult = await client.query(`
      SELECT 
        id, model_key, display_name, description,
        enabled_for_users, enabled_in_default, sort_order
      FROM platform_models
      WHERE provider_id = $1
      ORDER BY sort_order, model_key
    `, [id]);
    
    const provider = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      slug: row.slug,
      hasApiKey: !!row.api_key_masked,
      apiKeyMasked: row.api_key_masked || null,
      baseUrl: row.base_url || DEFAULT_BASE_URLS[row.kind] || null,
      enabled: row.enabled,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      models: modelsResult.rows.map(m => ({
        id: m.id,
        modelKey: m.model_key,
        displayName: m.display_name,
        description: null,
        enabledForUsers: m.enabled_for_users,
        enabledInDefault: m.enabled_in_default,
        sortOrder: m.sort_order,
      })),
    };
    
    res.json({ ok: true, provider });
  } catch (error) {
    console.error('[admin/platform-providers/:id] GET failed:', error);
    return buildError(res, 500, 'INTERNAL_ERROR', 'Failed to get provider');
  } finally {
    client.release();
  }
});

/**
 * PUT /api/admin/platform-providers/:id
 * Update provider (API key, base URL, enabled, is_default)
 */
router.put('/api/admin/platform-providers/:id', async (req, res) => {
  const { id } = req.params;
  const { apiKey, baseUrl, enabled, isDefault } = req.body || {};
  const client = await pool.connect();
  
  try {
    // Get existing provider
    const existing = await client.query(
      `SELECT id, kind, slug, api_key_encrypted FROM platform_providers WHERE id = $1`,
      [id]
    );
    
    if (existing.rows.length === 0) {
      return buildError(res, 404, 'NOT_FOUND', 'Provider not found');
    }
    
    const provider = existing.rows[0];
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    // Update API key if provided
    if (typeof apiKey === 'string' && apiKey.trim()) {
      const trimmedKey = apiKey.trim();
      const encrypted = encryptApiKey(trimmedKey);
      const masked = maskApiKey(trimmedKey);
      updates.push(`api_key_encrypted = $${paramIndex++}`);
      values.push(encrypted);
      updates.push(`api_key_masked = $${paramIndex++}`);
      values.push(masked);
    }
    
    // Update base URL if provided
    if (typeof baseUrl === 'string') {
      updates.push(`base_url = $${paramIndex++}`);
      values.push(baseUrl.trim() || null);
    }
    
    // Update enabled status
    if (typeof enabled === 'boolean') {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(enabled);
    }
    
    // Update default status
    if (typeof isDefault === 'boolean') {
      if (isDefault) {
        // Clear other defaults first
        await client.query(`UPDATE platform_providers SET is_default = false WHERE is_default = true`);
      }
      updates.push(`is_default = $${paramIndex++}`);
      values.push(isDefault);
    }
    
    if (updates.length === 0) {
      return buildError(res, 400, 'NO_UPDATES', 'No valid fields to update');
    }
    
    // Execute update
    values.push(id);
    const result = await client.query(`
      UPDATE platform_providers
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, kind, name, slug, api_key_masked, base_url, enabled, is_default, updated_at
    `, values);
    
    const updated = result.rows[0];
    
    // Audit log
    await writeAuditLog({
      actorUserId: req.user?.id || null,
      actorRole: 'admin',
      action: 'admin.platform_provider.update',
      targetType: 'platform_provider',
      targetId: id,
      ip: getClientIp(req),
      traceId: getTraceId(res, req),
      metadata: {
        slug: provider.slug,
        apiKeyChanged: typeof apiKey === 'string' && apiKey.trim().length > 0,
        baseUrlChanged: typeof baseUrl === 'string',
        enabledChanged: typeof enabled === 'boolean',
        isDefaultChanged: typeof isDefault === 'boolean',
      },
    }, client);
    
    res.json({
      ok: true,
      provider: {
        id: updated.id,
        kind: updated.kind,
        name: updated.name,
        slug: updated.slug,
        hasApiKey: !!updated.api_key_masked,
        apiKeyMasked: updated.api_key_masked || null,
        baseUrl: updated.base_url || DEFAULT_BASE_URLS[updated.kind] || null,
        enabled: updated.enabled,
        isDefault: updated.is_default,
        updatedAt: updated.updated_at,
      },
    });
  } catch (error) {
    console.error('[admin/platform-providers/:id] PUT failed:', error);
    return buildError(res, 500, 'INTERNAL_ERROR', 'Failed to update provider');
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/platform-providers/:id/fetch-models
 * Fetch available models from provider and store in platform_models
 */
router.post('/api/admin/platform-providers/:id/fetch-models', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  
  try {
    // Get provider with decrypted key
    const providerResult = await client.query(`
      SELECT id, kind, slug, api_key_encrypted, base_url
      FROM platform_providers
      WHERE id = $1
    `, [id]);
    
    if (providerResult.rows.length === 0) {
      return buildError(res, 404, 'NOT_FOUND', 'Provider not found');
    }
    
    const provider = providerResult.rows[0];
    
    if (!provider.api_key_encrypted) {
      return buildError(res, 400, 'NO_API_KEY', 'Provider has no API key configured');
    }
    
    const apiKey = decryptApiKey(provider.api_key_encrypted);
    const baseUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind] || null;
    
    if (!apiKey) {
      return buildError(res, 400, 'NO_API_KEY', 'Provider has no API key configured');
    }
    if ((provider.kind === 'openai_compatible') && !baseUrl) {
      return buildError(res, 400, 'NO_BASE_URL', 'Base URL is required for OpenAI-compatible providers');
    }
    
    let models = [];
    const startTime = Date.now();
    
    // Fetch models based on provider kind
    if (provider.kind === 'gemini') {
      // Google Gemini: GET /v1beta/models
      const url = `${baseUrl.replace(/\/$/, '')}?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
        return buildError(res, response.status, 'FETCH_FAILED', errorMessage);
      }
      
      const data = await response.json();
      models = (data.models || [])
        .filter(m => {
          const name = m.name || '';
          const methods = m.supportedGenerationMethods || [];
          return name.includes('gemini') && 
                 methods.includes('generateContent') &&
                 !name.includes('embedding') &&
                 !name.includes('aqa');
        })
        .map((m, index) => ({
          modelKey: m.name.replace('models/', ''),
          displayName: m.displayName || m.name.replace('models/', ''),
          description: null,
          sortOrder: index,
        }));
        
    } else if (provider.kind === 'openai_native' || provider.kind === 'openai_compatible' || provider.kind === 'deepseek') {
      // OpenAI: GET /v1/models
      let modelsUrl = provider.kind === 'openai_native'
        ? 'https://api.openai.com/v1/models'
        : buildOpenAIModelsUrl(baseUrl);
      
      if (!modelsUrl) {
        return buildError(res, 400, 'INVALID_BASE_URL', 'Cannot derive models endpoint from base URL');
      }
      
      let response = await fetch(modelsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Some DeepSeek deployments expose /models (no /v1). Retry once on 404.
      if (!response.ok && response.status === 404 && typeof modelsUrl === 'string' && modelsUrl.includes('/v1/models')) {
        const altUrl = modelsUrl.replace('/v1/models', '/models');
        response = await fetch(altUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (response.ok) {
          modelsUrl = altUrl;
        }
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
        return buildError(res, response.status, 'FETCH_FAILED', errorMessage);
      }
      
      const data = await response.json();
      models = (data.data || [])
        .filter(m => {
          const modelId = m.id || '';
          // DeepSeek models don't start with gpt-/o1; include deepseek-* when provider.kind=deepseek.
          const isOpenAIStyle = (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('chatgpt'));
          const isDeepSeekStyle = modelId.includes('deepseek');
          const okPrefix = provider.kind === 'deepseek' ? isDeepSeekStyle : isOpenAIStyle;
          return okPrefix &&
                 !modelId.includes('instruct') &&
                 !modelId.includes('vision') &&
                 !modelId.includes('realtime') &&
                 !modelId.includes('audio');
        })
        .map((m, index) => ({
          modelKey: m.id,
          displayName: m.id,
          description: null, // OpenAI doesn't provide useful descriptions in /v1/models (owned_by is provider name)
          sortOrder: index,
        }));
    } else if (provider.kind === 'anthropic') {
      const modelsUrl = buildAnthropicModelsUrl(baseUrl);
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
        return buildError(res, response.status, 'FETCH_FAILED', errorMessage);
      }

      const data = await response.json();
      const list = data.data || [];
      models = list
        .filter(m => {
          const id = m.id || '';
          return id.startsWith('claude-');
        })
        .map((m, index) => ({
          modelKey: m.id,
          displayName: m.display_name || m.id,
          description: null,
          sortOrder: index,
        }));

      // If the API returns an empty list, still expose a safe default so the admin can proceed.
      if (models.length === 0) {
        models = [
          { modelKey: 'claude-3-haiku-20240307', displayName: 'claude-3-haiku-20240307', description: null, sortOrder: 0 },
        ];
      }
    } else {
      return buildError(res, 400, 'UNSUPPORTED_PROVIDER', `Cannot fetch models for provider kind: ${provider.kind}`);
    }
    
    // Upsert models into platform_models
    // First, get existing model settings to preserve user preferences
    const existingModels = await client.query(`
      SELECT model_key, enabled_for_users, enabled_in_default
      FROM platform_models
      WHERE provider_id = $1
    `, [id]);
    
    const existingFlags = {};
    for (const row of existingModels.rows) {
      existingFlags[row.model_key] = {
        enabledForUsers: row.enabled_for_users,
        enabledInDefault: row.enabled_in_default,
      };
    }
    
    // Upsert each model
    for (const model of models) {
      const existing = existingFlags[model.modelKey];
      await client.query(`
        INSERT INTO platform_models (provider_id, model_key, display_name, description, enabled_for_users, enabled_in_default, sort_order)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (provider_id, model_key) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          updated_at = NOW()
      `, [
        id,
        model.modelKey,
        model.displayName,
        null,
        existing?.enabledForUsers ?? false,
        existing?.enabledInDefault ?? false,
        model.sortOrder,
      ]);
    }
    
    const latency = Date.now() - startTime;
    console.log(`[admin/platform-providers] Fetched ${models.length} models for ${provider.slug} (${latency}ms)`);
    
    // Return updated models list
    const updatedModels = await client.query(`
      SELECT id, model_key, display_name, description, enabled_for_users, enabled_in_default, sort_order
      FROM platform_models
      WHERE provider_id = $1
      ORDER BY sort_order, model_key
    `, [id]);
    
    res.json({
      ok: true,
      count: models.length,
      latency,
      models: updatedModels.rows.map(m => ({
        id: m.id,
        modelKey: m.model_key,
        displayName: m.display_name,
        description: null,
        enabledForUsers: m.enabled_for_users,
        enabledInDefault: m.enabled_in_default,
        sortOrder: m.sort_order,
      })),
    });
  } catch (error) {
    console.error('[admin/platform-providers/:id/fetch-models] failed:', error);
    return buildError(res, 500, 'INTERNAL_ERROR', error.message || 'Failed to fetch models');
  } finally {
    client.release();
  }
});

/**
 * POST /api/admin/platform-providers/:id/test
 * Test connection to provider
 * 
 * Body: { model?: string } - optional model to test with
 */
router.post('/api/admin/platform-providers/:id/test', async (req, res) => {
  const { id } = req.params;
  const { model: userSpecifiedModel } = req.body || {};
  const client = await pool.connect();
  
  try {
    // Get provider with decrypted key
    const providerResult = await client.query(`
      SELECT id, kind, slug, api_key_encrypted, base_url
      FROM platform_providers
      WHERE id = $1
    `, [id]);
    
    if (providerResult.rows.length === 0) {
      return buildError(res, 404, 'NOT_FOUND', 'Provider not found');
    }
    
    const provider = providerResult.rows[0];
    
    if (!provider.api_key_encrypted) {
      return buildError(res, 400, 'NO_API_KEY', 'Provider has no API key configured');
    }
    
    const apiKey = decryptApiKey(provider.api_key_encrypted);
    const baseUrl = provider.base_url || DEFAULT_BASE_URLS[provider.kind];
    
    // Use user-specified model or fallback to default
    const testModel = userSpecifiedModel || getDefaultTestModel(provider.kind);
    
    // Use LLMRouter to test connection
    const testRequest = {
      providerSource: 'platform',
      providerKind: provider.kind,
      providerId: provider.id,
      apiKey,
      baseUrl,
      model: testModel,
      messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
      stream: false,
      temperature: 0,
    };
    
    const startTime = Date.now();
    
    try {
      const result = await routeLLM(testRequest);
      const latency = Date.now() - startTime;
      
      if (result.error) {
        return res.json({
          ok: true,
          success: false,
          latency,
          error: {
            code: result.error.code,
            message: result.error.message,
          },
        });
      }
      
      res.json({
        ok: true,
        success: true,
        latency,
        response: result.fullText?.slice(0, 100) || 'OK',
        model: result.model || testRequest.model,
      });
    } catch (routeError) {
      const latency = Date.now() - startTime;
      const errorCode = routeError?.code || 'UNKNOWN_ERROR';
      const errorMessage = routeError?.message || String(routeError);
      
      res.json({
        ok: true,
        success: false,
        latency,
        error: {
          code: errorCode,
          message: errorMessage,
        },
      });
    }
  } catch (error) {
    console.error('[admin/platform-providers/:id/test] failed:', error);
    return buildError(res, 500, 'INTERNAL_ERROR', error.message || 'Failed to test connection');
  } finally {
    client.release();
  }
});

function getDefaultTestModel(kind) {
  switch (kind) {
    case 'openai_native':
    case 'openai_compatible':
      return 'gpt-4o-mini';
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'deepseek':
      return 'deepseek-chat';
    default:
      return 'gpt-4o-mini';
  }
}

function buildOpenAIModelsUrl(baseUrl) {
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.includes('/chat/completions')) {
    return trimmed.replace(/\/chat\/completions$/i, '') + '/models';
  }
  // If already a base API root, append /models
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/models`;
  }
  return `${trimmed}/v1/models`;
}

function buildAnthropicModelsUrl(baseUrl) {
  const fallback = 'https://api.anthropic.com/v1/models';
  if (!baseUrl) return fallback;
  const trimmed = baseUrl.replace(/\/+$/, '');
  // If admin saved full messages endpoint, replace it.
  if (trimmed.endsWith('/v1/messages')) {
    return trimmed.replace(/\/v1\/messages$/i, '/v1/models');
  }
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/models`;
  }
  // If already root host, append /v1/models
  return `${trimmed}/v1/models`;
}

/**
 * PUT /api/admin/platform-models/bulk
 * Bulk update model flags (enabled_for_users, enabled_in_default)
 */
router.put('/api/admin/platform-models/bulk', async (req, res) => {
  const { updates } = req.body || {};
  
  if (!Array.isArray(updates) || updates.length === 0) {
    return buildError(res, 400, 'INVALID_INPUT', 'updates array is required');
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Preload model metadata for validation (avoid per-row queries).
    const ids = updates.map(u => u?.id).filter(Boolean);
    const metaById = new Map();
    if (ids.length > 0) {
      const metaRes = await client.query(
        `SELECT pm.id, pm.model_key, pp.kind
         FROM platform_models pm
         JOIN platform_providers pp ON pp.id = pm.provider_id
         WHERE pm.id = ANY($1::uuid[])`,
        [ids]
      );
      for (const row of metaRes.rows) {
        metaById.set(row.id, { kind: row.kind, modelKey: row.model_key });
      }
    }

    const invalidModels = [];
    
    let updatedCount = 0;
    
    for (const update of updates) {
      const { id, enabledForUsers, enabledInDefault } = update;
      
      if (!id) continue;

      const meta = metaById.get(id);
      const wantsEnable = enabledForUsers === true || enabledInDefault === true;
      if (wantsEnable && meta?.kind === 'gemini' && !isModelWhitelisted('google', meta.modelKey)) {
        invalidModels.push({ id, modelKey: meta.modelKey });
        continue;
      }
      
      const sets = [];
      const values = [];
      let paramIndex = 1;
      
      if (typeof enabledForUsers === 'boolean') {
        sets.push(`enabled_for_users = $${paramIndex++}`);
        values.push(enabledForUsers);
      }
      
      if (typeof enabledInDefault === 'boolean') {
        sets.push(`enabled_in_default = $${paramIndex++}`);
        values.push(enabledInDefault);
      }
      
      if (sets.length > 0) {
        values.push(id);
        await client.query(`
          UPDATE platform_models
          SET ${sets.join(', ')}, updated_at = NOW()
          WHERE id = $${paramIndex}
        `, values);
        updatedCount++;
      }
    }

    if (invalidModels.length > 0) {
      await client.query('ROLLBACK');
      return buildError(
        res,
        400,
        'MODEL_NOT_ALLOWED',
        `Some models are not allowed by product policy: ${invalidModels.map(m => m.modelKey).join(', ')}`
      );
    }
    
    await client.query('COMMIT');
    
    // Audit log
    await writeAuditLog({
      actorUserId: req.user?.id || null,
      actorRole: 'admin',
      action: 'admin.platform_models.bulk_update',
      targetType: 'platform_models',
      targetId: null,
      ip: getClientIp(req),
      traceId: getTraceId(res, req),
      metadata: {
        updatedCount,
        totalUpdates: updates.length,
      },
    }, client);
    
    res.json({
      ok: true,
      updatedCount,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[admin/platform-models/bulk] PUT failed:', error);
    return buildError(res, 500, 'INTERNAL_ERROR', 'Failed to update models');
  } finally {
    client.release();
  }
});

export default router;
