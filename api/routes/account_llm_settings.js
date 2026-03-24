/**
 * User LLM Settings API
 * 
 * Endpoints:
 *   GET    /api/account/llm-settings       - Get user's preferred LLM provider + usage
 *   POST   /api/account/llm-settings       - Update user's preferred LLM provider
 *   POST   /api/account/test-llm           - Test connection with user's API key
 *   GET    /api/account/llm-models         - Get static model list for providers
 *   POST   /api/account/llm-models/refresh - Fetch latest models from provider (using user's key)
 */

import express from 'express';
import { pool } from '../db/pool.js';
import { getAuthUserIdForRequest, isDemoUserId } from '../lib/auth_user.js';
import { withTraceId } from '../lib/trace.js';
import { getUserApiKey } from '../services/user_api_keys.js';
import { createProviderAdapter } from '../services/llm/provider_adapter.js';
import { PROVIDER_KINDS } from '../services/llm/types.js';
import { getUserByokProviderConfig, hasUserByokProvider, hasActiveUserProviders } from '../services/user_llm_providers.js';
import rateLimits, { getCurrentWeekStartUTC, getNextMondayMidnightUTC } from '../config/rate_limits.js';
import { isLlmError, mapLlmError, recordLlmErrorEvent } from '../services/llm/errors.js';

const VALID_PROVIDERS = new Set(['omytree-default', 'openai', 'google', 'anthropic', 'deepseek']);

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'string') return 'free';
  const normalized = raw.toLowerCase().trim();
  if (normalized === 'free' || normalized === 'pro' || normalized === 'team') {
    return normalized;
  }
  return 'free';
}

function buildWeekBucket(now) {
  const weekStart = getCurrentWeekStartUTC(now);
  const year = weekStart.getUTCFullYear();
  const month = weekStart.getUTCMonth();
  const day = weekStart.getUTCDate();
  return `W${year}${pad(month + 1)}${pad(day)}`;
}

async function getWeeklyCount(redis, key) {
  const raw = await redis.get(key);
  const parsed = Number.parseInt(String(raw ?? '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Static model lists for each provider
 */
const PROVIDER_MODELS = {
  openai: {
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model, multimodal' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and cost-effective' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'High-performance GPT-4' },
      { id: 'gpt-4', name: 'GPT-4', description: 'Original GPT-4' },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and economical' },
    ],
  },
  google: {
    name: 'Google AI',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Latest fast model' },
      { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Lightweight fast model' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable, 1M context' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast and versatile' },
      { id: 'gemini-1.5-flash-8b', name: 'Gemini 1.5 Flash 8B', description: 'Compact and efficient' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Latest and most capable' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Extended thinking mode' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest response' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Most capable Claude 3' },
    ],
  },
  deepseek: {
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', description: 'Conversational model' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', description: 'Reasoning-focused' },
    ],
  },
};

function invalid(res, status, code, message) {
  return res.status(status).json(
    withTraceId(res, {
      ok: false,
      error: code,
      message: message || code,
    })
  );
}

export default function createLlmSettingsRouter({ redis } = {}) {
  const router = express.Router();

  /**
   * GET /api/account/llm-settings
   * Get user's preferred LLM provider + usage stats
   */
  router.get('/api/account/llm-settings', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);
      
      // Demo users always use default
      if (isDemoUserId(userId)) {
        const now = new Date();
        const resetAt = getNextMondayMidnightUTC(now).toISOString();
        const weeklyLimit = rateLimits.turn?.perWeek?.free ?? 0;
        return res.json(withTraceId(res, {
          ok: true,
          provider: 'omytree-default',
          is_demo: true,
          message: 'Demo users use the default model',
          usage: {
            weekly: {
              used: 0,
              limit: weeklyLimit,
              remaining: weeklyLimit,
              reset_at: resetAt,
              plan: 'free',
            },
          },
        }));
      }

      const { rows } = await client.query(
        `SELECT preferred_llm_provider, enable_advanced_context FROM users WHERE id = $1`,
        [userId]
      );

      const provider = rows[0]?.preferred_llm_provider || 'omytree-default';
      const enableAdvancedContext = Boolean(rows[0]?.enable_advanced_context);
      const hasActiveByok = await hasActiveUserProviders(userId);

      // Check if user has configured API keys for their preferred provider
      let has_key = false;
      if (provider === 'openai' || provider === 'google') {
        has_key = await hasUserByokProvider(userId, provider);
        if (!has_key) {
          const userKey = await getUserApiKey(userId, provider);
          has_key = !!userKey;
        }
      }

      // Get usage stats (current source of truth: Redis-based rate/quota system)
      // Only meaningful when using the official default provider.
      let usage = null;
      try {
        if (redis && provider === 'omytree-default') {
          const planRow = await client.query(`SELECT plan FROM users WHERE id = $1 LIMIT 1`, [userId]);
          const plan = normalizePlan(planRow.rows[0]?.plan);

          const now = new Date();
          const bucket = buildWeekBucket(now);
          const resetAt = getNextMondayMidnightUTC(now).toISOString();
          const weeklyLimit = rateLimits.turn?.perWeek?.[plan] ?? rateLimits.turn?.perWeek?.free ?? 0;
          const used = await getWeeklyCount(redis, `quota:turn:${userId}:${bucket}`);
          usage = {
            weekly: {
              used,
              limit: weeklyLimit,
              remaining: Math.max(weeklyLimit - used, 0),
              reset_at: resetAt,
              plan,
            },
          };
        }
      } catch (error) {
        console.warn('[llm-settings] failed to compute redis usage:', error?.message);
        usage = null;
      }

      return res.json(withTraceId(res, {
        ok: true,
        provider,
        enable_advanced_context: enableAdvancedContext,
        advanced_available: hasActiveByok,
        advanced_disabled_reason: hasActiveByok
          ? null
          : '需先添加并启用至少一个自带模型 API Key 才能开启高级模式',
        has_key,
        usage,
      }));
    } catch (error) {
      console.error('[llm-settings] GET error:', error);
      return invalid(res, 500, 'INTERNAL_ERROR', 'Failed to get LLM settings');
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/llm-settings
   * Update user's preferred LLM provider
   */
  router.post('/api/account/llm-settings', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);
      
      // Demo users cannot change settings
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER', 'Demo users cannot change LLM settings');
      }

      const { provider, enable_advanced_context } = req.body || {};
      const togglingAdvanced = typeof enable_advanced_context === 'boolean';

      const currentRow = await client.query(
        'SELECT preferred_llm_provider, enable_advanced_context FROM users WHERE id = $1',
        [userId]
      );
      const currentProvider = currentRow.rows[0]?.preferred_llm_provider || 'omytree-default';
      const currentAdvanced = Boolean(currentRow.rows[0]?.enable_advanced_context);

      const nextProvider = provider || currentProvider;
      const nextAdvanced = togglingAdvanced ? enable_advanced_context : currentAdvanced;

      if (!nextProvider || !VALID_PROVIDERS.has(nextProvider)) {
        return invalid(res, 400, 'INVALID_PROVIDER', 
          `Provider must be one of: ${Array.from(VALID_PROVIDERS).join(', ')}`);
      }

      const hasActiveByok = await hasActiveUserProviders(userId);
      if (nextAdvanced && !hasActiveByok) {
        return invalid(res, 400, 'ADVANCED_REQUIRES_BYOK',
          '需先添加并启用至少一个自带模型 API Key 才能开启高级模式');
      }

      if (nextAdvanced && nextProvider === 'omytree-default') {
        return invalid(res, 400, 'DEFAULT_BLOCKED_IN_ADVANCED',
          '高级模式开启后不可选择平台默认模型，请选择自带模型');
      }

      // If selecting a custom provider (openai/google/anthropic/deepseek), check if user has a key
      if (nextProvider === 'openai' || nextProvider === 'google' || nextProvider === 'anthropic' || nextProvider === 'deepseek') {
        const hasKey =
          (await hasUserByokProvider(userId, nextProvider)) ||
          Boolean(await getUserApiKey(userId, nextProvider));
        if (!hasKey) {
          return invalid(res, 400, 'NO_API_KEY', 
            `You need to configure an API key for ${nextProvider} first`);
        }
      }

      await client.query(
        `UPDATE users 
         SET preferred_llm_provider = $1,
             enable_advanced_context = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [nextProvider, nextAdvanced, userId]
      );

      console.log(`[llm-settings] User ${userId.slice(0, 8)}... changed provider to ${nextProvider} adv=${nextAdvanced}`);

      return res.json(withTraceId(res, {
        ok: true,
        provider: nextProvider,
        enable_advanced_context: nextAdvanced,
        message: 'LLM settings updated',
      }));
    } catch (error) {
      console.error('[llm-settings] POST error:', error);
      return invalid(res, 500, 'INTERNAL_ERROR', 'Failed to update LLM settings');
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/test-llm
   * Test connection with user's API key
   * 
   * Request body: { provider: "openai" | "google" }
   * Response: { ok: true, success: true/false, message: "..." }
   */
  router.post('/api/account/test-llm', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);
      
      // Demo users cannot test
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER', 'Demo users cannot test API keys');
      }

      const { provider } = req.body || {};
      
      const BYOK_PROVIDERS = ['openai', 'google', 'anthropic', 'deepseek'];
      if (!provider || !BYOK_PROVIDERS.includes(provider)) {
        return invalid(res, 400, 'INVALID_PROVIDER', `Provider must be one of: ${BYOK_PROVIDERS.join(', ')}`);
      }

      const byokConfig = await getUserByokProviderConfig(userId, provider);
      const legacyKey = byokConfig ? null : await getUserApiKey(userId, provider);
      const apiKey = byokConfig?.apiKey || legacyKey;

      if (!apiKey) {
        return invalid(res, 400, 'NO_API_KEY', 
          `No API key configured for ${provider}. Please add one first.`);
      }

      // Map provider to providerKind
      const providerKindMap = {
        openai: PROVIDER_KINDS.OPENAI_NATIVE,
        google: PROVIDER_KINDS.GEMINI,
        anthropic: PROVIDER_KINDS.ANTHROPIC,
        deepseek: PROVIDER_KINDS.DEEPSEEK,
      };
      const defaultModelMap = {
        openai: 'gpt-4o-mini',
        google: 'gemini-2.0-flash',
        anthropic: 'claude-sonnet-4-20250514',
        deepseek: 'deepseek-chat',
      };
      const providerKind = providerKindMap[provider] || PROVIDER_KINDS.OPENAI_COMPATIBLE;
      const testModel = byokConfig?.enabledModels?.[0] || defaultModelMap[provider] || 'gpt-4o-mini';
      const userProvider = createProviderAdapter({
        providerKind,
        apiKey,
        baseUrl: byokConfig?.baseUrl || undefined,
        defaultModel: testModel,
        isByok: true,
        providerId: provider,
      });
      
      // Test with a minimal request
      const testStart = Date.now();
      try {
        const result = await userProvider.callChat({
          messages: [
            { role: 'user', content: 'Hi, this is a test. Reply with just "ok".' }
          ],
          options: {
            model: testModel,
          },
        });

        const elapsed = Date.now() - testStart;
        console.log(`[test-llm] User ${userId.slice(0, 8)}... tested ${provider}: success (${elapsed}ms)`);

        return res.json(withTraceId(res, {
          ok: true,
          success: true,
          provider,
          elapsed_ms: elapsed,
          message: 'Connection successful! Your API key is working.',
        }));
      } catch (llmError) {
        const elapsed = Date.now() - testStart;
        const normalized = isLlmError(llmError)
          ? llmError
          : mapLlmError(llmError, { provider, isByok: true });
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
        return res.status(normalized.status).json(withTraceId(res, {
          ok: false,
          success: false,
          provider,
          elapsed_ms: elapsed,
          error: {
            code: normalized.code,
            provider: normalized.provider,
            message: normalized.message,
          },
          message: normalized.message,
        }));
      }
    } catch (error) {
      console.error('[test-llm] error:', error);
      return invalid(res, 500, 'INTERNAL_ERROR', 'Failed to test connection');
    } finally {
      client.release();
    }
  });

  /**
   * GET /api/account/llm-models
   * Get static model list for providers + user enabled models status
   */
  router.get('/api/account/llm-models', async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = await getAuthUserIdForRequest(req, client);
      const isDemo = isDemoUserId(userId);
      
      // Get user's enabled models
      let enabledModels = {};
      if (!isDemo) {
        const { rows } = await client.query(
          `SELECT provider, model_id, enabled
           FROM user_enabled_models
           WHERE user_id = $1`,
          [userId]
        );
        
        for (const row of rows) {
          if (!enabledModels[row.provider]) {
            enabledModels[row.provider] = {};
          }
          enabledModels[row.provider][row.model_id] = row.enabled;
        }
      }
      
      // Build providers object with enabled status
      const providersWithEnabled = {};
      for (const [providerId, providerInfo] of Object.entries(PROVIDER_MODELS)) {
        providersWithEnabled[providerId] = {
          name: providerInfo.name,
          models: providerInfo.models.map(model => ({
            ...model,
            enabled: enabledModels[providerId]?.[model.id] ?? false,
          })),
        };
      }
      
      return res.json(withTraceId(res, {
        ok: true,
        providers: providersWithEnabled,
        is_demo: isDemo,
      }));
    } catch (error) {
      console.error('[llm-models] GET error:', error);
      return invalid(res, 500, 'INTERNAL_ERROR', 'Failed to get models');
    } finally {
      client.release();
    }
  });

  /**
   * POST /api/account/llm-models/refresh
   * Fetch latest models from provider API (using user's API key)
   * 
   * Request body: { provider: "openai" | "google" }
   */
  router.post('/api/account/llm-models/refresh', async (req, res) => {
    const client = await pool.connect();
    const startTime = Date.now();
    
    try {
      const userId = await getAuthUserIdForRequest(req, client);
      
      // Demo users cannot refresh models
      if (isDemoUserId(userId)) {
        return invalid(res, 403, 'DEMO_USER', 'Demo users cannot refresh models');
      }

      const { provider } = req.body || {};
      
      const REFRESHABLE_PROVIDERS = ['openai', 'google'];
      if (!provider || !REFRESHABLE_PROVIDERS.includes(provider)) {
        return invalid(res, 400, 'INVALID_PROVIDER', `Provider must be one of: ${REFRESHABLE_PROVIDERS.join(', ')}. Note: Anthropic and DeepSeek do not support model listing APIs.`);
      }

      // Get user's API key
      const userKey = await getUserApiKey(userId, provider);
      if (!userKey) {
        return invalid(res, 400, 'NO_API_KEY', 
          `No API key configured for ${provider}. Please add one first.`);
      }

      let models = [];
      let providerName = '';

      if (provider === 'google') {
        // Fetch models from Google Gemini API
        providerName = 'Google AI';
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${userKey}`;
        
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
          
          // Check for common errors
          if (errorMessage.includes('suspended')) {
            return invalid(res, 403, 'KEY_SUSPENDED', 'Your API key has been suspended. Please check your Google Cloud Console.');
          }
          
          return invalid(res, response.status, 'FETCH_FAILED', errorMessage);
        }
        
        const data = await response.json();
        
        // Filter and transform Gemini models
        models = (data.models || [])
          .filter(m => {
            const name = m.name || '';
            const methods = m.supportedGenerationMethods || [];
            // Must support generateContent and be a gemini model
            return name.includes('gemini') && 
                   methods.includes('generateContent') &&
                   !name.includes('embedding') &&
                   !name.includes('aqa');
          })
          .map(m => ({
            id: m.name.replace('models/', ''),
            name: m.displayName || m.name.replace('models/', ''),
            description: m.description || '',
          }))
          .sort((a, b) => {
            // Sort: newer versions first (2.5 > 2.0 > 1.5 > 1.0), stable > preview > exp
            const getVersion = (id) => {
              const match = id.match(/gemini-(\d+\.?\d*)/);
              return match ? parseFloat(match[1]) : 0;
            };
            const getPriority = (id) => {
              if (id.includes('preview') || id.includes('exp')) return 1;
              return 0;
            };
            const versionDiff = getVersion(b.id) - getVersion(a.id);
            if (versionDiff !== 0) return versionDiff;
            return getPriority(a.id) - getPriority(b.id);
          });
          
      } else if (provider === 'openai') {
        // OpenAI models endpoint requires different auth
        providerName = 'OpenAI';
        const url = 'https://api.openai.com/v1/models';
        
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${userKey}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData?.error?.message || `HTTP ${response.status}`;
          return invalid(res, response.status, 'FETCH_FAILED', errorMessage);
        }
        
        const data = await response.json();
        
        // Filter for chat models only
        models = (data.data || [])
          .filter(m => {
            const id = m.id || '';
            // Include GPT models, exclude deprecated and non-chat models
            return (id.startsWith('gpt-') || id.startsWith('o1') || id.startsWith('chatgpt')) &&
                   !id.includes('instruct') &&
                   !id.includes('vision') &&
                   !id.includes('realtime') &&
                   !id.includes('audio');
          })
          .map(m => ({
            id: m.id,
            name: m.id,
            description: m.owned_by || '',
          }))
          .sort((a, b) => {
            // Sort: newer models first
            const getScore = (id) => {
              if (id.includes('o1')) return 100;
              if (id.includes('gpt-4o')) return 90;
              if (id.includes('gpt-4-turbo')) return 80;
              if (id.includes('gpt-4')) return 70;
              if (id.includes('gpt-3.5')) return 60;
              return 0;
            };
            return getScore(b.id) - getScore(a.id);
          });
      }

      const latency = Date.now() - startTime;
      console.log(`[llm-models] User ${userId.slice(0, 8)}... refreshed ${provider} models: ${models.length} models (${latency}ms)`);

      return res.json(withTraceId(res, {
        ok: true,
        provider,
        providerName,
        models,
        count: models.length,
        latency,
        fetchedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('[llm-models/refresh] error:', error);
      return invalid(res, 500, 'INTERNAL_ERROR', 'Failed to fetch models');
    } finally {
      client.release();
    }
  });

  return router;
}
