/**
 * T32-0: LLM Driver Interface Types
 * 
 * 统一的 LLM 请求/响应类型定义
 */

/**
 * @typedef {'platform' | 'byok'} ProviderSource
 * - platform: 使用平台管理员配置的 API Key
 * - byok: 使用用户自带的 API Key (Bring Your Own Key)
 */

/**
 * @typedef {'openai_native' | 'openai_compatible' | 'gemini' | 'anthropic' | 'deepseek'} ProviderKind
 * - openai_native: 官方 OpenAI API
 * - openai_compatible: 兼容 OpenAI 格式的第三方 API（网关/代理）
 * - gemini: Google Gemini API
 * - anthropic: Anthropic Claude API (预留)
 * - deepseek: DeepSeek API (兼容 OpenAI 协议)
 */

/**
 * @typedef {Object} LLMMessage
 * @property {'user' | 'assistant' | 'system'} role - 消息角色
 * @property {string} content - 消息内容
 */

/**
 * @typedef {Object} LLMRequest
 * @property {ProviderSource} providerSource - 密钥来源: 平台或用户自带
 * @property {ProviderKind} providerKind - 提供商类型
 * @property {string} providerId - 配置 ID (平台配置ID或用户BYOK配置ID)
 * @property {string} apiKey - API 密钥
 * @property {string} [baseUrl] - API 基础 URL (可选, 用于 openai_compatible)
 * @property {string} model - 模型名称
 * @property {LLMMessage[]} messages - 消息列表
 * @property {boolean} [stream=false] - 是否流式返回
 * @property {number} [maxTokens] - 最大输出 token 数
 * @property {number} [temperature] - 温度参数
 * @property {string} [responseMimeType] - 结构化输出 MIME 类型（例如 application/json 或 text/x.enum）
 * @property {Object} [responseSchema] - 结构化输出 JSON Schema（Gemini Structured Output 子集）
 * @property {string} [traceId] - 追踪 ID
 * @property {number} [timeoutMs] - 超时时间 (毫秒)
 * @property {AbortSignal} [signal] - 取消信号
 * @property {boolean} [enableGrounding] - 是否启用 Google Search grounding（仅 Gemini 生效）
 * @property {FunctionDeclaration[]} [tools] - Function Calling 工具声明列表（Phase 5 Agent 扩展）
 * @property {'AUTO' | 'ANY' | 'NONE'} [toolChoice] - 工具调用模式（AUTO: 模型自主选择，ANY: 强制调用，NONE: 禁用）
 * @property {FunctionResult[]} [functionResults] - 工具执行结果（FunctionResponse），用于 Function Calling 多步/多轮续写
 * @property {Array<{id?: string, fileName?: string, mimeType?: string, sizeBytes?: number, contentBytes?: Buffer}>} [attachments] - 原始文件附件（供原生 File API 使用）
 */

/**
 * Phase 5: Function Calling 类型定义
 * Docs: https://ai.google.dev/gemini-api/docs/function-calling
 */

/**
 * @typedef {Object} FunctionDeclaration
 * @property {string} name - 函数名称（必须匹配正则 ^[a-zA-Z_][a-zA-Z0-9_]*$）
 * @property {string} [description] - 函数描述，帮助模型理解何时调用
 * @property {FunctionParameters} [parameters] - 函数参数的 JSON Schema
 */

/**
 * @typedef {Object} FunctionParameters
 * @property {'object'} type - 必须是 'object'
 * @property {Object<string, FunctionParameterProperty>} properties - 参数属性定义
 * @property {string[]} [required] - 必需的参数名列表
 */

/**
 * @typedef {Object} FunctionParameterProperty
 * @property {'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object'} type - 参数类型
 * @property {string} [description] - 参数描述
 * @property {string[]} [enum] - 可选的枚举值列表
 * @property {FunctionParameterProperty} [items] - 数组元素类型（当 type='array' 时）
 */

/**
 * @typedef {Object} FunctionCall
 * @property {string} name - 被调用的函数名称
 * @property {Object} [args] - 调用参数（JSON 对象）
 * @property {string | null} [thoughtSignature] - 与本次调用关联的 Thought Signature（多轮/多步 function calling 可能需要）
 * @property {string} [id] - 调用 ID（用于多步调用时的关联）
 */

/**
 * @typedef {Object} FunctionResult
 * @property {string} name - 函数名称
 * @property {Object | string} response - 函数执行结果
 * @property {string | null} [thoughtSignature] - 与该工具结果关联的 Thought Signature（Gemini 3 function calling 必需）
 * @property {string} [id] - 对应的调用 ID
 */

/**
 * @typedef {Object} LLMUsage
 * @property {number} [promptTokens] - 输入 token 数
 * @property {number} [completionTokens] - 输出 token 数
 * @property {number} [thoughtsTokens] - 思考 token 数（Gemini Thinking / 推理 token）
 * @property {number} [cachedTokens] - 缓存命中 token 数（Gemini Context Caching）
 * @property {number} [totalTokens] - 总 token 数
 * @property {Object} [raw] - 原始 usage 数据
 */

/**
 * @typedef {Object} LLMChunk
 * @property {boolean} done - 是否结束
 * @property {'delta' | 'usage' | 'error' | 'reasoning' | 'function_call'} [type] - chunk 类型
 * @property {string} [deltaText] - 增量文本(回答内容)
 * @property {string} [reasoningText] - 增量推理文本(思考过程)
 * @property {string} [fullText] - 完整文本 (仅 done=true 时)
 * @property {string} [fullReasoning] - 完整推理文本 (仅 done=true 时)
 * @property {string} [thoughtSignature] - Gemini Thought Signature（仅在 stream 最终 chunk 或特定事件中出现）
 * @property {LLMUsage} [usage] - token 使用量
 * @property {GroundingMetadata} [groundingMetadata] - Grounding 检索来源（仅 done=true 且启用 grounding 时）
 * @property {FunctionCall[]} [functionCalls] - 模型请求的函数调用（Phase 5 Function Calling）
 * @property {LLMError} [error] - 错误信息
 */

/**
 * @typedef {Object} GroundingMetadata
 * @property {Object} [searchEntryPoint] - 搜索入口点（Gemini 渲染的搜索 UI）
 * @property {Array<Object>} [groundingChunks] - 检索到的文档片段（web/uri/title）
 * @property {Array<Object>} [groundingSupports] - Grounding 支持信息（引用关系）
 */

/**
 * @typedef {Object} LLMResponse
 * @property {boolean} ok - 是否成功
 * @property {string} [text] - 响应文本
 * @property {LLMUsage} [usage] - token 使用量
 * @property {string} [model] - 实际使用的模型
 * @property {string} [provider] - 提供商标识
 * @property {boolean} [isByok] - 是否使用用户自带密钥
 * @property {GroundingMetadata} [groundingMetadata] - Grounding 检索来源（仅 Gemini enableGrounding=true 时）
 * @property {FunctionCall[]} [functionCalls] - 模型请求的函数调用（Phase 5 Function Calling）
 * @property {LLMError} [error] - 错误信息
 */

/**
 * @typedef {Object} LLMError
 * @property {string} code - 错误码 (e.g. 'byok_invalid_key', 'provider_unreachable')
 * @property {string} provider - 提供商标识
 * @property {number} [httpStatus] - HTTP 状态码
 * @property {string} [message] - 错误消息
 * @property {string} [raw] - 原始错误数据
 * @property {boolean} [isByok] - 是否使用用户自带密钥
 */

/**
 * 错误码常量
 */
export const LLM_ERROR_CODES = {
  // BYOK 相关错误
  BYOK_INVALID_KEY: 'byok_invalid_key',
  BYOK_INSUFFICIENT_QUOTA: 'byok_insufficient_quota',
  BYOK_KEY_SUSPENDED: 'byok_key_suspended',
  
  // Provider 相关错误
  PROVIDER_UNREACHABLE: 'provider_unreachable',
  PROVIDER_RATE_LIMITED: 'provider_rate_limited',
  PROVIDER_MODEL_NOT_FOUND: 'provider_model_not_found',
  PROVIDER_CONTENT_FILTERED: 'provider_content_filtered',
  FILE_UPLOAD_FAILED: 'file_upload_failed',
  FILE_TYPE_UNSUPPORTED: 'file_type_unsupported',
  
  // 通用错误
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
  INVALID_REQUEST: 'invalid_request',
  INTERNAL_ERROR: 'internal_error',
};

/**
 * Provider Kind 常量
 */
export const PROVIDER_KINDS = {
  OPENAI_NATIVE: 'openai_native',
  OPENAI_COMPATIBLE: 'openai_compatible',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
  DEEPSEEK: 'deepseek',
  OLLAMA: 'ollama',
};

/**
 * Provider Source 常量
 */
export const PROVIDER_SOURCES = {
  PLATFORM: 'platform',
  BYOK: 'byok',
};

/**
 * 创建标准化的 LLMError 对象
 * 
 * @param {Object} params
 * @param {string} params.code - 错误码
 * @param {string} params.provider - 提供商标识
 * @param {number} [params.httpStatus] - HTTP 状态码
 * @param {string} [params.message] - 错误消息
 * @param {*} [params.raw] - 原始错误数据
 * @param {boolean} [params.isByok] - 是否使用用户自带密钥
 * @returns {LLMError}
 */
export function createLLMError({ code, provider, httpStatus, message, raw, isByok = false }) {
  return {
    code: code || LLM_ERROR_CODES.INTERNAL_ERROR,
    provider: provider || 'unknown',
    httpStatus: httpStatus || 500,
    message: message || getDefaultErrorMessage(code, provider),
    raw: serializeRaw(raw),
    isByok: Boolean(isByok),
  };
}

/**
 * 创建成功的 LLMResponse
 * 
 * @param {Object} params
 * @param {string} params.text - 响应文本
 * @param {LLMUsage} [params.usage] - token 使用量
 * @param {string} params.model - 使用的模型
 * @param {string} params.provider - 提供商标识
 * @param {boolean} [params.isByok] - 是否使用用户自带密钥
 * @param {GroundingMetadata} [params.groundingMetadata] - Grounding 检索来源
 * @param {FunctionCall[]} [params.functionCalls] - 模型请求的函数调用
 * @param {Array<{ mimeType: string, dataBase64: string }>} [params.images] - 模型生成的图片（base64）
 * @returns {LLMResponse}
 */
export function createLLMResponse({ text, usage, model, provider, isByok = false, groundingMetadata, functionCalls, images }) {
  const response = {
    ok: true,
    text: text || '',
    usage: usage || null,
    model: model || null,
    provider: provider || 'unknown',
    isByok: Boolean(isByok),
  };
  
  // Only include groundingMetadata if present (non-invasive)
  if (groundingMetadata && typeof groundingMetadata === 'object') {
    response.groundingMetadata = groundingMetadata;
  }

  // Phase 5: Only include functionCalls if present (non-invasive)
  if (Array.isArray(functionCalls) && functionCalls.length > 0) {
    response.functionCalls = functionCalls;
  }

  // Phase 6: Only include images if present (non-invasive)
  if (Array.isArray(images) && images.length > 0) {
    response.images = images;
  }
  
  return response;
}

/**
 * 创建失败的 LLMResponse
 * 
 * @param {LLMError} error
 * @returns {LLMResponse}
 */
export function createLLMErrorResponse(error) {
  return {
    ok: false,
    error,
    provider: error?.provider || 'unknown',
    isByok: error?.isByok || false,
  };
}

/**
 * 根据错误码获取默认错误消息
 */
function getDefaultErrorMessage(code, provider) {
  const label = getProviderLabel(provider);
  switch (code) {
    case LLM_ERROR_CODES.BYOK_INVALID_KEY:
      return `The provided ${label} API key is invalid or has been revoked.`;
    case LLM_ERROR_CODES.BYOK_INSUFFICIENT_QUOTA:
      return `Your ${label} account has insufficient balance or quota.`;
    case LLM_ERROR_CODES.BYOK_KEY_SUSPENDED:
      return `Your ${label} API key has been suspended.`;
    case LLM_ERROR_CODES.PROVIDER_UNREACHABLE:
      return `Cannot connect to ${label} right now. Please try again or switch models.`;
    case LLM_ERROR_CODES.PROVIDER_RATE_LIMITED:
      return `Requests to ${label} are being rate limited. Please slow down and retry.`;
    case LLM_ERROR_CODES.PROVIDER_MODEL_NOT_FOUND:
      return `The requested model is not available on ${label}.`;
    case LLM_ERROR_CODES.PROVIDER_CONTENT_FILTERED:
      return `${label} declined to generate a response due to content policy.`;
    case LLM_ERROR_CODES.TIMEOUT:
      return `${label} did not respond in time. Please retry or switch providers.`;
    case LLM_ERROR_CODES.CANCELLED:
      return `Request to ${label} was cancelled.`;
    case LLM_ERROR_CODES.INVALID_REQUEST:
      return `Invalid request to ${label}.`;
    default:
      return `Unexpected error from ${label}. Please retry shortly.`;
  }
}

/**
 * 获取提供商显示名称
 */
export function getProviderLabel(id) {
  const normalized = typeof id === 'string' ? id.toLowerCase() : '';
  if (normalized === 'openai' || normalized === 'openai_native') return 'OpenAI';
  if (normalized === 'openai_compatible') return 'OpenAI Compatible';
  if (normalized === 'google' || normalized === 'gemini') return 'Google Gemini';
  if (normalized === 'anthropic' || normalized === 'claude') return 'Anthropic Claude';
  if (normalized === 'ollama') return 'Ollama (Local)';
  if (normalized === 'omytree-default') return 'oMyTree Default';
  if (normalized === 'mock') return 'Mock';
  return id || 'provider';
}

/**
 * 序列化原始错误数据
 */
function serializeRaw(raw) {
  if (raw === null || typeof raw === 'undefined') return null;
  if (typeof raw === 'string') return raw.slice(0, 2000);
  try {
    const serialized = JSON.stringify(raw);
    return serialized.slice(0, 2000);
  } catch (err) {
    return String(raw).slice(0, 2000);
  }
}

/**
 * 验证 LLMRequest 必要字段
 * 
 * @param {LLMRequest} request
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateLLMRequest(request) {
  if (!request) {
    return { valid: false, error: 'Request is required' };
  }
  if (!request.providerKind) {
    return { valid: false, error: 'providerKind is required' };
  }
  // Ollama doesn't require a real API key
  if (!request.apiKey && request.providerKind !== 'ollama') {
    return { valid: false, error: 'apiKey is required' };
  }
  if (!request.model) {
    return { valid: false, error: 'model is required' };
  }
  if (!Array.isArray(request.messages) || request.messages.length === 0) {
    return { valid: false, error: 'messages must be a non-empty array' };
  }
  return { valid: true };
}
