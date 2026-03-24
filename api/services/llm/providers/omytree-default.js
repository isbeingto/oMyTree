/**
 * OMyTree Default Provider
 * 
 * 官方默认 LLM Provider，背后使用 OpenAI 兼容 API。
 * 
 * 配置来源：ecosystem.config.js (通过 process.env)
 *   - OPENAI_API_KEY: API 密钥
 *   - OPENAI_API_BASE: API 端点 URL
 *   - LLM_MODEL: 默认模型名称
 *   - LLM_REQUEST_TIMEOUT_MS: 请求超时（毫秒）
 * 
 * 不需要任何 .env 文件，所有配置统一从 ecosystem.config.js 读取。
 */

import { LLMProvider } from './base.js';
import { createProviderAdapter } from '../provider_adapter.js';
import { PROVIDER_KINDS } from '../types.js';

// 配置从 process.env 读取（来源：ecosystem.config.js）
const getConfig = () => ({
  apiKey: (process.env.OPENAI_API_KEY || '').trim(),
  endpoint: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1/chat/completions',
  model: process.env.LLM_MODEL || 'gpt-4',
  timeoutMs: parseInt(process.env.LLM_REQUEST_TIMEOUT_MS || '600000', 10),
});

/**
 * JSON 解析错误
 */
export class JsonParseError extends Error {
  constructor(message, { rawText = '' } = {}) {
    super(message);
    this.name = 'JsonParseError';
    this.code = 'LLM_JSON_PARSE_ERROR';
    this.rawText = rawText;
  }
}

/**
 * 从文本中提取 JSON
 */
function extractJson(text) {
  if (!text || typeof text !== 'string') {
    throw new JsonParseError('LLM response is empty', { rawText: text || '' });
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new JsonParseError('LLM response missing JSON block', { rawText: text });
  }

  return text.slice(start, end + 1);
}

/**
 * 解析 JSON 响应
 */
export function parseJsonResponse(text) {
  const snippet = extractJson(text);
  try {
    return JSON.parse(snippet);
  } catch (error) {
    throw new JsonParseError('Failed to parse JSON from LLM response', {
      rawText: text,
    });
  }
}

/**
 * OMyTree Default Provider 实现
 */
class OMyTreeDefaultProvider extends LLMProvider {
  constructor() {
    super({
      id: 'omytree-default',
      name: 'OMyTree Default',
      description: '官方默认 LLM 服务，基于 OpenAI 兼容 API',
    });
  }

  /**
   * 检查 Provider 是否可用
   */
  isAvailable() {
    const config = getConfig();
    return Boolean(config.apiKey);
  }

  /**
   * 调用 Chat 接口
   * 
   * @param {Object} params
   * @param {string} params.prompt - 提示词
   * @param {Object} [params.metadata] - 元数据（可选）
   * @param {Object} [params.options] - 选项
   * @returns {Promise<{ai_text: string, usage_json: Object|null, parsed_json?: Object}>}
   */
  async callChat({ prompt, metadata = {}, options = {} }) {
    const config = getConfig();
    const optionsWithDefaults = { ...options };
    if (optionsWithDefaults.timeout_ms == null && Number.isFinite(config.timeoutMs)) {
      optionsWithDefaults.timeout_ms = config.timeoutMs;
    }

    const adapter = createProviderAdapter({
      providerKind: PROVIDER_KINDS.OPENAI_COMPATIBLE,
      providerId: 'omytree-default',
      apiKey: config.apiKey,
      baseUrl: config.endpoint,
      defaultModel: config.model,
    });

    const result = await adapter.callChat({ prompt, options: optionsWithDefaults });

    // 如果 options.mode 需要 JSON 解析
    if (optionsWithDefaults.mode && ['relevance', 'summarize', 'topic_guard'].includes(optionsWithDefaults.mode)) {
      try {
        result.parsed_json = parseJsonResponse(result.ai_text || '');
      } catch (parseError) {
        // JSON 解析失败时，保留 ai_text，让上层处理
        console.warn(`[OMyTreeDefaultProvider] JSON parse failed for mode=${optionsWithDefaults.mode}`);
      }
    }

    return result;
  }
}

// 单例导出
export const omytreeDefaultProvider = new OMyTreeDefaultProvider();

export default omytreeDefaultProvider;
