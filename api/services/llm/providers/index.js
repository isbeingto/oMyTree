/**
 * LLM Providers 统一入口
 * 
 * 这个模块负责：
 * 1. 初始化 Provider Registry
 * 2. 注册所有可用的 Provider
 * 3. 设置默认 Provider
 * 4. 支持使用用户自带的 API Key (BYOK)
 * 
 * 配置来源：ecosystem.config.js (通过 process.env)
 */

import registry from './registry.js';
import { omytreeDefaultProvider } from './omytree-default.js';
import { openaiProviderInstance } from './openai.js';
import { mockProviderInstance } from './mock.js';
import { createUserKeyProvider } from './user_key.js';
import { getUserApiKey } from '../../user_api_keys.js';
import { getUserByokProviderConfig, getUserByokProviderByModel } from '../../user_llm_providers.js';
import { createProviderAdapter } from '../provider_adapter.js';
import { getPlatformProviderConfig } from '../platform_provider_store.js';
import { filterWhitelistedModels } from '../model_policies.js';

// 注册所有 Provider
registry.register(omytreeDefaultProvider);
registry.register(openaiProviderInstance);
registry.register(mockProviderInstance);

// 设置默认 Provider
// 优先级：有 API Key 时用 omytree-default，否则用 mock
const defaultProviderId = omytreeDefaultProvider.isAvailable() 
  ? 'omytree-default' 
  : 'mock';

const PROVIDER_DEBUG_LOGS = (() => {
  const raw = (process.env.LLM_PROVIDER_DEBUG || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
})();

function providerDebugLog(...args) {
  if (PROVIDER_DEBUG_LOGS) {
    console.log(...args);
  }
}

registry.setDefault(defaultProviderId);

console.log(`[LLM Providers] Initialized with default: ${defaultProviderId}`);
console.log(`[LLM Providers] Available providers:`, registry.list().map(p => `${p.id}(${p.available ? '✓' : '✗'})`).join(', '));

function resolveDefaultModel(providerId) {
  const normalized = typeof providerId === 'string' ? providerId.trim().toLowerCase() : '';
  if (normalized === 'google' || normalized === 'gemini') {
    return process.env.GOOGLE_LLM_MODEL || 'gemini-3-flash-preview';
  }
  if (normalized === 'anthropic' || normalized === 'claude') {
    return process.env.ANTHROPIC_LLM_MODEL || 'claude-sonnet-4-20250514';
  }
  if (normalized === 'deepseek') {
    return process.env.DEEPSEEK_LLM_MODEL || 'deepseek-chat';
  }
  // omytree-default / openai share the same OpenAI-compatible fallback
  return process.env.LLM_MODEL || 'gpt-4';
}

// 导出
export { registry };
export { omytreeDefaultProvider } from './omytree-default.js';
export { openaiProviderInstance, openaiProvider, openaiJsonProvider, parseOpenAiJson, OpenAIJsonParseError } from './openai.js';
export { mockProviderInstance, mockProvider } from './mock.js';
export { createUserKeyProvider, UserKeyProvider } from './user_key.js';
export { LLMProvider } from './base.js';

/**
 * 获取 Provider（统一入口）
 * 
 * @param {string} [providerId] - Provider ID，不指定则返回默认
 * @returns {import('./base.js').LLMProvider}
 */
export function getProvider(providerId) {
  const provider = registry.get(providerId);
  if (!provider) {
    console.warn(`[LLM Providers] Provider '${providerId}' not found, falling back to default`);
    return registry.getDefault();
  }
  return provider;
}

/**
 * 获取默认 Provider
 * @returns {import('./base.js').LLMProvider}
 */
export function getDefaultProvider() {
  return registry.getDefault();
}

/**
 * 列出所有 Provider
 */
export function listProviders() {
  return registry.list();
}

export default registry;

/**
 * Resolve provider with priority:
 * 1) User BYOK (openai/google)
 * 2) Admin-configured default (gemini/deepseek/openai_compatible)
 * 3) Environment default (omytree-default/openai)
 * 4) Mock (fallback)
 *
 * @param {object} params
 * @param {string} [params.providerHint] - Optional provider hint/override
 * @param {string} [params.modelHint] - Optional model hint; when providerHint is 'omytree-default', used to infer the correct platform provider
 * @param {string} [params.userId] - User ID for BYOK lookup
 * @returns {Promise<{provider: import('./base.js').LLMProvider, name: string, isByok: boolean, defaultModel?: string|null}>}
 */
export async function resolveProviderForRequest({ providerHint = null, modelHint = null, userId = null } = {}) {
  const normalizedHint =
    typeof providerHint === 'string' ? providerHint.trim().toLowerCase() : null;
  // 将 gemini 映射到 google，将 claude 映射到 anthropic
  let mappedHint = normalizedHint;
  if (normalizedHint === 'gemini') mappedHint = 'google';
  if (normalizedHint === 'claude') mappedHint = 'anthropic';

  providerDebugLog(`[resolveProvider] providerHint=${providerHint} normalizedHint=${normalizedHint} mappedHint=${mappedHint} userId=${userId?.slice(0,8)}...`);

  if (normalizedHint === 'mock') {
    return { provider: getProvider('mock'), name: 'mock', isByok: false, defaultModel: null };
  }

  // Ollama: frontend sends provider='ollama' + model=<key>
  // Look up user's Ollama config from user_llm_providers
  if (normalizedHint === 'ollama' && userId) {
    try {
      const ollamaConfig = await getUserByokProviderConfig(userId, 'ollama');
      if (ollamaConfig) {
        const baseUrl = ollamaConfig.baseUrl || 'http://localhost:11434';
        const adapter = createProviderAdapter({
          providerKind: 'ollama',
          apiKey: 'ollama', // Ollama doesn't require a real API key
          baseUrl,
          defaultModel: ollamaConfig.enabledModels?.[0] || (typeof modelHint === 'string' ? modelHint.trim() : 'llama3.2'),
          isByok: false,
          providerId: 'ollama',
        });

        providerDebugLog(`[resolveProvider] Ollama: baseUrl=${baseUrl} model=${modelHint}`);
        return {
          provider: adapter,
          name: 'ollama',
          isByok: false,
          providerKind: 'ollama',
          defaultModel: ollamaConfig.enabledModels?.[0] || (typeof modelHint === 'string' ? modelHint.trim() : null),
          allowedModels: ollamaConfig.enabledModels || [],
        };
      }
    } catch (error) {
      console.warn(`[resolveProvider] Ollama lookup failed:`, error?.message);
    }
  }
  if (normalizedHint === 'byok' && userId) {
    const normalizedModelHint = typeof modelHint === 'string' ? modelHint.trim() : null;
    if (normalizedModelHint) {
      try {
        const byokByModel = await getUserByokProviderByModel(userId, normalizedModelHint);
        if (byokByModel?.apiKey && byokByModel.kind) {
          const providerKind = mapProviderKind(byokByModel.kind);
          const allowedModels =
            byokByModel.kind === 'google'
              ? filterWhitelistedModels('google', byokByModel.enabledModels)
              : byokByModel.enabledModels;

          let baseUrl = byokByModel.baseUrl;
          if (!baseUrl) {
            if (byokByModel.kind === 'deepseek') baseUrl = 'https://api.deepseek.com/v1';
            else if (byokByModel.kind === 'anthropic') baseUrl = 'https://api.anthropic.com/v1';
          }

          const adapter = createProviderAdapter({
            providerKind,
            apiKey: byokByModel.apiKey,
            baseUrl,
            defaultModel: allowedModels[0] || resolveDefaultModel(byokByModel.kind),
            isByok: true,
            providerId: byokByModel.kind,
          });

          providerDebugLog(`[resolveProvider] Unified BYOK: model=${normalizedModelHint} → kind=${byokByModel.kind}`);
          return {
            provider: adapter,
            name: byokByModel.kind,
            isByok: true,
            providerKind,
            defaultModel: allowedModels[0] || resolveDefaultModel(byokByModel.kind),
            allowedModels,
          };
        }
      } catch (error) {
        console.warn(`[resolveProvider] Unified BYOK lookup failed:`, error?.message);
      }
    }
    // Could not resolve BYOK by model - fall through to other paths
    console.warn(`[resolveProvider] BYOK hint with no matching model, falling through`);
  }

  // BYOK - 支持 openai, google, anthropic, deepseek (legacy per-provider hint)
  if (userId && (mappedHint === 'openai' || mappedHint === 'google' || mappedHint === 'anthropic' || mappedHint === 'deepseek')) {
    try {
      const byokConfig = await getUserByokProviderConfig(userId, mappedHint);
      providerDebugLog(`[resolveProvider] BYOK check: mappedHint=${mappedHint} byokConfig=${byokConfig ? 'found' : 'null'} apiKey=${byokConfig?.apiKey ? 'present' : 'missing'}`);
      if (byokConfig?.apiKey) {
        const providerKind = mapProviderKind(mappedHint);
        const allowedModels =
          mappedHint === 'google'
            ? filterWhitelistedModels('google', byokConfig.enabledModels)
            : byokConfig.enabledModels;

        if (mappedHint === 'google' && allowedModels.length === 0) {
          console.warn('[resolveProvider] BYOK google has no whitelisted enabled models; skipping BYOK routing');
        } else {
        
        // 为不同 provider 设置默认 baseUrl
        let baseUrl = byokConfig.baseUrl;
        if (!baseUrl) {
          if (mappedHint === 'deepseek') {
            baseUrl = 'https://api.deepseek.com/v1';
          } else if (mappedHint === 'anthropic') {
            baseUrl = 'https://api.anthropic.com/v1';
          }
        }
        
        const adapter = createProviderAdapter({
          providerKind,
          apiKey: byokConfig.apiKey,
          baseUrl,
          defaultModel: allowedModels[0] || resolveDefaultModel(mappedHint),
          isByok: true,
          providerId: mappedHint,
        });
        return {
          provider: adapter,
          name: mappedHint,
          isByok: true,
          providerKind,
          defaultModel: allowedModels[0] || resolveDefaultModel(mappedHint),
          allowedModels,
        };
        }
      }

      const userKey = await getUserApiKey(userId, mappedHint);
      if (userKey) {
        providerDebugLog(
          `[LLM Providers] Using user's ${mappedHint} key for user=${userId.slice(0, 8)}...`
        );
        return {
          provider: createUserKeyProvider(mappedHint, userKey),
          name: mappedHint,
          isByok: true,
          providerKind: mapProviderKind(mappedHint),
          defaultModel: resolveDefaultModel(mappedHint),
        };
      }
    } catch (error) {
      console.warn(`[LLM Providers] Failed to load user key for ${mappedHint}:`, error.message);
    }
  }

  // Platform provider (multi-vendor table)
  let platformConfig = null;
  const isPlatformDefaultRequest = !normalizedHint || normalizedHint === 'omytree-default';
  try {
    const normalizedModelHint = typeof modelHint === 'string' ? modelHint.trim() : null;
    platformConfig = await getPlatformProviderConfig({ providerHint: normalizedHint, modelHint: normalizedModelHint });
    if (platformConfig?.apiKey) {
      const providerKind = mapProviderKind(platformConfig.kind);
      const adapter = createProviderAdapter({
        providerKind,
        apiKey: platformConfig.apiKey,
        baseUrl: platformConfig.baseUrl || undefined,
        providerId: platformConfig.slug || platformConfig.providerId,
        defaultModel: platformConfig.defaultModel,
      });

      return {
        provider: adapter,
        name: platformConfig.slug || platformConfig.name || platformConfig.kind,
        isByok: false,
        providerKind,
        defaultModel: platformConfig.defaultModel,
        allowedModels: Array.isArray(platformConfig.enabledModels) ? platformConfig.enabledModels : null,
      };
    }
  } catch (err) {
    console.warn('[LLM Providers] Failed to load platform provider config:', err.message);
  }

  // Fallback to env-configured provider
  // Only preserve allowedModels from platform config when using "omytree-default"
  // to avoid restricting model choices when user explicitly selected a provider
  const fallback =
    (normalizedHint && getProvider(normalizedHint)) ||
    getDefaultProvider() ||
    getProvider('mock');
  const fallbackName = fallback?.id || 'mock';
  
  // Preserve allowedModels from platform config only for "omytree-default" requests
  // When a specific provider is requested (e.g., "openai"), we don't enforce platform model restrictions
  const platformAllowedModels = isPlatformDefaultRequest && platformConfig && Array.isArray(platformConfig.enabledModels) 
    ? platformConfig.enabledModels 
    : null;

  return { 
    provider: fallback, 
    name: isPlatformDefaultRequest && platformConfig?.slug ? platformConfig.slug : fallbackName, 
    isByok: false, 
    providerKind: mapProviderKind(isPlatformDefaultRequest && platformConfig?.kind ? platformConfig.kind : fallbackName), 
    defaultModel: isPlatformDefaultRequest && platformConfig?.defaultModel ? platformConfig.defaultModel : resolveDefaultModel(fallbackName),
    allowedModels: platformAllowedModels,
  };
}

function mapProviderKind(kind) {
  const normalized = typeof kind === 'string' ? kind.trim().toLowerCase() : '';
  if (normalized === 'openai_compatible') return 'openai_compatible';
  if (normalized === 'gemini' || normalized === 'google') return 'gemini';
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  if (normalized === 'deepseek') return 'deepseek';
  if (normalized === 'ollama') return 'ollama';
  return 'openai_native';
}
