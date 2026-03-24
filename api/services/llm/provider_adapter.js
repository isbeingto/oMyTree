/**
 * T32-0: Provider Adapter
 * 
 * 将旧的 Provider 接口适配到新的 LLMRouter
 * 这个适配层允许渐进式迁移，不破坏现有代码
 */

import { routeLLM, PROVIDER_KINDS, PROVIDER_SOURCES } from './router.js';

/**
 * 创建一个兼容旧 Provider 接口的适配器
 * 
 * 旧接口:
 *   provider.callChat({ prompt, messages, options })
 *   provider.callChatStream({ prompt, messages, options })
 * 
 * 新接口:
 *   routeLLM({ providerKind, apiKey, model, messages, stream, ... })
 * 
 * @param {Object} config
 * @param {string} config.providerKind - Provider 类型
 * @param {string} config.apiKey - API 密钥
 * @param {string} [config.baseUrl] - API 基础 URL
 * @param {boolean} [config.isByok=false] - 是否使用用户自带密钥
 * @param {string} [config.providerId] - 供调用方覆盖 providerId/label，默认按 providerKind 生成
 * @param {string} [config.defaultModel] - 供调用方覆盖默认模型
 * @returns {Object} 兼容旧接口的 Provider 对象
 */
export function createProviderAdapter({
  providerKind,
  apiKey,
  baseUrl,
  isByok = false,
  providerId = null,
  defaultModel = null,
}) {
  const providerSource = isByok ? PROVIDER_SOURCES.BYOK : PROVIDER_SOURCES.PLATFORM;
  const id = providerId || `adapted-${providerKind}`;
  const providerName = providerId || getProviderName(providerKind);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl, providerKind);
  const resolvedDefaultModel = resolveDefaultModel(providerKind, defaultModel);
  
  return {
    id,
    
    isAvailable() {
      return Boolean(apiKey);
    },
    
    /**
     * 非流式调用 - 兼容旧接口
     */
    async callChat({ prompt, messages = null, options = {} }) {
      const normalizedMessages = buildMessages(prompt, messages);
      
      const request = {
        providerSource,
        providerKind,
        providerId: id,
        apiKey,
        baseUrl: normalizedBaseUrl,
        model: options.model || resolvedDefaultModel,
        messages: normalizedMessages,
        stream: false,
        maxTokens: options.max_tokens,
        temperature: options.temperature,
        enableGrounding: options.enableGrounding,
        responseSchema: options.responseSchema,
        responseMimeType: options.responseMimeType,
        timeoutMs: options.timeout_ms,
        signal: options.signal,
        traceId: options.traceId,
        attachments: options.attachments,
      };
      
      const result = await routeLLM(request);
      
      // 转换为旧格式
      if (result.ok) {
        return {
          ai_text: result.text || '',
          usage_json: result.usage ? {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
            ...result.usage.raw,
          } : null,
          model: result.model || request.model,
          provider: providerName,
          is_byok: result.isByok,
          images: Array.isArray(result.images) && result.images.length > 0 ? result.images : undefined,
        };
      } else {
        // 抛出错误以兼容旧的错误处理
        const error = new Error(result.error?.message || 'LLM request failed');
        error.code = result.error?.code;
        error.provider = providerName;
        error.status = result.error?.httpStatus || 500;
        error.isByok = result.error?.isByok;
        error.isLlmError = true;
        throw error;
      }
    },
    
    /**
     * 流式调用 - 兼容旧接口
     */
    async *callChatStream({ prompt, messages = null, options = {} }) {
      const normalizedMessages = buildMessages(prompt, messages);
      
      const request = {
        providerSource,
        providerKind,
        providerId: id,
        apiKey,
        baseUrl: normalizedBaseUrl,
        model: options.model || resolvedDefaultModel,
        messages: normalizedMessages,
        stream: true,
        maxTokens: options.max_tokens,
        temperature: options.temperature,
        enableGrounding: options.enableGrounding,
        responseSchema: options.responseSchema,
        responseMimeType: options.responseMimeType,
        timeoutMs: options.timeout_ms,
        signal: options.signal,
        traceId: options.traceId,
        attachments: options.attachments,
      };
      
      const stream = await routeLLM(request);
      
      // 转换为旧格式
      for await (const chunk of stream) {
        if (chunk.type === 'error') {
          // 抛出错误
          const error = new Error(chunk.error?.message || 'Stream error');
          error.code = chunk.error?.code;
          error.provider = chunk.error?.provider;
          error.isLlmError = true;
          throw error;
        }
        
        if (chunk.type === 'delta' && chunk.deltaText) {
          yield {
            type: 'delta',
            text: chunk.deltaText,
            provider: providerName,
            model: request.model,
            is_byok: isByok,
          };
        }

        if (chunk.type === 'reasoning' && chunk.reasoningText) {
          yield {
            type: 'reasoning',
            text: chunk.reasoningText,
            provider: providerName,
            model: request.model,
            is_byok: isByok,
          };
        }
        
        if (chunk.type === 'usage' && chunk.usage) {
          yield {
            type: 'usage',
            usage: {
              prompt_tokens: chunk.usage.promptTokens,
              completion_tokens: chunk.usage.completionTokens,
              total_tokens: chunk.usage.totalTokens,
              ...chunk.usage.raw,
            },
            fullReasoning: typeof chunk.fullReasoning === 'string' ? chunk.fullReasoning : undefined,
            groundingMetadata:
              chunk.groundingMetadata && typeof chunk.groundingMetadata === 'object'
                ? chunk.groundingMetadata
                : undefined,
            images: Array.isArray(chunk.images) && chunk.images.length > 0 ? chunk.images : undefined,
            provider: providerName,
            model: request.model,
            is_byok: isByok,
          };
        }
      }
    },
  };
}

/**
 * 从 prompt 和 messages 构建标准化的消息列表
 */
function buildMessages(prompt, messages) {
  if (Array.isArray(messages) && messages.length > 0) {
    return messages
      .map((msg) => {
        if (!msg || typeof msg !== 'object') return null;
        const role = typeof msg.role === 'string' ? msg.role.trim().toLowerCase() : 'user';
        const content = typeof msg.content === 'string' ? msg.content : msg.text;
        if (typeof content !== 'string' || content.trim().length === 0) return null;
        const normalizedRole = role === 'assistant' || role === 'system' ? role : 'user';
        return { role: normalizedRole, content: content.trim() };
      })
      .filter(Boolean);
  }
  
  if (typeof prompt === 'string' && prompt.trim().length > 0) {
    return [{ role: 'user', content: prompt.trim() }];
  }
  
  return [];
}

/**
 * 获取默认模型
 */
function getDefaultModel(providerKind) {
  if (providerKind === PROVIDER_KINDS.GEMINI) {
    return process.env.GOOGLE_LLM_MODEL || 'gemini-2.0-flash';
  }
  return process.env.LLM_MODEL || 'gpt-4';
}

/**
 * 根据配置或类型解析默认模型
 */
function resolveDefaultModel(providerKind, override) {
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return getDefaultModel(providerKind);
}

/**
 * 获取 provider 显示名称
 */
function getProviderName(providerKind) {
  switch (providerKind) {
    case PROVIDER_KINDS.OPENAI_NATIVE:
      return 'openai';
    case PROVIDER_KINDS.GEMINI:
      return 'google';
    case PROVIDER_KINDS.OPENAI_COMPATIBLE:
      return 'openai_compatible';
    default:
      return providerKind;
  }
}

/**
 * 归一化 baseUrl，去掉常见的 /chat/completions 尾部
 */
function normalizeBaseUrl(url, providerKind) {
  if (!url || typeof url !== 'string') {
    return undefined;
  }
  let normalized = url.trim();
  if (!normalized) {
    return undefined;
  }
  if (providerKind === PROVIDER_KINDS.OPENAI_NATIVE || providerKind === PROVIDER_KINDS.OPENAI_COMPATIBLE) {
    normalized = normalized.replace(/\/chat\/completions\/?$/i, '');
  }
  return normalized.replace(/\/+$/, '');
}

export default { createProviderAdapter };
