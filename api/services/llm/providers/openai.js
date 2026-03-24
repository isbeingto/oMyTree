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

export class OpenAIJsonParseError extends Error {
  constructor(message, { rawText = '' } = {}) {
    super(message);
    this.name = 'OpenAIJsonParseError';
    this.code = 'LLM_JSON_PARSE_ERROR';
    this.rawText = rawText;
  }
}

function extractJsonSnippet(text) {
  if (!text || typeof text !== 'string') {
    throw new OpenAIJsonParseError('LLM response is empty', { rawText: text || '' });
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new OpenAIJsonParseError('LLM response missing JSON block', { rawText: text });
  }

  return text.slice(start, end + 1);
}

export function parseOpenAiJson(text) {
  const snippet = extractJsonSnippet(text);
  try {
    return JSON.parse(snippet);
  } catch (error) {
    throw new OpenAIJsonParseError('Failed to parse JSON from LLM response', {
      rawText: text,
    });
  }
}

/**
 * OpenAI Provider 实现
 * 用于直接调用 OpenAI API（不经过 omytree-default 封装）
 */
class OpenAIProvider extends LLMProvider {
  constructor() {
    super({
      id: 'openai',
      name: 'OpenAI',
      description: '直接调用 OpenAI API',
    });
  }

  isAvailable() {
    return Boolean(getConfig().apiKey);
  }

  async callChat({ prompt, options = {} }) {
    const config = getConfig();
    const optionsWithDefaults = { ...options };
    if (optionsWithDefaults.timeout_ms == null && Number.isFinite(config.timeoutMs)) {
      optionsWithDefaults.timeout_ms = config.timeoutMs;
    }
    const adapter = createProviderAdapter({
      providerKind: PROVIDER_KINDS.OPENAI_NATIVE,
      providerId: 'openai',
      apiKey: config.apiKey,
      baseUrl: config.endpoint,
      defaultModel: config.model,
    });

    return adapter.callChat({ prompt, options: optionsWithDefaults });
  }

  async *callChatStream({ prompt, options = {} }) {
    const config = getConfig();
    const optionsWithDefaults = { ...options };
    if (optionsWithDefaults.timeout_ms == null && Number.isFinite(config.timeoutMs)) {
      optionsWithDefaults.timeout_ms = config.timeoutMs;
    }
    const adapter = createProviderAdapter({
      providerKind: PROVIDER_KINDS.OPENAI_NATIVE,
      providerId: 'openai',
      apiKey: config.apiKey,
      baseUrl: config.endpoint,
      defaultModel: config.model,
    });

    yield* adapter.callChatStream({ prompt, options: optionsWithDefaults });
  }
}

// 单例导出
export const openaiProviderInstance = new OpenAIProvider();

// 向后兼容：保留原有的函数式 API
export async function openaiProvider(params) {
  return openaiProviderInstance.callChat(params);
}

export async function openaiJsonProvider(params) {
  const response = await openaiProviderInstance.callChat(params);
  const parsed_json = parseOpenAiJson(response.ai_text || '');
  return {
    ...response,
    parsed_json,
  };
}
