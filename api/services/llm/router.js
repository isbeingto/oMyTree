/**
 * T32-0: LLM Router
 * 
 * 统一的 LLM 请求路由器
 * - 根据 providerKind 选择对应的 driver
 * - 统一错误处理和响应格式
 * - 支持流式和非流式请求
 */

import { openaiNativeDriver } from './drivers/openai_native.js';
import { openaiCompatibleDriver } from './drivers/openai_compatible.js';
import { geminiDriver } from './drivers/gemini.js';
import { anthropicDriver } from './drivers/anthropic.js';
import { ollamaDriver } from './drivers/ollama.js';
import {
  PROVIDER_KINDS,
  PROVIDER_SOURCES,
  LLM_ERROR_CODES,
  createLLMError,
  createLLMErrorResponse,
  validateLLMRequest,
  getProviderLabel,
} from './types.js';
import { getUserApiKey } from '../user_api_keys.js';
import { getUserByokProviderConfig } from '../user_llm_providers.js';
import { getPlatformProviderConfig } from './platform_provider_store.js';

/**
 * Driver 映射表
 */
const DRIVERS = {
  [PROVIDER_KINDS.OPENAI_NATIVE]: openaiNativeDriver,
  [PROVIDER_KINDS.OPENAI_COMPATIBLE]: openaiCompatibleDriver,
  [PROVIDER_KINDS.GEMINI]: geminiDriver,
  [PROVIDER_KINDS.DEEPSEEK]: openaiCompatibleDriver,
  [PROVIDER_KINDS.ANTHROPIC]: anthropicDriver,
  [PROVIDER_KINDS.OLLAMA]: ollamaDriver,
};

/**
 * 主路由函数
 * 
 * @param {import('./types.js').LLMRequest} request
 * @returns {Promise<import('./types.js').LLMResponse> | AsyncGenerator<import('./types.js').LLMChunk>}
 */
export async function routeLLM(request) {
  // 验证请求
  const validation = validateLLMRequest(request);
  if (!validation.valid) {
    const error = createLLMError({
      code: LLM_ERROR_CODES.INVALID_REQUEST,
      provider: request?.providerKind || 'unknown',
      message: validation.error,
      isByok: request?.providerSource === PROVIDER_SOURCES.BYOK,
    });
    
    if (request?.stream) {
      return (async function* () {
        yield { done: true, type: 'error', error };
      })();
    }
    return createLLMErrorResponse(error);
  }
  
  // 获取对应的 driver
  const driver = DRIVERS[request.providerKind];
  if (!driver) {
    const error = createLLMError({
      code: LLM_ERROR_CODES.INVALID_REQUEST,
      provider: request.providerKind,
      message: `Unsupported provider kind: ${request.providerKind}`,
      isByok: request.providerSource === PROVIDER_SOURCES.BYOK,
    });
    
    if (request.stream) {
      return (async function* () {
        yield { done: true, type: 'error', error };
      })();
    }
    return createLLMErrorResponse(error);
  }
  
  // 记录请求日志
  const isByok = request.providerSource === PROVIDER_SOURCES.BYOK;
  console.log(
    `[LLMRouter] Routing request: kind=${request.providerKind} model=${request.model} ` +
    `source=${request.providerSource} stream=${!!request.stream} traceId=${request.traceId || 'none'}`
  );
  
  try {
    // 调用 driver
    const result = await driver(request);
    
    // 如果是流式返回，包装以确保错误被正确处理
    if (request.stream && result && typeof result[Symbol.asyncIterator] === 'function') {
      return wrapStream(result, request);
    }
    
    return result;
  } catch (err) {
    console.error(`[LLMRouter] Unexpected error:`, err);
    const error = createLLMError({
      code: LLM_ERROR_CODES.INTERNAL_ERROR,
      provider: request.providerKind,
      message: err.message,
      isByok,
    });
    
    if (request.stream) {
      return (async function* () {
        yield { done: true, type: 'error', error };
      })();
    }
    return createLLMErrorResponse(error);
  }
}

/**
 * 包装流式响应，确保错误被正确处理
 */
async function* wrapStream(stream, request) {
  try {
    for await (const chunk of stream) {
      yield chunk;
    }
  } catch (err) {
    console.error(`[LLMRouter] Stream error:`, err);
    const error = createLLMError({
      code: LLM_ERROR_CODES.INTERNAL_ERROR,
      provider: request.providerKind,
      message: err.message,
      isByok: request.providerSource === PROVIDER_SOURCES.BYOK,
    });
    yield { done: true, type: 'error', error };
  }
}

/**
 * 高层 API: 根据用户 ID 和 provider hint 解析并路由请求
 * 
 * 这个函数整合了现有的 resolveProviderForRequest 逻辑，
 * 提供更简洁的调用方式
 * 
 * @param {Object} params
 * @param {string} [params.userId] - 用户 ID (用于 BYOK 查找)
 * @param {string} [params.providerHint] - 提供商提示 ('openai' | 'google' | 'gemini')
 * @param {string} params.model - 模型名称
 * @param {Array<{role: string, content: string}>} params.messages - 消息列表
 * @param {boolean} [params.stream=false] - 是否流式
 * @param {number} [params.maxTokens] - 最大 token
 * @param {number} [params.temperature] - 温度
 * @param {string} [params.traceId] - 追踪 ID
 * @param {AbortSignal} [params.signal] - 取消信号
 * @returns {Promise<import('./types.js').LLMResponse | AsyncGenerator<import('./types.js').LLMChunk>>}
 */
export async function routeLLMWithResolve({
  userId,
  providerHint,
  model,
  messages,
  stream = false,
  maxTokens,
  temperature,
  traceId,
  signal,
}) {
  // 解析 provider 配置
  const resolved = await resolveProvider({ userId, providerHint });
  
  if (!resolved.apiKey) {
    const error = createLLMError({
      code: LLM_ERROR_CODES.INVALID_REQUEST,
      provider: resolved.providerKind || 'unknown',
      message: 'No API key available',
      isByok: resolved.providerSource === PROVIDER_SOURCES.BYOK,
    });
    
    if (stream) {
      return (async function* () {
        yield { done: true, type: 'error', error };
      })();
    }
    return createLLMErrorResponse(error);
  }
  
  // 构建请求
  const request = {
    providerSource: resolved.providerSource,
    providerKind: resolved.providerKind,
    providerId: resolved.providerId,
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl,
    model: model || resolved.defaultModel,
    messages,
    stream,
    maxTokens,
    temperature,
    traceId,
    signal,
  };
  
  return routeLLM(request);
}

/**
 * 解析 Provider 配置
 * 
 * 优先级:
 * 1. 用户 BYOK (openai/google)
 * 2. 管理员配置的默认 provider
 * 3. 环境变量配置的默认 provider
 * 
 * @param {Object} params
 * @param {string} [params.userId] - 用户 ID
 * @param {string} [params.providerHint] - 提供商提示
 * @returns {Promise<{providerSource: string, providerKind: string, providerId: string, apiKey: string, baseUrl?: string, defaultModel?: string}>}
 */
async function resolveProvider({ userId, providerHint }) {
  const normalizedHint = typeof providerHint === 'string' ? providerHint.trim().toLowerCase() : null;
  const mappedHint = normalizedHint === 'gemini' ? 'google' : normalizedHint;
  
  // 支持的 BYOK provider 列表
  const BYOK_PROVIDERS = ['openai', 'google', 'anthropic', 'deepseek'];
  
  // 1. 尝试用户 BYOK
  if (userId && BYOK_PROVIDERS.includes(mappedHint)) {
    try {
      const byokConfig = await getUserByokProviderConfig(userId, mappedHint);
      if (byokConfig?.apiKey) {
        console.log(`[LLMRouter] Using BYOK for user=${userId.slice(0, 8)}... provider=${mappedHint}`);
        
        const providerKind = mapProviderToKind(mappedHint);
        
        // 为不同 provider 设置默认 baseUrl
        let baseUrl = byokConfig.baseUrl;
        if (!baseUrl) {
          if (mappedHint === 'deepseek') {
            baseUrl = 'https://api.deepseek.com/v1';
          } else if (mappedHint === 'anthropic') {
            baseUrl = 'https://api.anthropic.com/v1';
          }
          // openai/google 不需要设置，driver 有默认值
        }
        
        return {
          providerSource: PROVIDER_SOURCES.BYOK,
          providerKind,
          providerId: `user-${userId}-${mappedHint}`,
          apiKey: byokConfig.apiKey,
          baseUrl,
          defaultModel: byokConfig.enabledModels[0] || getDefaultModel(mappedHint),
        };
      }

      const userKey = await getUserApiKey(userId, mappedHint);
      if (userKey) {
        console.log(`[LLMRouter] Using BYOK (legacy) for user=${userId.slice(0, 8)}... provider=${mappedHint}`);
        
        const providerKind = mapProviderToKind(mappedHint);
        
        return {
          providerSource: PROVIDER_SOURCES.BYOK,
          providerKind,
          providerId: `user-${userId}-${mappedHint}`,
          apiKey: userKey,
          defaultModel: getDefaultModel(mappedHint),
        };
      }
    } catch (err) {
      console.warn(`[LLMRouter] Failed to load BYOK for ${mappedHint}:`, err.message);
    }
  }
  
  // 2. 尝试平台默认配置 (platform_providers 表)
  try {
    const platformConfig = await getPlatformProviderConfig({ providerHint: normalizedHint });
    if (platformConfig?.apiKey) {
      console.log(`[LLMRouter] Using platform provider: ${platformConfig.slug}`);
      
      const providerKind = mapProviderToKind(platformConfig.kind);
      
      return {
        providerSource: PROVIDER_SOURCES.PLATFORM,
        providerKind,
        providerId: platformConfig.providerId,
        apiKey: platformConfig.apiKey,
        baseUrl: platformConfig.baseUrl,
        defaultModel: platformConfig.defaultModel || getDefaultModel(platformConfig.kind),
      };
    }
  } catch (err) {
    console.warn(`[LLMRouter] Failed to load platform config:`, err.message);
  }
  
  // 3. 环境变量 fallback
  const envApiKey = process.env.OPENAI_API_KEY;
  if (envApiKey) {
    console.log(`[LLMRouter] Using env fallback: OPENAI_API_KEY`);
    return {
      providerSource: PROVIDER_SOURCES.PLATFORM,
      providerKind: PROVIDER_KINDS.OPENAI_COMPATIBLE,
      providerId: 'env-default',
      apiKey: envApiKey,
      baseUrl: process.env.OPENAI_API_BASE,
      defaultModel: process.env.LLM_MODEL || 'gpt-4',
    };
  }
  
  // 无可用配置
  console.warn(`[LLMRouter] No provider configuration available`);
  return {
    providerSource: PROVIDER_SOURCES.PLATFORM,
    providerKind: PROVIDER_KINDS.OPENAI_NATIVE,
    providerId: 'none',
    apiKey: null,
    defaultModel: null,
  };
}

/**
 * 将 provider 名称映射到 providerKind
 */
function mapProviderToKind(provider) {
  const normalized = typeof provider === 'string' ? provider.toLowerCase() : '';
  
  if (normalized === 'openai') {
    return PROVIDER_KINDS.OPENAI_NATIVE;
  }
  if (normalized === 'google' || normalized === 'gemini') {
    return PROVIDER_KINDS.GEMINI;
  }
  if (normalized === 'openai_compatible') {
    return PROVIDER_KINDS.OPENAI_COMPATIBLE;
  }
  if (normalized === 'deepseek') {
    return PROVIDER_KINDS.DEEPSEEK;
  }
  if (normalized === 'anthropic' || normalized === 'claude') {
    return PROVIDER_KINDS.ANTHROPIC;
  }
  
  // 默认使用 OpenAI Compatible (兼容大多数第三方 API)
  return PROVIDER_KINDS.OPENAI_COMPATIBLE;
}

/**
 * 获取默认模型
 */
function getDefaultModel(provider) {
  const normalized = typeof provider === 'string' ? provider.toLowerCase() : '';
  
  if (normalized === 'google' || normalized === 'gemini') {
    return process.env.GOOGLE_LLM_MODEL || 'gemini-2.0-flash';
  }
  
  if (normalized === 'deepseek') {
    return 'deepseek-chat';
  }
  
  if (normalized === 'anthropic' || normalized === 'claude') {
    return 'claude-sonnet-4-20250514';
  }
  
  return process.env.LLM_MODEL || 'gpt-4';
}

/**
 * 导出类型和常量 - 从 types.js 重新导出
 */
export {
  PROVIDER_KINDS,
  PROVIDER_SOURCES,
  LLM_ERROR_CODES,
  createLLMError,
  createLLMResponse,
  createLLMErrorResponse,
  getProviderLabel,
} from './types.js';

export default { routeLLM, routeLLMWithResolve };
