/**
 * Ollama Driver
 * 
 * 对接本地 Ollama 实例，使用 Ollama 的 OpenAI 兼容接口 (/v1/chat/completions)
 * 由于 Ollama 原生提供 OpenAI 兼容的 /v1 端点，我们直接复用 openaiNativeDriver。
 * 
 * Ollama 特性：
 * - 默认运行在 http://localhost:11434
 * - 提供 /v1/chat/completions (OpenAI 兼容)
 * - 提供 /api/tags (模型列表)
 * - 不需要 API Key（传 'ollama' 作为占位符）
 * - 流式输出默认开启，使用标准 SSE 格式
 * - 部分模型支持 vision (如 llava, bakllava)
 */

import { openaiNativeDriver } from './openai_native.js';
import {
  LLM_ERROR_CODES,
  createLLMError,
  createLLMErrorResponse,
} from '../types.js';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';
const OLLAMA_DUMMY_API_KEY = 'ollama'; // Ollama 不需要 key，但 OpenAI 兼容接口要求传入

/**
 * Ollama Driver
 * 
 * 通过 Ollama 的 OpenAI 兼容接口调用本地模型。
 * 利用 openaiNativeDriver 处理实际的 HTTP 请求和流式解析。
 * 
 * @param {import('../types.js').LLMRequest} request
 * @returns {Promise<import('../types.js').LLMResponse> | AsyncGenerator<import('../types.js').LLMChunk>}
 */
export async function ollamaDriver(request) {
  // 确保有 baseUrl，默认指向本地 Ollama
  const baseUrl = request.baseUrl || DEFAULT_OLLAMA_BASE_URL;

  // 归一化 baseUrl：确保指向 /v1 端点
  const normalizedBaseUrl = normalizeOllamaBaseUrl(baseUrl);

  // Ollama 不需要真实 API Key，但 OpenAI 兼容接口格式要求有 Authorization header
  // 使用 'ollama' 作为占位符（Ollama 服务端会忽略这个值）
  const apiKey = request.apiKey || OLLAMA_DUMMY_API_KEY;

  // 构造适配后的请求，传给 openaiNativeDriver
  const adaptedRequest = {
    ...request,
    apiKey,
    baseUrl: normalizedBaseUrl,
    providerKind: 'openai_native', // 让 openaiNativeDriver 正常处理
    // Ollama 本地模型不需要严格的 timeout，给予更宽裕的时间
    timeoutMs: request.timeoutMs || 600000,
  };

  try {
    const result = await openaiNativeDriver(adaptedRequest);
    return result;
  } catch (err) {
    // 将错误包装为更友好的 Ollama 错误信息
    console.error(`[ollama] Driver error:`, err.message);
    const error = createLLMError({
      code: LLM_ERROR_CODES.PROVIDER_UNREACHABLE,
      provider: 'ollama',
      message: `Cannot connect to Ollama at ${normalizedBaseUrl}. Please ensure Ollama is running. (${err.message})`,
      isByok: false,
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
 * 归一化 Ollama base URL
 * 
 * 支持多种用户输入格式:
 * - http://localhost:11434       → http://localhost:11434/v1
 * - http://localhost:11434/      → http://localhost:11434/v1
 * - http://localhost:11434/v1    → http://localhost:11434/v1
 * - http://localhost:11434/v1/   → http://localhost:11434/v1
 * - http://192.168.1.100:11434  → http://192.168.1.100:11434/v1
 */
function normalizeOllamaBaseUrl(url) {
  if (!url || typeof url !== 'string') {
    return DEFAULT_OLLAMA_BASE_URL;
  }

  let base = url.trim().replace(/\/+$/, '');

  // 移除可能误带的端点路径
  base = base.replace(/\/chat\/completions$/i, '');
  base = base.replace(/\/api\/tags$/i, '');
  base = base.replace(/\/api\/chat$/i, '');
  base = base.replace(/\/api\/generate$/i, '');

  // 如果没有 /v1，自动追加
  if (!base.endsWith('/v1')) {
    base = `${base}/v1`;
  }

  return base;
}

/**
 * 从 Ollama 获取已安装的模型列表
 * 使用 Ollama 原生 API: GET /api/tags
 * 
 * @param {string} baseUrl - Ollama 基础 URL (e.g. http://localhost:11434)
 * @returns {Promise<Array<{model_key: string, display_name: string, description: string, size_bytes?: number, parameter_size?: string, quantization?: string}>>}
 */
export async function fetchOllamaModels(baseUrl) {
  // 从 OpenAI 兼容的 /v1 URL 反推原始 Ollama URL
  const ollamaBase = (baseUrl || DEFAULT_OLLAMA_BASE_URL)
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');

  const tagsUrl = `${ollamaBase}/api/tags`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10 秒超时

  try {
    const response = await fetch(tagsUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama responded with HTTP ${response.status}`);
    }

    const data = await response.json();
    const models = [];

    for (const m of (data.models || [])) {
      const name = m.name || m.model || '';
      if (!name) continue;

      const details = m.details || {};
      const sizeGB = m.size ? (m.size / (1024 * 1024 * 1024)).toFixed(1) : null;
      const paramSize = details.parameter_size || '';
      const quant = details.quantization_level || '';

      let description = '';
      if (paramSize) description += paramSize;
      if (quant) description += description ? ` (${quant})` : quant;
      if (sizeGB) description += description ? ` — ${sizeGB} GB` : `${sizeGB} GB`;

      models.push({
        model_key: name,
        display_name: name,
        description: description || 'Local model',
        size_bytes: m.size || 0,
        parameter_size: paramSize,
        quantization: quant,
      });
    }

    // 按参数量大小排序（大的在前）
    models.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));

    return models;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('Connection to Ollama timed out. Is Ollama running?'), {
        code: 'OLLAMA_TIMEOUT',
        status: 504,
      });
    }
    if (err.cause?.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
      throw Object.assign(
        new Error('Cannot connect to Ollama. Please ensure Ollama is running and accessible.'),
        { code: 'OLLAMA_NOT_RUNNING', status: 503 }
      );
    }
    throw Object.assign(
      new Error(`Failed to fetch models from Ollama: ${err.message}`),
      { code: 'OLLAMA_FETCH_FAILED', status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 测试 Ollama 连接
 * 
 * @param {string} baseUrl - Ollama base URL
 * @param {string} model - 要测试的模型名称
 * @returns {Promise<{ok: boolean, response?: string, elapsed_ms: number}>}
 */
export async function testOllamaConnection(baseUrl, model) {
  const ollamaV1Base = normalizeOllamaBaseUrl(baseUrl);
  const endpoint = `${ollamaV1Base}/chat/completions`;

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OLLAMA_DUMMY_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi, respond with just "ok".' }],
        stream: false,
        max_tokens: 10,
      }),
      signal: controller.signal,
    });

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';

    return { ok: true, response: text.trim(), elapsed_ms: elapsed };
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.name === 'AbortError') {
      return { ok: false, response: 'Connection timed out', elapsed_ms: elapsed };
    }
    return { ok: false, response: err.message, elapsed_ms: elapsed };
  } finally {
    clearTimeout(timeout);
  }
}

export default ollamaDriver;
